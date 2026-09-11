const { capacityFilter, reserveSheets, releaseSheets, restoreSheets } = require("../sheetStock");

/**
 * Fake Purchase model that actually evaluates the `$expr` capacity filter, so
 * these tests exercise the guard rather than just asserting on the shape of the
 * query object. Only the two operator forms this module emits are supported.
 */
function fakePurchaseModel(lots) {
  const store = { ...lots };
  const calls = { findOneAndUpdate: [], updateOne: [] };

  const matches = (filter) => {
    const lot = store[filter.id];
    if (!lot) return false;
    if (!filter.$expr) return true;

    // $lte: [ { $add: [ {$ifNull: ["$sheets_used", 0]}, amount ] }, {$ifNull: ["$no_of_sheets", 0]} ]
    const [addExpr] = filter.$expr.$lte;
    const amount = addExpr.$add[1];
    return (lot.sheets_used || 0) + amount <= (lot.no_of_sheets || 0);
  };

  return {
    store,
    calls,
    findOneAndUpdate(filter, update, options) {
      calls.findOneAndUpdate.push({ filter, update, options });
      const ok = matches(filter);
      if (ok) {
        store[filter.id] = {
          ...store[filter.id],
          sheets_used: (store[filter.id].sheets_used || 0) + update.$inc.sheets_used,
        };
      }
      const doc = ok ? { ...store[filter.id] } : null;
      return { async lean() { return doc; } };
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter, update });
      const lot = store[filter.id];
      if (!lot) return { matchedCount: 0, modifiedCount: 0 };

      // Pipeline form: $set.sheets_used = $max: [0, {$subtract|$add: [...]}]
      const inner = update[0].$set.sheets_used.$max[1];
      const delta = inner.$subtract ? -inner.$subtract[1] : inner.$add[1];
      store[filter.id] = { ...lot, sheets_used: Math.max(0, (lot.sheets_used || 0) + delta) };
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
}

const LOT = (over = {}) => ({ id: "rm-1", sr_no: "RM-001", no_of_sheets: 100, sheets_used: 0, ...over });

describe("capacityFilter", () => {
  it("keys on the application id, never _id", () => {
    expect(capacityFilter("rm-1", 10).id).toBe("rm-1");
  });

  it("compares the *incremented* value against no_of_sheets inside the filter", () => {
    const filter = capacityFilter("rm-1", 10);
    expect(JSON.stringify(filter)).toContain("$lte");
    expect(JSON.stringify(filter)).toContain("sheets_used");
    expect(JSON.stringify(filter)).toContain("no_of_sheets");
  });

  it("treats a non-numeric amount as 0 rather than emitting NaN into a query", () => {
    expect(JSON.stringify(capacityFilter("rm-1", undefined))).not.toContain("null");
  });
});

describe("reserveSheets", () => {
  it("deducts sheets and returns the updated lot", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT() });
    const updated = await reserveSheets({ purchaseId: "rm-1", sheets: 80, model });

    expect(updated.sheets_used).toBe(80);
  });

  it("allows a reservation for exactly the remaining sheets", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 20 }) });
    await expect(reserveSheets({ purchaseId: "rm-1", sheets: 80, model })).resolves.toMatchObject({
      sheets_used: 100,
    });
  });

  it("returns null, and writes nothing, when the request exceeds the lot", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 20 }) });
    await expect(reserveSheets({ purchaseId: "rm-1", sheets: 81, model })).resolves.toBeNull();
    expect(model.store["rm-1"].sheets_used).toBe(20);
  });

  it("lets only ONE of two concurrent 80-sheet reservations against a 100-sheet lot win", async () => {
    // The race the route used to lose: both requests read "100 available",
    // both passed, and the lot ended at 160 used of 100.
    const model = fakePurchaseModel({ "rm-1": LOT() });

    const results = await Promise.all([
      reserveSheets({ purchaseId: "rm-1", sheets: 80, model }),
      reserveSheets({ purchaseId: "rm-1", sheets: 80, model }),
    ]);

    const winners = results.filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(model.store["rm-1"].sheets_used).toBe(80);
  });

  it("returns null for a lot that does not exist", async () => {
    const model = fakePurchaseModel({});
    await expect(reserveSheets({ purchaseId: "ghost", sheets: 1, model })).resolves.toBeNull();
  });

  it("treats a missing sheets_used as 0", async () => {
    const model = fakePurchaseModel({ "rm-1": { id: "rm-1", no_of_sheets: 50 } });
    await expect(reserveSheets({ purchaseId: "rm-1", sheets: 50, model })).resolves.toBeTruthy();
  });

  it("refuses a non-positive reservation rather than writing a no-op", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT() });
    await expect(reserveSheets({ purchaseId: "rm-1", sheets: 0, model })).rejects.toThrow(/greater than 0/);
    await expect(reserveSheets({ purchaseId: "rm-1", sheets: -5, model })).rejects.toThrow(/greater than 0/);
    expect(model.calls.findOneAndUpdate).toHaveLength(0);
  });
});

describe("releaseSheets", () => {
  it("gives sheets back to the lot", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 80 }) });
    await releaseSheets({ purchaseId: "rm-1", sheets: 30, model });

    expect(model.store["rm-1"].sheets_used).toBe(50);
  });

  it("clamps at 0 when the release is larger than what is recorded", async () => {
    // A negative sheets_used would read as MORE stock than the lot ever held.
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 10 }) });
    await releaseSheets({ purchaseId: "rm-1", sheets: 999, model });

    expect(model.store["rm-1"].sheets_used).toBe(0);
  });

  it("does the clamping server-side, in the update itself", async () => {
    // Mongoose's `min: 0` validator does not run on updateOne, so the floor
    // has to be part of the pipeline rather than a schema promise.
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 10 }) });
    await releaseSheets({ purchaseId: "rm-1", sheets: 5, model });

    const [{ update }] = model.calls.updateOne;
    expect(Array.isArray(update)).toBe(true);
    expect(JSON.stringify(update)).toContain("$max");
  });

  it("reports a missing lot without throwing, so a rollback is never blocked", async () => {
    const model = fakePurchaseModel({});
    await expect(releaseSheets({ purchaseId: "ghost", sheets: 5, model })).resolves.toEqual({ matched: false });
  });

  it("is a no-op for a non-positive amount", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 10 }) });
    await expect(releaseSheets({ purchaseId: "rm-1", sheets: 0, model })).resolves.toEqual({ matched: false });
    expect(model.calls.updateOne).toHaveLength(0);
  });
});

describe("restoreSheets", () => {
  it("puts back sheets that were released", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 20 }) });
    await restoreSheets({ purchaseId: "rm-1", sheets: 30, model });

    expect(model.store["rm-1"].sheets_used).toBe(50);
  });

  it("restores even past the capacity ceiling, because refusing would leave the lot under-deducted", async () => {
    // The invisible direction is the dangerous one: a lot that looks like it
    // has room it does not have lets the same sheets be committed twice.
    const model = fakePurchaseModel({ "rm-1": LOT({ no_of_sheets: 100, sheets_used: 90 }) });
    await restoreSheets({ purchaseId: "rm-1", sheets: 30, model });

    expect(model.store["rm-1"].sheets_used).toBe(120);
    expect(model.calls.findOneAndUpdate).toHaveLength(0);
  });

  it("is a no-op for a non-positive amount or a missing lot", async () => {
    const model = fakePurchaseModel({});
    await expect(restoreSheets({ purchaseId: "rm-1", sheets: 0, model })).resolves.toEqual({ matched: false });
    await expect(restoreSheets({ purchaseId: "ghost", sheets: 5, model })).resolves.toEqual({ matched: false });
  });

  it("undoes a release exactly, which is the failed-PUT path", async () => {
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 60 }) });
    await releaseSheets({ purchaseId: "rm-1", sheets: 25, model });
    await restoreSheets({ purchaseId: "rm-1", sheets: 25, model });

    expect(model.store["rm-1"].sheets_used).toBe(60);
  });
});

describe("reserve/release round trip", () => {
  it("returns the lot to its starting point, which is the create-then-fail path", async () => {
    // routes/printingJobs.js reserves first and creates the job second; if the
    // create throws it releases what it reserved.
    const model = fakePurchaseModel({ "rm-1": LOT({ sheets_used: 25 }) });

    await reserveSheets({ purchaseId: "rm-1", sheets: 40, model });
    expect(model.store["rm-1"].sheets_used).toBe(65);

    await releaseSheets({ purchaseId: "rm-1", sheets: 40, model });
    expect(model.store["rm-1"].sheets_used).toBe(25);
  });
});
