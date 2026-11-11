"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangleIcon, CheckIcon, CircleCheckIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { cn } from "@/lib/utils";

import { LoadError } from "../../_components/page-parts";

type PlanStatus = "trialing" | "active" | "past_due" | "canceled";
type BillingCycle = "monthly" | "yearly";
type Access = { state: "full" | "grace" | "read_only"; reason: string | null; readOnlyFrom: string | null };

type SubscriptionData = {
  planStatus: PlanStatus;
  trialEndsAt: string | null;
  subscriptionId: string | null;
  seatLimit: number;
  seatsUsed: number;
  members: number;
  pendingInvites: number;
  pricePerSeatInr: number;
  monthlyTotalInr: number;
  blockedReason: string | null;
  /** False until PayU is set up: changes are free and apply immediately. */
  paymentsEnabled: boolean;
  plan: { id: string; name: string };
  effectivePlan: { id: string; name: string };
  billingCycle: BillingCycle;
  periodPricePerSeatInr: number;
  periodTotalInr: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  access: Access;
  limits: { maxSeats: number; maxInvoicesPerMonth: number | null };
  /** Invoices issued this calendar month against the plan's cap (null = no cap). */
  invoiceUsage: { used: number; cap: number | null; month: string };
};

type CatalogPlan = {
  id: string;
  name: string;
  description: string;
  prices: Record<BillingCycle, number>;
  features: Record<"billing" | "inventory" | "whatsapp" | "advancedReports", boolean>;
  limits: { maxSeats: number; maxInvoicesPerMonth: number | null };
};
type Catalog = { yearlyMonthsCharged: number; graceDays: number; plans: CatalogPlan[] };

type Checkout = { action: string; fields: Record<string, string> };
type ChangeResponse = {
  planId: string;
  billingCycle: BillingCycle;
  seats: number;
  periodTotalInr: number;
} & ({ checkout: Checkout; applied?: undefined } | { applied: true; checkout?: undefined });

export const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

const perCycle = (c: BillingCycle) => (c === "yearly" ? "year" : "month");
const cycleLabel = (c: BillingCycle) => (c === "yearly" ? "Yearly" : "Monthly");

const FEATURE_LABELS: Record<keyof CatalogPlan["features"], string> = {
  billing: "Business Billing",
  inventory: "Inventory",
  whatsapp: "WhatsApp sharing",
  advancedReports: "Advanced reports",
};

const statusBadge: Record<PlanStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trialing: { label: "Free trial", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past_due: { label: "Payment failed", variant: "destructive" },
  canceled: { label: "Canceled", variant: "outline" },
};

/**
 * Loads the subscription summary (GET /api/subscription)
 * and renders `children` with it, plus the loading and error states.
 */
function WithSubscription({
  cards,
  children,
}: {
  /** How many card placeholders to show while loading. */
  cards: 1 | 2;
  children: (data: SubscriptionData, reload: () => void) => React.ReactNode;
}) {
  const subscription = useApiQuery<SubscriptionData>("/api/subscription");

  if (subscription.status === "loading") return <CardsSkeleton cards={cards} />;
  if (!subscription.data) {
    return <LoadError message={subscription.error.message} onRetry={subscription.reload} />;
  }
  return (
    <div className="flex flex-col gap-6">
      {subscription.status === "error" ? (
        <LoadError
          title="Couldn't refresh your subscription"
          message={subscription.error.message}
          onRetry={subscription.reload}
        />
      ) : null}
      <AccessAlert access={subscription.data.access} />
      {children(subscription.data, subscription.reload)}
    </div>
  );
}

/** Grace and read-only warnings. Nothing when access is full. */
function AccessAlert({ access }: { access: Access }) {
  if (access.state === "full" || !access.reason) return null;
  return (
    <Alert variant={access.state === "read_only" ? "destructive" : "default"}>
      <AlertTriangleIcon />
      <AlertTitle>{access.state === "read_only" ? "Your workspace is read-only" : "Renew to keep full access"}</AlertTitle>
      <AlertDescription>
        {access.reason}
        {access.state === "read_only" ? " Your data is safe and can still be viewed." : ""}
      </AlertDescription>
    </Alert>
  );
}

/** Opens PayU's hosted checkout: renders its form, then submits it. */
function usePayuCheckout() {
  const formRef = useRef<HTMLFormElement>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const open = (c: Checkout) => {
    setCheckout(c);
    requestAnimationFrame(() => formRef.current?.submit());
  };
  const form = checkout ? (
    <form ref={formRef} method="POST" action={checkout.action} className="hidden" aria-hidden="true">
      {Object.entries(checkout.fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </form>
  ) : null;
  return { open, form, redirecting: checkout !== null };
}

function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Alert>
      <CircleCheckIcon />
      <AlertTitle role="status">{text}</AlertTitle>
    </Alert>
  );
}

/** The seat picker with its "Seats updated" confirmation. */
function SeatsWithNotice({ data, reload }: { data: SubscriptionData; reload: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <Notice text={notice} />
      {/* Remount when the saved seat count changes, so the picker starts from the new value. */}
      <SeatsCard
        key={data.seatLimit}
        data={data}
        onApplied={(seats) => {
          setNotice(`Seats updated to ${seats}.`);
          reload();
        }}
      />
    </div>
  );
}

/** /subscription: the plan and the seat picker side by side. */
export function SubscriptionOverview() {
  return (
    <WithSubscription cards={2}>
      {(data, reload) => (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
          <PlanCard data={data} />
          <SeatsWithNotice data={data} reload={reload} />
        </div>
      )}
    </WithSubscription>
  );
}

/** /subscription/current: plan, cycle, status, renewal date, seats and total. */
export function CurrentPlanView() {
  return (
    <WithSubscription cards={1}>
      {(data) => (
        <div className="max-w-2xl">
          <PlanCard data={data} />
        </div>
      )}
    </WithSubscription>
  );
}

/** /subscription/plans: choose a plan, billing cycle and seats. */
export function PlansView() {
  const catalog = useApiQuery<Catalog>("/api/subscription/plans");
  return (
    <WithSubscription cards={2}>
      {(data, reload) =>
        catalog.status === "loading" ? (
          <CardsSkeleton cards={2} />
        ) : !catalog.data ? (
          <LoadError message={catalog.error.message} onRetry={catalog.reload} />
        ) : (
          <PlanPicker
            key={`${data.plan.id}-${data.billingCycle}-${data.seatLimit}`}
            data={data}
            catalog={catalog.data}
            onApplied={reload}
          />
        )
      }
    </WithSubscription>
  );
}

function PlanCard({ data }: { data: SubscriptionData }) {
  const badge = statusBadge[data.planStatus];
  const free = !data.paymentsEnabled;
  const trialing = data.planStatus === "trialing";
  const trialEnded = !free && trialing && data.trialEndsAt && new Date(data.trialEndsAt) < new Date();
  const per = perCycle(data.billingCycle);
  const tryingOther = trialing && data.effectivePlan.id !== data.plan.id && !trialEnded;

  // Early access (payments off) gets one status, in the title. With payments on,
  // the badge and the Status row show the real state (trial, active, failed...).
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {data.plan.name} plan
          {free ? (
            <Badge>Free in early access</Badge>
          ) : tryingOther ? (
            <Badge variant="secondary">Trying {data.effectivePlan.name}</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {free
            ? `You pay nothing until payments start${tryingOther ? `, and ${data.effectivePlan.name} features are included` : ""}. Then it's ${inr.format(data.periodPricePerSeatInr)} per seat, per ${per}.`
            : `${inr.format(data.periodPricePerSeatInr)} per seat, per ${per}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {free ? null : (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {data.cancelAtPeriodEnd ? (
                  <Badge variant="outline">Ends at period end</Badge>
                ) : (
                  <Badge variant={trialEnded ? "destructive" : badge.variant}>{trialEnded ? "Trial ended" : badge.label}</Badge>
                )}
              </dd>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Billing</dt>
            <dd className="font-medium">{cycleLabel(data.billingCycle)}</dd>
          </div>
          {!free && trialing && data.trialEndsAt ? (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{trialEnded ? "Trial ended on" : "Trial ends on"}</dt>
              <dd className="font-medium">{dateFormat.format(new Date(data.trialEndsAt))}</dd>
            </div>
          ) : null}
          {!free && data.currentPeriodEnd ? (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{data.cancelAtPeriodEnd ? "Ends on" : "Renews on"}</dt>
              <dd className="font-medium">{dateFormat.format(new Date(data.currentPeriodEnd))}</dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Seats</dt>
            <dd className="font-medium tabular-nums">
              {data.seatsUsed} of {data.seatLimit} used
            </dd>
          </div>
          <InvoiceUsage usage={data.invoiceUsage} />

          <div className="flex flex-col gap-1">
            {/* In early access, show what it will cost rather than a ₹0 that contradicts the seat picker. */}
            <dt className="text-muted-foreground">{free ? "After early access" : data.billingCycle === "yearly" ? "Yearly total" : "Monthly total"}</dt>
            <dd className="font-medium tabular-nums">
              {inr.format(data.periodTotalInr)}
              {free ? <span className="font-normal text-muted-foreground">/{per}</span> : null}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {data.members} {data.members === 1 ? "member" : "members"} and {data.pendingInvites} pending{" "}
          {data.pendingInvites === 1 ? "invite" : "invites"} use seats.
        </p>
      </CardContent>
    </Card>
  );
}

function SeatStepper({
  id,
  seats,
  min,
  max,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  seats: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const set = (n: number) => onChange(Number.isNaN(n) ? min : Math.min(max, Math.max(0, Math.trunc(n))));
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon-lg" aria-label="Remove a seat" onClick={() => set(seats - 1)} disabled={seats <= min || disabled}>
        <MinusIcon />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isNaN(seats) ? "" : seats}
        onChange={(e) => set(e.target.valueAsNumber)}
        aria-invalid={invalid}
        className="w-24 text-center tabular-nums"
        disabled={disabled}
      />
      <Button type="button" variant="outline" size="icon-lg" aria-label="Add a seat" onClick={() => set(seats + 1)} disabled={seats >= max || disabled}>
        <PlusIcon />
      </Button>
    </div>
  );
}

function seatError(seats: number, min: number, max: number, members: number, planName: string) {
  if (seats < min) return `You have ${members} ${members === 1 ? "member" : "members"}, so you need at least ${min} ${min === 1 ? "seat" : "seats"}.`;
  if (seats > max) return `${planName} allows up to ${max.toLocaleString("en-IN")} seats.`;
  return null;
}

/** Seat count only; keeps the plan and billing cycle. */
function SeatsCard({ data, onApplied }: { data: SubscriptionData; onApplied: (seats: number) => void }) {
  // The API refuses fewer seats than current members, or more than the plan allows.
  const min = Math.max(1, data.members);
  const max = data.limits.maxSeats;
  const [seats, setSeats] = useState(Math.min(max, Math.max(data.seatLimit, min)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const payu = usePayuCheckout();

  const free = !data.paymentsEnabled;
  const problem = Number.isInteger(seats) ? seatError(seats, min, max, data.members, data.plan.name) : "Enter a whole number.";
  const valid = problem === null;
  const renewal = !free && data.access.state !== "full";
  const unchanged = seats === data.seatLimit && !renewal && (data.planStatus === "active" || free);
  const total = (valid ? seats : 0) * data.periodPricePerSeatInr;

  function updateSeats() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await api<ChangeResponse>("/api/subscription/seats", { method: "POST", json: { seats } });
        if (res.applied) return onApplied(res.seats);
        payu.open(res.checkout);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't update seats. Try again.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seats</CardTitle>
        <CardDescription>Each person on your team, and each pending invite, uses one seat.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field data-invalid={!valid || !!error}>
          <FieldLabel htmlFor="seat-count">Number of seats</FieldLabel>
          <SeatStepper
            id="seat-count"
            seats={seats}
            min={min}
            max={max}
            onChange={(n) => {
              setError(null);
              setSeats(n);
            }}
            disabled={pending}
            invalid={!valid}
          />
          {problem ? (
            <FieldError>{problem}</FieldError>
          ) : (
            <FieldDescription>
              At least {min}, since you have {data.members} {data.members === 1 ? "member" : "members"}.
            </FieldDescription>
          )}
        </Field>

        <Separator />

        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted-foreground tabular-nums">
            {valid ? seats : 0} × {inr.format(data.periodPricePerSeatInr)}
            {free ? " after early access" : ""}
          </span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {inr.format(total)}
            <span className="text-sm font-normal text-muted-foreground">/{perCycle(data.billingCycle)}</span>
          </span>
        </div>

        {error ? <FieldError>{error}</FieldError> : null}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        <Button size="lg" onClick={updateSeats} disabled={!valid || unchanged || pending || payu.redirecting}>
          {pending || payu.redirecting ? <Spinner data-icon="inline-start" /> : null}
          {payu.redirecting ? "Opening payment…" : renewal && seats === data.seatLimit ? "Renew" : "Update seats"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {unchanged
            ? "This is your current seat count."
            : free
              ? "Free during early access: your seats update right away."
              : "You'll pay securely with PayU. Your seats update once the payment goes through."}
        </p>
      </CardFooter>
      {payu.form}
    </Card>
  );
}

/** Plan, billing cycle and seats, with the total and a single button to apply or pay. */
function PlanPicker({ data, catalog, onApplied }: { data: SubscriptionData; catalog: Catalog; onApplied: () => void }) {
  const [planId, setPlanId] = useState(data.plan.id);
  const [cycle, setCycle] = useState<BillingCycle>(data.billingCycle);
  const plan = catalog.plans.find((p) => p.id === planId) ?? catalog.plans[0];
  const min = Math.max(1, data.members);
  const [seats, setSeats] = useState(Math.max(data.seatLimit, min));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const payu = usePayuCheckout();

  const free = !data.paymentsEnabled;
  const max = plan.limits.maxSeats;
  const problem = Number.isInteger(seats) ? seatError(seats, min, max, data.members, plan.name) : "Enter a whole number.";
  const valid = problem === null;
  const renewal = !free && data.access.state !== "full";
  const sameChoice = plan.id === data.plan.id && cycle === data.billingCycle && seats === data.seatLimit;
  const unchanged = sameChoice && !renewal && (data.planStatus === "active" || free);
  const total = (valid ? seats : 0) * plan.prices[cycle];
  const savingPerSeat = plan.prices.monthly * 12 - plan.prices.yearly;

  function apply() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await api<ChangeResponse>("/api/subscription/change", {
          method: "POST",
          json: { planId: plan.id, billingCycle: cycle, seats },
        });
        if (res.applied) {
          setNotice(`You're on ${plan.name}, billed ${cycle}, with ${res.seats} ${res.seats === 1 ? "seat" : "seats"}.`);
          return onApplied();
        }
        payu.open(res.checkout);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't change your plan. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Notice text={notice} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          aria-label="Billing cycle"
          variant="outline"
          spacing={0}
          value={[cycle]}
          onValueChange={(v: string[]) => v[0] && setCycle(v[0] as BillingCycle)}
          disabled={pending}
        >
          <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
          <ToggleGroupItem value="yearly">Yearly</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          Yearly billing charges {catalog.yearlyMonthsCharged} months: 2 months free.
        </p>
      </div>

      <div role="radiogroup" aria-label="Plan" className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {catalog.plans.map((p) => {
          const selected = p.id === plan.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPlanId(p.id)}
              disabled={pending}
              className={cn(
                "flex flex-col gap-4 rounded-xl border p-5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">{p.name}</span>
                  <span className="text-sm text-muted-foreground">{p.description}</span>
                </div>
                {p.id === data.plan.id ? <Badge variant="secondary">Current</Badge> : null}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular-nums">{inr.format(p.prices[cycle])}</span>
                <span className="text-sm text-muted-foreground">per seat / {perCycle(cycle)}</span>
              </div>
              <ul className="flex flex-col gap-1.5 text-sm">
                {(Object.keys(FEATURE_LABELS) as (keyof CatalogPlan["features"])[]).map((f) => (
                  <li key={f} className={cn("flex items-center gap-2", !p.features[f] && "text-muted-foreground")}>
                    {p.features[f] ? (
                      <CheckIcon className="size-4 text-primary" aria-hidden="true" />
                    ) : (
                      <XIcon className="size-4" aria-hidden="true" />
                    )}
                    <span>
                      {FEATURE_LABELS[f]}
                      <span className="sr-only">{p.features[f] ? " included" : " not included"}</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <CheckIcon className="size-4 text-primary" aria-hidden="true" />
                  {p.limits.maxInvoicesPerMonth === null
                    ? "Unlimited invoices"
                    : `${p.limits.maxInvoicesPerMonth.toLocaleString("en-IN")} invoices a month`}
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon className="size-4 text-primary" aria-hidden="true" />
                  Up to {p.limits.maxSeats.toLocaleString("en-IN")} seats
                </li>
              </ul>
            </button>
          );
        })}
      </div>

      <Card className="max-w-2xl">
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={!valid || !!error}>
            <FieldLabel htmlFor="plan-seats">Seats</FieldLabel>
            <SeatStepper
              id="plan-seats"
              seats={seats}
              min={min}
              max={max}
              onChange={(n) => {
                setError(null);
                setSeats(n);
              }}
              disabled={pending}
              invalid={!valid}
            />
            {problem ? <FieldError>{problem}</FieldError> : <FieldDescription>Each member and pending invite uses one seat.</FieldDescription>}
          </Field>
          <Separator />
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted-foreground tabular-nums">
              {plan.name} · {valid ? seats : 0} × {inr.format(plan.prices[cycle])}
            </span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {inr.format(total)}
              <span className="text-sm font-normal text-muted-foreground">/{perCycle(cycle)}</span>
            </span>
          </div>
          {cycle === "yearly" && valid ? (
            <p className="-mt-3 text-xs text-muted-foreground">You save {inr.format(savingPerSeat * seats)} a year compared with monthly.</p>
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2">
          <Button size="lg" onClick={apply} disabled={!valid || unchanged || pending || payu.redirecting}>
            {pending || payu.redirecting ? <Spinner data-icon="inline-start" /> : null}
            {payu.redirecting
              ? "Opening payment…"
              : sameChoice && renewal
                ? "Renew"
                : plan.id !== data.plan.id
                  ? `Switch to ${plan.name}`
                  : "Update plan"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {unchanged
              ? "This is your current plan."
              : free
                ? "Free during early access: the change applies right away."
                : "You'll pay securely with PayU. The change applies once the payment goes through, and a new billing period starts that day."}
          </p>
        </CardFooter>
      </Card>
      {payu.form}
    </div>
  );
}

function CardsSkeleton({ cards }: { cards: 1 | 2 }) {
  return (
    <div
      className={cards === 2 ? "grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2" : "max-w-2xl"}
      aria-busy="true"
      aria-label="Loading your subscription"
    >
      <Skeleton className="h-72 rounded-xl" />
      {cards === 2 ? <Skeleton className="h-80 rounded-xl" /> : null}
    </div>
  );
}

/** "Invoices this month: 120 of 500", with a note near and at the cap. */
function InvoiceUsage({ usage }: { usage: SubscriptionData["invoiceUsage"] }) {
  const { used, cap, month } = usage;
  const share = cap ? used / cap : 0;
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground">Invoices in {month}</dt>
      <dd className="font-medium tabular-nums">
        {cap === null ? `${used.toLocaleString("en-IN")} (no limit)` : `${used.toLocaleString("en-IN")} of ${cap.toLocaleString("en-IN")}`}
        {cap !== null ? (
          <span className="mt-1.5 block h-1.5 rounded-full bg-muted" aria-hidden="true">
            <span className={cn("block h-full rounded-full", share >= 1 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, share * 100)}%` }} />
          </span>
        ) : null}
        {cap !== null && share >= 1 ? (
          <span className="mt-1 block text-xs font-normal text-destructive">Limit reached: new invoices can be issued next month, or upgrade now.</span>
        ) : cap !== null && share >= 0.8 ? (
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Nearly at your monthly limit.</span>
        ) : null}
      </dd>
    </div>
  );
}
