/**
 * Human-readable sequential code generation (RM-001, JOB-001, DSP-001,
 * PO-YYYYMMDD-001).
 *
 * Replaces four near-identical per-route generators that all did:
 *
 *   const last = await Model.findOne({}, { field: 1 }).sort({ field: -1 }).lean();
 *   seq = parseInt(last.field.match(/PREFIX-(\d+)/)[1], 10) + 1;
 *
 * Those fields are Strings, so `sort({ field: -1 })` is a *lexicographic*
 * sort: "RM-999" sorts above "RM-1000". Past 999 rows the reported maximum
 * stays pinned at "RM-999" forever, so every subsequent insert is handed
 * "RM-1000" again. Purchase.sr_no, PrintingJob.job_number and
 * Dispatch.order_number carry no unique index, so those duplicates insert
 * silently.
 *
 * WHY AN AGGREGATION RATHER THAN A COUNTERS COLLECTION
 * ----------------------------------------------------
 * A counters collection (findOneAndUpdate + $inc) would additionally be
 * race-free, but it needs a seeded starting value per counter derived from
 * live production data, plus one counter document per PO *day* for the
 * PO-YYYYMMDD-NNN shape — a migration and a new collection for a bug that is
 * purely about how the maximum is computed. The aggregation below derives the
 * true maximum from the data that already exists, needs no migration, and
 * handles the per-day PO scope for free (the day is part of the prefix).
 *
 * KNOWN LIMITATION: like the code it replaces, this is read-then-write, so two
 * concurrent inserts can still be handed the same number. That race is
 * unchanged by this module and is tracked separately; PurchaseOrder.serial_no
 * has a unique index and its route already answers 409 on duplicate-key, which
 * is the mitigation for the one collection that enforces uniqueness.
 */

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Next code in a prefixed numeric sequence, computed from the true numeric
 * maximum rather than the lexicographic one.
 *
 * @param {import("mongoose").Model} Model - Model owning the sequence field.
 * @param {string} field - Name of the String field holding the code.
 * @param {string} prefix - Literal prefix, including any separator (e.g. "RM-").
 * @param {number} width - Minimum digit count; the number is zero-padded to
 *   this width and *widens* past it rather than truncating.
 * @returns {Promise<string>} e.g. "RM-001", "RM-1000".
 */
async function nextSequence(Model, field, prefix, width = 3) {
  if (typeof field !== "string" || field.length === 0) {
    throw new Error("nextSequence: field must be a non-empty string");
  }
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw new Error("nextSequence: prefix must be a non-empty string");
  }
  if (!Number.isInteger(width) || width < 1) {
    throw new Error("nextSequence: width must be a positive integer");
  }

  const rows = await Model.aggregate([
    // Only rows shaped exactly "<prefix><digits>" participate. This also scopes
    // a PO-YYYYMMDD- prefix to that single day.
    { $match: { [field]: { $regex: `^${escapeRegExp(prefix)}\\d+$` } } },
    {
      $addFields: {
        __seq: {
          $convert: {
            input: { $substrCP: [`$${field}`, prefix.length, 32] },
            to: "int",
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    { $group: { _id: null, max: { $max: "$__seq" } } },
  ]);

  const rawMax = rows.length > 0 ? Number(rows[0].max) : 0;
  const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 0;

  // padStart never truncates, so widths grow naturally: 999 -> "999", 1000 -> "1000".
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

module.exports = { nextSequence, escapeRegExp };
