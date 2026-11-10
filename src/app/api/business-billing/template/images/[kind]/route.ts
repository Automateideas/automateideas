import { randomUUID } from "node:crypto";
import { APIError } from "better-auth/api";

import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { type ImageKind, imageKey, setImageKey } from "@/lib/business-billing/template-settings";
import { deleteFile, putFile, readImageUpload, signedFileUrl } from "@/lib/storage";

type Ctx = RouteContext<"/api/business-billing/template/images/[kind]">;

function kindOf(kind: string): ImageKind {
  if (kind !== "signature" && kind !== "stamp") throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Unknown image." });
  return kind;
}

/** Old files are best-effort cleanup: a failed delete must not fail the request. */
async function removeOld(key: string | null) {
  if (!key) return;
  try {
    await deleteFile(key);
  } catch (error) {
    console.error("Deleting old image failed", { key, error });
  }
}

// GET (billing.view): redirects to a short-lived URL of the signature or stamp image.
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const kind = kindOf((await params).kind);
  const { organizationId } = await requireBillingPermission("billing.view");
  const key = await imageKey(organizationId, kind);
  if (!key) throw new APIError("NOT_FOUND", { code: "NO_IMAGE", message: `No ${kind} uploaded yet.` });
  return new Response(null, { status: 307, headers: { Location: await signedFileUrl(key), "Cache-Control": "private, no-store" } });
});

// POST multipart (field "file", billing.settings.manage): PNG or JPG up to 2 MB.
// PDFs can only embed PNG and JPG, so SVG and WebP are refused here.
export const POST = route(async (request: Request, { params }: Ctx) => {
  const kind = kindOf((await params).kind);
  const { organizationId, user } = await requireBillingPermission("billing.settings.manage");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new APIError("BAD_REQUEST", { message: "Send the image as multipart form data." });
  }
  const image = await readImageUpload(form, "file");
  if (image.contentType !== "image/png" && image.contentType !== "image/jpeg") {
    throw new APIError("BAD_REQUEST", { code: "UNSUPPORTED_FILE_TYPE", message: "Use a PNG or JPG image (PDFs can't include SVG or WebP)." });
  }
  const key = `orgs/${organizationId}/${kind}/${randomUUID()}.${image.extension}`;
  await putFile(key, image.bytes, image.contentType);
  const previous = await setImageKey(organizationId, user.id, kind, key);
  await removeOld(previous);
  return Response.json({ url: `/api/business-billing/template/images/${kind}` }, { status: 201 });
});

// DELETE (billing.settings.manage).
export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const kind = kindOf((await params).kind);
  const { organizationId, user } = await requireBillingPermission("billing.settings.manage");
  const previous = await setImageKey(organizationId, user.id, kind, null);
  await removeOld(previous);
  return new Response(null, { status: 204 });
});
