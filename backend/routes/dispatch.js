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

// Normalize old single-item dispatches to have an items array
function normalizeDispatch(doc) {
  const obj = doc.toObject ? doc.toObject({ versionKey: false }) : { ...doc };
  if (!obj.items || obj.items.length === 0) {
    if (obj.brand_id) {
      obj.items = [{
        brand_id: obj.brand_id,
        brand_name: obj.brand_name,
        size_id: obj.size_id,
        size_name: obj.size_name,
        quantity: obj.quantity,
        purchase_order_id: obj.purchase_order_id,
      }];
      obj.total_quantity = obj.quantity;
    } else {
      obj.items = [];
      obj.total_quantity = 0;
    }
  }
  return obj;
}

router.post("/", authenticate, async (req, res) => {
  try {
    const { customer_name, notes, dispatch_date, items: reqItems,
      brand_id, brand_name, size_id, size_name, quantity, purchase_order_id } = req.body;

    // Support both multi-item and legacy single-item payloads
    let items;
    if (reqItems && reqItems.length > 0) {
      items = reqItems;
    } else if (brand_id && size_id && quantity) {
      items = [{ brand_id, brand_name, size_id, size_name, quantity, purchase_order_id: purchase_order_id || null }];
    } else {
      return res.status(400).json({ detail: "Please provide items or brand/size/quantity" });
    }

    // Phase 1: Resolve POs and validate all items before any writes
    const resolvedItems = [];
    for (const item of items) {
      let resolvedPoId = item.purchase_order_id || null;
      if (!resolvedPoId && item.brand_id && item.size_id && customer_name) {
        const matchingPo = await PurchaseOrder.findOne({
          brand_id: item.brand_id,
          size_id: item.size_id,
          company_name: customer_name,
          $expr: { $gt: [{ $subtract: ["$quantity", { $ifNull: ["$quantity_dispatched", 0] }] }, 0] }
        }).sort({ date: 1 }).lean();
        if (matchingPo) resolvedPoId = matchingPo.id;
      }

      if (resolvedPoId) {
        const po = await PurchaseOrder.findOne({ id: resolvedPoId }).lean();
        if (!po) return res.status(404).json({ detail: `Purchase order not found for item ${item.brand_name} ${item.size_name}` });
        const remaining = po.quantity - (po.quantity_dispatched || 0);
        if (item.quantity > remaining) {
          return res.status(400).json({ detail: `Dispatch qty (${item.quantity}) for ${item.brand_name} ${item.size_name} exceeds PO remaining (${remaining})` });
        }
      }

      resolvedItems.push({ ...item, purchase_order_id: resolvedPoId });
    }

    // Phase 2: All validations passed — create dispatch and sync POs
    const id = uuidv4();
    const now = dispatch_date || new Date().toISOString();
    const order_number = await generateOrderNumber();
    const total_quantity = resolvedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);

    const entry = await Dispatch.create({
      id,
      order_number,
      customer_name,
      // Populate legacy fields from first item for backwards compat
      brand_id: resolvedItems[0].brand_id,
      brand_name: resolvedItems[0].brand_name,
      size_id: resolvedItems[0].size_id,
      size_name: resolvedItems[0].size_name,
      quantity: total_quantity,
      purchase_order_id: resolvedItems[0].purchase_order_id,
      items: resolvedItems,
      total_quantity,
      notes: notes || null,
      dispatch_date: now,
      created_by: req.user.username,
    });

    // Sync PO dispatched quantities
    for (const item of resolvedItems) {
      if (item.purchase_order_id) {
        await PurchaseOrder.updateOne(
          { id: item.purchase_order_id },
          { $inc: { quantity_dispatched: item.quantity } }
        );
      }
    }

    res.json(normalizeDispatch(entry));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET single dispatch by ID
router.get("/:dispatchId", authenticate, async (req, res) => {
  try {
    const entry = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    if (!entry) return res.status(404).json({ detail: "Dispatch not found" });
    res.json(normalizeDispatch(entry));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET all dispatches
router.get("/", authenticate, async (req, res) => {
  try {
    const entries = await Dispatch.find({}, { _id: 0, __v: 0 }).sort({ dispatch_date: -1 }).lean();
    res.json(entries.map(normalizeDispatch));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:dispatchId", authenticate, async (req, res) => {
  try {
    const { notes, customer_name, dispatch_date, items: reqItems,
      brand_id, brand_name, size_id, size_name, quantity, purchase_order_id } = req.body;

    const oldDispatch = await Dispatch.findOne({ id: req.params.dispatchId }).lean();
    if (!oldDispatch) return res.status(404).json({ detail: "Dispatch not found" });
    const oldNormalized = normalizeDispatch(oldDispatch);

    // Build new items
    let newItems;
    if (reqItems && reqItems.length > 0) {
      newItems = reqItems;
    } else if (brand_id && size_id && quantity) {
      newItems = [{ brand_id, brand_name, size_id, size_name, quantity, purchase_order_id: purchase_order_id || null }];
    } else {
      newItems = oldNormalized.items;
    }

    // Phase 1: Validate PO capacity using net delta per PO
    const poDelta = {};
    for (const oi of oldNormalized.items) {
      if (oi.purchase_order_id) {
        poDelta[oi.purchase_order_id] = (poDelta[oi.purchase_order_id] || 0) - (oi.quantity || 0);
      }
    }
    for (const item of newItems) {
      if (item.purchase_order_id) {
        poDelta[item.purchase_order_id] = (poDelta[item.purchase_order_id] || 0) + (item.quantity || 0);
      }
    }
    for (const [poId, delta] of Object.entries(poDelta)) {
      if (delta > 0) {
        const po = await PurchaseOrder.findOne({ id: poId }).lean();
        if (!po) return res.status(404).json({ detail: `Purchase order not found` });
        const remaining = po.quantity - (po.quantity_dispatched || 0);
        if (delta > remaining) {
          return res.status(400).json({ detail: `Cannot allocate ${delta} more to PO ${po.serial_no}, only ${remaining} remaining` });
        }
      }
    }

    // Phase 2: Reverse old PO syncs
    for (const oi of oldNormalized.items) {
      if (oi.purchase_order_id) {
        await PurchaseOrder.updateOne(
          { id: oi.purchase_order_id },
          { $inc: { quantity_dispatched: -(oi.quantity || 0) } }
        );
      }
    }

    const total_quantity = newItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const updateData = {
      items: newItems,
      total_quantity,
      brand_id: newItems[0].brand_id,
      brand_name: newItems[0].brand_name,
      size_id: newItems[0].size_id,
      size_name: newItems[0].size_name,
      quantity: total_quantity,
      purchase_order_id: newItems[0].purchase_order_id,
    };
    if (notes !== undefined) updateData.notes = notes;
    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (dispatch_date !== undefined) updateData.dispatch_date = dispatch_date;

    await Dispatch.updateOne({ id: req.params.dispatchId }, { $set: updateData });

    // Phase 3: Apply new PO syncs
    for (const item of newItems) {
      if (item.purchase_order_id) {
        await PurchaseOrder.updateOne(
          { id: item.purchase_order_id },
          { $inc: { quantity_dispatched: item.quantity } }
        );
      }
    }

    const updated = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    res.json(normalizeDispatch(updated));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:dispatchId", authenticate, async (req, res) => {
  try {
    const dispatch = await Dispatch.findOne({ id: req.params.dispatchId }).lean();
    if (!dispatch) return res.status(404).json({ detail: "Dispatch not found" });
    const normalized = normalizeDispatch(dispatch);

    // Reverse PO sync for all items
    for (const item of normalized.items) {
      if (item.purchase_order_id) {
        await PurchaseOrder.updateOne(
          { id: item.purchase_order_id },
          { $inc: { quantity_dispatched: -(item.quantity || 0) } }
        );
      }
    }

    await Dispatch.deleteOne({ id: req.params.dispatchId });
    res.json({ message: "Dispatch deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
