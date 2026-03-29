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

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS === "*" ? "*" : process.env.CORS_ORIGINS.split(","),
  credentials: true,
}));
app.use(express.json());

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

// Health check
app.get("/api", (req, res) => {
  res.json({ message: "Manufacturing CRM API is running" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
