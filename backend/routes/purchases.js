const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Purchase = require("../models/Purchase");
const PrintingJob = require("../models/PrintingJob");
const { authenticate } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");
const { nextSequence } = require("../lib/sequence");
const { sheetsFromWeight, sheetsAvailable } = require("../lib/stock");
const { withComputedSheets } = require("../lib/purchaseView");

const router = express.Router();

// SR No shape: RM-001, RM-002, ... RM-1000 (see lib/sequence.js).
const SR_NO_PREFIX = "RM-";
const SR_NO_WIDTH = 3;

// Fields feeding the No. of Sheets formula; all must be finite and > 0.
const SHEET_FORMULA_FIELDS = ["gauge", "size1", "size2", "weight"];

/**
 * First offending sheet-formula field, or null when all four are valid.
 * A zero or non-numeric gauge used to silently yield no_of_sheets = 0, which
 * masked data-entry mistakes instead of reporting them.
 */
function findInvalidSheetInput(values) {
  for (const field of SHEET_FORMULA_FIELDS) {
    const value = values[field];
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      return field;
    }
  }
  return null;
}

router.post("/", authenticate, async (req, res, next) => {
  try {
    const { gauge, size1, size2, temper, weight, supplier, invoice_number, purchase_date } = req.body;

    const invalidField = findInvalidSheetInput({ gauge, size1, size2, weight });
    if (invalidField) {
      return res.status(400).json({ detail: `${invalidField} must be a number greater than 0` });
    }

    const id = uuidv4();
    const now = purchase_date || new Date().toISOString();
    const sr_no = await nextSequence(Purchase, "sr_no", SR_NO_PREFIX, SR_NO_WIDTH);

    // No. of Sheets = WEIGHT / (GAUGE * SIZE1 * SIZE2 / 100000 * 0.785)
    const no_of_sheets = sheetsFromWeight({ weight, gauge, size1, size2 });

    const purchase = await Purchase.create({
      id,
      sr_no,
      gauge,
      size1,
      size2,
      temper,
      weight,
      no_of_sheets,
      sheets_used: 0,
      supplier: supplier || null,
      invoice_number: invoice_number || null,
      purchase_date: now,
      created_by: req.user.username,
    });

    await logActivity({ action: "CREATE", entity_type: "purchase", entity_id: id, entity_label: sr_no, user: req.user, details: `Added raw material ${sr_no} (${weight}kg)`, ip_address: req.ip });

    // Shaped through the same read-time computation as the GETs, so the
    // response cannot disagree with the next read of the same lot.
    res.json(withComputedSheets(purchase.toObject({ versionKey: false })));
  } catch (error) {
    next(error);
  }
});

router.get("/", authenticate, async (req, res, next) => {
  try {
    const purchases = await Purchase.find({}, { _id: 0, __v: 0 }).sort({ purchase_date: -1 }).lean();
    // sheets_available is derived here, not read. A lean() query returns
    // fields that are no longer in the schema, so documents written before the
    // field was dropped would otherwise still serve their stale stored value —
    // which is exactly the disagreement with /dashboard/purchase-stock that
    // this replaces. withComputedSheets discards it and recomputes.
    res.json(purchases.map(withComputedSheets));
  } catch (error) {
    next(error);
  }
});

router.get("/available", authenticate, async (req, res, next) => {
  try {
    const purchases = await Purchase.find(
      {},
      { id: 1, sr_no: 1, gauge: 1, size1: 1, size2: 1, temper: 1, no_of_sheets: 1, sheets_used: 1, weight: 1, _id: 0 }
    ).sort({ purchase_date: -1 }).lean();

    const available = [];
    for (const p of purchases) {
      const sheets_used = p.sheets_used || 0;
      const sheets_available = sheetsAvailable(p);
      if (sheets_available > 0) {
        available.push({
          id: p.id,
          sr_no: p.sr_no,
          gauge: p.gauge,
          size1: p.size1,
          size2: p.size2,
          temper: p.temper,
          no_of_sheets: p.no_of_sheets,
          sheets_used,
          sheets_available,
          weight: p.weight,
          display_name: `${p.sr_no} - ${p.size1}x${p.size2} | G:${p.gauge} | ${p.weight}kg (${sheets_available} sheets)`,
        });
      }
    }
    res.json(available);
  } catch (error) {
    next(error);
  }
});

router.put("/:purchaseId", authenticate, async (req, res, next) => {
  try {
    const { sr_no, gauge, size1, size2, temper, weight, supplier, invoice_number, purchase_date } = req.body;
    const updateData = {
      updated_by: req.user.username,
      updated_at: new Date().toISOString(),
    };
    if (sr_no !== undefined) updateData.sr_no = sr_no;
    if (temper !== undefined) updateData.temper = temper;
    if (supplier !== undefined) updateData.supplier = supplier;
    if (invoice_number !== undefined) updateData.invoice_number = invoice_number;
    if (purchase_date !== undefined) updateData.purchase_date = purchase_date;

    // Recalculate sheets if dimensions/weight changed
    if (gauge !== undefined || size1 !== undefined || size2 !== undefined || weight !== undefined) {
      const existing = await Purchase.findOne({ id: req.params.purchaseId }).lean();
      if (!existing) return res.status(404).json({ detail: "Purchase not found" });

      const g = gauge !== undefined ? gauge : existing.gauge;
      const s1 = size1 !== undefined ? size1 : existing.size1;
      const s2 = size2 !== undefined ? size2 : existing.size2;
      const w = weight !== undefined ? weight : existing.weight;

      // Validate the *effective* values, since all four feed the formula.
      const invalidField = findInvalidSheetInput({ gauge: g, size1: s1, size2: s2, weight: w });
      if (invalidField) {
        return res.status(400).json({ detail: `${invalidField} must be a number greater than 0` });
      }

      if (gauge !== undefined) updateData.gauge = g;
      if (size1 !== undefined) updateData.size1 = s1;
      if (size2 !== undefined) updateData.size2 = s2;
      if (weight !== undefined) updateData.weight = w;

      // Only no_of_sheets is stored; availability follows from it at read time.
      updateData.no_of_sheets = sheetsFromWeight({ weight: w, gauge: g, size1: s1, size2: s2 });
    }

    const result = await Purchase.updateOne({ id: req.params.purchaseId }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Purchase not found" });

    await logActivity({ action: "UPDATE", entity_type: "purchase", entity_id: req.params.purchaseId, user: req.user, details: `Updated raw material entry`, ip_address: req.ip });

    res.json({ message: "Purchase updated successfully" });
  } catch (error) {
    next(error);
  }
});

router.delete("/:purchaseId", authenticate, async (req, res, next) => {
  try {
    // Reject if printing jobs are linked to this raw material
    const linkedJobs = await PrintingJob.countDocuments({ raw_material_id: req.params.purchaseId });
    if (linkedJobs > 0) {
      return res.status(400).json({ detail: `Cannot delete: ${linkedJobs} printing job(s) linked to this raw material. Delete them first.` });
    }

    const existing = await Purchase.findOne({ id: req.params.purchaseId }, { sr_no: 1 }).lean();
    const result = await Purchase.deleteOne({ id: req.params.purchaseId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Purchase not found" });
    }

    await logActivity({ action: "DELETE", entity_type: "purchase", entity_id: req.params.purchaseId, entity_label: existing?.sr_no, user: req.user, details: `Deleted raw material ${existing?.sr_no || ""}`, ip_address: req.ip });

    res.json({ message: "Purchase deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
