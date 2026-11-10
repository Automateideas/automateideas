import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { member } from "@/db/schema";
import { TEAM_MANAGER_ROLES, canManageRole, parseRoles, requireOrgRole, route } from "@/lib/access";
import { auth } from "@/lib/auth";

// DELETE /api/team/members/:id removes a member
// (owner/admin: admins, managers and members; manager: members only).
// The owner can't be removed, and nobody removes themselves here.
export const DELETE = route(
  async (_request: Request, ctx: RouteContext<"/api/team/members/[id]">) => {
    const { id } = await ctx.params;
    const { organizationId, memberId, headers, roles } = await requireOrgRole(TEAM_MANAGER_ROLES);

    const [target] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.id, id), eq(member.organizationId, organizationId)))
      .limit(1);
    if (!target) throw new APIError("NOT_FOUND", { message: "Member not found." });
    if (id === memberId) {
      throw new APIError("BAD_REQUEST", { message: "You can't remove yourself from the team." });
    }
    if (parseRoles(target.role).includes("owner")) {
      throw new APIError("FORBIDDEN", { message: "The organization owner can't be removed." });
    }
    if (!canManageRole(roles, target.role)) {
      throw new APIError("FORBIDDEN", {
        code: "ROLE_NOT_ALLOWED",
        message: "Managers can only remove employees.",
      });
    }

    await auth.api.removeMember({ headers, body: { memberIdOrEmail: id, organizationId } });
    return new Response(null, { status: 204 });
  },
);
