import { APIError } from "better-auth/api";
import { type AnyColumn, type SQL, and, ilike, isNotNull, isNull, or } from "drizzle-orm";

import type { FieldErrors } from "./fields";

// Shared helpers for the contacts and catalogue services.

export type ListStatus = "active" | "archived" | "all";

export type ListQuery = { q: string | null; status: ListStatus; page: number; pageSize: number };

export const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/** ?q=&status=active|archived|all&page=1&pageSize=25 from a request URL. */
export function parseListQuery(url: string): ListQuery {
  const p = new URL(url).searchParams;
  const q = p.get("q")?.trim().slice(0, 100) || null;
  const status = (["active", "archived", "all"] as const).find((s) => s === p.get("status")) ?? "active";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(p.get("page") ?? "1", 10) || 1));
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.parseInt(p.get("pageSize") ?? "", 10) || PAGE_SIZE));
  return { q, status, page, pageSize };
}

/** WHERE for the archived filter. */
export function statusFilter(archivedAt: AnyColumn, status: ListStatus): SQL | undefined {
  if (status === "active") return isNull(archivedAt);
  if (status === "archived") return isNotNull(archivedAt);
  return undefined;
}

/** Case-insensitive "contains" across columns; % and _ in the search are literal. */
export function searchFilter(q: string | null, columns: AnyColumn[]): SQL | undefined {
  if (!q) return undefined;
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(...columns.map((c) => ilike(c, pattern)));
}

export const where = (...parts: (SQL | undefined)[]) => and(...parts.filter(Boolean));

export function invalid(fields: FieldErrors, message = "Check the highlighted fields."): never {
  throw new APIError("BAD_REQUEST", { code: "INVALID_FIELDS", message, fields });
}

export function notFound(what: string): never {
  throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: `This ${what} doesn't exist or was removed.` });
}

export function conflict(code: string, message: string, fields?: FieldErrors, details?: unknown): never {
  throw new APIError("CONFLICT", { code, message, ...(fields ? { fields } : {}), ...(details ? { details } : {}) });
}

/** The Postgres unique-constraint name a failed write hit, or null. */
export function uniqueViolation(error: unknown): string | null {
  for (let e = error as { code?: string; constraint?: string; cause?: unknown } | undefined, i = 0; e && i < 4; i++) {
    if (e.code === "23505") return e.constraint ?? "";
    e = e.cause as typeof e;
  }
  return null;
}

/**
 * Runs a write and turns unique-constraint failures (e.g. two people saving
 * the same SKU at once) into a 409 with a field message.
 */
export async function guardUnique<T>(
  fn: () => Promise<T>,
  messages: Readonly<Record<string, readonly [field: string, message: string]>>,
) {
  try {
    return await fn();
  } catch (error) {
    const name = uniqueViolation(error);
    if (name !== null) {
      const hit = messages[name];
      if (hit) conflict("DUPLICATE", hit[1], { [hit[0]]: hit[1] });
      conflict("DUPLICATE", "This record already exists.");
    }
    throw error;
  }
}

export const paged = <T>(items: T[], total: number, q: ListQuery) => ({
  items,
  total,
  page: q.page,
  pageSize: q.pageSize,
});
