"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  IconArrowLeft,
  IconCreditCard,
  IconFileInvoice,
  IconLayoutDashboard,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const iconClass = "h-5 w-5 shrink-0";
// Row padding mirrors the rail's px-4, so the highlight is centred on the icon when collapsed.
const linkClass = "-mx-2 rounded-md px-2 transition-colors";
const plainLinkClass = cn(linkClass, "hover:bg-neutral-200/70 dark:hover:bg-neutral-700/60");

type NavItem = {
  label: string;
  href: string;
  Icon: typeof IconUsers;
  /** Who sees it. Unset means everyone. */
  requires?: "team" | "subscription" | "billing";
};

// Only modules that exist. Add new ones here as they're built; customers and
// reports live inside Billing for now, so they don't get their own entries.
const navLinks: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", Icon: IconLayoutDashboard },
  // Everyone sees Team: employees get a read-only list, managers and up can manage it.
  { label: "Team", href: "/team", Icon: IconUsers },
  // Business Billing: the tenant's own invoices, customers and payments.
  { label: "Billing", href: "/billing", Icon: IconFileInvoice, requires: "billing" },
  // What this workspace pays Automate Ideas (route stays /subscription).
  { label: "Plan & seats", href: "/subscription", Icon: IconCreditCard, requires: "subscription" },
  { label: "Settings", href: "/settings", Icon: IconSettings },
];

export type SidebarViewer = {
  name: string;
  canManageTeam: boolean;
  canManageSubscription: boolean;
  canUseBilling: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function AppSidebar({ viewer }: { viewer: SidebarViewer }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // Closes the full-screen mobile menu after a tap; harmless on desktop.
  const close = () => setOpen(false);

  const visible = navLinks.filter(
    (item) =>
      !item.requires ||
      (item.requires === "team" && viewer.canManageTeam) ||
      (item.requires === "subscription" && viewer.canManageSubscription) ||
      (item.requires === "billing" && viewer.canUseBilling),
  );

  async function logOut(e: React.MouseEvent) {
    e.preventDefault();
    close();
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-10">
        <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {open ? <Logo /> : <LogoIcon />}
          <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
            {visible.map(({ label, href, Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <SidebarLink
                  key={href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    linkClass,
                    active
                      // Grey on the white mobile menu, white on the grey desktop rail.
                      ? "bg-neutral-100 dark:bg-neutral-800 md:bg-white md:shadow-xs md:dark:bg-neutral-900"
                      : "hover:bg-neutral-200/70 dark:hover:bg-neutral-700/60",
                  )}
                  link={{
                    label,
                    href,
                    icon: (
                      <Icon
                        className={cn(
                          iconClass,
                          active ? "text-primary" : "text-neutral-700 dark:text-neutral-200",
                        )}
                      />
                    ),
                  }}
                />
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-1">
          <SidebarLink
            onClick={close}
            className={plainLinkClass}
            link={{
              label: viewer.name,
              href: "/settings",
              icon: (
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
                >
                  {initials(viewer.name)}
                </span>
              ),
            }}
          />
          <SidebarLink
            onClick={logOut}
            className={plainLinkClass}
            link={{
              label: "Log out",
              href: "/login",
              icon: <IconArrowLeft className={cn(iconClass, "text-neutral-700 dark:text-neutral-200")} />,
            }}
          />
        </div>
      </SidebarBody>
    </Sidebar>
  );
}

/** Placeholder rail shown while the session loads. */
export function AppSidebarSkeleton() {
  return (
    <div aria-hidden="true" className="hidden h-full w-[60px] shrink-0 flex-col gap-6 px-4 py-4 md:flex">
      <div className="h-7 w-7 rounded-md bg-neutral-200 dark:bg-neutral-700" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="mx-1 h-5 w-5 rounded bg-neutral-200 dark:bg-neutral-700" />
      ))}
    </div>
  );
}

function Logo() {
  return (
    <Link href="/dashboard" className="relative z-20 flex items-center gap-2 py-1" aria-label="Automate Ideas home">
      <Image src="/Logo.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-sm font-semibold whitespace-pre text-black dark:text-white"
      >
        Automate Ideas
      </motion.span>
    </Link>
  );
}

function LogoIcon() {
  return (
    <Link href="/dashboard" className="relative z-20 flex items-center py-1" aria-label="Automate Ideas home">
      <Image src="/Logo.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
    </Link>
  );
}
