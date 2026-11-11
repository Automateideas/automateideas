import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { REPORTS, REPORT_GROUPS, isReportId, readReportParams } from "./catalog";
import { monthsBetween } from "./dashboard";
import { type ReportTable, excelDate, fileName, toCsv, toXlsx } from "./table";

const table: ReportTable = {
  title: "Invoice-wise sales",
  subtitle: "Acme · 1 Apr 2026 to 11 Nov 2026",
  columns: [
    { key: "number", label: "Invoice", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "customer", label: "Customer", type: "text" },
    { key: "qty", label: "Qty", type: "number" },
    { key: "total", label: "Total", type: "money" },
  ],
  rows: [
    { number: "INV/1", date: "2026-11-10", customer: 'Shah & Sons, "Pune"', qty: 2, total: 118050 },
    { number: "INV/2", date: "2026-11-11", customer: "=HYPERLINK(\"http://x\")", qty: 1, total: -500 },
  ],
  totals: { number: "Total", total: 117550 },
};

describe("CSV", () => {
  const csv = toCsv(table);
  it("starts with a BOM, uses CRLF and rupees with two decimals", () => {
    expect(csv.startsWith("﻿Invoice,Date,Customer,Qty,Total\r\n")).toBe(true);
    expect(csv).toContain("INV/1,2026-11-10,");
    expect(csv).toContain(",2,1180.50\r\n");
    expect(csv).toContain(",-5.00\r\n");
    expect(csv.trimEnd().split("\r\n").at(-1)).toBe("Total,,,,1175.50");
  });
  it("an empty report is just the header (no totals row)", () => {
    expect(toCsv({ ...table, rows: [] })).toBe("﻿Invoice,Date,Customer,Qty,Total\r\n");
    // Header is row 4; nothing after it.
    expect(strFromU8(unzipSync(toXlsx({ ...table, rows: [] }))["xl/worksheets/sheet1.xml"])).not.toContain('<row r="5"');
  });

  it("quotes commas and quotes, and defuses formulas in text cells", () => {
    expect(csv).toContain('"Shah & Sons, ""Pune"""');
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});

describe("Excel", () => {
  const files = unzipSync(toXlsx(table));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  it("is a valid package with one sheet", () => {
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    expect(strFromU8(files["xl/workbook.xml"])).toContain('<sheet name="Invoice-wise sales"');
  });
  it("writes money and dates as numbers, text escaped, a frozen header and totals", () => {
    expect(sheet).toContain('<c r="E5" s="2"><v>1180.5</v></c>');
    expect(sheet).toContain(`<c r="B5" s="3"><v>${excelDate("2026-11-10")}</v></c>`);
    expect(sheet).toContain("Shah &amp; Sons, &quot;Pune&quot;");
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<c r="E7" s="5"><v>1175.5</v></c>');
  });
  it("Excel dates: 1 Jan 1900 system", () => {
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-11-10")).toBe(46336);
  });
});

describe("catalogue and params", () => {
  it("every report has a known group and unique id", () => {
    expect(new Set(REPORTS.map((r) => r.id)).size).toBe(REPORTS.length);
    for (const r of REPORTS) expect(Object.keys(REPORT_GROUPS)).toContain(r.group);
    expect(isReportId("balance-sheet")).toBe(true);
    expect(isReportId("../etc")).toBe(false);
  });

  it("defaults to this financial year to date and ignores junk", () => {
    const p = readReportParams(new URLSearchParams({ groupBy: "hour", status: "drop table", customerId: "a b" }), "2026-11-11", 4);
    expect(p).toEqual({ from: "2026-04-01", to: "2026-11-11", asOf: "2026-11-11", groupBy: "month", customerId: null, supplierId: null, status: null });
    expect(readReportParams(new URLSearchParams(), "2026-02-15", 4).from).toBe("2025-04-01");
    expect(readReportParams(new URLSearchParams({ from: "2026-10-31", to: "2026-10-01", status: "overdue", groupBy: "week" }), "2026-11-11", 4)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", status: "overdue", groupBy: "week" });
  });

  it("months between two dates, at most 24", () => {
    expect(monthsBetween("2026-04-01", "2026-06-30")).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(monthsBetween("2026-12-15", "2027-01-02")).toEqual(["2026-12", "2027-01"]);
    expect(monthsBetween("2020-01-01", "2026-11-11")).toHaveLength(24);
  });

  it("file names are safe", () => {
    expect(fileName("sales-register", ["2026-04-01", null, "2026-11-11"], "xlsx")).toBe("sales-register_2026-04-01_2026-11-11.xlsx");
    expect(fileName('a"b/c', [], "csv")).toBe("a-b-c.csv");
  });
});
