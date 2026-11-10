import {
  BarChart3Icon,
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

export type BillingSection = {
  /** Path segment under /billing. */
  slug: string;
  label: string;
  Icon: LucideIcon;
  /** One line for the overview card. */
  summary: string;
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
    empty: { title: "No invoices yet", description: "Create an invoice for one of your customers." },
  },
  {
    slug: "quotations",
    label: "Quotations",
    Icon: FileTextIcon,
    summary: "Send estimates and turn them into invoices.",
    empty: { title: "No quotations yet", description: "Send estimates and turn them into orders or invoices." },
  },
  {
    slug: "customers",
    label: "Customers",
    Icon: UsersIcon,
    summary: "The people and businesses you bill.",
    empty: { title: "No customers yet", description: "Add the people and businesses you bill." },
  },
  {
    slug: "suppliers",
    label: "Suppliers",
    Icon: TruckIcon,
    summary: "The businesses you buy from.",
    empty: { title: "No suppliers yet", description: "Add the businesses you buy from." },
  },
  {
    slug: "products",
    label: "Products",
    Icon: BoxIcon,
    summary: "Goods you sell, with prices and tax rates.",
    empty: { title: "No products yet", description: "Add the goods you sell, with prices and GST rates." },
  },
  {
    slug: "services",
    label: "Services",
    Icon: WrenchIcon,
    summary: "Work you bill for, by the hour or per job.",
    empty: { title: "No services yet", description: "Add the work you bill for, with rates and SAC codes." },
  },
  {
    slug: "payments",
    label: "Payments",
    Icon: WalletIcon,
    summary: "Money received from customers.",
    empty: { title: "No payments yet", description: "Recording customer payments is coming soon." },
  },
  {
    slug: "purchases",
    label: "Purchases",
    Icon: ShoppingCartIcon,
    summary: "Bills from your suppliers.",
    empty: { title: "No purchases yet", description: "Recording purchases is coming soon." },
  },
  {
    slug: "reports",
    label: "Reports",
    Icon: BarChart3Icon,
    summary: "Sales, purchases, tax and payments at a glance.",
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
export const BUILT_SECTIONS = ["invoices", "quotations", "customers", "suppliers", "products", "services"] as const;

/** Sales pages outside the section list; the Invoices tab stays active on them. */
export const SALES_EXTRA_PATHS = ["/billing/sales-orders", "/billing/credit-notes", "/billing/debit-notes"] as const;

/** Tabs: Overview, every section, then Settings. */
export const BILLING_NAV = [
  { href: "/billing", label: "Overview" },
  ...BILLING_SECTIONS.map((s) => ({
    href: `/billing/${s.slug}`,
    label: s.label,
    matchNested: true,
    ...(s.slug === "products" ? { alsoActiveOn: CATALOGUE_EXTRA_PATHS } : {}),
    ...(s.slug === "invoices" ? { alsoActiveOn: SALES_EXTRA_PATHS } : {}),
  })),
  { href: "/billing/settings", label: "Settings", matchNested: true },
];
