"use client";

import { useState, useTransition } from "react";
import { BellRingIcon, CheckIcon, LinkIcon, MailIcon, MessageCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { type CommunicationSettings, validateCommunication } from "@/lib/business-billing/communication/settings";

import { LoadError } from "../../_components/page-parts";
import { type Errors, ReadOnlyNote, SelectField, TextField, saveError } from "./records-ui";

type Message = { id: string; channel: "email" | "whatsapp"; kind: string; recipient: string; subject: string | null; status: "sending" | "sent" | "failed" | "logged"; error: string | null; createdAt: string };
type Defaults = { to: string[]; subject?: string; message?: string; whatsappNumber: string | null; emailMode: "send" | "log" | "off"; canSend: boolean };
type Shared = { url: string; whatsapp: { phone: string | null; url: string } };

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const KIND: Record<string, string> = { document: "Sent", receipt: "Receipt sent", reminder: "Payment reminder" };
const STATUS: Record<Message["status"], { label: string; variant: "outline" | "secondary" | "destructive" }> = {
  sent: { label: "Sent", variant: "outline" },
  logged: { label: "Test mode", variant: "secondary" },
  sending: { label: "Sending", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

/**
 * "Send to customer" on an issued document or receipt: email with the PDF,
 * WhatsApp (opens WhatsApp with a ready message and link), copy a link,
 * and, for unpaid invoices, a payment reminder now. Lists what was sent.
 *
 * `base` is the record's API path, e.g. /api/business-billing/documents/invoices/<id>
 * or /api/business-billing/payments/<id>.
 */
export function SendCard({ base, title = "Send to customer", canSend, reminder }: { base: string; title?: string; canSend: boolean; reminder: boolean }) {
  const history = useApiQuery<{ items: Message[] }>(`${base}/messages`);
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<string | void>) =>
    start(async () => {
      setNote(null);
      try {
        const text = await fn();
        if (text) setNote({ ok: true, text });
        history.reload();
      } catch (e) {
        setNote({ ok: false, text: e instanceof ApiError ? e.message : "Something went wrong. Try again." });
      }
    });

  const whatsapp = () => {
    // Open the tab now (in the click), then point it at WhatsApp: browsers block windows opened after a wait.
    const tab = window.open("", "_blank");
    run(async () => {
      try {
        const s = await api<Shared>(`${base}/share`, { method: "POST", json: { channel: "whatsapp" } });
        if (tab) tab.location.href = s.whatsapp.url;
        else window.location.href = s.whatsapp.url;
        return s.whatsapp.phone ? undefined : "WhatsApp opened without a number: the customer has no valid phone number, so choose the chat yourself.";
      } catch (e) {
        tab?.close();
        throw e;
      }
    });
  };

  const copyLink = () =>
    run(async () => {
      const s = await api<Shared>(`${base}/share`, { method: "POST", json: { channel: "link" } });
      await navigator.clipboard.writeText(s.url);
      return "Link copied. Anyone with it can view this document for 180 days.";
    });

  const remind = () =>
    run(async () => {
      await api(`${base}/remind`, { method: "POST" });
      return "Payment reminder sent.";
    });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>By email with the PDF attached, or on WhatsApp with a link.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canSend ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEmailOpen(true)} disabled={pending}>
              <MailIcon data-icon="inline-start" />
              Email
            </Button>
            <Button size="sm" variant="outline" onClick={whatsapp} disabled={pending}>
              <MessageCircleIcon data-icon="inline-start" />
              WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink} disabled={pending}>
              <LinkIcon data-icon="inline-start" />
              Copy link
            </Button>
            {reminder ? (
              <Button size="sm" variant="outline" onClick={remind} disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : <BellRingIcon data-icon="inline-start" />}
                Send reminder
              </Button>
            ) : null}
          </div>
        ) : null}
        {note ? (
          <p role={note.ok ? "status" : "alert"} className={`flex items-center gap-1.5 text-sm ${note.ok ? "text-brand-green" : "text-destructive"}`}>
            {note.ok ? <CheckIcon className="size-4" aria-hidden="true" /> : null}
            {note.text}
          </p>
        ) : null}
        {history.data?.items.length ? (
          <ul className="flex flex-col divide-y text-sm" aria-label="Sent">
            {history.data.items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{m.channel === "whatsapp" ? "Shared on WhatsApp" : (KIND[m.kind] ?? "Sent")}</span>
                  <span className="text-muted-foreground"> · {m.recipient}</span>
                  {m.error ? <span className="block text-xs text-destructive">{m.error}</span> : null}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {m.channel === "email" ? <Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge> : null}
                  {when.format(new Date(m.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        ) : history.status !== "loading" ? (
          <p className="text-sm text-muted-foreground">Not sent yet.</p>
        ) : null}
      </CardContent>
      {emailOpen ? (
        <EmailDialog
          base={base}
          onClose={() => setEmailOpen(false)}
          onSent={(text) => {
            setEmailOpen(false);
            setNote({ ok: true, text });
            history.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function EmailDialog({ base, onClose, onSent }: { base: string; onClose: () => void; onSent: (text: string) => void }) {
  const d = useApiQuery<Defaults>(`${base}/email`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {d.status === "loading" ? (
          <Skeleton className="h-72" aria-label="Loading" />
        ) : !d.data ? (
          <LoadError message={d.error.message} onRetry={d.reload} />
        ) : (
          <EmailForm base={base} defaults={d.data} onClose={onClose} onSent={onSent} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmailForm({ base, defaults, onClose, onSent }: { base: string; defaults: Defaults; onClose: () => void; onSent: (text: string) => void }) {
  const [form, setForm] = useState({ to: defaults.to.join(", "), cc: "", subject: defaults.subject ?? "", message: defaults.message ?? "", attachPdf: true });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = defaults.emailMode === "off";
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErrors({});
          setMessage(null);
          try {
            const r = await api<{ status: string }>(`${base}/email`, { method: "POST", json: { ...form, subject: form.subject || null, message: form.message || null } });
            onSent(r.status === "logged" ? "Recorded in test mode (EMAIL_DELIVERY=log): nothing was actually emailed." : `Email sent to ${form.to}.`);
          } catch (err) {
            setMessage(saveError(err, setErrors));
          }
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Email</DialogTitle>
        <DialogDescription>Replies go to your company email. The PDF is attached, with a link to view it online.</DialogDescription>
      </DialogHeader>
      {off ? (
        <Alert className="mt-4">
          <AlertTitle>Email isn&apos;t set up on this server</AlertTitle>
          <AlertDescription>Add RESEND_API_KEY and EMAIL_FROM to the server&apos;s .env. Until then, use WhatsApp or Copy link.</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup className="my-4">
        <TextField id="em-to" label="To" value={form.to} onValue={(v) => setForm((f) => ({ ...f, to: v }))} error={errors.to} placeholder="name@company.com" hint={defaults.to.length ? undefined : "This customer has no email saved. Type one; separate several with commas."} />
        <TextField id="em-cc" label="Cc" optional value={form.cc} onValue={(v) => setForm((f) => ({ ...f, cc: v }))} error={errors.cc} />
        <TextField id="em-subject" label="Subject" value={form.subject} onValue={(v) => setForm((f) => ({ ...f, subject: v }))} error={errors.subject} />
        <Field data-invalid={!!errors.message}>
          <FieldLabel htmlFor="em-message">Message</FieldLabel>
          <Textarea id="em-message" rows={7} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} aria-invalid={!!errors.message} />
          <FieldError>{errors.message}</FieldError>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="em-pdf" checked={form.attachPdf} onCheckedChange={(c) => setForm((f) => ({ ...f, attachPdf: c === true }))} />
          <FieldLabel htmlFor="em-pdf" className="font-normal">
            Attach the PDF
          </FieldLabel>
        </Field>
      </FieldGroup>
      <DialogFooter>
        {message ? (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || off}>
          {pending ? <Spinner data-icon="inline-start" /> : <MailIcon data-icon="inline-start" />}
          Send email
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ---------------- Settings ---------------- */

type SettingsData = CommunicationSettings & { configured: boolean; emailMode: "send" | "log" | "off"; canEdit: boolean; readOnlyReason: string | null };
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? "am" : "pm"}` }));

export function CommunicationSettingsView() {
  const q = useApiQuery<SettingsData>("/api/business-billing/communication-settings");
  if (q.status === "loading") return <Skeleton className="h-96 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  return <SettingsForm key={JSON.stringify(q.data.reminders) + q.data.autoReceiptEmail} data={q.data} onSaved={q.reload} />;
}

function SettingsForm({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const r = data.reminders;
  const [form, setForm] = useState({
    enabled: r.enabled,
    beforeDays: r.beforeDays === null ? "" : String(r.beforeDays),
    onDueDate: r.onDueDate,
    afterEveryDays: r.afterEveryDays === null ? "" : String(r.afterEveryDays),
    maxAfter: String(r.maxAfter),
    sendHour: String(r.sendHour),
    autoReceiptEmail: data.autoReceiptEmail,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const disabled = !data.canEdit || !data.configured;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const payload = () => ({
    reminders: { enabled: form.enabled, beforeDays: form.beforeDays, onDueDate: form.onDueDate, afterEveryDays: form.afterEveryDays, maxAfter: form.maxAfter, sendHour: form.sendHour },
    autoReceiptEmail: form.autoReceiptEmail,
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const v = validateCommunication(payload());
        if (!v.ok) {
          setErrors(v.errors);
          return;
        }
        start(async () => {
          setErrors({});
          setMessage(null);
          try {
            await api("/api/business-billing/communication-settings", { method: "PUT", json: payload() });
            setMessage({ ok: true, text: "Saved." });
            onSaved();
          } catch (err) {
            setMessage({ ok: false, text: saveError(err, setErrors) });
          }
        });
      }}
    >
      <ReadOnlyNote reason={data.readOnlyReason} fallback={data.canEdit ? undefined : "Only owners and admins can change these settings."} />
      {!data.configured ? <p className="text-sm text-muted-foreground">Save your company details first.</p> : null}
      {data.emailMode !== "send" ? (
        <Alert>
          <AlertTitle>{data.emailMode === "log" ? "Test mode: emails are recorded, not sent" : "Email isn't set up on this server"}</AlertTitle>
          <AlertDescription>
            {data.emailMode === "log"
              ? "EMAIL_DELIVERY=log is set, so nothing reaches customers. Remove it to send for real."
              : "Add RESEND_API_KEY and EMAIL_FROM to the server's .env to email customers. WhatsApp sharing works without it."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Payment reminders</CardTitle>
          <CardDescription>Emailed automatically to customers with unpaid invoices. Each reminder goes once; customers can be left out on their own page.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal" data-invalid={!!errors["reminders.enabled"]}>
              <Checkbox id="rem-on" checked={form.enabled} disabled={disabled} onCheckedChange={(c) => set("enabled", c === true)} />
              <FieldLabel htmlFor="rem-on" className="font-normal">
                Send payment reminders automatically
              </FieldLabel>
            </Field>
            {errors["reminders.enabled"] ? <p className="text-sm text-destructive">{errors["reminders.enabled"]}</p> : null}
            <fieldset disabled={disabled || !form.enabled} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
              <TextField id="rem-before" label="Days before the due date" optional inputMode="numeric" value={form.beforeDays} onValue={(v) => set("beforeDays", v.replace(/\D/g, ""))} error={errors["reminders.beforeDays"]} hint="Blank: no reminder before it's due." />
              <Field orientation="horizontal" className="self-center">
                <Checkbox id="rem-due" checked={form.onDueDate} onCheckedChange={(c) => set("onDueDate", c === true)} />
                <FieldLabel htmlFor="rem-due" className="font-normal">
                  On the due date
                </FieldLabel>
              </Field>
              <TextField id="rem-after" label="When overdue, every … days" optional inputMode="numeric" value={form.afterEveryDays} onValue={(v) => set("afterEveryDays", v.replace(/\D/g, ""))} error={errors["reminders.afterEveryDays"]} hint="Blank: no overdue reminders." />
              <TextField id="rem-max" label="At most this many overdue reminders" inputMode="numeric" value={form.maxAfter} onValue={(v) => set("maxAfter", v.replace(/\D/g, ""))} error={errors["reminders.maxAfter"]} />
              <SelectField id="rem-hour" label="Not before (India time)" value={form.sendHour} onValue={(v) => set("sendHour", v || "9")} options={HOURS} error={errors["reminders.sendHour"]} />
            </fieldset>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal">
            <Checkbox id="auto-receipt" checked={form.autoReceiptEmail} disabled={disabled} onCheckedChange={(c) => set("autoReceiptEmail", c === true)} />
            <FieldLabel htmlFor="auto-receipt" className="flex flex-col items-start gap-0.5 font-normal">
              <span>Email a receipt when a payment is recorded</span>
              <span className="text-muted-foreground">Only to customers with an email address. You can always send one by hand from the payment.</span>
            </FieldLabel>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || disabled}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Save
        </Button>
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-brand-green" : "text-destructive"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Automatic reminders need the server&apos;s scheduled job (/api/cron/reminders with CRON_SECRET) to run every 15–60 minutes. &ldquo;Send reminder&rdquo; on an invoice always works.
      </p>
    </form>
  );
}
