"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PhoneField, phoneError } from "@/components/phone-field";
import { authClient } from "@/lib/auth-client";
import { formatPhone, parsePhone, type Country } from "@/lib/countries";

import { PageHeader } from "../_components/page-parts";

export function ProfileForm({
  name: savedName,
  email,
  phone: savedPhone,
  organizationName,
  roleName,
}: {
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  roleName: string | null;
}) {
  const router = useRouter();
  const initialPhone = parsePhone(savedPhone);

  const [name, setName] = useState(savedName);
  const [country, setCountry] = useState<Country | null>(initialPhone.country);
  const [number, setNumber] = useState(initialPhone.number);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const phoneProblem = phoneError(country, number);
  const nameError = submitted && !name.trim() ? "Enter your name." : null;
  const countryError = submitted && !country ? phoneProblem : null;
  const numberError = submitted && country ? phoneProblem : null;

  const nextPhone = formatPhone(country, number);
  const changed = name.trim() !== savedName || nextPhone !== (savedPhone ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setSaved(false);
    if (!name.trim() || phoneProblem) return;
    startTransition(async () => {
      const { error } = await authClient.updateUser({
        name: name.trim(),
        phone: nextPhone,
      } as Parameters<typeof authClient.updateUser>[0]);
      if (error) {
        setFormError(error.message ?? "Couldn't save your profile. Try again.");
        return;
      }
      setSaved(true);
      setSubmitted(false);
      // Refresh server-rendered parts (sidebar name, dashboard reminder).
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Your profile, as your team sees it." />

      <form noValidate onSubmit={onSubmit} className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Your name, email and contact number show on the Team page for everyone in your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!nameError}>
                <FieldLabel htmlFor="profile-name">Full name</FieldLabel>
                <Input
                  id="profile-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                  aria-invalid={!!nameError}
                />
                <FieldError>{nameError}</FieldError>
              </Field>

              <PhoneField
                id="profile-phone"
                country={country}
                onCountryChange={(c) => {
                  setCountry(c);
                  setSaved(false);
                }}
                number={number}
                onNumberChange={(n) => {
                  setNumber(n);
                  setSaved(false);
                }}
                countryError={countryError}
                numberError={numberError}
              />

              <Field data-disabled>
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <Input id="profile-email" type="email" value={email} disabled readOnly />
                <FieldDescription>You log in with this email, so it can&apos;t be changed here.</FieldDescription>
              </Field>

              {organizationName ? (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Workspace</dt>
                    <dd className="font-medium">{organizationName}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Your role</dt>
                    <dd className="font-medium">{roleName}</dd>
                  </div>
                </dl>
              ) : null}
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={pending || !changed}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save changes
            </Button>
            {saved ? (
              <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
                <CircleCheckIcon className="size-4" aria-hidden="true" />
                Saved
              </p>
            ) : null}
            {formError ? <FieldError>{formError}</FieldError> : null}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading settings">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-96 max-w-2xl rounded-xl" />
    </div>
  );
}
