const {
  sheetsFromWeight,
  sheetsAvailable,
  printingStock,
  availablePrintingStock,
  finishedGoodsAvailable,
} = require("../stock");

describe("sheetsFromWeight", () => {
  it("applies the documented formula and floors the result", () => {
    // divisor = 0.18 * 850 * 850 / 100000 * 0.785 = 1.0210...
    // 5000 / 1.0210... = 4897.3... -> 4897
    expect(sheetsFromWeight({ weight: 5000, gauge: 0.18, size1: 850, size2: 850 })).toBe(4897);
  });

  it("floors rather than rounds", () => {
    // divisor = 1 * 100 * 100 / 100000 * 0.785 = 0.0785
    // 1 / 0.0785 = 12.738... -> 12
    expect(sheetsFromWeight({ weight: 1, gauge: 1, size1: 100, size2: 100 })).toBe(12);
  });

  it("returns 0 when the divisor is zero (divide-by-zero path)", () => {
    expect(sheetsFromWeight({ weight: 5000, gauge: 0, size1: 850, size2: 850 })).toBe(0);
    expect(sheetsFromWeight({ weight: 5000, gauge: 0.18, size1: 0, size2: 850 })).toBe(0);
    expect(sheetsFromWeight({ weight: 5000, gauge: 0.18, size1: 850, size2: 0 })).toBe(0);
  });

  it("returns 0 when the divisor is negative", () => {
    expect(sheetsFromWeight({ weight: 5000, gauge: -0.18, size1: 850, size2: 850 })).toBe(0);
  });

  it("returns 0 rather than NaN for null/undefined/non-numeric inputs", () => {
    expect(sheetsFromWeight({})).toBe(0);
    expect(sheetsFromWeight({ weight: null, gauge: null, size1: null, size2: null })).toBe(0);
    expect(sheetsFromWeight({ weight: "abc", gauge: 0.18, size1: 850, size2: 850 })).toBe(0);
    expect(sheetsFromWeight({ weight: 5000, gauge: undefined, size1: 850, size2: 850 })).toBe(0);
  });

  it("returns 0 for a missing argument object", () => {
    expect(sheetsFromWeight()).toBe(0);
    expect(sheetsFromWeight(null)).toBe(0);
  });

  it("returns 0 for a non-positive weight", () => {
    expect(sheetsFromWeight({ weight: 0, gauge: 0.18, size1: 850, size2: 850 })).toBe(0);
    expect(sheetsFromWeight({ weight: -5000, gauge: 0.18, size1: 850, size2: 850 })).toBe(0);
  });

  it("never mutates its input", () => {
    const input = { weight: 5000, gauge: 0.18, size1: 850, size2: 850 };
    const snapshot = { ...input };
    sheetsFromWeight(input);
    expect(input).toEqual(snapshot);
  });
});

describe("sheetsAvailable", () => {
  it("subtracts used from total", () => {
    expect(sheetsAvailable({ no_of_sheets: 500, sheets_used: 120 })).toBe(380);
  });

  it("treats missing fields as 0", () => {
    expect(sheetsAvailable({ no_of_sheets: 500 })).toBe(500);
    expect(sheetsAvailable({ sheets_used: 120 })).toBe(-120);
    expect(sheetsAvailable({})).toBe(0);
    expect(sheetsAvailable()).toBe(0);
  });

  it("treats null as 0 rather than producing NaN", () => {
    expect(sheetsAvailable({ no_of_sheets: null, sheets_used: null })).toBe(0);
    expect(sheetsAvailable({ no_of_sheets: 10, sheets_used: undefined })).toBe(10);
  });

  it("reports an over-consumed material as negative rather than clamping", () => {
    // Surfacing bad data beats hiding it behind a 0.
    expect(sheetsAvailable({ no_of_sheets: 100, sheets_used: 150 })).toBe(-50);
  });
});

describe("printingStock", () => {
  it("multiplies bodies in the job by sheets from the raw material", () => {
    expect(printingStock({ total_bodies: 4, sheets_from_material: 250 })).toBe(1000);
  });

  it("treats missing or null operands as 0", () => {
    expect(printingStock({ total_bodies: 4 })).toBe(0);
    expect(printingStock({ sheets_from_material: 250 })).toBe(0);
    expect(printingStock({ total_bodies: null, sheets_from_material: null })).toBe(0);
    expect(printingStock({})).toBe(0);
    expect(printingStock()).toBe(0);
  });
});

describe("availablePrintingStock", () => {
  it("subtracts production usage from printing done", () => {
    expect(availablePrintingStock(1000, 400)).toBe(600);
  });

  it("treats null/undefined as 0", () => {
    expect(availablePrintingStock(1000)).toBe(1000);
    expect(availablePrintingStock(null, 400)).toBe(-400);
    expect(availablePrintingStock(null, null)).toBe(0);
    expect(availablePrintingStock()).toBe(0);
  });

  it("ignores non-numeric input rather than producing NaN", () => {
    expect(availablePrintingStock("many", 400)).toBe(-400);
    expect(availablePrintingStock(1000, {})).toBe(1000);
  });
});

describe("finishedGoodsAvailable", () => {
  it("subtracts dispatched from produced", () => {
    expect(finishedGoodsAvailable(5000, 1200)).toBe(3800);
  });

  it("treats null/undefined as 0", () => {
    expect(finishedGoodsAvailable(5000)).toBe(5000);
    expect(finishedGoodsAvailable(undefined, 1200)).toBe(-1200);
    expect(finishedGoodsAvailable()).toBe(0);
  });

  it("returns a negative figure when over-dispatched rather than hiding it", () => {
    expect(finishedGoodsAvailable(100, 130)).toBe(-30);
  });
});
