"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalculatorIcon, CircleCheckIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { TAX_CATEGORY_OPTIONS } from "@/lib/business-billing/catalogue-validation";
import { formatPaise, stateByCode } from "@/lib/business-billing/fields";
import { type NumberFormat, type NumberedDocument, formatDocumentNumber } from "@/lib/business-billing/numbering-format";
import type { DocumentTaxResult } from "@/lib/business-billing/tax/gst";
import { type RoundOffMode, validateNumbering } from "@/lib/business-billing/tax-settings-validation";

import { LoadError } from "../../_components/page-parts";
import { SectionNav } from "../../_components/section-nav";
import { type Errors, MoneyField, ReadOnlyNote, STATE_OPTIONS, SelectField, TaxRateField, TextField, focusFirstError, saveError } from "./records-ui";

const BASE = "/api/business-billing";

/** Company · Tax · Invoice numbering · Branding · Templates. */
export function SettingsNav() {
  return (
    <SectionNav
      label="Billing settings"
      links={[
        { href: "/billing/settings", label: "Company" },
        { href: "/billing/settings/tax", label: "Tax" },
        { href: "/billing/settings/invoices", label: "Invoice numbering" },
        { href: "/billing/settings/branding", label: "Branding" },
        { href: "/billing/settings/templates", label: "Templates" },
        { href: "/billing/settings/communication", label: "Email and reminders" },
        { href: "/billing/settings/accounting", label: "Accounting" },
        { href: "/billing/settings/inventory", label: "Inventory" },
      ]}
    />
  );
}

type TaxSettings = {
  configured: boolean;
  gstin: string | null;
  registered: boolean;
  stateCode: string | null;
  pricesIncludeTax: boolean;
  roundOff: RoundOffMode;
  canEdit: boolean;
  readOnlyReason: string | null;
  updatedAt: string | null;
};

function NotSetUp() {
  return (
    <Alert>
      <AlertTitle>Set up your company first</AlertTitle>
      <AlertDescription>Tax and numbering settings use your company details and GSTIN.</AlertDescription>
      <AlertAction>
        <Button size="sm" render={<Link href="/billing/settings" />} nativeButton={false}>
          Company details
        </Button>
      </AlertAction>
    </Alert>
  );
}

/* ---------------- Tax ---------------- */

export function TaxSettingsView() {
  const query = useApiQuery<TaxSettings>(`${BASE}/tax-settings`);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SettingsNav />
      {query.status === "loading" ? (
        <Skeleton className="h-80 rounded-xl" aria-label="Loading" />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : !query.data.configured ? (
        <NotSetUp />
      ) : (
        <>
          <TaxForm key={query.data.updatedAt ?? "new"} initial={query.data} onSaved={query.reload} />
          <TaxCalculator registered={query.data.registered} defaultInclusive={query.data.pricesIncludeTax} sellerState={query.data.stateCode} />
        </>
      )}
    </div>
  );
}

function TaxForm({ initial, onSaved }: { initial: TaxSettings; onSaved: () => void }) {
  const [form, setForm] = useState({ stateCode: initial.stateCode ?? "", pricesIncludeTax: initial.pricesIncludeTax, roundOff: initial.roundOff });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const readOnly = !initial.canEdit;
  const gstState = initial.gstin ? stateByCode(initial.gstin.slice(0, 2)) : null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await api(`${BASE}/tax-settings`, { method: "PUT", json: { ...form, stateCode: form.stateCode || null } });
        setErrors({});
        setSaved(true);
        onSaved();
      } catch (err) {
        setError(saveError(err, setErrors));
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            GST
            <Badge variant={initial.registered ? "default" : "secondary"}>{initial.registered ? "Registered" : "Not registered"}</Badge>
          </CardTitle>
          <CardDescription>
            {initial.registered ? (
              <>
                GSTIN <span className="font-mono">{initial.gstin}</span>. Invoices to customers in {gstState?.name ?? "your state"} get CGST + SGST; other states get IGST.
              </>
            ) : (
              <>
                Without a GSTIN, invoices carry no GST. <Link href="/billing/settings" className="underline underline-offset-2">Add your GSTIN</Link> if you&apos;re registered.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readOnly ? <div className="mb-5"><ReadOnlyNote reason={initial.readOnlyReason} fallback="Only owners and admins can change tax settings." /></div> : null}
          <fieldset disabled={readOnly || pending}>
            <FieldGroup>
              <SelectField
                id="t-state"
                label="Business state"
                value={gstState ? gstState.code : form.stateCode}
                onValue={(v) => setForm((f) => ({ ...f, stateCode: v }))}
                options={STATE_OPTIONS}
                placeholder="Choose your state"
                disabled={!!gstState || readOnly}
                error={errors.stateCode}
                hint={gstState ? "Set by your GSTIN." : "Where you supply from."}
                className="sm:max-w-sm"
              />
              <Field>
                <FieldLabel id="t-prices">Prices you enter</FieldLabel>
                <ToggleGroup
                  aria-labelledby="t-prices"
                  variant="outline"
                  value={[form.pricesIncludeTax ? "incl" : "excl"]}
                  onValueChange={(v: string[]) => v[0] && setForm((f) => ({ ...f, pricesIncludeTax: v[0] === "incl" }))}
                  className="w-fit"
                >
                  <ToggleGroupItem value="excl">Before GST</ToggleGroupItem>
                  <ToggleGroupItem value="incl">Include GST</ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>The default for new invoices; you can switch it on each one. Retail shops usually price including GST.</FieldDescription>
              </Field>
              <SelectField
                id="t-round"
                label="Round invoice totals"
                value={form.roundOff}
                onValue={(v) => setForm((f) => ({ ...f, roundOff: (v || "nearest_rupee") as RoundOffMode }))}
                options={[
                  { value: "nearest_rupee", label: "To the nearest rupee" },
                  { value: "none", label: "Don't round" },
                ]}
                error={errors.roundOff}
                hint="The difference is shown as a round-off line."
                className="sm:max-w-sm"
              />
            </FieldGroup>
          </fieldset>
        </CardContent>
        {readOnly ? null : (
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save tax settings
            </Button>
            {saved ? (
              <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
                <CircleCheckIcon className="size-4" aria-hidden="true" />
                Saved
              </p>
            ) : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </CardFooter>
        )}
      </Card>
    </form>
  );
}

/* ---------------- Calculator (uses the server's engine) ---------------- */

type CalcLine = { quantity: string; rate: string; discount: string; taxRate: string; cessRate: string; taxCategory: string };
const emptyLine = (): CalcLine => ({ quantity: "1", rate: "", discount: "", taxRate: "18", cessRate: "", taxCategory: "taxable" });
const POS_OPTIONS = [...STATE_OPTIONS, { value: "96", label: "Outside India (96)" }];

/** Try GST on a few lines. The same engine prices every invoice. */
export function TaxCalculator({ registered, defaultInclusive, sellerState }: { registered: boolean; defaultInclusive: boolean; sellerState: string | null }) {
  const [pos, setPos] = useState(sellerState ?? "");
  const [inclusive, setInclusive] = useState(defaultInclusive);
  const [zeroRated, setZeroRated] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [lines, setLines] = useState<CalcLine[]>([emptyLine()]);
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [result, setResult] = useState<DocumentTaxResult | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setLine = (i: number, k: keyof CalcLine, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  function calculate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const r = await api<DocumentTaxResult>(`${BASE}/tax/calculate`, {
          method: "POST",
          json: {
            placeOfSupply: pos || null,
            pricesIncludeTax: inclusive,
            reverseCharge,
            zeroRated: zeroRated || null,
            invoiceDiscount: invoiceDiscount ? { type: "amount", value: invoiceDiscount } : null,
            charges: shipping ? [{ label: "Shipping", amount: shipping, taxRate: "18" }] : [],
            lines: lines.map((l) => ({
              quantity: l.quantity,
              rate: l.rate,
              taxRate: l.taxRate,
              cessRate: l.cessRate || "0",
              taxCategory: l.taxCategory,
              discount: l.discount ? { type: "percent", value: l.discount } : null,
            })),
          },
        });
        setErrors({});
        setResult(r);
      } catch (err) {
        setResult(null);
        if (err instanceof ApiError && err.fields) setErrors(err.fields);
        setError(err instanceof ApiError ? err.message : "Couldn't calculate. Try again.");
        focusFirstError();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalculatorIcon className="size-4" aria-hidden="true" />
          GST calculator
        </CardTitle>
        <CardDescription>Check how an invoice will be taxed. Nothing is saved.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={calculate} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField id="calc-pos" label="Place of supply" value={pos} onValue={setPos} options={POS_OPTIONS} placeholder="Customer's state" error={errors.placeOfSupply} />
            <SelectField
              id="calc-zero"
              label="Export or SEZ"
              value={zeroRated}
              onValue={setZeroRated}
              noneLabel="No"
              options={[
                { value: "lut", label: "Yes, under LUT (no GST)" },
                { value: "with_payment", label: "Yes, with IGST paid" },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Field orientation="horizontal" className="w-auto">
              <Checkbox id="calc-incl" checked={inclusive} onCheckedChange={(c) => setInclusive(c === true)} />
              <FieldLabel htmlFor="calc-incl" className="font-normal">Prices include GST</FieldLabel>
            </Field>
            <Field orientation="horizontal" className="w-auto">
              <Checkbox id="calc-rcm" checked={reverseCharge} onCheckedChange={(c) => setReverseCharge(c === true)} />
              <FieldLabel htmlFor="calc-rcm" className="font-normal">Reverse charge</FieldLabel>
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_minmax(0,1fr)_6rem_auto] sm:items-end">
                <TextField id={`calc-q-${i}`} label="Qty" inputMode="decimal" value={l.quantity} onValue={(v) => setLine(i, "quantity", v)} error={errors[`lines.${i}.quantity`]} />
                <MoneyField id={`calc-r-${i}`} label="Rate" value={l.rate} onValue={(v) => setLine(i, "rate", v)} error={errors[`lines.${i}.rate`]} />
                <TextField id={`calc-d-${i}`} label="Disc %" inputMode="decimal" value={l.discount} onValue={(v) => setLine(i, "discount", v)} error={errors[`lines.${i}.discount.value`]} />
                <SelectField id={`calc-cat-${i}`} label="Type" value={l.taxCategory} onValue={(v) => setLine(i, "taxCategory", v || "taxable")} options={TAX_CATEGORY_OPTIONS} error={errors[`lines.${i}.taxCategory`]} />
                {l.taxCategory === "taxable" ? (
                  <TaxRateField id={`calc-t-${i}`} label="GST" value={l.taxRate} onValue={(v) => setLine(i, "taxRate", v)} error={errors[`lines.${i}.taxRate`]} />
                ) : (
                  <p className="pb-2 text-sm text-muted-foreground">No GST</p>
                )}
                <div className="flex items-end justify-end">
                  {lines.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setLines((ls) => [...ls, emptyLine()])} disabled={lines.length >= 10}>
              <PlusIcon data-icon="inline-start" />
              Add line
            </Button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <MoneyField id="calc-disc" label="Invoice discount" optional value={invoiceDiscount} onValue={setInvoiceDiscount} error={errors["invoiceDiscount.value"] ?? errors.invoiceDiscount} hint="Spread across items before GST." />
            <MoneyField id="calc-ship" label="Shipping (18% GST)" optional value={shipping} onValue={setShipping} error={errors["charges.0.amount"]} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <CalculatorIcon data-icon="inline-start" />}
              Calculate
            </Button>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
        </form>

        {result ? <TaxBreakdown result={result} registered={registered} /> : null}
      </CardContent>
    </Card>
  );
}

const SUPPLY_LABEL = { intra_state: "Within the state: CGST + SGST", inter_state: "Between states: IGST", export: "Outside India" } as const;

export function TaxBreakdown({ result: r, registered }: { result: DocumentTaxResult; registered: boolean }) {
  const rows: [string, number, boolean?][] = [
    ["Items", r.grossPaise],
    ["Item discounts", -r.itemDiscountPaise],
    ["Invoice discount", -r.invoiceDiscountPaise],
    ["Additional charges", r.charges.reduce((a, c) => a + c.amountPaise, 0)],
    ["Taxable value", r.taxablePaise, true],
    ["CGST", r.cgstPaise],
    ["SGST", r.sgstPaise],
    ["IGST", r.igstPaise],
    ["Cess", r.cessPaise],
    ["Round-off", r.roundOffPaise],
  ];
  return (
    <div className="mt-6 flex flex-col gap-4 border-t pt-6" aria-live="polite">
      <p className="text-sm text-muted-foreground">{registered ? SUPPLY_LABEL[r.supplyType] : "Not GST registered: no GST charged."}</p>
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows
          .filter(([, v, always]) => always || v !== 0)
          .map(([label, v, strong]) => (
            <div key={label} className={`flex justify-between gap-4 ${strong ? "font-medium" : ""}`}>
              <dt>{label}</dt>
              <dd className="tabular-nums">{formatPaise(v)}</dd>
            </div>
          ))}
        <div className="mt-2 flex justify-between gap-4 border-t pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPaise(r.totalPaise)}</dd>
        </div>
        {r.reverseChargeTaxPaise ? (
          <p className="text-xs text-muted-foreground">Reverse charge: the customer pays {formatPaise(r.reverseChargeTaxPaise)} GST directly to the government.</p>
        ) : null}
      </dl>
      {r.byRate.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GST rate</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.byRate.map((s) => (
              <TableRow key={s.taxRate}>
                <TableCell>{s.taxRate}%</TableCell>
                <TableCell className="text-right tabular-nums">{formatPaise(s.taxablePaise)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPaise(s.cgstPaise + s.sgstPaise + s.igstPaise + s.cessPaise)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

/* ---------------- Invoice numbering ---------------- */

type NumberingDoc = { type: NumberedDocument; label: string; format: NumberFormat; nextNumber: number; used: boolean; preview: string };
type Numbering = { financialYear: string; documents: NumberingDoc[]; canEdit: boolean; readOnlyReason: string | null };
type FormatForm = { prefix: string; includeFinancialYear: boolean; padding: string };

export function NumberingSettingsView() {
  const query = useApiQuery<Numbering>(`${BASE}/numbering`);
  const tax = useApiQuery<TaxSettings>(`${BASE}/tax-settings`);
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <SettingsNav />
      {query.status === "loading" || tax.status === "loading" ? (
        <Skeleton className="h-96 rounded-xl" aria-label="Loading" />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : tax.data && !tax.data.configured ? (
        <NotSetUp />
      ) : (
        <NumberingForm key={JSON.stringify(query.data.documents.map((d) => [d.format, d.nextNumber]))} data={query.data} onSaved={query.reload} />
      )}
    </div>
  );
}

function NumberingForm({ data, onSaved }: { data: Numbering; onSaved: () => void }) {
  const [forms, setForms] = useState<Record<string, FormatForm>>(() =>
    Object.fromEntries(data.documents.map((d) => [d.type, { prefix: d.format.prefix, includeFinancialYear: d.format.includeFinancialYear, padding: String(d.format.padding) }])),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [restart, setRestart] = useState<NumberingDoc | null>(null);
  const readOnly = !data.canEdit;

  const set = (type: string, k: keyof FormatForm, v: string | boolean) => {
    setForms((f) => ({ ...f, [type]: { ...f[type], [k]: v } }));
    setSaved(false);
  };
  const payload = () => Object.fromEntries(Object.entries(forms).map(([t, f]) => [t, { ...f, padding: Number(f.padding) }]));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const local = validateNumbering(payload());
    if (!local.ok) {
      setErrors(local.errors);
      focusFirstError();
      return;
    }
    start(async () => {
      try {
        await api(`${BASE}/numbering`, { method: "PUT", json: { formats: payload() } });
        setErrors({});
        setSaved(true);
        onSaved();
      } catch (err) {
        setError(saveError(err, setErrors));
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Document numbers</CardTitle>
          <CardDescription>
            Financial year {data.financialYear}. Numbers are given out by the server when a document is issued: never repeated, never skipped, and they restart every financial year. GST allows up to 16 characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {readOnly ? <ReadOnlyNote reason={data.readOnlyReason} fallback="Only owners and admins can change numbering." /> : null}
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead className="hidden sm:table-cell">Year</TableHead>
                  <TableHead className="hidden sm:table-cell">Digits</TableHead>
                  <TableHead>Next number</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.documents.map((d) => {
                  const f = forms[d.type];
                  const err = errors[`${d.type}.prefix`] ?? errors[`${d.type}.padding`];
                  const preview = formatDocumentNumber({ prefix: f.prefix, includeFinancialYear: f.includeFinancialYear, padding: Number(f.padding) || 1 }, data.financialYear, d.nextNumber);
                  return (
                    <TableRow key={d.type} className="align-top">
                      <TableCell className="pt-4 font-medium">{d.label}</TableCell>
                      <TableCell>
                        <Input
                          aria-label={`${d.label} prefix`}
                          value={f.prefix}
                          onChange={(e) => set(d.type, "prefix", e.target.value.toUpperCase())}
                          maxLength={12}
                          className="w-28 font-mono"
                          aria-invalid={!!err}
                          disabled={readOnly || pending}
                        />
                        {err ? <p className="mt-1 max-w-56 text-xs text-destructive">{err}</p> : null}
                      </TableCell>
                      <TableCell className="hidden pt-4 sm:table-cell">
                        <Checkbox
                          aria-label={`Include financial year in ${d.label}`}
                          checked={f.includeFinancialYear}
                          onCheckedChange={(c) => set(d.type, "includeFinancialYear", c === true)}
                          disabled={readOnly || pending}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <SelectField
                          id={`pad-${d.type}`}
                          label="Digits"
                          value={f.padding}
                          onValue={(v) => set(d.type, "padding", v || "4")}
                          options={["1", "2", "3", "4", "5", "6"].map((n) => ({ value: n, label: n }))}
                          className="w-20 [&>label]:sr-only"
                          disabled={readOnly || pending}
                        />
                      </TableCell>
                      <TableCell className="pt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{preview}</span>
                          {readOnly ? null : (
                            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setRestart(d)}>
                              Change
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {readOnly ? null : (
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save formats
            </Button>
            {saved ? (
              <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
                <CircleCheckIcon className="size-4" aria-hidden="true" />
                Saved
              </p>
            ) : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </CardFooter>
        )}
      </Card>
      {restart ? <NextNumberDialog doc={restart} financialYear={data.financialYear} onClose={() => setRestart(null)} onSaved={onSaved} /> : null}
    </form>
  );
}

function NextNumberDialog({ doc, financialYear, onClose, onSaved }: { doc: NumberingDoc; financialYear: string; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(String(doc.nextNumber));
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(value);

  const save = () =>
    start(async () => {
      try {
        await api(`${BASE}/numbering`, { method: "POST", json: { documentType: doc.type, nextNumber: n } });
        onSaved();
        onClose();
      } catch (err) {
        setError(saveError(err, setErrors));
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Next {doc.label.toLowerCase().replace(/s$/, "")} number</DialogTitle>
          <DialogDescription>
            Use this to continue from numbers you issued elsewhere this year. It can only go up, so no number is ever used twice.
          </DialogDescription>
        </DialogHeader>
        <TextField
          id="next-number"
          label="Next number"
          inputMode="numeric"
          value={value}
          onValue={(v) => setValue(v.replace(/\D/g, ""))}
          error={errors.nextNumber}
          hint={Number.isInteger(n) && n > 0 ? `Next: ${formatDocumentNumber(doc.format, financialYear, n)}` : undefined}
        />
        {error && !errors.nextNumber ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending || !(n >= 1)}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
