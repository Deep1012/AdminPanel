/**
 * Per-brand/size availability maps for the two mid-pipeline stages:
 * printing stock and finished goods.
 *
 * These are the aggregates the Printing Stock and Finished Goods screens
 * display, lifted out of routes/dashboard.js so the guards in
 * routes/production.js and routes/dispatch.js reject against exactly the
 * numbers an operator can see rather than against a second opinion.
 *
 * CASCADE ROWS ARE INCLUDED, DELIBERATELY
 * ---------------------------------------
 * Creating 100 of a normal brand also writes 100 each for BOTTOM/TOP/LID (and
 * the LWBF pair) with a non-null `parent_production_id`. Those rows are NOT
 * filtered out here, and must not be:
 *   - they are keyed by their own brand_name, so they never land in the source
 *     brand's bucket — there is no double count to avoid;
 *   - they represent real consumption of BOTTOM/TOP/LID printing stock and
 *     real BOTTOM/TOP/LID finished goods, both of which are dispatchable.
 * Filtering them out would show every cascade brand as having produced nothing
 * while letting its printing stock be drawn down without limit.
 *
 * All functions are pure; inputs are never mutated.
 */

const { toNumber, itemsOf } = require("./dispatchItems");
const { availablePrintingStock, finishedGoodsAvailable } = require("./stock");

/**
 * Bucket key for a (size, brand) pair.
 *
 * Uses a control character rather than "_" as the separator so that a size or
 * brand name containing an underscore cannot collide with a different pair.
 * The key is internal — every consumer reads `size_name`/`brand_name` off the
 * bucket itself — so the separator is not observable in any response.
 *
 * @param {string} [sizeName]
 * @param {string} [brandName]
 * @returns {string}
 */
function stockKey(sizeName, brandName) {
  return `${sizeName || ""}\u001f${brandName || ""}`;
}

const emptyBucket = (sizeName, brandName, extra) => ({
  size_name: sizeName || "",
  brand_name: brandName || "",
  ...extra,
});

/**
 * Printing stock per (size, brand): done, used in production, available.
 *
 * `printing_done` follows the CLAUDE.md formula (Bodies in Job x Sheets from
 * Raw Material) per brand line, preferring the per-brand `sheets_used` and
 * falling back to the job-level `sheets_from_material`, which is what
 * /dashboard/printing-stock-list does.
 *
 * Buckets appear for keys seen in production but not in any job, so a draw
 * against stock that was never printed reports a negative availability instead
 * of silently going missing.
 *
 * @param {Array<object>} [jobs] - PrintingJob docs (need `sizes`, `sheets_from_material`).
 * @param {Array<object>} [productions] - Production docs (need size_name, brand_name, printing_stock_used).
 * @returns {Map<string, {size_name: string, brand_name: string, printing_done: number, used_in_production: number, available: number}>}
 */
function printingAvailability(jobs, productions) {
  const buckets = new Map();

  const bucketFor = (sizeName, brandName) => {
    const key = stockKey(sizeName, brandName);
    if (!buckets.has(key)) {
      buckets.set(key, emptyBucket(sizeName, brandName, {
        printing_done: 0,
        used_in_production: 0,
        available: 0,
      }));
    }
    return buckets.get(key);
  };

  for (const job of jobs || []) {
    const jobSheets = toNumber(job && job.sheets_from_material);
    for (const sizeEntry of (job && job.sizes) || []) {
      const sizeName = (sizeEntry && sizeEntry.size_name) || "Unknown";
      for (const brand of (sizeEntry && sizeEntry.brands) || []) {
        if (!brand) continue;
        const sheets = brand.sheets_used || jobSheets;
        const bucket = bucketFor(sizeName, brand.brand_name);
        bucket.printing_done += toNumber(brand.bodies_count) * toNumber(sheets);
      }
    }
  }

  for (const entry of productions || []) {
    if (!entry) continue;
    const bucket = bucketFor(entry.size_name, entry.brand_name);
    bucket.used_in_production += toNumber(entry.printing_stock_used);
  }

  for (const bucket of buckets.values()) {
    bucket.available = availablePrintingStock(bucket.printing_done, bucket.used_in_production);
  }

  return buckets;
}

/**
 * Finished goods per (size, brand): produced, dispatched, available.
 *
 * Dispatch lines are read through `itemsOf`, so multi-item dispatches count
 * every line and legacy single-item dispatches are counted once.
 *
 * @param {Array<object>} [productions]
 * @param {Array<object>} [dispatches]
 * @returns {Map<string, {size_name: string, brand_name: string, produced: number, dispatched: number, available: number}>}
 */
function finishedGoodsAvailability(productions, dispatches) {
  const buckets = new Map();

  const bucketFor = (sizeName, brandName) => {
    const key = stockKey(sizeName, brandName);
    if (!buckets.has(key)) {
      buckets.set(key, emptyBucket(sizeName, brandName, {
        produced: 0,
        dispatched: 0,
        available: 0,
      }));
    }
    return buckets.get(key);
  };

  for (const entry of productions || []) {
    if (!entry) continue;
    bucketFor(entry.size_name, entry.brand_name).produced += toNumber(entry.quantity_produced);
  }

  for (const dispatch of dispatches || []) {
    for (const item of itemsOf(dispatch)) {
      bucketFor(item.size_name, item.brand_name).dispatched += toNumber(item.quantity);
    }
  }

  for (const bucket of buckets.values()) {
    bucket.available = finishedGoodsAvailable(bucket.produced, bucket.dispatched);
  }

  return buckets;
}

/**
 * `available` for one key, treating an absent bucket as 0.
 *
 * An absent bucket means nothing was produced and nothing printed for that
 * pair, so 0 is the honest answer rather than "unknown".
 *
 * @param {Map<string, {available: number}>} buckets
 * @param {string} [sizeName]
 * @param {string} [brandName]
 * @returns {number}
 */
function availableFor(buckets, sizeName, brandName) {
  const bucket = buckets && buckets.get(stockKey(sizeName, brandName));
  return bucket ? toNumber(bucket.available) : 0;
}

/**
 * Net additional demand per (size, brand) when `oldItems` is replaced by
 * `newItems`, as `[{size_name, brand_name, quantity}]` with only the entries
 * whose quantity increased.
 *
 * A guard has to be expressed against the *increase*, not the absolute
 * quantity: if historical data already shows negative availability for a pair,
 * an edit that leaves the quantity alone (a note, a date, a customer name)
 * must still go through. Checking the absolute quantity would refuse it and
 * leave the row uneditable.
 *
 * @param {Array<object>} [oldItems]
 * @param {Array<object>} [newItems]
 * @returns {Array<{size_name: string, brand_name: string, quantity: number}>}
 */
function netDemand(oldItems, newItems) {
  const buckets = new Map();

  const add = (item, sign) => {
    if (!item) return;
    const key = stockKey(item.size_name, item.brand_name);
    if (!buckets.has(key)) {
      buckets.set(key, emptyBucket(item.size_name, item.brand_name, { quantity: 0 }));
    }
    buckets.get(key).quantity += sign * toNumber(item.quantity);
  };

  for (const item of oldItems || []) add(item, -1);
  for (const item of newItems || []) add(item, 1);

  return Array.from(buckets.values()).filter((bucket) => bucket.quantity > 0);
}

module.exports = {
  stockKey,
  printingAvailability,
  finishedGoodsAvailability,
  availableFor,
  netDemand,
};
