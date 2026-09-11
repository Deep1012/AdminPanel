const {
  applyPoDeltasGuarded,
  revertPoDeltas,
  unlinkPoFromDispatches,
  capacityFilter,
  PoSyncError,
} = require("../poSync");

/**
 * Fake PurchaseOrder model that evaluates the `$expr` capacity filter and the
 * clamped pipeline update for real, so the guard itself is under test rather
 * than the shape of the query it emits.
 */
function fakePoModel(pos, { failOn = null } = {}) {
  const store = {};
  for (const [id, po] of Object.entries(pos)) store[id] = { ...po };
  const calls = { findOneAndUpdate: [], updateOne: [], findOne: [] };

  const fits = (filter) => {
    const po = store[filter.id];
    if (!po) return false;
    const [addExpr] = filter.$expr.$lte;
    const delta = addExpr.$add[1];
    return (po.quantity_dispatched || 0) + delta <= (po.quantity || 0);
  };

  return {
    store,
    calls,
    findOneAndUpdate(filter, update, options) {
      calls.findOneAndUpdate.push({ filter, update, options });
      if (failOn === filter.id) {
        return { async lean() { throw new Error("simulated write failure"); } };
      }
      const ok = fits(filter);
      if (ok) {
        store[filter.id] = {
          ...store[filter.id],
          quantity_dispatched: (store[filter.id].quantity_dispatched || 0) + update.$inc.quantity_dispatched,
        };
      }
      const doc = ok ? { ...store[filter.id] } : null;
      return { async lean() { return doc; } };
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter, update });
      const po = store[filter.id];
      if (!po) return { matchedCount: 0, modifiedCount: 0 };

      // Pipeline form: $max: [0, { $add: [ {$ifNull: [...]}, delta ] }]
      const delta = update[0].$set.quantity_dispatched.$max[1].$add[1];
      store[filter.id] = {
        ...po,
        quantity_dispatched: Math.max(0, (po.quantity_dispatched || 0) + delta),
      };
      return { matchedCount: 1, modifiedCount: 1 };
    },
    findOne(filter, projection) {
      calls.findOne.push({ filter, projection });
      const doc = store[filter.id] ? { ...store[filter.id] } : null;
      return { async lean() { return doc; } };
    },
  };
}

/** Fake Dispatch model recording updateMany calls. */
function fakeDispatchModel(results = {}) {
  const calls = [];
  return {
    calls,
    async updateMany(filter, update, options) {
      calls.push({ filter, update, options });
      return { matchedCount: 1, modifiedCount: results[calls.length - 1] ?? 1 };
    },
  };
}

const PO = (over = {}) => ({
  id: "po-1",
  serial_no: "PO-20260101-001",
  quantity: 100,
  quantity_dispatched: 0,
  ...over,
});

describe("capacityFilter (purchase orders)", () => {
  it("compares the incremented quantity_dispatched against quantity", () => {
    const json = JSON.stringify(capacityFilter("po-1", 5));
    expect(json).toContain("$lte");
    expect(json).toContain("quantity_dispatched");
    expect(json).toContain("quantity");
  });
});

describe("applyPoDeltasGuarded", () => {
  it("applies a delta that fits", async () => {
    const model = fakePoModel({ "po-1": PO() });
    await applyPoDeltasGuarded({ "po-1": 40 }, { model });

    expect(model.store["po-1"].quantity_dispatched).toBe(40);
  });

  it("applies an aggregated multi-line delta as one claim", async () => {
    // Two 8-unit lines of one dispatch against a PO with 10 remaining must be
    // netted to 16 and refused, not applied twice.
    const model = fakePoModel({ "po-1": PO({ quantity: 10 }) });

    await expect(applyPoDeltasGuarded({ "po-1": 16 }, { model })).rejects.toBeInstanceOf(PoSyncError);
    expect(model.store["po-1"].quantity_dispatched).toBe(0);
  });

  it("refuses the second of two concurrent claims that each fit alone", async () => {
    const model = fakePoModel({ "po-1": PO({ quantity: 10, quantity_dispatched: 5 }) });

    const outcomes = await Promise.allSettled([
      applyPoDeltasGuarded({ "po-1": 5 }, { model }),
      applyPoDeltasGuarded({ "po-1": 5 }, { model }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(model.store["po-1"].quantity_dispatched).toBe(10);
  });

  it("reports the remaining quantity and a 409 when a claim no longer fits", async () => {
    const model = fakePoModel({ "po-1": PO({ quantity: 10, quantity_dispatched: 9 }) });

    await expect(applyPoDeltasGuarded({ "po-1": 5 }, { model })).rejects.toMatchObject({
      status: 409,
      poId: "po-1",
      message: expect.stringContaining("remaining (1)"),
    });
  });

  it("reports 404 when the PO has been deleted", async () => {
    const model = fakePoModel({});
    await expect(applyPoDeltasGuarded({ "po-ghost": 5 }, { model })).rejects.toMatchObject({ status: 404 });
  });

  it("rolls back a PO it already claimed when a later PO in the set fails", async () => {
    // This is the half-applied multi-item dispatch the old loop could leave.
    const model = fakePoModel({
      "po-1": PO({ id: "po-1", quantity: 100, quantity_dispatched: 0 }),
      "po-2": PO({ id: "po-2", serial_no: "PO-20260101-002", quantity: 10, quantity_dispatched: 9 }),
    });

    await expect(applyPoDeltasGuarded({ "po-1": 20, "po-2": 5 }, { model })).rejects.toBeInstanceOf(PoSyncError);

    expect(model.store["po-1"].quantity_dispatched).toBe(0);
    expect(model.store["po-2"].quantity_dispatched).toBe(9);
  });

  it("rolls back a reversal too, not just a claim", async () => {
    const model = fakePoModel({
      "po-1": PO({ id: "po-1", quantity: 100, quantity_dispatched: 30 }),
      "po-2": PO({ id: "po-2", serial_no: "PO-2", quantity: 10, quantity_dispatched: 10 }),
    });

    await expect(applyPoDeltasGuarded({ "po-1": -10, "po-2": 5 }, { model })).rejects.toMatchObject({ status: 409 });

    expect(model.store["po-1"].quantity_dispatched).toBe(30);
    expect(model.store["po-2"].quantity_dispatched).toBe(10);
  });

  it("applies reversals before claims regardless of key order, and applies both", async () => {
    // Deterministic ordering: the reversal (updateOne) must be issued before
    // the claim (findOneAndUpdate) even though the claim is listed first.
    const model = fakePoModel({
      "po-1": PO({ id: "po-1", quantity: 10, quantity_dispatched: 10 }),
      "po-2": PO({ id: "po-2", quantity: 10, quantity_dispatched: 4 }),
    });

    await applyPoDeltasGuarded({ "po-2": 6, "po-1": -10 }, { model });

    expect(model.store["po-1"].quantity_dispatched).toBe(0);
    expect(model.store["po-2"].quantity_dispatched).toBe(10);
    expect(model.calls.updateOne[0].filter.id).toBe("po-1");
    expect(model.calls.findOneAndUpdate[0].filter.id).toBe("po-2");
  });

  it("clamps a reversal larger than what was recorded at 0 instead of going negative", async () => {
    // A negative quantity_dispatched reads as extra capacity and silently
    // authorises over-dispatch, which is worse than losing the drift figure.
    const model = fakePoModel({ "po-1": PO({ quantity_dispatched: 5 }) });
    await applyPoDeltasGuarded({ "po-1": -50 }, { model });

    expect(model.store["po-1"].quantity_dispatched).toBe(0);
  });

  it("never refuses a reversal against a deleted PO", async () => {
    const model = fakePoModel({});
    await expect(applyPoDeltasGuarded({ "po-ghost": -5 }, { model })).resolves.toEqual({
      applied: [],
      missing: ["po-ghost"],
    });
  });

  it("is a no-op for an empty or all-zero delta set", async () => {
    const model = fakePoModel({ "po-1": PO() });
    await applyPoDeltasGuarded({}, { model });
    await applyPoDeltasGuarded({ "po-1": 0 }, { model });

    expect(model.calls.findOneAndUpdate).toHaveLength(0);
    expect(model.calls.updateOne).toHaveLength(0);
  });

  it("propagates a write failure after rolling back what it had applied", async () => {
    const model = fakePoModel(
      {
        "po-1": PO({ id: "po-1", quantity: 100, quantity_dispatched: 0 }),
        "po-2": PO({ id: "po-2", quantity: 100, quantity_dispatched: 0 }),
      },
      { failOn: "po-2" }
    );

    await expect(applyPoDeltasGuarded({ "po-1": 10, "po-2": 10 }, { model })).rejects.toThrow(/simulated write failure/);
    expect(model.store["po-1"].quantity_dispatched).toBe(0);
  });
});

describe("revertPoDeltas", () => {
  it("undoes an applied delta set exactly", async () => {
    const model = fakePoModel({ "po-1": PO({ quantity_dispatched: 25 }) });
    await revertPoDeltas({ "po-1": 25 }, { model });

    expect(model.store["po-1"].quantity_dispatched).toBe(0);
  });

  it("undoes a reversal by re-adding it, without a capacity check", async () => {
    // Restoring the previous state must not be refused because someone else
    // has taken the capacity in the meantime.
    const model = fakePoModel({ "po-1": PO({ quantity: 10, quantity_dispatched: 10 }) });
    await revertPoDeltas({ "po-1": -4 }, { model });

    expect(model.store["po-1"].quantity_dispatched).toBe(14);
    expect(model.calls.findOneAndUpdate).toHaveLength(0);
  });

  it("keeps going when one PO is gone", async () => {
    const model = fakePoModel({ "po-1": PO({ quantity_dispatched: 5 }) });
    await revertPoDeltas({ "po-ghost": 3, "po-1": 5 }, { model });

    expect(model.store["po-1"].quantity_dispatched).toBe(0);
  });
});

describe("unlinkPoFromDispatches", () => {
  it("issues one pass for the legacy field and one for the nested entries", async () => {
    const model = fakeDispatchModel();
    await unlinkPoFromDispatches("po-1", { model });

    expect(model.calls).toHaveLength(2);
    expect(model.calls[0].filter).toEqual({ purchase_order_id: "po-1" });
    expect(model.calls[1].filter).toEqual({ "items.purchase_order_id": "po-1" });
  });

  it("matches multi-item dispatches through items[], which the old single updateMany missed", async () => {
    const model = fakeDispatchModel();
    await unlinkPoFromDispatches("po-1", { model });

    expect(model.calls[1].update).toEqual({ $set: { "items.$[entry].purchase_order_id": null } });
    expect(model.calls[1].options).toEqual({ arrayFilters: [{ "entry.purchase_order_id": "po-1" }] });
  });

  it("does not blank the top-level id of a dispatch matched only through a nested line", async () => {
    // Combining both into one $set would discard a live reference to a
    // different PO, which is why this is two passes.
    const model = fakeDispatchModel();
    await unlinkPoFromDispatches("po-1", { model });

    expect(model.calls[1].update.$set.purchase_order_id).toBeUndefined();
  });

  it("reports how many documents each pass changed", async () => {
    const model = fakeDispatchModel({ 0: 2, 1: 3 });
    await expect(unlinkPoFromDispatches("po-1", { model })).resolves.toEqual({ legacy: 2, nested: 3 });
  });

  it("refuses to run without a model or a PO id", async () => {
    await expect(unlinkPoFromDispatches("po-1")).rejects.toThrow(/model is required/);
    await expect(unlinkPoFromDispatches("", { model: fakeDispatchModel() })).rejects.toThrow(/non-empty string/);
  });
});
