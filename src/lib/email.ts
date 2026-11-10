import { Resend } from "resend";

let client: Resend | null = null;
function resend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set.");
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function appUrl(path: string) {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}

export async function sendInvitationEmail(input: {
  to: string;
  invitationId: string;
  organizationName: string;
  inviterName: string;
  role: string;
  expiresAt: Date;
}) {
  const url = appUrl(`/accept-invite/${input.invitationId}`);

  // No email provider yet: the invite still works; share its link from the Team page.
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[invite] RESEND_API_KEY not set, email not sent. Invite link for ${input.to}: ${url}`);
    return;
  }

  const org = escape(input.organizationName);
  const inviter = escape(input.inviterName);
  const expires = input.expiresAt.toUTCString();

  const { error } = await resend().emails.send({
    from: process.env.EMAIL_FROM ?? "Automate Ideas <onboarding@resend.dev>",
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.organizationName}`,
    text:
      `${input.inviterName} invited you to join ${input.organizationName} as ${input.role}.\n\n` +
      `Accept the invite: ${url}\n\nThis link expires on ${expires}.`,
    html:
      `<p>${inviter} invited you to join <strong>${org}</strong> as ${escape(input.role)}.</p>` +
      `<p><a href="${url}">Accept the invite</a></p>` +
      `<p style="color:#666">This link expires on ${expires}. ` +
      `Log in or sign up with ${escape(input.to)} to accept it.</p>`,
  });
  if (error) throw new Error(`Invite email failed: ${error.message}`);
}

/** Better Auth's email-verification link, e.g. before accepting an invite. */
export async function sendVerificationEmail(input: { to: string; name: string; url: string }) {
  // No email provider: log the link so local testing still works.
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[verify] RESEND_API_KEY not set, email not sent. Verification link for ${input.to}: ${input.url}`);
    return;
  }

  const { error } = await resend().emails.send({
    from: process.env.EMAIL_FROM ?? "Automate Ideas <onboarding@resend.dev>",
    to: input.to,
    subject: "Verify your email for Automate Ideas",
    text:
      `Hi ${input.name},\n\nConfirm this is your email address: ${input.url}\n\n` +
      "The link works for 24 hours. If you didn't ask for this, you can ignore this email.",
    html:
      `<p>Hi ${escape(input.name)},</p>` +
      `<p><a href="${input.url}">Verify your email address</a></p>` +
      `<p style="color:#666">The link works for 24 hours. If you didn't ask for this, you can ignore this email.</p>`,
  });
  if (error) throw new Error(`Verification email failed: ${error.message}`);
}
