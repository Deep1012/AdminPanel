/**
 * Request-shaped decisions for the dispatch route: what lines a payload is
 * asking for, whether they are valid, which PO each line lands on, and whether
 * the finished goods exist.
 *
 * These live here rather than inline in routes/dispatch.js so they can be
 * driven directly by the suite — the project has no HTTP-level test harness,
 * and the two bugs this module exists to close (multi-line over-allocation and
 * the missing finished-goods check) are exactly the kind that need a test.
 * The route keeps the HTTP concerns: status codes, error text, logging.
 */

const { toNumber } = require("./dispatchItems");
const { finishedGoodsAvailability, availableFor, netDemand } = require("./availability");

/**
 * The line items a request is asking for, from either payload shape, or null
 * when it carries neither.
 *
 * Returns fresh objects so later PO resolution cannot write back into
 * `req.body`.
 *
 * @param {object} [body]
 * @returns {Array<object>|null}
 */
function itemsFromPayload(body) {
  if (!body) return null;
  const { items, brand_id, brand_name, size_id, size_name, quantity, purchase_order_id } = body;

  if (Array.isArray(items) && items.length > 0) {
    return items.map((item) => ({ ...item }));
  }
  if (brand_id && size_id && quantity) {
    return [{
      brand_id,
      brand_name,
      size_id,
      size_name,
      quantity,
      purchase_order_id: purchase_order_id || null,
    }];
  }
  return null;
}

/**
 * First line with a non-positive or non-numeric quantity, or null.
 *
 * `items[]` is a schema-less Array, so nothing validated the per-line
 * quantities: a negative one would *decrement* the linked PO's
 * quantity_dispatched, manufacturing PO capacity out of nothing.
 *
 * @param {Array<object>} [items]
 * @returns {object|null}
 */
function findInvalidQuantity(items) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => toNumber(item && item.quantity) <= 0) || null;
}

/**
 * Resolve each line's purchase order, auto-matching on
 * brand/size/customer where the line carries no explicit PO.
 *
 * Allocations already made by EARLIER LINES OF THE SAME PAYLOAD are subtracted
 * before a candidate is accepted. Without that, two lines for the same
 * brand/size/customer both auto-match the same PO, which is how the
 * over-allocation bug is reachable even when the client sends no PO ids at
 * all. Where a later PO has room, the second line now lands there instead.
 *
 * The fit rule is unchanged from the original route: any PO with *some*
 * remaining capacity matches, not necessarily enough for the whole line. A
 * line too big for its PO therefore still fails the capacity check with the
 * existing message rather than silently becoming an unlinked dispatch.
 *
 * @param {Array<object>} items
 * @param {string} [customerName]
 * @param {{model: object}} options - PurchaseOrder model.
 * @returns {Promise<Array<object>>} New items with `purchase_order_id` filled in.
 */
async function resolvePoIds(items, customerName, { model }) {
  if (!model) throw new Error("resolvePoIds: model is required");

  const pending = {};
  const resolved = [];

  for (const item of items || []) {
    const quantity = toNumber(item.quantity);
    let resolvedPoId = item.purchase_order_id || null;

    if (!resolvedPoId && item.brand_id && item.size_id && customerName) {
      const candidates = await model.find({
        brand_id: item.brand_id,
        size_id: item.size_id,
        company_name: customerName,
        $expr: { $gt: [{ $subtract: ["$quantity", { $ifNull: ["$quantity_dispatched", 0] }] }, 0] },
      }).sort({ date: 1 }).lean();

      const match = (candidates || []).find(
        (po) => toNumber(po.quantity) - toNumber(po.quantity_dispatched) - (pending[po.id] || 0) > 0
      );
      if (match) resolvedPoId = match.id;
    }

    if (resolvedPoId) {
      pending[resolvedPoId] = (pending[resolvedPoId] || 0) + quantity;
    }
    resolved.push({ ...item, purchase_order_id: resolvedPoId });
  }

  return resolved;
}

/**
 * First (size, brand) pair asked for beyond
 * Finished Goods Available = Quantity Produced - Quantity Dispatched, or null.
 *
 * Measured as a net *increase* over `oldItems` (empty for a create), so an
 * edit that does not grow a line is never refused because of pre-existing
 * drift — a notes-only edit of a row that is already over-dispatched has to
 * stay possible.
 *
 * The produced side counts every production row, cascade children included:
 * they carry their own brand_name (BOTTOM/TOP/LID, LWBF) and so form their own
 * buckets, which are genuinely dispatchable and must not read as zero. See
 * lib/availability.js.
 *
 * @param {Array<object>} oldItems
 * @param {Array<object>} newItems
 * @param {{productionModel: object, dispatchModel: object}} options
 * @returns {Promise<{size_name: string, brand_name: string, quantity: number, available: number}|null>}
 */
async function findFinishedGoodsShortage(oldItems, newItems, { productionModel, dispatchModel }) {
  if (!productionModel || !dispatchModel) {
    throw new Error("findFinishedGoodsShortage: productionModel and dispatchModel are required");
  }

  const demand = netDemand(oldItems, newItems);
  if (demand.length === 0) return null;

  const [productions, dispatches] = await Promise.all([
    productionModel.find({}, { size_name: 1, brand_name: 1, quantity_produced: 1, _id: 0 }).lean(),
    dispatchModel.find({}, { items: 1, size_name: 1, brand_name: 1, quantity: 1, _id: 0 }).lean(),
  ]);

  const buckets = finishedGoodsAvailability(productions, dispatches);

  for (const entry of demand) {
    const available = availableFor(buckets, entry.size_name, entry.brand_name);
    if (entry.quantity > available) {
      return { ...entry, available };
    }
  }
  return null;
}

module.exports = {
  itemsFromPayload,
  findInvalidQuantity,
  resolvePoIds,
  findFinishedGoodsShortage,
};
