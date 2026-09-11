const {
  MAX_LIMIT,
  DEFAULT_LIMIT,
  CASCADE_BRAND_NAMES,
  SORTABLE_FIELDS,
  buildProductionListQuery,
  fetchProductionList,
  withProductionDefaults,
} = require("../productionList");

/**
 * Fake Mongoose Model backed by an in-memory array.
 *
 * `find(filter, projection).sort().skip().limit().lean()` and
 * `countDocuments(filter)` are reproduced closely enough that the filters
 * actually run: the matcher understands the operators this module emits
 * ($and, $or, $nin over regexes, $gte/$lte over strings, bare regex equality),
 * so a wrong filter shape fails the test instead of passing silently.
 */
function fakeModel(docs) {
  const calls = { find: [], count: [], sort: [], skip: [], limit: [] };

  function matches(doc, clause) {
    return Object.entries(clause).every(([key, condition]) => {
      if (key === "$and") return condition.every((c) => matches(doc, c));
      if (key === "$or") return condition.some((c) => matches(doc, c));
      return matchesCondition(doc[key], condition);
    });
  }

  function matchesCondition(value, condition) {
    if (condition instanceof RegExp) {
      return typeof value === "string" && condition.test(value);
    }
    if (condition && typeof condition === "object") {
      return Object.entries(condition).every(([operator, operand]) => {
        if (operator === "$nin") {
          return !operand.some((candidate) => matchesCondition(value, candidate));
        }
        if (operator === "$gte") return value !== undefined && value >= operand;
        if (operator === "$lte") return value !== undefined && value <= operand;
        throw new Error(`fakeModel: unsupported operator ${operator}`);
      });
    }
    return value === condition;
  }

  function applySort(rows, spec) {
    const entries = Object.entries(spec || {});
    return [...rows].sort((a, b) => {
      for (const [field, direction] of entries) {
        const left = a[field];
        const right = b[field];
        if (left === right) continue;
        if (left === undefined) return 1;
        if (right === undefined) return -1;
        return left < right ? -direction : direction;
      }
      return 0;
    });
  }

  function project(doc, projection) {
    const copy = { ...doc };
    for (const key of Object.keys(projection || {})) delete copy[key];
    return copy;
  }

  return {
    calls,

    find(filter, projection) {
      calls.find.push(filter);
      let rows = docs.filter((d) => matches(d, filter)).map((d) => project(d, projection));
      const query = {
        sort(spec) {
          calls.sort.push(spec);
          rows = applySort(rows, spec);
          return query;
        },
        skip(n) {
          calls.skip.push(n);
          rows = rows.slice(n);
          return query;
        },
        limit(n) {
          calls.limit.push(n);
          rows = rows.slice(0, n);
          return query;
        },
        async lean() {
          return rows;
        },
      };
      return query;
    },

    async countDocuments(filter) {
      calls.count.push(filter);
      return docs.filter((d) => matches(d, filter)).length;
    },
  };
}

function row(overrides) {
  return {
    _id: "mongo-oid",
    __v: 0,
    id: "p-1",
    brand_id: "b-1",
    brand_name: "SYNCOAT",
    size_id: "s-1",
    size_name: "4LTR/5KG",
    quantity_produced: 100,
    printing_stock_used: 100,
    parent_production_id: null,
    production_date: "2026-09-10T00:00:00.000Z",
    created_by: "admin",
    ...overrides,
  };
}

// Two parent entries plus the three cascade children of the first — the shape
// the cascade actually writes.
const DOCS = [
  row({ id: "p-1", brand_name: "SYNCOAT", production_date: "2026-09-10T00:00:00.000Z" }),
  row({ id: "p-2", brand_name: "AUTOCOAT", size_name: "1LTR", production_date: "2026-09-11T06:00:00.000Z" }),
  row({ id: "c-1", brand_name: "BOTTOM", parent_production_id: "p-1", production_date: "2026-09-10T00:00:00.000Z" }),
  row({ id: "c-2", brand_name: "TOP", parent_production_id: "p-1", production_date: "2026-09-10T00:00:00.000Z" }),
  row({ id: "c-3", brand_name: "LID", parent_production_id: "p-1", production_date: "2026-09-10T00:00:00.000Z" }),
];

describe("buildProductionListQuery — mode selection", () => {
  it("plans an unpaginated read when no params are given", () => {
    const plan = buildProductionListQuery({});
    expect(plan.paginated).toBe(false);
    expect(plan.filter).toEqual({});
    expect(plan.sort).toEqual({ production_date: -1 });
  });

  it("treats a missing query object as no params", () => {
    expect(buildProductionListQuery().paginated).toBe(false);
    expect(buildProductionListQuery(undefined).filter).toEqual({});
  });

  it("switches to paginated mode on page alone", () => {
    expect(buildProductionListQuery({ page: "2" }).paginated).toBe(true);
  });

  it("switches to paginated mode on limit alone", () => {
    expect(buildProductionListQuery({ limit: "25" }).paginated).toBe(true);
  });

  it("ignores empty-string params rather than paginating on them", () => {
    const plan = buildProductionListQuery({ page: "", limit: "", sort: "", order: "" });
    expect(plan.paginated).toBe(false);
    expect(plan.filter).toEqual({});
  });

  it("defaults limit and page when only the other is given", () => {
    expect(buildProductionListQuery({ page: "3" }).limit).toBe(DEFAULT_LIMIT);
    expect(buildProductionListQuery({ limit: "10" }).page).toBe(1);
  });

  it("computes skip from page and limit", () => {
    expect(buildProductionListQuery({ page: "3", limit: "20" }).skip).toBe(40);
    expect(buildProductionListQuery({ page: "1", limit: "20" }).skip).toBe(0);
  });
});

describe("buildProductionListQuery — param validation", () => {
  it("rejects a non-numeric page, naming the parameter", () => {
    expect(buildProductionListQuery({ page: "abc" }).error).toMatch(/^page /);
  });

  it("rejects page 0 and negative pages", () => {
    expect(buildProductionListQuery({ page: "0" }).error).toMatch(/^page /);
    expect(buildProductionListQuery({ page: "-1" }).error).toMatch(/^page /);
  });

  it("rejects a non-numeric limit, naming the parameter", () => {
    expect(buildProductionListQuery({ limit: "all" }).error).toMatch(/^limit /);
  });

  it("caps limit and says the range", () => {
    const result = buildProductionListQuery({ limit: String(MAX_LIMIT + 1) });
    expect(result.error).toContain("limit");
    expect(result.error).toContain(String(MAX_LIMIT));
  });

  it("accepts limit exactly at the cap", () => {
    expect(buildProductionListQuery({ limit: String(MAX_LIMIT) }).limit).toBe(MAX_LIMIT);
  });

  it("rejects a float limit rather than silently truncating", () => {
    expect(buildProductionListQuery({ limit: "10.5" }).error).toMatch(/^limit /);
  });

  it("rejects an order that is not asc or desc", () => {
    expect(buildProductionListQuery({ order: "sideways" }).error).toMatch(/^order /);
  });

  it("rejects a malformed date_from, naming the parameter", () => {
    expect(buildProductionListQuery({ date_from: "last tuesday" }).error).toMatch(/^date_from /);
  });

  it("rejects a malformed date_to, naming the parameter", () => {
    expect(buildProductionListQuery({ date_to: "2026-13" }).error).toMatch(/^date_to /);
  });

  it("rejects a non-boolean exclude_cascade", () => {
    expect(buildProductionListQuery({ exclude_cascade: "maybe" }).error).toMatch(/^exclude_cascade /);
  });

  it("returns an error object with no plan fields, so the route cannot half-run it", () => {
    const result = buildProductionListQuery({ page: "abc" });
    expect(result.filter).toBeUndefined();
    expect(result.sort).toBeUndefined();
  });
});

describe("buildProductionListQuery — sort allowlist", () => {
  it("preserves the existing default ordering when no sort is given", () => {
    expect(buildProductionListQuery({}).sort).toEqual({ production_date: -1 });
  });

  it("accepts every field the Production table can sort by", () => {
    for (const field of SORTABLE_FIELDS) {
      const plan = buildProductionListQuery({ sort: field, order: "asc" });
      expect(plan.error).toBeUndefined();
      expect(plan.sort[field]).toBe(1);
    }
  });

  it("rejects an unknown field instead of sorting by nothing", () => {
    const result = buildProductionListQuery({ sort: "notes" });
    expect(result.error).toContain("sort must be one of");
    expect(result.error).toContain("production_date");
  });

  it("refuses an operator-shaped sort string — never reaches .sort()", () => {
    expect(buildProductionListQuery({ sort: "{ $where: 1 }" }).error).toContain("sort must be one of");
    expect(buildProductionListQuery({ sort: "__proto__" }).error).toContain("sort must be one of");
    expect(buildProductionListQuery({ sort: "constructor" }).error).toContain("sort must be one of");
  });

  it("maps order to a Mongo sort direction", () => {
    expect(buildProductionListQuery({ sort: "brand_name", order: "ASC" }).sort.brand_name).toBe(1);
    expect(buildProductionListQuery({ sort: "brand_name", order: "desc" }).sort.brand_name).toBe(-1);
  });

  it("adds a unique tiebreaker only on paged reads, so pages cannot repeat rows", () => {
    expect(buildProductionListQuery({ page: "1" }).sort).toEqual({ production_date: -1, id: 1 });
    expect(buildProductionListQuery({}).sort.id).toBeUndefined();
  });
});

describe("buildProductionListQuery — cascade rows", () => {
  it("keeps cascade rows in the unpaginated read, which other pages depend on", () => {
    expect(buildProductionListQuery({}).filter).toEqual({});
  });

  it("excludes cascade brands by default once paginated", () => {
    const plan = buildProductionListQuery({ page: "1" });
    const clause = plan.filter.$and[0].brand_name.$nin;
    expect(clause).toHaveLength(CASCADE_BRAND_NAMES.length);
    expect(clause.every((r) => r instanceof RegExp)).toBe(true);
  });

  it("matches cascade brand names case-insensitively, like the page does", () => {
    const plan = buildProductionListQuery({ page: "1" });
    const [first] = plan.filter.$and[0].brand_name.$nin;
    expect(first.test("bottom")).toBe(true);
    expect(first.test("BOTTOM")).toBe(true);
    expect(first.test("BOTTOM LWBF")).toBe(false);
  });

  it("can be asked to include cascade rows in a paged read", () => {
    const plan = buildProductionListQuery({ page: "1", exclude_cascade: "false" });
    expect(plan.filter).toEqual({});
  });

  it("can be asked to exclude cascade rows from an unpaginated read", () => {
    const plan = buildProductionListQuery({ exclude_cascade: "true" });
    expect(plan.paginated).toBe(false);
    expect(plan.filter.$and).toHaveLength(1);
  });

  it("accepts 1/0 as well as true/false", () => {
    expect(buildProductionListQuery({ exclude_cascade: "1" }).filter.$and).toHaveLength(1);
    expect(buildProductionListQuery({ page: "1", exclude_cascade: "0" }).filter).toEqual({});
  });
});

describe("buildProductionListQuery — filters", () => {
  it("matches brand_name exactly, case-insensitively", () => {
    const plan = buildProductionListQuery({ brand_name: "syncoat" });
    const regex = plan.filter.$and[0].brand_name;
    expect(regex.test("SYNCOAT")).toBe(true);
    expect(regex.test("SYNCOAT PLUS")).toBe(false);
  });

  it("composes an explicit brand_name with the cascade exclusion without losing either", () => {
    const plan = buildProductionListQuery({ page: "1", brand_name: "SYNCOAT" });
    expect(plan.filter.$and).toHaveLength(2);
    expect(plan.filter.$and[0].brand_name.$nin).toBeDefined();
    expect(plan.filter.$and[1].brand_name).toBeInstanceOf(RegExp);
  });

  it("matches size_name exactly, case-insensitively", () => {
    const regex = buildProductionListQuery({ size_name: "1ltr" }).filter.$and[0].size_name;
    expect(regex.test("1LTR")).toBe(true);
  });

  it("escapes regex metacharacters in a size name so 4LTR/5KG is not a pattern", () => {
    const regex = buildProductionListQuery({ size_name: "4LTR/5KG (x.y)" }).filter.$and[0].size_name;
    expect(regex.test("4LTR/5KG (x.y)")).toBe(true);
    expect(regex.test("4LTR/5KG (xAy)")).toBe(false);
  });

  it("searches brand, size and creator, the same fields the page searches", () => {
    const clause = buildProductionListQuery({ search: "syn" }).filter.$and[0].$or;
    expect(clause.map((c) => Object.keys(c)[0])).toEqual(["brand_name", "size_name", "created_by"]);
  });

  it("escapes regex metacharacters in the search term", () => {
    const clause = buildProductionListQuery({ search: "a.*b" }).filter.$and[0].$or;
    expect(clause[0].brand_name.test("a.*b")).toBe(true);
    expect(clause[0].brand_name.test("axxb")).toBe(false);
  });

  it("ignores a whitespace-only filter value", () => {
    expect(buildProductionListQuery({ brand_name: "   ", search: " " }).filter).toEqual({});
  });
});

describe("buildProductionListQuery — production_date is an ISO String, not a Date", () => {
  it("uses a bare date as the lower bound so the whole calendar day is included", () => {
    const range = buildProductionListQuery({ date_from: "2026-09-10" }).filter.$and[0].production_date;
    expect(range.$gte).toBe("2026-09-10");
    expect("2026-09-10T00:00:00.000Z" >= range.$gte).toBe(true);
    expect("2026-09-09T23:59:59.999Z" >= range.$gte).toBe(false);
  });

  it("extends the upper bound to the end of the day, like the activity-log filter", () => {
    const range = buildProductionListQuery({ date_to: "2026-09-10" }).filter.$and[0].production_date;
    expect(range.$lte).toBe("2026-09-10T23:59:59.999Z");
    expect("2026-09-10T18:30:00.000Z" <= range.$lte).toBe(true);
    expect("2026-09-11T00:00:00.000Z" <= range.$lte).toBe(false);
  });

  it("includes a legacy date-only stored value on the boundary day", () => {
    const range = buildProductionListQuery({ date_from: "2026-09-10", date_to: "2026-09-10" }).filter.$and[0].production_date;
    expect("2026-09-10" >= range.$gte && "2026-09-10" <= range.$lte).toBe(true);
  });

  it("canonicalises a timestamp with an offset so string comparison still works", () => {
    const range = buildProductionListQuery({ date_from: "2026-09-10T05:30:00+05:30" }).filter.$and[0].production_date;
    expect(range.$gte).toBe("2026-09-10T00:00:00.000Z");
  });

  it("builds one clause carrying both bounds", () => {
    const plan = buildProductionListQuery({ date_from: "2026-09-01", date_to: "2026-09-30" });
    expect(plan.filter.$and).toHaveLength(1);
    expect(Object.keys(plan.filter.$and[0].production_date)).toEqual(["$gte", "$lte"]);
  });
});

describe("fetchProductionList — backward compatibility", () => {
  it("returns a bare array, not an envelope, when no params are given", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({}));
    expect(Array.isArray(result)).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.total).toBeUndefined();
  });

  it("still returns every row including the cascade children", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({}));
    expect(result).toHaveLength(DOCS.length);
    expect(result.map((r) => r.brand_name)).toContain("BOTTOM");
  });

  it("does not skip, limit or count on the unpaginated read", async () => {
    const model = fakeModel(DOCS);
    await fetchProductionList(model, buildProductionListQuery({}));
    expect(model.calls.skip).toHaveLength(0);
    expect(model.calls.limit).toHaveLength(0);
    expect(model.calls.count).toHaveLength(0);
    expect(model.calls.find).toEqual([{}]);
    expect(model.calls.sort).toEqual([{ production_date: -1 }]);
  });

  it("keeps newest-first ordering and strips _id/__v as before", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({}));
    expect(result[0].id).toBe("p-2");
    expect(result[0]._id).toBeUndefined();
    expect(result[0].__v).toBeUndefined();
  });
});

describe("fetchProductionList — paginated envelope", () => {
  it("returns exactly { data, total, page, limit, total_pages }", async () => {
    const model = fakeModel(DOCS);
    const plan = buildProductionListQuery({ page: "1", limit: "1" });
    const result = await fetchProductionList(model, plan);
    expect(Object.keys(result).sort()).toEqual(["data", "limit", "page", "total", "total_pages"]);
  });

  it("counts only the rows the page renders, so page numbers do not lie", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({ page: "1", limit: "10" }));
    // 5 documents, 3 of them cascade children -> 2 visible.
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.total_pages).toBe(1);
  });

  it("counts the same filter the page query used", async () => {
    const model = fakeModel(DOCS);
    const plan = buildProductionListQuery({ page: "1", limit: "1" });
    await fetchProductionList(model, plan);
    expect(model.calls.count).toEqual([plan.filter]);
  });

  it("computes total_pages from the filtered total", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({ page: "1", limit: "1" }));
    expect(result.total).toBe(2);
    expect(result.total_pages).toBe(2);
  });

  it("returns the requested slice", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({ page: "2", limit: "1" }));
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("p-1");
    expect(result.page).toBe(2);
  });

  it("returns an empty page past the end rather than an error, with total intact", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({ page: "99", limit: "10" }));
    expect(result.data).toEqual([]);
    expect(result.total).toBe(2);
  });

  it("reports total_pages 0 for an empty result set", async () => {
    const model = fakeModel([]);
    const result = await fetchProductionList(model, buildProductionListQuery({ page: "1", limit: "50" }));
    expect(result).toMatchObject({ total: 0, total_pages: 0, data: [] });
  });

  it("includes cascade rows in both data and total when asked to", async () => {
    const model = fakeModel(DOCS);
    const result = await fetchProductionList(model, buildProductionListQuery({ page: "1", limit: "10", exclude_cascade: "false" }));
    expect(result.total).toBe(DOCS.length);
    expect(result.data).toHaveLength(DOCS.length);
  });

  it("applies the date range against the stored ISO strings", async () => {
    const model = fakeModel(DOCS);
    const plan = buildProductionListQuery({ page: "1", limit: "10", date_from: "2026-09-11", date_to: "2026-09-11" });
    const result = await fetchProductionList(model, plan);
    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe("p-2");
  });

  it("applies the search filter server-side, not just to the current page", async () => {
    const model = fakeModel(DOCS);
    const plan = buildProductionListQuery({ page: "1", limit: "10", search: "auto" });
    const result = await fetchProductionList(model, plan);
    expect(result.total).toBe(1);
    expect(result.data[0].brand_name).toBe("AUTOCOAT");
  });

  it("honours an allowlisted sort", async () => {
    const model = fakeModel(DOCS);
    const plan = buildProductionListQuery({ page: "1", limit: "10", sort: "brand_name", order: "asc" });
    const result = await fetchProductionList(model, plan);
    expect(result.data.map((r) => r.brand_name)).toEqual(["AUTOCOAT", "SYNCOAT"]);
  });

  it("passes skip and limit straight through to the query", async () => {
    const model = fakeModel(DOCS);
    await fetchProductionList(model, buildProductionListQuery({ page: "3", limit: "20" }));
    expect(model.calls.skip).toEqual([40]);
    expect(model.calls.limit).toEqual([20]);
  });
});

describe("withProductionDefaults", () => {
  it("normalises a missing printing_stock_used to 0", () => {
    const { printing_stock_used, ...without } = row({});
    expect(withProductionDefaults(without).printing_stock_used).toBe(0);
  });

  it("leaves an explicit 0 alone", () => {
    expect(withProductionDefaults(row({ printing_stock_used: 0 })).printing_stock_used).toBe(0);
  });

  it("does not mutate the document it was given", () => {
    const { printing_stock_used, ...without } = row({});
    withProductionDefaults(without);
    expect(without.printing_stock_used).toBeUndefined();
  });

  it("keeps every other field untouched", () => {
    const { printing_stock_used, ...without } = row({ notes: "hello" });
    expect(withProductionDefaults(without)).toMatchObject({ id: "p-1", notes: "hello", brand_name: "SYNCOAT" });
  });

  it("passes null/undefined straight through", () => {
    expect(withProductionDefaults(null)).toBeNull();
    expect(withProductionDefaults(undefined)).toBeUndefined();
  });

  it("is applied to rows in both response shapes", async () => {
    const stripped = DOCS.map(({ printing_stock_used, ...rest }) => rest);
    const bare = await fetchProductionList(fakeModel(stripped), buildProductionListQuery({}));
    const paged = await fetchProductionList(fakeModel(stripped), buildProductionListQuery({ page: "1" }));
    expect(bare.every((r) => r.printing_stock_used === 0)).toBe(true);
    expect(paged.data.every((r) => r.printing_stock_used === 0)).toBe(true);
  });
});
