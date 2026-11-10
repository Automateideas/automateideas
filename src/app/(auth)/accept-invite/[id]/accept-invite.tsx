"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, ClockAlertIcon, MailCheckIcon, MailWarningIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatPhone, type Country } from "@/lib/countries";
import { roleLabel } from "@/lib/roles";

import { GoogleButton } from "../../_components/google-button";
import { PasswordInput } from "../../_components/password-input";
import { PhoneField, phoneError } from "@/components/phone-field";
import { isEmail } from "../../_lib/validate";
import { PasswordLogin } from "../../login/login-form";

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  organizationName: string;
  inviterEmail: string;
};


export function AcceptInvite({ id }: { id: string }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <AcceptInviteSkeleton />;
  if (!session) return <SignedOut id={id} />;
  // Remount per user so a log-out/log-in reloads the invite for the new account.
  return <SignedIn key={session.user.id} id={id} email={session.user.email} />;
}

/* ---------------- Not signed in: create account, log in, or Google ---------------- */

function SignedOut({ id }: { id: string }) {
  return (
    <>
      <header className="flex flex-col gap-2 text-center lg:text-left">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">You&apos;re invited</h1>
        <p className="text-muted-foreground">
          Use the email address the invite was sent to. Then you can review and accept it.
        </p>
      </header>

      <FieldGroup>
        <GoogleButton label="Continue with Google" callbackPath={`/accept-invite/${id}`} />
        <FieldSeparator>or use email</FieldSeparator>

        <Tabs defaultValue="new">
          <TabsList className="w-full rounded-xl group-data-horizontal/tabs:h-11">
            <TabsTrigger value="new">I&apos;m new here</TabsTrigger>
            <TabsTrigger value="existing">I have an account</TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="pt-4">
            <InviteSignup />
          </TabsContent>
          <TabsContent value="existing" className="pt-4">
            {/* Stays on this page: the session updates and the invite loads. */}
            <PasswordLogin onLoggedIn={() => {}} />
          </TabsContent>
        </Tabs>
      </FieldGroup>
    </>
  );
}

function InviteSignup() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<Country | null>(null);
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const phoneProblem = phoneError(phoneCountry, phone);
  const errors = submitted
    ? {
        firstName: firstName.trim() ? null : "Enter your first name.",
        lastName: lastName.trim() ? null : "Enter your last name.",
        email: isEmail(email) ? null : "Enter the email the invite was sent to.",
        password: password.length >= 8 ? null : "Use at least 8 characters.",
        phoneCountry: phoneCountry ? null : phoneProblem,
        phone: phoneCountry ? phoneProblem : null,
      }
    : { firstName: null, lastName: null, email: null, password: null, phoneCountry: null, phone: null };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!firstName.trim() || !lastName.trim() || !isEmail(email) || password.length < 8 || phoneProblem) return;
    startTransition(async () => {
      // No company name: an invited email joins the inviting org instead of getting its own.
      const { error } = await authClient.signUp.email({
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim(),
        password,
        phone: formatPhone(phoneCountry, phone),
      } as Parameters<typeof authClient.signUp.email>[0]);
      if (error) {
        setFormError(
          error.code?.startsWith("USER_ALREADY_EXISTS")
            ? "You already have an account with this email. Switch to “I have an account” to log in."
            : (error.message ?? "Couldn't create your account. Try again."),
        );
      }
      // On success the session updates and this page shows the invite.
    });
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.firstName}>
            <FieldLabel htmlFor="invite-first-name">First name</FieldLabel>
            <Input
              id="invite-first-name"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              aria-invalid={!!errors.firstName}
            />
            <FieldError>{errors.firstName}</FieldError>
          </Field>
          <Field data-invalid={!!errors.lastName}>
            <FieldLabel htmlFor="invite-last-name">Last name</FieldLabel>
            <Input
              id="invite-last-name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              aria-invalid={!!errors.lastName}
            />
            <FieldError>{errors.lastName}</FieldError>
          </Field>
        </div>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
          />
          <FieldError>{errors.email}</FieldError>
        </Field>
        <PhoneField
          id="invite-phone"
          country={phoneCountry}
          onCountryChange={setPhoneCountry}
          number={phone}
          onNumberChange={setPhone}
          countryError={errors.phoneCountry}
          numberError={errors.phone}
        />
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="invite-password">Set a password</FieldLabel>
          <PasswordInput
            id="invite-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
          />
          <FieldError>{errors.password}</FieldError>
        </Field>
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Create account
        </Button>
      </FieldGroup>
    </form>
  );
}

/* ---------------- Signed in: show the invite and accept it ---------------- */

const ACCEPT_ERRORS: Record<string, string> = {
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
    "This team has no free seats right now. Ask whoever invited you to add seats, then try again.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "This invite was sent to a different email address.",
};

// The API answers these when the signed-in email isn't verified yet.
const VERIFY_EMAIL_CODES = new Set([
  "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION",
  "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
]);

/**
 * Invites need a verified email, so nobody can take one by signing up with
 * the invitee's address first. The link in the email signs them in and
 * brings them back here, where the invite then loads.
 */
function VerifyEmail({ id, email }: { id: string; email: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: `/accept-invite/${id}` });
      if (error) {
        setError(error.message ?? "Couldn't send the email. Try again in a minute.");
        return;
      }
      setSent(true);
    });
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MailCheckIcon />
        </EmptyMedia>
        <EmptyTitle>{sent ? "Check your email" : "Verify your email to see this invite"}</EmptyTitle>
        <EmptyDescription>
          {sent
            ? `We sent a link to ${email}. Open it to confirm your address and come back to this invite. It works for 24 hours.`
            : `To keep invites safe, confirm that ${email} is yours before joining a team.`}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant={sent ? "outline" : "default"} onClick={send} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {sent ? "Send it again" : "Send verification email"}
        </Button>
        {error ? <FieldError>{error}</FieldError> : null}
        <p className="text-sm text-muted-foreground">
          Not you? <SwitchAccountButton variant="link" />
        </p>
      </EmptyContent>
    </Empty>
  );
}

function SignedIn({ id, email }: { id: string; email: string }) {
  const invite = useApiQuery<Invite>(`/api/invitations/${id}`);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function accept() {
    setAcceptError(null);
    startTransition(async () => {
      try {
        const res = await api<{ organizationId?: string }>(`/api/invitations/${id}/accept`, { method: "POST" });
        // Make the joined team the active one, so the app opens in it.
        if (res.organizationId) await authClient.organization.setActive({ organizationId: res.organizationId });
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        const e = err instanceof ApiError ? err : null;
        // Verification lapsed since the page loaded: reload to show the verify step.
        if (e && VERIFY_EMAIL_CODES.has(e.code)) return invite.reload();
        setAcceptError((e && ACCEPT_ERRORS[e.code]) ?? e?.message ?? "Couldn't accept the invite. Try again.");
      }
    });
  }

  if (invite.status === "loading") return <AcceptInviteSkeleton />;

  if (invite.status === "error") {
    const code = invite.error.code;
    if (VERIFY_EMAIL_CODES.has(code)) return <VerifyEmail id={id} email={email} />;
    if (code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION") {
      return (
        <InviteProblem
          icon={<MailWarningIcon />}
          title="This invite is for a different email"
          description={`You're logged in as ${email}, but the invite was sent to another address. Log out, then log in or sign up with the invited email.`}
          action={<SwitchAccountButton />}
        />
      );
    }
    // The API returns the same error for expired, cancelled and already-used invites.
    if (code === "BAD_REQUEST" || code === "INVITATION_NOT_FOUND") {
      return (
        <InviteProblem
          icon={<ClockAlertIcon />}
          title="This invite has expired or is no longer valid"
          description="Invites last 3 days and stop working once they're used or cancelled. Ask the person who invited you to send a new one."
          action={
            <Button variant="outline" render={<Link href="/dashboard" />} nativeButton={false}>
              Go to dashboard
            </Button>
          }
        />
      );
    }
    return (
      <InviteProblem
        icon={<CircleAlertIcon />}
        title="Couldn't load this invite"
        description={invite.error.message}
        action={
          <Button variant="outline" onClick={invite.reload}>
            Try again
          </Button>
        }
      />
    );
  }

  const data = invite.data;
  return (
    <>
      <header className="flex flex-col gap-2 text-center lg:text-left">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Join {data.organizationName}</h1>
        <p className="text-muted-foreground">
          {data.inviterEmail} invited you to join as {/^[AEIOU]/.test(roleLabel(data.role)) ? "an" : "a"}{" "}
          <span className="font-medium text-foreground">{roleLabel(data.role)}</span>.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UsersIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{data.organizationName}</span>
            <span className="truncate text-sm text-muted-foreground">Logged in as {email}</span>
          </div>
        </div>
        <Separator />
        <p className="text-sm text-muted-foreground">
          This invite expires on{" "}
          {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(
            new Date(data.expiresAt),
          )}
          .
        </p>
      </div>

      {acceptError ? <FieldError>{acceptError}</FieldError> : null}

      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={accept} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Accept and join
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Not you? <SwitchAccountButton variant="link" />
        </p>
      </div>
    </>
  );
}

function SwitchAccountButton({ variant = "outline" }: { variant?: "outline" | "link" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      className={variant === "link" ? "h-auto p-0" : undefined}
      disabled={pending}
      onClick={() => startTransition(async () => void (await authClient.signOut()))}
    >
      {pending && variant !== "link" ? <Spinner data-icon="inline-start" /> : null}
      Log out and switch account
    </Button>
  );
}

function InviteProblem({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{action}</EmptyContent>
    </Empty>
  );
}

export function AcceptInviteSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading invite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-11 rounded-lg" />
    </div>
  );
}
