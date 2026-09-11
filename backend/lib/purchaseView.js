/**
 * Read-time shaping of a raw-material (Purchase) document.
 *
 * `sheets_available` used to be a stored field. It was written at create time
 * and on a dimension/weight edit, but printing jobs only ever `$inc`'d
 * `sheets_used`, so the stored value stopped matching reality after the first
 * job — and the `=== undefined` backfill in the GET never fired, because the
 * schema default was 0 rather than undefined. The result was two screens
 * showing two different availabilities for the same lot.
 *
 * The field is now derived here on every read, from the two fields that are
 * actually maintained. `scripts/unset-sheets-available.js` strips the stale
 * stored copies; until it runs, this function overwrites whatever a `.lean()`
 * read surfaced from those documents.
 */

const { sheetsAvailable, toNumber } = require("./stock");

/**
 * A purchase with `sheets_used` normalised and `sheets_available` computed.
 *
 * Returns a new object; the input document is never modified.
 *
 * @param {object} purchase - A lean Purchase document.
 * @returns {object}
 */
function withComputedSheets(purchase) {
  if (!purchase) return purchase;

  // Drop any stored copy before recomputing, so a stale value can never win.
  const { sheets_available: _stored, ...rest } = purchase;

  return {
    ...rest,
    sheets_used: toNumber(rest.sheets_used),
    sheets_available: sheetsAvailable(rest),
  };
}

module.exports = { withComputedSheets };
