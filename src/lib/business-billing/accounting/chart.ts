// The standard chart of accounts every company starts with. Pure.
// Accounts with a systemKey are what automatic postings use; they can be
// renamed but not archived. Companies add their own accounts alongside.

export const ACCOUNT_TYPE_LABELS = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPE_LABELS;

export const SYSTEM_ACCOUNTS = [
  { key: "cash", code: "1000", name: "Cash in hand", type: "asset" },
  { key: "bank", code: "1010", name: "Bank", type: "asset" },
  { key: "receivables", code: "1100", name: "Accounts receivable (debtors)", type: "asset" },
  { key: "input_cgst", code: "1200", name: "Input CGST", type: "asset" },
  { key: "input_sgst", code: "1210", name: "Input SGST", type: "asset" },
  { key: "input_igst", code: "1220", name: "Input IGST", type: "asset" },
  { key: "input_cess", code: "1230", name: "Input cess", type: "asset" },
  { key: "payables", code: "2000", name: "Accounts payable (creditors)", type: "liability" },
  { key: "output_cgst", code: "2100", name: "Output CGST", type: "liability" },
  { key: "output_sgst", code: "2110", name: "Output SGST", type: "liability" },
  { key: "output_igst", code: "2120", name: "Output IGST", type: "liability" },
  { key: "output_cess", code: "2130", name: "Output cess", type: "liability" },
  { key: "rcm_payable", code: "2200", name: "GST payable under reverse charge", type: "liability" },
  { key: "capital", code: "3000", name: "Owner's capital", type: "equity" },
  { key: "opening_equity", code: "3100", name: "Opening balance equity", type: "equity" },
  { key: "sales", code: "4000", name: "Sales", type: "income" },
  { key: "sales_returns", code: "4010", name: "Sales returns (credit notes)", type: "income" },
  { key: "round_off", code: "4900", name: "Round-off", type: "income" },
  { key: "purchases", code: "5000", name: "Purchases", type: "expense" },
  { key: "purchase_returns", code: "5010", name: "Purchase returns", type: "expense" },
] as const satisfies readonly { key: string; code: string; name: string; type: AccountType }[];

export type SystemAccountKey = (typeof SYSTEM_ACCOUNTS)[number]["key"];

/** Debit-normal accounts grow with debits; the rest with credits. */
export const isDebitNormal = (type: string) => type === "asset" || type === "expense";

/** Signed balance in the account's normal direction. */
export const normalBalance = (type: string, debit: number, credit: number) => (isDebitNormal(type) ? debit - credit : credit - debit);

/** Where money for a payment method sits. */
export const cashAccountFor = (method: string): SystemAccountKey => (method === "cash" ? "cash" : "bank");

export const SOURCE_LABELS: Record<string, string> = {
  "document:invoices": "Invoice",
  "document:credit-notes": "Credit note",
  "document:debit-notes": "Debit note",
  "document:purchase-bills": "Purchase bill",
  "document:purchase-returns": "Purchase return",
  payment_received: "Payment received",
  payment_made: "Supplier payment",
  refund: "Refund",
  opening: "Opening balance",
  manual: "Manual entry",
};
