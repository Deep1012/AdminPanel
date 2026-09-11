/**
 * Response-size guard for GET /api/dashboard/export-all.
 *
 * The backend runs as a Vercel serverless function, and Vercel caps a function
 * response body at ~4.5MB. Past that the platform fails the request itself with
 * an opaque error (FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE) — the handler never
 * gets to say anything, so the Admin page sees a generic network failure rather
 * than a reason.
 *
 * export-all serialises six collections in one response, so it is the only
 * endpoint that can plausibly reach that ceiling. At current volume (~2,000
 * documents total) it cannot: this is about failing honestly later, not about
 * performance now. No streaming and no new dependency — just measure the bytes
 * we are about to send and refuse clearly when they will not fit.
 */

// Vercel's documented limit is ~4.5MB; budget under it so headers, gzip
// boundaries and the platform's own framing cannot tip a passing export over.
const MAX_EXPORT_BYTES = 4 * 1024 * 1024;

/**
 * Per-collection row cap. Six collections at 5,000 rows each is still an order
 * of magnitude more than the byte budget allows, so MAX_EXPORT_BYTES is the
 * real guard; this only bounds how much is pulled into memory before we can
 * measure it.
 */
const EXPORT_ROW_LIMIT = 5000;

function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Serialise an export payload once and report whether it can be returned.
 *
 * @param {Object} payload The export body, keyed by collection.
 * @param {number} [maxBytes] Override for the byte budget (tests).
 * @returns {{ ok: boolean, bytes: number, body: string|null, detail: string|null }}
 *   `body` is the serialised JSON, so the caller can send it without
 *   stringifying a second time. `detail` carries the user-facing reason when
 *   `ok` is false.
 */
function checkExportPayload(payload, maxBytes = MAX_EXPORT_BYTES) {
  const body = JSON.stringify(payload === undefined ? null : payload);
  const bytes = Buffer.byteLength(body, "utf8");

  if (bytes > maxBytes) {
    return {
      ok: false,
      bytes,
      body: null,
      detail: `Export is too large to return in one response (${formatMegabytes(bytes)}, limit ${formatMegabytes(maxBytes)}). Export the individual pages instead of the global export, or narrow the date range before exporting.`,
    };
  }

  return { ok: true, bytes, body, detail: null };
}

module.exports = {
  MAX_EXPORT_BYTES,
  EXPORT_ROW_LIMIT,
  checkExportPayload,
};
