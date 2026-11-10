"use client";

// The printable document (A4): invoices, quotations, sales orders and notes.
// Used on the document page and the print page.

import { formatPaise, stateByCode } from "@/lib/business-billing/fields";
import { DOCUMENT_TYPES, type DocumentSlug, amountInWords } from "@/lib/business-billing/documents/types";
import { countries } from "@/lib/countries";
import { cn } from "@/lib/utils";

export type Address = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  postalCode: string | null;
  countryCode: string;
} | null;

export type Seller = {
  legalName: string;
  tradeName?: string | null;
  gstin: string | null;
  pan?: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode?: string | null;
  postalCode: string | null;
  countryCode: string;
};

export type DocItem = {
  id: string;
  lineNo: number;
  description: string;
  hsnSac: string | null;
  quantity: string;
  unitCode: string | null;
  ratePaise: number;
  discountPaise: number;
  invoiceDiscountPaise: number;
  taxCategory: string;
  taxRate: string;
  cessRate: string;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
};

export type DocCharge = { label: string; amountPaise: number; appliedTaxRate: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; cessPaise: number; totalPaise: number };

export type PaperDocument = {
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
  pricesIncludeTax: boolean;
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
  charges: DocCharge[];
  seller: Seller | null;
  notes: string | null;
  terms: string | null;
  items: DocItem[];
  related: { slug: DocumentSlug; number: string | null }[];
  voidReason: string | null;
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : "—");
const qty = (q: string) => (q.includes(".") ? q.replace(/\.?0+$/, "") : q);
const pct = (r: string) => `${qty(r)}%`;

function AddressLines({ a }: { a: Address }) {
  if (!a) return null;
  const country = a.countryCode !== "IN" ? countries.find((c) => c.code === a.countryCode)?.label : null;
  return (
    <>
      {[a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(", "), [a.postalCode, country].filter(Boolean).join(" ")]
        .filter(Boolean)
        .map((l, i) => (
          <span key={i} className="block">
            {l}
          </span>
        ))}
    </>
  );
}

function title(doc: PaperDocument) {
  if (doc.slug !== "invoices") return DOCUMENT_TYPES[doc.slug].singular;
  if (!doc.seller?.gstin && doc.status === "draft") return "Invoice";
  if (!doc.seller?.gstin) return "Invoice";
  // GST: an invoice with only exempt / non-taxable supplies is a "Bill of Supply".
  const anyTax = doc.items.some((i) => i.taxCategory === "taxable");
  return anyTax ? "Tax Invoice" : "Bill of Supply";
}

/** Tax by rate, for the GST summary table. */
function byRate(doc: PaperDocument) {
  const rows = new Map<string, { rate: string; taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
  const add = (rate: string, t: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; cessPaise: number }) => {
    const r = rows.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    r.taxable += t.taxablePaise;
    r.cgst += t.cgstPaise;
    r.sgst += t.sgstPaise;
    r.igst += t.igstPaise;
    r.cess += t.cessPaise;
    rows.set(rate, r);
  };
  doc.items.filter((i) => i.taxCategory === "taxable").forEach((i) => add(qty(i.taxRate), i));
  doc.charges.forEach((c) => add(qty(c.appliedTaxRate), c));
  return [...rows.values()].sort((a, b) => Number(a.rate) - Number(b.rate));
}

export function DocumentPaper({ doc, company, logoUrl, className }: { doc: PaperDocument; company: Seller | null; logoUrl: string | null; className?: string }) {
  const seller = doc.seller ?? company;
  const intra = doc.supplyType === "intra_state";
  const pos = doc.placeOfSupply === "96" ? "Outside India (96)" : stateByCode(doc.placeOfSupply) ? `${stateByCode(doc.placeOfSupply)!.name} (${doc.placeOfSupply})` : "—";
  const extra = DOCUMENT_TYPES[doc.slug].extraDate;
  const source = doc.related.find((r) => r.slug === "invoices" && DOCUMENT_TYPES[doc.slug].needsInvoice);
  const rates = byRate(doc);
  const showCess = doc.cessPaise > 0;
  const showDiscount = doc.items.some((i) => i.discountPaise > 0);

  return (
    <article
      className={cn(
        "relative mx-auto w-full max-w-[210mm] bg-white p-6 text-[13px] leading-snug text-neutral-900 shadow-sm ring-1 ring-neutral-200 sm:p-10 print:max-w-none print:p-0 print:shadow-none print:ring-0",
        className,
      )}
      aria-label={`${title(doc)} ${doc.number ?? "draft"}`}
    >
      {doc.status === "draft" || doc.status === "void" ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-30 text-7xl font-bold tracking-widest text-neutral-200 uppercase sm:text-8xl">{doc.status}</span>
        </div>
      ) : null}

      <header className="relative flex flex-col gap-6 border-b border-neutral-300 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            // The signed logo URL changes; next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-16 w-auto max-w-40 object-contain" />
          ) : null}
          <div>
            <p className="text-lg font-semibold">{seller?.tradeName || seller?.legalName || "Your company"}</p>
            {seller?.tradeName && seller.tradeName !== seller.legalName ? <p className="text-neutral-600">{seller.legalName}</p> : null}
            <p className="mt-1 text-neutral-600">
              <AddressLines a={seller ? { ...seller, stateCode: seller.stateCode ?? null } : null} />
            </p>
            {seller?.gstin ? <p className="mt-1">GSTIN: <span className="font-mono">{seller.gstin}</span></p> : null}
            {seller?.phone || seller?.email ? <p className="text-neutral-600">{[seller?.phone, seller?.email].filter(Boolean).join(" · ")}</p> : null}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xl font-bold tracking-wide uppercase">{title(doc)}</p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-start gap-x-3 gap-y-0.5 sm:justify-end">
            <dt className="text-neutral-600">Number</dt>
            <dd className="font-mono">{doc.number ?? "Draft"}</dd>
            <dt className="text-neutral-600">Date</dt>
            <dd>{fmtDate(doc.issueDate)}</dd>
            {extra && doc.extraDate ? (
              <>
                <dt className="text-neutral-600">{extra.label}</dt>
                <dd>{fmtDate(doc.extraDate)}</dd>
              </>
            ) : null}
            {source ? (
              <>
                <dt className="text-neutral-600">Against invoice</dt>
                <dd className="font-mono">{source.number}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </header>

      <section className="relative grid gap-5 border-b border-neutral-300 py-5 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Bill to</p>
          <p className="mt-1 font-semibold">{doc.partyName}</p>
          <p className="text-neutral-700">
            <AddressLines a={doc.billingAddress} />
          </p>
          {doc.partyGstin ? <p className="mt-1">GSTIN: <span className="font-mono">{doc.partyGstin}</span></p> : <p className="mt-1 text-neutral-500">Unregistered</p>}
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Ship to</p>
          <p className="mt-1 text-neutral-700">
            {doc.shippingAddress ? <AddressLines a={doc.shippingAddress} /> : "Same as billing"}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5">
          <dt className="text-neutral-600">Place of supply</dt>
          <dd>{pos}</dd>
          <dt className="text-neutral-600">Reverse charge</dt>
          <dd>{doc.reverseCharge ? "Yes" : "No"}</dd>
          {doc.zeroRated ? (
            <>
              <dt className="text-neutral-600">Supply</dt>
              <dd>{doc.zeroRated === "lut" ? "Zero-rated, under LUT/bond" : "Zero-rated, IGST paid"}</dd>
            </>
          ) : null}
          {doc.reason ? (
            <>
              <dt className="text-neutral-600">Reason</dt>
              <dd>{doc.reason}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <div className="relative -mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <table className="mt-4 w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs text-neutral-600 uppercase">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Item</th>
              <th className="py-2 pr-2 font-semibold">HSN/SAC</th>
              <th className="py-2 pr-2 text-right font-semibold">Qty</th>
              <th className="py-2 pr-2 text-right font-semibold">Rate</th>
              {showDiscount ? <th className="py-2 pr-2 text-right font-semibold">Disc.</th> : null}
              <th className="py-2 pr-2 text-right font-semibold">Taxable</th>
              <th className="py-2 pr-2 text-right font-semibold">GST</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((i) => (
              <tr key={i.id} className="border-b border-neutral-200 align-top break-inside-avoid">
                <td className="py-2 pr-2 tabular-nums">{i.lineNo}</td>
                <td className="py-2 pr-2 whitespace-pre-line">{i.description}</td>
                <td className="py-2 pr-2 font-mono text-xs">{i.hsnSac ?? ""}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {qty(i.quantity)} {i.unitCode ?? ""}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatPaise(i.ratePaise)}</td>
                {showDiscount ? <td className="py-2 pr-2 text-right tabular-nums">{i.discountPaise ? formatPaise(i.discountPaise) : ""}</td> : null}
                <td className="py-2 pr-2 text-right tabular-nums">{formatPaise(i.taxablePaise)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {i.taxCategory === "taxable" ? pct(i.taxRate) : { exempt: "Exempt", nil_rated: "Nil", non_gst: "Non-GST" }[i.taxCategory] ?? ""}
                  {Number(i.cessRate) > 0 ? <span className="block text-xs text-neutral-500">+{pct(i.cessRate)} cess</span> : null}
                </td>
                <td className="py-2 text-right tabular-nums">{formatPaise(i.totalPaise)}</td>
              </tr>
            ))}
            {doc.charges.map((c, n) => (
              <tr key={`c${n}`} className="border-b border-neutral-200 break-inside-avoid">
                <td />
                <td className="py-2 pr-2" colSpan={showDiscount ? 5 : 4}>
                  {c.label}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatPaise(c.taxablePaise)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{pct(c.appliedTaxRate)}</td>
                <td className="py-2 text-right tabular-nums">{formatPaise(c.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="relative mt-5 grid gap-6 break-inside-avoid sm:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          {rates.length && (doc.cgstPaise || doc.sgstPaise || doc.igstPaise) ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-300 text-left text-neutral-600 uppercase">
                  <th className="py-1.5 pr-2 font-semibold">GST rate</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Taxable</th>
                  {intra ? (
                    <>
                      <th className="py-1.5 pr-2 text-right font-semibold">CGST</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">SGST</th>
                    </>
                  ) : (
                    <th className="py-1.5 pr-2 text-right font-semibold">IGST</th>
                  )}
                  {showCess ? <th className="py-1.5 text-right font-semibold">Cess</th> : null}
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.rate} className="border-b border-neutral-200">
                    <td className="py-1.5 pr-2">{r.rate}%</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatPaise(r.taxable)}</td>
                    {intra ? (
                      <>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{formatPaise(r.cgst)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{formatPaise(r.sgst)}</td>
                      </>
                    ) : (
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatPaise(r.igst)}</td>
                    )}
                    {showCess ? <td className="py-1.5 text-right tabular-nums">{formatPaise(r.cess)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p>
            <span className="text-neutral-600">Amount in words: </span>
            <span className="font-medium">{amountInWords(doc.totalPaise)}</span>
          </p>
          {doc.reverseCharge ? <p className="text-neutral-600">Tax payable on reverse charge basis by the recipient.</p> : null}
          {doc.notes ? (
            <div>
              <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Notes</p>
              <p className="whitespace-pre-line">{doc.notes}</p>
            </div>
          ) : null}
          {doc.terms ? (
            <div>
              <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Terms and conditions</p>
              <p className="whitespace-pre-line text-neutral-700">{doc.terms}</p>
            </div>
          ) : null}
        </div>
        <dl className="flex flex-col gap-1">
          {[
            ["Subtotal", doc.subtotalPaise],
            ["Discount", -doc.discountPaise],
            ["Taxable value", doc.taxablePaise],
            ["CGST", doc.cgstPaise],
            ["SGST", doc.sgstPaise],
            ["IGST", doc.igstPaise],
            ["Cess", doc.cessPaise],
            ["Round-off", doc.roundOffPaise],
          ]
            .filter(([label, v]) => label === "Taxable value" || v !== 0)
            .map(([label, v]) => (
              <div key={label as string} className="flex justify-between gap-4">
                <dt className="text-neutral-600">{label}</dt>
                <dd className="tabular-nums">{formatPaise(v as number)}</dd>
              </div>
            ))}
          <div className="mt-1 flex justify-between gap-4 border-t border-neutral-300 pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(doc.totalPaise)}</dd>
          </div>
        </dl>
      </section>

      <footer className="relative mt-10 flex flex-col gap-6 break-inside-avoid sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-neutral-500">This is a computer-generated document.</p>
        <div className="text-right">
          <p className="font-medium">For {seller?.tradeName || seller?.legalName || "your company"}</p>
          <div className="h-12" />
          <p className="border-t border-neutral-400 pt-1 text-xs text-neutral-600">Authorised signatory</p>
        </div>
      </footer>
    </article>
  );
}
