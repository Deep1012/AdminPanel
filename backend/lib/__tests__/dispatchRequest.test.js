const {
  itemsFromPayload,
  findInvalidQuantity,
  resolvePoIds,
  findFinishedGoodsShortage,
} = require("../dispatchRequest");

/** Fake PurchaseOrder model supporting find(...).sort(...).lean(). */
function fakePoModel(pos) {
  const rows = pos.map((po) => ({ ...po }));
  const calls = [];

  return {
    calls,
    find(filter) {
      calls.push(filter);
      const matched = rows.filter(
        (po) =>
          po.brand_id === filter.brand_id &&
          po.size_id === filter.size_id &&
          po.company_name === filter.company_name &&
          // The $expr in the real query; applied here so the fake behaves like Mongo.
          (po.quantity || 0) - (po.quantity_dispatched || 0) > 0
      );
      return {
        sort() {
          return { async lean() { return matched.map((po) => ({ ...po })); } };
        },
      };
    },
  };
}

/** Fake model returning a fixed row set from find(...).lean(). */
function fakeCollection(rows) {
  return {
    find() {
      return { async lean() { return rows.map((row) => ({ ...row })); } };
    },
  };
}

const PO = (over = {}) => ({
  id: "po-1",
  serial_no: "PO-1",
  brand_id: "b-1",
  size_id: "s-1",
  company_name: "ACME",
  date: "2026-01-01",
  quantity: 100,
  quantity_dispatched: 0,
  ...over,
});

describe("itemsFromPayload", () => {
  it("prefers items[] when present", () => {
    const items = itemsFromPayload({ items: [{ brand_id: "b-1", quantity: 5 }] });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it("builds one line from the legacy single-item payload", () => {
    const items = itemsFromPayload({
      brand_id: "b-1", brand_name: "SYNCOAT", size_id: "s-1", size_name: "1LTR", quantity: 12,
    });
    expect(items).toEqual([{
      brand_id: "b-1", brand_name: "SYNCOAT", size_id: "s-1", size_name: "1LTR",
      quantity: 12, purchase_order_id: null,
    }]);
  });

  it("returns null when the payload carries neither shape", () => {
    expect(itemsFromPayload({})).toBeNull();
    expect(itemsFromPayload({ items: [] })).toBeNull();
    expect(itemsFromPayload({ brand_id: "b-1" })).toBeNull();
    expect(itemsFromPayload()).toBeNull();
  });

  it("copies the items so PO resolution cannot write back into req.body", () => {
    const body = { items: [{ brand_id: "b-1", quantity: 5 }] };
    const items = itemsFromPayload(body);
    items[0].purchase_order_id = "po-9";
    expect(body.items[0].purchase_order_id).toBeUndefined();
  });
});

describe("findInvalidQuantity", () => {
  it("passes a payload where every line is positive", () => {
    expect(findInvalidQuantity([{ quantity: 1 }, { quantity: 500 }])).toBeNull();
  });

  it("rejects a zero quantity", () => {
    expect(findInvalidQuantity([{ quantity: 0 }])).toEqual({ quantity: 0 });
  });

  it("rejects a negative quantity, which used to hand capacity back to the PO", () => {
    expect(findInvalidQuantity([{ quantity: 5 }, { quantity: -5, brand_name: "X" }])).toMatchObject({
      brand_name: "X",
    });
  });

  it("rejects a missing or non-numeric quantity", () => {
    expect(findInvalidQuantity([{}])).toEqual({});
    expect(findInvalidQuantity([{ quantity: "abc" }])).toEqual({ quantity: "abc" });
  });

  it("accepts the numeric strings an Excel import sends", () => {
    expect(findInvalidQuantity([{ quantity: "10" }])).toBeNull();
  });
});

describe("resolvePoIds", () => {
  it("keeps an explicitly chosen PO", async () => {
    const model = fakePoModel([]);
    const resolved = await resolvePoIds(
      [{ brand_id: "b-1", size_id: "s-1", quantity: 5, purchase_order_id: "po-explicit" }],
      "ACME",
      { model }
    );
    expect(resolved[0].purchase_order_id).toBe("po-explicit");
    expect(model.calls).toHaveLength(0);
  });

  it("auto-matches on brand, size and customer", async () => {
    const model = fakePoModel([PO()]);
    const resolved = await resolvePoIds([{ brand_id: "b-1", size_id: "s-1", quantity: 5 }], "ACME", { model });
    expect(resolved[0].purchase_order_id).toBe("po-1");
  });

  it("leaves the line unlinked when nothing matches", async () => {
    const model = fakePoModel([PO({ company_name: "OTHER" })]);
    const resolved = await resolvePoIds([{ brand_id: "b-1", size_id: "s-1", quantity: 5 }], "ACME", { model });
    expect(resolved[0].purchase_order_id).toBeNull();
  });

  it("skips a PO with no remaining quantity", async () => {
    const model = fakePoModel([PO({ quantity: 10, quantity_dispatched: 10 })]);
    const resolved = await resolvePoIds([{ brand_id: "b-1", size_id: "s-1", quantity: 1 }], "ACME", { model });
    expect(resolved[0].purchase_order_id).toBeNull();
  });

  it("sends a second identical line to the NEXT PO with room", async () => {
    // Both lines used to resolve to po-1 because neither saw the other's claim.
    const model = fakePoModel([
      PO({ id: "po-1", quantity: 8, quantity_dispatched: 0 }),
      PO({ id: "po-2", quantity: 8, quantity_dispatched: 0 }),
    ]);

    const resolved = await resolvePoIds(
      [
        { brand_id: "b-1", size_id: "s-1", quantity: 8 },
        { brand_id: "b-1", size_id: "s-1", quantity: 8 },
      ],
      "ACME",
      { model }
    );

    expect(resolved.map((item) => item.purchase_order_id)).toEqual(["po-1", "po-2"]);
  });

  it("still lands both lines on the same PO when it is the only one with room, so the capacity check can refuse them", async () => {
    const model = fakePoModel([PO({ quantity: 10, quantity_dispatched: 0 })]);

    const resolved = await resolvePoIds(
      [
        { brand_id: "b-1", size_id: "s-1", quantity: 8 },
        { brand_id: "b-1", size_id: "s-1", quantity: 8 },
      ],
      "ACME",
      { model }
    );

    // Aggregated to 16 against a PO of 10 — refused downstream, not applied twice.
    expect(resolved.map((item) => item.purchase_order_id)).toEqual(["po-1", "po-1"]);
  });

  it("does not auto-match without a customer name", async () => {
    const model = fakePoModel([PO()]);
    const resolved = await resolvePoIds([{ brand_id: "b-1", size_id: "s-1", quantity: 5 }], undefined, { model });
    expect(resolved[0].purchase_order_id).toBeNull();
  });

  it("does not mutate the items it was given", async () => {
    const model = fakePoModel([PO()]);
    const items = [{ brand_id: "b-1", size_id: "s-1", quantity: 5 }];
    await resolvePoIds(items, "ACME", { model });
    expect(items[0].purchase_order_id).toBeUndefined();
  });

  it("refuses to run without a model", async () => {
    await expect(resolvePoIds([], "ACME", {})).rejects.toThrow(/model is required/);
  });
});

describe("findFinishedGoodsShortage", () => {
  const produced = [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity_produced: 100 }];

  it("allows a dispatch within Finished Goods Available", async () => {
    const shortage = await findFinishedGoodsShortage(
      [],
      [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 100 }],
      { productionModel: fakeCollection(produced), dispatchModel: fakeCollection([]) }
    );
    expect(shortage).toBeNull();
  });

  it("refuses a dispatch of goods that were never produced", async () => {
    // The unconditional path: no PO, no auto-match, nothing checked at all.
    const shortage = await findFinishedGoodsShortage(
      [],
      [{ size_name: "1LTR", brand_name: "GHOST", quantity: 5 }],
      { productionModel: fakeCollection(produced), dispatchModel: fakeCollection([]) }
    );
    expect(shortage).toMatchObject({ brand_name: "GHOST", quantity: 5, available: 0 });
  });

  it("counts what earlier dispatches already took", async () => {
    const shortage = await findFinishedGoodsShortage(
      [],
      [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 40 }],
      {
        productionModel: fakeCollection(produced),
        dispatchModel: fakeCollection([
          { items: [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 70 }] },
        ]),
      }
    );
    expect(shortage).toMatchObject({ available: 30, quantity: 40 });
  });

  it("aggregates two lines of one payload against the same pair", async () => {
    const shortage = await findFinishedGoodsShortage(
      [],
      [
        { size_name: "1LTR", brand_name: "SYNCOAT", quantity: 60 },
        { size_name: "1LTR", brand_name: "SYNCOAT", quantity: 60 },
      ],
      { productionModel: fakeCollection(produced), dispatchModel: fakeCollection([]) }
    );
    expect(shortage).toMatchObject({ quantity: 120, available: 100 });
  });

  it("lets an edit that does not raise any quantity through, even on drifted data", async () => {
    // produced 100, this dispatch 60, another 60 -> already -20 available.
    const items = [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 60 }];
    const shortage = await findFinishedGoodsShortage(items, items, {
      productionModel: fakeCollection(produced),
      dispatchModel: fakeCollection([
        { items },
        { items: [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 60 }] },
      ]),
    });
    expect(shortage).toBeNull();
  });

  it("refuses an edit that raises a quantity beyond what is available", async () => {
    const shortage = await findFinishedGoodsShortage(
      [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 10 }],
      [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 200 }],
      {
        productionModel: fakeCollection(produced),
        dispatchModel: fakeCollection([{ items: [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 10 }] }]),
      }
    );
    expect(shortage).toMatchObject({ quantity: 190, available: 90 });
  });

  it("allows dispatching a cascade brand's own finished goods", async () => {
    // BOTTOM rows are written by the cascade with a parent id; they are still
    // real, dispatchable finished goods.
    const shortage = await findFinishedGoodsShortage(
      [],
      [{ size_name: "1LTR", brand_name: "BOTTOM", quantity: 50 }],
      {
        productionModel: fakeCollection([
          ...produced,
          { size_name: "1LTR", brand_name: "BOTTOM", quantity_produced: 100, parent_production_id: "p-1" },
        ]),
        dispatchModel: fakeCollection([]),
      }
    );
    expect(shortage).toBeNull();
  });

  it("reads nothing at all when there is no net increase", async () => {
    let reads = 0;
    const counting = { find() { reads += 1; return { async lean() { return []; } }; } };
    await findFinishedGoodsShortage([{ size_name: "S", brand_name: "B", quantity: 5 }], [], {
      productionModel: counting,
      dispatchModel: counting,
    });
    expect(reads).toBe(0);
  });

  it("refuses to run without both models", async () => {
    await expect(findFinishedGoodsShortage([], [], {})).rejects.toThrow(/are required/);
  });
});
