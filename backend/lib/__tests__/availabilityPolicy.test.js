const { applyAvailabilityPolicy, MODE } = require("../availabilityPolicy");

describe("applyAvailabilityPolicy", () => {
  let warn;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("is in warn mode, because the live data contradicts the documented formulas", () => {
    // Flipping this to "enforce" starts refusing writes for every bucket that
    // GET /api/admin/reconcile reports as negative. As of 2026-09-11 that was
    // 144 of 173 production buckets and 59 dispatch buckets, so this test
    // exists to make the flip a deliberate, visible decision.
    expect(MODE).toBe("warn");
  });

  it("does not reject when there is no shortage, and logs nothing", () => {
    expect(applyAvailabilityPolicy(null)).toEqual({ reject: false });
    expect(applyAvailabilityPolicy(undefined)).toEqual({ reject: false });
    expect(warn).not.toHaveBeenCalled();
  });

  it("allows a shortage through and warns with the detail", () => {
    const result = applyAvailabilityPolicy({ detail: "short by 5" });
    expect(result.reject).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("short by 5");
    expect(warn.mock.calls[0][0]).toContain("reconcile");
  });

  it("points the reader at the aggregate view rather than just complaining", () => {
    applyAvailabilityPolicy({ detail: "x" });
    expect(warn.mock.calls[0][0]).toContain("/api/admin/reconcile");
  });
});
