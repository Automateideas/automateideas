import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import {
  haveIBeenPwned,
  lastLoginMethod,
  oneTap,
  organization,
} from "better-auth/plugins";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { TRIAL_SEATS, trialEndDate } from "@/lib/subscription-billing/plan";
import { assertCanInvite, getSeatUsage } from "@/lib/subscription-billing/seats";
import { sendInvitationEmail, sendVerificationEmail } from "@/lib/email";
import { assertOrgDeletable } from "@/lib/financial-records";
import { INVITABLE_ROLES, ac, orgRoles } from "@/lib/roles";

const INVITE_EXPIRY_SECONDS = 72 * 60 * 60;

// Invites may grant these roles only; "owner" comes from creating the org.
const INVITABLE = new Set<string>(INVITABLE_ROLES);

// Plugin endpoints that would bypass the role and seat rules in /api/team and
// /api/invitations. They stay callable from the server through auth.api.*.
const DISABLED_PATHS = [
  "/organization/create",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/accept-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/add-member",
  "/organization/list-members",
  "/organization/list-invitations",
  "/organization/get-full-organization",
  // Deleting an organization would cascade through its data; financial
  // records must survive (lib/financial-records.ts).
  "/organization/delete",
];

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomBytes(3).toString("hex")}`;
}

async function hasPendingInvite(email: string) {
  const rows = await db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.email, email.toLowerCase()),
        eq(schema.invitation.status, "pending"),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// A user belongs to exactly one organization. Checked here before every way
// of joining one, and backed by a unique index on member.user_id.
const ONE_ORG_MESSAGE = "A user can only belong to one organization.";

async function userHasOrg(userId: string) {
  const rows = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows.length > 0;
}

async function emailHasOrg(email: string) {
  const rows = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.user.email, email.toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

async function assertUserHasNoOrg(userId: string) {
  if (await userHasOrg(userId)) {
    throw new APIError("FORBIDDEN", {
      code: "ALREADY_IN_ORGANIZATION",
      message: `You already belong to an organization. ${ONE_ORG_MESSAGE}`,
    });
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  // Verification emails are sent on request only (the accept-invite page asks
  // for one), so ordinary sign-up and login work as before. Accepting an
  // invite requires a verified email: see requireEmailVerificationOnInvitation.
  // Google sign-ins arrive already verified.
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, name: user.name, url });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  disabledPaths: DISABLED_PATHS,
  user: {
    additionalFields: {
      // Contact number with country code, e.g. "+91 98765 43210". Set at sign-up.
      phone: { type: "string", required: false, input: true },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Every new sign-up (email or Google) becomes the owner of a new org,
        // unless they were invited: they join the inviting org instead.
        after: async (user, ctx) => {
          if (await hasPendingInvite(user.email)) return;

          const body = (ctx?.body ?? {}) as { companyName?: unknown };
          const companyName =
            typeof body.companyName === "string"
              ? body.companyName.trim().slice(0, 100)
              : "";
          const name =
            companyName || `${user.name.split(" ")[0] || "My"}'s workspace`;

          try {
            await auth.api.createOrganization({
              body: { name, slug: slugify(name), userId: user.id },
            });
          } catch (error) {
            // Don't fail the sign-up; the user can still log in and the APIs
            // answer NO_ORGANIZATION until an org exists.
            console.error("Auto-creating organization failed", {
              userId: user.id,
              error,
            });
          }
        },
      },
    },
  },
  plugins: [
    organization({
      // owner, admin, manager, member: see lib/roles.ts.
      ac,
      roles: orgRoles,
      creatorRole: "owner",
      // Creating an org counts the user's memberships, so this blocks a second one.
      organizationLimit: 1,
      invitationExpiresIn: INVITE_EXPIRY_SECONDS,
      // Viewing or accepting an invite needs a verified email that matches the
      // invite's. Otherwise someone could sign up with the invitee's address
      // before they do and take the invite.
      requireEmailVerificationOnInvitation: true,
      // Checked by the plugin when an invite is accepted.
      membershipLimit: async (_user, org) =>
        (await getSeatUsage(org.id)).seatLimit,
      sendInvitationEmail: async (data) => {
        await sendInvitationEmail({
          to: data.email,
          invitationId: data.id,
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name,
          role: data.role,
          expiresAt: new Date(data.invitation.expiresAt),
        });
      },
      organizationHooks: {
        afterCreateOrganization: async ({ organization: org }) => {
          await db
            .update(schema.organization)
            .set({ trialEndsAt: trialEndDate() })
            .where(eq(schema.organization.id, org.id));
        },
        beforeCreateInvitation: async ({ invitation, organization: org }) => {
          const roles = String(invitation.role)
            .split(",")
            .map((r) => r.trim());
          if (!roles.every((r) => INVITABLE.has(r))) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_ROLE",
              message:
                "You can only invite users with the roles: admin, manager, or member.",
            });
          }
          if (await emailHasOrg(invitation.email)) {
            throw new APIError("BAD_REQUEST", {
              code: "ALREADY_IN_ORGANIZATION",
              message: `${invitation.email} already belongs to an organization. ${ONE_ORG_MESSAGE}`,
            });
          }
          await assertCanInvite(org.id);
        },
        beforeAcceptInvitation: async ({ user }) => {
          await assertUserHasNoOrg(user.id);
        },
        beforeAddMember: async ({ user }) => {
          await assertUserHasNoOrg(user.id);
        },
        // Server-side deletions too: refused while financial records exist.
        beforeDeleteOrganization: async ({ organization: org }) => {
          await assertOrgDeletable(org.id);
        },
      },
      schema: {
        organization: {
          additionalFields: {
            seatLimit: {
              type: "number",
              required: true,
              defaultValue: TRIAL_SEATS,
              input: false,
            },
            planStatus: {
              type: "string",
              required: true,
              defaultValue: "trialing",
              input: false,
            },
            subscriptionId: { type: "string", required: false, input: false },
            trialEndsAt: { type: "date", required: false, input: false },
            planId: { type: "string", required: true, defaultValue: "starter", input: false },
            billingCycle: { type: "string", required: true, defaultValue: "monthly", input: false },
            currentPeriodEnd: { type: "date", required: false, input: false },
            cancelAtPeriodEnd: { type: "boolean", required: true, defaultValue: false, input: false },
          },
        },
      },
    }),

    nextCookies(),
    lastLoginMethod(),
    haveIBeenPwned({
      enabled: process.env.NODE_ENV === "production",
      customPasswordCompromisedMessage: "Please choose a more secure password.",
    }),
    oneTap({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
    }),
  ],
});
