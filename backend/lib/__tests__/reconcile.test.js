const { reconcile, findDuplicates, DEFAULT_SAMPLE_LIMIT } = require("../reconcile");

/** Fake model exposing just `find(filter, projection).lean()`. */
function fakeModel(rows) {
  return {
    find() {
      return { async lean() { return rows.map((row) => ({ ...row })); } };
    },
  };
}

function fakeModels({ purchases = [], jobs = [], productions = [], dispatches = [], purchaseOrders = [] } = {}) {
  return {
    Purchase: fakeModel(purchases),
    PrintingJob: fakeModel(jobs),
    Production: fakeModel(productions),
    Dispatch: fakeModel(dispatches),
    PurchaseOrder: fakeModel(purchaseOrders),
  };
}

describe("findDuplicates", () => {
  it("reports a value carried by more than one document", () => {
    const result = findDuplicates(
      [{ id: "a", sr_no: "RM-001" }, { id: "b", sr_no: "RM-001" }, { id: "c", sr_no: "RM-002" }],
      "sr_no",
      50
    );
    expect(result.count).toBe(1);
    expect(result.samples[0]).toEqual({ field: "sr_no", value: "RM-001", count: 2, ids: ["a", "b"] });
  });

  it("reports nothing when every value is unique", () => {
    expect(findDuplicates([{ id: "a", sr_no: "RM-001" }], "sr_no", 50).count).toBe(0);
  });

  it("ignores documents with a missing or non-string value", () => {
    expect(findDuplicates([{ id: "a" }, { id: "b" }, { id: "c", sr_no: 7 }], "sr_no", 50).count).toBe(0);
  });

  it("orders the worst offender first", () => {
    const result = findDuplicates(
      [
        { id: "a", n: "X" }, { id: "b", n: "X" },
        { id: "c", n: "Y" }, { id: "d", n: "Y" }, { id: "e", n: "Y" },
      ],
      "n",
      50
    );
    expect(result.samples.map((s) => s.value)).toEqual(["Y", "X"]);
  });

  it("caps the id list so one pathological value cannot blow up the response", () => {
    const docs = Array.from({ length: 40 }, (_, i) => ({ id: `d-${i}`, n: "SAME" }));
    const result = findDuplicates(docs, "n", 50);
    expect(result.samples[0].count).toBe(40);
    expect(result.samples[0].ids).toHaveLength(10);
  });
});

describe("reconcile", () => {
  it("reports a clean dataset as clean", async () => {
    const report = await reconcile({
      models: fakeModels({
        purchases: [{ id: "rm-1", sr_no: "RM-001", no_of_sheets: 100, sheets_used: 30 }],
        jobs: [{ id: "j-1", job_number: "JOB-001", raw_material_id: "rm-1", sheets_from_material: 30 }],
        productions: [{
          id: "p-1", brand_name: "SYNCOAT", size_name: "1LTR", parent_production_id: null,
          quantity_produced: 40, printing_stock_used: 0,
        }],
        dispatches: [{
          id: "d-1", order_number: "DSP-001",
          items: [{ brand_name: "SYNCOAT", size_name: "1LTR", quantity: 10, purchase_order_id: "po-1" }],
          purchase_order_id: "po-1", quantity: 10,
        }],
        purchaseOrders: [{ id: "po-1", serial_no: "PO-1", quantity: 50, quantity_dispatched: 10 }],
      }),
    });

    expect(report.clean).toBe(true);
    expect(report.total_issues).toBe(0);
    expect(report.scanned).toEqual({
      purchases: 1, printing_jobs: 1, production: 1, dispatches: 1, purchase_orders: 1,
    });
  });

  it("detects sheets_used drift against the printing jobs on that lot", async () => {
    const report = await reconcile({
      models: fakeModels({
        purchases: [{ id: "rm-1", sr_no: "RM-001", no_of_sheets: 100, sheets_used: 80 }],
        jobs: [
          { id: "j-1", job_number: "JOB-001", raw_material_id: "rm-1", sheets_from_material: 30 },
          { id: "j-2", job_number: "JOB-002", raw_material_id: "rm-1", sheets_from_material: 20 },
        ],
      }),
    });

    expect(report.checks.purchase_sheets_used_drift.count).toBe(1);
    expect(report.checks.purchase_sheets_used_drift.samples[0]).toMatchObject({
      sr_no: "RM-001", stored_sheets_used: 80, computed_sheets_used: 50, drift: 30,
    });
  });

  it("detects a negative computed sheet availability", async () => {
    const report = await reconcile({
      models: fakeModels({
        purchases: [{ id: "rm-1", sr_no: "RM-001", no_of_sheets: 100, sheets_used: 160 }],
        jobs: [{ id: "j-1", job_number: "JOB-001", raw_material_id: "rm-1", sheets_from_material: 160 }],
      }),
    });

    expect(report.checks.negative_sheets_available.count).toBe(1);
    expect(report.checks.negative_sheets_available.samples[0].sheets_available).toBe(-60);
    expect(report.checks.purchase_sheets_used_drift.count).toBe(0);
  });

  it("counts a multi-item dispatch's lines without double-counting the legacy mirror of items[0]", async () => {
    // The dispatch below records 10 + 20; the legacy top-level fields mirror
    // items[0] and its PO, so a naive union would report 30 + 10 = 40 against
    // po-1 and flag drift that does not exist.
    const report = await reconcile({
      models: fakeModels({
        dispatches: [{
          id: "d-1", order_number: "DSP-001",
          brand_name: "A", size_name: "S", quantity: 30, purchase_order_id: "po-1",
          items: [
            { brand_name: "A", size_name: "S", quantity: 10, purchase_order_id: "po-1" },
            { brand_name: "B", size_name: "S", quantity: 20, purchase_order_id: "po-2" },
          ],
        }],
        purchaseOrders: [
          { id: "po-1", serial_no: "PO-1", quantity: 100, quantity_dispatched: 10 },
          { id: "po-2", serial_no: "PO-2", quantity: 100, quantity_dispatched: 20 },
        ],
      }),
    });

    expect(report.checks.po_quantity_dispatched_drift.count).toBe(0);
  });

  it("counts a legacy single-item dispatch from its top-level fields", async () => {
    const report = await reconcile({
      models: fakeModels({
        dispatches: [{
          id: "d-1", order_number: "DSP-001", items: [],
          brand_id: "b-1", brand_name: "A", size_name: "S", quantity: 40, purchase_order_id: "po-1",
        }],
        purchaseOrders: [{ id: "po-1", serial_no: "PO-1", quantity: 100, quantity_dispatched: 40 }],
      }),
    });

    expect(report.checks.po_quantity_dispatched_drift.count).toBe(0);
  });

  it("detects quantity_dispatched drift in both directions", async () => {
    const report = await reconcile({
      models: fakeModels({
        dispatches: [{
          id: "d-1", order_number: "DSP-001",
          items: [{ quantity: 10, purchase_order_id: "po-low" }],
        }],
        purchaseOrders: [
          { id: "po-low", serial_no: "PO-LOW", quantity: 100, quantity_dispatched: 4 },
          { id: "po-high", serial_no: "PO-HIGH", quantity: 100, quantity_dispatched: 7 },
        ],
      }),
    });

    const drift = report.checks.po_quantity_dispatched_drift;
    expect(drift.count).toBe(2);
    expect(drift.samples.find((s) => s.serial_no === "PO-LOW").drift).toBe(-6);
    expect(drift.samples.find((s) => s.serial_no === "PO-HIGH").drift).toBe(7);
  });

  it("detects a PO dispatched beyond its own quantity", async () => {
    const report = await reconcile({
      models: fakeModels({
        purchaseOrders: [{ id: "po-1", serial_no: "PO-1", quantity: 10, quantity_dispatched: 16 }],
      }),
    });

    expect(report.checks.negative_po_remaining.count).toBe(1);
    expect(report.checks.negative_po_remaining.samples[0].remaining).toBe(-6);
  });

  it("detects a nested items[] reference to a PO that no longer exists", async () => {
    // A PO deletion that only unlinked the legacy field leaves exactly this.
    const report = await reconcile({
      models: fakeModels({
        dispatches: [{
          id: "d-1", order_number: "DSP-001", purchase_order_id: null,
          items: [
            { quantity: 5, purchase_order_id: null },
            { quantity: 5, purchase_order_id: "po-deleted" },
          ],
        }],
        purchaseOrders: [],
      }),
    });

    expect(report.checks.dangling_dispatch_po_refs.count).toBe(1);
    expect(report.checks.dangling_dispatch_po_refs.samples[0]).toMatchObject({
      dispatch_id: "d-1", purchase_order_id: "po-deleted", location: "items",
    });
  });

  it("detects a dangling legacy top-level reference", async () => {
    const report = await reconcile({
      models: fakeModels({
        dispatches: [{ id: "d-1", order_number: "DSP-001", brand_id: "b", quantity: 5, purchase_order_id: "po-gone", items: [] }],
      }),
    });

    expect(report.checks.dangling_dispatch_po_refs.samples[0].location).toBe("top_level");
  });

  it("detects production children whose parent is gone", async () => {
    const report = await reconcile({
      models: fakeModels({
        productions: [
          { id: "p-1", brand_name: "SYNCOAT", size_name: "1LTR", parent_production_id: null },
          { id: "p-2", brand_name: "BOTTOM", size_name: "1LTR", parent_production_id: "p-1" },
          { id: "p-3", brand_name: "TOP", size_name: "1LTR", parent_production_id: "p-vanished" },
        ],
      }),
    });

    expect(report.checks.orphan_production_children.count).toBe(1);
    expect(report.checks.orphan_production_children.samples[0]).toMatchObject({
      production_id: "p-3", parent_production_id: "p-vanished",
    });
  });

  it("detects a printing job pointing at a deleted raw material", async () => {
    const report = await reconcile({
      models: fakeModels({
        purchases: [],
        jobs: [{ id: "j-1", job_number: "JOB-001", raw_material_id: "rm-gone", sheets_from_material: 10 }],
      }),
    });

    expect(report.checks.orphan_printing_jobs.count).toBe(1);
  });

  it("detects duplicate serial codes in all three un-indexed collections", async () => {
    const report = await reconcile({
      models: fakeModels({
        purchases: [{ id: "a", sr_no: "RM-1000" }, { id: "b", sr_no: "RM-1000" }],
        jobs: [{ id: "c", job_number: "JOB-1000" }, { id: "d", job_number: "JOB-1000" }],
        dispatches: [{ id: "e", order_number: "DSP-1000" }, { id: "f", order_number: "DSP-1000" }],
      }),
    });

    expect(report.checks.duplicate_purchase_sr_no.count).toBe(1);
    expect(report.checks.duplicate_printing_job_number.count).toBe(1);
    expect(report.checks.duplicate_dispatch_order_number.count).toBe(1);
  });

  it("previews what the new printing-stock guard will refuse", async () => {
    const report = await reconcile({
      models: fakeModels({
        jobs: [{
          id: "j-1", job_number: "JOB-001", raw_material_id: "rm-1", sheets_from_material: 10,
          sizes: [{ size_name: "1LTR", brands: [{ brand_name: "SYNCOAT", bodies_count: 10 }] }],
        }],
        productions: [
          { id: "p-1", size_name: "1LTR", brand_name: "SYNCOAT", printing_stock_used: 100, quantity_produced: 100 },
          { id: "p-2", size_name: "1LTR", brand_name: "OVERDRAWN", printing_stock_used: 500, quantity_produced: 500 },
        ],
        purchases: [{ id: "rm-1", sr_no: "RM-001", no_of_sheets: 10, sheets_used: 10 }],
      }),
    });

    const negative = report.checks.negative_printing_stock_available;
    expect(negative.count).toBe(1);
    expect(negative.samples[0]).toMatchObject({ brand_name: "OVERDRAWN", available: -500 });
  });

  it("previews what the new finished-goods guard will refuse", async () => {
    const report = await reconcile({
      models: fakeModels({
        productions: [{ id: "p-1", size_name: "1LTR", brand_name: "SYNCOAT", quantity_produced: 50 }],
        dispatches: [{
          id: "d-1", order_number: "DSP-001",
          items: [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 80 }],
        }],
      }),
    });

    const negative = report.checks.negative_finished_goods_available;
    expect(negative.count).toBe(1);
    expect(negative.samples[0]).toMatchObject({ brand_name: "SYNCOAT", produced: 50, dispatched: 80, available: -30 });
  });

  it("reports no guard preview rows for data the guards would accept", async () => {
    const report = await reconcile({
      models: fakeModels({
        jobs: [{
          id: "j-1", job_number: "JOB-001", raw_material_id: "rm-1", sheets_from_material: 10,
          sizes: [{ size_name: "1LTR", brands: [{ brand_name: "SYNCOAT", bodies_count: 10 }] }],
        }],
        purchases: [{ id: "rm-1", sr_no: "RM-001", no_of_sheets: 10, sheets_used: 10 }],
        productions: [{ id: "p-1", size_name: "1LTR", brand_name: "SYNCOAT", printing_stock_used: 100, quantity_produced: 100 }],
        dispatches: [{
          id: "d-1", order_number: "DSP-001",
          items: [{ size_name: "1LTR", brand_name: "SYNCOAT", quantity: 100 }],
        }],
      }),
    });

    expect(report.checks.negative_printing_stock_available.count).toBe(0);
    expect(report.checks.negative_finished_goods_available.count).toBe(0);
    expect(report.clean).toBe(true);
  });

  it("caps samples per check while keeping the count complete", async () => {
    const purchases = Array.from({ length: 120 }, (_, i) => ({
      id: `rm-${i}`, sr_no: `RM-${i}`, no_of_sheets: 10, sheets_used: 99,
    }));

    const report = await reconcile({ models: fakeModels({ purchases }), sampleLimit: 5 });

    expect(report.checks.negative_sheets_available.count).toBe(120);
    expect(report.checks.negative_sheets_available.samples).toHaveLength(5);
    expect(report.sample_limit).toBe(5);
  });

  it("falls back to the default sample limit for a nonsense value", async () => {
    const report = await reconcile({ models: fakeModels(), sampleLimit: 0 });
    expect(report.sample_limit).toBe(DEFAULT_SAMPLE_LIMIT);
  });

  it("handles completely empty collections", async () => {
    const report = await reconcile({ models: fakeModels() });
    expect(report.clean).toBe(true);
    expect(report.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("refuses to run without models rather than reading globals", async () => {
    await expect(reconcile({})).rejects.toThrow(/models is required/);
  });
});
