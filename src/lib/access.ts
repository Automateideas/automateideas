import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { member } from "@/db/schema";
import { auth } from "@/lib/auth";
import { type OrgRole } from "@/lib/roles";

// Role rules live in lib/roles.ts (shared with the browser). Re-exported for the API routes.
// Team APIs: owner, admin, manager. Subscription APIs: owner, admin. Members (employees): neither.
export { BILLING_ROLES, SUBSCRIPTION_ROLES, TEAM_MANAGER_ROLES, canManageRole, parseRoles, type OrgRole } from "@/lib/roles";
import { parseRoles } from "@/lib/roles";

/** The signed-in user, or a 401. */
export async function requireSession() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) throw new APIError("UNAUTHORIZED", { message: "Log in to continue." });
  return { ...session, headers: h };
}

/**
 * The signed-in user's membership in their active organization (or their first
 * one if none is active), or a 401/403 when they lack one of `allowed` roles.
 */
export async function requireOrgRole(allowed: readonly OrgRole[]) {
  const session = await requireSession();

  const memberships = await db
    .select({ id: member.id, organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(member.createdAt));

  const activeId = session.session.activeOrganizationId;
  const current = memberships.find((m) => m.organizationId === activeId) ?? memberships[0];
  if (!current) {
    throw new APIError("FORBIDDEN", {
      code: "NO_ORGANIZATION",
      message: "You're not a member of any organization.",
    });
  }

  const roles = parseRoles(current.role);
  if (!roles.some((r) => allowed.includes(r as OrgRole))) {
    throw new APIError("FORBIDDEN", {
      code: "INSUFFICIENT_ROLE",
      message: `Only ${allowed.join(" or ")} roles can do this.`,
    });
  }

  return {
    user: session.user,
    headers: session.headers,
    organizationId: current.organizationId,
    memberId: current.id,
    roles,
  };
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object") return body as Partial<T>;
  } catch {}
  throw new APIError("BAD_REQUEST", { message: "Send a JSON object in the request body." });
}

function toErrorResponse(error: unknown) {
  if (error instanceof APIError) {
    const body = (error.body ?? {}) as {
      code?: string;
      message?: string;
      fields?: Record<string, string>;
      details?: unknown;
    };
    return Response.json(
      {
        error: {
          code: body.code ?? error.status,
          message: body.message ?? error.message,
          // Per-field messages for forms, when the route provides them.
          ...(body.fields ? { fields: body.fields } : {}),
          // Extra data for the caller, e.g. the records a duplicate check matched.
          ...(body.details !== undefined ? { details: body.details } : {}),
        },
      },
      { status: error.statusCode },
    );
  }
  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again." } },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown APIErrors become `{ error: { code, message } }` JSON. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
