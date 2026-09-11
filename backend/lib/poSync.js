/**
 * PO dispatched-quantity synchronisation.
 *
 * NOT YET WIRED IN. `routes/dispatch.js` still carries its own six
 * near-identical PO increment/decrement sites. A later change rewrites that
 * file's create/update/delete logic and will do the wiring; this module is
 * built and unit-tested ahead of it so the arithmetic and the capacity rule
 * live in one tested place rather than being reinvented six times.
 *
 * Usage shape the caller is expected to follow: net all item quantities into a
 * single `poId -> quantityChange` set, `await assertPoCapacity(deltas)` to
 * validate the whole set before any write, then `await applyPoDeltas(deltas)`.
 * Validating up front is what stops a multi-item dispatch from half-applying.
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
 * counters, so the floor is enforced at write time by `applyPoDeltas` instead.
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
 * Apply the deltas to each PO's `quantity_dispatched`.
 *
 * Uses a pipeline-form update so the sum and the `>= 0` clamp are evaluated
 * server-side in one atomic step; a plain `$inc` can leave the counter
 * negative when a reversal is larger than what was recorded.
 *
 * Call `assertPoCapacity` first — this function does not validate capacity.
 *
 * @param {Map<string, number>|Record<string, number>} deltas
 * @param {{model?: import("mongoose").Model}} [options]
 * @returns {Promise<{applied: string[], missing: string[]}>}
 */
async function applyPoDeltas(deltas, { model = DefaultPurchaseOrder } = {}) {
  const entries = normalizeDeltas(deltas);
  const applied = [];
  const missing = [];

  for (const [poId, delta] of entries) {
    const result = await model.updateOne({ id: poId }, [
      {
        $set: {
          quantity_dispatched: {
            $max: [0, { $add: [{ $ifNull: ["$quantity_dispatched", 0] }, delta] }],
          },
        },
      },
    ]);

    if (result && result.matchedCount === 0) {
      missing.push(poId);
    } else {
      applied.push(poId);
    }
  }

  return { applied, missing };
}

module.exports = { normalizeDeltas, assertPoCapacity, applyPoDeltas, PoSyncError };
