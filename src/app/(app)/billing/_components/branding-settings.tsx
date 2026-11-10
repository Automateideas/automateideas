"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, useApiQuery } from "@/lib/api";

import { LoadError } from "../../_components/page-parts";
import { ReadOnlyNote } from "./records-ui";
import { SettingsNav } from "./tax-settings";

type Branding = {
  configured: boolean;
  hasLogo: boolean;
  showLogo: boolean;
  logoOnDocuments: boolean;
  logoUrl: string | null;
  uploadsEnabled: boolean;
  canEdit: boolean;
  readOnlyReason: string | null;
};

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * /billing/settings/branding: the company logo (the same workspace logo used
 * everywhere, via /api/organization/logo) and whether documents show it.
 */
export function BrandingSettingsView() {
  const query = useApiQuery<Branding>("/api/business-billing/branding");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SettingsNav />
      {query.status === "loading" ? (
        <Skeleton className="h-72 rounded-xl" aria-label="Loading" />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : (
        <BrandingForm data={query.data} reload={query.reload} />
      )}
    </div>
  );
}

function BrandingForm({ data, reload }: { data: Branding; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Bumped after each upload so the browser fetches the new image.
  const [version, setVersion] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const readOnly = !data.canEdit;

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        setVersion((v) => v + 1);
        reload();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      }
    });

  function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("Use an image under 2 MB.");
    const body = new FormData();
    body.set("file", file);
    run(async () => {
      const res = await fetch("/api/organization/logo", { method: "POST", body });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new ApiError(b?.error?.code ?? String(res.status), b?.error?.message ?? "Upload failed.", res.status);
      }
    });
    if (input.current) input.current.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo on documents</CardTitle>
        <CardDescription>Shown at the top of invoices, quotations, sales orders, credit notes and debit notes, on screen and when printed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {readOnly ? <ReadOnlyNote reason={data.readOnlyReason} fallback="Only owners and admins can change branding." /> : null}
        {!data.configured ? (
          <Alert>
            <AlertDescription>Save your company details first (Billing → Settings → Company).</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-48 items-center justify-center rounded-lg border bg-white p-2">
            {data.logoUrl ? (
              // Signed storage URL behind a redirect; next/image can't optimise it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${data.logoUrl}?v=${version}`} alt="Your company logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <ImageIcon className="size-5" aria-hidden="true" />
                No logo yet
              </span>
            )}
          </div>
          {readOnly ? null : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={input}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  id="logo-file"
                  onChange={(e) => upload(e.target.files?.[0])}
                  disabled={pending || !data.uploadsEnabled}
                />
                <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={pending || !data.uploadsEnabled}>
                  {pending ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
                  {data.hasLogo ? "Replace logo" : "Upload logo"}
                </Button>
                {data.hasLogo ? (
                  <Button type="button" variant="ghost" onClick={() => run(() => api("/api/organization/logo", { method: "DELETE" }))} disabled={pending}>
                    <Trash2Icon data-icon="inline-start" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.uploadsEnabled ? "PNG, JPG, SVG or WebP, up to 2 MB. A wide logo on a transparent background prints best." : "File storage isn't set up on this server, so logos can't be uploaded yet."}
              </p>
            </div>
          )}
        </div>

        <Field orientation="horizontal">
          <Checkbox
            id="show-logo"
            checked={data.showLogo}
            disabled={readOnly || pending || !data.configured}
            onCheckedChange={(c) => run(() => api("/api/business-billing/branding", { method: "PUT", json: { showLogo: c === true } }))}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="show-logo" className="font-normal">
              Show the logo on documents
            </FieldLabel>
            <FieldDescription>
              {data.showLogo && !data.hasLogo ? "Upload a logo to see it on documents." : "Turn off to show only your company name."}
            </FieldDescription>
          </div>
        </Field>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
