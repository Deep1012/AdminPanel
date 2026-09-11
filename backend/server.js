require("dotenv").config();

// Fail fast on missing configuration. A silently-absent JWT_SECRET makes
// jwt.sign throw at request time; an absent MONGO_URL fails every query; an
// absent CRON_SECRET makes the backup cron endpoint refuse to run. Better to
// refuse to boot than to serve a half-configured API.
// Fail fast only on variables without which nothing works at all. CRON_SECRET
// is deliberately NOT in this list: the monthly-backup endpoint already fails
// closed on its own when the secret is absent (see routes/backup.js), so
// requiring it here would turn "the backup doesn't run" into "the whole API is
// down" — a strictly worse outcome for a factory that depends on this API.
const REQUIRED_ENV_VARS = ["MONGO_URL", "JWT_SECRET"];
const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missingEnvVars.join(", ")}. ` +
    "Set them in the environment (or backend/.env for local development) before starting the server."
  );
}

if (!process.env.CRON_SECRET) {
  console.warn(
    "[startup] CRON_SECRET is not set. /api/backups/cron will refuse to run " +
    "(HTTP 500) until it is configured, so scheduled backups will not happen."
  );
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const { createErrorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const brandRoutes = require("./routes/brands");
const sizeRoutes = require("./routes/sizes");
const purchaseRoutes = require("./routes/purchases");
const printingJobRoutes = require("./routes/printingJobs");
const productionRoutes = require("./routes/production");
const dispatchRoutes = require("./routes/dispatch");
const dashboardRoutes = require("./routes/dashboard");
const purchaseOrderRoutes = require("./routes/purchaseOrders");
const customerRoutes = require("./routes/customers");
const adminRoutes = require("./routes/admin");
const menuItemRoutes = require("./routes/menuItems");
const backupRoutes = require("./routes/backup");

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
//
// WHO OWNS WHICH HEADER
// ---------------------
// Three layers write response headers and they must not overlap. They do not:
//
//   helmet      X-Content-Type-Options, X-Frame-Options, Strict-Transport-
//               Security, Referrer-Policy, Content-Security-Policy,
//               Cross-Origin-*, and it removes X-Powered-By. It writes NO
//               Access-Control-* header at all.
//   cors        Access-Control-* — but only for local development. Against
//               the CORS_ORIGINS allowlist; an origin not on the list gets
//               callback(null, false), i.e. no Access-Control-Allow-Origin
//               rather than an error.
//   vercel.json Access-Control-* in production, statically, for the single
//               Netlify origin, plus the 204 OPTIONS preflight.
//
// So helmet cannot fight either CORS layer: disjoint header sets. It is
// mounted FIRST so its headers are also present on responses that never reach
// a route — the cors preflight short-circuit, the "Database connection failed"
// 500 below, and the 413 express.json raises on an oversized body.
//
// The one production subtlety, unchanged by this: CORS_ORIGINS must NOT list
// the Netlify origin on Vercel, or the browser would receive two
// Access-Control-Allow-Origin headers (one from vercel.json, one from cors)
// and reject the response. It currently defaults to localhost, so express cors
// declines the Netlify origin and vercel.json is the only writer in production.
app.use(helmet({
  // This API serves JSON to a browser app on a different origin. Helmet's
  // default Cross-Origin-Resource-Policy of "same-origin" is aimed at
  // embeddable subresources, which a JSON API has none of, and it is the one
  // helmet default known to interfere with cross-origin consumption. Turned
  // off deliberately rather than left to chance.
  crossOriginResourcePolicy: false,
  // Kept on. Every successful response is JSON, where a CSP is inert, but
  // Express's own fallback error page and the 404 handler emit HTML, and a
  // reflected path lands in that HTML. Costs nothing, closes that.
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { "frame-ancestors": ["'none'"] },
  },
}));

// CORS handled via vercel.json headers on Vercel; Express cors for local dev
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",");
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Ensure DB connection before handling requests (for serverless)
app.use(async (req, res, next) => {
  if (req.method === "OPTIONS" || req.path === "/api/health") {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ detail: "Database connection failed" });
  }
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/sizes", sizeRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/printing-jobs", printingJobRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/menu-items", menuItemRoutes);
app.use("/api/backups", backupRoutes);

// Health check
app.get("/api", (req, res) => {
  res.json({ message: "Manufacturing CRM API is running" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Terminal error handler. MUST stay last: Express dispatches to the first
// four-argument middleware registered AFTER whatever threw, so mounting this
// above the routers would leave every route unhandled.
//
// Route handlers pass failures here with next(error) instead of the old
// res.status(500).json({ detail: error.message }), which leaked Mongoose and
// driver internals to the browser and logged nothing. Deliberate 4xx messages
// are still decided inline in the handlers and never reach this point.
//
// No external error tracker is wired up (none is configured for this project).
// createErrorHandler takes a `reporter` for that, so Sentry or similar can be
// added here later without touching a single route — see
// middleware/errorHandler.js.
app.use(createErrorHandler());

// Cron jobs and server start only when NOT running on Vercel (serverless)
if (!process.env.VERCEL) {
  const cron = require("node-cron");
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://timestin-crm-backend.onrender.com";

  // Keep-alive: self-ping every 14 minutes to prevent Render free tier spin-down
  cron.schedule("*/14 * * * *", () => {
    fetch(`${RENDER_URL}/api/health`).catch(() => {});
  });

  // Monthly data backup - runs at midnight on the 1st of every month
  const { createBackup } = require("./routes/backup");
  cron.schedule("0 0 1 * *", async () => {
    try {
      const backup = await createBackup(null);
      console.log(`[CRON] Monthly backup created: ${backup.id} (${(backup.size_bytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error("[CRON] Monthly backup failed:", err.message);
    }
  });

  // Start server
  connectDB().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on 0.0.0.0:${PORT}`);
    });
  }).catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
}

// Export for Vercel serverless
module.exports = app;
