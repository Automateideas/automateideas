import { describe, expect, it } from "vitest";

import { allocate, mulDivRound, toScaled } from "./decimal";
import { type DocumentTaxInput, type LineInput, TaxInputError, calculateGst } from "./gst";
import { gstRatesOn } from "./rates";

// Expected values below are worked out by hand (paise). ₹1 = 100 paise.

const doc = (lines: LineInput[], over: Partial<DocumentTaxInput> = {}): DocumentTaxInput => ({
  sellerStateCode: "27",
  sellerRegistered: true,
  placeOfSupply: "27",
  pricesIncludeTax: false,
  roundOff: "none",
  lines,
  ...over,
});
const line = (over: Partial<LineInput> = {}): LineInput => ({ quantity: "1", ratePaise: 10000, taxRate: "18", ...over });

function fieldOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof TaxInputError) return e.field;
    throw e;
  }
  return null;
}

describe("decimal helpers", () => {
  it("parses decimals exactly", () => {
    expect(toScaled("18", 4)).toBe(BigInt(180000));
    expect(toScaled("0.25", 4)).toBe(BigInt(2500));
    expect(toScaled("1.250", 3)).toBe(BigInt(1250));
    expect(toScaled("1.2345", 3)).toBeNull();
    expect(toScaled("-1", 3)).toBeNull();
    expect(toScaled("1e3", 3)).toBeNull();
  });

  it("rounds halves away from zero", () => {
    expect(mulDivRound(BigInt(5), BigInt(1), BigInt(10))).toBe(BigInt(1)); // 0.5 → 1
    expect(mulDivRound(BigInt(4), BigInt(1), BigInt(10))).toBe(BigInt(0));
    expect(mulDivRound(BigInt(15), BigInt(1), BigInt(10))).toBe(BigInt(2)); // 1.5 → 2
    expect(mulDivRound(-BigInt(15), BigInt(1), BigInt(10))).toBe(-BigInt(2));
  });

  it("splits amounts exactly", () => {
    expect(allocate(BigInt(100), [BigInt(1000), BigInt(1000), BigInt(1000)])).toEqual([BigInt(34), BigInt(33), BigInt(33)]);
    expect(allocate(BigInt(10000), [BigInt(30000), BigInt(70000)])).toEqual([BigInt(3000), BigInt(7000)]);
    expect(allocate(BigInt(7), [BigInt(0), BigInt(5), BigInt(5)])).toEqual([BigInt(0), BigInt(4), BigInt(3)]);
    expect(allocate(BigInt(0), [BigInt(1), BigInt(2)])).toEqual([BigInt(0), BigInt(0)]);
  });
});

describe("intra- and inter-state", () => {
  it("same state: CGST + SGST, half each", () => {
    const r = calculateGst(doc([line({ quantity: "2", ratePaise: 50000 })]));
    expect(r).toMatchObject({ supplyType: "intra_state", grossPaise: 100000, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, taxPaise: 18000, totalPaise: 118000 });
  });

  it("different state: IGST", () => {
    const r = calculateGst(doc([line({ quantity: "2", ratePaise: 50000 })], { placeOfSupply: "29" }));
    expect(r).toMatchObject({ supplyType: "inter_state", cgstPaise: 0, sgstPaise: 0, igstPaise: 18000, totalPaise: 118000 });
  });

  it("rounds each tax component to the paisa", () => {
    // ₹99.99 at 18%: 9% of 9999 = 899.91 → 900, twice.
    const r = calculateGst(doc([line({ ratePaise: 9999 })]));
    expect(r).toMatchObject({ cgstPaise: 900, sgstPaise: 900, totalPaise: 11799 });
  });

  it("needs the seller's state when registered and selling in India", () => {
    expect(fieldOf(() => calculateGst(doc([line()], { sellerStateCode: null })))).toBe("sellerStateCode");
  });
});

describe("prices including GST", () => {
  it("works the taxable value back out", () => {
    const r = calculateGst(doc([line({ ratePaise: 11800 })], { pricesIncludeTax: true }));
    expect(r).toMatchObject({ taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900, totalPaise: 11800 });
  });

  it("keeps the line total equal to the entered price when it doesn't divide evenly", () => {
    // ₹100 incl. 18%: 10000/1.18 = 8474.58 → 8475; 9% → 762.75 → 763 each; taxable becomes 10000 − 1526.
    const r = calculateGst(doc([line({ ratePaise: 10000 })], { pricesIncludeTax: true }));
    expect(r).toMatchObject({ taxablePaise: 8474, cgstPaise: 763, sgstPaise: 763, totalPaise: 10000 });
  });

  it("inter-state inclusive", () => {
    const r = calculateGst(doc([line({ ratePaise: 10500, taxRate: "5" })], { pricesIncludeTax: true, placeOfSupply: "07" }));
    expect(r).toMatchObject({ taxablePaise: 10000, igstPaise: 500, totalPaise: 10500 });
  });
});

describe("discounts", () => {
  it("item discount by percent and amount", () => {
    const pct = calculateGst(doc([line({ ratePaise: 100000, discount: { type: "percent", percent: "10" } })], { placeOfSupply: "29" }));
    expect(pct).toMatchObject({ itemDiscountPaise: 10000, taxablePaise: 90000, igstPaise: 16200, totalPaise: 106200 });
    const amt = calculateGst(doc([line({ ratePaise: 100000, discount: { type: "amount", paise: 2500 } })]));
    expect(amt).toMatchObject({ itemDiscountPaise: 2500, taxablePaise: 97500, cgstPaise: 8775, sgstPaise: 8775 });
  });

  it("invoice discount is split by value, so each rate is taxed on its reduced value", () => {
    const r = calculateGst(
      doc([line({ ratePaise: 30000, taxRate: "5" }), line({ ratePaise: 70000, taxRate: "18" })], {
        placeOfSupply: "29",
        invoiceDiscount: { type: "amount", paise: 10000 },
      }),
    );
    expect(r.lines.map((l) => [l.invoiceDiscountPaise, l.taxablePaise, l.igstPaise])).toEqual([
      [3000, 27000, 1350],
      [7000, 63000, 11340],
    ]);
    expect(r).toMatchObject({ invoiceDiscountPaise: 10000, taxablePaise: 90000, igstPaise: 12690, totalPaise: 102690 });
  });

  it("percent invoice discount after item discounts; odd paise land exactly", () => {
    const r = calculateGst(
      doc([line({ ratePaise: 1000 }), line({ ratePaise: 1000 }), line({ ratePaise: 1000 })], { invoiceDiscount: { type: "amount", paise: 100 } }),
    );
    expect(r.lines.map((l) => l.invoiceDiscountPaise)).toEqual([34, 33, 33]);
    const pct = calculateGst(doc([line({ ratePaise: 20000, discount: { type: "percent", percent: "50" } })], { invoiceDiscount: { type: "percent", percent: "10" } }));
    expect(pct).toMatchObject({ itemDiscountPaise: 10000, invoiceDiscountPaise: 1000, taxablePaise: 9000 });
  });

  it("refuses discounts bigger than the amount", () => {
    expect(fieldOf(() => calculateGst(doc([line({ discount: { type: "amount", paise: 10001 } })])))).toBe("lines.0.discount");
    expect(fieldOf(() => calculateGst(doc([line()], { invoiceDiscount: { type: "percent", percent: "101" } })))).toBe("invoiceDiscount");
  });
});

describe("categories, cess and charges", () => {
  it("exempt, nil-rated and non-GST lines carry no tax and are reported separately", () => {
    const r = calculateGst(
      doc([
        line({ ratePaise: 10000 }),
        line({ ratePaise: 5000, taxCategory: "exempt" }),
        line({ ratePaise: 3000, taxCategory: "nil_rated", taxRate: "5" }),
        line({ ratePaise: 2000, taxCategory: "non_gst" }),
      ]),
    );
    expect(r).toMatchObject({ exemptPaise: 5000, nilRatedPaise: 3000, nonGstPaise: 2000, taxPaise: 1800, totalPaise: 21800 });
    expect(r.lines[2].appliedTaxRate).toBe("0");
    expect(r.byRate).toEqual([{ taxRate: "18", taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, cessPaise: 0 }]);
  });

  it("cess on top of GST", () => {
    const r = calculateGst(doc([line({ ratePaise: 100000, taxRate: "28", cessRate: "12" })]));
    expect(r).toMatchObject({ cgstPaise: 14000, sgstPaise: 14000, cessPaise: 12000, totalPaise: 140000 });
  });

  it("additional charges get their own rate and no invoice discount", () => {
    const r = calculateGst(
      doc([line({ ratePaise: 10000 })], { charges: [{ label: "Shipping", amountPaise: 10000, taxRate: "18" }], invoiceDiscount: { type: "amount", paise: 1000 } }),
    );
    expect(r.charges[0]).toMatchObject({ label: "Shipping", taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900, totalPaise: 11800 });
    expect(r).toMatchObject({ taxablePaise: 19000, taxPaise: 3420, totalPaise: 22420 });
    expect(fieldOf(() => calculateGst(doc([line()], { charges: [{ label: " ", amountPaise: 1, taxRate: "0" }] })))).toBe("charges.0.label");
  });

  it("decimal quantities", () => {
    // 1.250 kg × ₹80 = ₹100
    expect(calculateGst(doc([line({ quantity: "1.250", ratePaise: 8000, taxRate: "5" })])).taxablePaise).toBe(10000);
    expect(fieldOf(() => calculateGst(doc([line({ quantity: "1.2345" })])))).toBe("lines.0.quantity");
    expect(fieldOf(() => calculateGst(doc([line({ quantity: "-1" })])))).toBe("lines.0.quantity");
  });
});

describe("special supplies", () => {
  it("sellers without GST registration charge no GST", () => {
    const r = calculateGst(doc([line()], { sellerRegistered: false, sellerStateCode: null }));
    expect(r).toMatchObject({ taxPaise: 0, totalPaise: 10000 });
  });

  it("exports under LUT carry no tax; with payment they carry IGST", () => {
    const lut = calculateGst(doc([line()], { placeOfSupply: "96", zeroRated: "lut" }));
    expect(lut).toMatchObject({ supplyType: "export", taxPaise: 0, totalPaise: 10000 });
    const paid = calculateGst(doc([line()], { placeOfSupply: null, zeroRated: "with_payment" }));
    expect(paid).toMatchObject({ supplyType: "export", igstPaise: 1800, cgstPaise: 0 });
  });

  it("SEZ supplies in the same state are inter-state (IGST)", () => {
    const r = calculateGst(doc([line()], { placeOfSupply: "27", zeroRated: "with_payment" }));
    expect(r).toMatchObject({ supplyType: "inter_state", igstPaise: 1800, cgstPaise: 0 });
    expect(calculateGst(doc([line()], { zeroRated: "lut" })).taxPaise).toBe(0);
  });

  it("reverse charge: tax shown but not added to the total", () => {
    const r = calculateGst(doc([line({ ratePaise: 100000 })], { placeOfSupply: "29", reverseCharge: true }));
    expect(r).toMatchObject({ igstPaise: 18000, taxPaise: 18000, reverseChargeTaxPaise: 18000, totalPaise: 100000 });
    expect(fieldOf(() => calculateGst(doc([line()], { reverseCharge: true, pricesIncludeTax: true })))).toBe("pricesIncludeTax");
  });
});

describe("round-off", () => {
  it.each([
    [12350, 12400, 50],
    [12349, 12300, -49],
    [11799, 11800, 1],
    [10000, 10000, 0],
  ])("%i paise → %i (%i)", (amount, total, roundOff) => {
    const r = calculateGst(doc([line({ ratePaise: amount, taxRate: "0" })], { roundOff: "nearest_rupee" }));
    expect(r).toMatchObject({ totalPaise: total, roundOffPaise: roundOff });
  });
});

describe("input checks", () => {
  it("needs items and sane numbers", () => {
    expect(fieldOf(() => calculateGst(doc([])))).toBe("lines");
    expect(fieldOf(() => calculateGst(doc([line({ ratePaise: -1 })])))).toBe("lines.0.rate");
    expect(fieldOf(() => calculateGst(doc([line({ ratePaise: 1.5 })])))).toBe("lines.0.rate");
    expect(fieldOf(() => calculateGst(doc([line({ taxRate: "101" })])))).toBe("lines.0.taxRate");
    expect(fieldOf(() => calculateGst(doc([line({ taxCategory: "weird" as never })])))).toBe("lines.0.taxCategory");
  });
});

describe("invariants over 2,000 random documents", () => {
  // Small deterministic PRNG so failures are reproducible.
  let seed = 42;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const RATES = ["0", "0.25", "3", "5", "12", "18", "28", "40"];

  it("totals always add up", () => {
    for (let k = 0; k < 2000; k++) {
      const inclusive = rand(2) === 1;
      const reverseCharge = !inclusive && rand(10) === 0;
      const lines: LineInput[] = Array.from({ length: 1 + rand(6) }, () => ({
        quantity: `${rand(50)}.${rand(1000)}`,
        ratePaise: rand(5_000_000),
        taxRate: RATES[rand(RATES.length)],
        cessRate: rand(8) === 0 ? String(rand(30)) : "0",
        taxCategory: (["taxable", "taxable", "taxable", "exempt", "nil_rated", "non_gst"] as const)[rand(6)],
        discount: rand(3) === 0 ? { type: "percent", percent: `${rand(100)}` } : null,
      }));
      const input = doc(lines, {
        pricesIncludeTax: inclusive,
        reverseCharge,
        placeOfSupply: rand(2) ? "27" : "29",
        roundOff: rand(2) ? "nearest_rupee" : "none",
        invoiceDiscount: rand(4) === 0 ? { type: "percent", percent: `${rand(30)}` } : null,
        charges: rand(3) === 0 ? [{ label: "Freight", amountPaise: rand(100000), taxRate: "18" }] : [],
      });
      const r = calculateGst(input);

      const tax = r.cgstPaise + r.sgstPaise + r.igstPaise + r.cessPaise;
      expect(r.taxPaise).toBe(tax);
      expect(r.totalPaise).toBe(r.taxablePaise + (reverseCharge ? 0 : tax) + r.roundOffPaise);
      expect(Math.abs(r.roundOffPaise)).toBeLessThanOrEqual(50);
      if (input.roundOff === "nearest_rupee") expect(r.totalPaise % 100).toBe(0);
      expect(r.invoiceDiscountPaise).toBe(r.lines.reduce((a, l) => a + l.invoiceDiscountPaise, 0));
      for (const l of r.lines) {
        const net = l.grossPaise - l.itemDiscountPaise - l.invoiceDiscountPaise;
        expect(l.taxablePaise).toBeGreaterThanOrEqual(0);
        if (inclusive) expect(l.totalPaise).toBe(net);
        else expect(l.taxablePaise).toBe(net);
        if (r.supplyType === "intra_state") {
          expect(l.cgstPaise).toBe(l.sgstPaise);
          expect(l.igstPaise).toBe(0);
        } else {
          expect(l.cgstPaise + l.sgstPaise).toBe(0);
        }
        if (l.taxCategory !== "taxable") expect(l.totalPaise - l.taxablePaise).toBe(0);
      }
    }
  });
});

describe("rate schedules", () => {
  it("offers the slabs in force on a date", () => {
    expect(gstRatesOn("2024-04-01")).not.toContain("40");
    expect(gstRatesOn("2025-09-22")).toContain("40");
    expect(gstRatesOn("2017-01-01")).toContain("28");
  });
});
