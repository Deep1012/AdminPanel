/**
 * Read-only stock reconciliation.
 *
 * Recomputes every derived counter from the rows that should produce it and
 * reports where the stored value disagrees. Nothing here writes: it exists to
 * be run *before* the new stock guards start rejecting writes, so that whoever
 * turns them on knows what the existing data already violates. A guard that
 * refuses a write because of drift laid down months ago is indistinguishable,
 * from the shop floor, from a guard that is simply broken.
 *
 * Every check caps its `samples` array (default 50 rows) so the response stays
 * far inside the ~4.5MB serverless response ceiling no matter how bad the data
 * is; `count` is always the full, unsampled figure.
 *
 * Aggregation happens in Node rather than in `$group` pipelines, matching the
 * rest of the codebase and the current data volume.
 */

const { toNumber, itemsOf, referencedPoIds } = require("./dispatchItems");
const { sheetsAvailable } = require("./stock");
const { printingAvailability, finishedGoodsAvailability } = require("./availability");

const DEFAULT_SAMPLE_LIMIT = 50;

/** A check result: the full count plus a bounded sample. */
function check(rows, sampleLimit) {
  return { count: rows.length, samples: rows.slice(0, sampleLimit) };
}

/**
 * Values of `field` occurring more than once, with their counts and up to ten
 * of the document ids carrying them.
 *
 * Purchase.sr_no, PrintingJob.job_number and Dispatch.order_number have no
 * unique index, so the lexicographic-maximum bug in the old code generators
 * (fixed in lib/sequence.js) could insert duplicates silently once a
 * collection passed 999 rows.
 *
 * @param {Array<object>} docs
 * @param {string} field
 * @param {number} sampleLimit
 * @returns {{count: number, samples: Array<object>}}
 */
function findDuplicates(docs, field, sampleLimit) {
  const byValue = new Map();

  for (const doc of docs || []) {
    const value = doc && doc[field];
    if (typeof value !== "string" || value.length === 0) continue;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(doc.id);
  }

  const duplicates = [];
  for (const [value, ids] of byValue.entries()) {
    if (ids.length > 1) {
      duplicates.push({ field, value, count: ids.length, ids: ids.slice(0, 10) });
    }
  }
  duplicates.sort((a, b) => b.count - a.count);

  return check(duplicates, sampleLimit);
}

/**
 * Run every reconciliation check.
 *
 * @param {object} params
 * @param {object} params.models - { Purchase, PrintingJob, Production, Dispatch, PurchaseOrder }.
 *   Injected so the suite can drive this with fakes; the route passes the real models.
 * @param {number} [params.sampleLimit]
 * @returns {Promise<object>} Structured report.
 */
async function reconcile({ models, sampleLimit = DEFAULT_SAMPLE_LIMIT }) {
  if (!models) throw new Error("reconcile: models is required");
  const limit = Number.isInteger(sampleLimit) && sampleLimit > 0 ? sampleLimit : DEFAULT_SAMPLE_LIMIT;

  const [purchases, jobs, productions, dispatches, purchaseOrders] = await Promise.all([
    models.Purchase.find({}, { id: 1, sr_no: 1, no_of_sheets: 1, sheets_used: 1, _id: 0 }).lean(),
    models.PrintingJob.find(
      {},
      { id: 1, job_number: 1, raw_material_id: 1, sheets_from_material: 1, sizes: 1, _id: 0 }
    ).lean(),
    models.Production.find(
      {},
      {
        id: 1, brand_name: 1, size_name: 1, parent_production_id: 1,
        quantity_produced: 1, printing_stock_used: 1, _id: 0,
      }
    ).lean(),
    models.Dispatch.find(
      {},
      {
        id: 1, order_number: 1, items: 1, brand_id: 1, brand_name: 1,
        size_id: 1, size_name: 1, quantity: 1, purchase_order_id: 1, _id: 0,
      }
    ).lean(),
    models.PurchaseOrder.find(
      {},
      { id: 1, serial_no: 1, quantity: 1, quantity_dispatched: 1, _id: 0 }
    ).lean(),
  ]);

  // --- Purchase.sheets_used vs the printing jobs drawing on that lot ---------
  const sheetsUsedByMaterial = new Map();
  for (const job of jobs) {
    const materialId = job && job.raw_material_id;
    if (!materialId) continue;
    sheetsUsedByMaterial.set(
      materialId,
      (sheetsUsedByMaterial.get(materialId) || 0) + toNumber(job.sheets_from_material)
    );
  }

  const sheetsDrift = [];
  const negativeSheets = [];
  for (const purchase of purchases) {
    const stored = toNumber(purchase.sheets_used);
    const computed = sheetsUsedByMaterial.get(purchase.id) || 0;
    if (stored !== computed) {
      sheetsDrift.push({
        purchase_id: purchase.id,
        sr_no: purchase.sr_no,
        stored_sheets_used: stored,
        computed_sheets_used: computed,
        drift: stored - computed,
      });
    }

    const available = sheetsAvailable(purchase);
    if (available < 0) {
      negativeSheets.push({
        purchase_id: purchase.id,
        sr_no: purchase.sr_no,
        no_of_sheets: toNumber(purchase.no_of_sheets),
        sheets_used: stored,
        sheets_available: available,
      });
    }
  }

  // Printing jobs pointing at a raw material that no longer exists. The
  // deletion guard in routes/purchases.js should make this impossible, so a
  // non-zero count means something bypassed it.
  const purchaseIds = new Set(purchases.map((p) => p.id));
  const orphanJobs = jobs
    .filter((job) => job.raw_material_id && !purchaseIds.has(job.raw_material_id))
    .map((job) => ({
      job_id: job.id,
      job_number: job.job_number,
      raw_material_id: job.raw_material_id,
      sheets_from_material: toNumber(job.sheets_from_material),
    }));

  // --- PurchaseOrder.quantity_dispatched vs the dispatches referencing it ----
  // Counted through `itemsOf`, which ignores the legacy top-level fields
  // whenever `items[]` is populated. New writes copy items[0] into those
  // fields, so summing both locations would double-count every first line.
  const dispatchedByPo = new Map();
  for (const dispatch of dispatches) {
    for (const item of itemsOf(dispatch)) {
      const poId = item.purchase_order_id;
      if (typeof poId !== "string" || poId.length === 0) continue;
      dispatchedByPo.set(poId, (dispatchedByPo.get(poId) || 0) + toNumber(item.quantity));
    }
  }

  const poDrift = [];
  const negativePoRemaining = [];
  for (const po of purchaseOrders) {
    const stored = toNumber(po.quantity_dispatched);
    const computed = dispatchedByPo.get(po.id) || 0;
    if (stored !== computed) {
      poDrift.push({
        purchase_order_id: po.id,
        serial_no: po.serial_no,
        stored_quantity_dispatched: stored,
        computed_quantity_dispatched: computed,
        drift: stored - computed,
      });
    }

    const remaining = toNumber(po.quantity) - stored;
    if (remaining < 0) {
      negativePoRemaining.push({
        purchase_order_id: po.id,
        serial_no: po.serial_no,
        quantity: toNumber(po.quantity),
        quantity_dispatched: stored,
        remaining,
      });
    }
  }

  // --- Dangling references --------------------------------------------------
  // Both locations are unioned here (unlike the drift check above): a legacy
  // top-level id left pointing at a deleted PO is a dangling reference even
  // when items[] has moved on.
  const poIds = new Set(purchaseOrders.map((po) => po.id));
  const danglingPoRefs = [];
  for (const dispatch of dispatches) {
    for (const poId of referencedPoIds(dispatch).filter((id) => !poIds.has(id))) {
      danglingPoRefs.push({
        dispatch_id: dispatch.id,
        order_number: dispatch.order_number,
        purchase_order_id: poId,
        location: dispatch.purchase_order_id === poId ? "top_level" : "items",
      });
    }
  }

  const productionIds = new Set(productions.map((p) => p.id));
  const orphanChildren = productions
    .filter((p) => p.parent_production_id && !productionIds.has(p.parent_production_id))
    .map((p) => ({
      production_id: p.id,
      brand_name: p.brand_name,
      size_name: p.size_name,
      parent_production_id: p.parent_production_id,
    }));

  // --- What the two new stock guards will refuse ----------------------------
  // routes/production.js now rejects a draw beyond Available Printing Stock
  // and routes/dispatch.js beyond Finished Goods Available. Any (size, brand)
  // pair already negative here was over-drawn before those guards existed, and
  // is where they will start biting — which is the whole reason this endpoint
  // exists. Cascade children are counted (they carry their own brand_name); see
  // lib/availability.js.
  const negativePrintingStock = Array.from(printingAvailability(jobs, productions).values())
    .filter((bucket) => bucket.available < 0)
    .sort((a, b) => a.available - b.available);

  const negativeFinishedGoods = Array.from(finishedGoodsAvailability(productions, dispatches).values())
    .filter((bucket) => bucket.available < 0)
    .sort((a, b) => a.available - b.available);

  const checks = {
    purchase_sheets_used_drift: check(sheetsDrift, limit),
    negative_sheets_available: check(negativeSheets, limit),
    orphan_printing_jobs: check(orphanJobs, limit),
    po_quantity_dispatched_drift: check(poDrift, limit),
    negative_po_remaining: check(negativePoRemaining, limit),
    dangling_dispatch_po_refs: check(danglingPoRefs, limit),
    orphan_production_children: check(orphanChildren, limit),
    negative_printing_stock_available: check(negativePrintingStock, limit),
    negative_finished_goods_available: check(negativeFinishedGoods, limit),
    duplicate_purchase_sr_no: findDuplicates(purchases, "sr_no", limit),
    duplicate_printing_job_number: findDuplicates(jobs, "job_number", limit),
    duplicate_dispatch_order_number: findDuplicates(dispatches, "order_number", limit),
  };

  const total_issues = Object.values(checks).reduce((sum, entry) => sum + entry.count, 0);

  return {
    generated_at: new Date().toISOString(),
    sample_limit: limit,
    scanned: {
      purchases: purchases.length,
      printing_jobs: jobs.length,
      production: productions.length,
      dispatches: dispatches.length,
      purchase_orders: purchaseOrders.length,
    },
    checks,
    total_issues,
    clean: total_issues === 0,
  };
}

module.exports = { reconcile, findDuplicates, DEFAULT_SAMPLE_LIMIT };
