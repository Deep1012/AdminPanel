const express = require("express");
const { v4: uuidv4 } = require("uuid");
const PurchaseOrder = require("../models/PurchaseOrder");
const Dispatch = require("../models/Dispatch");
const { authenticate } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");
const { nextSequence } = require("../lib/sequence");
const { unlinkPoFromDispatches } = require("../lib/poSync");

const router = express.Router();

const SERIAL_NO_WIDTH = 3;

/**
 * Serial number shape: PO-YYYYMMDD-NNN, numbered per day.
 * The day is part of the prefix, so nextSequence scopes the maximum to that
 * day for free (see lib/sequence.js).
 */
async function generateSerialNo(dateStr) {
  const d = new Date(dateStr);
  const dateKey = d.toISOString().split("T")[0].replace(/-/g, "");
  const prefix = `PO-${dateKey}-`;

  return nextSequence(PurchaseOrder, "serial_no", prefix, SERIAL_NO_WIDTH);
}

// GET all purchase orders
router.get("/", authenticate, async (req, res, next) => {
  try {
    const orders = await PurchaseOrder.find({}, { _id: 0, __v: 0 })
      .sort({ date: -1 })
      .lean();
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// POST create purchase order
router.post("/", authenticate, async (req, res, next) => {
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

    await logActivity({ action: "CREATE", entity_type: "purchase_order", entity_id: id, entity_label: serial_no, user: req.user, details: `Created PO ${serial_no} for ${company_name} (${brand_name} ${size_name} x${quantity})`, ip_address: req.ip });

    res.json(order.toObject({ versionKey: false }));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ detail: "Duplicate serial number. Please try again." });
    }
    next(error);
  }
});

// PUT update purchase order
router.put("/:poId", authenticate, async (req, res, next) => {
  try {
    const { notes, date, company_name, brand_id, brand_name, size_id, size_name, quantity } = req.body;

    const existingPO = await PurchaseOrder.findOne({ id: req.params.poId }).lean();
    if (!existingPO) {
      return res.status(404).json({ detail: "Purchase order not found" });
    }

    if (existingPO.is_completed) {
      return res.status(400).json({ detail: "Cannot modify a completed purchase order. Reopen it first." });
    }

    const updateData = {
      updated_by: req.user.username,
      updated_at: new Date().toISOString(),
    };
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

    await PurchaseOrder.updateOne({ id: req.params.poId }, { $set: updateData }, { runValidators: true });

    await logActivity({ action: "UPDATE", entity_type: "purchase_order", entity_id: req.params.poId, entity_label: existingPO.serial_no, user: req.user, details: `Updated PO ${existingPO.serial_no}`, ip_address: req.ip });

    const updatedPO = await PurchaseOrder.findOne({ id: req.params.poId }, { _id: 0, __v: 0 }).lean();
    res.json(updatedPO);
  } catch (error) {
    next(error);
  }
});

// PUT mark purchase order as completed / uncompleted
router.put("/:poId/complete", authenticate, async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findOne({ id: req.params.poId }).lean();
    if (!po) return res.status(404).json({ detail: "Purchase order not found" });

    const newStatus = !po.is_completed;
    const updateData = {
      is_completed: newStatus,
      completed_at: newStatus ? new Date().toISOString() : null,
      completed_by: newStatus ? req.user.username : null,
      updated_by: req.user.username,
      updated_at: new Date().toISOString(),
    };

    await PurchaseOrder.updateOne({ id: req.params.poId }, { $set: updateData });

    await logActivity({ action: "UPDATE", entity_type: "purchase_order", entity_id: req.params.poId, entity_label: po.serial_no, user: req.user, details: `${newStatus ? 'Completed' : 'Reopened'} PO ${po.serial_no}`, ip_address: req.ip });

    const updated = await PurchaseOrder.findOne({ id: req.params.poId }, { _id: 0, __v: 0 }).lean();
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE purchase order
router.delete("/:poId", authenticate, async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findOne({ id: req.params.poId }).lean();
    if (!po) return res.status(404).json({ detail: "Purchase order not found" });

    // Unlink every reference to this PO, in BOTH shapes. The previous
    // updateMany matched only the legacy top-level purchase_order_id, so a
    // multi-item dispatch whose second line referenced this PO was never
    // matched at all, and the dispatches it did match kept items[].
    // purchase_order_id pointing at an id that no longer exists.
    const unlinked = await unlinkPoFromDispatches(req.params.poId, { model: Dispatch });

    await PurchaseOrder.deleteOne({ id: req.params.poId });

    await logActivity({ action: "DELETE", entity_type: "purchase_order", entity_id: req.params.poId, entity_label: po.serial_no, user: req.user, details: `Deleted PO ${po.serial_no} (unlinked ${unlinked.legacy} legacy + ${unlinked.nested} multi-item dispatch reference(s))`, ip_address: req.ip });

    res.json({ message: "Purchase order deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
