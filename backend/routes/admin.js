const express = require("express");
const Purchase = require("../models/Purchase");
const PrintingJob = require("../models/PrintingJob");
const Production = require("../models/Production");
const Dispatch = require("../models/Dispatch");
const PurchaseOrder = require("../models/PurchaseOrder");
const ActivityLog = require("../models/ActivityLog");
const { authenticate, adminRequired } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

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

    logActivity({ action: "CLEAR_DATA", entity_type: "admin", user: req.user, details: `Cleared all operational data: ${purchases.deletedCount} purchases, ${printingJobs.deletedCount} jobs, ${production.deletedCount} production, ${dispatches.deletedCount} dispatches, ${purchaseOrders.deletedCount} POs`, ip_address: req.ip });

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

// GET /api/admin/activity-logs
router.get("/activity-logs", authenticate, adminRequired, async (req, res) => {
  try {
    const { action, entity_type, username, from, to, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (entity_type) filter.entity_type = entity_type;
    if (username) filter.username = { $regex: username, $options: "i" };
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = toDate;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter, { _id: 0, __v: 0 })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET /api/admin/activity-logs/stats
router.get("/activity-logs/stats", authenticate, adminRequired, async (req, res) => {
  try {
    const [totalLogs, actionCounts, todayCount] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.aggregate([
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.countDocuments({
        timestamp: { $gte: new Date(new Date().toISOString().split("T")[0]) },
      }),
    ]);

    res.json({
      total: totalLogs,
      today: todayCount,
      by_action: actionCounts.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
