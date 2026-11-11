import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { STOCK_ADJUSTMENT_REASONS, organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { createProduct, listUnits } from "../catalogue";
import { validateCustomer, validateSupplier } from "../contacts-validation";
import { createCustomer } from "../customers";
import { createDraft, getDocument, issueDocument, voidDocument } from "../documents/service";
import type { DocumentSlug } from "../documents/types";
import { validateDocument } from "../documents/validation";
import { saveBillingSettings } from "../settings";
import { createSupplier } from "../suppliers";
import { runReport } from "../reports/service";
import { withTenant } from "../tenant-db";
import {
  createAdjustment,
  createWarehouse,
  listWarehouses,
  productStock,
  setDefaultWarehouse,
  setInventorySettings,
  setWarehouseArchived,
  stockSummary,
  voidAdjustment,
} from "./service";
import { ADJUSTMENT_REASONS, type AdjustmentValues } from "./validation";

// Real database: stock moves with every business event, and only for tracked products.

const stamp = Date.now().toString(36);
const A = `invtest-a-${stamp}`;
const B = `invtest-b-${stamp}`;
const USER = null as unknown as string;
const ids: Record<string, string> = {};
const DAY = "2026-11-10";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}

const line = (productId: string, quantity: string, rate = "60", over: Record<string, unknown> = {}) => ({ productId, description: "Item", quantity, unitCode: "NOS", rate, taxRate: "18", ...over });
async function draft(slug: DocumentSlug, lines: unknown[], over: Record<string, unknown> = {}, org = A) {
  const party = slug.startsWith("purchase") ? { supplierId: ids.supplier } : { customerId: ids.customer };
  const v = validateDocument(slug, { ...party, issueDate: DAY, partyReference: slug === "purchase-bills" ? `SB-${Math.random().toString(36).slice(2, 8)}` : undefined, lines, ...over });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return (await createDraft(org, USER, slug, v.values)).id;
}
const issue = async (slug: DocumentSlug, lines: unknown[], over: Record<string, unknown> = {}) => issueDocument(A, USER, slug, await draft(slug, lines, over));

/** On-hand quantity (as a number) and value of a product, all warehouses or one. */
async function level(productId: string, warehouseId?: string) {
  const s = await productStock(A, productId);
  const qty = warehouseId ? (s.warehouses.find((w) => w.id === warehouseId)?.onHandMilli ?? 0) : s.onHandMilli;
  return { qty: qty / 1000, value: s.valuePaise, status: s.status };
}
const adj = (v: Partial<AdjustmentValues>): AdjustmentValues => ({ date: DAY, kind: "adjustment", warehouseId: ids.main, toWarehouseId: null, reason: "count", notes: null, lines: [], ...v });

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Inv A", slug: A, createdAt: new Date() },
    { id: B, name: "Inv B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Stock Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  await saveBillingSettings(B, USER, { ...company, legalName: "Other Co" });
  const c = validateCustomer({ name: "Buyer", billingAddress: { countryCode: "IN", stateCode: "27" } });
  const s = validateSupplier({ name: "Seller", gstin: "27AAACP1234A1Z5", stateCode: "27", countryCode: "IN" });
  if (!c.ok || !s.ok) throw new Error("fixtures");
  ids.customer = (await createCustomer(A, USER, c.values)).id;
  ids.supplier = (await createSupplier(A, USER, s.values)).id;
  const unitId = (await listUnits(A)).find((u) => u.code === "NOS")!.id;
  const base = { sku: null, barcode: null, description: null, brand: null, categoryId: null, unitId, hsnCode: "7214", taxCategory: "taxable" as const, taxRate: "18", cessRate: "0", salePricePaise: 10000, purchasePricePaise: 5000 };
  ids.rod = (await createProduct(A, USER, { ...base, name: "Steel rod", trackInventory: true, minStockQty: "5" })).id;
  ids.pipe = (await createProduct(A, USER, { ...base, name: "Pipe", trackInventory: true, minStockQty: null })).id;
  ids.plain = (await createProduct(A, USER, { ...base, name: "Untracked", trackInventory: false, minStockQty: null })).id;
});

afterAll(() => removeTestTenants([A, B]));

describe("warehouses", () => {
  it("creates a default Main warehouse on first use; codes are unique; reasons match the schema", async () => {
    const list = await listWarehouses(A);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: "MAIN", isDefault: true });
    ids.main = list[0].id;
    ids.pune = (await createWarehouse(A, USER, { code: "PUNE", name: "Pune godown", addressLine1: null, city: "Pune", stateCode: "27", postalCode: null })).id;
    expect(await code(createWarehouse(A, USER, { code: "PUNE", name: "Again", addressLine1: null, city: null, stateCode: null, postalCode: null }))).toBe("DUPLICATE");
    expect([...ADJUSTMENT_REASONS]).toEqual([...STOCK_ADJUSTMENT_REASONS]);
  });
});

describe("stock follows documents", () => {
  it("a purchase bill adds stock at its taxable cost; untracked products are ignored", async () => {
    const bill = await issue("purchase-bills", [line(ids.rod, "10", "60"), line(ids.plain, "3")]);
    ids.bill = bill.id;
    expect(bill.warehouseId).toBe(ids.main);
    expect(await level(ids.rod)).toMatchObject({ qty: 10, value: 60000, status: "ok" });
    const { rows } = await withTenant(A, (tx) => tx.execute<{ n: string }>(sql`select count(*) as n from stock_movements where organization_id = ${A} and product_id = ${ids.plain}`));
    expect(Number(rows[0].n)).toBe(0);
  });

  it("an invoice takes stock out at average cost; voiding puts it back", async () => {
    const inv = await issue("invoices", [line(ids.rod, "4", "100")]);
    expect(await level(ids.rod)).toMatchObject({ qty: 6, value: 36000 });
    await voidDocument(A, USER, "invoices", inv.id, "Cancelled order");
    expect(await level(ids.rod)).toMatchObject({ qty: 10, value: 60000 });
    const again = await issue("invoices", [line(ids.rod, "4", "100")]);
    ids.invoice = again.id;
    expect(await level(ids.rod)).toMatchObject({ qty: 6, value: 36000 });
  });

  it("a restocking credit note brings goods back; a price-only one doesn't", async () => {
    await issue("credit-notes", [line(ids.rod, "1", "100")], { invoiceId: ids.invoice, reason: "Returned" });
    expect((await level(ids.rod)).qty).toBe(7);
    const priceOnly = await issue("credit-notes", [line(ids.rod, "1", "10")], { invoiceId: ids.invoice, reason: "Discount", restock: false });
    expect(priceOnly.restock).toBe(false);
    expect((await level(ids.rod)).qty).toBe(7);
  });

  it("a purchase return takes stock out at the return's value", async () => {
    await issue("purchase-returns", [line(ids.rod, "2", "60")], { billId: ids.bill, reason: "Bent" });
    expect(await level(ids.rod)).toMatchObject({ qty: 5, value: 42000 - 12000 });
  });

  it("issuing into a chosen warehouse; an archived one is refused", async () => {
    await issue("purchase-bills", [line(ids.pipe, "3", "40")], { warehouseId: ids.pune });
    expect((await level(ids.pipe, ids.pune)).qty).toBe(3);
    const tmp = await createWarehouse(A, USER, { code: "TMP", name: "Temp", addressLine1: null, city: null, stateCode: null, postalCode: null });
    await setWarehouseArchived(A, USER, tmp.id, true);
    expect(await code(draft("purchase-bills", [line(ids.pipe, "1")], { warehouseId: tmp.id }))).toBe("INVALID_FIELDS");
  });
});

describe("adjustments and transfers", () => {
  it("opening stock at a given cost changes the average", async () => {
    const a = await createAdjustment(A, USER, adj({ warehouseId: ids.pune, reason: "opening", lines: [{ productId: ids.rod, quantityMilli: 5000, unitCostPaise: 8000, note: null }] }), `open-${stamp}`);
    expect(a).toMatchObject({ kind: "adjustment", status: "posted", replayed: false });
    expect(a.number).toMatch(/^SA/);
    expect(a.lines[0].valuePaise).toBe(40000);
    // Same key → same adjustment.
    expect((await createAdjustment(A, USER, adj({ warehouseId: ids.pune, reason: "opening", lines: [{ productId: ids.rod, quantityMilli: 5000, unitCostPaise: 8000, note: null }] }), `open-${stamp}`)).id).toBe(a.id);
    expect(await level(ids.rod)).toMatchObject({ qty: 10, value: 30000 + 40000 });
  });

  it("a transfer moves quantity between warehouses without changing value", async () => {
    const before = await level(ids.rod);
    const t = await createAdjustment(A, USER, adj({ kind: "transfer", warehouseId: ids.pune, toWarehouseId: ids.main, reason: null, lines: [{ productId: ids.rod, quantityMilli: 3000, unitCostPaise: null, note: null }] }), null);
    expect(t.lines[0].valuePaise).toBe(21000); // 3 × ₹70 average
    expect(await level(ids.rod)).toMatchObject({ qty: before.qty, value: before.value });
    expect((await level(ids.rod, ids.pune)).qty).toBe(2);
    expect((await level(ids.rod, ids.main)).qty).toBe(8);
  });

  it("refuses untracked products; voiding reverses once", async () => {
    expect(await code(createAdjustment(A, USER, adj({ lines: [{ productId: ids.plain, quantityMilli: 1000, unitCostPaise: null, note: null }] }), null))).toBe("INVALID_FIELDS");
    const lost = await createAdjustment(A, USER, adj({ reason: "lost", lines: [{ productId: ids.rod, quantityMilli: -1000, unitCostPaise: null, note: null }] }), null);
    expect((await level(ids.rod)).qty).toBe(9);
    const v = await voidAdjustment(A, USER, lost.id, "Found it");
    expect(v.status).toBe("void");
    expect((await level(ids.rod)).qty).toBe(10);
    expect(await code(voidAdjustment(A, USER, lost.id, "again"))).toBe("ALREADY_VOID");
  });
});

describe("negative stock", () => {
  it("allowed by default (status negative); refused when turned off, leaving the invoice a draft", async () => {
    await issue("invoices", [line(ids.pipe, "1")]); // main has 0 pipes
    expect(await level(ids.pipe, ids.main)).toMatchObject({ qty: -1 });
    await setInventorySettings(A, USER, { allowNegativeStock: false });
    const d = await draft("invoices", [line(ids.pipe, "1")]);
    expect(await code(issueDocument(A, USER, "invoices", d))).toBe("INSUFFICIENT_STOCK");
    expect((await getDocument(A, "invoices", d)).status).toBe("draft");
    // Removing more than a warehouse holds is refused too; voids never are.
    expect(await code(createAdjustment(A, USER, adj({ warehouseId: ids.pune, reason: "damaged", lines: [{ productId: ids.pipe, quantityMilli: -4000, unitCostPaise: null, note: null }] }), null))).toBe("INSUFFICIENT_STOCK");
  });

  it("two invoices for the last unit at the same moment: only one goes through", async () => {
    await createAdjustment(A, USER, adj({ reason: "found", lines: [{ productId: ids.pipe, quantityMilli: 2000, unitCostPaise: null, note: null }] }), null); // main: −1 + 2 = 1
    const [x, y] = [await draft("invoices", [line(ids.pipe, "1")]), await draft("invoices", [line(ids.pipe, "1")])];
    const results = await Promise.all([code(issueDocument(A, USER, "invoices", x)), code(issueDocument(A, USER, "invoices", y))]);
    expect(results.sort()).toEqual(["INSUFFICIENT_STOCK", "ok"]);
    expect((await level(ids.pipe, ids.main)).qty).toBe(0);
    await setInventorySettings(A, USER, { allowNegativeStock: true });
  });
});

describe("summary, warehouses and guards", () => {
  it("summary: quantity, value, low-stock status", async () => {
    const s = await stockSummary(A, { q: null, warehouseId: null, asOf: null, status: "all", page: 1, pageSize: 50 });
    const rod = s.items.find((i) => i.id === ids.rod)!;
    expect(rod.onHandMilli).toBe(10000);
    expect(s.items.some((i) => i.id === ids.plain)).toBe(false);
    expect(s.totals.valuePaise).toBe(s.items.reduce((a, i) => a + i.valuePaise, 0));
    // Rod minimum is 5: sell 6 → 4 left → low.
    await issue("invoices", [line(ids.rod, "6", "100")]);
    const low = await stockSummary(A, { q: null, warehouseId: null, asOf: null, status: "low", page: 1, pageSize: 50 });
    expect(low.items.map((i) => i.id)).toEqual([ids.rod]);
    // As of a date before everything: nothing on hand.
    const past = await stockSummary(A, { q: null, warehouseId: null, asOf: "2026-01-01", status: "all", page: 1, pageSize: 50 });
    expect(past.items.every((i) => i.onHandMilli === 0)).toBe(true);
  });

  it("inventory reports agree with the stock screens", async () => {
    const p = { from: "2026-04-01", to: "2026-12-31", asOf: "2026-12-31", groupBy: "month" as const, customerId: null, supplierId: null, warehouseId: null, productId: null, status: null };
    const summary = await stockSummary(A, { q: null, warehouseId: null, asOf: null, status: "all", page: 1, pageSize: 50 });
    const t = await runReport(A, "stock-summary", p);
    expect(t.totals?.value).toBe(summary.totals.valuePaise);
    const moves = await runReport(A, "stock-movements", { ...p, productId: ids.rod });
    expect(Number(moves.totals?.in) - Number(moves.totals?.out)).toBe((await productStock(A, ids.rod)).onHandMilli / 1000);
    const low = await runReport(A, "low-stock", p);
    expect(low.rows.map((r) => r.product)).toContain("Steel rod");
  });

  it("product history has a running quantity", async () => {
    const s = await productStock(A, ids.rod);
    expect(s.movements[0].runningMilli).toBe(s.onHandMilli);
    expect(s.movements.some((m) => m.reversal)).toBe(true);
    expect(s.movements.some((m) => m.sourceNumber?.startsWith("SA"))).toBe(true);
  });

  it("warehouses with stock can't be archived; the default can't either", async () => {
    expect(await code(setWarehouseArchived(A, USER, ids.pune, true))).toBe("HAS_STOCK");
    expect(await code(setWarehouseArchived(A, USER, ids.main, true))).toBe("DEFAULT_WAREHOUSE");
    await setDefaultWarehouse(A, USER, ids.pune);
    expect((await listWarehouses(A)).find((w) => w.isDefault)?.id).toBe(ids.pune);
    await setDefaultWarehouse(A, USER, ids.main);
  });

  it("the database keeps movements and adjustment lines permanent", async () => {
    expect(await code(withTenant(A, (tx) => tx.execute(sql`update stock_movements set quantity = 999 where organization_id = ${A}`)))).not.toBe("ok");
    expect(await code(withTenant(A, (tx) => tx.execute(sql`delete from stock_movements where organization_id = ${A}`)))).not.toBe("ok");
    const { rows } = await withTenant(A, (tx) => tx.execute<{ id: string }>(sql`select id from stock_adjustments where organization_id = ${A} limit 1`));
    expect(
      await code(withTenant(A, (tx) => tx.execute(sql`insert into stock_adjustment_items (organization_id, adjustment_id, line_no, product_id, quantity) values (${A}, ${rows[0].id}, 99, ${ids.rod}, 1)`))),
    ).not.toBe("ok");
    expect(await code(withTenant(A, (tx) => tx.execute(sql`delete from stock_adjustments where organization_id = ${A}`)))).not.toBe("ok");
  });

  it("is per company", async () => {
    expect((await stockSummary(B, { q: null, warehouseId: null, asOf: null, status: "all", page: 1, pageSize: 50 })).items).toHaveLength(0);
    expect(await code(createAdjustment(B, USER, adj({ warehouseId: ids.main, lines: [{ productId: ids.rod, quantityMilli: 1000, unitCostPaise: null, note: null }] }), null))).toBe("INVALID_FIELDS");
    expect(await code(productStock(B, ids.rod))).toBe("NOT_FOUND");
  });
});
