const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Production = require("../models/Production");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/", authenticate, async (req, res) => {
  try {
    const { brand_id, brand_name, size_id, size_name, quantity_produced, printing_stock_used = 0, printing_job_id, notes } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    const entry = await Production.create({
      id,
      brand_id,
      brand_name,
      size_id,
      size_name,
      quantity_produced,
      printing_stock_used,
      printing_job_id: printing_job_id || null,
      notes: notes || null,
      production_date: now,
      created_by: req.user.username,
    });

    res.json(entry.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const entries = await Production.find({}, { _id: 0, __v: 0 }).sort({ production_date: -1 });
    const result = entries.map((e) => {
      const obj = e.toObject();
      if (obj.printing_stock_used === undefined) obj.printing_stock_used = 0;
      return obj;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:prodId", authenticate, async (req, res) => {
  try {
    const result = await Production.deleteOne({ id: req.params.prodId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Production entry not found" });
    }
    res.json({ message: "Production entry deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
