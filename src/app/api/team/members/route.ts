import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { member, user } from "@/db/schema";
import { requireOrgRole, route } from "@/lib/access";
import { ORG_ROLES } from "@/lib/roles";

// GET /api/team/members: the team directory, for every member of the org
// (employees included). Only people who have joined: no invites, no seats.
export const GET = route(async () => {
  const { organizationId } = await requireOrgRole(ORG_ROLES);

  const members = await db
    .select({
      id: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt));

  return Response.json({ members });
});
