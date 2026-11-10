import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { invitation } from "@/db/schema";
import { TEAM_MANAGER_ROLES, canManageRole, requireOrgRole, route } from "@/lib/access";
import { auth } from "@/lib/auth";

// DELETE /api/team/invitations/:id cancels a pending invite
// (owner/admin: any invite; manager: only invites for members).
export const DELETE = route(
  async (_request: Request, ctx: RouteContext<"/api/team/invitations/[id]">) => {
    const { id } = await ctx.params;
    const { organizationId, headers, roles } = await requireOrgRole(TEAM_MANAGER_ROLES);

    const [invite] = await db
      .select({ status: invitation.status, role: invitation.role })
      .from(invitation)
      .where(and(eq(invitation.id, id), eq(invitation.organizationId, organizationId)))
      .limit(1);
    if (!invite) throw new APIError("NOT_FOUND", { message: "Invite not found." });
    if (invite.status !== "pending") {
      throw new APIError("BAD_REQUEST", { message: `This invite is already ${invite.status}.` });
    }
    if (!canManageRole(roles, invite.role ?? "member")) {
      throw new APIError("FORBIDDEN", {
        code: "ROLE_NOT_ALLOWED",
        message: "Managers can only cancel invites for employees.",
      });
    }

    await auth.api.cancelInvitation({ headers, body: { invitationId: id } });
    return new Response(null, { status: 204 });
  },
);
