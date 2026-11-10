import { APIError } from "better-auth/api";

import { isEmail } from "@/app/(auth)/_lib/validate";
import { TEAM_MANAGER_ROLES, canManageRole, readJson, requireOrgRole, route } from "@/lib/access";
import { auth } from "@/lib/auth";
import { INVITABLE_ROLES, ROLE_LABELS, type InvitableRole } from "@/lib/roles";

// POST /api/team/invitations { email, role: "admin" | "manager" | "member" }
// (owner/admin: any of those roles; manager: member only).
// The org plugin checks the inviter's permission and sends the email; the
// beforeCreateInvitation hook in lib/auth.ts enforces the seat limit.
export const POST = route(async (request: Request) => {
  const { organizationId, headers, roles } = await requireOrgRole(TEAM_MANAGER_ROLES);
  const body = await readJson<{ email: string; role: string }>(request);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isEmail(email)) throw new APIError("BAD_REQUEST", { message: "Enter a valid email address." });
  if (!INVITABLE_ROLES.includes(body.role as InvitableRole)) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_ROLE",
      message: "Role must be admin, manager or member.",
    });
  }
  const role = body.role as InvitableRole;
  if (!canManageRole(roles, role)) {
    throw new APIError("FORBIDDEN", {
      code: "ROLE_NOT_ALLOWED",
      message: `Managers can only invite ${ROLE_LABELS.member.toLowerCase()}s.`,
    });
  }

  const invite = await auth.api.createInvitation({
    headers,
    body: { email, role, organizationId },
  });

  return Response.json(
    { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
    { status: 201 },
  );
});
