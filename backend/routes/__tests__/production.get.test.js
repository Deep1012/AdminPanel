/**
 * Route-level cover for GET /api/production.
 *
 * lib/__tests__/productionList.test.js covers the planning and fetching logic;
 * this asserts the wiring — that the route really answers with a bare array
 * when no pagination params are sent (the frontend has not been updated yet and
 * other pages read that array), with the envelope when they are, and with a
 * 400 { detail } naming the offending parameter.
 *
 * The Mongoose models are replaced with in-memory fakes, so no DB is needed.
 */

jest.mock("../../models/Production", () => require("./productionFakeStore").fakeProductionModel());
jest.mock("../../models/PrintingJob", () => ({ find: () => ({ lean: async () => [] }) }));
jest.mock("../../models/Brand", () => ({ find: () => ({ lean: async () => [] }), findOne: () => ({ lean: async () => null }) }));
jest.mock("../../middleware/auth", () => ({
  authenticate: (req, res, next) => next(),
  adminRequired: (req, res, next) => next(),
}));
jest.mock("../../lib/activityLogger", () => ({ logActivity: async () => {} }));

const { DOCS } = require("./productionFakeStore");
const router = require("../production");

/** The GET "/" handler, past the (mocked) authenticate middleware. */
function handler() {
  const layer = router.stack.find((l) => l.route && l.route.path === "/" && l.route.methods.get);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function get(query) {
  const res = fakeRes();
  await handler()({ query, user: { username: "admin" } }, res);
  return res;
}

describe("GET /api/production", () => {
  it("returns a bare array, not an envelope, when no params are sent", async () => {
    const res = await get({});
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(DOCS.length);
  });

  it("still includes cascade rows in the unparameterised response", async () => {
    const res = await get({});
    expect(res.body.map((r) => r.brand_name)).toContain("BOTTOM");
  });

  it("keeps newest-first ordering and strips _id/__v", async () => {
    const res = await get({});
    expect(res.body[0].id).toBe("p-2");
    expect(res.body[0]._id).toBeUndefined();
    expect(res.body[0].__v).toBeUndefined();
  });

  it("returns the envelope once page is sent", async () => {
    const res = await get({ page: "1", limit: "1" });
    expect(Array.isArray(res.body)).toBe(false);
    expect(Object.keys(res.body).sort()).toEqual(["data", "limit", "page", "total", "total_pages"]);
    expect(res.body).toMatchObject({ page: 1, limit: 1, total: 2, total_pages: 2 });
  });

  it("returns the envelope once limit is sent alone", async () => {
    const res = await get({ limit: "50" });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it("rejects a bad page with 400 and a detail naming the parameter", async () => {
    const res = await get({ page: "abc" });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toMatch(/^page /);
  });

  it("rejects an over-cap limit with 400 and a detail naming the parameter", async () => {
    const res = await get({ limit: "5000" });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toMatch(/^limit /);
  });

  it("rejects a sort field that is not allowlisted", async () => {
    const res = await get({ page: "1", sort: "notes" });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain("sort must be one of");
  });

  it("rejects a malformed date range", async () => {
    const res = await get({ page: "1", date_from: "yesterday" });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toMatch(/^date_from /);
  });

  it("filters and sorts a paged read", async () => {
    const res = await get({ page: "1", limit: "10", sort: "brand_name", order: "asc" });
    expect(res.body.data.map((r) => r.brand_name)).toEqual(["AUTOCOAT", "SYNCOAT"]);
  });

  it("applies a date range against the stored ISO strings", async () => {
    const res = await get({ page: "1", limit: "10", date_from: "2026-09-11", date_to: "2026-09-11" });
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].id).toBe("p-2");
  });
});
