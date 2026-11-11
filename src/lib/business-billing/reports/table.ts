import { strToU8, zipSync } from "fflate";

// One shape for every report, so the screen, CSV and Excel all show the same
// rows. Money is in paise here and becomes rupees only in the exports.

export type ColumnType = "text" | "date" | "money" | "number" | "percent";
export type Column = { key: string; label: string; type: ColumnType; /** Hidden on narrow screens. */ secondary?: boolean };
export type Cell = string | number | null;
/** A row of cells by column key, plus meta keys: `_href` (link for the first column) and `_strong` (1 = a subtotal row, bold). */
export type ReportRow = Record<string, Cell>;

export type ReportTable = {
  title: string;
  /** Company and period, shown above the table and in the exports. */
  subtitle: string;
  columns: Column[];
  rows: ReportRow[];
  /** Totals row (same keys as columns); omitted when totals make no sense. */
  totals?: Record<string, Cell> | null;
  /** Rows beyond the cap aren't returned; the screen says so. */
  truncated?: boolean;
  note?: string | null;
};

export const ROW_CAP = 5000;

/* ---------------- CSV ---------------- */

// A text cell starting with one of these could run as a formula when the file
// is opened in a spreadsheet (CSV injection), so it gets a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/;

const rupees = (paise: number) => (paise / 100).toFixed(2);

function csvValue(v: Cell, type: ColumnType): string {
  if (v === null || v === undefined || v === "") return "";
  let s: string;
  if (type === "money" && typeof v === "number") s = rupees(v);
  else if (typeof v === "number") s = String(v);
  else {
    s = v;
    if (FORMULA_START.test(s)) s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a UTF-8 byte order mark so Excel shows ₹ and names correctly. Money in rupees. */
export function toCsv(t: ReportTable): string {
  const lines = [t.columns.map((c) => csvValue(c.label, "text")).join(",")];
  for (const r of t.rows) lines.push(t.columns.map((c) => csvValue(r[c.key] ?? null, c.type)).join(","));
  if (t.totals && t.rows.length) lines.push(t.columns.map((c) => csvValue(t.totals![c.key] ?? null, c.type)).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/* ---------------- Excel (.xlsx) ---------------- */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 doesn't allow.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colName = (i: number) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Excel's day number for a YYYY-MM-DD date (1900 date system). */
export const excelDate = (d: string) => {
  const m = DATE_RE.exec(d);
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86_400_000;
};

// Style ids in styles.xml below.
const S = { text: 0, header: 1, money: 2, date: 3, totalText: 4, totalMoney: 5, title: 6, number: 7, totalNumber: 8, percent: 9 } as const;

function cellXml(ref: string, v: Cell, type: ColumnType, total: boolean): string {
  if (v === null || v === undefined || v === "") return total ? `<c r="${ref}" s="${S.totalText}"/>` : "";
  if (type === "money" && typeof v === "number") return `<c r="${ref}" s="${total ? S.totalMoney : S.money}"><v>${v / 100}</v></c>`;
  if ((type === "number" || type === "percent") && typeof v === "number") return `<c r="${ref}" s="${total ? S.totalNumber : type === "percent" ? S.percent : S.number}"><v>${v}</v></c>`;
  if (type === "date" && typeof v === "string") {
    const n = excelDate(v);
    if (n !== null) return `<c r="${ref}" s="${S.date}"><v>${n}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${total ? S.totalText : S.text}"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

const WIDTH: Record<ColumnType, number> = { text: 28, date: 12, money: 15, number: 10, percent: 9 };

/** A one-sheet workbook: title, subtitle, a frozen header row, the rows and a bold totals row. */
export function toXlsx(t: ReportTable): Uint8Array {
  const rows: string[] = [];
  const last = colName(t.columns.length - 1);
  rows.push(`<row r="1"><c r="A1" t="inlineStr" s="${S.title}"><is><t>${esc(t.title)}</t></is></c></row>`);
  rows.push(`<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">${esc(t.subtitle)}</t></is></c></row>`);
  const headerRow = 4;
  rows.push(`<row r="${headerRow}">${t.columns.map((c, i) => `<c r="${colName(i)}${headerRow}" t="inlineStr" s="${S.header}"><is><t>${esc(c.label)}</t></is></c>`).join("")}</row>`);
  let r = headerRow;
  for (const row of t.rows) {
    r++;
    rows.push(`<row r="${r}">${t.columns.map((c, i) => cellXml(`${colName(i)}${r}`, row[c.key] ?? null, c.type, row._strong === 1)).join("")}</row>`);
  }
  if (t.totals && t.rows.length) {
    r++;
    rows.push(`<row r="${r}">${t.columns.map((c, i) => cellXml(`${colName(i)}${r}`, t.totals![c.key] ?? null, c.type, true)).join("")}</row>`);
  }
  const cols = t.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${WIDTH[c.type]}" customWidth="1"/>`).join("");
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${last}${Math.max(r, headerRow)}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${rows.join("")}</sheetData>` +
    (t.rows.length ? `<autoFilter ref="A${headerRow}:${last}${headerRow + t.rows.length}"/>` : "") +
    `</worksheet>`;
  // Sheet names: max 31 characters, none of []:*?/\
  const sheetName = esc(t.title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Report");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>${t.rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$${headerRow}:$${last}$${headerRow + t.rows.length}</definedName></definedNames>` : ""}</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd-mmm-yyyy"/></numFmts>` +
        `<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="10">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // text
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` + // header
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` + // money
        `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` + // date
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>` + // total text
        `<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>` + // total money
        `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // title
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // number
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>` + // total number
        `<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` + // percent (as a plain number, e.g. 18.00)
        `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}

/** A safe download file name: "sales-register_2026-04-01_2026-11-11.xlsx". */
export const fileName = (base: string, parts: (string | null | undefined)[], ext: "csv" | "xlsx") =>
  `${[base, ...parts.filter(Boolean)].join("_").replace(/[^A-Za-z0-9._-]+/g, "-")}.${ext}`;
