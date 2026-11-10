"use client";

import { useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

import { nextPath } from "../_lib/next-path";

/**
 * Signs in (or signs up) with Google, then returns to `callbackPath`
 * (default: the page the user was heading to, or the dashboard).
 */
export function GoogleButton({ label, callbackPath }: { label: string; callbackPath?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackPath ?? nextPath(),
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setError(error.message ?? "Couldn't start Google sign-in. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={onClick} disabled={pending}>
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Image src="/google.svg" alt="" width={16} height={16} data-icon="inline-start" />
        )}
        {label}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
