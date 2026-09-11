require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

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
