import type { ChapterWorkup } from "@/lib/types";

// "What Most People Miss" (layout spec §14): the chapter's freshest insight,
// promoted to a real reader section high on the page, adjacent to What People
// Ask. Renders only when the workup carries the field.
export function MostPeopleMissSection({ data }: { data: ChapterWorkup }) {
  // The authored "What Most People Miss" INSIGHT card (removed from the card
  // stack as a duplicate) often carries the richer text — prefer whichever
  // is longer so dedupe never discards content (Codex #64, finding 5).
  const field = data.modernReadersMiss?.trim() ?? "";
  const card = data.insights?.find((i) => i.title.trim().toLowerCase() === "what most people miss");
  const cardBody = card?.body?.trim() ?? "";
  const body = cardBody.length > field.length ? cardBody : field;
  if (!body) return null;

  return (
    <section
      id="most-people-miss"
      className="scroll-mt-20 rounded-md border bg-card p-s4 shadow-hair"
      style={{ borderLeft: "3px solid var(--accent-strong)" }}
    >
      <p className="text-eyebrow">🔍 What Most People Miss</p>
      <p className="mt-s2 text-[14px] leading-relaxed text-primary">{body}</p>
    </section>
  );
}
