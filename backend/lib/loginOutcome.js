/**
 * The decision half of POST /api/auth/login: given the user row, whether the
 * password matched, and the clock, decide the HTTP answer and the single write
 * (if any) the handler should perform.
 *
 * Extracted for the reason the rest of backend/lib exists — there is no
 * supertest harness in this project (see ARCHITECTURE.md, "Known gaps"), so
 * the *ordering* of these checks is only testable if it lives somewhere pure.
 * The ordering matters:
 *
 *   429 cooldown   before anything else, and before bcrypt in the caller
 *   401 bad password  increments the counter, may arm the cooldown
 *   403 is_locked  AFTER the password check, so an administrator-locked
 *                  account still costs an attacker a full bcrypt compare and
 *                  cannot be distinguished from a live one by timing
 *   200 success    clears the cooldown
 *
 * Note the 403 deliberately comes last. Checking `is_locked` before the
 * compare would reintroduce exactly the timing oracle lib/passwordVerify.js
 * closes: a fast 403 for locked accounts versus a slow 401 for everything
 * else would enumerate them.
 *
 * `action` names the throttle bookkeeping the caller must then perform, or
 * null when there is none. Both actions are carried out by lib/loginThrottle.js
 * (`recordFailedAttempt` / `clearThrottle`), which writes only
 * failed_login_count and locked_until, so no outcome here can create or clear a
 * permanent `is_locked`.
 */

const { throttleRejection } = require("./loginThrottle");

/** The throttle bookkeeping the caller must perform, if any. */
const RECORD_FAILURE = "record_failure";
const CLEAR_THROTTLE = "clear_throttle";

/** The message for a wrong password. Identical whether or not the email exists. */
const INVALID_CREDENTIALS = "Invalid credentials";

/** The message for an administrator's permanent lock. */
const ACCOUNT_LOCKED = "Account is locked";

/**
 * Resolve a login attempt.
 *
 * @param {Object} params
 * @param {Object|null} params.user - The user row, or null when no email matched.
 * @param {boolean} params.passwordMatches - Result of lib/passwordVerify.js.
 *   Must be computed on BOTH paths (user present or not) before calling this.
 * @param {number} [params.now] - Epoch ms, injectable for tests.
 * @returns {{ ok: boolean, status: number, detail: string|null,
 *   action: "record_failure"|"clear_throttle"|null }}
 */
function resolveLoginAttempt({ user, passwordMatches, now = Date.now() }) {
  // Defensive re-check. The caller already rejects a cooldown before spending
  // the bcrypt compare; repeating it here means the rule holds even if a
  // future caller forgets, and costs nothing.
  const throttled = throttleRejection(user, now);
  if (throttled) {
    return { ok: false, status: 429, detail: throttled.detail, action: null };
  }

  if (!passwordMatches) {
    return {
      ok: false,
      status: 401,
      detail: INVALID_CREDENTIALS,
      // No user, no row to count against. The response is identical either
      // way, so this is not observable.
      action: user ? RECORD_FAILURE : null,
    };
  }

  // The password was right, so the throttle is cleared regardless of what
  // happens next. An administrator's lock is a separate decision below and
  // does not stop the counter being reset.
  if (user.is_locked) {
    return { ok: false, status: 403, detail: ACCOUNT_LOCKED, action: CLEAR_THROTTLE };
  }

  return { ok: true, status: 200, detail: null, action: CLEAR_THROTTLE };
}

module.exports = {
  resolveLoginAttempt,
  INVALID_CREDENTIALS,
  ACCOUNT_LOCKED,
  RECORD_FAILURE,
  CLEAR_THROTTLE,
};
