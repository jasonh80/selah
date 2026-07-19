import type { ChapterWorkup } from "@/lib/types";
import { mostPeopleMissContent } from "@/lib/content/chapter-content";

// "What Most People Miss" — ONE canonical source (the two-layer insight card
// when present; both layers render), so removing the duplicate card from the
// stack never discards authored content (Codex #64, finding 3).
export function MostPeopleMissSection({ data }: { data: ChapterWorkup }) {
  const content = mostPeopleMissContent(data);
  if (!content) return null;

  return (
    <section
      id="most-people-miss"
      className="scroll-mt-20 rounded-md border bg-card p-s4 shadow-hair"
      style={{ borderLeft: "3px solid var(--accent-strong)" }}
    >
      <p className="text-eyebrow">🔍 What Most People Miss</p>
      {content.intro && (
        <p className="mt-s2 text-[14px] font-medium leading-relaxed text-primary">{content.intro}</p>
      )}
      <p className="mt-s2 text-[14px] leading-relaxed text-primary">{content.body}</p>
      {content.extra && (
        <p className="mt-s2 border-t pt-s2 text-[14px] leading-relaxed text-primary">{content.extra}</p>
      )}
    </section>
  );
}
