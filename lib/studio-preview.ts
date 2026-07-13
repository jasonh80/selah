const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function studioPreviewUrl(slug: string): string | null {
  return SAFE_SLUG.test(slug) ? `/dev/preview/${slug}` : null;
}
