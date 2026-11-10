import { requireSession, route } from "@/lib/access";
import { auth } from "@/lib/auth";

// GET /api/invitations/:id: invite details for the /accept-invite/[id] page.
// Any signed-in user, but the plugin only returns it when the invite's email
// matches theirs and it's still pending and unexpired.
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/invitations/[id]">) => {
    const { id } = await ctx.params;
    const { headers } = await requireSession();

    const invite = await auth.api.getInvitation({ headers, query: { id } });
    return Response.json({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      organizationName: invite.organizationName,
      inviterEmail: invite.inviterEmail,
    });
  },
);
