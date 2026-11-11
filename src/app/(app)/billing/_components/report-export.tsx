"use client";

import { DownloadIcon, FileSpreadsheetIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

const API = "/api/business-billing/reports";

/** CSV and Excel downloads of a report, with the filters shown on screen. */
export function ExportButtons({ reportId, query, disabled }: { reportId: string; query: string; disabled?: boolean }) {
  if (disabled) return null;
  const href = (format: string) => `${API}/${reportId}?${query ? `${query}&` : ""}format=${format}`;
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" render={<a href={href("csv")} download />} nativeButton={false}>
        <DownloadIcon data-icon="inline-start" />
        CSV
      </Button>
      <Button variant="outline" size="sm" render={<a href={href("xlsx")} download />} nativeButton={false}>
        <FileSpreadsheetIcon data-icon="inline-start" />
        Excel
      </Button>
    </div>
  );
}

/** Downloads for the trial balance, P&L or balance sheet, for the dates on screen. */
export function StatementExport({ report, from, to, asOf }: { report: "trial-balance" | "profit-loss" | "balance-sheet"; from?: string; to?: string; asOf?: string }) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  if (asOf) q.set("asOf", asOf);
  return <ExportButtons reportId={report} query={q.toString()} />;
}
