/**
 * Classification of a thrown error into an HTTP status and a client-safe
 * `{ detail }` body.
 *
 * THE PROBLEM
 * -----------
 * Every route handler used to end its catch block with
 *
 *   res.status(500).json({ detail: error.message });
 *
 * which sends whatever the failure happened to say straight to the browser:
 * Mongoose cast and validation text naming internal field paths, driver
 * messages carrying the Atlas host and replica-set names, duplicate-key errors
 * quoting index names, and the message of any programming error (`x is not a
 * function`). None of it was logged, so the server kept no record at all.
 *
 * THE RULE
 * --------
 * Deliberate 4xx messages are user-facing and must survive verbatim. The
 * frontend renders them (see `getErrorMessage` there), and they are the whole
 * mechanism behind "Over-dispatch is rejected", "PO quantity cannot be reduced
 * below already-dispatched amount", and so on. Unexpected failures — anything
 * that classifies as 5xx — collapse to one generic sentence, and the real
 * error is logged server-side by middleware/errorHandler.js.
 *
 * A 4xx is recognised by an explicit `status`/`statusCode` on the error, which
 * is the convention used by http-errors and by Express's own body-parser
 * (a malformed JSON body throws with `status: 400`, an oversized one with
 * `status: 413`). Handlers that decide a 4xx themselves keep doing it inline
 * with `return res.status(...).json({ detail })` and never reach here.
 */

/** The single sentence every unexpected failure returns. */
const GENERIC_DETAIL = "An unexpected server error occurred. Please try again.";

/**
 * HTTP status carried by an error, defaulting to 500.
 *
 * @param {*} error
 * @returns {number}
 */
function errorStatus(error) {
  const raw = error && (error.status || error.statusCode);
  const status = Number(raw);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }
  return 500;
}

/**
 * Whether the error's own message may be shown to the client.
 *
 * @param {*} error
 * @returns {boolean}
 */
function isClientSafe(error) {
  if (!error) return false;
  // http-errors marks 4xx as `expose: true`; honour an explicit flag either way.
  if (typeof error.expose === "boolean") return error.expose;
  const status = errorStatus(error);
  return status >= 400 && status < 500;
}

/**
 * Status + body for a thrown error.
 *
 * @param {*} error
 * @returns {{ status: number, body: { detail: string } }}
 */
function toErrorResponse(error) {
  const status = errorStatus(error);
  const message = error && typeof error.message === "string" ? error.message.trim() : "";

  if (isClientSafe(error) && message.length > 0) {
    return { status, body: { detail: message } };
  }
  return { status, body: { detail: GENERIC_DETAIL } };
}

module.exports = { GENERIC_DETAIL, errorStatus, isClientSafe, toErrorResponse };
