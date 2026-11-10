import { and, asc, desc, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { invitation, member, user } from "@/db/schema";
import { TEAM_MANAGER_ROLES, requireOrgRole, route } from "@/lib/access";
import { getSeatUsage } from "@/lib/subscription-billing/seats";

// GET /api/team: members, pending invites and seat usage (owner/admin only).
export const GET = route(async () => {
  const { organizationId } = await requireOrgRole(TEAM_MANAGER_ROLES);

  const [members, invitations, seats] = await Promise.all([
    db
      .select({
        id: member.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        image: user.image,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(member.createdAt)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        invitedAt: invitation.createdAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invitation.createdAt)),
    getSeatUsage(organizationId),
  ]);

  return Response.json({
    members,
    invitations,
    seats: {
      limit: seats.seatLimit,
      used: seats.used,
      members: seats.members,
      pendingInvites: seats.pendingInvites,
    },
  });
});
