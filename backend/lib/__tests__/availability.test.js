const {
  stockKey,
  printingAvailability,
  finishedGoodsAvailability,
  availableFor,
  netDemand,
} = require("../availability");

const job = (over = {}) => ({
  sheets_from_material: 10,
  sizes: [
    {
      size_name: "4LTR/5KG",
      brands: [{ brand_name: "SYNCOAT", bodies_count: 100 }],
    },
  ],
  ...over,
});

describe("stockKey", () => {
  it("keeps pairs apart even when a name contains the separator the dashboard uses", () => {
    expect(stockKey("A_B", "C")).not.toBe(stockKey("A", "B_C"));
  });

  it("treats missing names as empty strings rather than 'undefined'", () => {
    expect(stockKey()).toBe(stockKey("", ""));
  });
});

describe("printingAvailability", () => {
  it("applies Printing Stock = Bodies in Job x Sheets from Raw Material", () => {
    const buckets = printingAvailability([job()], []);
    expect(buckets.get(stockKey("4LTR/5KG", "SYNCOAT")).printing_done).toBe(1000);
  });

  it("prefers a per-brand sheets_used over the job-level figure", () => {
    const buckets = printingAvailability(
      [job({ sizes: [{ size_name: "1LTR", brands: [{ brand_name: "X", bodies_count: 2, sheets_used: 3 }] }] })],
      []
    );
    expect(buckets.get(stockKey("1LTR", "X")).printing_done).toBe(6);
  });

  it("subtracts printing_stock_used to give Available Printing Stock", () => {
    const buckets = printingAvailability(
      [job()],
      [{ size_name: "4LTR/5KG", brand_name: "SYNCOAT", printing_stock_used: 400 }]
    );
    const bucket = buckets.get(stockKey("4LTR/5KG", "SYNCOAT"));
    expect(bucket.used_in_production).toBe(400);
    expect(bucket.available).toBe(600);
  });

  it("sums several jobs and several production rows into one bucket", () => {
    const buckets = printingAvailability(
      [job(), job({ sheets_from_material: 5 })],
      [
        { size_name: "4LTR/5KG", brand_name: "SYNCOAT", printing_stock_used: 100 },
        { size_name: "4LTR/5KG", brand_name: "SYNCOAT", printing_stock_used: 50 },
      ]
    );
    expect(buckets.get(stockKey("4LTR/5KG", "SYNCOAT"))).toMatchObject({
      printing_done: 1500,
      used_in_production: 150,
      available: 1350,
    });
  });

  it("creates a bucket for a pair drawn on but never printed, reporting it negative", () => {
    const buckets = printingAvailability([], [{ size_name: "1LTR", brand_name: "GHOST", printing_stock_used: 50 }]);
    expect(buckets.get(stockKey("1LTR", "GHOST")).available).toBe(-50);
  });

  it("counts cascade children under their own brand, not the parent's", () => {
    // Producing SYNCOAT also writes BOTTOM/TOP/LID rows with a parent id.
    const productions = [
      { size_name: "4LTR/5KG", brand_name: "SYNCOAT", printing_stock_used: 100, parent_production_id: null },
      { size_name: "4LTR/5KG", brand_name: "BOTTOM", printing_stock_used: 100, parent_production_id: "p-1" },
      { size_name: "4LTR/5KG", brand_name: "TOP", printing_stock_used: 100, parent_production_id: "p-1" },
    ];
    const buckets = printingAvailability([job()], productions);

    // The source brand's bucket is untouched by its children: no double count.
    expect(buckets.get(stockKey("4LTR/5KG", "SYNCOAT")).used_in_production).toBe(100);
    // And the children's own consumption is visible, not discarded.
    expect(buckets.get(stockKey("4LTR/5KG", "BOTTOM")).used_in_production).toBe(100);
  });

  it("survives jobs with no sizes, brands, or numbers", () => {
    const buckets = printingAvailability(
      [{}, { sizes: null }, { sizes: [{ brands: null }] }, { sizes: [{ size_name: "S", brands: [null] }] }],
      [null]
    );
    expect(buckets.size).toBeGreaterThanOrEqual(0);
  });

  it("labels a size-less job line 'Unknown', matching the dashboard", () => {
    const buckets = printingAvailability([job({ sizes: [{ brands: [{ brand_name: "X", bodies_count: 1 }] }] })], []);
    expect(buckets.get(stockKey("Unknown", "X")).printing_done).toBe(10);
  });

  it("does not mutate its inputs", () => {
    const jobs = [job()];
    const snapshot = JSON.stringify(jobs);
    printingAvailability(jobs, []);
    expect(JSON.stringify(jobs)).toBe(snapshot);
  });
});

describe("finishedGoodsAvailability", () => {
  const productions = [
    { size_name: "4LTR/5KG", brand_name: "SYNCOAT", quantity_produced: 100 },
    { size_name: "4LTR/5KG", brand_name: "BOTTOM", quantity_produced: 100, parent_production_id: "p-1" },
  ];

  it("applies Finished Goods Available = Produced - Dispatched", () => {
    const buckets = finishedGoodsAvailability(productions, [
      { items: [{ size_name: "4LTR/5KG", brand_name: "SYNCOAT", quantity: 30 }] },
    ]);
    expect(buckets.get(stockKey("4LTR/5KG", "SYNCOAT"))).toMatchObject({
      produced: 100,
      dispatched: 30,
      available: 70,
    });
  });

  it("counts every line of a multi-item dispatch, not just the first", () => {
    const buckets = finishedGoodsAvailability(productions, [
      {
        // Legacy mirror fields present, as new writes produce them.
        size_name: "4LTR/5KG", brand_name: "SYNCOAT", quantity: 60,
        items: [
          { size_name: "4LTR/5KG", brand_name: "SYNCOAT", quantity: 10 },
          { size_name: "4LTR/5KG", brand_name: "BOTTOM", quantity: 50 },
        ],
      },
    ]);
    expect(buckets.get(stockKey("4LTR/5KG", "SYNCOAT")).dispatched).toBe(10);
    expect(buckets.get(stockKey("4LTR/5KG", "BOTTOM")).dispatched).toBe(50);
  });

  it("counts a legacy single-item dispatch once", () => {
    const buckets = finishedGoodsAvailability(productions, [
      { size_name: "4LTR/5KG", brand_name: "SYNCOAT", brand_id: "b-1", quantity: 40, items: [] },
    ]);
    expect(buckets.get(stockKey("4LTR/5KG", "SYNCOAT")).dispatched).toBe(40);
  });

  it("keeps cascade-brand finished goods dispatchable in their own right", () => {
    const buckets = finishedGoodsAvailability(productions, []);
    expect(buckets.get(stockKey("4LTR/5KG", "BOTTOM")).available).toBe(100);
  });

  it("creates a bucket for a pair dispatched but never produced", () => {
    const buckets = finishedGoodsAvailability([], [
      { items: [{ size_name: "1LTR", brand_name: "GHOST", quantity: 5 }] },
    ]);
    expect(buckets.get(stockKey("1LTR", "GHOST")).available).toBe(-5);
  });

  it("tolerates empty and missing input", () => {
    expect(finishedGoodsAvailability().size).toBe(0);
    expect(finishedGoodsAvailability([], []).size).toBe(0);
  });
});

describe("availableFor", () => {
  it("reads the bucket for a pair", () => {
    const buckets = finishedGoodsAvailability([{ size_name: "S", brand_name: "B", quantity_produced: 9 }], []);
    expect(availableFor(buckets, "S", "B")).toBe(9);
  });

  it("returns 0 for a pair with no bucket at all", () => {
    expect(availableFor(new Map(), "S", "B")).toBe(0);
  });

  it("returns 0 rather than throwing when handed no map", () => {
    expect(availableFor(null, "S", "B")).toBe(0);
  });
});

describe("netDemand", () => {
  it("reports the full quantity for a create (no old items)", () => {
    expect(netDemand([], [{ size_name: "S", brand_name: "B", quantity: 10 }])).toEqual([
      { size_name: "S", brand_name: "B", quantity: 10 },
    ]);
  });

  it("reports nothing when an edit leaves the quantities alone", () => {
    // This is what keeps a notes-only edit of an already over-dispatched row
    // from being refused by the finished-goods guard.
    const items = [{ size_name: "S", brand_name: "B", quantity: 10 }];
    expect(netDemand(items, items)).toEqual([]);
  });

  it("reports only the increase when a line grows", () => {
    expect(netDemand(
      [{ size_name: "S", brand_name: "B", quantity: 10 }],
      [{ size_name: "S", brand_name: "B", quantity: 14 }]
    )).toEqual([{ size_name: "S", brand_name: "B", quantity: 4 }]);
  });

  it("drops pairs whose quantity fell", () => {
    expect(netDemand(
      [{ size_name: "S", brand_name: "B", quantity: 10 }],
      [{ size_name: "S", brand_name: "B", quantity: 2 }]
    )).toEqual([]);
  });

  it("aggregates two lines of one payload that target the same pair", () => {
    expect(netDemand([], [
      { size_name: "S", brand_name: "B", quantity: 6 },
      { size_name: "S", brand_name: "B", quantity: 6 },
    ])).toEqual([{ size_name: "S", brand_name: "B", quantity: 12 }]);
  });

  it("keeps a swap between two pairs from cancelling out", () => {
    const result = netDemand(
      [{ size_name: "S", brand_name: "OLD", quantity: 10 }],
      [{ size_name: "S", brand_name: "NEW", quantity: 10 }]
    );
    expect(result).toEqual([{ size_name: "S", brand_name: "NEW", quantity: 10 }]);
  });
});
