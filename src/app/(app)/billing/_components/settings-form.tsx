"use client";

import { useState, useTransition } from "react";
import { CircleCheckIcon } from "lucide-react";

import { PhoneField, cleanPhone } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, useApiQuery } from "@/lib/api";
import {
  type BillingSettingsErrors,
  type BillingSettingsValues,
  validateBillingSettings,
} from "@/lib/business-billing/settings-validation";
import { type Country, countries, formatPhone, parsePhone } from "@/lib/countries";

import { LoadError } from "../../_components/page-parts";

type SettingsResponse = BillingSettingsValues & {
  configured: boolean;
  canEdit: boolean;
  readOnlyReason?: string | null;
  updatedAt: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, i) => ({ value: i + 1, label }));
type Month = (typeof MONTHS)[number];

// Form state: every text field is a string; the API gets nulls for blanks.
type FormState = {
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  email: string;
  phoneCountry: Country | null;
  phoneNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: Country | null;
  financialYearStartMonth: number;
  invoicePrefix: string;
};

function toForm(s: SettingsResponse): FormState {
  const phone = parsePhone(s.phone);
  return {
    legalName: s.legalName ?? "",
    tradeName: s.tradeName ?? "",
    gstin: s.gstin ?? "",
    pan: s.pan ?? "",
    email: s.email ?? "",
    phoneCountry: phone.country,
    phoneNumber: phone.number,
    addressLine1: s.addressLine1 ?? "",
    addressLine2: s.addressLine2 ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    postalCode: s.postalCode ?? "",
    country: countries.find((c) => c.code === s.countryCode) ?? null,
    financialYearStartMonth: s.financialYearStartMonth,
    invoicePrefix: s.invoicePrefix,
  };
}

function toPayload(f: FormState) {
  return {
    legalName: f.legalName,
    tradeName: f.tradeName,
    gstin: f.gstin,
    pan: f.pan,
    email: f.email,
    // Blank number = no phone; otherwise "+91 98765 43210".
    phone: f.phoneNumber.trim() ? formatPhone(f.phoneCountry, f.phoneNumber) : "",
    addressLine1: f.addressLine1,
    addressLine2: f.addressLine2,
    city: f.city,
    state: f.state,
    postalCode: f.postalCode,
    countryCode: f.country?.code ?? "",
    currency: "INR",
    financialYearStartMonth: f.financialYearStartMonth,
    invoicePrefix: f.invoicePrefix,
  };
}

/** /billing/settings: company details and invoice defaults for this tenant. */
export function BillingSettingsView() {
  const query = useApiQuery<SettingsResponse>("/api/business-billing/settings");

  if (query.status === "loading") return <SettingsSkeleton />;
  if (!query.data) return <LoadError message={query.error.message} onRetry={query.reload} />;
  // Remount after each save so the form starts from what the server stored.
  return <SettingsForm key={query.data.updatedAt ?? "new"} initial={query.data} onSaved={query.reload} />;
}

function SettingsForm({ initial, onSaved }: { initial: SettingsResponse; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [errors, setErrors] = useState<BillingSettingsErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const readOnly = !initial.canEdit;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);

    const payload = toPayload(form);
    const local = validateBillingSettings(payload);
    const phoneMissingCode = form.phoneNumber.trim() && !form.phoneCountry;
    if (!local.ok || phoneMissingCode) {
      const found = { ...(local.ok ? {} : local.errors) };
      if (phoneMissingCode) found.phone = "Choose a country code.";
      setErrors(found);
      document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    setErrors({});

    startTransition(async () => {
      try {
        await api("/api/business-billing/settings", { method: "PUT", json: payload });
        setSaved(true);
        onSaved();
      } catch (err) {
        if (err instanceof ApiError && err.fields) setErrors(err.fields as BillingSettingsErrors);
        setFormError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
      }
    });
  }

  const text = (key: keyof FormState & keyof BillingSettingsErrors, id: string, label: string, props: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as FormState[typeof key])}
        aria-invalid={!!errors[key]}
        disabled={readOnly || pending}
        {...props}
      />
      {errors[key] ? <FieldError>{errors[key]}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-6">
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          {initial.readOnlyReason ?? "Only owners and admins can change these details."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Shown at the top of every invoice and quotation.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {text("legalName", "bb-legal-name", "Registered business name", { autoComplete: "organization" })}
            {text("tradeName", "bb-trade-name", "Trade name (optional)", {}, "If you trade under a different name.")}
            <div className="grid gap-5 sm:grid-cols-2">
              {text("gstin", "bb-gstin", "GSTIN (optional)", {
                maxLength: 15,
                autoCapitalize: "characters",
                spellCheck: false,
                className: "uppercase",
              })}
              {text("pan", "bb-pan", "PAN (optional)", {
                maxLength: 10,
                autoCapitalize: "characters",
                spellCheck: false,
                className: "uppercase",
              })}
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact and address</CardTitle>
          <CardDescription>Where customers can reach you, printed on your invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {text("email", "bb-email", "Billing email (optional)", { type: "email", autoComplete: "email" })}
            <PhoneField
              id="bb-phone"
              label="Phone (optional)"
              country={form.phoneCountry}
              onCountryChange={(c) => set("phoneCountry", c)}
              number={form.phoneNumber}
              onNumberChange={(n) => set("phoneNumber", cleanPhone(n))}
              numberError={errors.phone ?? null}
              disabled={readOnly || pending}
            />
            {text("addressLine1", "bb-address1", "Address line 1", { autoComplete: "address-line1" })}
            {text("addressLine2", "bb-address2", "Address line 2 (optional)", { autoComplete: "address-line2" })}
            <div className="grid gap-5 sm:grid-cols-2">
              {text("city", "bb-city", "City", { autoComplete: "address-level2" })}
              {text("state", "bb-state", "State", { autoComplete: "address-level1" })}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {text("postalCode", "bb-postal", "PIN / postal code", { autoComplete: "postal-code", inputMode: "numeric" })}
              <Field data-invalid={!!errors.countryCode}>
                <FieldLabel htmlFor="bb-country">Country</FieldLabel>
                <Combobox
                  items={countries}
                  value={form.country}
                  onValueChange={(c) => set("country", c)}
                  itemToStringLabel={(c: Country) => c.label}
                  isItemEqualToValue={(a: Country, b: Country) => a.code === b.code}
                  autoHighlight
                  disabled={readOnly || pending}
                >
                  <ComboboxInput
                    id="bb-country"
                    placeholder="Search countries"
                    className="w-full"
                    aria-invalid={!!errors.countryCode}
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
                <FieldError>{errors.countryCode}</FieldError>
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice defaults</CardTitle>
          <CardDescription>Used when invoices and reports are created.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-disabled>
                <FieldLabel htmlFor="bb-currency">Currency</FieldLabel>
                <Input id="bb-currency" value="INR, Indian rupee" disabled readOnly />
                <FieldDescription>Only INR for now.</FieldDescription>
              </Field>
              <Field data-invalid={!!errors.financialYearStartMonth}>
                <FieldLabel htmlFor="bb-fy">Financial year starts in</FieldLabel>
                <Combobox
                  items={MONTHS}
                  value={MONTHS.find((m) => m.value === form.financialYearStartMonth) ?? null}
                  onValueChange={(m: Month | null) => m && set("financialYearStartMonth", m.value)}
                  itemToStringLabel={(m: Month) => m.label}
                  isItemEqualToValue={(a: Month, b: Month) => a.value === b.value}
                  autoHighlight
                  disabled={readOnly || pending}
                >
                  <ComboboxInput id="bb-fy" className="w-full" aria-invalid={!!errors.financialYearStartMonth} />
                  <ComboboxContent>
                    <ComboboxEmpty>No month matches.</ComboboxEmpty>
                    <ComboboxList>
                      {(m: Month) => (
                        <ComboboxItem key={m.value} value={m}>
                          {m.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                {errors.financialYearStartMonth ? (
                  <FieldError>{errors.financialYearStartMonth}</FieldError>
                ) : (
                  <FieldDescription>April for most Indian businesses.</FieldDescription>
                )}
              </Field>
            </div>
            {text(
              "invoicePrefix",
              "bb-prefix",
              "Invoice number prefix",
              { maxLength: 10, spellCheck: false, className: "max-w-40" },
              "Starts every invoice number, e.g. INV- or ACME/.",
            )}
          </FieldGroup>
        </CardContent>
        {readOnly ? null : (
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {initial.configured ? "Save changes" : "Save company details"}
            </Button>
            {saved ? (
              <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
                <CircleCheckIcon className="size-4" aria-hidden="true" />
                Saved
              </p>
            ) : null}
            {formError ? <FieldError>{formError}</FieldError> : null}
          </CardFooter>
        )}
      </Card>
    </form>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex max-w-3xl flex-col gap-6" aria-busy="true" aria-label="Loading company details">
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
