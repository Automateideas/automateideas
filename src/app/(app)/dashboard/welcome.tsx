import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  type LucideIcon,
  ReceiptTextIcon,
  UserPlusIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { BRAND_TONES, type BrandTone } from "@/lib/brand-tones";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { getViewer, type Viewer } from "@/lib/viewer";

/** "Welcome back, Priya" with the workspace's logo, name and the viewer's role. */
export async function Welcome() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const firstName = viewer.user.name.trim().split(/\s+/)[0] || viewer.user.name;
  const org = viewer.organization;

  return (
    <header className="flex items-center gap-4">
      {org ? <WorkspaceMark name={org.name} hasLogo={org.hasLogo} /> : null}
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Welcome back, {firstName}</h1>
        <p className="truncate text-muted-foreground">
          {org ? org.name : "Automate Ideas"}
          {viewer.role ? ` · ${roleLabel(viewer.role)}` : ""}
        </p>
      </div>
    </header>
  );
}

/** The uploaded logo, or the workspace's initials on brand green. Decorative: the name is next to it. */
function WorkspaceMark({ name, hasLogo }: { name: string; hasLogo: boolean }) {
  const box = "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl";
  if (hasLogo) {
    return (
      <span className={cn(box, "bg-card ring-1 ring-foreground/10")}>
        {/* Redirects to a short-lived S3 URL, so Next's optimizer can't cache it. */}
        <Image src="/api/organization/logo" alt="" width={48} height={48} unoptimized className="size-full object-contain p-1.5" />
      </span>
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className={cn(box, BRAND_TONES.green, "text-base font-semibold")}>
      {initials || "?"}
    </span>
  );
}

type QuickAction = { href: string; label: string; hint: string; Icon: LucideIcon; tone: BrandTone };

/** Up to four shortcuts, picked by what the viewer is allowed to do. */
function quickActions(viewer: Viewer): QuickAction[] {
  const actions: QuickAction[] = [];
  if (viewer.canUseBilling) {
    actions.push(
      { href: "/billing/invoices/create", label: "Create an invoice", hint: "Bill a customer and track what's due.", Icon: ReceiptTextIcon, tone: "green" },
      { href: "/billing/customers/create", label: "Add a customer", hint: "Save their GSTIN and address once.", Icon: UsersIcon, tone: "green" },
      { href: "/billing/payments/create", label: "Record a payment", hint: "Mark money received against invoices.", Icon: WalletIcon, tone: "green" },
    );
  }
  if (viewer.canManageTeam) {
    actions.push({ href: "/team", label: "Invite your team", hint: "Give each person their own login.", Icon: UserPlusIcon, tone: "amber" });
  } else {
    actions.push({ href: "/team", label: "Team directory", hint: "Find a colleague's email or number.", Icon: UsersIcon, tone: "amber" });
  }
  if (actions.length < 4) {
    actions.push({ href: "/settings", label: "Your profile", hint: "Keep your name and number up to date.", Icon: UserRoundIcon, tone: "ink" });
  }
  return actions.slice(0, 4);
}

export async function QuickActions() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const actions = quickActions(viewer);

  return (
    <section aria-labelledby="quick-actions" className="flex flex-col gap-3">
      <h2 id="quick-actions" className="text-base font-semibold tracking-tight">
        Quick actions
      </h2>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ href, label, hint, Icon, tone }) => (
          <li key={href}>
            <Link
              href={href}
              // A row on phones (shorter scroll), a tile from sm up.
              className="group relative flex h-full items-center gap-3 rounded-xl border bg-card p-4 pr-10 sm:flex-col sm:items-start sm:pr-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ArrowUpRightIcon
                aria-hidden="true"
                className="absolute top-4 right-4 size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", BRAND_TONES[tone])}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold tracking-tight">{label}</span>
                <span className="text-sm text-muted-foreground">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WelcomeSkeleton() {
  return (
    <div className="flex items-center gap-4" aria-hidden="true">
      <Skeleton className="size-12 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

export function QuickActionsSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}
