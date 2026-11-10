import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { requireOrgRole, route } from "@/lib/access";
import { ORG_ROLES, SUBSCRIPTION_ROLES } from "@/lib/roles";
import { deleteFile, putFile, readImageUpload, signedFileUrl } from "@/lib/storage";

// The workspace's company logo, stored in S3 (lib/storage.ts).
// organization.logo holds the S3 key; the image is read through GET below.

async function currentLogoKey(organizationId: string) {
  const [row] = await db
    .select({ logo: organization.logo })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.logo ?? null;
}

/** Old keys are best-effort cleanup: a failed delete must not fail the request. */
async function removeOld(key: string | null) {
  if (!key) return;
  try {
    await deleteFile(key);
  } catch (error) {
    console.error("Deleting old logo failed", { key, error });
  }
}

// GET /api/organization/logo: any member. Redirects to a short-lived S3 URL,
// so it works as an <img src>. 404 when there's no logo.
export const GET = route(async () => {
  const { organizationId } = await requireOrgRole(ORG_ROLES);
  const key = await currentLogoKey(organizationId);
  if (!key) throw new APIError("NOT_FOUND", { code: "NO_LOGO", message: "No logo uploaded yet." });

  return new Response(null, {
    status: 307,
    headers: { Location: await signedFileUrl(key), "Cache-Control": "private, no-store" },
  });
});

// POST /api/organization/logo (multipart, field "file"): owner or admin.
// PNG, JPG, SVG or WebP up to 2 MB. Replaces the previous logo.
export const POST = route(async (request: Request) => {
  const { organizationId } = await requireOrgRole(SUBSCRIPTION_ROLES);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new APIError("BAD_REQUEST", { message: "Send the image as multipart form data." });
  }
  const image = await readImageUpload(form, "file");

  const key = `orgs/${organizationId}/logo/${randomUUID()}.${image.extension}`;
  await putFile(key, image.bytes, image.contentType);

  const previous = await currentLogoKey(organizationId);
  await db.update(organization).set({ logo: key }).where(eq(organization.id, organizationId));
  await removeOld(previous);

  return Response.json({ logo: { url: "/api/organization/logo" } }, { status: 201 });
});

// DELETE /api/organization/logo: owner or admin.
export const DELETE = route(async () => {
  const { organizationId } = await requireOrgRole(SUBSCRIPTION_ROLES);
  const previous = await currentLogoKey(organizationId);
  await db.update(organization).set({ logo: null }).where(eq(organization.id, organizationId));
  await removeOld(previous);
  return new Response(null, { status: 204 });
});
