import { describe, expect, it } from "vitest";

import {
  validateCategory,
  validatePriceListItem,
  validateProduct,
  validateService,
  validateUnit,
} from "./catalogue-validation";
import { validateCustomer, validateSupplier } from "./contacts-validation";
import { FieldReader, paiseToRupees } from "./fields";

const errorsOf = (r: { ok: boolean; errors?: Record<string, string> }) => (r.ok ? {} : r.errors!);

describe("money and decimals", () => {
  it.each([
    ["1500", 150000],
    ["1,500.5", 150050],
    ["₹ 12.05", 1205],
    [99.99, 9999],
    ["0", 0],
  ])("reads %s as %i paise", (input, paise) => {
    expect(new FieldReader({ v: input }).rupees("v")).toBe(paise);
  });

  it("rejects bad amounts, more than 2 decimals and negatives unless allowed", () => {
    for (const bad of ["abc", "1.234", "-5", "1e5"]) {
      const r = new FieldReader({ v: bad });
      r.rupees("v");
      expect(r.has("v"), bad).toBe(true);
    }
    expect(new FieldReader({ v: "-250.5" }).rupees("v", { allowNegative: true })).toBe(-25050);
  });

  it("formats paise for inputs", () => {
    expect(paiseToRupees(123456)).toBe("1234.56");
    expect(paiseToRupees(5)).toBe("0.05");
    expect(paiseToRupees(-25050)).toBe("-250.50");
    expect(paiseToRupees(null)).toBe("");
  });

  it("normalises tax rates and rejects out-of-range ones", () => {
    expect(new FieldReader({ taxRate: "18.00" }).taxRate()).toBe("18");
    expect(new FieldReader({ taxRate: 0.25 }).taxRate()).toBe("0.25");
    expect(new FieldReader({}).taxRate()).toBe("0");
    const r = new FieldReader({ taxRate: "101" });
    r.taxRate();
    expect(r.has("taxRate")).toBe(true);
  });
});

describe("validateCustomer", () => {
  const base = { name: "Rahul Traders", billingAddress: { countryCode: "IN", stateCode: "27" } };

  it("accepts a minimal customer; place of supply from the billing state", () => {
    const r = validateCustomer(base);
    expect(r.ok && r.values).toMatchObject({
      customerType: "business",
      name: "Rahul Traders",
      placeOfSupply: "27",
      openingBalancePaise: 0,
      shippingAddress: null,
    });
    expect(r.ok && r.values.billingAddress.state).toBe("Maharashtra");
  });

  it("requires a name", () => {
    expect(errorsOf(validateCustomer({ ...base, name: "  " }))).toHaveProperty("name");
  });

  it("upper-cases GSTIN, takes place of supply from it, and cross-checks PAN and state", () => {
    const ok = validateCustomer({ ...base, gstin: "27abcde1234f1z5", pan: "abcde1234f" });
    expect(ok.ok && ok.values).toMatchObject({ gstin: "27ABCDE1234F1Z5", pan: "ABCDE1234F", placeOfSupply: "27" });

    expect(errorsOf(validateCustomer({ ...base, gstin: "27ABCDE1234F1Z5", pan: "ZZZZZ1234F" }))).toHaveProperty("pan");
    expect(errorsOf(validateCustomer({ ...base, gstin: "29ABCDE1234F1Z5" }))).toHaveProperty("billingAddress.stateCode");
    expect(errorsOf(validateCustomer({ ...base, gstin: "99ABCDE1234F1Z5" }))).toHaveProperty("gstin");
    expect(errorsOf(validateCustomer({ ...base, gstin: "BAD" }))).toHaveProperty("gstin");
    expect(errorsOf(validateCustomer({ name: "X", gstin: "27ABCDE1234F1Z5", billingAddress: { countryCode: "US" } }))).toHaveProperty(
      "billingAddress.countryCode",
    );
  });

  it("checks PIN codes, states, email, terms and amounts", () => {
    const e = errorsOf(
      validateCustomer({
        name: "X",
        email: "nope",
        paymentTermsDays: 400,
        creditLimit: "-5",
        billingAddress: { countryCode: "IN", stateCode: "55", postalCode: "123" },
      }),
    );
    expect(Object.keys(e).sort()).toEqual(
      ["billingAddress.postalCode", "billingAddress.stateCode", "creditLimit", "email", "paymentTermsDays"].sort(),
    );
  });

  it("keeps a separate shipping address and drops a blank one", () => {
    const withShip = validateCustomer({ ...base, shippingAddress: { countryCode: "IN", stateCode: "29", city: "Bengaluru" } });
    expect(withShip.ok && withShip.values.shippingAddress?.state).toBe("Karnataka");
    const blank = validateCustomer({ ...base, shippingAddress: { countryCode: "IN" } });
    expect(blank.ok && blank.values.shippingAddress).toBeNull();
  });

  it("has no place of supply for customers abroad", () => {
    const r = validateCustomer({ name: "Acme Inc", customerType: "business", billingAddress: { countryCode: "US", state: "CA" } });
    expect(r.ok && r.values).toMatchObject({ placeOfSupply: null });
    expect(r.ok && r.values.billingAddress).toMatchObject({ state: "CA", stateCode: null });
  });
});

describe("validateSupplier", () => {
  it("accepts bank details and a flat address", () => {
    const r = validateSupplier({
      name: "Steel Co",
      bankIfsc: "hdfc0001234",
      bankAccountNumber: "001234567890",
      countryCode: "IN",
      stateCode: "24",
    });
    expect(r.ok && r.values).toMatchObject({ bankIfsc: "HDFC0001234", state: "Gujarat", stateCode: "24" });
  });

  it("rejects a bad IFSC, account number and a GSTIN from another state", () => {
    const e = errorsOf(
      validateSupplier({ name: "S", bankIfsc: "HDFC1234", bankAccountNumber: "12", gstin: "27ABCDE1234F1Z5", countryCode: "IN", stateCode: "24" }),
    );
    expect(e).toHaveProperty("bankIfsc");
    expect(e).toHaveProperty("bankAccountNumber");
    expect(e).toHaveProperty("stateCode");
  });
});

describe("catalogue validation", () => {
  it("units: upper-case code, 0–3 decimals", () => {
    expect(validateUnit({ code: "kgs", name: "Kilograms", decimalPlaces: 3 })).toEqual({
      ok: true,
      values: { code: "KGS", name: "Kilograms", decimalPlaces: 3 },
    });
    expect(errorsOf(validateUnit({ code: "1X", name: "", decimalPlaces: 5 }))).toEqual({
      code: expect.any(String),
      name: expect.any(String),
      decimalPlaces: expect.any(String),
    });
  });

  it("categories need a name", () => {
    expect(errorsOf(validateCategory({}))).toHaveProperty("name");
  });

  it("products: prices to paise, HSN digits, unit required, min stock only when tracked", () => {
    const r = validateProduct({ name: "Steel rod", unitId: "u1", salePrice: "1,250.50", hsnCode: "7214", taxRate: "18", minStockQty: "5" });
    expect(r.ok && r.values).toMatchObject({ salePricePaise: 125050, purchasePricePaise: 0, hsnCode: "7214", taxRate: "18", trackInventory: false, minStockQty: null });
    const tracked = validateProduct({ name: "Rod", unitId: "u1", trackInventory: true, minStockQty: "2.5" });
    expect(tracked.ok && tracked.values.minStockQty).toBe("2.5");
    expect(errorsOf(validateProduct({ name: "X", hsnCode: "12345" }))).toEqual({ unitId: expect.any(String), hsnCode: expect.any(String) });
  });

  it("services: SAC starts with 99", () => {
    expect(validateService({ name: "Consulting", sacCode: "998311", rate: 2000 }).ok).toBe(true);
    expect(errorsOf(validateService({ name: "Consulting", sacCode: "123456" }))).toHaveProperty("sacCode");
  });

  it("price list items: exactly one of product or service, and a price", () => {
    expect(validatePriceListItem({ productId: "p", price: "10" })).toEqual({ ok: true, values: { productId: "p", serviceId: null, pricePaise: 1000 } });
    expect(errorsOf(validatePriceListItem({ productId: "p", serviceId: "s", price: "10" }))).toHaveProperty("item");
    expect(errorsOf(validatePriceListItem({ price: "10" }))).toHaveProperty("item");
    expect(errorsOf(validatePriceListItem({ productId: "p" }))).toHaveProperty("price");
  });
});
