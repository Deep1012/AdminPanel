/**
 * Decision logic for creating and editing production entries, kept pure so it
 * can be tested without a database (see ARCHITECTURE.md, "Known gaps": most
 * routes have no HTTP harness, so logic lives here and the routes stay glue).
 */

const { printingAvailability, availableFor, stockKey } = require("./availability");
const { toNumber } = require("./stock");

/**
 * Validate the numeric fields of a production create or edit.
 *
 * Mongoose's `min` validators cannot be relied on here: they run on create()
 * but not on updateOne/$set without runValidators, which is the edit path.
 * The frontend schema already requires quantity >= 1, so this brings the API
 * into line with what the form enforces rather than being stricter than it.
 *
 * @param {Object} body - Request body.
 * @param {{ requireQuantity?: boolean }} [options] - true on create.
 * @returns {string|null} A 400 detail naming the field, or null when valid.
 */
function findInvalidProductionInput(body, { requireQuantity = false } = {}) {
  const { quantity_produced, printing_stock_used } = body || {};

  if (requireQuantity && (quantity_produced === undefined || quantity_produced === null || quantity_produced === "")) {
    return "quantity_produced is required";
  }
  if (quantity_produced !== undefined && quantity_produced !== null) {
    const quantity = Number(quantity_produced);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return "quantity_produced must be a number greater than 0";
    }
  }
  if (printing_stock_used !== undefined && printing_stock_used !== null && printing_stock_used !== "") {
    const used = Number(printing_stock_used);
    if (!Number.isFinite(used) || used < 0) {
      return "printing_stock_used must be a number of 0 or more";
    }
  }
  return null;
}

/**
 * The printing-stock shortage an edit would create, or null.
 *
 * Measured against availability EXCLUDING this entry's own current consumption,
 * so re-saving a row unchanged never reports a shortage against itself. An
 * edit that keeps the same (size, brand) and does not raise printing_stock_used
 * is never a shortage — shrinking consumption can only free stock, matching how
 * the printing-job PUT treats a shrink.
 *
 * Only the entry itself is measured. Its cascade children carry their own
 * brand (BOTTOM/TOP/LID and the LWBF pair), live in their own buckets, and are
 * not availability-checked on create either — see the POST handler.
 *
 * The caller decides what a shortage means via lib/availabilityPolicy.js,
 * which currently reports rather than rejects.
 *
 * @param {Object} params
 * @param {Object} params.existing - The stored production row.
 * @param {Object} params.updates - Fields from the request body.
 * @param {Array} params.jobs - PrintingJob rows ({ sizes, sheets_from_material }).
 * @param {Array} params.productions - Production rows including `id`.
 * @returns {{ detail: string }|null}
 */
function productionEditShortage({ existing, updates, jobs, productions }) {
  const brand = updates.brand_name !== undefined ? updates.brand_name : existing.brand_name;
  const size = updates.size_name !== undefined ? updates.size_name : existing.size_name;
  const used = toNumber(
    updates.printing_stock_used !== undefined ? updates.printing_stock_used : existing.printing_stock_used
  );
  if (used <= 0) return null;

  const sameBucket = stockKey(size, brand) === stockKey(existing.size_name, existing.brand_name);
  if (sameBucket && used <= toNumber(existing.printing_stock_used)) return null;

  const others = (productions || []).filter((p) => p.id !== existing.id);
  const available = availableFor(printingAvailability(jobs || [], others), size, brand);
  if (used <= available) return null;

  return {
    detail: `Printing stock used (${used}) exceeds available printing stock (${available}) for ${brand} ${size}`,
  };
}

/**
 * The $set to propagate to an entry's cascade children after an edit, or null.
 *
 * Children mirror the parent's quantity, printing_stock_used, size and date,
 * as they do on create. The previous handler propagated printing_stock_used
 * only inside the quantity branch, so an edit correcting printing_stock_used
 * alone left every child on the old value and diverged from the parent. When
 * only quantity changes, children fall back to consuming the new quantity,
 * preserving the original behaviour for that case.
 *
 * @param {Object} updates - Fields from the request body.
 * @returns {Object|null}
 */
function cascadeUpdateFor(updates) {
  const { quantity_produced, printing_stock_used, size_id, size_name, production_date } = updates || {};
  const next = {};

  if (quantity_produced !== undefined) next.quantity_produced = quantity_produced;
  if (printing_stock_used !== undefined) {
    next.printing_stock_used = printing_stock_used;
  } else if (quantity_produced !== undefined) {
    next.printing_stock_used = quantity_produced;
  }
  if (size_id !== undefined) next.size_id = size_id;
  if (size_name !== undefined) next.size_name = size_name;
  if (production_date !== undefined) next.production_date = production_date;

  return Object.keys(next).length > 0 ? next : null;
}

module.exports = { findInvalidProductionInput, productionEditShortage, cascadeUpdateFor };
