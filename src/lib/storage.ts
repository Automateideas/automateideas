import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIError } from "better-auth/api";

/**
 * File storage on Amazon S3. The bucket stays private (S3's default "Block all
 * public access"): files are read through short-lived signed URLs, and the
 * database keeps only each file's key, e.g. "orgs/<id>/logo/<random>.png".
 *
 * Env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET.
 * Optional S3_ENDPOINT points at an S3-compatible server (e.g. MinIO) for local testing.
 */

export function storageEnabled() {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY,
  );
}

let client: S3Client | null = null;
function s3() {
  if (!storageEnabled()) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      code: "STORAGE_NOT_CONFIGURED",
      message: "File uploads aren't set up yet.",
    });
  }
  client ??= new S3Client({
    region: process.env.AWS_REGION,
    ...(process.env.S3_ENDPOINT
      ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
      : {}),
  });
  return client;
}

const bucket = () => process.env.S3_BUCKET!;

export async function putFile(key: string, body: Uint8Array, contentType: string) {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are never reused (each upload gets a new one), so caches can keep files.
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
}

export async function deleteFile(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** The file's bytes and type, for server-side use (e.g. embedding images in PDFs). */
export async function getFileBytes(key: string) {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return { bytes, contentType: res.ContentType ?? null };
}

/** A URL that can read the file for `expiresIn` seconds. */
export function signedFileUrl(key: string, expiresIn = 60 * 60) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

/* ---------------- Images ---------------- */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
} as const;
type ImageType = keyof typeof IMAGE_TYPES;

/** The image type from the file's first bytes, so a renamed file can't pass as an image. */
function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** Reads an uploaded image from a form field, or throws a 400 the form can show. */
export async function readImageUpload(form: FormData, field: string) {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    throw new APIError("BAD_REQUEST", { code: "FILE_REQUIRED", message: "Choose an image to upload." });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new APIError("PAYLOAD_TOO_LARGE", { code: "FILE_TOO_LARGE", message: "Use an image under 2 MB." });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    throw new APIError("BAD_REQUEST", {
      code: "UNSUPPORTED_FILE_TYPE",
      message: "Use a PNG, JPG, SVG or WebP image.",
    });
  }
  return { bytes, contentType: type, extension: IMAGE_TYPES[type] };
}
