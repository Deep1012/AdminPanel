/**
 * Route-level regression cover for the two Sept 2026 cron fixes:
 *
 *  1. The secret check compared against `Bearer ${process.env.CRON_SECRET}`,
 *     which is the literal "Bearer undefined" when the variable is unset — so
 *     sending that header passed. It must fail closed.
 *  2. The route was POST-only while Vercel Cron issues GET, so the monthly
 *     backup silently 404'd. It must answer both.
 */

const mockBackupCreate = jest.fn(async (doc) => ({ ...doc }));

jest.mock("../../models/Purchase", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/PrintingJob", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/Production", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/Dispatch", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/PurchaseOrder", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/Brand", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/Size", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/Customer", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/User", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/Backup", () => ({
  create: (...args) => mockBackupCreate(...args),
  find: () => ({ sort: () => ({ skip: () => ({ lean: async () => [] }) }) }),
  deleteMany: async () => ({}),
}));
jest.mock("../../lib/activityLogger", () => ({ logActivity: async () => {} }));

const { runRoute, findRoute } = require("./runRoute");
const router = require("../backup");

const SECRET = "cron-route-test-secret";
const cron = (method, authorization) =>
  runRoute(router, method, "/cron", { headers: authorization === undefined ? {} : { authorization } });

const ORIGINAL = process.env.CRON_SECRET;
let errorSpy;
beforeEach(() => {
  mockBackupCreate.mockClear();
  process.env.CRON_SECRET = SECRET;
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

describe("GET/POST /api/backups/cron", () => {
  it("is registered for GET, which is what Vercel Cron actually sends", () => {
    expect(() => findRoute(router, "GET", "/cron")).not.toThrow();
    expect(() => findRoute(router, "POST", "/cron")).not.toThrow();
  });

  it("fails closed when CRON_SECRET is unset, so 'Bearer undefined' no longer opens it", async () => {
    delete process.env.CRON_SECRET;
    const res = await cron("GET", "Bearer undefined");

    expect(res.statusCode).toBe(500);
    expect(res.body.detail).toBe("Server misconfigured");
    expect(mockBackupCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["no header", undefined],
    ["the literal 'Bearer undefined'", "Bearer undefined"],
    ["a wrong secret of the same length", `Bearer ${"x".repeat(SECRET.length)}`],
    ["a wrong secret of a different length", "Bearer short"],
    ["the secret without the Bearer prefix", SECRET],
  ])("rejects %s with 401", async (_label, header) => {
    const res = await cron("GET", header);

    expect(res.statusCode).toBe(401);
    expect(mockBackupCreate).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"])("runs the monthly backup via %s with the right secret", async (method) => {
    const res = await cron(method, `Bearer ${SECRET}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Monthly backup created");
    expect(mockBackupCreate).toHaveBeenCalledTimes(1);
    expect(mockBackupCreate.mock.calls[0][0].type).toBe("monthly");
  });
});
