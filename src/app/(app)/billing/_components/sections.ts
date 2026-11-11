import {
  BarChart3Icon,
  BookOpenIcon,
  BoxIcon,
  FileTextIcon,
  type LucideIcon,
  ReceiptTextIcon,
  ShoppingCartIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  WrenchIcon,
} from "lucide-react";

import type { BrandTone } from "@/lib/brand-tones";

export type BillingSection = {
  /** Path segment under /billing. */
  slug: string;
  label: string;
  Icon: LucideIcon;
  /** One line for the overview card. */
  summary: string;
  /** Icon chip colour on the overview (lib/brand-tones.ts). */
  tone: BrandTone;
  /** Empty state shown until the feature is built. */
  empty: { title: string; description: string };
};

// Order here is the order of the tabs and the overview cards.
export const BILLING_SECTIONS: readonly BillingSection[] = [
  {
    slug: "invoices",
    label: "Invoices",
    Icon: ReceiptTextIcon,
    summary: "Bill your customers and track what's due.",
    tone: "green",
    empty: { title: "No invoices yet", description: "Create an invoice for one of your customers." },
  },
  {
    slug: "quotations",
    label: "Quotations",
    Icon: FileTextIcon,
    summary: "Send estimates and turn them into invoices.",
    tone: "green",
    empty: { title: "No quotations yet", description: "Send estimates and turn them into orders or invoices." },
  },
  {
    slug: "customers",
    label: "Customers",
    Icon: UsersIcon,
    summary: "The people and businesses you bill.",
    tone: "green",
    empty: { title: "No customers yet", description: "Add the people and businesses you bill." },
  },
  {
    slug: "suppliers",
    label: "Suppliers",
    Icon: TruckIcon,
    summary: "The businesses you buy from.",
    tone: "amber",
    empty: { title: "No suppliers yet", description: "Add the businesses you buy from." },
  },
  {
    slug: "products",
    label: "Products",
    Icon: BoxIcon,
    summary: "Goods you sell, with prices and tax rates.",
    tone: "red",
    empty: { title: "No products yet", description: "Add the goods you sell, with prices and GST rates." },
  },
  {
    slug: "services",
    label: "Services",
    Icon: WrenchIcon,
    summary: "Work you bill for, by the hour or per job.",
    tone: "red",
    empty: { title: "No services yet", description: "Add the work you bill for, with rates and SAC codes." },
  },
  {
    slug: "payments",
    label: "Payments",
    Icon: WalletIcon,
    summary: "Money received from customers.",
    tone: "green",
    empty: { title: "No payments yet", description: "Record money received from customers." },
  },
  {
    slug: "purchases",
    label: "Purchases",
    Icon: ShoppingCartIcon,
    summary: "Bills from your suppliers.",
    tone: "amber",
    empty: { title: "No purchases yet", description: "Record bills from your suppliers." },
  },
  {
    slug: "accounting",
    label: "Accounting",
    Icon: BookOpenIcon,
    summary: "Your books: ledgers, trial balance, profit and loss, balance sheet.",
    tone: "ink",
    empty: { title: "Nothing posted yet", description: "Entries appear as you issue invoices, record bills and take payments." },
  },
  {
    slug: "reports",
    label: "Reports",
    Icon: BarChart3Icon,
    summary: "Sales, purchases, payments and GST, with CSV and Excel downloads.",
    tone: "ink",
    empty: { title: "No reports yet", description: "Reports appear once you have invoices and payments." },
  },
];

export const billingSection = (slug: string) => {
  const section = BILLING_SECTIONS.find((s) => s.slug === slug);
  if (!section) throw new Error(`Unknown billing section: ${slug}`);
  return section;
};

/** Catalogue pages that live outside the section list; the Products tab stays active on them. */
export const CATALOGUE_EXTRA_PATHS = ["/billing/categories", "/billing/units", "/billing/price-lists"] as const;

/** Sections whose pages are built (no "Coming soon" placeholder). */
export const BUILT_SECTIONS = ["invoices", "quotations", "customers", "suppliers", "products", "services", "payments", "purchases", "accounting", "reports"] as const;

/** Purchase pages outside the section list; the Purchases tab stays active on them. */
export const PURCHASE_EXTRA_PATHS = ["/billing/purchase-bills", "/billing/purchase-orders", "/billing/purchase-returns", "/billing/supplier-payments", "/billing/payables"] as const;

/** Payment pages outside the section list; the Payments tab stays active on them. */
export const PAYMENT_EXTRA_PATHS = ["/billing/refunds", "/billing/outstanding"] as const;

/** Sales pages outside the section list; the Invoices tab stays active on them. */
export const SALES_EXTRA_PATHS = ["/billing/sales-orders", "/billing/credit-notes", "/billing/debit-notes"] as const;

/** Accounting pages outside the section list; the Accounting tab stays active on them. */
export const ACCOUNTING_EXTRA_PATHS = ["/billing/journal-entries", "/billing/ledger", "/billing/trial-balance", "/billing/profit-loss", "/billing/balance-sheet"] as const;

/** Tabs: Overview, every section, then Settings. */
export const BILLING_NAV = [
  { href: "/billing", label: "Overview" },
  ...BILLING_SECTIONS.map((s) => ({
    href: `/billing/${s.slug}`,
    label: s.label,
    matchNested: true,
    ...(s.slug === "products" ? { alsoActiveOn: CATALOGUE_EXTRA_PATHS } : {}),
    ...(s.slug === "invoices" ? { alsoActiveOn: SALES_EXTRA_PATHS } : {}),
    ...(s.slug === "payments" ? { alsoActiveOn: PAYMENT_EXTRA_PATHS } : {}),
    ...(s.slug === "purchases" ? { alsoActiveOn: PURCHASE_EXTRA_PATHS } : {}),
    ...(s.slug === "accounting" ? { alsoActiveOn: ACCOUNTING_EXTRA_PATHS } : {}),
  })),
  { href: "/billing/settings", label: "Settings", matchNested: true },
];
