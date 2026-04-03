const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Production = require("../models/Production");
const Brand = require("../models/Brand");
const { authenticate } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

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
      // Cascade to BOTTOM, TOP, LID for all non-excluded brands
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
          printing_stock_used: printing_stock_used ?? quantity_produced,
          parent_production_id: id,
          notes: `Auto-created from ${brand_name} production`,
          production_date: now,
          created_by: req.user.username,
        }));
        await Production.insertMany(cascadingDocs);
      }

      // Cascade to BOTTOM LWBF, LID LWBF only for LWBF-flagged brands
      const sourceBrand = await Brand.findOne({ id: brand_id }).lean();
      if (sourceBrand && sourceBrand.is_lwbf) {
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
            printing_stock_used: printing_stock_used ?? quantity_produced,
            parent_production_id: id,
            notes: `Auto-created from ${brand_name} production (LWBF)`,
            production_date: now,
            created_by: req.user.username,
          }));
          await Production.insertMany(lwbfDocs);
        }
      }
    }

    logActivity({ action: "CREATE", entity_type: "production", entity_id: id, entity_label: `${brand_name} ${size_name}`, user: req.user, details: `Produced ${quantity_produced} units of ${brand_name} ${size_name}`, ip_address: req.ip });

    res.json(entry.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const entries = await Production.find({}, { _id: 0, __v: 0 }).sort({ production_date: -1 }).lean();
    const result = entries.map((e) => {
      if (e.printing_stock_used === undefined) e.printing_stock_used = 0;
      return e;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:prodId", authenticate, async (req, res) => {
  try {
    const { brand_id, brand_name, size_id, size_name, quantity_produced, printing_stock_used, notes, production_date } = req.body;
    const updateData = {
      updated_by: req.user.username,
      updated_at: new Date().toISOString(),
    };
    if (brand_id !== undefined) updateData.brand_id = brand_id;
    if (brand_name !== undefined) updateData.brand_name = brand_name;
    if (size_id !== undefined) updateData.size_id = size_id;
    if (size_name !== undefined) updateData.size_name = size_name;
    if (quantity_produced !== undefined) updateData.quantity_produced = quantity_produced;
    if (printing_stock_used !== undefined) updateData.printing_stock_used = printing_stock_used;
    if (notes !== undefined) updateData.notes = notes;
    if (production_date !== undefined) updateData.production_date = production_date;

    const result = await Production.updateOne({ id: req.params.prodId }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Production entry not found" });

    // Also update cascaded entries if quantity/size changed
    const cascadeUpdate = {};
    if (quantity_produced !== undefined) {
      cascadeUpdate.quantity_produced = quantity_produced;
      cascadeUpdate.printing_stock_used = printing_stock_used ?? quantity_produced;
    }
    if (size_id !== undefined) cascadeUpdate.size_id = size_id;
    if (size_name !== undefined) cascadeUpdate.size_name = size_name;
    if (production_date !== undefined) cascadeUpdate.production_date = production_date;
    if (Object.keys(cascadeUpdate).length > 0) {
      await Production.updateMany({ parent_production_id: req.params.prodId }, { $set: cascadeUpdate });
    }

    logActivity({ action: "UPDATE", entity_type: "production", entity_id: req.params.prodId, user: req.user, details: `Updated production entry`, ip_address: req.ip });

    res.json({ message: "Production entry updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:prodId", authenticate, async (req, res) => {
  try {
    const entry = await Production.findOne({ id: req.params.prodId }).lean();
    if (!entry) return res.status(404).json({ detail: "Production entry not found" });

    // Delete this entry and all its cascaded children
    const deleteResult = await Production.deleteMany({
      $or: [{ id: req.params.prodId }, { parent_production_id: req.params.prodId }]
    });

    logActivity({ action: "DELETE", entity_type: "production", entity_id: req.params.prodId, entity_label: `${entry.brand_name} ${entry.size_name}`, user: req.user, details: `Deleted ${deleteResult.deletedCount} production entry(s) for ${entry.brand_name} ${entry.size_name}`, ip_address: req.ip });

    res.json({ message: `Deleted ${deleteResult.deletedCount} production entry(s)` });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
