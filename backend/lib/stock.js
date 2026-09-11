/**
 * The four manufacturing-pipeline formulas from CLAUDE.md, as pure,
 * dependency-free functions.
 *
 * Every input is coerced through `toNumber`, so a null, undefined, or
 * non-numeric field contributes 0 instead of poisoning the result with NaN —
 * the collections hold documents written before several of these fields
 * existed, and a NaN reaching a Mongo write or a UI total is worse than a 0.
 */

/**
 * Finite numeric value of `value`, or 0 for null/undefined/NaN/non-numeric.
 * @param {unknown} value
 * @returns {number}
 */
function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * No. of Sheets = Weight / (Gauge x Size1 x Size2 / 100000 x 0.785), floored.
 *
 * DIVIDE-BY-ZERO BEHAVIOUR (preserved from the original route code, made
 * explicit here): when the divisor is not strictly positive — a zero or
 * missing gauge or dimension — this returns 0 rather than Infinity or NaN.
 * Callers that need to distinguish "no sheets" from "bad input" must validate
 * the inputs themselves; `routes/purchases.js` now rejects non-positive
 * gauge/size1/size2/weight with a 400 before calling this.
 *
 * @param {{weight?: number, gauge?: number, size1?: number, size2?: number}} [input]
 * @returns {number} Whole sheets, never negative.
 */
function sheetsFromWeight(input) {
  const source = input || {};
  const weight = toNumber(source.weight);
  const gauge = toNumber(source.gauge);
  const size1 = toNumber(source.size1);
  const size2 = toNumber(source.size2);

  const divisor = ((gauge * size1 * size2) / 100000) * 0.785;
  if (divisor <= 0 || weight <= 0) return 0;

  return Math.floor(weight / divisor);
}

/**
 * Sheets still on a raw-material lot.
 *
 * Intentionally NOT clamped at 0: a negative result means `sheets_used` has
 * drifted above `no_of_sheets`, which is a data problem worth seeing.
 *
 * @param {{no_of_sheets?: number, sheets_used?: number}} [input]
 * @returns {number}
 */
function sheetsAvailable(input) {
  const source = input || {};
  return toNumber(source.no_of_sheets) - toNumber(source.sheets_used);
}

/**
 * Printing Stock = Bodies in Job x Sheets from Raw Material.
 * @param {{total_bodies?: number, sheets_from_material?: number}} [input]
 * @returns {number}
 */
function printingStock(input) {
  const source = input || {};
  return toNumber(source.total_bodies) * toNumber(source.sheets_from_material);
}

/**
 * Available Printing Stock = Printing Done - Used in Production.
 * @param {number} [printingDone]
 * @param {number} [usedInProduction]
 * @returns {number}
 */
function availablePrintingStock(printingDone, usedInProduction) {
  return toNumber(printingDone) - toNumber(usedInProduction);
}

/**
 * Finished Goods Available = Quantity Produced - Quantity Dispatched.
 * @param {number} [produced]
 * @param {number} [dispatched]
 * @returns {number}
 */
function finishedGoodsAvailable(produced, dispatched) {
  return toNumber(produced) - toNumber(dispatched);
}

module.exports = {
  toNumber,
  sheetsFromWeight,
  sheetsAvailable,
  printingStock,
  availablePrintingStock,
  finishedGoodsAvailable,
};
