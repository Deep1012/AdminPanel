const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Brand = require("../models/Brand");
const { authenticate, adminRequired } = require("../middleware/auth");

const router = express.Router();

router.post("/", authenticate, adminRequired, async (req, res) => {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    const brand = await Brand.create({ id, name: req.body.name, created_at: now });
    res.json({ id: brand.id, name: brand.name, created_at: brand.created_at });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const brands = await Brand.find({}, { _id: 0, __v: 0 });
    res.json(brands);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:brandId", authenticate, adminRequired, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ detail: "Name is required" });
    const result = await Brand.updateOne({ id: req.params.brandId }, { $set: { name } });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Brand not found" });
    res.json({ message: "Brand updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:brandId", authenticate, adminRequired, async (req, res) => {
  try {
    const result = await Brand.deleteOne({ id: req.params.brandId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Brand not found" });
    }
    res.json({ message: "Brand deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
