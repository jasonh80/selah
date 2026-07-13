import { createHmac, timingSafeEqual } from "node:crypto";

export const STUDIO_PREVIEW_COOKIE = "selah_draft_preview";
export const STUDIO_PREVIEW_MAX_AGE_SECONDS = 10 * 60;

const VERSION = "v1";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function secret(): string {
  return process.env.DEV_ADMIN_TOKEN ?? "";
}

function signature(payload: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(payload).digest("base64url");
}

function equalSignature(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function studioPreviewCookiePath(slug: string): string | null {
  return SLUG.test(slug) ? `/dev/preview/${slug}` : null;
}

/** Mints an opaque, read-only preview pass. It never contains the admin token. */
export function mintStudioPreviewAccess(
  slug: string,
  nowMs = Date.now(),
): string | null {
  const signingSecret = secret();
  if (!signingSecret || !SLUG.test(slug)) return null;
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + STUDIO_PREVIEW_MAX_AGE_SECONDS;
  const encodedSlug = Buffer.from(slug).toString("base64url");
  const payload = `${VERSION}.${issuedAt}.${expiresAt}.${encodedSlug}`;
  return `${payload}.${signature(payload, signingSecret)}`;
}

export function verifyStudioPreviewAccess(
  value: string | undefined,
  slug: string,
  nowMs = Date.now(),
): boolean {
  const signingSecret = secret();
  if (!value || !signingSecret || !SLUG.test(slug)) return false;
  const parts = value.split(".");
  if (parts.length !== 5) return false;
  const [version, issuedRaw, expiresRaw, encodedSlug, actualSignature] = parts;
  if (version !== VERSION) return false;
  const issuedAt = Number(issuedRaw);
  const expiresAt = Number(expiresRaw);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) return false;
  if (issuedAt > now + 60 || expiresAt <= now) return false;
  if (expiresAt - issuedAt !== STUDIO_PREVIEW_MAX_AGE_SECONDS) return false;
  let boundSlug: string;
  try {
    boundSlug = Buffer.from(encodedSlug, "base64url").toString("utf8");
  } catch {
    return false;
  }
  if (boundSlug !== slug) return false;
  const payload = `${version}.${issuedRaw}.${expiresRaw}.${encodedSlug}`;
  return equalSignature(actualSignature, signature(payload, signingSecret));
}
