const { MAX_EXPORT_BYTES, EXPORT_ROW_LIMIT, checkExportPayload } = require("../exportSize");

describe("export size budget", () => {
  it("stays under Vercel's ~4.5MB response ceiling", () => {
    expect(MAX_EXPORT_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("keeps a per-collection row cap that six collections cannot blow memory with", () => {
    expect(EXPORT_ROW_LIMIT).toBeLessThan(10000);
    expect(EXPORT_ROW_LIMIT).toBeGreaterThan(1000);
  });
});

describe("checkExportPayload", () => {
  const payload = {
    purchases: [{ id: "rm-1", sr_no: "RM-001" }],
    printingJobs: [],
    production: [{ id: "p-1", brand_name: "SYNCOAT" }],
    dispatches: [],
    purchaseOrders: [],
    customers: [],
  };

  it("accepts a payload that fits and hands back the serialised body", () => {
    const result = checkExportPayload(payload);
    expect(result.ok).toBe(true);
    expect(result.detail).toBeNull();
    expect(JSON.parse(result.body)).toEqual(payload);
  });

  it("reports the exact byte length it measured", () => {
    const result = checkExportPayload(payload);
    expect(result.bytes).toBe(Buffer.byteLength(JSON.stringify(payload), "utf8"));
  });

  it("measures utf8 bytes, not JavaScript string length", () => {
    const result = checkExportPayload({ customers: [{ name: "Ürünler — ₹" }] });
    expect(result.bytes).toBeGreaterThan(JSON.stringify({ customers: [{ name: "Ürünler — ₹" }] }).length);
  });

  it("refuses a payload past the budget instead of letting the platform fail it", () => {
    const oversized = { production: [{ notes: "x".repeat(2048) }] };
    const result = checkExportPayload(oversized, 1024);
    expect(result.ok).toBe(false);
    expect(result.body).toBeNull();
  });

  it("explains the refusal in MB and suggests a narrower export", () => {
    const result = checkExportPayload({ production: [{ notes: "x".repeat(4096) }] }, 1024);
    expect(result.detail).toContain("too large");
    expect(result.detail).toMatch(/MB, limit .*MB/);
    expect(result.detail).toMatch(/narrow the date range/);
  });

  it("accepts a payload exactly at the budget", () => {
    const body = JSON.stringify(payload);
    const result = checkExportPayload(payload, Buffer.byteLength(body, "utf8"));
    expect(result.ok).toBe(true);
  });

  it("does not mutate the payload it measured", () => {
    const original = JSON.parse(JSON.stringify(payload));
    checkExportPayload(payload);
    expect(payload).toEqual(original);
  });

  it("handles an empty export", () => {
    const result = checkExportPayload({});
    expect(result.ok).toBe(true);
    expect(result.body).toBe("{}");
  });

  it("serialises an undefined payload as null rather than throwing", () => {
    expect(checkExportPayload(undefined).body).toBe("null");
  });
});
