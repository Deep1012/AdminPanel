const {
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
} = require("../loginThrottle");

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);

/** Plain user row, shaped the way middleware/auth.js and routes/auth.js see one. */
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

/** Every field name an update object touches, with $inc/$set flattened. */
function touchedFields(update) {
  if (!update) return [];
  return Object.keys(update).flatMap((op) => Object.keys(update[op]));
}

describe("lockedUntilMs", () => {
  it("returns null for an unset lock", () => {
    expect(lockedUntilMs(null)).toBeNull();
    expect(lockedUntilMs(undefined)).toBeNull();
    expect(lockedUntilMs("")).toBeNull();
  });

  it("reads a Date", () => {
    expect(lockedUntilMs(new Date(NOW))).toBe(NOW);
  });

  it("reads an ISO string, because most dates in this project are stored as strings", () => {
    expect(lockedUntilMs(new Date(NOW).toISOString())).toBe(NOW);
  });

  it("returns null rather than NaN for unparseable junk", () => {
    expect(lockedUntilMs("not-a-date")).toBeNull();
    expect(lockedUntilMs({})).toBeNull();
  });
});

describe("formatRetryAfter", () => {
  it("reports seconds under a minute", () => {
    expect(formatRetryAfter(1000)).toBe("1 second");
    expect(formatRetryAfter(30000)).toBe("30 seconds");
  });

  it("reports minutes at or above a minute", () => {
    expect(formatRetryAfter(60000)).toBe("1 minute");
    expect(formatRetryAfter(LOCKOUT_MS)).toBe("15 minutes");
  });

  it("rounds up, so it never invites a retry before the lock expires", () => {
    expect(formatRetryAfter(61000)).toBe("2 minutes");
    expect(formatRetryAfter(1)).toBe("1 second");
  });
});

describe("isThrottled", () => {
  it("is false with no lock set", () => {
    expect(isThrottled(fakeUser(), NOW)).toEqual({ throttled: false, retryAfterMs: 0 });
  });

  it("is false for a null user (no such email)", () => {
    expect(isThrottled(null, NOW).throttled).toBe(false);
  });

  it("is true while the lock is in the future", () => {
    const user = fakeUser({ locked_until: new Date(NOW + 5000) });
    expect(isThrottled(user, NOW)).toEqual({ throttled: true, retryAfterMs: 5000 });
  });

  it("expires on its own once the deadline passes", () => {
    const user = fakeUser({ locked_until: new Date(NOW - 1) });
    expect(isThrottled(user, NOW).throttled).toBe(false);
  });

  it("treats the exact deadline as expired", () => {
    const user = fakeUser({ locked_until: new Date(NOW) });
    expect(isThrottled(user, NOW).throttled).toBe(false);
  });
});

describe("throttleRejection", () => {
  it("returns null when the account may attempt a login", () => {
    expect(throttleRejection(fakeUser(), NOW)).toBeNull();
    expect(throttleRejection(null, NOW)).toBeNull();
  });

  it("returns 429 with the remaining cooldown", () => {
    const user = fakeUser({ locked_until: new Date(NOW + LOCKOUT_MS) });
    const rejection = throttleRejection(user, NOW);

    expect(rejection.status).toBe(429);
    expect(rejection.detail).toContain("15 minutes");
    expect(rejection.retry_after_seconds).toBe(900);
  });

  it("uses the { detail } envelope the whole API uses", () => {
    const user = fakeUser({ locked_until: new Date(NOW + 1000) });
    expect(Object.keys(throttleRejection(user, NOW))).toEqual(
      expect.arrayContaining(["status", "detail"])
    );
  });

  it("never reveals that the account exists, is locked, or who owns it", () => {
    const user = fakeUser({ locked_until: new Date(NOW + 1000), email: "ceo@crm.com", username: "ceo" });
    const { detail } = throttleRejection(user, NOW);

    expect(detail).not.toMatch(/account/i);
    expect(detail).not.toMatch(/exist/i);
    expect(detail).not.toMatch(/locked/i);
    expect(detail).not.toContain("ceo");
    expect(detail).toMatch(/failed login attempts/i);
  });

  it("produces an identical message for every account with the same cooldown", () => {
    const a = throttleRejection(fakeUser({ id: "a", email: "a@x.com", locked_until: new Date(NOW + LOCKOUT_MS) }), NOW);
    const b = throttleRejection(fakeUser({ id: "b", email: "b@x.com", locked_until: new Date(NOW + LOCKOUT_MS) }), NOW);
    expect(a.detail).toBe(b.detail);
  });
});

describe("incrementUpdate", () => {
  it("increments atomically with $inc rather than writing a computed total", () => {
    expect(incrementUpdate()).toEqual({ $inc: { failed_login_count: 1 } });
  });

  it("returns a fresh object each time, so no caller can mutate a shared one", () => {
    const first = incrementUpdate();
    first.$inc.failed_login_count = 99;
    expect(incrementUpdate()).toEqual({ $inc: { failed_login_count: 1 } });
  });
});

describe("lockoutUpdate", () => {
  it("does not lock below the threshold", () => {
    for (let count = 0; count < MAX_FAILED_ATTEMPTS; count += 1) {
      expect(lockoutUpdate(count, NOW)).toBeNull();
    }
  });

  it("locks at the threshold, for exactly the cooldown length", () => {
    const update = lockoutUpdate(MAX_FAILED_ATTEMPTS, NOW);
    expect(update.$set.locked_until).toBeInstanceOf(Date);
    expect(update.$set.locked_until.getTime()).toBe(NOW + LOCKOUT_MS);
  });

  it("re-arms the cooldown on every further failure past the threshold", () => {
    expect(lockoutUpdate(MAX_FAILED_ATTEMPTS + 7, NOW).$set.locked_until.getTime())
      .toBe(NOW + LOCKOUT_MS);
  });

  it("treats a missing or junk count as zero rather than locking", () => {
    expect(lockoutUpdate(undefined, NOW)).toBeNull();
    expect(lockoutUpdate(null, NOW)).toBeNull();
    expect(lockoutUpdate(NaN, NOW)).toBeNull();
  });

  it("the lock it writes is what isThrottled then reads back as active", () => {
    const update = lockoutUpdate(MAX_FAILED_ATTEMPTS, NOW);
    const locked = fakeUser({ failed_login_count: MAX_FAILED_ATTEMPTS, locked_until: update.$set.locked_until });

    expect(isThrottled(locked, NOW).throttled).toBe(true);
    expect(isThrottled(locked, NOW + LOCKOUT_MS).throttled).toBe(false);
  });

  it("decides from the POST-increment count, which is why it takes a number and not a user", () => {
    // Five parallel attempts all read failed_login_count 0. Deciding from
    // `read + 1` would give 1 for every one of them and arm nothing, even
    // though the row ends up at 5. Passing the value the database reported
    // back is what makes the lock fire.
    expect(lockoutUpdate(0 + 1, NOW)).toBeNull();
    expect(lockoutUpdate(5, NOW)).not.toBeNull();
  });
});

describe("successReset", () => {
  it("returns null for a clean account, so a normal login costs no extra write", () => {
    expect(successReset(fakeUser())).toBeNull();
    expect(successReset(fakeUser({ failed_login_count: 0, locked_until: null }))).toBeNull();
  });

  it("clears the counter after earlier failures", () => {
    expect(successReset(fakeUser({ failed_login_count: 3 }))).toEqual({
      $set: { failed_login_count: 0, locked_until: null },
    });
  });

  it("clears a stale cooldown even when the counter is somehow zero", () => {
    expect(successReset(fakeUser({ failed_login_count: 0, locked_until: new Date(NOW) })))
      .toEqual({ $set: { failed_login_count: 0, locked_until: null } });
  });

  it("leaves the account able to log in again", () => {
    const reset = successReset(fakeUser({
      failed_login_count: MAX_FAILED_ATTEMPTS,
      locked_until: new Date(NOW + LOCKOUT_MS),
    }));
    const cleared = { ...fakeUser(), ...reset.$set };

    expect(throttleRejection(cleared, NOW)).toBeNull();
    expect(successReset(cleared)).toBeNull(); // nothing left to clear: the counter really is back to 0
    // and one fresh failure is nowhere near re-arming the cooldown
    expect(failedAttemptUpdates(cleared, NOW)).toEqual([{ $inc: { failed_login_count: 1 } }]);
  });
});

/**
 * The two writes recordFailedAttempt performs, composed for assertions.
 *
 * The production flow deliberately keeps these apart: incrementUpdate() always
 * $incs, and lockoutUpdate() decides the cooldown from the count the DATABASE
 * returned after the increment — never from `read + 1`, which is what lets a
 * burst of parallel guesses each see 0 and none arm the lock. These tests have
 * a single user and no concurrency, so composing them here is faithful.
 */
function failedAttemptUpdates(user, now) {
  const countAfter = (Number(user && user.failed_login_count) || 0) + 1;
  return [incrementUpdate(), lockoutUpdate(countAfter, now)].filter(Boolean);
}

describe("independence from the admin-controlled is_locked flag", () => {
  it("declares exactly the two throttle fields as its writable surface", () => {
    expect(FIELDS).toEqual(["failed_login_count", "locked_until"]);
    expect(FIELDS).not.toContain("is_locked");
  });

  it("no update this module emits ever mentions is_locked", () => {
    const updates = [
      ...failedAttemptUpdates(fakeUser(), NOW),
      ...failedAttemptUpdates(fakeUser({ failed_login_count: MAX_FAILED_ATTEMPTS - 1 }), NOW),
      ...failedAttemptUpdates(fakeUser({ failed_login_count: 99 }), NOW),
      successReset(fakeUser({ failed_login_count: 2 })),
      successReset(fakeUser({ locked_until: new Date(NOW + 1) })),
    ];

    for (const update of updates) {
      const fields = touchedFields(update);
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(FIELDS).toContain(field);
      }
      expect(JSON.stringify(update)).not.toContain("is_locked");
    }
  });

  it("a throttle lockout does not set is_locked, so no admin is needed to undo it", () => {
    const user = fakeUser({ failed_login_count: MAX_FAILED_ATTEMPTS - 1 });
    const update = lockoutUpdate(MAX_FAILED_ATTEMPTS, NOW); // the attempt that reaches the threshold
    const after = {
      ...user,
      failed_login_count: MAX_FAILED_ATTEMPTS,
      ...(update.$set || {}),
    };

    expect(after.is_locked).toBe(false);
    // And it lifts itself once the cooldown elapses.
    expect(isThrottled(after, NOW + LOCKOUT_MS + 1).throttled).toBe(false);
  });

  it("a successful login cannot clear an administrator's permanent lock", () => {
    const adminLocked = fakeUser({
      is_locked: true,
      failed_login_count: 4,
      locked_until: new Date(NOW + LOCKOUT_MS),
    });
    const reset = successReset(adminLocked);
    const after = { ...adminLocked, ...reset.$set };

    expect(after.is_locked).toBe(true);
    expect(after.failed_login_count).toBe(0);
    expect(after.locked_until).toBeNull();
  });

  it("waiting out a cooldown does not shorten an admin lock", () => {
    const adminLocked = fakeUser({ is_locked: true, locked_until: new Date(NOW + 1000) });
    expect(isThrottled(adminLocked, NOW + 100000).throttled).toBe(false);
    expect(adminLocked.is_locked).toBe(true); // still the administrator's call, unchanged
  });

  it("reads nothing from is_locked: the throttle verdict is the same either way", () => {
    const unlocked = fakeUser({ locked_until: new Date(NOW + 1000), is_locked: false });
    const locked = fakeUser({ locked_until: new Date(NOW + 1000), is_locked: true });

    expect(throttleRejection(unlocked, NOW)).toEqual(throttleRejection(locked, NOW));
    expect(failedAttemptUpdates(unlocked, NOW)).toEqual(failedAttemptUpdates(locked, NOW));
  });
});

describe("serverless safety", () => {
  it("holds no state between calls: identical input gives identical output", () => {
    const user = fakeUser({ failed_login_count: 2 });
    expect(failedAttemptUpdates(user, NOW)).toEqual(failedAttemptUpdates(user, NOW));
    expect(lockoutUpdate(MAX_FAILED_ATTEMPTS, NOW)).toEqual(lockoutUpdate(MAX_FAILED_ATTEMPTS, NOW));
  });

  it("does not mutate the user it is handed", () => {
    const user = fakeUser({ failed_login_count: 2, locked_until: null });
    const snapshot = JSON.stringify(user);

    failedAttemptUpdates(user, NOW);
    successReset(user);
    throttleRejection(user, NOW);
    isThrottled(user, NOW);

    expect(JSON.stringify(user)).toBe(snapshot);
  });
});
