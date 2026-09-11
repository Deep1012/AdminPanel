/**
 * Enforcement policy for the two *aggregate* availability guards:
 *   - Available Printing Stock (production)
 *   - Finished Goods Available (dispatch)
 *
 * WHY THESE TWO ARE WARN-ONLY
 * ---------------------------
 * CLAUDE.md documents these invariants:
 *   Available Printing Stock = Printing Done - Used in Production
 *   Finished Goods Available = Quantity Produced - Quantity Dispatched
 *
 * The live data contradicts both. Measured 2026-09-11 via
 * GET /api/admin/reconcile against production:
 *
 *   negative_printing_stock_available   144 of 173 (size, brand) buckets (83%)
 *   negative_finished_goods_available    59 buckets
 *   production rows                   1,420
 *   production rows linked to a printing job   0   <- not one
 *   printing jobs in the database        50
 *
 * No production row references a printing job, and 59 brand/size pairs have
 * dispatched more than was ever recorded as produced (e.g. 500ML SANDING
 * SEALER: produced 14,112, dispatched 43,267). The factory records production
 * without the printing behind it and ships stock that predates the system.
 *
 * So these formulas describe an intended model, not this operation. Enforcing
 * them would reject the majority of normal shop-floor entries. They are
 * therefore reported and allowed through, with GET /api/admin/reconcile as the
 * aggregate view.
 *
 * Guards the data DOES support are still enforced as rejections and are not
 * governed by this module: positive-quantity validation, PO remaining capacity
 * (po_quantity_dispatched_drift measured 0), and raw-material sheet
 * availability (negative_sheets_available measured 0).
 *
 * TO ENFORCE LATER: set MODE to "enforce" below. This is deliberately a code
 * change rather than an environment variable, so it cannot differ between
 * environments or be forgotten during a deploy. Re-run
 * GET /api/admin/reconcile first — flipping this while those counts are
 * non-zero will start refusing writes for exactly those buckets.
 */

const MODE = "warn"; // "warn" | "enforce"

/**
 * Apply the policy to a detected shortage.
 *
 * @param {Object|null} shortage - Falsy when there is no shortage.
 * @param {string} shortage.detail - User-facing message.
 * @param {Object} [shortage.context] - Extra fields for the warning log.
 * @returns {{ reject: boolean, detail?: string }}
 */
function applyAvailabilityPolicy(shortage) {
  if (!shortage) return { reject: false };

  if (MODE === "enforce") {
    return { reject: true, detail: shortage.detail };
  }

  console.warn(
    `[availability] ${shortage.detail} — allowed through (policy: warn). ` +
    "See GET /api/admin/reconcile for the aggregate view."
  );
  return { reject: false };
}

module.exports = { applyAvailabilityPolicy, MODE };
