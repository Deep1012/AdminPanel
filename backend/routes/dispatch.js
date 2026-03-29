const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Dispatch = require("../models/Dispatch");
const PurchaseOrder = require("../models/PurchaseOrder");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Auto-generate order number: DSP-001, DSP-002, etc.
async function generateOrderNumber() {
  const last = await Dispatch.findOne({}, { order_number: 1 })
    .sort({ order_number: -1 })
    .lean();
  let seq = 1;
  if (last && last.order_number) {
    const match = last.order_number.match(/DSP-(\d+)/);
    if (match) seq = parseInt(match[1], 10) + 1;
  }
  return `DSP-${String(seq).padStart(3, "0")}`;
}

router.post("/", authenticate, async (req, res) => {
  try {
    const { customer_name, brand_id, brand_name, size_id, size_name, quantity, notes, dispatch_date, purchase_order_id } = req.body;

    // Resolve PO: use explicit link or auto-match by brand+size
    let resolvedPoId = purchase_order_id || null;
    if (!resolvedPoId && brand_id && size_id) {
      const matchingPo = await PurchaseOrder.findOne({
        brand_id,
        size_id,
        $expr: { $gt: [{ $subtract: ["$quantity", { $ifNull: ["$quantity_dispatched", 0] }] }, 0] }
      }).sort({ date: 1 }).lean();
      if (matchingPo) resolvedPoId = matchingPo.id;
    }

    // Validate PO capacity if linked
    if (resolvedPoId) {
      const po = await PurchaseOrder.findOne({ id: resolvedPoId }).lean();
      if (!po) return res.status(404).json({ detail: "Purchase order not found" });
      const remaining = po.quantity - (po.quantity_dispatched || 0);
      if (quantity > remaining) {
        return res.status(400).json({ detail: `Dispatch quantity (${quantity}) exceeds remaining PO quantity (${remaining})` });
      }
    }

    const id = uuidv4();
    const now = dispatch_date || new Date().toISOString();
    const order_number = await generateOrderNumber();

    const entry = await Dispatch.create({
      id,
      order_number,
      customer_name,
      brand_id,
      brand_name,
      size_id,
      size_name,
      quantity,
      purchase_order_id: resolvedPoId,
      notes: notes || null,
      dispatch_date: now,
      created_by: req.user.username,
    });

    // Sync PO dispatched quantity
    if (resolvedPoId) {
      await PurchaseOrder.updateOne(
        { id: resolvedPoId },
        { $inc: { quantity_dispatched: quantity } }
      );
    }

    res.json(entry.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET single dispatch by ID
router.get("/:dispatchId", authenticate, async (req, res) => {
  try {
    const entry = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    if (!entry) return res.status(404).json({ detail: "Dispatch not found" });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET all dispatches
router.get("/", authenticate, async (req, res) => {
  try {
    const entries = await Dispatch.find({}, { _id: 0, __v: 0 }).sort({ dispatch_date: -1 });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:dispatchId", authenticate, async (req, res) => {
  try {
    const { notes, customer_name, brand_id, brand_name, size_id, size_name, quantity, dispatch_date, purchase_order_id } = req.body;

    const oldDispatch = await Dispatch.findOne({ id: req.params.dispatchId }).lean();
    if (!oldDispatch) return res.status(404).json({ detail: "Dispatch not found" });

    const updateData = {};
    if (notes !== undefined) updateData.notes = notes;
    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (brand_id !== undefined) updateData.brand_id = brand_id;
    if (brand_name !== undefined) updateData.brand_name = brand_name;
    if (size_id !== undefined) updateData.size_id = size_id;
    if (size_name !== undefined) updateData.size_name = size_name;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (dispatch_date !== undefined) updateData.dispatch_date = dispatch_date;
    if (purchase_order_id !== undefined) updateData.purchase_order_id = purchase_order_id || null;

    // Validate new PO capacity if changing PO or quantity
    const newPoId = purchase_order_id !== undefined ? purchase_order_id : oldDispatch.purchase_order_id;
    const newQty = quantity !== undefined ? quantity : oldDispatch.quantity;
    if (newPoId) {
      const po = await PurchaseOrder.findOne({ id: newPoId }).lean();
      if (po) {
        const currentDispatched = po.quantity_dispatched || 0;
        // Subtract old dispatch contribution if same PO
        const oldContribution = (oldDispatch.purchase_order_id === newPoId) ? oldDispatch.quantity : 0;
        const remaining = po.quantity - currentDispatched + oldContribution;
        if (newQty > remaining) {
          return res.status(400).json({ detail: `Dispatch quantity (${newQty}) exceeds remaining PO quantity (${remaining})` });
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    // Reverse old PO sync
    if (oldDispatch.purchase_order_id) {
      await PurchaseOrder.updateOne(
        { id: oldDispatch.purchase_order_id },
        { $inc: { quantity_dispatched: -oldDispatch.quantity } }
      );
    }

    await Dispatch.updateOne({ id: req.params.dispatchId }, { $set: updateData }, { runValidators: true });

    // Apply new PO sync
    const updatedPoId = updateData.purchase_order_id !== undefined ? updateData.purchase_order_id : oldDispatch.purchase_order_id;
    const updatedQty = updateData.quantity !== undefined ? updateData.quantity : oldDispatch.quantity;
    if (updatedPoId) {
      await PurchaseOrder.updateOne(
        { id: updatedPoId },
        { $inc: { quantity_dispatched: updatedQty } }
      );
    }

    const updated = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:dispatchId", authenticate, async (req, res) => {
  try {
    const dispatch = await Dispatch.findOne({ id: req.params.dispatchId }).lean();
    if (!dispatch) return res.status(404).json({ detail: "Dispatch not found" });

    // Reverse PO sync before deleting
    if (dispatch.purchase_order_id) {
      await PurchaseOrder.updateOne(
        { id: dispatch.purchase_order_id },
        { $inc: { quantity_dispatched: -dispatch.quantity } }
      );
    }

    await Dispatch.deleteOne({ id: req.params.dispatchId });
    res.json({ message: "Dispatch deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
