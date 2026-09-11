const {
  itemsOf,
  sumQuantity,
  poDeltasFor,
  netPoDeltas,
  referencedPoIds,
} = require("../dispatchItems");

const legacyDispatch = {
  id: "d-1",
  order_number: "DSP-001",
  brand_id: "b-1",
  brand_name: "SYNCOAT",
  size_id: "s-1",
  size_name: "4LTR/5KG",
  quantity: 40,
  purchase_order_id: "po-1",
  items: [],
};

const multiItemDispatch = {
  id: "d-2",
  order_number: "DSP-002",
  // New writes mirror items[0] into the legacy fields.
  brand_id: "b-1",
  brand_name: "SYNCOAT",
  size_id: "s-1",
  size_name: "4LTR/5KG",
  quantity: 30,
  purchase_order_id: "po-1",
  items: [
    { brand_id: "b-1", brand_name: "SYNCOAT", size_id: "s-1", size_name: "4LTR/5KG", quantity: 10, purchase_order_id: "po-1" },
    { brand_id: "b-2", brand_name: "AUTOCOAT", size_id: "s-1", size_name: "4LTR/5KG", quantity: 20, purchase_order_id: "po-2" },
  ],
};

describe("itemsOf", () => {
  it("returns items[] verbatim when it is populated", () => {
    expect(itemsOf(multiItemDispatch)).toHaveLength(2);
    expect(itemsOf(multiItemDispatch)[1].quantity).toBe(20);
  });

  it("does NOT also count the legacy fields that mirror items[0]", () => {
    // The whole point: 10 + 20, not 10 + 20 + 30.
    expect(sumQuantity(itemsOf(multiItemDispatch))).toBe(30);
  });

  it("synthesises one item from the legacy fields when items[] is empty", () => {
    expect(itemsOf(legacyDispatch)).toEqual([
      {
        brand_id: "b-1",
        brand_name: "SYNCOAT",
        size_id: "s-1",
        size_name: "4LTR/5KG",
        quantity: 40,
        purchase_order_id: "po-1",
      },
    ]);
  });

  it("treats a missing items array like an empty one", () => {
    const { items, ...noItems } = legacyDispatch;
    expect(itemsOf(noItems)).toHaveLength(1);
  });

  it("returns [] when there is neither items[] nor a legacy brand", () => {
    expect(itemsOf({ id: "d-3", items: [] })).toEqual([]);
    expect(itemsOf(null)).toEqual([]);
    expect(itemsOf()).toEqual([]);
  });

  it("normalises a missing legacy purchase_order_id to null", () => {
    expect(itemsOf({ brand_id: "b-1", quantity: 5 })[0].purchase_order_id).toBeNull();
  });

  it("returns fresh objects, so a caller cannot mutate the document", () => {
    const result = itemsOf(multiItemDispatch);
    result[0].quantity = 999;
    expect(multiItemDispatch.items[0].quantity).toBe(10);
  });
});

describe("sumQuantity", () => {
  it("sums line quantities", () => {
    expect(sumQuantity([{ quantity: 3 }, { quantity: 4 }])).toBe(7);
  });

  it("coerces null/undefined/non-numeric quantities to 0 instead of NaN", () => {
    expect(sumQuantity([{ quantity: null }, {}, { quantity: "x" }, { quantity: 5 }])).toBe(5);
  });

  it("coerces numeric strings, which is what an Excel import sends", () => {
    expect(sumQuantity([{ quantity: "10" }, { quantity: "5" }])).toBe(15);
  });

  it("returns 0 for empty or missing input", () => {
    expect(sumQuantity([])).toBe(0);
    expect(sumQuantity()).toBe(0);
  });
});

describe("poDeltasFor", () => {
  it("aggregates two lines that target the same PO", () => {
    // The over-allocation bug in POST: each of these passed a per-line check
    // against a PO with 10 remaining, then both incremented it.
    const items = [
      { purchase_order_id: "po-1", quantity: 8 },
      { purchase_order_id: "po-1", quantity: 8 },
    ];
    expect(poDeltasFor(items, 1)).toEqual({ "po-1": 16 });
  });

  it("keeps different POs apart", () => {
    expect(poDeltasFor(multiItemDispatch.items, 1)).toEqual({ "po-1": 10, "po-2": 20 });
  });

  it("negates every quantity when sign is -1", () => {
    expect(poDeltasFor(multiItemDispatch.items, -1)).toEqual({ "po-1": -10, "po-2": -20 });
  });

  it("ignores lines with no PO", () => {
    expect(poDeltasFor([{ quantity: 5 }, { purchase_order_id: null, quantity: 5 }], 1)).toEqual({});
  });

  it("returns {} for missing input", () => {
    expect(poDeltasFor()).toEqual({});
  });

  it("does not mutate its input", () => {
    const items = [{ purchase_order_id: "po-1", quantity: 4 }];
    const snapshot = JSON.stringify(items);
    poDeltasFor(items, 1);
    expect(JSON.stringify(items)).toBe(snapshot);
  });
});

describe("netPoDeltas", () => {
  it("collapses an unchanged line to nothing at all", () => {
    const items = [{ purchase_order_id: "po-1", quantity: 10 }];
    expect(netPoDeltas(items, items)).toEqual({});
  });

  it("reports only the increase when a line grows", () => {
    expect(netPoDeltas(
      [{ purchase_order_id: "po-1", quantity: 10 }],
      [{ purchase_order_id: "po-1", quantity: 25 }]
    )).toEqual({ "po-1": 15 });
  });

  it("reports a decrease as a negative delta", () => {
    expect(netPoDeltas(
      [{ purchase_order_id: "po-1", quantity: 25 }],
      [{ purchase_order_id: "po-1", quantity: 10 }]
    )).toEqual({ "po-1": -15 });
  });

  it("handles quantity moving between two POs", () => {
    expect(netPoDeltas(
      [{ purchase_order_id: "po-1", quantity: 10 }],
      [{ purchase_order_id: "po-2", quantity: 10 }]
    )).toEqual({ "po-1": -10, "po-2": 10 });
  });

  it("fully reverses when the new item set is empty", () => {
    expect(netPoDeltas([{ purchase_order_id: "po-1", quantity: 7 }], [])).toEqual({ "po-1": -7 });
  });

  it("aggregates repeated POs on both sides", () => {
    expect(netPoDeltas(
      [{ purchase_order_id: "po-1", quantity: 5 }, { purchase_order_id: "po-1", quantity: 5 }],
      [{ purchase_order_id: "po-1", quantity: 4 }, { purchase_order_id: "po-1", quantity: 4 }]
    )).toEqual({ "po-1": -2 });
  });
});

describe("referencedPoIds", () => {
  it("unions the legacy field and every nested item", () => {
    expect(referencedPoIds(multiItemDispatch).sort()).toEqual(["po-1", "po-2"]);
  });

  it("reports a legacy id that items[] no longer mentions", () => {
    const stale = { purchase_order_id: "po-old", items: [{ purchase_order_id: "po-new", quantity: 1 }] };
    expect(referencedPoIds(stale).sort()).toEqual(["po-new", "po-old"]);
  });

  it("de-duplicates", () => {
    expect(referencedPoIds(legacyDispatch)).toEqual(["po-1"]);
  });

  it("ignores nulls and empty strings", () => {
    expect(referencedPoIds({ purchase_order_id: null, items: [{ purchase_order_id: "" }, {}] })).toEqual([]);
  });

  it("returns [] for a missing document", () => {
    expect(referencedPoIds()).toEqual([]);
  });
});
