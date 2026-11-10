// Units, categories, products, services and price lists: one set of rules for
// the forms and the APIs. Pure. Prices arrive in rupees and leave in paise.

import { type FieldErrors, FieldReader, HSN_RE, SAC_RE } from "./fields";

type Result<T> = { ok: true; values: T } | { ok: false; errors: FieldErrors };
const done = <T>(r: FieldReader, values: T): Result<T> => (r.ok ? { ok: true, values } : { ok: false, errors: r.errors });

/** Common GST unit quantity codes, added to every workspace the first time units are listed. */
export const DEFAULT_UNITS = [
  { code: "NOS", name: "Numbers", decimalPlaces: 0 },
  { code: "PCS", name: "Pieces", decimalPlaces: 0 },
  { code: "BOX", name: "Box", decimalPlaces: 0 },
  { code: "KGS", name: "Kilograms", decimalPlaces: 3 },
  { code: "GMS", name: "Grams", decimalPlaces: 0 },
  { code: "LTR", name: "Litres", decimalPlaces: 3 },
  { code: "MTR", name: "Metres", decimalPlaces: 2 },
  { code: "HRS", name: "Hours", decimalPlaces: 2 },
  { code: "DAY", name: "Days", decimalPlaces: 0 },
] as const;

export type UnitValues = { code: string; name: string; decimalPlaces: number };

export function validateUnit(raw: Record<string, unknown>): Result<UnitValues> {
  const r = new FieldReader(raw);
  const code = r.text("code", 10, "Enter a short code, e.g. NOS or KGS.");
  const upper = code?.toUpperCase() ?? "";
  if (code && !/^[A-Z][A-Z0-9]{1,9}$/.test(upper)) r.fail("code", "Use 2–10 letters or numbers, starting with a letter.");
  const name = r.text("name", 60, "Enter the unit's name, e.g. Kilograms.");
  const decimalPlaces = r.int("decimalPlaces", 0, 3, "Choose 0 to 3 decimal places.") ?? 0;
  return done(r, { code: upper, name: name!, decimalPlaces });
}

export type CategoryValues = { name: string; parentId: string | null };

export function validateCategory(raw: Record<string, unknown>): Result<CategoryValues> {
  const r = new FieldReader(raw);
  const name = r.text("name", 100, "Enter a category name.");
  const parentId = r.id("parentId");
  return done(r, { name: name!, parentId });
}

/** GST treatment (same values as TAX_CATEGORIES in the schema). */
export const TAX_CATEGORY_OPTIONS = [
  { value: "taxable", label: "Taxable" },
  { value: "exempt", label: "Exempt" },
  { value: "nil_rated", label: "Nil-rated (0%)" },
  { value: "non_gst", label: "Outside GST (non-GST supply)" },
] as const;
export type TaxCategoryValue = (typeof TAX_CATEGORY_OPTIONS)[number]["value"];
const TAX_CATEGORY_VALUES = TAX_CATEGORY_OPTIONS.map((o) => o.value);

/** Category, plus GST and cess rates that are forced to 0 unless taxable. */
function readTax(r: FieldReader, withCess: boolean) {
  const taxCategory = r.oneOf("taxCategory", TAX_CATEGORY_VALUES, "Choose how GST applies.", "taxable");
  const taxRate = r.taxRate();
  const cessRate = withCess ? (r.decimal("cessRate", 4, 400, "Enter a cess rate from 0 to 400.") ?? "0") : "0";
  const taxable = taxCategory === "taxable";
  return { taxCategory, taxRate: taxable ? taxRate : "0", cessRate: taxable ? cessRate : "0" };
}

export type ProductValues = {
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  brand: string | null;
  categoryId: string | null;
  unitId: string;
  hsnCode: string | null;
  taxCategory: TaxCategoryValue;
  taxRate: string;
  cessRate: string;
  salePricePaise: number;
  purchasePricePaise: number;
  trackInventory: boolean;
  minStockQty: string | null;
};

export function validateProduct(raw: Record<string, unknown>): Result<ProductValues> {
  const r = new FieldReader(raw);
  const name = r.text("name", 200, "Enter the product's name.");
  const sku = r.text("sku", 40);
  const barcode = r.code("barcode", /^[A-Z0-9-]{4,40}$/, "Use 4–40 letters, numbers or dashes.", 40);
  const description = r.text("description", 2000);
  const brand = r.text("brand", 100);
  const categoryId = r.id("categoryId");
  const unitId = r.id("unitId", "Choose a unit.");
  const hsnCode = r.code("hsnCode", HSN_RE, "Enter a 4, 6 or 8 digit HSN code.", 8);
  const tax = readTax(r, true);
  const salePricePaise = r.rupees("salePrice") ?? 0;
  const purchasePricePaise = r.rupees("purchasePrice") ?? 0;
  const trackInventory = r.bool("trackInventory");
  const minStock = r.decimal("minStockQty", 3, 1e12, "Enter a quantity, e.g. 10 or 2.5.");
  return done(r, {
    name: name!,
    sku,
    barcode,
    description,
    brand,
    categoryId,
    unitId: unitId!,
    hsnCode,
    ...tax,
    salePricePaise,
    purchasePricePaise,
    trackInventory,
    minStockQty: trackInventory ? minStock : null,
  });
}

export type ServiceValues = {
  name: string;
  code: string | null;
  description: string | null;
  categoryId: string | null;
  unitId: string | null;
  sacCode: string | null;
  taxCategory: TaxCategoryValue;
  taxRate: string;
  ratePaise: number;
};

export function validateService(raw: Record<string, unknown>): Result<ServiceValues> {
  const r = new FieldReader(raw);
  const name = r.text("name", 200, "Enter the service's name.");
  const code = r.text("code", 40);
  const description = r.text("description", 2000);
  const categoryId = r.id("categoryId");
  const unitId = r.id("unitId");
  const sacCode = r.code("sacCode", SAC_RE, "Enter a 6-digit SAC code starting with 99.", 6);
  const { taxCategory, taxRate } = readTax(r, false);
  const ratePaise = r.rupees("rate") ?? 0;
  return done(r, { name: name!, code, description, categoryId, unitId, sacCode, taxCategory, taxRate, ratePaise });
}

export type PriceListValues = { name: string; isDefault: boolean };

export function validatePriceList(raw: Record<string, unknown>): Result<PriceListValues> {
  const r = new FieldReader(raw);
  const name = r.text("name", 100, "Enter a name, e.g. Wholesale.");
  const isDefault = r.bool("isDefault");
  return done(r, { name: name!, isDefault });
}

export type PriceListItemValues = { productId: string | null; serviceId: string | null; pricePaise: number };

export function validatePriceListItem(raw: Record<string, unknown>): Result<PriceListItemValues> {
  const r = new FieldReader(raw);
  const productId = r.id("productId");
  const serviceId = r.id("serviceId");
  if (!productId === !serviceId) r.fail("item", "Choose one product or service.");
  const pricePaise = r.rupees("price", { required: "Enter a price." }) ?? 0;
  return done(r, { productId, serviceId, pricePaise });
}
