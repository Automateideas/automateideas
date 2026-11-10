"use client";

import { CircleCheckIcon, CircleXIcon, ClockIcon, ReceiptIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/lib/api";

import { LoadError } from "../../_components/page-parts";
import { dateFormat } from "./subscription-view";

type Payment = {
  id: string;
  txnid: string;
  providerPaymentId: string | null;
  status: string;
  seats: number;
  amountPaise: number;
  currency: string;
  description: string | null;
  paymentMode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const formatPaise = (paise: number) => money.format(paise / 100);
const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function statusBadge(status: string) {
  if (status === "success") return <Badge>Paid</Badge>;
  if (status === "pending") return <Badge variant="secondary">Pending</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
}

/** Loads GET /api/subscription/payments with the shared loading and error states. */
function WithPayments({ children }: { children: (payments: Payment[]) => React.ReactNode }) {
  const query = useApiQuery<{ payments: Payment[] }>("/api/subscription/payments");
  if (query.status === "loading") {
    return <Skeleton className="h-64 rounded-xl" aria-label="Loading payments" aria-busy="true" />;
  }
  if (!query.data) return <LoadError message={query.error.message} onRetry={query.reload} />;
  return (
    <div className="flex flex-col gap-6">
      {query.status === "error" ? (
        <LoadError title="Couldn't refresh payments" message={query.error.message} onRetry={query.reload} />
      ) : null}
      {children(query.data.payments)}
    </div>
  );
}

function NothingYet({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ReceiptIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const RECORDING_NOTE =
  "Payments made through PayU show up here once PayU confirms them.";

/** /subscription/payments: every PayU payment attempt, paid or not. */
export function PaymentsView() {
  return (
    <WithPayments>
      {(payments) =>
        payments.length === 0 ? (
          <NothingYet title="No payments yet" description={RECORDING_NOTE} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>Every seat payment made through PayU, including failed attempts.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Method</TableHead>
                    <TableHead className="hidden lg:table-cell">PayU reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{dateTime.format(new Date(p.createdAt))}</TableCell>
                      <TableCell className="tabular-nums">{p.seats}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPaise(p.amountPaise)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {statusBadge(p.status)}
                          {p.errorMessage ? (
                            <span className="text-xs text-muted-foreground">{p.errorMessage}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{p.paymentMode ?? "—"}</TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">
                        {p.providerPaymentId ?? p.txnid}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      }
    </WithPayments>
  );
}

/** /subscription/history: what changed on the subscription, newest first. */
export function HistoryView() {
  return (
    <WithPayments>
      {(payments) =>
        payments.length === 0 ? (
          <NothingYet
            title="No changes yet"
            description="Seat changes and payment results show up here once you pay through PayU."
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>Seat changes and payment results, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-5">
                {payments.map((p) => {
                  const ok = p.status === "success";
                  const pending = p.status === "pending";
                  const Icon = ok ? CircleCheckIcon : pending ? ClockIcon : CircleXIcon;
                  return (
                    <li key={p.id} className="flex gap-3">
                      <Icon
                        aria-hidden="true"
                        className={ok ? "mt-0.5 size-5 text-primary" : pending ? "mt-0.5 size-5 text-muted-foreground" : "mt-0.5 size-5 text-destructive"}
                      />
                      <div className="flex flex-col gap-0.5">
                        <p className="font-medium">
                          {ok
                            ? `Seats changed to ${p.seats}`
                            : pending
                              ? `Payment for ${p.seats} seats is pending`
                              : `Payment for ${p.seats} seats failed`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {dateTime.format(new Date(p.createdAt))} · {formatPaise(p.amountPaise)}/month
                          {!ok && !pending ? " · Seats unchanged" : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        )
      }
    </WithPayments>
  );
}

/** /subscription/invoices: successful payments, one receipt each. */
export function InvoicesView() {
  return (
    <WithPayments>
      {(all) => {
        const paid = all.filter((p) => p.status === "success");
        return paid.length === 0 ? (
          <NothingYet title="No invoices yet" description="A receipt appears here for every successful PayU payment." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                Receipts for successful PayU payments. GST tax invoices aren&apos;t generated yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt no.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paid.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.txnid}</TableCell>
                      <TableCell className="whitespace-nowrap">{dateFormat.format(new Date(p.createdAt))}</TableCell>
                      <TableCell className="hidden md:table-cell">{p.description ?? `${p.seats} seats (monthly)`}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPaise(p.amountPaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      }}
    </WithPayments>
  );
}
