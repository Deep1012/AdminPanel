/**
 * Constant-work password verification for the login handler.
 *
 * THE TIMING ORACLE THIS CLOSES
 * -----------------------------
 * The login handler used to read:
 *
 *   if (!user || !(await bcrypt.compare(password, user.password))) { 401 }
 *
 * `||` short-circuits, so when no user matched the email the bcrypt compare
 * never ran. bcrypt at cost 10 takes roughly 50-150ms; the Mongo lookup takes
 * single-digit milliseconds. An unauthenticated attacker could therefore
 * separate "email exists" from "email does not exist" purely from response
 * latency, turning the login endpoint into a user-enumeration oracle — and
 * both branches return the same 401 body, so the message alone was not enough.
 *
 * `verifyPassword` always performs exactly one bcrypt compare, against the
 * stored hash when there is one and against DUMMY_HASH when there is not, so
 * both paths cost the same.
 *
 * WHY THE DUMMY HASH IS SAFE HERE
 * -------------------------------
 * It is computed once when the module is first required. That is a constant,
 * not mutable state, so it does not violate the serverless rule in
 * ARCHITECTURE.md: nothing writes to it, and a fresh instance simply computes
 * the same kind of value again. It costs one bcrypt hash (~50-150ms) per cold
 * start, paid once per instance rather than once per request.
 *
 * It is hashed from a random value generated at load, so it is not a
 * credential: no password can be known to match it. The `false` return for an
 * absent hash is forced regardless of the compare result, so even a
 * hypothetical match cannot authenticate.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/**
 * Same cost factor the real hashes use (routes/auth.js and routes/users.js
 * both call bcrypt.hash(password, 10)). The two compares must do equal work,
 * so this must track that number.
 */
const BCRYPT_ROUNDS = 10;

/**
 * Hash of a random string, computed once at module load. Never a valid
 * credential.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), BCRYPT_ROUNDS);

/**
 * Compare a submitted password against a stored hash, doing the same amount of
 * work whether or not a stored hash exists.
 *
 * @param {string} password - Submitted password. Callers must already have
 *   rejected non-strings (a Mongo operator object must never reach here).
 * @param {string|null|undefined} storedHash - The user's bcrypt hash, or
 *   null/undefined when no user matched.
 * @param {Object} [deps] - Injection seam for tests.
 * @param {(a: string, b: string) => Promise<boolean>} [deps.compare]
 * @param {string} [deps.dummyHash]
 * @returns {Promise<boolean>} True only when a real hash was supplied and matched.
 */
async function verifyPassword(password, storedHash, deps = {}) {
  const compare = deps.compare || bcrypt.compare;
  const dummyHash = deps.dummyHash || DUMMY_HASH;

  const hasRealHash = typeof storedHash === "string" && storedHash.length > 0;
  const hashToCompare = hasRealHash ? storedHash : dummyHash;

  // Runs on both paths. Its result is discarded on the no-user path, but the
  // work — and therefore the latency — is identical.
  const matched = await compare(typeof password === "string" ? password : "", hashToCompare);

  return hasRealHash && matched === true;
}

module.exports = { verifyPassword, BCRYPT_ROUNDS, DUMMY_HASH };
