import type { ChapterWorkup } from "@/lib/types";
import { mostPeopleMissContent } from "@/lib/content/chapter-content";
import { SectionCard } from "@/components/chapter/SectionCard";

// "What Most People Miss" — ONE canonical source (the two-layer insight card
// when present; both layers render), so removing the duplicate card from the
// stack never discards authored content (Codex #64, finding 3).
export function MostPeopleMissSection({ data }: { data: ChapterWorkup }) {
  const content = mostPeopleMissContent(data);
  if (!content) return null;

  return (
    <SectionCard id="most-people-miss" icon="🔍" title="What's Easy to Miss" subtitle={content.intro}>
      <p className="text-[13px] leading-relaxed text-secondary">{content.body}</p>
      {content.extra && (
        <p className="mt-2 border-t pt-2 text-[13px] leading-relaxed text-secondary">{content.extra}</p>
      )}
    </SectionCard>
  );
}
