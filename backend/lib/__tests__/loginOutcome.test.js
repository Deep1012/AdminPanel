const {
  resolveLoginAttempt,
  INVALID_CREDENTIALS,
  ACCOUNT_LOCKED,
  RECORD_FAILURE,
  CLEAR_THROTTLE,
} = require("../loginOutcome");
const {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  lockoutUpdate,
  successReset,
  recordFailedAttempt,
  clearThrottle,
} = require("../loginThrottle");

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);

function fakeUser(overrides = {}) {
  return {
    id: "u-1",
    username: "operator",
    email: "operator@crm.com",
    password: "$2a$10$hash",
    role: "user",
    is_locked: false,
    failed_login_count: 0,
    locked_until: null,
    ...overrides,
  };
}

/**
 * Fake User model mirroring the two calls the login handler makes:
 * findOne({ email }) and updateOne({ id }, update). Applies $inc/$set to the
 * in-memory row the way Mongo would, so a sequence of attempts can be replayed
 * against it without a database.
 */
function fakeUserCollection(rows) {
  const store = rows.map((row) => ({ ...row }));
  const updates = [];

  return {
    store,
    updates,

    async findOne({ email }) {
      const found = store.find((row) => row.email === email);
      return found ? { ...found } : null;
    },

    // recordFailedAttempt $incs and reads the authoritative count back in one
    // atomic step; the fake has to offer the same primitive or the parallel-
    // guess test would not be exercising the thing it claims to.
    async findOneAndUpdate({ id }, update) {
      await this.updateOne({ id }, update);
      const row = store.find((r) => r.id === id);
      return row ? { ...row } : null;
    },

    async updateOne({ id }, update) {
      updates.push({ id, update });
      const row = store.find((r) => r.id === id);
      if (!row) return { matchedCount: 0 };

      if (update.$inc) {
        for (const [field, delta] of Object.entries(update.$inc)) {
          row[field] = (Number(row[field]) || 0) + delta;
        }
      }
      if (update.$set) {
        for (const [field, value] of Object.entries(update.$set)) {
          row[field] = value;
        }
      }
      return { matchedCount: 1 };
    },
  };
}

/**
 * The login handler's sequence, reproduced against the fakes: look up, resolve,
 * apply the write, answer. Returns the status so a caller can drive a whole
 * attack sequence.
 */
async function attemptLogin(Users, { email, passwordMatches, now }) {
  const user = await Users.findOne({ email });
  const outcome = resolveLoginAttempt({ user, passwordMatches, now });
  if (outcome.action === RECORD_FAILURE) {
    await recordFailedAttempt(Users, user, now);
  } else if (outcome.action === CLEAR_THROTTLE) {
    await clearThrottle(Users, user);
  }
  return outcome;
}

describe("resolveLoginAttempt - wrong password", () => {
  it("answers 401 with a message that does not say whether the email exists", () => {
    const present = resolveLoginAttempt({ user: fakeUser(), passwordMatches: false, now: NOW });
    const absent = resolveLoginAttempt({ user: null, passwordMatches: false, now: NOW });

    expect(present.status).toBe(401);
    expect(absent.status).toBe(401);
    expect(present.detail).toBe(INVALID_CREDENTIALS);
    expect(absent.detail).toBe(present.detail);
  });

  it("increments the counter for a real account", () => {
    const outcome = resolveLoginAttempt({ user: fakeUser(), passwordMatches: false, now: NOW });
    expect(outcome.action).toBe(RECORD_FAILURE);
  });

  it("has nothing to write for an unknown email", () => {
    expect(resolveLoginAttempt({ user: null, passwordMatches: false, now: NOW }).action).toBeNull();
  });

  it("arms the cooldown on the attempt that reaches the threshold", () => {
    const user = fakeUser({ failed_login_count: MAX_FAILED_ATTEMPTS - 1 });
    const outcome = resolveLoginAttempt({ user, passwordMatches: false, now: NOW });

    expect(outcome.status).toBe(401); // still a 401, not yet a 429
    expect(outcome.action).toBe(RECORD_FAILURE);
    // Arming the cooldown is recordFailedAttempt's job, from the count the DB
    // returns after the $inc — never from this read + 1.
    expect(lockoutUpdate(MAX_FAILED_ATTEMPTS, NOW).$set.locked_until.getTime()).toBe(NOW + LOCKOUT_MS);
  });
});

describe("resolveLoginAttempt - cooldown", () => {
  it("answers 429 while the cooldown is active, without touching the row", () => {
    const user = fakeUser({ failed_login_count: MAX_FAILED_ATTEMPTS, locked_until: new Date(NOW + LOCKOUT_MS) });
    const outcome = resolveLoginAttempt({ user, passwordMatches: false, now: NOW });

    expect(outcome.status).toBe(429);
    expect(outcome.action).toBeNull();
    expect(outcome.detail).toMatch(/15 minutes/);
  });

  it("answers 429 even when the password is correct - the cooldown outranks it", () => {
    const user = fakeUser({ locked_until: new Date(NOW + LOCKOUT_MS) });
    expect(resolveLoginAttempt({ user, passwordMatches: true, now: NOW }).status).toBe(429);
  });

  it("lets the account back in once the cooldown has elapsed", () => {
    const user = fakeUser({ failed_login_count: MAX_FAILED_ATTEMPTS, locked_until: new Date(NOW + LOCKOUT_MS) });
    const outcome = resolveLoginAttempt({ user, passwordMatches: true, now: NOW + LOCKOUT_MS + 1 });

    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(200);
  });
});

describe("resolveLoginAttempt - success", () => {
  it("answers 200 and writes nothing for a clean account", () => {
    const user = fakeUser();
    const outcome = resolveLoginAttempt({ user, passwordMatches: true, now: NOW });

    expect(outcome).toEqual({ ok: true, status: 200, detail: null, action: CLEAR_THROTTLE });
    // The outcome always names the clear on success; whether that costs a write
    // is successReset's call, and for an account with nothing to clear it is
    // null — so the ordinary login path issues no second write.
    expect(successReset(user)).toBeNull();
  });

  it("clears the counter after earlier failures", () => {
    const user = fakeUser({ failed_login_count: 3 });
    const outcome = resolveLoginAttempt({ user, passwordMatches: true, now: NOW });

    expect(outcome.ok).toBe(true);
    expect(outcome.action).toBe(CLEAR_THROTTLE);
  });
});

describe("resolveLoginAttempt - the admin-controlled is_locked flag", () => {
  it("answers 403 for a locked account whose password was correct", () => {
    const outcome = resolveLoginAttempt({ user: fakeUser({ is_locked: true }), passwordMatches: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(403);
    expect(outcome.detail).toBe(ACCOUNT_LOCKED);
  });

  it("answers 401, not 403, for a locked account whose password was wrong - no free oracle", () => {
    const outcome = resolveLoginAttempt({ user: fakeUser({ is_locked: true }), passwordMatches: false, now: NOW });
    expect(outcome.status).toBe(401);
  });

  it("no outcome ever writes is_locked", () => {
    const outcomes = [
      resolveLoginAttempt({ user: fakeUser(), passwordMatches: false, now: NOW }),
      resolveLoginAttempt({ user: fakeUser({ failed_login_count: 4 }), passwordMatches: false, now: NOW }),
      resolveLoginAttempt({ user: fakeUser({ failed_login_count: 3 }), passwordMatches: true, now: NOW }),
      resolveLoginAttempt({ user: fakeUser({ is_locked: true, failed_login_count: 2 }), passwordMatches: true, now: NOW }),
      resolveLoginAttempt({ user: fakeUser({ locked_until: new Date(NOW + 1) }), passwordMatches: true, now: NOW }),
    ];

    for (const outcome of outcomes) {
      // An outcome only ever names throttle bookkeeping; neither action can
      // reach is_locked, which is the administrator's to set and clear.
      expect([RECORD_FAILURE, CLEAR_THROTTLE, null]).toContain(outcome.action);
    }
  });

  it("the throttle verdict is identical for locked and unlocked accounts", () => {
    const unlocked = resolveLoginAttempt({ user: fakeUser({ failed_login_count: 2 }), passwordMatches: false, now: NOW });
    const locked = resolveLoginAttempt({ user: fakeUser({ is_locked: true, failed_login_count: 2 }), passwordMatches: false, now: NOW });

    expect(locked.status).toBe(unlocked.status);
    expect(locked.action).toBe(unlocked.action);
  });
});

describe("replayed against a fake User collection", () => {
  it("locks after five wrong passwords and refuses the sixth with 429", async () => {
    const Users = fakeUserCollection([fakeUser()]);

    for (let attempt = 1; attempt <= MAX_FAILED_ATTEMPTS; attempt += 1) {
      const outcome = await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: false, now: NOW });
      expect(outcome.status).toBe(401);
    }

    expect(Users.store[0].failed_login_count).toBe(MAX_FAILED_ATTEMPTS);
    expect(Users.store[0].locked_until).toBeInstanceOf(Date);

    // Sixth attempt, and a correct password does not help.
    expect((await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: false, now: NOW })).status).toBe(429);
    expect((await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: true, now: NOW })).status).toBe(429);

    // Nothing set the permanent lock.
    expect(Users.store[0].is_locked).toBe(false);
  });

  it("the cooldown expires on its own, with no administrator involved", async () => {
    const Users = fakeUserCollection([
      fakeUser({ failed_login_count: MAX_FAILED_ATTEMPTS, locked_until: new Date(NOW + LOCKOUT_MS) }),
    ]);

    expect((await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: true, now: NOW })).status).toBe(429);

    const later = await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: true, now: NOW + LOCKOUT_MS + 1 });
    expect(later.status).toBe(200);
    expect(Users.store[0].failed_login_count).toBe(0);
    expect(Users.store[0].locked_until).toBeNull();
  });

  it("a correct password mid-streak resets the counter, so the next failure starts from one", async () => {
    const Users = fakeUserCollection([fakeUser()]);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: false, now: NOW });
    }
    expect(Users.store[0].failed_login_count).toBe(4);

    expect((await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: true, now: NOW })).status).toBe(200);
    expect(Users.store[0].failed_login_count).toBe(0);

    await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: false, now: NOW });
    expect(Users.store[0].failed_login_count).toBe(1);
    expect(Users.store[0].locked_until).toBeNull();
  });

  it("an administrator's lock survives a correct password, and the throttle reset does not lift it", async () => {
    const Users = fakeUserCollection([fakeUser({ is_locked: true, failed_login_count: 3 })]);

    const outcome = await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: true, now: NOW });

    expect(outcome.status).toBe(403);
    expect(Users.store[0].is_locked).toBe(true); // still locked
    expect(Users.store[0].failed_login_count).toBe(0); // throttle cleared, lock not
  });

  it("waiting out a throttle cooldown does not lift an administrator's lock", async () => {
    const Users = fakeUserCollection([
      fakeUser({ is_locked: true, failed_login_count: MAX_FAILED_ATTEMPTS, locked_until: new Date(NOW + LOCKOUT_MS) }),
    ]);

    expect((await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: true, now: NOW })).status).toBe(429);
    expect((await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: true, now: NOW + LOCKOUT_MS + 1 })).status).toBe(403);
    expect(Users.store[0].is_locked).toBe(true);
  });

  it("an unknown email is answered 401 forever and writes nothing", async () => {
    const Users = fakeUserCollection([fakeUser()]);

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const outcome = await attemptLogin(Users, { email: "ghost@crm.com", passwordMatches: false, now: NOW });
      expect(outcome.status).toBe(401);
    }

    expect(Users.updates).toHaveLength(0);
    expect(Users.store[0].failed_login_count).toBe(0); // and no other account was touched
  });

  it("throttling one account does not throttle another", async () => {
    const Users = fakeUserCollection([
      fakeUser({ id: "u-1", email: "a@crm.com" }),
      fakeUser({ id: "u-2", email: "b@crm.com" }),
    ]);

    for (let attempt = 1; attempt <= MAX_FAILED_ATTEMPTS; attempt += 1) {
      await attemptLogin(Users, { email: "a@crm.com", passwordMatches: false, now: NOW });
    }

    expect((await attemptLogin(Users, { email: "a@crm.com", passwordMatches: false, now: NOW })).status).toBe(429);
    expect((await attemptLogin(Users, { email: "b@crm.com", passwordMatches: true, now: NOW })).status).toBe(200);
  });

  it("parallel guesses all land, because the counter moves with $inc", async () => {
    const Users = fakeUserCollection([fakeUser()]);

    // Five attempts resolved against the SAME read (count 0), the way separate
    // serverless instances would see it. A computed `failed_login_count = 1`
    // would leave the row at 1; $inc leaves it at 5.
    const user = await Users.findOne({ email: "operator@crm.com" });
    const outcomes = [0, 1, 2, 3, 4].map(() =>
      resolveLoginAttempt({ user, passwordMatches: false, now: NOW })
    );
    for (const outcome of outcomes) {
      expect(outcome.action).toBe(RECORD_FAILURE);
      await recordFailedAttempt(Users, user, NOW);
    }

    expect(Users.store[0].failed_login_count).toBe(5);
    expect((await attemptLogin(Users, { email: "operator@crm.com", passwordMatches: false, now: NOW })).status).toBe(429);
  });
});
