"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, Building2Icon, UploadIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { countries, formatPhone, type Country } from "@/lib/countries";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

import { GoogleButton } from "../_components/google-button";
import { PasswordInput } from "../_components/password-input";
import { PhoneField } from "@/components/phone-field";
import { isEmail } from "../_lib/validate";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = "image/png,image/jpeg,image/svg+xml,image/webp";

type Values = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneCountry: Country | null;
  phone: string;
  companyName: string;
  country: Country | null;
  agreed: boolean;
};

type Errors = Partial<Record<keyof Values, string>>;

const initialValues: Values = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phoneCountry: null,
  phone: "",
  companyName: "",
  country: null,
  agreed: false,
};

function validateStep1(v: Values): Errors {
  const errors: Errors = {};
  if (!v.firstName.trim()) errors.firstName = "Enter your first name.";
  if (!v.lastName.trim()) errors.lastName = "Enter your last name.";
  if (!isEmail(v.email)) errors.email = "Enter a valid email address.";
  if (v.password.length < 8) errors.password = "Use at least 8 characters.";
  if (!v.phoneCountry) errors.phoneCountry = "Choose a country code.";
  const digits = v.phone.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15)
    errors.phone = "Enter a valid contact number.";
  return errors;
}

function validateStep2(v: Values): Errors {
  const errors: Errors = {};
  if (!v.companyName.trim()) errors.companyName = "Enter your company name.";
  if (!v.country) errors.country = "Choose a country.";
  if (!v.agreed)
    errors.agreed = "Agree to the Terms and Privacy Policy to continue.";
  return errors;
}

// Focus the first invalid control so keyboard and screen-reader users land on it.
function focusFirstError(errors: Errors) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  document
    .querySelector<HTMLElement>(
      `[data-field="${first}"] input, [data-field="${first}"] button`,
    )
    ?.focus();
}

const SIGNUP_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: "An account with this email already exists. Log in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Log in instead.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
  INVALID_EMAIL: "Enter a valid email address.",
};

async function uploadLogo(file: File) {
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/api/organization/logo", { method: "POST", body });
    if (!res.ok) console.warn("Logo upload failed", res.status, await res.text());
  } catch (error) {
    console.warn("Logo upload failed", error);
  }
}

export function SignupForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<Values>(initialValues);
  const [submitted, setSubmitted] = useState({ 1: false, 2: false });
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Release the preview URL when it's replaced or the form unmounts.
  useEffect(() => {
    if (!logo) return;
    return () => URL.revokeObjectURL(logo.url);
  }, [logo]);

  const errors: Errors = {
    ...(submitted[1] ? validateStep1(values) : {}),
    ...(submitted[2] ? validateStep2(values) : {}),
  };

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onPhoneCountryChange(c: Country | null) {
    // Pre-fill the company country from the phone code; the user can still change it.
    setValues((prev) => ({
      ...prev,
      phoneCountry: c,
      country: prev.country ?? c,
    }));
  }

  function onNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted((s) => ({ ...s, 1: true }));
    const found = validateStep1(values);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0 });
  }

  function onRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted((s) => ({ ...s, 2: true }));
    const found = validateStep2(values);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }
    setFormError(null);
    startTransition(async () => {
      // The backend names the new organization from `companyName` (see lib/auth.ts).
      // TODO(backend): country has no backend field yet, so it isn't sent.
      const { error } = await authClient.signUp.email({
        name: `${values.firstName.trim()} ${values.lastName.trim()}`,
        email: values.email.trim(),
        password: values.password,
        phone: formatPhone(values.phoneCountry, values.phone),
        companyName: values.companyName.trim(),
      } as Parameters<typeof authClient.signUp.email>[0]);
      if (error) {
        setFormError(
          (error.code && SIGNUP_ERRORS[error.code]) ?? error.message ?? "Couldn't create your account. Try again.",
        );
        return;
      }
      // The account and workspace exist now, so the logo can go to S3.
      // A failed upload doesn't undo the sign-up; the logo can be added later.
      if (logo) await uploadLogo(logo.file);
      router.push("/dashboard");
      router.refresh();
    });
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.split(",").includes(file.type)) {
      setLogoError("Use a PNG, JPG, SVG or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Use an image under 2 MB.");
      return;
    }
    setLogoError(null);
    setLogo({ file, url: URL.createObjectURL(file) });
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator step={step} />

      {step === 1 ? (
        <form noValidate onSubmit={onNext}>
          <FieldGroup>
            <GoogleButton label="Sign up with Google" />
            <FieldSeparator>or sign up with email</FieldSeparator>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.firstName} data-field="firstName">
                <FieldLabel htmlFor="first-name">First name</FieldLabel>
                <Input
                  id="first-name"
                  autoComplete="given-name"
                  value={values.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  aria-invalid={!!errors.firstName}
                />
                <FieldError>{errors.firstName}</FieldError>
              </Field>
              <Field data-invalid={!!errors.lastName} data-field="lastName">
                <FieldLabel htmlFor="last-name">Last name</FieldLabel>
                <Input
                  id="last-name"
                  autoComplete="family-name"
                  value={values.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  aria-invalid={!!errors.lastName}
                />
                <FieldError>{errors.lastName}</FieldError>
              </Field>
            </div>

            <Field data-invalid={!!errors.email} data-field="email">
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                aria-invalid={!!errors.email}
              />
              {errors.email ? (
                <FieldError>{errors.email}</FieldError>
              ) : (
                <FieldDescription>
                  You&apos;ll use this to log in.
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={!!errors.password} data-field="password">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(e) => set("password", e.target.value)}
                aria-invalid={!!errors.password}
              />
              {errors.password ? (
                <FieldError>{errors.password}</FieldError>
              ) : (
                <FieldDescription>At least 8 characters.</FieldDescription>
              )}
            </Field>

            <PhoneField
              id="phone"
              country={values.phoneCountry}
              onCountryChange={onPhoneCountryChange}
              number={values.phone}
              onNumberChange={(n) => set("phone", n)}
              countryError={errors.phoneCountry}
              numberError={errors.phone}
            />

            <Button type="submit" size="lg">
              Next
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <form noValidate onSubmit={onRegister}>
          <FieldGroup>
            <Field data-invalid={!!errors.companyName} data-field="companyName">
              <FieldLabel htmlFor="company-name">Company name</FieldLabel>
              <Input
                id="company-name"
                autoComplete="organization"
                placeholder="e.g. Automate Ideas"
                value={values.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                aria-invalid={!!errors.companyName}
                autoFocus
              />
              <FieldError>{errors.companyName}</FieldError>
            </Field>

            <Field data-invalid={!!logoError}>
              <FieldLabel htmlFor="company-logo">
                Company logo{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                  {logo ? (
                    // Blob preview of a local file; next/image doesn't apply here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo.url}
                      alt="Company logo preview"
                      className="size-full object-contain"
                    />
                  ) : (
                    <Building2Icon aria-hidden="true" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <UploadIcon data-icon="inline-start" />
                      {logo ? "Replace" : "Upload logo"}
                    </Button>
                    {logo ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogo(null)}
                      >
                        <XIcon data-icon="inline-start" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {logo
                      ? logo.file.name
                      : "PNG, JPG, SVG or WebP, up to 2 MB."}
                  </p>
                </div>
              </div>
              <input
                ref={logoInputRef}
                id="company-logo"
                type="file"
                accept={LOGO_TYPES}
                onChange={onLogoChange}
                className="sr-only"
                tabIndex={-1}
              />
              <FieldError>{logoError}</FieldError>
            </Field>

            <Field data-invalid={!!errors.country} data-field="country">
              <FieldLabel htmlFor="country">Country</FieldLabel>
              <Combobox
                items={countries}
                value={values.country}
                onValueChange={(c) => set("country", c)}
                itemToStringLabel={(c: Country) => c.label}
                isItemEqualToValue={(a: Country, b: Country) =>
                  a.code === b.code
                }
                autoHighlight
              >
                <ComboboxInput
                  id="country"
                  placeholder="Search countries"
                  className="w-full"
                  aria-invalid={!!errors.country}
                />
                <ComboboxContent>
                  <ComboboxEmpty>No country matches that search.</ComboboxEmpty>
                  <ComboboxList>
                    {(c: Country) => (
                      <ComboboxItem key={c.code} value={c}>
                        {c.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldError>{errors.country}</FieldError>
            </Field>

            <Field
              orientation="horizontal"
              data-invalid={!!errors.agreed}
              data-field="agreed"
            >
              <Checkbox
                id="terms"
                checked={values.agreed}
                onCheckedChange={(checked) => set("agreed", checked === true)}
                aria-invalid={!!errors.agreed}
              />
              <FieldLabel htmlFor="terms" className="font-normal">
                <span>
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    className="font-medium underline underline-offset-4 hover:text-primary"
                  >
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="font-medium underline underline-offset-4 hover:text-primary"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </FieldLabel>
            </Field>
            {errors.agreed ? (
              <FieldError className="-mt-3">{errors.agreed}</FieldError>
            ) : null}

            {formError ? (
              <FieldError>
                {formError}
                {formError.includes("Log in instead") ? (
                  <>
                    {" "}
                    <Link href="/login" className="font-medium underline underline-offset-4">
                      Go to log in
                    </Link>
                  </>
                ) : null}
              </FieldError>
            ) : null}

            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setStep(1)}
                disabled={pending}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Register
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  const label = step === 1 ? "Your details" : "Company details";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Step {step} of 2:{" "}
        <span className="font-medium text-foreground">{label}</span>
      </p>
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        {[1, 2].map((n) => (
          <div
            key={n}
            className={cn(
              "h-1 rounded-full",
              n <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}
