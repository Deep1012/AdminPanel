/**
 * Migration: strip the stale stored `sheets_available` field from every
 * purchase document.
 *
 * WHY
 * ---
 * `Purchase.sheets_available` was written at create time and on a
 * dimension/weight edit, but printing jobs only ever incremented
 * `sheets_used`, so the stored number stopped matching reality after the first
 * job against a lot. GET /api/purchases served the stale value while
 * /api/dashboard/purchase-stock and /api/purchases/available computed the
 * right one, so the same lot showed two different availabilities on two
 * screens. The field is gone from the schema and is now derived on every read
 * (lib/purchaseView.js); this removes the misleading copies left in the data.
 *
 * SAFETY
 * ------
 * - Idempotent: `$unset` on a document that no longer has the field is a no-op,
 *   so re-running reports 0 modified and changes nothing.
 * - Touches no other field, and never deletes a document.
 * - Nothing calls it automatically. There is no migration runner in this
 *   project and none is added here: run it by hand, once, after deploying the
 *   backend that stopped writing the field.
 * - The API is correct either way — the read-time computation overwrites
 *   whatever is stored — so this is cleanup, not a prerequisite.
 *
 * Usage:
 *   cd backend && node scripts/unset-sheets-available.js
 *   cd backend && node scripts/unset-sheets-available.js --dry-run
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Purchase = require("../models/Purchase");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is not set. Set it in the environment or backend/.env.");
  }

  await mongoose.connect(process.env.MONGO_URL, {
    dbName: "timestin_crm",
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`[migration] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

  const filter = { sheets_available: { $exists: true } };

  // Counted before the write so the log line is meaningful on the first run
  // and honestly reports 0 on every run after it.
  const affected = await Purchase.countDocuments(filter);
  console.log(`[migration] purchases still carrying sheets_available: ${affected}`);

  if (affected === 0) {
    console.log("[migration] nothing to do — already migrated.");
    return;
  }

  if (DRY_RUN) {
    console.log("[migration] --dry-run: no write performed.");
    return;
  }

  // strict: false is required because the field is no longer in the schema,
  // and Mongoose strips unknown paths from an update in strict mode.
  const result = await Purchase.updateMany(
    filter,
    { $unset: { sheets_available: "" } },
    { strict: false }
  );

  console.log(
    `[migration] matched ${result.matchedCount}, modified ${result.modifiedCount} purchase document(s).`
  );

  const remaining = await Purchase.countDocuments(filter);
  console.log(`[migration] remaining with the field: ${remaining}`);
  if (remaining > 0) {
    throw new Error(`${remaining} document(s) still carry sheets_available — re-run the script.`);
  }
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log("[migration] done.");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`[migration] failed: ${error.message}`);
    try {
      await mongoose.disconnect();
    } catch (_) {
      // Disconnect failure on an already-failed run is not worth reporting.
    }
    process.exit(1);
  });
