/**
 * Brute-force throttling for POST /api/auth/login, held in the User document.
 *
 * WHY NOT express-rate-limit
 * --------------------------
 * express-rate-limit's default MemoryStore is per-process. This API runs as
 * Vercel serverless functions, where concurrent requests land in *separate*
 * instances and every cold start begins with an empty store. A memory-backed
 * limiter is therefore bypassed by simply issuing the guesses in parallel —
 * exactly the attack it is meant to stop. Module-level mutable state is also
 * ruled out for the same reason (see ARCHITECTURE.md, "Serverless
 * constraints"). The only store shared by all instances is Mongo, so the
 * counter lives on the user row and this module is pure decision logic over
 * it: no I/O, no state, callers apply the returned update objects.
 *
 * TWO KINDS OF LOCK, DELIBERATELY INDEPENDENT
 * -------------------------------------------
 *   User.is_locked    Boolean. Permanent, admin-controlled (PUT /api/users/:id).
 *                     Enforced on EVERY request by middleware/auth.js -> 403.
 *   User.locked_until  Date/ISO string. Temporary, set by this module after
 *                     MAX_FAILED_ATTEMPTS bad passwords. Enforced only at
 *                     login -> 429, and expires on its own.
 *
 * They must never interfere:
 *   - No update object built here contains `is_locked`. A throttle lockout can
 *     therefore never escalate into a permanent lock that needs an admin to
 *     undo, and `successReset` can never clear an admin's lock.
 *   - Nothing here reads `is_locked` either, so an admin lock cannot be lifted
 *     or shortened by waiting out a cooldown.
 * `FIELDS` below is the exhaustive list of columns this module writes, and
 * loginThrottle.test.js asserts every emitted update stays inside it.
 */

/** Bad passwords tolerated before a cooldown starts. */
const MAX_FAILED_ATTEMPTS = 5;

/** Length of the cooldown, in milliseconds. */
const LOCKOUT_MS = 15 * 60 * 1000;

/** The only User fields this module ever writes. Asserted by the tests. */
const FIELDS = ["failed_login_count", "locked_until"];

/**
 * Epoch milliseconds for a `locked_until` value, which may be a Date (new
 * rows), an ISO string (the project stores most dates as strings — see
 * ARCHITECTURE.md "Conventions"), or absent.
 *
 * @param {Date|string|number|null|undefined} value
 * @returns {number|null} null when absent or unparseable.
 */
function lockedUntilMs(value) {
  if (value === null || value === undefined || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Human-readable cooldown remaining, rounded UP so the message never tells a
 * caller to retry before the lock has actually expired.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatRetryAfter(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Is this user currently inside a throttle cooldown?
 *
 * @param {Object|null} user - User document (or plain object). May be null.
 * @param {number} [now] - Epoch ms, injectable for tests.
 * @returns {{ throttled: boolean, retryAfterMs: number }}
 */
function isThrottled(user, now = Date.now()) {
  const until = user ? lockedUntilMs(user.locked_until) : null;
  if (until === null || until <= now) {
    return { throttled: false, retryAfterMs: 0 };
  }
  return { throttled: true, retryAfterMs: until - now };
}

/**
 * The 429 response to send while a cooldown is active, or null to continue.
 *
 * The message deliberately describes the *request rate*, not the account: it
 * is identical for every throttled user and never states that the account
 * exists, is locked, or who locked it.
 *
 * @param {Object|null} user
 * @param {number} [now]
 * @returns {{ status: 429, detail: string, retry_after_seconds: number }|null}
 */
function throttleRejection(user, now = Date.now()) {
  const { throttled, retryAfterMs } = isThrottled(user, now);
  if (!throttled) return null;

  return {
    status: 429,
    detail: `Too many failed login attempts. Try again in ${formatRetryAfter(retryAfterMs)}.`,
    retry_after_seconds: Math.ceil(retryAfterMs / 1000),
  };
}

/**
 * Mongo update that increments the failure counter, and nothing else.
 *
 * A fresh object every call, so no caller can mutate shared state.
 *
 * @returns {{ $inc: { failed_login_count: 1 } }}
 */
function incrementUpdate() {
  return { $inc: { failed_login_count: 1 } };
}

/**
 * Mongo update arming the cooldown, given the counter value AFTER the
 * increment has been applied, or null when the threshold is not reached.
 *
 * It must be the post-increment value, and it must come from the database
 * rather than from `read + 1`. Deciding the lockout from the value the request
 * read would mean a burst of parallel guesses — the case that motivated moving
 * this counter into the database at all — would each see 0, each compute 1,
 * and none would arm the lock, even though the row ends up at 5.
 * `recordFailedAttempt` below gets the authoritative value back from
 * findOneAndUpdate.
 *
 * @param {number} countAfterIncrement
 * @param {number} [now]
 * @returns {{ $set: { locked_until: Date } }|null}
 */
function lockoutUpdate(countAfterIncrement, now = Date.now()) {
  const count = Number(countAfterIncrement) || 0;
  if (count < MAX_FAILED_ATTEMPTS) return null;
  return { $set: { locked_until: new Date(now + LOCKOUT_MS) } };
}

/**
 * Mongo update clearing the throttle after a correct password, or null when
 * there is nothing to clear (so a normal login costs no extra write).
 *
 * Clears ONLY the two throttle fields. `is_locked` is untouched, so an
 * administrator's lock survives a successful password check — the login
 * handler still answers 403 for it.
 *
 * @param {Object|null} user
 * @returns {{ $set: { failed_login_count: number, locked_until: null } }|null}
 */
function successReset(user) {
  const count = Number(user && user.failed_login_count) || 0;
  const until = user ? lockedUntilMs(user.locked_until) : null;
  if (count === 0 && until === null) return null;

  return { $set: { failed_login_count: 0, locked_until: null } };
}

/**
 * Record one failed password attempt against a user row.
 *
 * Two writes, in this order, and the order is the point:
 *   1. `$inc` the counter and read the result back atomically, so parallel
 *      attempts cannot lose each other's increments.
 *   2. If the authoritative new count reached the threshold, arm the cooldown.
 *
 * Failing between the two leaves a counter that is high but no cooldown — the
 * next attempt is still allowed, and its own increment arms the lock. That is
 * the recoverable direction (an extra guess, never a lock nobody asked for),
 * which is the ordering rule the rest of this codebase follows for
 * non-transactional sequences.
 *
 * A single-write alternative exists — an aggregation-pipeline update computing
 * both fields server-side with `$cond` — but it trades an easily-read `$inc`
 * for an expression that is much harder to verify, for one saved round-trip on
 * a path that only runs when someone typed the wrong password.
 *
 * @param {import("mongoose").Model} Model - The User model.
 * @param {Object} user - The user row that failed. Only `id` is used.
 * @param {number} [now]
 * @returns {Promise<{ failed_login_count: number, locked: boolean }>}
 */
async function recordFailedAttempt(Model, user, now = Date.now()) {
  const updated = await Model.findOneAndUpdate(
    { id: user.id },
    incrementUpdate(),
    { new: true, projection: { _id: 0, failed_login_count: 1 } }
  );

  // The row was deleted between the login read and this write. Nothing to
  // count against, and nothing to lock.
  if (!updated) {
    return { failed_login_count: 0, locked: false };
  }

  const count = Number(updated.failed_login_count) || 0;
  const lockout = lockoutUpdate(count, now);
  if (lockout) {
    await Model.updateOne({ id: user.id }, lockout);
  }

  return { failed_login_count: count, locked: lockout !== null };
}

/**
 * Clear the throttle on a user row after a correct password. No-ops when there
 * is nothing to clear. Never touches `is_locked`.
 *
 * @param {import("mongoose").Model} Model - The User model.
 * @param {Object} user - The user row, read before the password check.
 * @returns {Promise<boolean>} Whether a write was issued.
 */
async function clearThrottle(Model, user) {
  const reset = successReset(user);
  if (!reset) return false;
  await Model.updateOne({ id: user.id }, reset);
  return true;
}

module.exports = {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  FIELDS,
  lockedUntilMs,
  formatRetryAfter,
  isThrottled,
  throttleRejection,
  incrementUpdate,
  lockoutUpdate,
  successReset,
  recordFailedAttempt,
  clearThrottle,
};
