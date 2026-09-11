/**
 * PO dispatched-quantity synchronisation.
 *
 * `routes/dispatch.js` now routes all six of its former PO increment/decrement
 * sites through this module, so the arithmetic and the capacity rule live in
 * one tested place.
 *
 * Usage shape: net all item quantities into a single `poId -> quantityChange`
 * set, `await assertPoCapacity(deltas)` for a user-facing error before any
 * write, then `await applyPoDeltasGuarded(deltas)`, which re-checks capacity
 * inside each write and rolls back what it applied if any entry fails.
 * Validating up front is what stops a multi-item dispatch from half-applying;
 * the guarded write is what stops a concurrent request from slipping past that
 * validation.
 */

const DefaultPurchaseOrder = require("../models/PurchaseOrder");

/** Error carrying the HTTP status and PO the caller should surface. */
class PoSyncError extends Error {
  constructor(message, { status = 400, poId = null } = {}) {
    super(message);
    this.name = "PoSyncError";
    this.status = status;
    this.poId = poId;
  }
}

const toNumber = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Normalise a Map or plain object of PO deltas into `[poId, delta]` entries,
 * dropping ids that are empty and deltas that are zero or non-numeric.
 *
 * Returns a fresh array; the input is never modified.
 *
 * @param {Map<string, number>|Record<string, number>} [deltas]
 * @returns {Array<[string, number]>}
 */
function normalizeDeltas(deltas) {
  if (!deltas) return [];

  const entries = deltas instanceof Map ? Array.from(deltas.entries()) : Object.entries(deltas);

  return entries
    .map(([poId, delta]) => [poId, toNumber(delta)])
    .filter(([poId, delta]) => typeof poId === "string" && poId.length > 0 && delta !== 0);
}

/**
 * Verify that every PO in `deltas` exists and that positive deltas fit inside
 * the PO's remaining quantity. Resolves silently when the whole set is valid.
 *
 * Negative deltas are deliberately NOT rejected for under-running
 * `quantity_dispatched`: a dispatch reversal must never be blocked by drifted
 * counters, so the floor is enforced at write time by `applyPoDeltasGuarded` instead.
 *
 * @param {Map<string, number>|Record<string, number>} deltas
 * @param {{model?: import("mongoose").Model}} [options] - `model` is injectable for tests.
 * @throws {PoSyncError} 404 for a missing PO, 400 for over-allocation.
 * @returns {Promise<void>}
 */
async function assertPoCapacity(deltas, { model = DefaultPurchaseOrder } = {}) {
  const entries = normalizeDeltas(deltas);

  for (const [poId, delta] of entries) {
    const po = await model.findOne({ id: poId }, { _id: 0, __v: 0 }).lean();
    if (!po) {
      throw new PoSyncError(`Purchase order not found (${poId})`, { status: 404, poId });
    }

    if (delta > 0) {
      const remaining = toNumber(po.quantity) - toNumber(po.quantity_dispatched);
      if (delta > remaining) {
        throw new PoSyncError(
          `Dispatch qty (${delta}) exceeds PO ${po.serial_no} remaining (${remaining})`,
          { status: 400, poId }
        );
      }
    }
  }
}

/**
 * Filter matching a PO only if adding `delta` to `quantity_dispatched` keeps
 * it within `quantity`.
 *
 * This is the over-dispatch rule expressed as part of the write rather than as
 * a separate read: two concurrent dispatches that each see "5 remaining" both
 * pass a read-then-write check, but only one can satisfy this filter.
 *
 * @param {string} poId
 * @param {number} delta - Must be positive.
 * @returns {object} Mongo filter.
 */
function capacityFilter(poId, delta) {
  return {
    id: poId,
    $expr: {
      $lte: [
        { $add: [{ $ifNull: ["$quantity_dispatched", 0] }, toNumber(delta)] },
        { $ifNull: ["$quantity", 0] },
      ],
    },
  };
}

/** Clamped, unconditional add — used for reversals and for rollback. */
async function addClamped(model, poId, delta) {
  const result = await model.updateOne({ id: poId }, [
    {
      $set: {
        quantity_dispatched: {
          $max: [0, { $add: [{ $ifNull: ["$quantity_dispatched", 0] }, toNumber(delta)] }],
        },
      },
    },
  ]);
  return !result || result.matchedCount !== 0;
}

/**
 * Apply net PO deltas with the capacity check inside each write, rolling back
 * everything already applied if any single write cannot be satisfied.
 *
 * Differences from the unguarded version it replaced (removed once no call
 * site used it):
 *   - positive deltas go through `capacityFilter`, so a concurrent dispatch
 *     cannot squeeze past the pre-check and over-allocate the PO;
 *   - a failure part-way through is compensated rather than left half-applied.
 *
 * Deltas are applied reversals-first. Within one call each PO appears at most
 * once (normalizeDeltas guarantees it), so this does not change which claims
 * fit; it makes the write order deterministic rather than dependent on object
 * key order, and keeps the number of outstanding claims to roll back as small
 * as possible when a later claim fails. Negative deltas use a `$max: [0, ...]` clamp: a reversal
 * larger than what was recorded lands at 0 instead of going negative. That is
 * a deliberate change from the raw `$inc` the route used to do — a negative
 * `quantity_dispatched` reads as *extra* capacity and silently authorises
 * over-dispatch, which is worse than losing the size of the drift. The drift
 * itself is still reported by GET /api/admin/reconcile.
 *
 * Call `assertPoCapacity` first for user-facing error messages; this function
 * is the enforcement, not the explanation.
 *
 * @param {Map<string, number>|Record<string, number>} deltas
 * @param {{model?: import("mongoose").Model}} [options]
 * @throws {PoSyncError} 409 when a PO no longer has room, 404 when it is gone.
 * @returns {Promise<{applied: string[], missing: string[]}>}
 */
async function applyPoDeltasGuarded(deltas, { model = DefaultPurchaseOrder } = {}) {
  const entries = normalizeDeltas(deltas);
  const ordered = [...entries].sort((a, b) => a[1] - b[1]);

  const applied = [];
  const missing = [];

  const rollback = async () => {
    for (const [poId, delta] of applied) {
      try {
        await addClamped(model, poId, -delta);
      } catch (error) {
        // Nothing better is available here: the compensation itself failed, so
        // the counter stays high. High blocks further dispatch (visible and
        // conservative); low would silently authorise over-dispatch.
        console.error("[poSync] rollback failed", { poId, delta, error: error.message });
      }
    }
  };

  for (const [poId, delta] of ordered) {
    try {
      if (delta < 0) {
        const matched = await addClamped(model, poId, delta);
        if (matched) applied.push([poId, delta]);
        else missing.push(poId);
        continue;
      }

      const claimed = await model.findOneAndUpdate(
        capacityFilter(poId, delta),
        { $inc: { quantity_dispatched: delta } },
        { new: true }
      ).lean();

      if (!claimed) {
        await rollback();
        const po = await model.findOne({ id: poId }, { _id: 0, __v: 0 }).lean();
        if (!po) {
          throw new PoSyncError(`Purchase order not found (${poId})`, { status: 404, poId });
        }
        const remaining = toNumber(po.quantity) - toNumber(po.quantity_dispatched);
        throw new PoSyncError(
          `Dispatch qty (${delta}) exceeds PO ${po.serial_no} remaining (${remaining})`,
          { status: 409, poId }
        );
      }

      applied.push([poId, delta]);
    } catch (error) {
      // A PoSyncError raised above has already rolled back; anything else is a
      // failed write, and leaving the earlier entries of the set applied would
      // be exactly the half-applied state this function exists to prevent.
      if (!(error instanceof PoSyncError)) {
        await rollback();
      }
      throw error;
    }
  }

  return { applied: applied.map(([poId]) => poId), missing };
}

/**
 * Reverse an already-applied delta set. Used when the write that the deltas
 * were paving the way for fails afterwards.
 *
 * Unconditional (clamped) on purpose: restoring the previous state must not be
 * refused because someone else has since taken the capacity.
 *
 * @param {Map<string, number>|Record<string, number>} deltas - The deltas as applied.
 * @param {{model?: import("mongoose").Model}} [options]
 * @returns {Promise<void>}
 */
async function revertPoDeltas(deltas, { model = DefaultPurchaseOrder } = {}) {
  for (const [poId, delta] of normalizeDeltas(deltas)) {
    try {
      await addClamped(model, poId, -delta);
    } catch (error) {
      console.error("[poSync] revert failed", { poId, delta, error: error.message });
    }
  }
}

/**
 * Null out every reference to a deleted PO across the dispatch collection.
 *
 * Two updates rather than one, because the two shapes must be matched
 * independently:
 *   1. the legacy top-level `purchase_order_id`;
 *   2. `items[].purchase_order_id`, via `arrayFilters` so only the entries
 *      pointing at this PO are touched.
 *
 * The previous single `updateMany` on the top-level field alone missed any
 * multi-item dispatch whose *second* line referenced the PO, and even for the
 * dispatches it did match it left the nested copy pointing at a PO that no
 * longer exists. Combining both into one `$set` would be wrong the other way:
 * it would blank the top-level id of a dispatch matched only through a nested
 * line, discarding a live reference to a different PO.
 *
 * @param {string} poId
 * @param {{model?: import("mongoose").Model}} [options] - `model` is the Dispatch model.
 * @returns {Promise<{legacy: number, nested: number}>} Documents modified by each pass.
 */
async function unlinkPoFromDispatches(poId, { model } = {}) {
  if (!model) throw new Error("unlinkPoFromDispatches: model is required");
  if (typeof poId !== "string" || poId.length === 0) {
    throw new Error("unlinkPoFromDispatches: poId must be a non-empty string");
  }

  const legacy = await model.updateMany(
    { purchase_order_id: poId },
    { $set: { purchase_order_id: null } }
  );

  const nested = await model.updateMany(
    { "items.purchase_order_id": poId },
    { $set: { "items.$[entry].purchase_order_id": null } },
    { arrayFilters: [{ "entry.purchase_order_id": poId }] }
  );

  return {
    legacy: (legacy && legacy.modifiedCount) || 0,
    nested: (nested && nested.modifiedCount) || 0,
  };
}

module.exports = {
  normalizeDeltas,
  assertPoCapacity,
  applyPoDeltasGuarded,
  revertPoDeltas,
  unlinkPoFromDispatches,
  capacityFilter,
  PoSyncError,
};
