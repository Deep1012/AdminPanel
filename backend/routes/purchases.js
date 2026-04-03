const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Purchase = require("../models/Purchase");
const PrintingJob = require("../models/PrintingJob");
const { authenticate } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

const router = express.Router();

// Generate sequential SR No: RM-001, RM-002, etc.
async function generateSrNo() {
  const last = await Purchase.findOne({}, { sr_no: 1 })
    .sort({ sr_no: -1 })
    .lean();

  let seq = 1;
  if (last && last.sr_no) {
    const match = last.sr_no.match(/RM-(\d+)/);
    if (match) seq = parseInt(match[1], 10) + 1;
  }

  return `RM-${String(seq).padStart(3, "0")}`;
}

router.post("/", authenticate, async (req, res) => {
  try {
    const { gauge, size1, size2, temper, weight, supplier, invoice_number, purchase_date } = req.body;
    const id = uuidv4();
    const now = purchase_date || new Date().toISOString();
    const sr_no = await generateSrNo();

    // Calculate No of Sheets: WEIGHT / (GAUGE * SIZE1 * SIZE2 / 100000 * 0.785)
    const divisor = (gauge * size1 * size2 / 100000) * 0.785;
    const no_of_sheets = divisor > 0 ? Math.floor(weight / divisor) : 0;

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
      sheets_available: no_of_sheets,
      supplier: supplier || null,
      invoice_number: invoice_number || null,
      purchase_date: now,
      created_by: req.user.username,
    });

    logActivity({ action: "CREATE", entity_type: "purchase", entity_id: id, entity_label: sr_no, user: req.user, details: `Added raw material ${sr_no} (${weight}kg)`, ip_address: req.ip });

    res.json(purchase.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const purchases = await Purchase.find({}, { _id: 0, __v: 0 }).sort({ purchase_date: -1 }).lean();
    const result = purchases.map((p) => {
      if (p.sheets_used === undefined) p.sheets_used = 0;
      if (p.sheets_available === undefined) {
        p.sheets_available = (p.no_of_sheets || 0) - (p.sheets_used || 0);
      }
      return p;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/available", authenticate, async (req, res) => {
  try {
    const purchases = await Purchase.find(
      {},
      { id: 1, sr_no: 1, gauge: 1, size1: 1, size2: 1, temper: 1, no_of_sheets: 1, sheets_used: 1, weight: 1, _id: 0 }
    ).sort({ purchase_date: -1 }).lean();

    const available = [];
    for (const p of purchases) {
      const sheets_used = p.sheets_used || 0;
      const sheets_available = (p.no_of_sheets || 0) - sheets_used;
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
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:purchaseId", authenticate, async (req, res) => {
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

      if (gauge !== undefined) updateData.gauge = g;
      if (size1 !== undefined) updateData.size1 = s1;
      if (size2 !== undefined) updateData.size2 = s2;
      if (weight !== undefined) updateData.weight = w;

      const divisor = (g * s1 * s2 / 100000) * 0.785;
      const no_of_sheets = divisor > 0 ? Math.floor(w / divisor) : 0;
      updateData.no_of_sheets = no_of_sheets;
      updateData.sheets_available = no_of_sheets - (existing.sheets_used || 0);
    }

    const result = await Purchase.updateOne({ id: req.params.purchaseId }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Purchase not found" });

    logActivity({ action: "UPDATE", entity_type: "purchase", entity_id: req.params.purchaseId, user: req.user, details: `Updated raw material entry`, ip_address: req.ip });

    res.json({ message: "Purchase updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:purchaseId", authenticate, async (req, res) => {
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

    logActivity({ action: "DELETE", entity_type: "purchase", entity_id: req.params.purchaseId, entity_label: existing?.sr_no, user: req.user, details: `Deleted raw material ${existing?.sr_no || ""}`, ip_address: req.ip });

    res.json({ message: "Purchase deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
