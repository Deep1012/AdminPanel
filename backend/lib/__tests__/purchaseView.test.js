const { withComputedSheets } = require("../purchaseView");

describe("withComputedSheets", () => {
  const lot = { id: "rm-1", sr_no: "RM-001", no_of_sheets: 500, sheets_used: 120 };

  it("derives sheets_available from the two maintained fields", () => {
    expect(withComputedSheets(lot).sheets_available).toBe(380);
  });

  it("discards a stale stored value instead of trusting it", () => {
    // The exact bug: created with sheets_available = no_of_sheets, then
    // printing jobs only ever incremented sheets_used.
    const stale = { ...lot, sheets_available: 500 };
    expect(withComputedSheets(stale).sheets_available).toBe(380);
  });

  it("agrees with what /dashboard/purchase-stock computes", () => {
    const dashboardValue = (lot.no_of_sheets || 0) - (lot.sheets_used || 0);
    expect(withComputedSheets(lot).sheets_available).toBe(dashboardValue);
  });

  it("normalises a missing sheets_used to 0", () => {
    const { sheets_used, ...noUsed } = lot;
    const result = withComputedSheets(noUsed);
    expect(result.sheets_used).toBe(0);
    expect(result.sheets_available).toBe(500);
  });

  it("reports a negative availability rather than hiding drift", () => {
    expect(withComputedSheets({ no_of_sheets: 100, sheets_used: 160 }).sheets_available).toBe(-60);
  });

  it("returns 0 rather than NaN for non-numeric stored values", () => {
    expect(withComputedSheets({ no_of_sheets: "abc", sheets_used: null }).sheets_available).toBe(0);
  });

  it("keeps every other field untouched", () => {
    const full = { ...lot, supplier: "ACME", temper: "T3", gauge: 0.18 };
    expect(withComputedSheets(full)).toMatchObject({ supplier: "ACME", temper: "T3", gauge: 0.18 });
  });

  it("does not mutate the document it was given", () => {
    const stale = { ...lot, sheets_available: 500 };
    withComputedSheets(stale);
    expect(stale.sheets_available).toBe(500);
  });

  it("passes null/undefined straight through", () => {
    expect(withComputedSheets(null)).toBeNull();
    expect(withComputedSheets(undefined)).toBeUndefined();
  });
});
