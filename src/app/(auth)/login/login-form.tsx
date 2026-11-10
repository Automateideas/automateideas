"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REGEXP_ONLY_DIGITS } from "input-otp";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

import { GoogleButton } from "../_components/google-button";
import { PasswordInput } from "../_components/password-input";
import { nextPath } from "../_lib/next-path";
import { isEmail } from "../_lib/validate";

export function LoginForm() {
  return (
    <FieldGroup>
      <GoogleButton label="Continue with Google" />
      <FieldSeparator>or log in with email</FieldSeparator>
      {/* The "Email code" tab returns when the backend supports email OTP; see OtpLogin below. */}
      <PasswordLogin />
    </FieldGroup>
  );
}

const LOGIN_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check them and try again.",
  EMAIL_NOT_VERIFIED: "Verify your email first. Check your inbox for the link.",
};

/**
 * Email + password login. After success it goes to `?next=` or the dashboard,
 * unless `onLoggedIn` is given (the accept-invite page stays put).
 */
export function PasswordLogin({
  defaultEmail = "",
  onLoggedIn,
}: {
  defaultEmail?: string;
  onLoggedIn?: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const emailError = submitted && !isEmail(email) ? "Enter the email you signed up with." : null;
  const passwordError = submitted && !password ? "Enter your password." : null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!isEmail(email) || !password) return;
    startTransition(async () => {
      const { error } = await authClient.signIn.email({ email: email.trim(), password });
      if (error) {
        setFormError(
          (error.code && LOGIN_ERRORS[error.code]) ?? error.message ?? "Couldn't log you in. Try again.",
        );
        return;
      }
      if (onLoggedIn) {
        onLoggedIn();
      } else {
        router.push(nextPath());
        router.refresh();
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <Field data-invalid={!!emailError}>
          <FieldLabel htmlFor="login-email">Email</FieldLabel>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!emailError}
          />
          <FieldError>{emailError}</FieldError>
        </Field>

        <Field data-invalid={!!passwordError}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="login-password">Password</FieldLabel>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline hover:underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!passwordError}
          />
          <FieldError>{passwordError}</FieldError>
        </Field>

        {formError ? <FieldError>{formError}</FieldError> : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Log in
        </Button>
      </FieldGroup>
    </form>
  );
}

/* ------------------------------------------------------------------------- */
/* Email-code login. Not shown yet: the backend has no email OTP endpoint.    */
/* TODO(backend): enable Better Auth's emailOTP plugin, then render this in a */
/* "Password | Email code" tab inside LoginForm and replace fakeRequest.      */
/* ------------------------------------------------------------------------- */

const fakeRequest = () => new Promise<void>((resolve) => setTimeout(resolve, 900));
const RESEND_SECONDS = 30;

export function OtpLogin() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  function sendCode(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!isEmail(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    startTransition(async () => {
      await fakeRequest();
      setSentTo(email.trim());
      setCode("");
      setSecondsLeft(RESEND_SECONDS);
    });
  }

  function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (code.length !== 6) {
      setCodeError("Enter the 6-digit code.");
      return;
    }
    setCodeError(null);
    startTransition(async () => {
      await fakeRequest();
      router.push(nextPath());
    });
  }

  if (sentTo === null) {
    return (
      <form noValidate onSubmit={sendCode}>
        <FieldGroup>
          <Field data-invalid={!!emailError}>
            <FieldLabel htmlFor="otp-email">Email</FieldLabel>
            <Input
              id="otp-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError}
            />
            {emailError ? (
              <FieldError>{emailError}</FieldError>
            ) : (
              <FieldDescription>We&apos;ll email you a 6-digit code to log in.</FieldDescription>
            )}
          </Field>

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Send code
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={verify}>
      <FieldGroup>
        <Field data-invalid={!!codeError}>
          <FieldLabel htmlFor="otp-code">Code</FieldLabel>
          <FieldDescription>
            Sent to <span className="font-medium text-foreground">{sentTo}</span>.{" "}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-primary"
              onClick={() => setSentTo(null)}
            >
              Change email
            </button>
          </FieldDescription>
          <InputOTP
            id="otp-code"
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            autoComplete="one-time-code"
            value={code}
            onChange={setCode}
            aria-invalid={!!codeError}
            autoFocus
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} aria-invalid={!!codeError} className="size-12 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <FieldError>{codeError}</FieldError>
        </Field>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Verify and log in
        </Button>

        <p className="text-sm text-muted-foreground">
          Didn&apos;t get it?{" "}
          {secondsLeft > 0 ? (
            <span aria-live="polite">Resend in {secondsLeft}s</span>
          ) : (
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              onClick={() => sendCode()}
              disabled={pending}
            >
              Resend code
            </button>
          )}
        </p>
      </FieldGroup>
    </form>
  );
}
