"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { countries, type Country } from "@/lib/countries";

// Country-code search matches the country name or the code itself ("ind", "+91", "91").
function matchCountry(c: Country, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return c.label.toLowerCase().includes(q) || c.dialCode.includes(q.replace(/^\+?/, "+"));
}

/** Only digits, spaces and dashes in the local number. */
export const cleanPhone = (value: string) => value.replace(/[^\d\s-]/g, "");

export function phoneError(country: Country | null, number: string) {
  if (!country) return "Choose a country code.";
  const digits = number.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return "Enter a valid contact number.";
  return null;
}

/**
 * "Contact number": country-code picker plus the local number.
 * `data-field` wrappers let forms focus the first invalid control.
 */
export function PhoneField({
  id,
  country,
  onCountryChange,
  number,
  onNumberChange,
  countryError,
  numberError,
  label = "Contact number",
  disabled = false,
}: {
  id: string;
  country: Country | null;
  onCountryChange: (country: Country | null) => void;
  number: string;
  onNumberChange: (number: string) => void;
  countryError?: string | null;
  numberError?: string | null;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Field data-invalid={!!(countryError || numberError)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
        <div data-field="phoneCountry">
          <Combobox
            items={countries}
            value={country}
            onValueChange={onCountryChange}
            itemToStringLabel={(c: Country) => c.dialCode}
            isItemEqualToValue={(a: Country, b: Country) => a.code === b.code}
            filter={matchCountry}
            autoHighlight
            disabled={disabled}
          >
            <ComboboxInput
              aria-label="Country code"
              placeholder="Code"
              className="w-full"
              aria-invalid={!!countryError}
            />
            <ComboboxContent className="w-72">
              <ComboboxEmpty>No country matches that search.</ComboboxEmpty>
              <ComboboxList>
                {(c: Country) => (
                  <ComboboxItem key={c.code} value={c}>
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="text-muted-foreground tabular-nums">{c.dialCode}</span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
        <div data-field="phone">
          <Input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={number}
            onChange={(e) => onNumberChange(cleanPhone(e.target.value))}
            aria-invalid={!!numberError}
            disabled={disabled}
          />
        </div>
      </div>
      <FieldError>{countryError ?? numberError}</FieldError>
    </Field>
  );
}
