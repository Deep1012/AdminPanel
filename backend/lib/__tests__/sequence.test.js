const { nextSequence } = require("../sequence");

/**
 * Fake Mongoose Model backed by an in-memory array.
 *
 * `aggregate` reproduces the contract nextSequence depends on: of the documents
 * whose `field` is the prefix followed by digits only, report the largest
 * numeric suffix. `findOne().sort().lean()` reproduces MongoDB's *string* sort,
 * which is what the old per-route generators relied on.
 */
function fakeModel(docs, field) {
  const calls = { pipelines: [] };

  return {
    calls,

    async aggregate(pipeline) {
      calls.pipelines.push(pipeline);

      // Derive the prefix from the $match regex the module built.
      const match = pipeline.find((s) => s.$match);
      const pattern = match.$match[field].$regex;
      const prefix = pattern.replace(/^\^/, "").replace(/\\d\+\$$/, "").replace(/\\(.)/g, "$1");

      const suffixes = docs
        .map((d) => d[field])
        .filter((v) => typeof v === "string" && v.startsWith(prefix))
        .map((v) => v.slice(prefix.length))
        .filter((s) => /^\d+$/.test(s))
        .map((s) => parseInt(s, 10));

      if (suffixes.length === 0) return [];
      return [{ _id: null, max: Math.max(...suffixes) }];
    },

    findOne() {
      return {
        sort() {
          return {
            async lean() {
              const sorted = docs
                .filter((d) => typeof d[field] === "string")
                .slice()
                .sort((a, b) => (a[field] < b[field] ? 1 : a[field] > b[field] ? -1 : 0));
              return sorted[0] || null;
            },
          };
        },
      };
    },
  };
}

/** The buggy implementation this module replaces, kept as a regression witness. */
async function lexicographicNextSequence(Model, field, prefix, width) {
  const last = await Model.findOne({}, { [field]: 1 }).sort({ [field]: -1 }).lean();
  let seq = 1;
  if (last && last[field]) {
    const match = last[field].match(new RegExp(`${prefix}(\\d+)`));
    if (match) seq = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(width, "0")}`;
}

function makeRange(prefix, from, to, width) {
  const out = [];
  for (let i = from; i <= to; i += 1) {
    out.push({ sr_no: `${prefix}${String(i).padStart(width, "0")}` });
  }
  return out;
}

describe("nextSequence", () => {
  it("returns PREFIX-001 on the first-ever call (empty collection)", async () => {
    const Model = fakeModel([], "sr_no");
    await expect(nextSequence(Model, "sr_no", "RM-", 3)).resolves.toBe("RM-001");
  });

  it("increments normally mid-range", async () => {
    const Model = fakeModel(makeRange("RM-", 1, 7, 3), "sr_no");
    await expect(nextSequence(Model, "sr_no", "RM-", 3)).resolves.toBe("RM-008");
  });

  it("crosses the 999 -> 1000 boundary", async () => {
    const Model = fakeModel(makeRange("RM-", 1, 999, 3), "sr_no");
    await expect(nextSequence(Model, "sr_no", "RM-", 3)).resolves.toBe("RM-1000");
  });

  it("keeps counting past the zero-padding width instead of sticking at 1000", async () => {
    const docs = [...makeRange("RM-", 1, 999, 3), { sr_no: "RM-1000" }];
    const Model = fakeModel(docs, "sr_no");
    await expect(nextSequence(Model, "sr_no", "RM-", 3)).resolves.toBe("RM-1001");
  });

  it("widens the padding rather than truncating the number", async () => {
    const Model = fakeModel([{ sr_no: "RM-9999" }], "sr_no");
    // width 3 must not clip "10000" down to three characters.
    await expect(nextSequence(Model, "sr_no", "RM-", 3)).resolves.toBe("RM-10000");
  });

  it("pads to the requested width when the number is shorter", async () => {
    const Model = fakeModel([{ sr_no: "RM-000007" }], "sr_no");
    await expect(nextSequence(Model, "sr_no", "RM-", 6)).resolves.toBe("RM-000008");
  });

  it("a lexicographic implementation produces a duplicate at the boundary; nextSequence does not", async () => {
    const docs = [...makeRange("RM-", 1, 999, 3), { sr_no: "RM-1000" }];
    const existing = new Set(docs.map((d) => d.sr_no));

    const lexical = await lexicographicNextSequence(fakeModel(docs, "sr_no"), "sr_no", "RM-", 3);
    expect(lexical).toBe("RM-1000");
    expect(existing.has(lexical)).toBe(true); // the live bug: silent duplicate

    const fixed = await nextSequence(fakeModel(docs, "sr_no"), "sr_no", "RM-", 3);
    expect(existing.has(fixed)).toBe(false);
    expect(fixed).toBe("RM-1001");
  });

  it("only considers documents matching the given prefix", async () => {
    const docs = [{ sr_no: "RM-005" }, { sr_no: "JOB-900" }, { sr_no: "PO-20260101-400" }];
    await expect(nextSequence(fakeModel(docs, "sr_no"), "sr_no", "RM-", 3)).resolves.toBe("RM-006");
    await expect(nextSequence(fakeModel(docs, "sr_no"), "sr_no", "JOB-", 3)).resolves.toBe("JOB-901");
  });

  it("scopes a per-day PO prefix to that day only", async () => {
    const docs = [
      { sr_no: "PO-20260101-001" },
      { sr_no: "PO-20260101-002" },
      { sr_no: "PO-20260102-007" },
    ];
    await expect(nextSequence(fakeModel(docs, "sr_no"), "sr_no", "PO-20260101-", 3)).resolves.toBe("PO-20260101-003");
    await expect(nextSequence(fakeModel(docs, "sr_no"), "sr_no", "PO-20260103-", 3)).resolves.toBe("PO-20260103-001");
  });

  it("ignores rows whose suffix is not purely numeric", async () => {
    const docs = [{ sr_no: "RM-004" }, { sr_no: "RM-OLD" }, { sr_no: "RM-12A" }];
    await expect(nextSequence(fakeModel(docs, "sr_no"), "sr_no", "RM-", 3)).resolves.toBe("RM-005");
  });

  it("builds an aggregation that filters by field and reduces with $max", async () => {
    const Model = fakeModel([{ sr_no: "RM-001" }], "sr_no");
    await nextSequence(Model, "sr_no", "RM-", 3);

    const pipeline = Model.calls.pipelines[0];
    expect(JSON.stringify(pipeline)).toContain("$max");
    expect(pipeline.some((s) => s.$match && s.$match.sr_no)).toBe(true);
    // It must not fall back to a lexicographic findOne().sort().
    expect(Model.calls.pipelines).toHaveLength(1);
  });

  it("escapes regex metacharacters in the prefix", async () => {
    const docs = [{ sr_no: "R.M-003" }, { sr_no: "RxM-900" }];
    await expect(nextSequence(fakeModel(docs, "sr_no"), "sr_no", "R.M-", 3)).resolves.toBe("R.M-004");
  });

  it("rejects an invalid width rather than emitting a malformed code", async () => {
    const Model = fakeModel([], "sr_no");
    await expect(nextSequence(Model, "sr_no", "RM-", 0)).rejects.toThrow(/width/i);
  });

  it("rejects a missing prefix", async () => {
    const Model = fakeModel([], "sr_no");
    await expect(nextSequence(Model, "sr_no", "", 3)).rejects.toThrow(/prefix/i);
  });
});
