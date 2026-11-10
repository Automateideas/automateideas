import { requireSession, route } from "@/lib/access";
import { auth } from "@/lib/auth";

// POST /api/invitations/:id/accept joins the org with the invite's role.
// The plugin rejects it unless the signed-in email matches the invite, the
// invite is pending and unexpired, and the org still has a free seat.
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/invitations/[id]/accept">) => {
    const { id } = await ctx.params;
    const { headers } = await requireSession();

    const result = await auth.api.acceptInvitation({ headers, body: { invitationId: id } });
    return Response.json({
      organizationId: result?.member.organizationId,
      role: result?.member.role,
    });
  },
);
