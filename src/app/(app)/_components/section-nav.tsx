"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type SectionLink = {
  href: string;
  label: string;
  /** Also active on nested routes, e.g. /billing/invoices/123. Off for a section's home. */
  matchNested?: boolean;
  /** Other path prefixes that also mark this tab active, e.g. sub-pages of a section. */
  alsoActiveOn?: readonly string[];
};

/** Tabs across the top of a module (Subscription, Billing). Scrolls sideways on narrow screens. */
export function SectionNav({ label, links }: { label: string; links: readonly SectionLink[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {links.map((link) => {
          const active =
            pathname === link.href ||
            (link.matchNested === true && pathname.startsWith(`${link.href}/`)) ||
            (link.alsoActiveOn ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
