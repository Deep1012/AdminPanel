const express = require("express");
const { v4: uuidv4 } = require("uuid");
const PurchaseOrder = require("../models/PurchaseOrder");
const Dispatch = require("../models/Dispatch");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Generate serial number: PO-YYYYMMDD-NNN
async function generateSerialNo(dateStr) {
  const d = new Date(dateStr);
  const dateKey = d.toISOString().split("T")[0].replace(/-/g, "");
  const prefix = `PO-${dateKey}-`;

  const lastPO = await PurchaseOrder.findOne(
    { serial_no: { $regex: `^${prefix}` } },
    { serial_no: 1 }
  ).sort({ serial_no: -1 }).lean();

  let seq = 1;
  if (lastPO) {
    const lastSeq = parseInt(lastPO.serial_no.split("-").pop(), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// GET all purchase orders
router.get("/", authenticate, async (req, res) => {
  try {
    const orders = await PurchaseOrder.find({}, { _id: 0, __v: 0 })
      .sort({ date: -1 })
      .lean();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// POST create purchase order
router.post("/", authenticate, async (req, res) => {
  try {
    const { date, company_name, brand_id, brand_name, size_id, size_name, quantity, notes } = req.body;

    if (!date || !company_name || !brand_id || !brand_name || !size_id || !size_name || !quantity) {
      return res.status(400).json({ detail: "Missing required fields" });
    }

    const id = uuidv4();
    const serial_no = await generateSerialNo(date);
    const now = new Date().toISOString();

    const order = await PurchaseOrder.create({
      id,
      serial_no,
      date,
      company_name,
      brand_id,
      brand_name,
      size_id,
      size_name,
      quantity: parseInt(quantity),
      notes: notes || null,
      quantity_dispatched: 0,
      created_by: req.user.username,
      created_at: now,
    });

    res.json(order.toObject({ versionKey: false }));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ detail: "Duplicate serial number. Please try again." });
    }
    res.status(500).json({ detail: error.message });
  }
});

// PUT update purchase order
router.put("/:poId", authenticate, async (req, res) => {
  try {
    const { notes, date, company_name, brand_id, brand_name, size_id, size_name, quantity } = req.body;

    const existingPO = await PurchaseOrder.findOne({ id: req.params.poId }).lean();
    if (!existingPO) {
      return res.status(404).json({ detail: "Purchase order not found" });
    }

    const updateData = {};
    if (date !== undefined) updateData.date = date;
    if (company_name !== undefined) updateData.company_name = company_name;
    if (brand_id !== undefined) updateData.brand_id = brand_id;
    if (brand_name !== undefined) updateData.brand_name = brand_name;
    if (size_id !== undefined) updateData.size_id = size_id;
    if (size_name !== undefined) updateData.size_name = size_name;
    if (quantity !== undefined) {
      const newQty = parseInt(quantity);
      if (newQty < (existingPO.quantity_dispatched || 0)) {
        return res.status(400).json({ detail: `Cannot reduce quantity below dispatched amount (${existingPO.quantity_dispatched || 0})` });
      }
      updateData.quantity = newQty;
    }
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    await PurchaseOrder.updateOne({ id: req.params.poId }, { $set: updateData }, { runValidators: true });
    const updatedPO = await PurchaseOrder.findOne({ id: req.params.poId }, { _id: 0, __v: 0 }).lean();
    res.json(updatedPO);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// DELETE purchase order
router.delete("/:poId", authenticate, async (req, res) => {
  try {
    const po = await PurchaseOrder.findOne({ id: req.params.poId }).lean();
    if (!po) return res.status(404).json({ detail: "Purchase order not found" });

    // Unlink any dispatches referencing this PO
    await Dispatch.updateMany(
      { purchase_order_id: req.params.poId },
      { $set: { purchase_order_id: null } }
    );

    await PurchaseOrder.deleteOne({ id: req.params.poId });
    res.json({ message: "Purchase order deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
