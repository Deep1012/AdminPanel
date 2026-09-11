/**
 * In-memory stand-in for the Production model, shared by the route tests.
 *
 * Not a test file (no .test.js suffix), so jest does not collect it. It
 * reproduces the slice of the Mongoose query API the route uses —
 * find(filter, projection).sort().skip().limit().lean() and
 * countDocuments(filter) — and really evaluates the filter, so a wrong filter
 * shape fails the test instead of passing silently.
 */

const DOCS = [
  { _id: "oid-1", __v: 0, id: "p-1", brand_name: "SYNCOAT", size_name: "4LTR/5KG", quantity_produced: 10, printing_stock_used: 10, parent_production_id: null, production_date: "2026-09-10T00:00:00.000Z", created_by: "admin" },
  { _id: "oid-2", __v: 0, id: "p-2", brand_name: "AUTOCOAT", size_name: "1LTR", quantity_produced: 20, printing_stock_used: 20, parent_production_id: null, production_date: "2026-09-11T00:00:00.000Z", created_by: "admin" },
  { _id: "oid-3", __v: 0, id: "c-1", brand_name: "BOTTOM", size_name: "4LTR/5KG", quantity_produced: 10, printing_stock_used: 10, parent_production_id: "p-1", production_date: "2026-09-10T00:00:00.000Z", created_by: "admin" },
];

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
      throw new Error(`productionFakeStore: unsupported operator ${operator}`);
    });
  }
  return value === condition;
}

function matches(doc, clause) {
  return Object.entries(clause || {}).every(([key, condition]) => {
    if (key === "$and") return condition.every((c) => matches(doc, c));
    if (key === "$or") return condition.some((c) => matches(doc, c));
    return matchesCondition(doc[key], condition);
  });
}

function matchAll(docs, filter) {
  return docs.filter((doc) => matches(doc, filter));
}

/** A fake Mongoose Model over `docs` (defaults to the shared fixture). */
function fakeProductionModel(docs = DOCS) {
  return {
    find(filter, projection) {
      let rows = matchAll(docs, filter).map((doc) => {
        const copy = { ...doc };
        for (const key of Object.keys(projection || {})) delete copy[key];
        return copy;
      });

      const query = {
        sort(spec) {
          const entries = Object.entries(spec || {});
          rows = [...rows].sort((a, b) => {
            for (const [field, direction] of entries) {
              if (a[field] === b[field]) continue;
              return a[field] < b[field] ? -direction : direction;
            }
            return 0;
          });
          return query;
        },
        skip(n) {
          rows = rows.slice(n);
          return query;
        },
        limit(n) {
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
      return matchAll(docs, filter).length;
    },
  };
}

module.exports = { DOCS, matchAll, fakeProductionModel };
