const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Brand = require("../models/Brand");
const { authenticate, adminRequired } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

const router = express.Router();

router.post("/", authenticate, adminRequired, async (req, res) => {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    const brand = await Brand.create({ id, name: req.body.name, created_at: now });

    logActivity({ action: "CREATE", entity_type: "brand", entity_id: id, entity_label: req.body.name, user: req.user, details: `Created brand "${req.body.name}"`, ip_address: req.ip });

    res.json({ id: brand.id, name: brand.name, created_at: brand.created_at });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const brands = await Brand.find({}, { _id: 0, __v: 0 }).lean();
    res.json(brands);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:brandId", authenticate, adminRequired, async (req, res) => {
  try {
    const { name, is_lwbf } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (is_lwbf !== undefined) updateData.is_lwbf = is_lwbf;
    if (Object.keys(updateData).length === 0) return res.status(400).json({ detail: "No fields to update" });
    const result = await Brand.updateOne({ id: req.params.brandId }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Brand not found" });

    logActivity({ action: "UPDATE", entity_type: "brand", entity_id: req.params.brandId, entity_label: name, user: req.user, details: `Updated brand${name ? ` "${name}"` : ""}${is_lwbf !== undefined ? ` (LWBF: ${is_lwbf})` : ""}`, ip_address: req.ip });

    res.json({ message: "Brand updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:brandId", authenticate, adminRequired, async (req, res) => {
  try {
    const existing = await Brand.findOne({ id: req.params.brandId }, { name: 1 }).lean();
    const result = await Brand.deleteOne({ id: req.params.brandId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Brand not found" });
    }

    logActivity({ action: "DELETE", entity_type: "brand", entity_id: req.params.brandId, entity_label: existing?.name, user: req.user, details: `Deleted brand "${existing?.name || ""}"`, ip_address: req.ip });

    res.json({ message: "Brand deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
