"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { GoogleButton } from "../_components/google-button";
import { PasswordInput } from "../_components/password-input";
import { isEmail } from "../_lib/validate";

// TODO(backend): replace with real auth calls.
const fakeRequest = () => new Promise<void>((resolve) => setTimeout(resolve, 900));

const RESEND_SECONDS = 30;

export function LoginForm() {
  return (
    <FieldGroup>
      <GoogleButton label="Continue with Google" />
      <FieldSeparator>or log in with email</FieldSeparator>

      <Tabs defaultValue="password">
        <TabsList className="w-full rounded-xl group-data-horizontal/tabs:h-11">
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="otp">Email code</TabsTrigger>
        </TabsList>
        <TabsContent value="password" className="pt-4">
          <PasswordLogin />
        </TabsContent>
        <TabsContent value="otp" className="pt-4">
          <OtpLogin />
        </TabsContent>
      </Tabs>
    </FieldGroup>
  );
}

function PasswordLogin() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const loginIdError = submitted && !loginId.trim() ? "Enter your email or login ID." : null;
  const passwordError = submitted && !password ? "Enter your password." : null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (!loginId.trim() || !password) return;
    startTransition(fakeRequest);
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <Field data-invalid={!!loginIdError}>
          <FieldLabel htmlFor="login-id">Email or login ID</FieldLabel>
          <Input
            id="login-id"
            autoComplete="username"
            placeholder="you@company.com"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            aria-invalid={!!loginIdError}
          />
          <FieldError>{loginIdError}</FieldError>
        </Field>

        <Field data-invalid={!!passwordError}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="login-password">Password</FieldLabel>
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline hover:underline-offset-4">
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

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Log in
        </Button>
      </FieldGroup>
    </form>
  );
}

function OtpLogin() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();

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
    startTransition(fakeRequest);
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
