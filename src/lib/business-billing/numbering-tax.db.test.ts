import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { billingSettings, companyBranches, invoiceSequences, organization } from "@/db/schema";

import { allocateDocumentNumber, previewNextNumbers, setNextNumber } from "./numbering";
import { defaultNumbering } from "./numbering-format";
import { saveBillingSettings } from "./settings";
import { getTaxSettings, saveNumbering, saveTaxSettings, sellerTaxProfile } from "./tax-settings";
import { withTenant } from "./tenant-db";

// Real database: document numbering under concurrency, and tax settings.

const stamp = Date.now().toString(36);
const A = `numtest-a-${stamp}`;
const B = `numtest-b-${stamp}`;
const USER = null as unknown as string;
const NOV = new Date("2026-11-10T00:00:00Z"); // financial year 2026-27
const MAY27 = new Date("2027-05-01T00:00:00Z"); // 2027-28

const take = (org: string, documentType: "invoice" | "quotation" = "invoice", date = NOV, branchId: string | null = null) =>
  withTenant(org, (tx) => allocateDocumentNumber(tx, org, { documentType, date, branchId }));

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
    { id: A, name: "Numbering A", slug: A, createdAt: new Date() },
    { id: B, name: "Numbering B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Alpha Traders", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "ABC/" };
  await saveBillingSettings(A, USER, company);
});

afterAll(async () => {
  const orgs = [A, B];
  await db.delete(invoiceSequences).where(inArray(invoiceSequences.organizationId, orgs));
  await db.delete(companyBranches).where(inArray(companyBranches.organizationId, orgs));
  await db.delete(billingSettings).where(inArray(billingSettings.organizationId, orgs));
  await db.delete(organization).where(inArray(organization.id, orgs));
});

describe("document numbering", () => {
  it("starts at 1 with the company's prefix and financial year", async () => {
    expect(await take(A)).toMatchObject({ number: "ABC/2026-27/0001", sequence: 1, financialYear: "2026-27" });
  });

  it("gives 50 simultaneous requests 50 different numbers with no gaps", async () => {
    const got = await Promise.all(Array.from({ length: 50 }, () => take(A)));
    const seqs = got.map((g) => g.sequence).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 2));
    expect(new Set(got.map((g) => g.number)).size).toBe(50);
  });

  it("returns the number when the saving transaction fails (no gap)", async () => {
    await expect(
      withTenant(A, async (tx) => {
        await allocateDocumentNumber(tx, A, { documentType: "invoice", date: NOV });
        throw new Error("save failed");
      }),
    ).rejects.toThrow("save failed");
    expect((await take(A)).sequence).toBe(52);
  });

  it("keeps separate series per document type, financial year, branch and tenant", async () => {
    expect((await take(A, "quotation")).number).toBe("QT/2026-27/0001");
    expect((await take(A, "invoice", MAY27)).number).toBe("ABC/2027-28/0001");
    const [branch] = await withTenant(A, (tx) =>
      tx.insert(companyBranches).values({ organizationId: A, name: "Pune", code: "PUN" }).returning({ id: companyBranches.id }),
    );
    expect((await take(A, "invoice", NOV, branch.id)).sequence).toBe(1);
    // Tenant B has no settings: defaults, its own counter.
    expect((await take(B)).number).toBe("INV/2026-27/0001");
    expect((await take(A)).sequence).toBe(53);
  });

  it("can't use another tenant's branch", async () => {
    const [branch] = await withTenant(A, (tx) =>
      tx.insert(companyBranches).values({ organizationId: A, name: "Nashik", code: "NSK" }).returning({ id: companyBranches.id }),
    );
    await expect(take(B, "invoice", NOV, branch.id)).rejects.toThrow();
  });

  it("previews without taking a number, and moves the start forward only", async () => {
    const before = await previewNextNumbers(A, NOV);
    expect(before.documents.find((d) => d.type === "invoice")).toMatchObject({ nextNumber: 54, preview: "ABC/2026-27/0054", used: true });
    expect((await previewNextNumbers(A, NOV)).documents.find((d) => d.type === "invoice")?.nextNumber).toBe(54);

    expect(await code(setNextNumber(A, USER, "invoice", 10, NOV))).toBe("INVALID_FIELDS");
    expect((await setNextNumber(A, USER, "invoice", 500, NOV)).preview).toBe("ABC/2026-27/0500");
    expect((await take(A)).sequence).toBe(500);
    // A fresh series can start anywhere.
    expect((await setNextNumber(A, USER, "credit_note", 41, NOV)).preview).toBe("CN/2026-27/0041");
  });

  it("uses saved formats for new numbers", async () => {
    await saveNumbering(A, USER, { ...defaultNumbering(), invoice: { prefix: "AT-", includeFinancialYear: false, padding: 6 } });
    expect((await take(A)).number).toBe("AT-000501");
  });
});

describe("tax settings", () => {
  it("needs company details first", async () => {
    expect(await code(saveTaxSettings(B, USER, { stateCode: "29", pricesIncludeTax: false, roundOff: "none" }))).toBe("INVALID_FIELDS");
    expect((await getTaxSettings(B)).configured).toBe(false);
  });

  it("saves, and the GSTIN decides the seller's state", async () => {
    const s = await saveTaxSettings(A, USER, { stateCode: "27", pricesIncludeTax: true, roundOff: "none" });
    expect(s).toMatchObject({ registered: true, stateCode: "27", pricesIncludeTax: true, roundOff: "none" });
    const profile = await withTenant(A, (tx) => sellerTaxProfile(tx, A));
    expect(profile).toMatchObject({ registered: true, stateCode: "27" });
  });

  it("is invisible across tenants", async () => {
    const b = await withTenant(B, (tx) => sellerTaxProfile(tx, B));
    expect(b).toMatchObject({ configured: false, gstin: null });
  });
});
