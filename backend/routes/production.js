const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Production = require("../models/Production");
const Brand = require("../models/Brand");
const { authenticate } = require("../middleware/auth");

const CASCADING_BRAND_NAMES = ["BOTTOM", "TOP", "LID"];
const LWBF_CASCADING_BRAND_NAMES = ["BOTTOM LWBF", "LID LWBF"];
const ALL_EXCLUDED_BRANDS = [...CASCADING_BRAND_NAMES, ...LWBF_CASCADING_BRAND_NAMES];

const router = express.Router();

router.post("/", authenticate, async (req, res) => {
  try {
    const { brand_id, brand_name, size_id, size_name, quantity_produced, printing_stock_used = 0, printing_job_id, notes, production_date } = req.body;
    const id = uuidv4();
    const now = production_date || new Date().toISOString();

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

    // Cascading BOTTOM/TOP/LID + LWBF logic
    const isExcludedBrand = ALL_EXCLUDED_BRANDS.some(
      name => name.toUpperCase() === brand_name?.toUpperCase()
    );
    if (!isExcludedBrand) {
      // Cascade to BOTTOM, TOP, LID
      const cascadingBrands = await Brand.find(
        { name: { $in: CASCADING_BRAND_NAMES } },
        { _id: 0, __v: 0 }
      ).lean();

      if (cascadingBrands.length > 0) {
        const cascadingDocs = cascadingBrands.map(cb => ({
          id: uuidv4(),
          brand_id: cb.id,
          brand_name: cb.name,
          size_id,
          size_name,
          quantity_produced,
          printing_stock_used: printing_stock_used || quantity_produced,
          notes: `Auto-created from ${brand_name} production`,
          production_date: now,
          created_by: req.user.username,
        }));
        await Production.insertMany(cascadingDocs);
      }

      // Also cascade to BOTTOM LWBF, LID LWBF
      const lwbfBrands = await Brand.find(
        { name: { $in: LWBF_CASCADING_BRAND_NAMES } },
        { _id: 0, __v: 0 }
      ).lean();

      if (lwbfBrands.length > 0) {
        const lwbfDocs = lwbfBrands.map(cb => ({
          id: uuidv4(),
          brand_id: cb.id,
          brand_name: cb.name,
          size_id,
          size_name,
          quantity_produced,
          printing_stock_used: printing_stock_used || quantity_produced,
          notes: `Auto-created from ${brand_name} production (LWBF)`,
          production_date: now,
          created_by: req.user.username,
        }));
        await Production.insertMany(lwbfDocs);
      }
    }

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

router.put("/:prodId", authenticate, async (req, res) => {
  try {
    const { brand_id, brand_name, size_id, size_name, quantity_produced, printing_stock_used, notes, production_date } = req.body;
    const updateData = {};
    if (brand_id !== undefined) updateData.brand_id = brand_id;
    if (brand_name !== undefined) updateData.brand_name = brand_name;
    if (size_id !== undefined) updateData.size_id = size_id;
    if (size_name !== undefined) updateData.size_name = size_name;
    if (quantity_produced !== undefined) updateData.quantity_produced = quantity_produced;
    if (printing_stock_used !== undefined) updateData.printing_stock_used = printing_stock_used;
    if (notes !== undefined) updateData.notes = notes;
    if (production_date !== undefined) updateData.production_date = production_date;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    const result = await Production.updateOne({ id: req.params.prodId }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Production entry not found" });
    res.json({ message: "Production entry updated successfully" });
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
