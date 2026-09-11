/**
 * Query planning for GET /api/production.
 *
 * Production is the only collection that grows fast: the cascade writes 4 rows
 * per normal-brand entry and 6 for an LWBF brand, so it grows 4-6x faster than
 * entries are made (1,420 rows against 147 dispatches at the time of writing).
 * It alone gets server-side pagination; every other collection stays
 * client-paginated deliberately.
 *
 * BACKWARD COMPATIBILITY IS THE HARD CONSTRAINT. Without `page` or `limit` the
 * route still answers with a bare array over the whole collection, because
 * other readers (the Finished Goods page, the dashboard) consume that array and
 * need the cascade rows in it. The envelope only appears once the caller opts
 * in by sending `page` or `limit`.
 */

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const DEFAULT_PAGE = 1;

/**
 * Brand names that carry auto-cascaded production rows.
 *
 * The Production page hides these by BRAND NAME, not by `parent_production_id`
 * (see frontend/src/pages/Production.jsx: EXCLUDED_BRAND_NAMES). That is a
 * superset of the parent-linked rows — a BOTTOM row entered by hand has no
 * parent but is still hidden — so the server filter has to match on brand name
 * too, or `total` would count rows the page never renders and the page numbers
 * would lie.
 */
const CASCADE_BRAND_NAMES = ["BOTTOM", "TOP", "LID", "BOTTOM LWBF", "LID LWBF"];

/**
 * Sortable fields, allowlisted against real schema fields.
 *
 * A user-supplied string must never reach .sort() unchecked: it is an injection
 * surface, and an unknown field silently yields a meaningless order rather than
 * an error. These are exactly the columns the Production table offers as
 * SortableHeader keys.
 */
const SORTABLE_FIELDS = ["production_date", "brand_name", "size_name", "quantity_produced", "printing_stock_used"];

// Existing default ordering, preserved when no `sort` is given.
const DEFAULT_SORT_FIELD = "production_date";
const DEFAULT_SORT_ORDER = "desc";

const PROJECTION = Object.freeze({ _id: 0, __v: 0 });

// Fields the Production page's search box covers.
const SEARCH_FIELDS = ["brand_name", "size_name", "created_by"];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

const TRUE_VALUES = ["true", "1"];
const FALSE_VALUES = ["false", "0"];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactInsensitive(value) {
  return new RegExp(`^${escapeRegex(value)}$`, "i");
}

function containsInsensitive(value) {
  return new RegExp(escapeRegex(value), "i");
}

function isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim() === "";
}

/** Integer param in [min, max], or an error naming the parameter. */
function readInteger(raw, name, min, max) {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    return { error: `${name} must be an integer between ${min} and ${max}` };
  }
  const value = parseInt(text, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { error: `${name} must be an integer between ${min} and ${max}` };
  }
  return { value };
}

function readBoolean(raw, name) {
  const text = String(raw).trim().toLowerCase();
  if (TRUE_VALUES.includes(text)) return { value: true };
  if (FALSE_VALUES.includes(text)) return { value: false };
  return { error: `${name} must be "true" or "false"` };
}

/**
 * `production_date` is stored as an ISO String, not a Date, so the range filter
 * compares strings. That is correct for canonical ISO-8601 UTC values because
 * they sort lexicographically in chronological order — the same window
 * semantics routes/admin.js applies to its Date-typed `timestamp` with
 * $gte/$lte, including the end-of-day upper bound.
 *
 * A bare "YYYY-MM-DD" is used verbatim as the lower bound: it sorts before
 * every "YYYY-MM-DDT..." timestamp on that day, so the whole calendar day is
 * included, and a legacy date-only stored value matches too. The upper bound
 * gets the end of the day appended. Anything more specific is canonicalised
 * through toISOString() so an offset like +05:30 still compares correctly.
 */
function readDateBound(raw, name, edge) {
  const text = String(raw).trim();
  if (!DATE_PREFIX.test(text)) {
    return { error: `${name} must be a date in YYYY-MM-DD form` };
  }
  if (DATE_ONLY.test(text)) {
    return { value: edge === "lower" ? text : `${text}T23:59:59.999Z` };
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return { error: `${name} must be a date in YYYY-MM-DD form` };
  }
  return { value: parsed.toISOString() };
}

/**
 * Plan a GET /api/production read from its query string.
 *
 * @param {Object} query Raw req.query (all values strings or undefined).
 * @returns {{ error: string } | {
 *   paginated: boolean, filter: Object, sort: Object,
 *   page: number, limit: number, skip: number
 * }}
 */
function buildProductionListQuery(query = {}) {
  const raw = query || {};
  const paginated = !isBlank(raw.page) || !isBlank(raw.limit);

  let page = DEFAULT_PAGE;
  if (!isBlank(raw.page)) {
    const parsed = readInteger(raw.page, "page", 1, Number.MAX_SAFE_INTEGER);
    if (parsed.error) return { error: "page must be an integer greater than 0" };
    page = parsed.value;
  }

  let limit = DEFAULT_LIMIT;
  if (!isBlank(raw.limit)) {
    const parsed = readInteger(raw.limit, "limit", 1, MAX_LIMIT);
    if (parsed.error) return { error: parsed.error };
    limit = parsed.value;
  }

  let sortField = DEFAULT_SORT_FIELD;
  if (!isBlank(raw.sort)) {
    const requested = String(raw.sort).trim();
    if (!SORTABLE_FIELDS.includes(requested)) {
      return { error: `sort must be one of: ${SORTABLE_FIELDS.join(", ")}` };
    }
    sortField = requested;
  }

  let sortOrder = DEFAULT_SORT_ORDER;
  if (!isBlank(raw.order)) {
    const requested = String(raw.order).trim().toLowerCase();
    if (requested !== "asc" && requested !== "desc") {
      return { error: "order must be \"asc\" or \"desc\"" };
    }
    sortOrder = requested;
  }

  // Cascade rows are included by default on the legacy (unpaginated) read so
  // its response is unchanged, and excluded by default once paginated so
  // `total` agrees with what the Production page renders.
  let excludeCascade = paginated;
  if (!isBlank(raw.exclude_cascade)) {
    const parsed = readBoolean(raw.exclude_cascade, "exclude_cascade");
    if (parsed.error) return { error: parsed.error };
    excludeCascade = parsed.value;
  }

  const clauses = [];

  if (excludeCascade) {
    clauses.push({ brand_name: { $nin: CASCADE_BRAND_NAMES.map(exactInsensitive) } });
  }
  if (!isBlank(raw.brand_name)) {
    clauses.push({ brand_name: exactInsensitive(String(raw.brand_name).trim()) });
  }
  if (!isBlank(raw.size_name)) {
    clauses.push({ size_name: exactInsensitive(String(raw.size_name).trim()) });
  }
  if (!isBlank(raw.search)) {
    const needle = containsInsensitive(String(raw.search).trim());
    clauses.push({ $or: SEARCH_FIELDS.map((field) => ({ [field]: needle })) });
  }

  const dateRange = {};
  if (!isBlank(raw.date_from)) {
    const bound = readDateBound(raw.date_from, "date_from", "lower");
    if (bound.error) return { error: bound.error };
    dateRange.$gte = bound.value;
  }
  if (!isBlank(raw.date_to)) {
    const bound = readDateBound(raw.date_to, "date_to", "upper");
    if (bound.error) return { error: bound.error };
    dateRange.$lte = bound.value;
  }
  if (Object.keys(dateRange).length > 0) {
    clauses.push({ production_date: dateRange });
  }

  // Paged reads need a deterministic total order: 1,420 rows share a handful of
  // production_date values, and skip/limit over a non-unique sort key can
  // repeat or drop rows between pages. `id` is unique, so it breaks every tie.
  // The unpaginated read keeps exactly the sort it has always used.
  const sortDirection = sortOrder === "asc" ? 1 : -1;
  const sort = paginated
    ? { [sortField]: sortDirection, id: 1 }
    : { [sortField]: sortDirection };

  return {
    paginated,
    filter: clauses.length === 0 ? {} : { $and: clauses },
    sort,
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

/**
 * `printing_stock_used` defaulted to 0 only from a later schema revision, so
 * documents written before it exist without the field. Normalised into a new
 * object rather than written back onto the lean document.
 */
function withProductionDefaults(entry) {
  if (!entry) return entry;
  if (entry.printing_stock_used !== undefined) return entry;
  return { ...entry, printing_stock_used: 0 };
}

/**
 * Run a plan from buildProductionListQuery against the Production model.
 *
 * COUNT STRATEGY: a parallel countDocuments, not an aggregation $facet.
 * countDocuments can answer straight from the same index the find() uses,
 * whereas $facet streams every matching document through its sub-pipelines and
 * caps each facet's output at the 16MB document limit; it also cannot be
 * expressed with .sort()/.skip()/.limit() so the whole query would have to be
 * rewritten as a pipeline. Two parallel round trips is what
 * GET /api/admin/activity-logs already does, so this stays consistent with the
 * in-repo precedent at a dataset size where neither choice is measurable.
 *
 * @returns {Promise<Array|{ data: Array, total: number, page: number, limit: number, total_pages: number }>}
 */
async function fetchProductionList(model, plan) {
  if (!plan.paginated) {
    const entries = await model.find(plan.filter, PROJECTION).sort(plan.sort).lean();
    return entries.map(withProductionDefaults);
  }

  const [entries, total] = await Promise.all([
    model.find(plan.filter, PROJECTION).sort(plan.sort).skip(plan.skip).limit(plan.limit).lean(),
    model.countDocuments(plan.filter),
  ]);

  return {
    data: entries.map(withProductionDefaults),
    total,
    page: plan.page,
    limit: plan.limit,
    total_pages: Math.ceil(total / plan.limit),
  };
}

module.exports = {
  MAX_LIMIT,
  DEFAULT_LIMIT,
  CASCADE_BRAND_NAMES,
  SORTABLE_FIELDS,
  buildProductionListQuery,
  fetchProductionList,
  withProductionDefaults,
};
