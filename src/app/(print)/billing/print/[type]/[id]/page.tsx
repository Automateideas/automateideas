import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintView } from "@/app/(app)/billing/_components/documents/documents-ui";
import { isDocumentSlug } from "@/lib/business-billing/documents/types";

export const metadata: Metadata = {
  title: "Print · Billing",
  robots: { index: false },
};

// Print: outside the app shell (no sidebar or tabs), still behind the login
// proxy (/billing/:path*). The API it calls checks the session and Billing access.
export default function Page({ params }: PageProps<"/billing/print/[type]/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-neutral-500">Loading…</p>}>
      <Print params={params} />
    </Suspense>
  );
}

async function Print({ params }: { params: PageProps<"/billing/print/[type]/[id]">["params"] }) {
  const { type, id } = await params;
  if (!isDocumentSlug(type)) notFound();
  return <PrintView key={id} slug={type} id={id} />;
}
