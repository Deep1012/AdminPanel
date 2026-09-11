/**
 * Cleanup: null out dispatch references to purchase orders that no longer exist.
 *
 * WHY
 * ---
 * CLAUDE.md's rule is that deleting a PO unlinks every dispatch referencing it.
 * Until Sept 2026 the delete handler matched only the legacy top-level
 * `Dispatch.purchase_order_id`, so a multi-item dispatch whose line referenced
 * the deleted PO through `items[].purchase_order_id` was never unlinked. The
 * handler is fixed (lib/poSync.js unlinkPoFromDispatches); this applies the same
 * unlink to the references left behind before the fix. GET /api/admin/reconcile
 * reported them as `dangling_dispatch_po_refs` — 41 on 2026-09-11.
 *
 * It calls the exact function the PO delete handler now uses, so historical
 * cleanup and live behaviour cannot disagree about what "unlink" means.
 *
 * SAFETY
 * ------
 * - Only ids that match NO existing purchase order are touched. A reference to
 *   a live PO is never modified.
 * - Changes no PO counter: the POs these references point at are gone, so
 *   there is no quantity_dispatched to adjust.
 * - Sets references to null; never deletes a dispatch or any other field.
 * - Idempotent: once unlinked, the ids no longer appear, so a re-run finds 0.
 * - Nothing calls it automatically. Run by hand.
 *
 * Usage:
 *   cd backend && node scripts/unlink-dangling-po-refs.js --dry-run
 *   cd backend && node scripts/unlink-dangling-po-refs.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Dispatch = require("../models/Dispatch");
const PurchaseOrder = require("../models/PurchaseOrder");
const { unlinkPoFromDispatches } = require("../lib/poSync");

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Every PO id referenced by any dispatch, through either shape.
 *
 * Deliberately unfiltered at the query level. `{ "items.purchase_order_id":
 * { $nin: [null, ""] } }` looks like "skip empty references" but on an ARRAY
 * path $nin excludes the whole document when ANY element matches — so a
 * dispatch holding one unlinked line (null) plus one dangling line was dropped
 * entirely, and its dangling reference was never seen. The first version of
 * this script had exactly that bug; GET /api/admin/reconcile caught it.
 * Empty values are filtered in JavaScript instead.
 */
async function referencedPoIds() {
  const [legacy, nested] = await Promise.all([
    Dispatch.distinct("purchase_order_id"),
    Dispatch.distinct("items.purchase_order_id"),
  ]);
  return [...new Set([...legacy, ...nested].filter((id) => typeof id === "string" && id.length > 0))];
}

async function main() {
  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is not set. Set it in the environment or backend/.env.");
  }

  await mongoose.connect(process.env.MONGO_URL, {
    dbName: "timestin_crm",
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`[cleanup] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

  const referenced = await referencedPoIds();
  const existing = new Set(
    await PurchaseOrder.distinct("id", { id: { $in: referenced } })
  );
  const dangling = referenced.filter((id) => !existing.has(id));

  const affected = await Dispatch.countDocuments({
    $or: [{ purchase_order_id: { $in: dangling } }, { "items.purchase_order_id": { $in: dangling } }],
  });

  console.log(`[cleanup] PO ids referenced by dispatches: ${referenced.length}`);
  console.log(`[cleanup] of which no longer exist:        ${dangling.length}`);
  console.log(`[cleanup] dispatches holding such a ref:   ${affected}`);

  if (dangling.length === 0) {
    console.log("[cleanup] nothing to do.");
    return;
  }
  if (DRY_RUN) {
    console.log("[cleanup] --dry-run: no write performed.");
    return;
  }

  let legacy = 0;
  let nested = 0;
  for (const poId of dangling) {
    const result = await unlinkPoFromDispatches(poId, { model: Dispatch });
    legacy += result.legacy;
    nested += result.nested;
  }
  console.log(`[cleanup] unlinked: ${legacy} top-level ref(s), ${nested} dispatch(es) with nested refs.`);

  const after = await referencedPoIds();
  const stillExisting = new Set(await PurchaseOrder.distinct("id", { id: { $in: after } }));
  const remaining = after.filter((id) => !stillExisting.has(id)).length;
  console.log(`[cleanup] dangling ids remaining: ${remaining}`);
  if (remaining > 0) {
    throw new Error(`${remaining} dangling PO id(s) remain — re-run the script.`);
  }
}

main()
  .catch((error) => {
    console.error(`[cleanup] failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log("[cleanup] done.");
  });
