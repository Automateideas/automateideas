/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer's <Image> draws into the PDF; it has no alt attribute. */
import "server-only";

import path from "node:path";

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { DOCUMENT_TYPES, type DocumentSlug, amountInWords } from "../documents/types";
import { formatPaise, stateByCode } from "../fields";
import { methodLabel } from "../payments/validation";
import { type DocumentTemplate, tint, upiPayLink } from "../template";
import type { DocumentAssets } from "../template-settings";

// Server-side PDFs (A4) for sales documents and payment receipts, drawn with
// @react-pdf/renderer: no browser needed. The layout mirrors the on-screen
// document (app/(app)/billing/_components/documents/document-paper.tsx).

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
Font.register({
  family: "NotoSans",
  fonts: [
    { src: path.join(FONT_DIR, "NotoSans-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: 700 },
  ],
});
// Don't hyphenate names, GSTINs and numbers.
Font.registerHyphenationCallback((word) => [word]);

type Address = { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; countryCode: string } | null;
type Seller = Address & { legalName: string; tradeName?: string | null; gstin: string | null; email: string | null; phone: string | null };

export type PdfDocument = {
  slug: DocumentSlug;
  number: string | null;
  status: string;
  issueDate: string;
  extraDate: string | null;
  partyName: string | null;
  partyGstin: string | null;
  billingAddress: Address;
  shippingAddress: Address;
  placeOfSupply: string | null;
  supplyType: string | null;
  reverseCharge: boolean;
  zeroRated: string | null;
  reason: string | null;
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  charges: { label: string; appliedTaxRate: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; cessPaise: number; totalPaise: number }[];
  seller: Seller | null;
  notes: string | null;
  terms: string | null;
  items: { id: string; lineNo: number; description: string; hsnSac: string | null; quantity: string; unitCode: string | null; ratePaise: number; discountPaise: number; taxCategory: string; taxRate: string; cessRate: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; cessPaise: number; totalPaise: number }[];
  related: { slug: DocumentSlug; number: string | null }[];
  payment: { balancePaise: number } | null;
};

const qty = (q: string) => (q.includes(".") ? q.replace(/\.?0+$/, "") : q);
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : "—");
const lines = (a: Address) =>
  a ? [a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(", "), a.postalCode].filter(Boolean) as string[] : [];

function styles(t: DocumentTemplate) {
  const compact = t.design === "compact";
  const base = compact ? 8 : 9;
  return StyleSheet.create({
    page: { fontFamily: "NotoSans", fontSize: base, color: "#171717", paddingTop: compact ? 24 : 32, paddingBottom: 48, paddingHorizontal: compact ? 24 : 32 },
    band: t.design === "modern" ? { backgroundColor: t.color, color: "#FFFFFF", padding: 14, marginHorizontal: compact ? -24 : -32, marginTop: compact ? -24 : -32, marginBottom: 14 } : { borderBottomWidth: 2, borderBottomColor: t.color, paddingBottom: 10, marginBottom: 10 },
    row: { flexDirection: "row" },
    between: { flexDirection: "row", justifyContent: "space-between" },
    muted: { color: t.design === "modern" ? "#E5E5E5" : "#525252" },
    label: { fontSize: base - 1.5, color: "#737373", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
    title: { fontSize: base + 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
    company: { fontSize: base + 4, fontWeight: 700 },
    th: { backgroundColor: tint(t.color, 0.88), fontWeight: 700, fontSize: base - 1, paddingVertical: 4, paddingHorizontal: 3 },
    td: { paddingVertical: compact ? 2.5 : 4, paddingHorizontal: 3 },
    tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E5E5E5" },
    right: { textAlign: "right" },
    bold: { fontWeight: 700 },
    totalBox: t.design === "modern" ? { backgroundColor: tint(t.color, 0.9), padding: 8 } : { padding: 0 },
    footer: { position: "absolute", bottom: 20, left: compact ? 24 : 32, right: compact ? 24 : 32, flexDirection: "row", justifyContent: "space-between", fontSize: base - 1.5, color: "#737373" },
    watermark: { position: "absolute", top: 330, left: 60, fontSize: 90, color: "#E5E5E5", transform: "rotate(-30deg)", fontWeight: 700, textTransform: "uppercase" },
  });
}

/** Column widths of the item table. */
const COLS = { no: "5%", item: "33%", hsn: "10%", qty: "9%", rate: "11%", disc: "8%", taxable: "12%", gst: "6%", amount: "13%" } as const;

function title(doc: PdfDocument) {
  if (doc.slug !== "invoices") return DOCUMENT_TYPES[doc.slug].singular;
  if (!doc.seller?.gstin) return "Invoice";
  return doc.items.some((i) => i.taxCategory === "taxable") ? "Tax Invoice" : "Bill of Supply";
}

function Header({ doc, seller, a, s }: { doc: PdfDocument; seller: Seller | null; a: DocumentAssets; s: ReturnType<typeof styles> }) {
  const extra = DOCUMENT_TYPES[doc.slug].extraDate;
  const against = DOCUMENT_TYPES[doc.slug].needsInvoice ? doc.related.find((r) => r.slug === "invoices") : null;
  return (
    <View style={[s.band, s.between]}>
      <View style={[s.row, { gap: 10, maxWidth: "60%" }]}>
        {a.logo ? <Image src={a.logo} style={{ height: 44, maxWidth: 110, objectFit: "contain" }} /> : null}
        <View>
          <Text style={s.company}>{seller?.tradeName || seller?.legalName || ""}</Text>
          {seller?.tradeName && seller.tradeName !== seller.legalName ? <Text style={s.muted}>{seller.legalName}</Text> : null}
          {lines(seller).map((l, i) => (
            <Text key={i} style={s.muted}>{l}</Text>
          ))}
          {seller?.gstin ? <Text>GSTIN: {seller.gstin}</Text> : null}
          {seller?.phone || seller?.email ? <Text style={s.muted}>{[seller?.phone, seller?.email].filter(Boolean).join(" · ")}</Text> : null}
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={s.title}>{title(doc)}</Text>
        <Text style={s.bold}>{doc.number ?? "DRAFT"}</Text>
        <Text>Date: {fmtDate(doc.issueDate)}</Text>
        {extra && doc.extraDate ? <Text>{extra.label}: {fmtDate(doc.extraDate)}</Text> : null}
        {against ? <Text>Against invoice: {against.number}</Text> : null}
      </View>
    </View>
  );
}

function Parties({ doc, s }: { doc: PdfDocument; s: ReturnType<typeof styles> }) {
  const pos = doc.placeOfSupply === "96" ? "Outside India (96)" : stateByCode(doc.placeOfSupply) ? `${stateByCode(doc.placeOfSupply)!.name} (${doc.placeOfSupply})` : "—";
  return (
    <View style={[s.row, { gap: 12, marginBottom: 10 }]} wrap={false}>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>Bill to</Text>
        <Text style={s.bold}>{doc.partyName}</Text>
        {lines(doc.billingAddress).map((l, i) => (
          <Text key={i}>{l}</Text>
        ))}
        <Text>{doc.partyGstin ? `GSTIN: ${doc.partyGstin}` : "Unregistered"}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>Ship to</Text>
        {doc.shippingAddress ? lines(doc.shippingAddress).map((l, i) => <Text key={i}>{l}</Text>) : <Text>Same as billing</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>Supply</Text>
        <Text>Place of supply: {pos}</Text>
        <Text>Reverse charge: {doc.reverseCharge ? "Yes" : "No"}</Text>
        {doc.zeroRated ? <Text>{doc.zeroRated === "lut" ? "Zero-rated under LUT/bond" : "Zero-rated, IGST paid"}</Text> : null}
        {doc.reason ? <Text>Reason: {doc.reason}</Text> : null}
      </View>
    </View>
  );
}

function Items({ doc, s }: { doc: PdfDocument; s: ReturnType<typeof styles> }) {
  const cell = (w: string, right = false) => [s.td, { width: w }, right ? s.right : {}];
  return (
    <View>
      {/* Repeats at the top of every page. */}
      <View style={s.row} fixed>
        {(
          [
            ["#", COLS.no, false],
            ["Item", COLS.item, false],
            ["HSN/SAC", COLS.hsn, false],
            ["Qty", COLS.qty, true],
            ["Rate", COLS.rate, true],
            ["Disc.", COLS.disc, true],
            ["Taxable", COLS.taxable, true],
            ["GST", COLS.gst, true],
            ["Amount", COLS.amount, true],
          ] as const
        ).map(([h, w, r]) => (
          <Text key={h} style={[s.th, { width: w }, r ? s.right : {}]}>{h}</Text>
        ))}
      </View>
      {doc.items.map((i) => (
        <View key={i.id} style={s.tr} wrap={false}>
          <Text style={cell(COLS.no)}>{i.lineNo}</Text>
          <Text style={cell(COLS.item)}>{i.description}</Text>
          <Text style={cell(COLS.hsn)}>{i.hsnSac ?? ""}</Text>
          <Text style={cell(COLS.qty, true)}>{`${qty(i.quantity)} ${i.unitCode ?? ""}`.trim()}</Text>
          <Text style={cell(COLS.rate, true)}>{formatPaise(i.ratePaise)}</Text>
          <Text style={cell(COLS.disc, true)}>{i.discountPaise ? formatPaise(i.discountPaise) : ""}</Text>
          <Text style={cell(COLS.taxable, true)}>{formatPaise(i.taxablePaise)}</Text>
          <Text style={cell(COLS.gst, true)}>{i.taxCategory === "taxable" ? `${qty(i.taxRate)}%` : ({ exempt: "Exempt", nil_rated: "Nil", non_gst: "Non-GST" } as Record<string, string>)[i.taxCategory] ?? ""}</Text>
          <Text style={cell(COLS.amount, true)}>{formatPaise(i.totalPaise)}</Text>
        </View>
      ))}
      {doc.charges.map((c, n) => (
        <View key={`c${n}`} style={s.tr} wrap={false}>
          <Text style={cell(COLS.no)} />
          <Text style={cell("55%")}>{c.label}</Text>
          <Text style={cell(COLS.taxable, true)}>{formatPaise(c.taxablePaise)}</Text>
          <Text style={cell(COLS.gst, true)}>{`${qty(c.appliedTaxRate)}%`}</Text>
          <Text style={cell(COLS.amount, true)}>{formatPaise(c.totalPaise)}</Text>
        </View>
      ))}
    </View>
  );
}

function TaxSummary({ doc, s }: { doc: PdfDocument; s: ReturnType<typeof styles> }) {
  if (!(doc.cgstPaise || doc.sgstPaise || doc.igstPaise)) return null;
  const rows = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
  const add = (rate: string, t: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; cessPaise: number }) => {
    const r = rows.get(rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    r.taxable += t.taxablePaise;
    r.cgst += t.cgstPaise;
    r.sgst += t.sgstPaise;
    r.igst += t.igstPaise;
    r.cess += t.cessPaise;
    rows.set(rate, r);
  };
  doc.items.filter((i) => i.taxCategory === "taxable").forEach((i) => add(qty(i.taxRate), i));
  doc.charges.forEach((c) => add(qty(c.appliedTaxRate), c));
  const intra = doc.supplyType === "intra_state";
  const w = intra ? "25%" : "33%";
  return (
    <View style={{ marginBottom: 8 }} wrap={false}>
      <View style={s.row}>
        <Text style={[s.th, { width: w }]}>GST rate</Text>
        <Text style={[s.th, s.right, { width: w }]}>Taxable</Text>
        {intra ? (
          <>
            <Text style={[s.th, s.right, { width: w }]}>CGST</Text>
            <Text style={[s.th, s.right, { width: w }]}>SGST</Text>
          </>
        ) : (
          <Text style={[s.th, s.right, { width: w }]}>IGST</Text>
        )}
      </View>
      {[...rows.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([rate, r]) => (
          <View key={rate} style={s.tr}>
            <Text style={[s.td, { width: w }]}>{rate}%</Text>
            <Text style={[s.td, s.right, { width: w }]}>{formatPaise(r.taxable)}</Text>
            {intra ? (
              <>
                <Text style={[s.td, s.right, { width: w }]}>{formatPaise(r.cgst)}</Text>
                <Text style={[s.td, s.right, { width: w }]}>{formatPaise(r.sgst)}</Text>
              </>
            ) : (
              <Text style={[s.td, s.right, { width: w }]}>{formatPaise(r.igst)}</Text>
            )}
          </View>
        ))}
    </View>
  );
}

function Totals({ doc, s }: { doc: PdfDocument; s: ReturnType<typeof styles> }) {
  const rows = (
    [
      ["Subtotal", doc.subtotalPaise],
      ["Discount", -doc.discountPaise],
      ["Taxable value", doc.taxablePaise],
      ["CGST", doc.cgstPaise],
      ["SGST", doc.sgstPaise],
      ["IGST", doc.igstPaise],
      ["Cess", doc.cessPaise],
      ["Round-off", doc.roundOffPaise],
    ] as const
  ).filter(([l, v]) => l === "Taxable value" || v !== 0);
  return (
    <View style={[s.totalBox, { width: 190 }]} wrap={false}>
      {rows.map(([l, v]) => (
        <View key={l} style={[s.between, { marginBottom: 2 }]}>
          <Text>{l}</Text>
          <Text>{formatPaise(v)}</Text>
        </View>
      ))}
      <View style={[s.between, { borderTopWidth: 1, borderTopColor: "#A3A3A3", paddingTop: 4, marginTop: 2 }]}>
        <Text style={[s.bold, { fontSize: 11 }]}>Total</Text>
        <Text style={[s.bold, { fontSize: 11 }]}>{formatPaise(doc.totalPaise)}</Text>
      </View>
    </View>
  );
}

async function DocumentBody({ doc, seller, assets }: { doc: PdfDocument; seller: Seller | null; assets: DocumentAssets }) {
  const t = assets.template;
  const s = styles(t);
  const due = doc.slug === "invoices" && doc.payment && !["draft", "void"].includes(doc.status) ? doc.payment.balancePaise : 0;
  const qr =
    t.showUpiQr && t.upiId && due > 0
      ? await QRCode.toDataURL(upiPayLink({ upiId: t.upiId, payeeName: seller?.tradeName || seller?.legalName || "", amountPaise: due, note: doc.number ?? "Invoice" }), { margin: 1, width: 240 })
      : null;
  const bank = t.showBankDetails && t.bank && ["invoices", "debit-notes", "quotations", "sales-orders"].includes(doc.slug) ? t.bank : null;
  const terms = doc.terms;
  return (
    <Document title={`${title(doc)} ${doc.number ?? "draft"}`} author={seller?.legalName ?? ""} creator="Automate Ideas">
      <Page size="A4" style={s.page}>
        {doc.status === "draft" || doc.status === "void" ? <Text style={s.watermark} fixed>{doc.status}</Text> : null}
        <Header doc={doc} seller={seller} a={assets} s={s} />
        <Parties doc={doc} s={s} />
        <Items doc={doc} s={s} />
        <View style={[s.between, { marginTop: 10, gap: 14 }]}>
          <View style={{ flex: 1 }}>
            <TaxSummary doc={doc} s={s} />
            <Text style={{ marginBottom: 6 }}>
              <Text style={s.bold}>Amount in words: </Text>
              {amountInWords(doc.totalPaise)}
            </Text>
            {doc.reverseCharge ? <Text style={{ marginBottom: 6 }}>Tax payable on reverse charge basis by the recipient.</Text> : null}
          </View>
          <Totals doc={doc} s={s} />
        </View>

        <View style={[s.row, { marginTop: 12, gap: 14 }]} wrap={false}>
          <View style={{ flex: 1, gap: 6 }}>
            {doc.notes ? (
              <View>
                <Text style={s.label}>Notes</Text>
                <Text>{doc.notes}</Text>
              </View>
            ) : null}
            {terms ? (
              <View>
                <Text style={s.label}>Terms and conditions</Text>
                <Text style={{ color: "#404040" }}>{terms}</Text>
              </View>
            ) : null}
            {bank ? (
              <View>
                <Text style={s.label}>Bank details</Text>
                <Text>{bank.accountName}</Text>
                <Text>{bank.bankName}{bank.branch ? `, ${bank.branch}` : ""}</Text>
                <Text>A/c {bank.accountNumber} · IFSC {bank.ifsc}</Text>
              </View>
            ) : null}
          </View>
          {qr ? (
            <View style={{ alignItems: "center", width: 100 }}>
              <Image src={qr} style={{ width: 88, height: 88 }} />
              <Text style={{ fontSize: 7, textAlign: "center" }}>Scan to pay {formatPaise(due)} by UPI</Text>
              <Text style={{ fontSize: 7, color: "#737373" }}>{t.upiId}</Text>
            </View>
          ) : null}
          <View style={{ width: 160, alignItems: "flex-end" }}>
            <Text style={s.bold}>For {seller?.tradeName || seller?.legalName || ""}</Text>
            <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 6 }}>
              {assets.stamp ? <Image src={assets.stamp} style={{ height: 48, width: 48, objectFit: "contain" }} /> : null}
              {assets.signature ? <Image src={assets.signature} style={{ height: 40, maxWidth: 110, objectFit: "contain" }} /> : null}
            </View>
            <Text style={{ borderTopWidth: 0.5, borderTopColor: "#A3A3A3", paddingTop: 2, fontSize: 7.5, color: "#525252" }}>Authorised signatory</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{t.footer ?? "This is a computer-generated document."}</Text>
          <Text render={({ pageNumber, totalPages }) => `${doc.number ?? "Draft"} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** A sales document as a PDF. `seller` is used for drafts (issued documents carry their own copy). */
export async function renderDocumentPdf(doc: PdfDocument, company: Seller | null, assets: DocumentAssets): Promise<Buffer> {
  const element = await DocumentBody({ doc, seller: doc.seller ?? company, assets });
  return renderToBuffer(element);
}

export type PdfReceipt = {
  number: string | null;
  status: string;
  customerName: string;
  paymentDate: string;
  amountPaise: number;
  allocatedPaise: number;
  method: string;
  reference: string | null;
  allocations: { id: string; invoiceNumber: string | null; invoiceDate: string; amountPaise: number }[];
};

/** A payment receipt as a PDF. */
export async function renderReceiptPdf(p: PdfReceipt, seller: Seller | null, assets: DocumentAssets): Promise<Buffer> {
  const s = styles(assets.template);
  const advance = p.amountPaise - p.allocatedPaise;
  return renderToBuffer(
    <Document title={`Receipt ${p.number ?? ""}`} author={seller?.legalName ?? ""} creator="Automate Ideas">
      <Page size="A4" style={s.page}>
        {p.status === "void" ? <Text style={s.watermark} fixed>void</Text> : null}
        <View style={[s.band, s.between]}>
          <View style={[s.row, { gap: 10 }]}>
            {assets.logo ? <Image src={assets.logo} style={{ height: 40, maxWidth: 100, objectFit: "contain" }} /> : null}
            <View>
              <Text style={s.company}>{seller?.tradeName || seller?.legalName || ""}</Text>
              {seller?.gstin ? <Text>GSTIN: {seller.gstin}</Text> : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.title}>Payment receipt</Text>
            <Text style={s.bold}>{p.number}</Text>
            <Text>{fmtDate(p.paymentDate)}</Text>
          </View>
        </View>
        <Text style={{ marginVertical: 14, lineHeight: 1.5 }}>
          Received with thanks from <Text style={s.bold}>{p.customerName}</Text> the sum of <Text style={s.bold}>{formatPaise(p.amountPaise)}</Text> ({amountInWords(p.amountPaise)}) by {methodLabel(p.method)}
          {p.reference ? ` (ref. ${p.reference})` : ""}.
        </Text>
        {p.allocations.length ? (
          <View>
            <View style={s.row}>
              <Text style={[s.th, { width: "40%" }]}>Against invoice</Text>
              <Text style={[s.th, { width: "30%" }]}>Invoice date</Text>
              <Text style={[s.th, s.right, { width: "30%" }]}>Amount</Text>
            </View>
            {p.allocations.map((a) => (
              <View key={a.id} style={s.tr}>
                <Text style={[s.td, { width: "40%" }]}>{a.invoiceNumber}</Text>
                <Text style={[s.td, { width: "30%" }]}>{fmtDate(a.invoiceDate)}</Text>
                <Text style={[s.td, s.right, { width: "30%" }]}>{formatPaise(a.amountPaise)}</Text>
              </View>
            ))}
            {advance > 0 ? (
              <View style={s.tr}>
                <Text style={[s.td, { width: "70%" }]}>Advance</Text>
                <Text style={[s.td, s.right, { width: "30%" }]}>{formatPaise(advance)}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text>Received as an advance.</Text>
        )}
        <View style={{ marginTop: 40, alignItems: "flex-end" }} wrap={false}>
          <Text style={s.bold}>For {seller?.tradeName || seller?.legalName || ""}</Text>
          <View style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 6 }}>
            {assets.stamp ? <Image src={assets.stamp} style={{ height: 44, width: 44, objectFit: "contain" }} /> : null}
            {assets.signature ? <Image src={assets.signature} style={{ height: 36, maxWidth: 100, objectFit: "contain" }} /> : null}
          </View>
          <Text style={{ fontSize: 7.5, color: "#525252" }}>Authorised signatory</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>{assets.template.footer ?? "This is a computer-generated receipt."}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
