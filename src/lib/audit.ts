import { AsyncLocalStorage } from "node:async_hooks";

import { auditLogs } from "@/db/schema";
import { withTenant } from "@/lib/business-billing/tenant-db";

// The audit trail for Business Billing: every successful change made through
// the API (create, edit, issue, void, payments, settings, connections…),
// with who, when, from where and what was sent (secrets removed).
//
// How it's wired: route() (lib/access.ts) opens a request scope;
// requireBillingPermission records the company and user in it; when the
// handler succeeds with a change (POST/PUT/PATCH/DELETE, status < 400),
// route() writes one audit_logs row. audit_logs is append-only (the app's
// database role may not update or delete it).

type Scope = { organizationId?: string; userId?: string };
const scope = new AsyncLocalStorage<Scope>();

export const runWithAuditScope = <T>(fn: () => Promise<T>) => scope.run({}, fn);

/** Called by requireBillingPermission once the member is known. */
export function setAuditActor(organizationId: string, userId: string) {
  const s = scope.getStore();
  if (s) {
    s.organizationId = organizationId;
    s.userId = userId;
  }
}

const SECRET_KEY = /token|secret|password|pin|code$|^code|authorization|signature/i;
const MAX_JSON = 16_000;

/** The request body with secrets masked and long values cut, or null. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) && v !== null && v !== "" ? "[redacted]" : redact(v, depth + 1)]));
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

/** "invoices", "payments"… and the record id from an API path like /api/business-billing/documents/invoices/<id>/issue. */
export function entityOf(pathname: string): { entityType: string; entityId: string | null; action: string } {
  const parts = pathname.replace(/^\/api\/business-billing\/?/, "").split("/").filter(Boolean);
  const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const head = parts[0] === "documents" && parts[1] ? parts[1] : (parts[0] ?? "billing");
  const ids = parts.filter(isId);
  const verbs = parts.filter((p, i) => !isId(p) && !(parts[0] === "documents" && i <= 1) && i > 0);
  return { entityType: head, entityId: ids.at(-1) ?? null, action: verbs.at(-1) ?? "" };
}

/** Writes the audit row for a successful change, if this request was a Business Billing one. Never throws. */
export async function recordAudit(request: Request, bodyText: string | null, response: Response) {
  const s = scope.getStore();
  if (!s?.organizationId || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) || response.status >= 400) return;
  try {
    const url = new URL(request.url);
    const { entityType, entityId, action } = entityOf(url.pathname);
    let changes: unknown = null;
    if (bodyText && bodyText.length <= MAX_JSON) {
      try {
        changes = redact(JSON.parse(bodyText));
      } catch {
        changes = null;
      }
    }
    // A new record's id comes back in the response.
    let createdId: string | null = null;
    if (!entityId && response.headers.get("content-type")?.includes("application/json")) {
      createdId = ((await response.clone().json().catch(() => null)) as { id?: string } | null)?.id ?? null;
    }
    const verb = { POST: action || "create", PUT: action || "update", PATCH: action || "update", DELETE: action || "delete" }[request.method]!;
    await withTenant(s.organizationId, (tx) =>
      tx.insert(auditLogs).values({
        organizationId: s.organizationId!,
        actorUserId: s.userId ?? null,
        action: `${entityType}.${verb}`,
        entityType,
        entityId: entityId ?? createdId,
        changes: { method: request.method, path: url.pathname, body: changes, status: response.status },
        ipAddress: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      }),
    );
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}
