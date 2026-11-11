import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  FileTextIcon,
  LinkIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { LANDING_CSS } from "./landing-css";

/*
 * Landing page for automateideas.in (route "/").
 * Kind: software (the billing app) first, then the automation services the same team sells.
 * Palette: the logo's own colours (green #04875A, red #AE1E2A, amber #C2862E) on white,
 * one dark band for the services. Type: Instrument Sans from the root layout.
 * Self-contained: only this folder, src/app/page.tsx and public/landing/ belong to it.
 */

// The client's own contacts (automateideas.in). Linked, never printed.
const WHATSAPP_URL =
  "https://wa.me/919625598603?text=" + encodeURIComponent("Hi, I'd like to book a free call about automating my business.");
const EMAIL_URL = "mailto:automation@automateideas.in";

const PRIMARY = { href: "/signup", label: "Create a free account" };

/* ---------------- Shared bits ---------------- */

const wrap = "mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-10";
/** A section is one screen tall from lg up; on smaller screens it grows with what it holds. */
const screen = "flex min-h-svh flex-col justify-start py-24 lg:py-28";

function PrimaryButton({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <Link
      href={PRIMARY.href}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green active:scale-[0.98]",
        dark
          ? "bg-white text-neutral-950 hover:bg-white/90"
          : "bg-brand-green text-white hover:bg-[#03754e]",
        className,
      )}
    >
      {PRIMARY.label}
      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function SecondaryButton({
  href,
  children,
  external = false,
  dark = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  dark?: boolean;
  className?: string;
}) {
  const cls = cn(
    "inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-[15px] font-semibold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green active:scale-[0.98]",
    dark
      ? "border-white/25 text-white hover:border-white/60 hover:bg-white/5"
      : "border-neutral-300 text-neutral-900 hover:border-neutral-900 hover:bg-neutral-50",
    className,
  );
  return external ? (
    <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

function Icon({ name, label, size = 28 }: { name: string; label: string; size?: number }) {
  return (
    // Real brand marks from public/landing/icons (see icons-credits.json there).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/landing/icons/${name}.svg`} alt={label} width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
  );
}

/** The app as it looks: a window with the sidebar rail and one screen. */
function AppFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "ai-landing-frame",
        "overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.25)] ring-1 ring-neutral-900/10",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-1.5 border-b border-neutral-200 bg-neutral-50 px-4" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-brand-red/70" />
        <span className="size-2.5 rounded-full bg-brand-amber/70" />
        <span className="size-2.5 rounded-full bg-brand-green/70" />
      </div>
      <div className="flex">
        <div className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-neutral-200 bg-neutral-100 py-4 sm:flex" aria-hidden="true">
          <Image src="/Logo.png" alt="" width={28} height={28} className="size-7 object-contain" />
          <span className="mt-2 flex size-8 items-center justify-center rounded-md bg-white text-brand-green shadow-xs">
            <ReceiptTextIcon className="size-4" />
          </span>
          <span className="size-4 rounded bg-neutral-300" />
          <span className="size-4 rounded bg-neutral-300" />
          <span className="size-4 rounded bg-neutral-300" />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/* ---------------- Header ---------------- */

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-neutral-200/70 bg-white/85 backdrop-blur-md">
      <div className={cn(wrap, "flex h-16 items-center justify-between gap-6")}>
        <Link href="/" aria-label="Automate Ideas home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green">
          <Image src="/BL.png" alt="Automate Ideas" width={2420} height={380} priority className="h-7 w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {[
            ["#billing", "Billing app"],
            ["#team", "Team"],
            ["#services", "Services"],
            ["#clients", "Clients"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            Log in
          </Link>
          <PrimaryButton className="hidden h-11 px-5 text-sm sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}

/* ---------------- Hero ---------------- */

const INVOICE_ITEMS = [
  { name: "LED panel light 18W", hsn: "9405", qty: 40, rate: 650 },
  { name: "Ceiling fan 1200mm", hsn: "8414", qty: 12, rate: 2150 },
];
const taxable = INVOICE_ITEMS.reduce((s, i) => s + i.qty * i.rate, 0);
const halfGst = Math.round(taxable * 0.09);

function HeroInvoice() {
  return (
    <AppFrame>
      <div className="flex flex-col gap-5 p-5 sm:p-7" aria-label="An invoice in the Automate Ideas app">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-neutral-500">Tax invoice</p>
            <p className="text-lg font-semibold tracking-tight tabular-nums">INV-0142</p>
          </div>
          {/* Decorative loop; screen readers get one steady status instead of a change every 3 s. */}
          <span className="sr-only">Status: sent on WhatsApp</span>
          <span className="ai-landing-status" aria-hidden="true">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">Draft</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/12 px-3 py-1 text-xs font-semibold text-[#128C4B]">
              <Icon name="whatsapp" label="" size={12} />
              Sent on WhatsApp
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-green/12 px-3 py-1 text-xs font-semibold text-brand-green">
              <CheckIcon className="size-3.5" aria-hidden="true" />
              Paid
            </span>
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">Bill to</dt>
            <dd className="font-medium">Mehra Electricals</dd>
            <dd className="text-xs text-neutral-500">Pune</dd>
          </div>
          <div className="text-right">
            <dt className="text-xs text-neutral-500">Place of supply</dt>
            <dd className="font-medium">Maharashtra</dd>
          </div>
        </dl>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="pb-2 font-medium">Item</th>
              <th className="hidden pb-2 font-medium sm:table-cell">HSN</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {INVOICE_ITEMS.map((i) => (
              <tr key={i.name} className="border-b border-neutral-100">
                <td className="py-2.5 pr-2">{i.name}</td>
                <td className="hidden py-2.5 text-neutral-500 sm:table-cell">{i.hsn}</td>
                <td className="py-2.5 text-right">{i.qty}</td>
                <td className="py-2.5 text-right">{inr.format(i.qty * i.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto grid w-full max-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
          <dt className="text-neutral-500">Taxable value</dt>
          <dd className="text-right">{inr.format(taxable)}</dd>
          <dt className="text-neutral-500">CGST 9%</dt>
          <dd className="text-right">{inr.format(halfGst)}</dd>
          <dt className="text-neutral-500">SGST 9%</dt>
          <dd className="text-right">{inr.format(halfGst)}</dd>
          <dt className="relative mt-1 border-t border-neutral-200 pt-2 font-semibold">Total</dt>
          <dd className="relative mt-1 border-t border-neutral-200 pt-2 text-right font-semibold">
            <span className={cn("ai-landing-paid-bar", "absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-brand-green")} aria-hidden="true" />
            {inr.format(taxable + halfGst * 2)}
          </dd>
        </dl>
      </div>
    </AppFrame>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-svh items-center overflow-hidden pt-24 pb-16 lg:pt-28" aria-labelledby="hero-title">
      {/* Soft brand light behind the invoice. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-10%] size-180 rounded-full bg-[radial-gradient(closest-side,rgb(4_135_90/0.12),transparent)]"
      />
      <div className={cn(wrap, "relative grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14")}>
        <div className="flex flex-col gap-7 duration-700 animate-in fill-mode-both fade-in slide-in-from-bottom-4 motion-reduce:animate-none">
          <h1 id="hero-title" className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance text-neutral-950 sm:text-6xl lg:text-[4.25rem]">
            GST billing and team app <span className="text-brand-green">for Indian businesses</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-neutral-600 text-pretty">
            Make GST invoices and quotations, see what every customer owes and give each employee their own login. Free during early access, then{" "}
            <strong className="font-semibold text-neutral-950">₹100 per seat a month</strong>.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <PrimaryButton />
            <SecondaryButton href="#billing">See the billing app</SecondaryButton>
          </div>
        </div>
        <div className="delay-150 duration-700 animate-in fill-mode-both fade-in slide-in-from-bottom-6 motion-reduce:animate-none">
          <HeroInvoice />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Billing ---------------- */

function FeatureCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgb(0_0_0/0.25)]">
      <div className="flex min-h-56 flex-1 items-center bg-neutral-50 p-5">{children}</div>
      <div className="flex flex-col gap-1.5 border-t border-neutral-200 p-5">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="text-sm leading-relaxed text-neutral-600">{body}</p>
      </div>
    </li>
  );
}

function Billing() {
  return (
    <section id="billing" className={cn(screen, "scroll-mt-0 bg-white")} aria-labelledby="billing-title">
      <div className={cn(wrap, "flex flex-col gap-12")}>
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 id="billing-title" className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            Invoices, quotations and payments in one app
          </h2>
          <p className="text-lg leading-relaxed text-neutral-600">
            Add your customers and products once. After that you pick them from a list, and the app works out the GST.
          </p>
        </div>

        <ul className="grid gap-5 lg:grid-cols-3">
          <FeatureCard title="Turns quotations into invoices" body="Send a quotation, and when the customer agrees, make it an invoice without typing anything again.">
            <div className="w-full rounded-xl bg-white p-4 text-sm shadow-xs ring-1 ring-neutral-900/5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold">
                  <FileTextIcon className="size-4 text-brand-amber" aria-hidden="true" />
                  QT-0031
                </span>
                <span className="rounded-full bg-brand-amber/15 px-2.5 py-0.5 text-xs font-semibold text-[#8a5a14]">Accepted</span>
              </div>
              <p className="mt-2 text-neutral-500">Kapoor Hardware · {inr.format(18400)}</p>
              <span className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-green text-sm font-semibold text-white" aria-hidden="true">
                Convert to invoice
                <ArrowRightIcon className="size-3.5" />
              </span>
            </div>
          </FeatureCard>

          <FeatureCard title="Works out CGST, SGST and IGST" body="The customer's state decides the split, so a sale to another state is billed with IGST.">
            <div className="flex w-full flex-col gap-2.5 text-sm tabular-nums">
              {[
                { route: "Maharashtra → Maharashtra", tax: "CGST 9% + SGST 9%", tone: "bg-brand-green/10 text-brand-green" },
                { route: "Maharashtra → Gujarat", tax: "IGST 18%", tone: "bg-brand-red/10 text-brand-red" },
              ].map((r) => (
                <div key={r.route} className="flex flex-col gap-1.5 rounded-xl bg-white p-3.5 shadow-xs ring-1 ring-neutral-900/5">
                  <span className="text-neutral-500">{r.route}</span>
                  <span className={cn("w-fit rounded-md px-2 py-0.5 text-xs font-semibold", r.tone)}>{r.tax}</span>
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard title="Shows who still owes you" body="Every unpaid invoice in one list, oldest first, so you know whom to call today.">
            <ul className="flex w-full flex-col divide-y divide-neutral-100 rounded-xl bg-white text-sm shadow-xs ring-1 ring-neutral-900/5">
              {[
                { who: "Joshi & Sons", amount: 7950, note: "30 days late", late: true },
                { who: "Kapoor Hardware", amount: 18400, note: "12 days late", late: true },
                { who: "Mehra Electricals", amount: 61124, note: "Due in 6 days", late: false },
              ].map((r) => (
                <li key={r.who} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="flex flex-col">
                    <span className="font-medium">{r.who}</span>
                    <span className={cn("text-xs", r.late ? "text-brand-red" : "text-neutral-500")}>{r.note}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{inr.format(r.amount)}</span>
                </li>
              ))}
            </ul>
          </FeatureCard>
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Team ---------------- */

const TEAM = [
  { name: "Anita Desai", role: "Owner", tone: "bg-brand-green text-white" },
  { name: "Arjun Mehta", role: "Admin", tone: "bg-brand-green/12 text-brand-green" },
  { name: "Neha Gupta", role: "Manager", tone: "bg-brand-amber/15 text-[#8a5a14]" },
  { name: "Ravi Kumar", role: "Employee", tone: "bg-neutral-100 text-neutral-700" },
];

function Team() {
  return (
    <section id="team" className={cn(screen, "bg-neutral-50")} aria-labelledby="team-title">
      <div className={cn(wrap, "grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
        <div className="flex flex-col gap-6">
          <h2 id="team-title" className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            A login for every person on your team
          </h2>
          <p className="text-lg leading-relaxed text-neutral-600">
            Invite people by email or a link. Each one sees only what their role allows.
          </p>
          <ul className="flex flex-col gap-3 text-[15px]">
            {[
              ["Owners and admins", "run billing, the team and your plan."],
              ["Managers", "invite and remove employees."],
              ["Employees", "work in the app and find a colleague's number."],
            ].map(([who, what]) => (
              <li key={who} className="flex gap-3">
                <CheckIcon className="mt-0.5 size-5 shrink-0 text-brand-green" aria-hidden="true" />
                <span>
                  <strong className="font-semibold">{who}</strong> <span className="text-neutral-600">{what}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <AppFrame>
          <div className="flex flex-col gap-5 p-5 sm:p-7" aria-label="The Team page in the Automate Ideas app">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <p className="text-lg font-semibold tracking-tight">Team</p>
              <div className="flex w-40 flex-col gap-1.5 text-xs text-neutral-500">
                <span>
                  <strong className="text-neutral-900 tabular-nums">4 / 5</strong> seats used
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
                  <span className="block h-full w-4/5 rounded-full bg-brand-green" />
                </span>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-neutral-100 text-sm">
              {TEAM.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700" aria-hidden="true">
                      {m.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <span className="font-medium">{m.name}</span>
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", m.tone)}>{m.role}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3.5 text-sm ring-1 ring-neutral-900/5">
              <span className="min-w-0">
                <span className="block truncate font-medium">Invite for Rahul Kapoor</span>
                <span className="text-xs text-neutral-500">Employee · expires in 3 days</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold" aria-hidden="true">
                <LinkIcon className="size-3.5" />
                Copy link
              </span>
            </div>
          </div>
        </AppFrame>
      </div>
    </section>
  );
}

/* ---------------- Services ---------------- */

const SERVICES = [
  {
    title: "Automates your Google Workspace",
    body: "Apps Script automations, AppSheet apps and Looker Studio dashboards built around how your business runs.",
    icons: [
      ["google-sheets", "Google Sheets"],
      ["gmail", "Gmail"],
      ["google-drive", "Google Drive"],
      ["looker", "Looker Studio"],
    ],
  },
  {
    title: "Sends updates on WhatsApp",
    body: "The official WhatsApp Business API from Meta for order updates, payment reminders and chatbots.",
    icons: [
      ["whatsapp", "WhatsApp"],
      ["meta", "Meta"],
    ],
  },
  {
    title: "Brings in customers online",
    body: "SEO, social media management, Google Ads and email campaigns for local and online businesses.",
    icons: [
      ["google-ads", "Google Ads"],
      ["instagram", "Instagram"],
      ["facebook", "Facebook"],
      ["linkedin", "LinkedIn"],
    ],
  },
  {
    title: "Keeps your accounts secure",
    body: "Workspace security audits, admin controls, staff training and support after we hand over.",
    icons: [],
  },
] as const;

const STEPS = ["Consultation and needs assessment", "Custom solution design", "Implementation and integration"];

function Services() {
  return (
    <section id="services" className={cn(screen, "bg-neutral-950 text-white")} aria-labelledby="services-title">
      <div className={cn(wrap, "flex flex-col gap-12")}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 id="services-title" className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
              Automation services <span className="text-white/55">from the same team</span>
            </h2>
            <p className="text-lg leading-relaxed text-white/70">
              Need more than billing? We build the automations around it, on the tools you already use.
            </p>
          </div>
          <SecondaryButton href={WHATSAPP_URL} external dark className="w-full sm:w-fit">
            <Icon name="whatsapp" label="" size={18} />
            Book a free call
          </SecondaryButton>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <li key={s.title} className="flex flex-col gap-5 rounded-2xl bg-white/6 p-6 ring-1 ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:bg-white/9">
              <div className="flex h-11 items-center gap-2.5">
                {s.icons.length > 0 ? (
                  s.icons.map(([name, label]) => (
                    <span key={name} className="flex size-11 items-center justify-center rounded-xl bg-white">
                      <Icon name={name} label={label} size={22} />
                    </span>
                  ))
                ) : (
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-green/20 text-[#5fd3a5]">
                    <ShieldCheckIcon className="size-5" aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold tracking-tight">{s.title}</h3>
                <p className="text-sm leading-relaxed text-white/65">{s.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <ol className="grid gap-4 border-t border-white/10 pt-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3 text-[15px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-green text-sm font-semibold tabular-nums">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------- Clients ---------------- */

// First sentences of the reviews on automateideas.in, word for word. Logos are the
// clients' own files from public/testimonial (width and height are the files' own).
const REVIEWS = [
  {
    quote: "Month-end used to be chaos with invoicing and GST.",
    name: "Saurabh Khandelwal",
    company: "Dhanvi Diamonds",
    logo: { src: "/testimonial/dhanvi.png", width: 2825, height: 2056 },
  },
  {
    quote: "Invoicing was a nightmare before — slow, error-prone, and manual.",
    name: "Raghbir Singh",
    company: "Raghbir Erectors & Fabricators",
    logo: { src: "/testimonial/raghbir.png", width: 90, height: 90 },
  },
  {
    quote: "Stockouts and order mistakes were draining us.",
    name: "Nitin Verma",
    company: "Vercha Jewels",
    logo: { src: "/testimonial/Vercha.jpeg", width: 233, height: 60 },
  },
  {
    quote: "Automate Ideas helped us cut through the chaos of handling leads, tasks, and payments manually.",
    name: "Narendra Vaid",
    company: "Copier World",
    logo: { src: "/testimonial/copier-world.jpg", width: 291, height: 238 },
  },
  {
    quote: "Payroll, leave tracking, compliance — all of it used to eat up time we didn't have.",
    name: "Chaitanya Agrawal",
    company: "Cranex Limited",
    logo: { src: "/testimonial/cranex.webp", width: 100, height: 100 },
  },
  {
    quote: "Our sales process finally feels modern.",
    name: "Rahul Bhagat",
    company: "Bhagat Halwai",
    logo: { src: "/testimonial/Bhagat_Halwai.webp", width: 500, height: 500 },
  },
  {
    quote: "Automate Ideas helped us streamline our placement services.",
    name: "Dipak Kumar Singh",
    company: "Samriddhi Mantra Placement Services",
    logo: { src: "/testimonial/SMPS.png", width: 915, height: 273 },
  },
];

function Clients() {
  return (
    <section id="clients" className={cn(screen, "bg-white")} aria-labelledby="clients-title">
      <div className={cn(wrap, "flex flex-col gap-12")}>
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 id="clients-title" className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            What business owners say about our work
          </h2>
          <p className="text-lg leading-relaxed text-neutral-600">Jewellers, manufacturers, sweet shops and agencies we have automated.</p>
        </div>
        <ul className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4">
          {REVIEWS.map((r) => (
            <li key={r.name} className="break-inside-avoid">
              <figure className="flex flex-col gap-5 rounded-2xl border border-neutral-200 p-6">
                {/* The company is named in the caption below, so the logo is decorative. */}
                <span className="flex h-12 items-center">
                  <Image
                    src={r.logo.src}
                    alt=""
                    width={r.logo.width}
                    height={r.logo.height}
                    sizes="160px"
                    className="h-full w-auto max-w-40 object-contain object-left"
                  />
                </span>
                <blockquote className="text-[17px] leading-snug font-medium tracking-tight text-neutral-900">“{r.quote}”</blockquote>
                <figcaption className="flex flex-col text-sm">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-neutral-500">{r.company}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Close and footer ---------------- */

function Close() {
  return (
    <footer className="bg-neutral-50" aria-labelledby="close-title">
      <div className={cn(wrap, "flex min-h-[80svh] flex-col justify-center gap-8 py-24")}>
        <h2 id="close-title" className="max-w-4xl text-5xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-7xl">
          Send your first GST invoice <span className="text-brand-green">today</span>
        </h2>
        <p className="max-w-xl text-lg leading-relaxed text-neutral-600">
          Create an account, add your company and GSTIN, and bill your first customer. No card needed during early access.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryButton />
          <SecondaryButton href={EMAIL_URL}>Email our team</SecondaryButton>
        </div>
      </div>
      <div className="border-t border-neutral-200">
        <div className={cn(wrap, "flex flex-col gap-4 py-8 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between")}>
          <div className="flex items-center gap-3">
            <Image src="/Logo.png" alt="" width={24} height={24} className="size-6 object-contain" />
            <span>© 2026 Automate Ideas. Product names and logos are trademarks of their owners.</span>
          </div>
          <nav aria-label="Footer" className="flex gap-1">
            {[
              ["/login", "Log in"],
              [WHATSAPP_URL, "WhatsApp"],
              [EMAIL_URL, "Email"],
            ].map(([href, label]) => (
              <a
                key={label}
                href={href}
                {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex h-11 items-center rounded-md px-3 transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="bg-white text-neutral-950">
      {/* React hoists this into <head> once (href + precedence). */}
      <style href="ai-landing" precedence="medium">
        {LANDING_CSS}
      </style>
      <a
        href="#main"
        className="sr-only z-60 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Billing />
        <Team />
        <Services />
        <Clients />
      </main>
      <Close />
    </div>
  );
}
