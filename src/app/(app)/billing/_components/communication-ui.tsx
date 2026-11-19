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
type Defaults = { to: string[]; subject?: string; message?: string; whatsappNumber: string | null; emailMode: "send" | "log" | "off"; whatsappApi?: boolean; canSend: boolean };
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
  // Whether WhatsApp can go through the Cloud API (company number or the shared one), and the contact's number.
  const defaults = useApiQuery<Defaults>(`${base}/email`);
  const api_ = defaults.data?.whatsappApi === true;
  const [emailOpen, setEmailOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
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

  const remind = (channel: "email" | "whatsapp") =>
    run(async () => {
      await api(`${base}/remind`, { method: "POST", json: { channel } });
      return channel === "whatsapp" ? "Payment reminder sent on WhatsApp." : "Payment reminder sent.";
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
            <Button size="sm" variant="outline" onClick={api_ ? () => setWaOpen(true) : whatsapp} disabled={pending}>
              <MessageCircleIcon data-icon="inline-start" />
              WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink} disabled={pending}>
              <LinkIcon data-icon="inline-start" />
              Copy link
            </Button>
            {reminder ? (
              <Button size="sm" variant="outline" onClick={() => remind("email")} disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : <BellRingIcon data-icon="inline-start" />}
                {api_ ? "Remind by email" : "Send reminder"}
              </Button>
            ) : null}
            {reminder && api_ ? (
              <Button size="sm" variant="outline" onClick={() => remind("whatsapp")} disabled={pending}>
                <BellRingIcon data-icon="inline-start" />
                Remind on WhatsApp
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
      {waOpen ? (
        <WhatsAppDialog
          base={base}
          number={defaults.data?.whatsappNumber ?? null}
          onClose={() => setWaOpen(false)}
          onOpenApp={() => {
            setWaOpen(false);
            whatsapp();
          }}
          onSent={(text) => {
            setWaOpen(false);
            setNote({ ok: true, text });
            history.reload();
          }}
        />
      ) : null}
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

/** Sends through the WhatsApp Cloud API to the contact's number (editable). */
function WhatsAppDialog({ base, number, onClose, onOpenApp, onSent }: { base: string; number: string | null; onClose: () => void; onOpenApp: () => void; onSent: (text: string) => void }) {
  const [to, setTo] = useState(number ? `+${number}` : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              try {
                const r = await api<{ status: string }>(`${base}/whatsapp`, { method: "POST", json: { to } });
                onSent(r.status === "logged" ? "Recorded in test mode (WHATSAPP_DELIVERY=log): nothing was actually sent." : `Sent on WhatsApp to ${to}.`);
              } catch (err) {
                setError(err instanceof ApiError ? (err.fields?.to ?? err.message) : "Couldn't send. Try again.");
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Send on WhatsApp</DialogTitle>
            <DialogDescription>From your WhatsApp Business number, with a button to view the document.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-4">
            <TextField id="wa-to" label="Mobile number" inputMode="tel" value={to} onValue={setTo} error={error ?? undefined} placeholder="+91 98765 43210" hint="Indian numbers can be typed without +91." />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" className="sm:mr-auto" onClick={onOpenApp}>
              Open in WhatsApp app instead
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !to.trim()}>
              {pending ? <Spinner data-icon="inline-start" /> : <MessageCircleIcon data-icon="inline-start" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Settings ---------------- */

type SettingsData = CommunicationSettings & { configured: boolean; emailMode: "send" | "log" | "off"; canEdit: boolean; readOnlyReason: string | null };
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? "am" : "pm"}` }));

export function CommunicationSettingsView() {
  const q = useApiQuery<SettingsData>("/api/business-billing/communication-settings");
  if (q.status === "loading") return <Skeleton className="h-96 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  return <SettingsForm key={JSON.stringify([q.data.reminders, q.data.autoReceiptEmail, q.data.autoReceiptWhatsApp, q.data.whatsappShared])} data={q.data} onSaved={q.reload} />;
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
    viaEmail: r.viaEmail,
    viaWhatsApp: r.viaWhatsApp,
    autoReceiptEmail: data.autoReceiptEmail,
    autoReceiptWhatsApp: data.autoReceiptWhatsApp,
    whatsappShared: data.whatsappShared,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const disabled = !data.canEdit || !data.configured;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const payload = () => ({
    reminders: { enabled: form.enabled, beforeDays: form.beforeDays, onDueDate: form.onDueDate, afterEveryDays: form.afterEveryDays, maxAfter: form.maxAfter, sendHour: form.sendHour, viaEmail: form.viaEmail, viaWhatsApp: form.viaWhatsApp },
    autoReceiptEmail: form.autoReceiptEmail,
    autoReceiptWhatsApp: form.autoReceiptWhatsApp,
    whatsappShared: form.whatsappShared,
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
            <fieldset disabled={disabled || !form.enabled} className="flex flex-wrap gap-6 disabled:opacity-60">
              <legend className="mb-2 text-sm font-medium">Send by</legend>
              <Field orientation="horizontal" data-invalid={!!errors["reminders.viaEmail"]}>
                <Checkbox id="rem-email" checked={form.viaEmail} onCheckedChange={(c) => set("viaEmail", c === true)} />
                <FieldLabel htmlFor="rem-email" className="font-normal">
                  Email
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="rem-wa" checked={form.viaWhatsApp} onCheckedChange={(c) => set("viaWhatsApp", c === true)} />
                <FieldLabel htmlFor="rem-wa" className="font-normal">
                  WhatsApp (needs WhatsApp set up below)
                </FieldLabel>
              </Field>
            </fieldset>
            {errors["reminders.viaEmail"] ? <p className="text-sm text-destructive">{errors["reminders.viaEmail"]}</p> : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field orientation="horizontal">
            <Checkbox id="auto-receipt" checked={form.autoReceiptEmail} disabled={disabled} onCheckedChange={(c) => set("autoReceiptEmail", c === true)} />
            <FieldLabel htmlFor="auto-receipt" className="flex flex-col items-start gap-0.5 font-normal">
              <span>Email a receipt when a payment is recorded</span>
              <span className="text-muted-foreground">Only to customers with an email address. You can always send one by hand from the payment.</span>
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="auto-receipt-wa" checked={form.autoReceiptWhatsApp} disabled={disabled} onCheckedChange={(c) => set("autoReceiptWhatsApp", c === true)} />
            <FieldLabel htmlFor="auto-receipt-wa" className="flex flex-col items-start gap-0.5 font-normal">
              <span>Send the receipt on WhatsApp too</span>
              <span className="text-muted-foreground">To customers with a mobile number, once WhatsApp is set up below.</span>
            </FieldLabel>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp</CardTitle>
          <CardDescription>Send invoices, reminders and receipts on WhatsApp automatically, with a button to view each document.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <WhatsAppConnection canEdit={data.canEdit && data.configured} />
          <Field orientation="horizontal">
            <Checkbox id="wa-shared" checked={form.whatsappShared} disabled={disabled} onCheckedChange={(c) => set("whatsappShared", c === true)} />
            <FieldLabel htmlFor="wa-shared" className="flex flex-col items-start gap-0.5 font-normal">
              <span>Use the Automate Ideas WhatsApp number when you haven&apos;t connected your own</span>
              <span className="text-muted-foreground">Messages come from Automate Ideas&apos; business number and name your company. Limited number of messages a month.</span>
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

/* ---------------- WhatsApp connection (option B) ---------------- */

type WaStatus = {
  platformAvailable: boolean;
  embeddedSignup: { appId: string; configId: string; version: string } | null;
  logMode: boolean;
  shared: boolean;
  connection: { displayPhoneNumber: string | null; verifiedName: string | null; status: "connected" | "error" | "disconnected"; templates: Record<string, string>; lastError: string | null; connectedAt: string | null } | null;
  active: "own" | "platform" | null;
  usage: { used: number; limit: number };
  canEdit: boolean;
};
type FacebookSdk = {
  init: (o: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }) => void;
  login: (cb: (r: { authResponse?: { code?: string } | null }) => void, o: Record<string, unknown>) => void;
};
type SignupResult = { code: string; wabaId: string; phoneNumberId: string; businessId: string | null };

let sdk: Promise<FacebookSdk> | null = null;
/** Loads Meta's JavaScript SDK once (only when someone clicks Connect). */
function facebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  const w = window as unknown as { FB?: FacebookSdk; fbAsyncInit?: () => void };
  sdk ??= new Promise((resolve, reject) => {
    w.fbAsyncInit = () => {
      w.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(w.FB!);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      sdk = null;
      reject(new Error("Couldn't load Facebook's sign-in. Check your connection or ad blocker, then try again."));
    };
    document.body.appendChild(s);
  });
  return sdk;
}

/**
 * Meta's Embedded Signup (v4): the popup posts the WhatsApp account and phone
 * number ids to this window, and FB.login returns a code (valid 30 seconds).
 */
function embeddedSignup(cfg: NonNullable<WaStatus["embeddedSignup"]>): Promise<SignupResult> {
  return facebookSdk(cfg.appId, cfg.version).then(
    (FB) =>
      new Promise<SignupResult>((resolve, reject) => {
        let code: string | null = null;
        let ids: { wabaId: string; phoneNumberId: string; businessId: string | null } | null = null;
        const done = () => {
          if (!code || !ids) return;
          window.removeEventListener("message", onMessage);
          resolve({ code, ...ids });
        };
        const fail = (message: string) => {
          window.removeEventListener("message", onMessage);
          reject(new Error(message));
        };
        function onMessage(event: MessageEvent) {
          if (!event.origin.endsWith("facebook.com")) return;
          let data: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; business_id?: string; error_message?: string } };
          try {
            data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          } catch {
            return;
          }
          if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
          if (data.event === "FINISH" && data.data?.waba_id && data.data.phone_number_id) {
            ids = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id, businessId: data.data.business_id ?? null };
            done();
          } else if (data.event === "CANCEL") fail("Connecting was cancelled.");
          else if (data.event === "ERROR") fail(data.data?.error_message ?? "WhatsApp's sign-up reported an error.");
          else if (data.event?.startsWith("FINISH")) fail("That sign-up didn't include a WhatsApp Business number for the Cloud API. Choose or add a number in the popup.");
        }
        window.addEventListener("message", onMessage);
        FB.login(
          (r) => {
            if (!r.authResponse?.code) return fail("Connecting was cancelled.");
            code = r.authResponse.code;
            done();
          },
          { config_id: cfg.configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } },
        );
      }),
  );
}

const TEMPLATE_LABELS: Record<string, string> = { ai_document_v1: "Documents", ai_payment_reminder_v1: "Reminders", ai_payment_receipt_v1: "Receipts" };

function WhatsAppConnection({ canEdit }: { canEdit: boolean }) {
  const q = useApiQuery<WaStatus>("/api/business-billing/whatsapp");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (q.status === "loading") return <Skeleton className="h-20" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const s = q.data;
  const act = (fn: () => Promise<string>) =>
    start(async () => {
      setNote(null);
      try {
        setNote({ ok: true, text: await fn() });
        q.reload();
      } catch (e) {
        setNote({ ok: false, text: e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong." });
      }
    });
  const c = s.connection;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm">
        <span className="font-medium">Sending from: </span>
        {s.active === "own" ? `your number ${c?.displayPhoneNumber ?? ""}` : s.active === "platform" ? "the Automate Ideas number" : "not set up (the WhatsApp button opens WhatsApp on your phone instead)"}
        {s.logMode ? (
          <Badge variant="secondary" className="ml-2">
            Test mode
          </Badge>
        ) : null}
      </p>
      {c ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            {c.verifiedName ?? "Your business"} · {c.displayPhoneNumber ?? "number"} <Badge variant={c.status === "connected" ? "outline" : "destructive"}>{c.status === "connected" ? "Connected" : "Needs attention"}</Badge>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            Message templates:
            {Object.entries(c.templates).map(([name, st]) => (
              <Badge key={name} variant={st === "APPROVED" ? "outline" : st.startsWith("ERROR") || st === "REJECTED" ? "destructive" : "secondary"}>
                {TEMPLATE_LABELS[name] ?? name}: {st === "APPROVED" ? "approved" : st.startsWith("ERROR") ? "error" : st.toLowerCase()}
              </Badge>
            ))}
          </p>
          {Object.values(c.templates).some((st) => st !== "APPROVED") ? <p className="text-xs text-muted-foreground">Meta usually approves new templates within minutes to a day. Messages of a kind can go out once its template is approved.</p> : null}
          {c.lastError ? <p className="text-xs text-destructive">{c.lastError}</p> : null}
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(async () => (await api("/api/business-billing/whatsapp/templates", { method: "POST" }), "Templates checked."))}>
                Check templates again
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => act(async () => (await api("/api/business-billing/whatsapp", { method: "DELETE" }), "Disconnected."))}>
                Disconnect
              </Button>
            </div>
          ) : null}
        </div>
      ) : s.embeddedSignup ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Connect your own WhatsApp Business number so messages come from your business. You sign in with Facebook and choose or add a number; Meta bills your business for messages.</p>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="self-start"
              disabled={pending}
              onClick={() =>
                act(async () => {
                  const r = await embeddedSignup(s.embeddedSignup!);
                  await api("/api/business-billing/whatsapp/connect", { method: "POST", json: r });
                  return "Your WhatsApp number is connected.";
                })
              }
            >
              {pending ? <Spinner data-icon="inline-start" /> : <MessageCircleIcon data-icon="inline-start" />}
              Connect your WhatsApp number
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Connecting your own number isn&apos;t set up on this server yet (see docs/whatsapp-setup.md).</p>
      )}
      {s.platformAvailable ? (
        <p className="text-xs text-muted-foreground">
          Automate Ideas number this month: {s.usage.used} of {s.usage.limit} messages.
        </p>
      ) : null}
      {note ? (
        <p role={note.ok ? "status" : "alert"} className={`text-sm ${note.ok ? "text-brand-green" : "text-destructive"}`}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
