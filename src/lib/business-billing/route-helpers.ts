import { readJson } from "@/lib/access";
import { type BusinessBillingPermission, hasBillingPermission } from "@/lib/roles";

import { requireBillingPermission } from "./access";
import type { FieldErrors } from "./fields";
import { invalid } from "./records";

type Ctx = Awaited<ReturnType<typeof requireBillingPermission>>;

/**
 * Whether this member can change records guarded by `permission` right now,
 * and why not when the workspace is read-only. Lists and detail pages send it
 * so the UI can hide edit buttons.
 */
export function editAccess(ctx: Ctx, permission: BusinessBillingPermission) {
  const readOnly = ctx.entitlements.access.state === "read_only";
  return {
    canEdit: hasBillingPermission(ctx.roles, permission) && !readOnly,
    readOnlyReason: readOnly ? ctx.entitlements.access.reason : null,
  };
}

/** Validated values, or a 400 with per-field messages. */
export function valuesOrThrow<T>(result: { ok: true; values: T } | { ok: false; errors: FieldErrors }): T {
  if (!result.ok) invalid(result.errors);
  return result.values;
}

/** The JSON body as a plain object (400 if it isn't one). */
export const body = (request: Request) => readJson<Record<string, unknown>>(request) as Promise<Record<string, unknown>>;

/** `{ archived: true | false }` from an archive request. */
export async function archivedFlag(request: Request) {
  const b = await body(request);
  if (typeof b.archived !== "boolean") invalid({ archived: "Send archived: true or false." });
  return b.archived;
}
