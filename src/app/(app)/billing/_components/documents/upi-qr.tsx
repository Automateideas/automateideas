"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { formatPaise } from "@/lib/business-billing/fields";
import { upiPayLink } from "@/lib/business-billing/template";

/** "Scan to pay" QR: any UPI app opens with the payee and exact amount filled in. */
export function UpiQr({ upiId, payeeName, amountPaise, note }: { upiId: string; payeeName: string; amountPaise: number; note: string }) {
  const link = upiPayLink({ upiId, payeeName, amountPaise, note });
  const [qr, setQr] = useState<{ link: string; src: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 240 }).then((src) => !cancelled && setQr({ link, src }));
    return () => {
      cancelled = true;
    };
  }, [link]);
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      {qr?.link === link ? (
        // A data URL generated here; next/image adds nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr.src} alt={`UPI QR code to pay ${formatPaise(amountPaise)}`} className="size-28" />
      ) : (
        <div className="size-28 rounded bg-neutral-100" aria-hidden="true" />
      )}
      <p className="text-[11px]">Scan to pay {formatPaise(amountPaise)} by UPI</p>
      <p className="text-[11px] text-neutral-500">{upiId}</p>
    </div>
  );
}
