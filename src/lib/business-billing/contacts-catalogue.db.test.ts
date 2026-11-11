import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import {
  createCategory,
  createProduct,
  createService,
  listCategories,
  listProducts,
  listUnits,
  setProductArchived,
  setUnitArchived,
  updateCategory,
  updateProduct,
} from "./catalogue";
import { validateCustomer, validateSupplier } from "./contacts-validation";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
} from "./customers";
import { createPriceList, getPriceList, listPriceLists, removePriceListItem, setPriceListArchived, upsertPriceListItem } from "./price-lists";
import type { ListQuery } from "./records";
import { createSupplier, listSuppliers, setSupplierArchived } from "./suppliers";

// Real database: customers, suppliers and catalogue services, run as two
// throwaway tenants (removed in afterAll).

const stamp = Date.now().toString(36);
const A = `cattest-a-${stamp}`;
const B = `cattest-b-${stamp}`;
const USER = null as unknown as string; // created_by is nullable; no user row needed
const q = (over: Partial<ListQuery> = {}): ListQuery => ({ q: null, status: "active", page: 1, pageSize: 25, ...over });

const customer = (over: Record<string, unknown> = {}) => {
  const r = validateCustomer({ name: "Rahul Traders", billingAddress: { countryCode: "IN", stateCode: "27", city: "Pune" }, ...over });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.values;
};

/** The API error code a promise fails with. */
async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String(e);
  }
}

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Catalogue Test A", slug: A, createdAt: new Date() },
    { id: B, name: "Catalogue Test B", slug: B, createdAt: new Date() },
  ]);
});

// Customers and suppliers now post opening balances to the journal, so clean every tenant table.
afterAll(() => removeTestTenants([A, B]));

describe("customers", () => {
  let id = "";

  it("creates with billing and shipping addresses", async () => {
    const c = await createCustomer(A, USER, customer({ gstin: "27ABCDE1234F1Z5", email: "rahul@example.test", phone: "+91 98765 43210", shippingAddress: { countryCode: "IN", stateCode: "29", city: "Bengaluru" } }));
    id = c.id;
    expect(c).toMatchObject({ name: "Rahul Traders", placeOfSupply: "27", gstin: "27ABCDE1234F1Z5" });
    expect(c.billingAddress).toMatchObject({ city: "Pune", state: "Maharashtra" });
    expect(c.shippingAddress).toMatchObject({ city: "Bengaluru", state: "Karnataka" });
  });

  it("blocks a second active customer with the same GSTIN", async () => {
    expect(await code(createCustomer(A, USER, customer({ name: "Other", gstin: "27ABCDE1234F1Z5" })))).toBe("DUPLICATE_GSTIN");
  });

  it("flags likely duplicates (same email, phone or name) unless allowed", async () => {
    expect(await code(createCustomer(A, USER, customer({ name: "R T", email: "RAHUL@example.test" })))).toBe("POSSIBLE_DUPLICATE");
    expect(await code(createCustomer(A, USER, customer({ name: "R T", phone: "9876543210" })))).toBe("POSSIBLE_DUPLICATE");
    expect(await code(createCustomer(A, USER, customer({ name: "rahul traders" })))).toBe("POSSIBLE_DUPLICATE");
    expect(await code(createCustomer(A, USER, customer({ name: "rahul traders" }), true))).toBe("ok");
  });

  it("is invisible to another tenant", async () => {
    expect(await code(getCustomer(B, id))).toBe("NOT_FOUND");
    expect((await listCustomers(B, q())).total).toBe(0);
    // The same GSTIN is fine in a different company.
    expect(await code(createCustomer(B, USER, customer({ gstin: "27ABCDE1234F1Z5" })))).toBe("ok");
  });

  it("updates details and replaces addresses (shipping removed)", async () => {
    const c = await updateCustomer(A, USER, id, customer({ gstin: "27ABCDE1234F1Z5", name: "Rahul Traders Pvt Ltd", email: "rahul@example.test" }));
    expect(c.name).toBe("Rahul Traders Pvt Ltd");
    expect(c.shippingAddress).toBeNull();
  });

  it("doesn't re-warn about duplicates on edits that keep name, email and phone", async () => {
    // "rahul traders" (saved anyway above) still looks like a duplicate of this one by name.
    const same = customer({ gstin: "27ABCDE1234F1Z5", name: "Rahul Traders Pvt Ltd", email: "rahul@example.test", notes: "VIP" });
    expect((await updateCustomer(A, USER, id, same)).notes).toBe("VIP");
    expect(await code(updateCustomer(A, USER, id, { ...same, name: "Rahul Traders" }))).toBe("POSSIBLE_DUPLICATE");
  });

  it("searches by name, GSTIN or phone, and treats % literally", async () => {
    const found = (await listCustomers(A, q({ q: "pvt" }))).items.find((c) => c.id === id);
    expect(found?.address).toEqual({ city: "Pune", state: "Maharashtra" });
    expect((await listCustomers(A, q({ q: "pvt" }))).items.map((c) => c.id)).toContain(id);
    expect((await listCustomers(A, q({ q: "27abcde" }))).total).toBe(1);
    expect((await listCustomers(A, q({ q: "%" }))).total).toBe(0);
  });

  it("archives (frees the GSTIN) and refuses a restore once it's taken", async () => {
    await setCustomerArchived(A, USER, id, true);
    expect((await listCustomers(A, q())).items.map((c) => c.id)).not.toContain(id);
    expect((await listCustomers(A, q({ status: "archived" }))).items.map((c) => c.id)).toEqual([id]);
    await createCustomer(A, USER, customer({ name: "New Owner", gstin: "27ABCDE1234F1Z5" }));
    expect(await code(setCustomerArchived(A, USER, id, false))).toBe("DUPLICATE_GSTIN");
  });

  it("rejects a price list from another tenant", async () => {
    const pl = await createPriceList(B, USER, { name: "B list", isDefault: false });
    expect(await code(createCustomer(A, USER, customer({ name: "PL test", priceListId: pl.id })))).toBe("INVALID_FIELDS");
  });
});

describe("suppliers", () => {
  it("creates, blocks duplicate code, archives", async () => {
    const v = validateSupplier({ name: "Steel Co", code: "S-1", countryCode: "IN", stateCode: "24", bankIfsc: "HDFC0001234" });
    if (!v.ok) throw new Error("invalid");
    const s = await createSupplier(A, USER, v.values);
    expect(s).toMatchObject({ name: "Steel Co", state: "Gujarat", bankIfsc: "HDFC0001234" });
    expect(await code(createSupplier(A, USER, { ...v.values, name: "Copy" }))).toBe("DUPLICATE_CODE");
    await setSupplierArchived(A, USER, s.id, true);
    expect((await listSuppliers(A, q())).total).toBe(0);
  });
});

describe("catalogue", () => {
  let unitId = "";
  let productId = "";
  let serviceId = "";

  it("adds the common units the first time", async () => {
    const list = await listUnits(A);
    expect(list.map((u) => u.code)).toEqual(expect.arrayContaining(["NOS", "KGS", "HRS"]));
    unitId = list.find((u) => u.code === "NOS")!.id;
    // Not again after archiving one.
    await setUnitArchived(A, USER, list.find((u) => u.code === "BOX")!.id, true);
    expect((await listUnits(A, "all")).length).toBe(list.length);
  });

  it("builds a category tree and refuses loops", async () => {
    const parent = await createCategory(A, USER, { name: "Metal", parentId: null });
    const child = await createCategory(A, USER, { name: "Rods", parentId: parent.id });
    expect((await listCategories(A)).find((c) => c.id === child.id)?.path).toBe("Metal / Rods");
    expect(await code(updateCategory(A, USER, parent.id, { name: "Metal", parentId: child.id }))).toBe("INVALID_FIELDS");
    expect(await code(createCategory(A, USER, { name: "Rods", parentId: parent.id }))).toBe("DUPLICATE");
  });

  it("creates products; SKU is unique per tenant; archived units can't be picked", async () => {
    const base = {
      name: "Steel rod", sku: "ROD-1", barcode: null, description: null, brand: "Tata", categoryId: null, unitId,
      hsnCode: "7214", taxCategory: "taxable" as const, taxRate: "18", cessRate: "0", salePricePaise: 125050, purchasePricePaise: 100000, trackInventory: false, minStockQty: null,
    };
    const p = await createProduct(A, USER, base);
    productId = p.id;
    expect(p).toMatchObject({ unitCode: "NOS", salePricePaise: 125050, taxRate: "18.0000" });
    expect(await code(createProduct(A, USER, { ...base, name: "Copy" }))).toBe("DUPLICATE");
    const box = (await listUnits(A, "archived"))[0];
    expect(await code(createProduct(A, USER, { ...base, sku: "ROD-2", unitId: box.id }))).toBe("INVALID_FIELDS");
    // Another tenant's unit is refused too.
    const bUnit = (await listUnits(B))[0];
    expect(await code(createProduct(A, USER, { ...base, sku: "ROD-3", unitId: bUnit.id }))).toBe("INVALID_FIELDS");
    // Same SKU in another tenant is fine.
    expect(await code(createProduct(B, USER, { ...base, unitId: bUnit.id }))).toBe("ok");
    const updated = await updateProduct(A, USER, productId, { ...base, salePricePaise: 130000 });
    expect(updated.salePricePaise).toBe(130000);
  });

  it("services need no unit", async () => {
    const s = await createService(A, USER, { name: "Installation", code: "SVC-1", description: null, categoryId: null, unitId: null, sacCode: "998729", taxCategory: "taxable", taxRate: "18", ratePaise: 50000 });
    serviceId = s.id;
    expect(s.unitCode).toBeNull();
  });

  it("price lists: one default, items upsert, archived items refused", async () => {
    const wholesale = await createPriceList(A, USER, { name: "Wholesale", isDefault: true });
    const retail = await createPriceList(A, USER, { name: "Retail", isDefault: true });
    expect((await getPriceList(A, wholesale.id)).isDefault).toBe(false);
    expect(retail.isDefault).toBe(true);

    let pl = await upsertPriceListItem(A, USER, wholesale.id, { productId, serviceId: null, pricePaise: 110000 });
    pl = await upsertPriceListItem(A, USER, wholesale.id, { productId, serviceId: null, pricePaise: 105000 });
    pl = await upsertPriceListItem(A, USER, wholesale.id, { productId: null, serviceId, pricePaise: 40000 });
    expect(pl.items).toHaveLength(2);
    expect(pl.items.find((i) => i.productId === productId)).toMatchObject({ pricePaise: 105000, basePricePaise: 130000, name: "Steel rod" });

    pl = await removePriceListItem(A, wholesale.id, pl.items.find((i) => i.serviceId === serviceId)!.id);
    expect(pl.items).toHaveLength(1);

    await setProductArchived(A, USER, productId, true);
    expect((await listProducts(A, q())).total).toBe(0);
    expect(await code(upsertPriceListItem(A, USER, retail.id, { productId, serviceId: null, pricePaise: 1 }))).toBe("INVALID_FIELDS");

    const archived = await setPriceListArchived(A, USER, retail.id, true);
    expect(archived.isDefault).toBe(false);
  });

  it("counts usage correctly in lists", async () => {
    // NOS is used by the (archived) Steel rod; HRS by nothing.
    const allUnits = await listUnits(A, "all");
    expect(allUnits.find((u) => u.code === "NOS")?.usedBy).toBe(1);
    expect(allUnits.find((u) => u.code === "HRS")?.usedBy).toBe(0);
    const wholesale = (await listPriceLists(A, "all")).find((p) => p.name === "Wholesale");
    expect(wholesale).toMatchObject({ itemCount: 1, customerCount: 0 });
    const cat = await createCategory(A, USER, { name: "Tools", parentId: null });
    await createService(A, USER, { name: "Repair", code: null, description: null, categoryId: cat.id, unitId: null, sacCode: null, taxCategory: "taxable", taxRate: "18", ratePaise: 100 });
    expect((await listCategories(A)).find((c) => c.id === cat.id)?.itemCount).toBe(1);
  });
});
