const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Backup = require("../models/Backup");
const Purchase = require("../models/Purchase");
const PrintingJob = require("../models/PrintingJob");
const Production = require("../models/Production");
const Dispatch = require("../models/Dispatch");
const PurchaseOrder = require("../models/PurchaseOrder");
const Brand = require("../models/Brand");
const Size = require("../models/Size");
const Customer = require("../models/Customer");
const User = require("../models/User");
const { authenticate, adminRequired } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

const router = express.Router();

/**
 * Create a full data backup and store it in the backups collection.
 * Can be called manually or by the monthly cron.
 */
async function createBackup(triggerUser) {
  const [purchases, printingJobs, production, dispatches, purchaseOrders, brands, sizes, customers, users] = await Promise.all([
    Purchase.find({}, { _id: 0, __v: 0 }).lean(),
    PrintingJob.find({}, { _id: 0, __v: 0 }).lean(),
    Production.find({}, { _id: 0, __v: 0 }).lean(),
    Dispatch.find({}, { _id: 0, __v: 0 }).lean(),
    PurchaseOrder.find({}, { _id: 0, __v: 0 }).lean(),
    Brand.find({}, { _id: 0, __v: 0 }).lean(),
    Size.find({}, { _id: 0, __v: 0 }).lean(),
    Customer.find({}, { _id: 0, __v: 0 }).lean(),
    User.find({}, { _id: 0, __v: 0, password: 0 }).lean(),
  ]);

  const collections = { purchases, printingJobs, production, dispatches, purchaseOrders, brands, sizes, customers, users };
  const record_counts = {
    purchases: purchases.length,
    printingJobs: printingJobs.length,
    production: production.length,
    dispatches: dispatches.length,
    purchaseOrders: purchaseOrders.length,
    brands: brands.length,
    sizes: sizes.length,
    customers: customers.length,
    users: users.length,
  };

  const jsonStr = JSON.stringify(collections);
  const size_bytes = Buffer.byteLength(jsonStr, "utf8");

  const backup = await Backup.create({
    id: uuidv4(),
    timestamp: new Date(),
    type: triggerUser ? "manual" : "monthly",
    collections,
    record_counts,
    size_bytes,
  });

  if (triggerUser) {
    logActivity({ action: "BACKUP", entity_type: "backup", entity_id: backup.id, user: triggerUser, details: `Manual backup created (${(size_bytes / 1024).toFixed(1)} KB)` });
  }

  return backup;
}

// GET /api/backups - list all backups (without full data)
router.get("/", authenticate, adminRequired, async (req, res) => {
  try {
    const backups = await Backup.find({}, { _id: 0, __v: 0, collections: 0 })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();
    res.json(backups);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// POST /api/backups - trigger manual backup
router.post("/", authenticate, adminRequired, async (req, res) => {
  try {
    const backup = await createBackup(req.user);
    res.json({
      message: "Backup created successfully",
      id: backup.id,
      timestamp: backup.timestamp,
      record_counts: backup.record_counts,
      size_bytes: backup.size_bytes,
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET /api/backups/:id - download a specific backup
router.get("/:backupId", authenticate, adminRequired, async (req, res) => {
  try {
    const backup = await Backup.findOne({ id: req.params.backupId }, { _id: 0, __v: 0 }).lean();
    if (!backup) return res.status(404).json({ detail: "Backup not found" });
    res.json(backup);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /api/backups/:id
router.delete("/:backupId", authenticate, adminRequired, async (req, res) => {
  try {
    const result = await Backup.deleteOne({ id: req.params.backupId });
    if (result.deletedCount === 0) return res.status(404).json({ detail: "Backup not found" });
    res.json({ message: "Backup deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
module.exports.createBackup = createBackup;
