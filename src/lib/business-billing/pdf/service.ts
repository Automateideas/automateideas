import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { billingFiles } from "@/db/schema";
import { getFileBytes, putFile, storageEnabled } from "@/lib/storage";

import { currentSeller, getDocument } from "../documents/service";
import { DOCUMENT_TYPES, type DocumentSlug } from "../documents/types";
import { getPayment } from "../payments/service";
import { documentAssets } from "../template-settings";
import { withTenant } from "../tenant-db";
import { renderDocumentPdf, renderReceiptPdf } from "./document-pdf";

// PDFs are made on the server. Issued documents and receipts are also stored
// (S3 via lib/storage.ts, with a billing_files row), keyed by a hash of
// everything printed on them: the same content is served from storage, and
// anything that changes the page (a payment changing the amount due, a new
// template or logo) produces a new file. Drafts are never stored.

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
const sha = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

async function storedOrRender(organizationId: string, entityType: string, entityId: string, fileName: string, content: unknown, render: () => Promise<Buffer>) {
  const hash = sha(content);
  const key = `orgs/${organizationId}/documents/${entityType}/${entityId}/${hash.slice(0, 24)}.pdf`;
  if (storageEnabled()) {
    const [existing] = await withTenant(organizationId, (tx) =>
      tx.select({ id: billingFiles.id }).from(billingFiles).where(and(eq(billingFiles.organizationId, organizationId), eq(billingFiles.storageKey, key))),
    );
    if (existing) {
      try {
        return { bytes: Buffer.from((await getFileBytes(key)).bytes), fileName, stored: true };
      } catch (error) {
        console.error("Stored PDF unreadable; rendering again", { key, error });
      }
    }
  }
  const bytes = await render();
  if (storageEnabled()) {
    try {
      await putFile(key, bytes, "application/pdf");
      await withTenant(organizationId, (tx) =>
        tx
          .insert(billingFiles)
          .values({ organizationId, storageKey: key, fileName, contentType: "application/pdf", sizeBytes: bytes.length, sha256: sha(bytes.toString("base64")), entityType, entityId })
          .onConflictDoNothing(),
      );
    } catch (error) {
      // Storing is a convenience; the download still works.
      console.error("Storing PDF failed", { key, error });
    }
  }
  return { bytes, fileName, stored: false };
}

export async function documentPdf(organizationId: string, slug: DocumentSlug, id: string) {
  const [doc, company, assets] = await Promise.all([getDocument(organizationId, slug, id), currentSeller(organizationId), documentAssets(organizationId)]);
  const fileName = `${safeName(`${DOCUMENT_TYPES[slug].singular} ${doc.number ?? "draft"}`)}.pdf`;
  const render = () => renderDocumentPdf(doc, company, assets);
  if (doc.status === "draft") return { bytes: await render(), fileName, stored: false };
  const content = { v: 1, doc: { ...doc, updatedAt: null }, assets: { ...assets, logo: assets.logo && sha(assets.logo), signature: assets.signature && sha(assets.signature), stamp: assets.stamp && sha(assets.stamp) } };
  return storedOrRender(organizationId, `document-${slug}`, id, fileName, content, render);
}

export async function receiptPdf(organizationId: string, paymentId: string) {
  const [p, company, assets] = await Promise.all([getPayment(organizationId, paymentId), currentSeller(organizationId), documentAssets(organizationId)]);
  const fileName = `${safeName(`Receipt ${p.number ?? ""}`)}.pdf`;
  const content = { v: 1, p, assets: { ...assets, logo: assets.logo && sha(assets.logo), signature: assets.signature && sha(assets.signature), stamp: assets.stamp && sha(assets.stamp) }, company };
  return storedOrRender(organizationId, "payment", paymentId, fileName, content, () => renderReceiptPdf(p, company, assets));
}

/** The HTTP response for a PDF: inline to view, or ?download=1 to save. */
export function pdfResponse(pdf: { bytes: Buffer; fileName: string }, download: boolean) {
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
