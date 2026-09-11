const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Production = require("../models/Production");
const PrintingJob = require("../models/PrintingJob");
const Brand = require("../models/Brand");
const { authenticate } = require("../middleware/auth");
const { applyAvailabilityPolicy } = require("../lib/availabilityPolicy");
const { logActivity } = require("../lib/activityLogger");
const { printingAvailability, availableFor } = require("../lib/availability");
const { toNumber } = require("../lib/stock");
const { buildProductionListQuery, fetchProductionList } = require("../lib/productionList");
const { findInvalidProductionInput, productionEditShortage, cascadeUpdateFor } = require("../lib/productionEdit");

const CASCADING_BRAND_NAMES = ["BOTTOM", "TOP", "LID"];
const LWBF_CASCADING_BRAND_NAMES = ["BOTTOM LWBF", "LID LWBF"];
const ALL_EXCLUDED_BRANDS = [...CASCADING_BRAND_NAMES, ...LWBF_CASCADING_BRAND_NAMES];

const router = express.Router();

router.post("/", authenticate, async (req, res, next) => {
  try {
    const { brand_id, brand_name, size_id, size_name, quantity_produced, printing_stock_used = 0, printing_job_id, notes, production_date } = req.body;
    const invalid = findInvalidProductionInput(req.body, { requireQuantity: true });
    if (invalid) return res.status(400).json({ detail: invalid });
    const id = uuidv4();
    const now = production_date || new Date().toISOString();

    // ---- Available Printing Stock guard -----------------------------------
    // Available Printing Stock = Printing Done - Used in Production, per
    // (size, brand). Until now this route checked nothing, so an entry could
    // declare 1000 printing stock used against a brand/size that had none
    // printed, and then cascade that number to BOTTOM/TOP/LID as well.
    //
    // SCOPE, DELIBERATE: only the requested brand/size is checked. The cascade
    // children write against their own brand keys (BOTTOM/TOP/LID and the LWBF
    // pair) and are NOT availability-checked here — requiring printed stock for
    // all four brands before any production could be recorded would reject the
    // normal shop-floor flow, which is a bigger change than this phase should
    // make. Their consumption is still reported by GET /api/admin/reconcile.
    //
    // CASCADE ROWS ARE COUNTED IN THE AGGREGATE, DELIBERATE: the
    // used_in_production side includes rows with a non-null
    // parent_production_id. They never land in the source brand's bucket (they
    // carry their own brand_name), so there is nothing to double-count;
    // excluding them would understate consumption of the cascade brands' own
    // buckets and let those be drawn down without limit. See lib/availability.js.
    //
    // TWO LIMITS, BOTH KNOWN:
    //  - It guards the DECLARED consumption. An entry sending
    //    printing_stock_used = 0 (the Excel import path does when the column is
    //    blank) consumes nothing by its own account and is not blocked, even
    //    though it still records finished goods.
    //  - It is a read-then-write check, not an atomic one. Unlike sheets and
    //    quantity_dispatched, available printing stock is an aggregate over two
    //    collections with no counter document to guard, so two simultaneous
    //    entries can both pass. Making it atomic needs a stored per-(size,
    //    brand) counter, which is a schema change for a later phase.
    const stockUsed = toNumber(printing_stock_used);
    if (stockUsed > 0) {
      const [jobs, productions] = await Promise.all([
        PrintingJob.find({}, { sizes: 1, sheets_from_material: 1, _id: 0 }).lean(),
        Production.find({}, { size_name: 1, brand_name: 1, printing_stock_used: 1, _id: 0 }).lean(),
      ]);

      const available = availableFor(printingAvailability(jobs, productions), size_name, brand_name);
      if (stockUsed > available) {
        // Reported, not rejected — see lib/availabilityPolicy.js for why.
        const decision = applyAvailabilityPolicy({
          detail: `Printing stock used (${stockUsed}) exceeds available printing stock (${available}) for ${brand_name} ${size_name}`,
        });
        if (decision.reject) {
          return res.status(400).json({ detail: decision.detail });
        }
      }
    }

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

    await logActivity({ action: "CREATE", entity_type: "production", entity_id: id, entity_label: `${brand_name} ${size_name}`, user: req.user, details: `Produced ${quantity_produced} units of ${brand_name} ${size_name}`, ip_address: req.ip });

    res.json(entry.toObject({ versionKey: false }));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/production
 *
 * Two response shapes, chosen by the caller:
 *  - no `page` and no `limit`  -> a bare array, exactly as before. Every other
 *    reader (Finished Goods, the dashboard) depends on that and on the cascade
 *    rows being present in it.
 *  - `page` or `limit` present -> { data, total, page, limit, total_pages },
 *    with cascade brands excluded by default so `total` matches what the
 *    Production page renders.
 *
 * Filters: brand_name, size_name, search, date_from, date_to, exclude_cascade.
 * Ordering: sort (allowlisted) + order (asc|desc). See lib/productionList.js.
 */
router.get("/", authenticate, async (req, res, next) => {
  try {
    const plan = buildProductionListQuery(req.query);
    if (plan.error) {
      return res.status(400).json({ detail: plan.error });
    }

    res.json(await fetchProductionList(Production, plan));
  } catch (error) {
    next(error);
  }
});

// Editing re-checks Available Printing Stock the same way create does, net of
// the entry's own current consumption (lib/productionEdit.js), and applies the
// same policy — currently report-not-reject, see lib/availabilityPolicy.js.
// Like the create check it is read-then-write rather than atomic: available
// printing stock aggregates two collections and has no counter to guard.
router.put("/:prodId", authenticate, async (req, res, next) => {
  try {
    const { brand_id, brand_name, size_id, size_name, quantity_produced, printing_stock_used, notes, production_date } = req.body;

    const invalid = findInvalidProductionInput(req.body);
    if (invalid) return res.status(400).json({ detail: invalid });

    const existing = await Production.findOne(
      { id: req.params.prodId },
      { _id: 0, id: 1, size_name: 1, brand_name: 1, printing_stock_used: 1 }
    ).lean();
    if (!existing) return res.status(404).json({ detail: "Production entry not found" });

    const touchesStock = printing_stock_used !== undefined || brand_name !== undefined || size_name !== undefined;
    if (touchesStock) {
      const [jobs, productions] = await Promise.all([
        PrintingJob.find({}, { sizes: 1, sheets_from_material: 1, _id: 0 }).lean(),
        Production.find({}, { id: 1, size_name: 1, brand_name: 1, printing_stock_used: 1, _id: 0 }).lean(),
      ]);
      const shortage = productionEditShortage({ existing, updates: req.body, jobs, productions });
      if (shortage) {
        const decision = applyAvailabilityPolicy(shortage);
        if (decision.reject) return res.status(400).json({ detail: decision.detail });
      }
    }

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

    const cascadeUpdate = cascadeUpdateFor(req.body);
    if (cascadeUpdate) {
      await Production.updateMany({ parent_production_id: req.params.prodId }, { $set: cascadeUpdate });
    }

    await logActivity({ action: "UPDATE", entity_type: "production", entity_id: req.params.prodId, user: req.user, details: `Updated production entry`, ip_address: req.ip });

    res.json({ message: "Production entry updated successfully" });
  } catch (error) {
    next(error);
  }
});

router.delete("/:prodId", authenticate, async (req, res, next) => {
  try {
    const entry = await Production.findOne({ id: req.params.prodId }).lean();
    if (!entry) return res.status(404).json({ detail: "Production entry not found" });

    // Delete this entry and all its cascaded children
    const deleteResult = await Production.deleteMany({
      $or: [{ id: req.params.prodId }, { parent_production_id: req.params.prodId }]
    });

    await logActivity({ action: "DELETE", entity_type: "production", entity_id: req.params.prodId, entity_label: `${entry.brand_name} ${entry.size_name}`, user: req.user, details: `Deleted ${deleteResult.deletedCount} production entry(s) for ${entry.brand_name} ${entry.size_name}`, ip_address: req.ip });

    res.json({ message: `Deleted ${deleteResult.deletedCount} production entry(s)` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
