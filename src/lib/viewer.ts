import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  ORG_ROLES,
  SUBSCRIPTION_ROLES,
  TEAM_MANAGER_ROLES,
  hasBillingPermission,
  parseRoles,
  type OrgRole,
} from "@/lib/roles";

export type Viewer = {
  user: { id: string; name: string; email: string; image: string | null; phone: string | null };
  organization: { id: string; name: string } | null;
  role: OrgRole | null;
  /** Every role the user holds in this org, e.g. ["admin"]. */
  roles: string[];
  canManageTeam: boolean;
  canManageSubscription: boolean;
  /** Can open the Business Billing module (/billing). */
  canUseBilling: boolean;
};

/**
 * The signed-in user with their role in the active organization (or their
 * first one), using the same rules as lib/access.ts. Null when logged out.
 * Reads the request, so call it inside a <Suspense> boundary.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const memberships = await db
    .select({
      organizationId: member.organizationId,
      role: member.role,
      organizationName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(member.createdAt));

  const activeId = session.session.activeOrganizationId;
  const current = memberships.find((m) => m.organizationId === activeId) ?? memberships[0];
  const roles = current ? parseRoles(current.role) : [];
  const has = (allowed: readonly OrgRole[]) => roles.some((r) => allowed.includes(r as OrgRole));

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
      phone: session.user.phone ?? null,
    },
    organization: current ? { id: current.organizationId, name: current.organizationName } : null,
    role: ORG_ROLES.find((r) => roles.includes(r)) ?? null,
    roles,
    canManageTeam: has(TEAM_MANAGER_ROLES),
    canManageSubscription: has(SUBSCRIPTION_ROLES),
    canUseBilling: hasBillingPermission(roles, "billing.view"),
  };
});

/** The signed-in user, or a redirect to /login that comes back to `returnTo`. */
export async function requireViewer(returnTo: string) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return viewer;
}
