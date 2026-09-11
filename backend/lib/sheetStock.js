/**
 * Atomic reservation and release of raw-material sheets
 * (`Purchase.sheets_used`).
 *
 * WHY NOT read-validate-then-$inc
 * -------------------------------
 * The route used to read the lot, compare `no_of_sheets - sheets_used` against
 * the request, and then `$inc`. Two concurrent 80-sheet jobs against a
 * 100-sheet lot both read "100 available", both pass, and the lot ends at 160
 * used of 100 — invisible until someone looks at the Raw Material Stock page.
 *
 * `reserveSheets` instead puts the comparison inside the update's filter, so
 * Mongo evaluates "would this push me past no_of_sheets?" against the document
 * it is about to modify, under the document lock. The loser of the race gets
 * `null` back and its request fails.
 *
 * No transactions are involved: this is a single-document conditional update,
 * which needs none.
 */

const DefaultPurchase = require("../models/Purchase");

const toNumber = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Filter matching a purchase only if adding `sheets` to `sheets_used` keeps it
 * within `no_of_sheets`. Exported for the test suite and for readability at
 * the call sites.
 *
 * @param {string} purchaseId
 * @param {number} sheets
 * @returns {object} Mongo filter.
 */
function capacityFilter(purchaseId, sheets) {
  return {
    id: purchaseId,
    $expr: {
      $lte: [
        { $add: [{ $ifNull: ["$sheets_used", 0] }, toNumber(sheets)] },
        { $ifNull: ["$no_of_sheets", 0] },
      ],
    },
  };
}

/**
 * Reserve `sheets` from a raw-material lot, atomically.
 *
 * @param {{purchaseId: string, sheets: number, model?: import("mongoose").Model}} params
 * @returns {Promise<object|null>} The updated purchase, or null when the lot
 *   does not exist or does not have that many sheets left. The two cases are
 *   deliberately not distinguished by the return value — callers re-read the
 *   lot to build the error message, which is a read on the failure path only.
 */
async function reserveSheets({ purchaseId, sheets, model = DefaultPurchase }) {
  const amount = toNumber(sheets);
  if (amount <= 0) {
    throw new Error("reserveSheets: sheets must be greater than 0");
  }

  return model.findOneAndUpdate(
    capacityFilter(purchaseId, amount),
    { $inc: { sheets_used: amount } },
    { new: true }
  ).lean();
}

/**
 * Give `sheets` back to a raw-material lot (job deleted, or shrunk).
 *
 * Uses a pipeline-form update so the `>= 0` floor is applied server-side in
 * the same step: a plain `$inc` of a negative number can leave `sheets_used`
 * negative when the stored value has already drifted below what the job
 * recorded, and a negative `sheets_used` reads as *more* stock than the lot
 * ever held. Mongoose's `min: 0` validator does not run on `updateOne`, so the
 * floor has to be in the update itself.
 *
 * Never fails on capacity — a release must never be blocked.
 *
 * @param {{purchaseId: string, sheets: number, model?: import("mongoose").Model}} params
 * @returns {Promise<{matched: boolean}>}
 */
async function releaseSheets({ purchaseId, sheets, model = DefaultPurchase }) {
  const amount = toNumber(sheets);
  if (amount <= 0) return { matched: false };

  const result = await model.updateOne({ id: purchaseId }, [
    {
      $set: {
        sheets_used: { $max: [0, { $subtract: [{ $ifNull: ["$sheets_used", 0] }, amount] }] },
      },
    },
  ]);

  return { matched: !!result && result.matchedCount !== 0 };
}

/**
 * Put back sheets that were released in anticipation of a write which then
 * failed.
 *
 * Unconditional on purpose — the mirror of `releaseSheets`. Restoring the
 * previous state must not be refused by the capacity guard because another job
 * has taken the room in the meantime; refusing would leave the lot
 * under-deducted, which is the invisible direction.
 *
 * @param {{purchaseId: string, sheets: number, model?: import("mongoose").Model}} params
 * @returns {Promise<{matched: boolean}>}
 */
async function restoreSheets({ purchaseId, sheets, model = DefaultPurchase }) {
  const amount = toNumber(sheets);
  if (amount <= 0) return { matched: false };

  const result = await model.updateOne({ id: purchaseId }, [
    {
      $set: {
        sheets_used: { $max: [0, { $add: [{ $ifNull: ["$sheets_used", 0] }, amount] }] },
      },
    },
  ]);

  return { matched: !!result && result.matchedCount !== 0 };
}

module.exports = { capacityFilter, reserveSheets, releaseSheets, restoreSheets };
