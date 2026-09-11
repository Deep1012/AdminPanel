const {
  normalizeDeltas,
  assertPoCapacity,
  PoSyncError,
} = require("../poSync");

/** Fake PurchaseOrder model backed by an in-memory map of id -> PO document. */
function fakePoModel(pos) {
  const calls = { findOne: [], updateOne: [] };

  return {
    calls,
    findOne(filter, projection) {
      calls.findOne.push({ filter, projection });
      const doc = pos[filter.id] || null;
      return {
        async lean() {
          return doc ? { ...doc } : null;
        },
      };
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter, update });
      return { matchedCount: pos[filter.id] ? 1 : 0, modifiedCount: pos[filter.id] ? 1 : 0 };
    },
  };
}

const PO = (over = {}) => ({
  id: "po-1",
  serial_no: "PO-20260101-001",
  quantity: 100,
  quantity_dispatched: 20,
  ...over,
});

describe("normalizeDeltas", () => {
  it("accepts a plain object", () => {
    expect(normalizeDeltas({ "po-1": 5, "po-2": -3 })).toEqual([
      ["po-1", 5],
      ["po-2", -3],
    ]);
  });

  it("accepts a Map", () => {
    const map = new Map([["po-1", 5], ["po-2", -3]]);
    expect(normalizeDeltas(map)).toEqual([
      ["po-1", 5],
      ["po-2", -3],
    ]);
  });

  it("drops zero and non-finite deltas", () => {
    expect(normalizeDeltas({ a: 0, b: 4, c: null, d: undefined, e: NaN, f: "x" })).toEqual([["b", 4]]);
  });

  it("drops empty or falsy PO ids", () => {
    expect(normalizeDeltas({ "": 5 })).toEqual([]);
  });

  it("returns [] for null/undefined input", () => {
    expect(normalizeDeltas()).toEqual([]);
    expect(normalizeDeltas(null)).toEqual([]);
  });

  it("coerces numeric strings", () => {
    expect(normalizeDeltas({ "po-1": "7" })).toEqual([["po-1", 7]]);
  });

  it("does not mutate its input", () => {
    const input = { "po-1": 5, "po-2": 0 };
    const snapshot = { ...input };
    normalizeDeltas(input);
    expect(input).toEqual(snapshot);
  });
});

describe("assertPoCapacity", () => {
  it("resolves when a positive delta fits in the remaining quantity", async () => {
    const model = fakePoModel({ "po-1": PO() }); // remaining = 80
    await expect(assertPoCapacity({ "po-1": 80 }, { model })).resolves.toBeUndefined();
  });

  it("rejects a positive delta that exceeds the remaining quantity", async () => {
    const model = fakePoModel({ "po-1": PO() }); // remaining = 80
    await expect(assertPoCapacity({ "po-1": 81 }, { model })).rejects.toThrow(
      /exceeds PO PO-20260101-001 remaining \(80\)/
    );
  });

  it("attaches a 400 status and the PO id to an over-capacity error", async () => {
    const model = fakePoModel({ "po-1": PO() });
    await expect(assertPoCapacity({ "po-1": 500 }, { model })).rejects.toMatchObject({
      status: 400,
      poId: "po-1",
    });
    await expect(assertPoCapacity({ "po-1": 500 }, { model })).rejects.toBeInstanceOf(PoSyncError);
  });

  it("rejects with 404 when a referenced PO is missing", async () => {
    const model = fakePoModel({});
    await expect(assertPoCapacity({ "po-ghost": 5 }, { model })).rejects.toMatchObject({
      status: 404,
      poId: "po-ghost",
    });
  });

  it("treats a missing quantity_dispatched as 0", async () => {
    const model = fakePoModel({ "po-1": PO({ quantity_dispatched: undefined }) });
    await expect(assertPoCapacity({ "po-1": 100 }, { model })).resolves.toBeUndefined();
    await expect(assertPoCapacity({ "po-1": 101 }, { model })).rejects.toThrow(/remaining \(100\)/);
  });

  it("allows negative deltas even when they would under-run, so a reversal is never stranded", async () => {
    const model = fakePoModel({ "po-1": PO({ quantity_dispatched: 5 }) });
    await expect(assertPoCapacity({ "po-1": -50 }, { model })).resolves.toBeUndefined();
  });

  it("still requires the PO to exist for a negative delta", async () => {
    const model = fakePoModel({});
    await expect(assertPoCapacity({ "po-ghost": -5 }, { model })).rejects.toMatchObject({ status: 404 });
  });

  it("validates every PO in the set, not just the first", async () => {
    const model = fakePoModel({
      "po-1": PO({ id: "po-1", quantity: 100, quantity_dispatched: 0 }),
      "po-2": PO({ id: "po-2", serial_no: "PO-20260101-002", quantity: 10, quantity_dispatched: 9 }),
    });
    await expect(assertPoCapacity({ "po-1": 5, "po-2": 5 }, { model })).rejects.toMatchObject({
      poId: "po-2",
      status: 400,
    });
  });

  it("is a no-op for an empty delta set and touches the database not at all", async () => {
    const model = fakePoModel({ "po-1": PO() });
    await expect(assertPoCapacity({}, { model })).resolves.toBeUndefined();
    expect(model.calls.findOne).toHaveLength(0);
  });

  it("reads each PO exactly once", async () => {
    const model = fakePoModel({ "po-1": PO() });
    await assertPoCapacity({ "po-1": 10 }, { model });
    expect(model.calls.findOne).toHaveLength(1);
  });
});

