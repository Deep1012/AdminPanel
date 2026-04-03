const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Size = require("../models/Size");
const { authenticate, adminRequired } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

const router = express.Router();

router.post("/", authenticate, adminRequired, async (req, res) => {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    const size = await Size.create({ id, name: req.body.name, created_at: now });

    logActivity({ action: "CREATE", entity_type: "size", entity_id: id, entity_label: req.body.name, user: req.user, details: `Created size "${req.body.name}"`, ip_address: req.ip });

    res.json({ id: size.id, name: size.name, created_at: size.created_at });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const sizes = await Size.find({}, { _id: 0, __v: 0 }).lean();
    res.json(sizes);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:sizeId", authenticate, adminRequired, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ detail: "Name is required" });
    const result = await Size.updateOne({ id: req.params.sizeId }, { $set: { name } });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Size not found" });

    logActivity({ action: "UPDATE", entity_type: "size", entity_id: req.params.sizeId, entity_label: name, user: req.user, details: `Updated size to "${name}"`, ip_address: req.ip });

    res.json({ message: "Size updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:sizeId", authenticate, adminRequired, async (req, res) => {
  try {
    const existing = await Size.findOne({ id: req.params.sizeId }, { name: 1 }).lean();
    const result = await Size.deleteOne({ id: req.params.sizeId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Size not found" });
    }

    logActivity({ action: "DELETE", entity_type: "size", entity_id: req.params.sizeId, entity_label: existing?.name, user: req.user, details: `Deleted size "${existing?.name || ""}"`, ip_address: req.ip });

    res.json({ message: "Size deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
