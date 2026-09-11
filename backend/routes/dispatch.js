const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Dispatch = require("../models/Dispatch");
const Production = require("../models/Production");
const PurchaseOrder = require("../models/PurchaseOrder");
const { authenticate } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");
const { nextSequence } = require("../lib/sequence");
const {
  assertPoCapacity,
  applyPoDeltasGuarded,
  revertPoDeltas,
  PoSyncError,
} = require("../lib/poSync");
const { itemsOf, sumQuantity, poDeltasFor, netPoDeltas } = require("../lib/dispatchItems");
const {
  itemsFromPayload,
  findInvalidQuantity,
  resolvePoIds,
  findFinishedGoodsShortage,
} = require("../lib/dispatchRequest");
const { applyAvailabilityPolicy } = require("../lib/availabilityPolicy");

const router = express.Router();

// Order number shape: DSP-001, DSP-002, ... DSP-1000 (see lib/sequence.js).
const ORDER_NUMBER_PREFIX = "DSP-";
const ORDER_NUMBER_WIDTH = 3;

// Normalize old single-item dispatches to have an items array
function normalizeDispatch(doc) {
  const obj = doc.toObject ? doc.toObject({ versionKey: false }) : { ...doc };
  const items = itemsOf(obj);
  return { ...obj, items, total_quantity: items.length > 0 ? sumQuantity(items) : 0 };
}

/** Translate a PoSyncError into the project's error shape; rethrow anything else. */
function respondToPoError(res, error) {
  if (error instanceof PoSyncError) {
    return res.status(error.status).json({ detail: error.message });
  }
  throw error;
}

router.post("/", authenticate, async (req, res, next) => {
  try {
    const { customer_name, notes, dispatch_date } = req.body;

    const items = itemsFromPayload(req.body);
    if (!items) {
      return res.status(400).json({ detail: "Please provide items or brand/size/quantity" });
    }

    const invalidItem = findInvalidQuantity(items);
    if (invalidItem) {
      return res.status(400).json({
        detail: `Quantity must be greater than 0 for ${invalidItem.brand_name || "item"} ${invalidItem.size_name || ""}`.trim(),
      });
    }

    // Phase 1: resolve POs and validate the whole request before any write.
    const resolvedItems = await resolvePoIds(items, customer_name, { model: PurchaseOrder });

    // Deltas are AGGREGATED per PO. Validating each line on its own against
    // the PO as it stood before the request is what let two 8-unit lines both
    // pass against a PO with 10 remaining and then both increment it to 16.
    const poDelta = poDeltasFor(resolvedItems, 1);
    try {
      await assertPoCapacity(poDelta);
    } catch (error) {
      return respondToPoError(res, error);
    }

    const shortage = await findFinishedGoodsShortage([], resolvedItems, {
      productionModel: Production,
      dispatchModel: Dispatch,
    });
    if (shortage) {
      // Reported, not rejected — see lib/availabilityPolicy.js for why.
      const decision = applyAvailabilityPolicy({
        detail: `Dispatch qty (${shortage.quantity}) for ${shortage.brand_name} ${shortage.size_name} exceeds finished goods available (${shortage.available})`,
      });
      if (decision.reject) {
        return res.status(400).json({ detail: decision.detail });
      }
    }

    // Phase 2: PO counters move BEFORE the dispatch row exists, on purpose.
    // Without transactions one ordering has to be wrong on failure. This one
    // fails into a PO that looks *more* dispatched than it is: visible on the
    // Purchase Orders page and conservative, because it refuses further
    // dispatch. The other order fails into a PO that looks like it still has
    // room, which is invisible and authorises a real over-dispatch.
    // applyPoDeltasGuarded re-checks capacity inside each write, so a
    // concurrent dispatch cannot slip past the assertPoCapacity above.
    try {
      await applyPoDeltasGuarded(poDelta);
    } catch (error) {
      return respondToPoError(res, error);
    }

    const id = uuidv4();
    const now = dispatch_date || new Date().toISOString();
    const total_quantity = sumQuantity(resolvedItems);

    let entry;
    try {
      const order_number = await nextSequence(Dispatch, "order_number", ORDER_NUMBER_PREFIX, ORDER_NUMBER_WIDTH);

      entry = await Dispatch.create({
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
    } catch (error) {
      // Best-effort compensation for the counters claimed above. If it also
      // fails we stay on the conservative side (counters too high).
      await revertPoDeltas(poDelta);
      throw error;
    }

    await logActivity({ action: "CREATE", entity_type: "dispatch", entity_id: id, entity_label: entry.order_number, user: req.user, details: `Dispatched ${total_quantity} units to ${customer_name}`, ip_address: req.ip });

    res.json(normalizeDispatch(entry));
  } catch (error) {
    next(error);
  }
});

// GET single dispatch by ID
router.get("/:dispatchId", authenticate, async (req, res, next) => {
  try {
    const entry = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    if (!entry) return res.status(404).json({ detail: "Dispatch not found" });
    res.json(normalizeDispatch(entry));
  } catch (error) {
    next(error);
  }
});

// GET all dispatches
router.get("/", authenticate, async (req, res, next) => {
  try {
    const entries = await Dispatch.find({}, { _id: 0, __v: 0 }).sort({ dispatch_date: -1 }).lean();
    res.json(entries.map(normalizeDispatch));
  } catch (error) {
    next(error);
  }
});

router.put("/:dispatchId", authenticate, async (req, res, next) => {
  try {
    const { notes, customer_name, dispatch_date } = req.body;

    const oldDispatch = await Dispatch.findOne({ id: req.params.dispatchId }).lean();
    if (!oldDispatch) return res.status(404).json({ detail: "Dispatch not found" });
    const oldItems = itemsOf(oldDispatch);

    const newItems = itemsFromPayload(req.body) || oldItems;
    const invalidItem = findInvalidQuantity(newItems);
    if (invalidItem) {
      return res.status(400).json({
        detail: `Quantity must be greater than 0 for ${invalidItem.brand_name || "item"} ${invalidItem.size_name || ""}`.trim(),
      });
    }
    if (newItems.length === 0) {
      return res.status(400).json({ detail: "A dispatch must have at least one item" });
    }

    // Phase 1: validate the net change per PO, then the net change in finished
    // goods demand. Netting is what makes an unchanged line a no-op instead of
    // a reversal followed by a re-allocation.
    const poDelta = netPoDeltas(oldItems, newItems);
    try {
      await assertPoCapacity(poDelta);
    } catch (error) {
      return respondToPoError(res, error);
    }

    const shortage = await findFinishedGoodsShortage(oldItems, newItems, {
      productionModel: Production,
      dispatchModel: Dispatch,
    });
    if (shortage) {
      // Reported, not rejected — see lib/availabilityPolicy.js for why.
      const decision = applyAvailabilityPolicy({
        detail: `Additional qty (${shortage.quantity}) for ${shortage.brand_name} ${shortage.size_name} exceeds finished goods available (${shortage.available})`,
      });
      if (decision.reject) {
        return res.status(400).json({ detail: decision.detail });
      }
    }

    // Phase 2: ONE net apply. This handler used to reverse every old PO sync,
    // update the dispatch, then re-apply the new syncs. A failure after the
    // reverse and before the re-apply left the PO counters silently *lower*
    // than the truth — the worst outcome available here, because a too-small
    // dispatched figure looks perfectly plausible and quietly authorises an
    // over-dispatch. A single net apply has no such window.
    try {
      await applyPoDeltasGuarded(poDelta);
    } catch (error) {
      return respondToPoError(res, error);
    }

    const total_quantity = sumQuantity(newItems);
    const updateData = {
      items: newItems,
      total_quantity,
      brand_id: newItems[0].brand_id,
      brand_name: newItems[0].brand_name,
      size_id: newItems[0].size_id,
      size_name: newItems[0].size_name,
      quantity: total_quantity,
      purchase_order_id: newItems[0].purchase_order_id || null,
      updated_by: req.user.username,
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) updateData.notes = notes;
    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (dispatch_date !== undefined) updateData.dispatch_date = dispatch_date;

    try {
      const result = await Dispatch.updateOne({ id: req.params.dispatchId }, { $set: updateData });
      if (result.matchedCount === 0) {
        // Deleted under us. Undo this request's net delta so the counters go
        // back to what they were a moment ago; if the concurrent DELETE also
        // released the old quantities they can end up low, which
        // GET /api/admin/reconcile reports.
        await revertPoDeltas(poDelta);
        return res.status(404).json({ detail: "Dispatch not found" });
      }
    } catch (error) {
      await revertPoDeltas(poDelta);
      throw error;
    }

    await logActivity({ action: "UPDATE", entity_type: "dispatch", entity_id: req.params.dispatchId, entity_label: oldDispatch.order_number, user: req.user, details: `Updated dispatch ${oldDispatch.order_number}`, ip_address: req.ip });

    const updated = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    res.json(normalizeDispatch(updated));
  } catch (error) {
    next(error);
  }
});

router.delete("/:dispatchId", authenticate, async (req, res, next) => {
  try {
    const dispatch = await Dispatch.findOne({ id: req.params.dispatchId }).lean();
    if (!dispatch) return res.status(404).json({ detail: "Dispatch not found" });

    const items = itemsOf(dispatch);

    // Deletion reverses the safe ordering used on create, for the same reason:
    // the row goes first, so a failure before the counters are released leaves
    // the POs looking more dispatched than they are (visible, blocks further
    // dispatch) rather than less (invisible, authorises over-dispatch).
    const deleted = await Dispatch.deleteOne({ id: req.params.dispatchId });
    if (deleted.deletedCount === 0) {
      return res.status(404).json({ detail: "Dispatch not found" });
    }

    // Negative deltas only: clamped at 0 server-side, and never refused.
    await applyPoDeltasGuarded(poDeltasFor(items, -1));

    await logActivity({ action: "DELETE", entity_type: "dispatch", entity_id: req.params.dispatchId, entity_label: dispatch.order_number, user: req.user, details: `Deleted dispatch ${dispatch.order_number}`, ip_address: req.ip });

    res.json({ message: "Dispatch deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
