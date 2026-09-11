const bcrypt = require("bcryptjs");
const { verifyPassword, BCRYPT_ROUNDS, DUMMY_HASH } = require("../passwordVerify");

/**
 * These tests use real bcrypt for the correctness cases (a handful of cost-10
 * hashes, which is why the hashes are computed once in beforeAll) and an
 * injected fake `compare` for the timing/call-count cases, where what matters
 * is *that* a compare happened, not how long it took. Measuring wall-clock
 * latency in a unit test would be flaky on shared CI runners.
 */

const PASSWORD = "correct horse battery staple";
let realHash;

beforeAll(() => {
  realHash = bcrypt.hashSync(PASSWORD, BCRYPT_ROUNDS);
});

/** Records every (password, hash) pair handed to bcrypt. */
function spyCompare(result) {
  const calls = [];
  const compare = async (password, hash) => {
    calls.push({ password, hash });
    return typeof result === "function" ? result(password, hash) : result;
  };
  return { compare, calls };
}

describe("verifyPassword - correctness", () => {
  it("accepts the right password against a real hash", async () => {
    await expect(verifyPassword(PASSWORD, realHash)).resolves.toBe(true);
  });

  it("rejects the wrong password against a real hash", async () => {
    await expect(verifyPassword("wrong", realHash)).resolves.toBe(false);
  });

  it("rejects when there is no stored hash at all", async () => {
    await expect(verifyPassword(PASSWORD, null)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, undefined)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, "")).resolves.toBe(false);
  });

  it("rejects a non-string stored hash rather than throwing", async () => {
    await expect(verifyPassword(PASSWORD, { $ne: null })).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, 12345)).resolves.toBe(false);
  });

  it("rejects a non-string password rather than throwing", async () => {
    await expect(verifyPassword(undefined, realHash)).resolves.toBe(false);
    await expect(verifyPassword({ $ne: null }, realHash)).resolves.toBe(false);
  });
});

describe("verifyPassword - constant work", () => {
  it("performs exactly one compare when the user exists", async () => {
    const { compare, calls } = spyCompare(true);
    await verifyPassword(PASSWORD, realHash, { compare });
    expect(calls).toHaveLength(1);
    expect(calls[0].hash).toBe(realHash);
  });

  it("performs exactly one compare when the user does NOT exist - the old code performed none", async () => {
    const { compare, calls } = spyCompare(false);
    await verifyPassword(PASSWORD, null, { compare, dummyHash: "$2a$10$dummy" });
    expect(calls).toHaveLength(1);
    expect(calls[0].hash).toBe("$2a$10$dummy");
  });

  it("compares against the dummy hash, not against a placeholder short-circuit", async () => {
    const { compare, calls } = spyCompare(false);
    await verifyPassword(PASSWORD, undefined, { compare });
    expect(calls[0].hash).toBe(DUMMY_HASH);
  });

  it("does the same number of compares on both paths", async () => {
    const present = spyCompare(false);
    const absent = spyCompare(false);

    await verifyPassword("guess", realHash, { compare: present.compare });
    await verifyPassword("guess", null, { compare: absent.compare });

    expect(present.calls).toHaveLength(absent.calls.length);
  });

  it("the short-circuiting original skipped bcrypt for unknown emails", async () => {
    // The exact expression this module replaces, kept as a regression witness.
    const { compare, calls } = spyCompare(true);
    const user = null;
    /* eslint-disable-next-line no-unused-expressions */
    const authenticated = !(!user || !(await compare("guess", user && user.password)));

    expect(authenticated).toBe(false);
    expect(calls).toHaveLength(0); // <- the oracle: zero bcrypt work, so a fast 401

    // The replacement always pays the bcrypt cost.
    const fixed = spyCompare(true);
    await verifyPassword("guess", null, { compare: fixed.compare });
    expect(fixed.calls).toHaveLength(1);
  });

  it("forces false for an absent hash even if the compare claims a match", async () => {
    // Defence in depth: a dummy-hash "match" must never authenticate.
    const { compare } = spyCompare(true);
    await expect(verifyPassword("anything", null, { compare })).resolves.toBe(false);
  });
});

describe("DUMMY_HASH", () => {
  it("is a bcrypt hash at the same cost factor as the real ones", () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(DUMMY_HASH.split("$")[2]).toBe(String(BCRYPT_ROUNDS).padStart(2, "0"));
  });

  it("tracks the cost factor the login and user routes hash with", () => {
    expect(BCRYPT_ROUNDS).toBe(10);
  });

  it("is not a credential: it does not match any obvious guess", () => {
    for (const guess of ["", "password", "admin123", "dummy", "placeholder"]) {
      expect(bcrypt.compareSync(guess, DUMMY_HASH)).toBe(false);
    }
  });

  it("is a constant, not mutable state: re-reading the module gives the same value", () => {
    const again = require("../passwordVerify").DUMMY_HASH;
    expect(again).toBe(DUMMY_HASH);
  });
});
