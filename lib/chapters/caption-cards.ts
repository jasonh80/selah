// SERVER-SAFE MODULE — deliberately NOT "use client". Server components call
// this at render time; putting it in a client module makes every export an
// uncallable client reference and 500s the chapter route (Codex P1-1 on the
// retracted PR #101 — the build stays green while production crashes).

/**
 * Which chapters' stored image captions are APPROVED to render as headline
 * caption cards. `caption !== label` is NOT an approval test (Codex P1-2):
 * legacy chapters (Exodus 27, Psalm 23) store caption text that was never
 * reviewed as a reader-facing headline. Owner order 2026-07-21: Mark only —
 * Exodus and Psalm stay exactly as they are until he says otherwise.
 * Widening this set is an owner decision expressed by editing this list.
 */
const CAPTION_CARD_APPROVED_SLUGS = new Set([
  "mark-6",
  "mark-7",
  "mark-8",
  "mark-9",
  "mark-10",
  "mark-11",
]);

/**
 * The image's caption renders as a headline card only when the chapter is
 * approved for caption cards AND the caption says something the label
 * doesn't — pre-caption chapters store the label as the caption, and those
 * duplicates must not render as cards.
 */
export function imageCaptionCard(
  slug: string,
  image: { caption?: string; label?: string },
): string | undefined {
  // Revision previews render their base chapter's cards (the allowlist gate
  // still applies — only approved BASE slugs ever show cards).
  if (!CAPTION_CARD_APPROVED_SLUGS.has(slug.replace(/-revision-preview$/u, ""))) return undefined;
  const caption = image.caption?.trim();
  if (!caption || caption === image.label?.trim()) return undefined;
  return caption;
}
