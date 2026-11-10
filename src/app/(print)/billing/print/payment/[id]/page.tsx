import { Suspense } from "react";
import type { Metadata } from "next";

import { ReceiptPrint } from "@/app/(app)/billing/_components/payments";

export const metadata: Metadata = {
  title: "Receipt · Billing",
  robots: { index: false },
};

// Printable payment receipt, outside the app shell; behind the login proxy.
export default function Page({ params }: PageProps<"/billing/print/payment/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-neutral-500">Loading…</p>}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: { params: PageProps<"/billing/print/payment/[id]">["params"] }) {
  const { id } = await params;
  return <ReceiptPrint key={id} id={id} />;
}
