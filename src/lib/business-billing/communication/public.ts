import { getDocument } from "../documents/service";
import { DOCUMENT_TYPES, type DocumentSlug } from "../documents/types";
import { getPayment } from "../payments/service";
import { getBillingSettings } from "../settings";
import { resolveShare } from "./shares";

/**
 * What the public share page shows: only the document's headline facts and
 * the company's name, nothing else about the company or other documents.
 */
export async function sharedSummary(token: string) {
  const share = await resolveShare(token);
  if (!share) return null;
  const s = await getBillingSettings(share.organizationId);
  const company = (s.configured ? s.tradeName : null) ?? s.legalName;
  if (share.documentType === "receipt") {
    const p = await getPayment(share.organizationId, share.documentId);
    return { company, label: "Receipt", number: p.number, partyName: p.customerName, date: p.paymentDate, dueDate: null, totalPaise: p.amountPaise, balancePaise: null, void: p.status === "void" };
  }
  const slug = share.documentType as DocumentSlug;
  const d = await getDocument(share.organizationId, slug, share.documentId);
  return {
    company,
    label: DOCUMENT_TYPES[slug].singular,
    number: d.number,
    partyName: d.partyName,
    date: d.issueDate,
    dueDate: slug === "invoices" ? d.extraDate : null,
    totalPaise: d.totalPaise,
    balancePaise: slug === "invoices" ? (d.payment?.balancePaise ?? null) : null,
    void: d.status === "void",
  };
}
