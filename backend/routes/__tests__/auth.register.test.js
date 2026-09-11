/**
 * Route-level regression cover for the Sept 2026 security fix.
 *
 * POST /api/auth/register had no authenticate or adminRequired guard and took
 * `role` straight from the body, so anyone on the internet could POST
 * {role:"admin"} to the live URL and get an admin account. These tests run the
 * REAL middleware chain (see runRoute.js) — mocking authenticate away would
 * prove nothing about whether the guard exists.
 */

const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "route-test-secret";

const mockUsers = {
  "admin-1": { id: "admin-1", username: "admin", role: "admin", is_locked: false },
  "user-1": { id: "user-1", username: "clerk", role: "user", is_locked: false },
  "locked-1": { id: "locked-1", username: "gone", role: "admin", is_locked: true },
};
const mockCreate = jest.fn(async (doc) => ({ ...doc }));

jest.mock("../../models/User", () => ({
  findOne: jest.fn((filter) => {
    const found = filter && filter.id ? mockUsers[filter.id] : null;
    const doc = found ? { ...found, toObject: () => ({ ...found }) } : null;
    return {
      // authenticate: User.findOne({ id }).select(...)
      select: async () => doc,
      // register handler: User.findOne({ email }).lean() — no existing account
      lean: async () => null,
    };
  }),
  create: (...args) => mockCreate(...args),
}));
jest.mock("../../lib/activityLogger", () => ({ logActivity: async () => {} }));

const { runRoute, findRoute } = require("./runRoute");
const router = require("../auth");

const tokenFor = (userId) => jwt.sign({ user_id: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
const register = (body, token) =>
  runRoute(router, "POST", "/register", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  });

const EXPLOIT = { username: "attacker", email: "a@evil.test", password: "hunter22", role: "admin" };

beforeEach(() => mockCreate.mockClear());

describe("POST /api/auth/register — the admin-creation hole stays closed", () => {
  it("rejects the exact exploit payload with no token, and never reaches the handler", async () => {
    const res = await register(EXPLOIT);

    expect(res.statusCode).toBe(401);
    expect(res.reachedHandler).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a forged or garbage token", async () => {
    const res = await register(EXPLOIT, "not-a-jwt");

    expect(res.statusCode).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const forged = jwt.sign({ user_id: "admin-1" }, "some-other-secret");
    const res = await register(EXPLOIT, forged);

    expect(res.statusCode).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an authenticated non-admin", async () => {
    const res = await register(EXPLOIT, tokenFor("user-1"));

    expect(res.statusCode).toBe(403);
    expect(res.body.detail).toBe("Admin access required");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an admin whose account is locked", async () => {
    const res = await register(EXPLOIT, tokenFor("locked-1"));

    expect(res.statusCode).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a role outside the allowlist even from a real admin", async () => {
    const res = await register({ ...EXPLOIT, role: "superadmin" }, tokenFor("admin-1"));

    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toMatch(/role must be one of: admin, user/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects non-string credentials before they reach a Mongoose filter", async () => {
    const res = await register({ ...EXPLOIT, email: { $ne: null } }, tokenFor("admin-1"));

    expect(res.statusCode).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("still lets a real admin create a user, including another admin", async () => {
    const res = await register({ ...EXPLOIT, email: "new@crm.test" }, tokenFor("admin-1"));

    expect(res.statusCode).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ email: "new@crm.test", role: "admin" });
    expect(mockCreate.mock.calls[0][0].password).not.toBe("hunter22"); // hashed
  });
});

describe("POST /api/auth/login stays public", () => {
  it("is not behind authenticate, or nobody could ever sign in", () => {
    const names = findRoute(router, "POST", "/login").stack.map((l) => l.handle.name);
    expect(names).not.toContain("authenticate");
    expect(names).not.toContain("adminRequired");
  });
});
