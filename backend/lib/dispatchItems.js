/**
 * Dispatch line-item normalisation and PO delta arithmetic.
 *
 * `Dispatch` carries two shapes (see ARCHITECTURE.md): the current `items[]`
 * array and the legacy top-level `brand_id/quantity/purchase_order_id` fields,
 * which new writes populate from `items[0]`. Every consumer that needs "the
 * lines of this dispatch" has to collapse those two shapes the same way, and
 * getting it wrong either misses multi-item dispatches or double-counts the
 * first line. That rule lives here, once.
 *
 * All functions are pure and never mutate their arguments.
 */

const toNumber = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The line items of a dispatch document, in canonical `items[]` shape.
 *
 * PRECEDENCE RULE: when `items` is non-empty it is authoritative and the
 * top-level legacy fields are ignored entirely — they mirror `items[0]`, so
 * counting both double-counts the first line. Only when `items` is absent or
 * empty do the legacy fields synthesise a single line.
 *
 * @param {object} [dispatch]
 * @returns {Array<object>} A fresh array of fresh item objects.
 */
function itemsOf(dispatch) {
  if (!dispatch) return [];

  if (Array.isArray(dispatch.items) && dispatch.items.length > 0) {
    return dispatch.items.map((item) => ({ ...item }));
  }

  if (dispatch.brand_id) {
    return [{
      brand_id: dispatch.brand_id,
      brand_name: dispatch.brand_name,
      size_id: dispatch.size_id,
      size_name: dispatch.size_name,
      quantity: dispatch.quantity,
      purchase_order_id: dispatch.purchase_order_id || null,
    }];
  }

  return [];
}

/**
 * Total quantity across line items.
 * @param {Array<object>} [items]
 * @returns {number}
 */
function sumQuantity(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + toNumber(item && item.quantity), 0);
}

/**
 * Per-PO quantity change for a set of line items, as `{ poId: delta }`.
 *
 * Items sharing a PO are summed rather than validated independently — the bug
 * this prevents is two lines of one payload each fitting the PO's remaining
 * quantity on their own while their sum does not.
 *
 * @param {Array<object>} [items]
 * @param {number} [sign] - 1 to add the quantities, -1 to reverse them.
 * @returns {Record<string, number>}
 */
function poDeltasFor(items, sign = 1) {
  const deltas = {};
  if (!Array.isArray(items)) return deltas;

  for (const item of items) {
    const poId = item && item.purchase_order_id;
    if (typeof poId !== "string" || poId.length === 0) continue;
    deltas[poId] = (deltas[poId] || 0) + sign * toNumber(item.quantity);
  }
  return deltas;
}

/**
 * Net per-PO quantity change when `oldItems` is replaced by `newItems`.
 *
 * A single net set is what lets an update apply once instead of reversing and
 * re-applying: the reverse-then-reapply sequence leaves PO counters silently
 * *low* if it fails in between, which is the failure mode that looks plausible
 * and so goes unnoticed.
 *
 * @param {Array<object>} [oldItems]
 * @param {Array<object>} [newItems]
 * @returns {Record<string, number>} Zero-valued entries are dropped.
 */
function netPoDeltas(oldItems, newItems) {
  const merged = { ...poDeltasFor(oldItems, -1) };
  for (const [poId, delta] of Object.entries(poDeltasFor(newItems, 1))) {
    merged[poId] = (merged[poId] || 0) + delta;
  }

  return Object.fromEntries(Object.entries(merged).filter(([, delta]) => delta !== 0));
}

/**
 * Every PO id referenced by a dispatch, from either shape.
 * Unlike `itemsOf`, this deliberately unions both locations: a legacy
 * top-level id that no longer appears in `items[]` is still a dangling
 * reference worth reporting.
 *
 * @param {object} [dispatch]
 * @returns {string[]} Unique ids.
 */
function referencedPoIds(dispatch) {
  if (!dispatch) return [];

  const ids = new Set();
  if (typeof dispatch.purchase_order_id === "string" && dispatch.purchase_order_id.length > 0) {
    ids.add(dispatch.purchase_order_id);
  }
  if (Array.isArray(dispatch.items)) {
    for (const item of dispatch.items) {
      const poId = item && item.purchase_order_id;
      if (typeof poId === "string" && poId.length > 0) ids.add(poId);
    }
  }
  return Array.from(ids);
}

module.exports = { toNumber, itemsOf, sumQuantity, poDeltasFor, netPoDeltas, referencedPoIds };
