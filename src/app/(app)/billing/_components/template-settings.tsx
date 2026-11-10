"use client";

import { useRef, useState, useTransition } from "react";
import { CheckIcon, CircleCheckIcon, ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { BRAND_COLORS, type DocumentTemplate, TEMPLATE_DESIGNS, validateTemplate } from "@/lib/business-billing/template";
import { cn } from "@/lib/utils";

import { LoadError } from "../../_components/page-parts";
import { DocumentPaper, type PaperDocument } from "./documents/document-paper";
import { useDocumentContext } from "./documents/documents-ui";
import { type Errors, ReadOnlyNote, TextField, focusFirstError, saveError } from "./records-ui";
import { SettingsNav } from "./tax-settings";

type TemplateResponse = {
  configured: boolean;
  template: DocumentTemplate;
  hasSignature: boolean;
  hasStamp: boolean;
  signatureUrl: string | null;
  stampUrl: string | null;
  canEdit: boolean;
  readOnlyReason: string | null;
};

type FormState = {
  design: DocumentTemplate["design"];
  color: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  showBankDetails: boolean;
  upiId: string;
  showUpiQr: boolean;
  showSignature: boolean;
  showStamp: boolean;
  defaultTerms: string;
  defaultNotes: string;
  footer: string;
};

const toForm = (t: DocumentTemplate): FormState => ({
  design: t.design,
  color: t.color,
  bankName: t.bank?.bankName ?? "",
  accountName: t.bank?.accountName ?? "",
  accountNumber: t.bank?.accountNumber ?? "",
  ifsc: t.bank?.ifsc ?? "",
  branch: t.bank?.branch ?? "",
  showBankDetails: t.showBankDetails,
  upiId: t.upiId ?? "",
  showUpiQr: t.showUpiQr,
  showSignature: t.showSignature,
  showStamp: t.showStamp,
  defaultTerms: t.defaultTerms ?? "",
  defaultNotes: t.defaultNotes ?? "",
  footer: t.footer ?? "",
});

const toPayload = (f: FormState) => ({
  design: f.design,
  color: f.color,
  bank: { bankName: f.bankName, accountName: f.accountName, accountNumber: f.accountNumber, ifsc: f.ifsc, branch: f.branch },
  showBankDetails: f.showBankDetails,
  upiId: f.upiId,
  showUpiQr: f.showUpiQr,
  showSignature: f.showSignature,
  showStamp: f.showStamp,
  defaultTerms: f.defaultTerms,
  defaultNotes: f.defaultNotes,
  footer: f.footer,
});

/** A sample invoice for the preview. */
const SAMPLE: PaperDocument = {
  slug: "invoices",
  number: "INV/2026-27/0001",
  status: "issued",
  issueDate: "2026-11-10",
  extraDate: "2026-11-25",
  partyName: "Sample Customer Pvt Ltd",
  partyGstin: "27AAACS1234E1Z2",
  billingAddress: { addressLine1: "12 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", stateCode: "27", postalCode: "411001", countryCode: "IN" },
  shippingAddress: null,
  placeOfSupply: "27",
  supplyType: "intra_state",
  reverseCharge: false,
  zeroRated: null,
  pricesIncludeTax: false,
  reason: null,
  subtotalPaise: 250000,
  discountPaise: 0,
  taxablePaise: 250000,
  cgstPaise: 22500,
  sgstPaise: 22500,
  igstPaise: 0,
  cessPaise: 0,
  roundOffPaise: 0,
  totalPaise: 295000,
  charges: [],
  seller: null,
  notes: null,
  terms: null,
  items: [
    { id: "1", lineNo: 1, description: "Consulting (per hour)", hsnSac: "998311", quantity: "2", unitCode: "HRS", ratePaise: 100000, discountPaise: 0, invoiceDiscountPaise: 0, taxCategory: "taxable", taxRate: "18", cessRate: "0", taxablePaise: 200000, cgstPaise: 18000, sgstPaise: 18000, igstPaise: 0, cessPaise: 0, totalPaise: 236000 },
    { id: "2", lineNo: 2, description: "Report printing", hsnSac: "4911", quantity: "1", unitCode: "NOS", ratePaise: 50000, discountPaise: 0, invoiceDiscountPaise: 0, taxCategory: "taxable", taxRate: "18", cessRate: "0", taxablePaise: 50000, cgstPaise: 4500, sgstPaise: 4500, igstPaise: 0, cessPaise: 0, totalPaise: 59000 },
  ],
  related: [],
  voidReason: null,
  payment: { balancePaise: 295000 },
};

export function TemplateSettingsView() {
  const q = useApiQuery<TemplateResponse>("/api/business-billing/template");
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-3xl">
        <SettingsNav />
      </div>
      {q.status === "loading" ? (
        <Skeleton className="h-96 rounded-xl" aria-label="Loading" />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : !q.data.configured ? (
        <ReadOnlyNote reason="Save your company details first (Billing → Settings → Company)." />
      ) : (
        <TemplateForm key={JSON.stringify(q.data.template)} data={q.data} reload={q.reload} />
      )}
    </div>
  );
}

function TemplateForm({ data, reload }: { data: TemplateResponse; reload: () => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(data.template));
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const ctx = useDocumentContext();
  const readOnly = !data.canEdit;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const local = validateTemplate(toPayload(form));
  const previewTemplate = local.ok ? local.values : data.template;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!local.ok) {
      setErrors(local.errors);
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        await api("/api/business-billing/template", { method: "PUT", json: toPayload(form) });
        setSaved(true);
        reload();
      } catch (err) {
        setError(saveError(err, setErrors));
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        {readOnly ? <ReadOnlyNote reason={data.readOnlyReason} fallback="Only owners and admins can change templates." /> : null}
        <fieldset disabled={readOnly || pending} className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Design</CardTitle>
              <CardDescription>Used for invoices, quotations, orders, notes and receipts, on screen and in PDFs.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div role="radiogroup" aria-label="Design" className="grid gap-3 sm:grid-cols-3">
                {TEMPLATE_DESIGNS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    role="radio"
                    aria-checked={form.design === d.value}
                    onClick={() => set("design", d.value)}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border p-3 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      form.design === d.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center justify-between font-medium">
                      {d.label}
                      {form.design === d.value ? <CheckIcon className="size-4 text-primary" aria-hidden="true" /> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{d.description}</span>
                  </button>
                ))}
              </div>
              <Field data-invalid={!!errors.color}>
                <FieldLabel id="t-color-label">Brand colour</FieldLabel>
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby="t-color-label">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={form.color.toUpperCase() === c}
                      aria-label={c}
                      onClick={() => set("color", c)}
                      className={cn("size-8 rounded-full ring-offset-2 outline-none focus-visible:ring-3", form.color.toUpperCase() === c && "ring-2 ring-foreground")}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <Input aria-label="Colour code" value={form.color} onChange={(e) => set("color", e.target.value)} maxLength={7} className="w-28 font-mono" aria-invalid={!!errors.color} />
                </div>
                <FieldError>{errors.color}</FieldError>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Getting paid</CardTitle>
              <CardDescription>Shown on invoices, quotations and orders so customers know how to pay.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField id="t-bank" label="Bank name" optional value={form.bankName} onValue={(v) => set("bankName", v)} error={errors["bank.bankName"]} />
                  <TextField id="t-acname" label="Account holder" optional value={form.accountName} onValue={(v) => set("accountName", v)} error={errors["bank.accountName"]} />
                  <TextField id="t-acno" label="Account number" optional inputMode="numeric" maxLength={18} value={form.accountNumber} onValue={(v) => set("accountNumber", v.replace(/\D/g, ""))} error={errors["bank.accountNumber"]} />
                  <TextField id="t-ifsc" label="IFSC" optional maxLength={11} value={form.ifsc} onValue={(v) => set("ifsc", v.toUpperCase())} error={errors["bank.ifsc"]} />
                  <TextField id="t-branch" label="Branch" optional value={form.branch} onValue={(v) => set("branch", v)} error={errors["bank.branch"]} />
                  <TextField id="t-upi" label="UPI ID" optional value={form.upiId} onValue={(v) => set("upiId", v.trim())} error={errors.upiId} placeholder="business@okhdfc" hint="Invoices with money due get a QR code for the exact amount." />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <Toggle id="t-showbank" label="Show bank details" checked={form.showBankDetails} onChange={(v) => set("showBankDetails", v)} />
                  <Toggle id="t-showqr" label="Show UPI QR code" checked={form.showUpiQr} onChange={(v) => set("showUpiQr", v)} />
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Text</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="t-terms">Default terms and conditions</FieldLabel>
                  <Textarea id="t-terms" rows={3} value={form.defaultTerms} onChange={(e) => set("defaultTerms", e.target.value)} />
                  <FieldDescription>Filled in on new documents; you can change them on each one.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-notes">Default notes</FieldLabel>
                  <Textarea id="t-notes" rows={2} value={form.defaultNotes} onChange={(e) => set("defaultNotes", e.target.value)} placeholder="e.g. Thank you for your business." />
                </Field>
                <TextField id="t-footer" label="Footer" optional value={form.footer} onValue={(v) => set("footer", v)} error={errors.footer} placeholder="This is a computer-generated document." hint="A line at the bottom of every page." />
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signature and stamp</CardTitle>
              <CardDescription>PNG or JPG. A transparent background looks best.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <ImageSlot kind="signature" label="Signature" url={data.signatureUrl} readOnly={readOnly} onChanged={reload} show={form.showSignature} onShow={(v) => set("showSignature", v)} />
              <ImageSlot kind="stamp" label="Company stamp" url={data.stampUrl} readOnly={readOnly} onChanged={reload} show={form.showStamp} onShow={(v) => set("showStamp", v)} />
            </CardContent>
            {readOnly ? null : (
              <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Button type="submit" disabled={pending}>
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  Save template
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
        </fieldset>
      </form>

      <div className="flex flex-col gap-2 xl:sticky xl:top-4 xl:self-start">
        <p className="text-sm font-medium">Preview</p>
        <div className="max-h-[80vh] overflow-auto rounded-xl bg-muted/40 p-3">
          <div className="origin-top-left">
            <DocumentPaper
              doc={{ ...SAMPLE, terms: form.defaultTerms || null, notes: form.defaultNotes || null }}
              company={ctx.company}
              logoUrl={ctx.logoUrl}
              look={{ template: previewTemplate, signatureUrl: data.signatureUrl, stampUrl: data.stampUrl }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">The PDF uses the same design. The logo is set under Branding.</p>
      </div>
    </div>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field orientation="horizontal" className="w-auto">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <FieldLabel htmlFor={id} className="font-normal">{label}</FieldLabel>
    </Field>
  );
}

function ImageSlot({ kind, label, url, readOnly, onChanged, show, onShow }: { kind: "signature" | "stamp"; label: string; url: string | null; readOnly: boolean; onChanged: () => void; show: boolean; onShow: (v: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const path = `/api/business-billing/template/images/${kind}`;
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        setVersion((v) => v + 1);
        onChanged();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      }
    });
  function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError("Use an image under 2 MB.");
    const body = new FormData();
    body.set("file", file);
    run(async () => {
      const res = await fetch(path, { method: "POST", body });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new ApiError(b?.error?.code ?? String(res.status), b?.error?.message ?? "Upload failed.", res.status);
      }
    });
    if (input.current) input.current.value = "";
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex h-20 items-center justify-center rounded-lg border bg-white p-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${url}?v=${version}`} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="size-4" aria-hidden="true" />
            None
          </span>
        )}
      </div>
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Upload ${label.toLowerCase()}`} onChange={(e) => upload(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            {url ? "Replace" : "Upload"}
          </Button>
          {url ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => run(() => api(path, { method: "DELETE" }))} disabled={pending}>
              <Trash2Icon data-icon="inline-start" />
              Remove
            </Button>
          ) : null}
        </div>
      )}
      <Toggle id={`show-${kind}`} label={`Show ${label.toLowerCase()} on documents`} checked={show} onChange={onShow} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
