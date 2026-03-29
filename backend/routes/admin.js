const express = require("express");
const Purchase = require("../models/Purchase");
const PrintingJob = require("../models/PrintingJob");
const Production = require("../models/Production");
const Dispatch = require("../models/Dispatch");
const PurchaseOrder = require("../models/PurchaseOrder");
const { authenticate, adminRequired } = require("../middleware/auth");

const router = express.Router();

// POST /api/admin/clear-operational-data
router.post("/clear-operational-data", authenticate, adminRequired, async (req, res) => {
  try {
    const [purchases, printingJobs, production, dispatches, purchaseOrders] = await Promise.all([
      Purchase.deleteMany({}),
      PrintingJob.deleteMany({}),
      Production.deleteMany({}),
      Dispatch.deleteMany({}),
      PurchaseOrder.deleteMany({}),
    ]);

    res.json({
      message: "Operational data cleared successfully",
      deleted: {
        purchases: purchases.deletedCount,
        printingJobs: printingJobs.deletedCount,
        production: production.deletedCount,
        dispatches: dispatches.deletedCount,
        purchaseOrders: purchaseOrders.deletedCount,
      },
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
