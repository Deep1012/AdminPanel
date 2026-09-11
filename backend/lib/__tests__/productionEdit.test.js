const {
  findInvalidProductionInput,
  productionEditShortage,
  cascadeUpdateFor,
} = require("../productionEdit");

// One printing job that printed `bodies` bodies of `brand` in `size`, at one
// sheet per body, so printing_done == bodies.
const job = (size, brand, bodies) => ({
  sheets_from_material: 1,
  sizes: [{ size_name: size, brands: [{ brand_name: brand, bodies_count: bodies }] }],
});
const row = (id, size, brand, used) => ({ id, size_name: size, brand_name: brand, printing_stock_used: used });

describe("findInvalidProductionInput", () => {
  it("requires quantity on create", () => {
    expect(findInvalidProductionInput({}, { requireQuantity: true })).toBe("quantity_produced is required");
  });

  it("lets an edit omit fields it is not changing", () => {
    expect(findInvalidProductionInput({ notes: "x" })).toBeNull();
  });

  it.each([0, -5, "abc", NaN, Infinity])("rejects quantity %p", (q) => {
    expect(findInvalidProductionInput({ quantity_produced: q })).toBe(
      "quantity_produced must be a number greater than 0"
    );
  });

  it("accepts a numeric string quantity, as form values arrive", () => {
    expect(findInvalidProductionInput({ quantity_produced: "250" })).toBeNull();
  });

  it("rejects negative printing stock but allows zero, which is how the factory records most entries", () => {
    expect(findInvalidProductionInput({ printing_stock_used: -1 })).toBe(
      "printing_stock_used must be a number of 0 or more"
    );
    expect(findInvalidProductionInput({ quantity_produced: 10, printing_stock_used: 0 })).toBeNull();
  });
});

describe("productionEditShortage", () => {
  const existing = row("p1", "1LTR", "SYNCOAT", 60);

  it("never reports a shortage for re-saving a row unchanged, even in an over-drawn bucket", () => {
    // printing_done 10 against 60 used: badly over-drawn, but this edit takes nothing more.
    const result = productionEditShortage({
      existing,
      updates: { notes: "fixed a typo" },
      jobs: [job("1LTR", "SYNCOAT", 10)],
      productions: [existing],
    });
    expect(result).toBeNull();
  });

  it("never reports a shortage for reducing consumption", () => {
    expect(productionEditShortage({
      existing,
      updates: { printing_stock_used: 20 },
      jobs: [],
      productions: [existing],
    })).toBeNull();
  });

  it("measures against availability excluding the entry's own current consumption", () => {
    // printed 100; this entry uses 60, another uses 30 -> 70 left for this entry.
    const jobs = [job("1LTR", "SYNCOAT", 100)];
    const productions = [existing, row("p2", "1LTR", "SYNCOAT", 30)];

    expect(productionEditShortage({ existing, updates: { printing_stock_used: 70 }, jobs, productions })).toBeNull();
    expect(productionEditShortage({ existing, updates: { printing_stock_used: 71 }, jobs, productions })).toEqual({
      detail: "Printing stock used (71) exceeds available printing stock (70) for SYNCOAT 1LTR",
    });
  });

  it("checks the destination bucket when an edit moves the entry to another brand", () => {
    const result = productionEditShortage({
      existing,
      updates: { brand_name: "METALLIC" },
      jobs: [job("1LTR", "SYNCOAT", 1000)],
      productions: [existing],
    });
    expect(result.detail).toMatch(/for METALLIC 1LTR/);
  });

  it("ignores entries that declare zero printing consumption", () => {
    expect(productionEditShortage({
      existing: row("p1", "1LTR", "SYNCOAT", 0),
      updates: { quantity_produced: 999 },
      jobs: [],
      productions: [],
    })).toBeNull();
  });
});

describe("cascadeUpdateFor", () => {
  it("propagates printing_stock_used when it is the only field edited (the old handler dropped it)", () => {
    expect(cascadeUpdateFor({ printing_stock_used: 40 })).toEqual({ printing_stock_used: 40 });
  });

  it("falls back to consuming the new quantity when only quantity changes, as before", () => {
    expect(cascadeUpdateFor({ quantity_produced: 500 })).toEqual({
      quantity_produced: 500,
      printing_stock_used: 500,
    });
  });

  it("prefers an explicit printing_stock_used over the quantity fallback", () => {
    expect(cascadeUpdateFor({ quantity_produced: 500, printing_stock_used: 0 })).toEqual({
      quantity_produced: 500,
      printing_stock_used: 0,
    });
  });

  it("carries size and date, and never the parent's own brand", () => {
    const next = cascadeUpdateFor({ size_id: "s2", size_name: "4LTR", production_date: "2026-09-01", brand_name: "X" });
    expect(next).toEqual({ size_id: "s2", size_name: "4LTR", production_date: "2026-09-01" });
  });

  it("returns null when nothing relevant to the children changed", () => {
    expect(cascadeUpdateFor({ notes: "x" })).toBeNull();
  });

  it("does not mutate its input", () => {
    const input = { quantity_produced: 5 };
    cascadeUpdateFor(input);
    expect(input).toEqual({ quantity_produced: 5 });
  });
});
