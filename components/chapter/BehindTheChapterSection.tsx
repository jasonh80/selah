import type { ChapterWorkup } from "@/lib/types";
import { AuthorAudienceEvidence } from "@/components/chapter/AuthorAudienceEvidence";
import { InsightCards } from "@/components/chapter/InsightCardGrid";
import { getChapterContext, insightTypeOf } from "@/lib/content/chapter-content";

// Behind the Chapter, COLLAPSED (UI-cleanup brief, board #29 2026-07-21):
// reference material — Author, First Audience, Historical World, Evidence &
// Artifacts, Original Language, Chapter Flow — lives inside one collapsed
// disclosure so the guided journey above stays uncluttered. Native <details>:
// server-renderable, accessible, zero JS.
export function BehindTheChapterSection({ data }: { data: ChapterWorkup }) {
  const hasContextCards =
    (data.behindTheChapter?.length ?? 0) > 0 || (getChapterContext(data.slug)?.length ?? 0) > 0;
  const hasReferenceInsights = (data.insights ?? []).some((i) =>
    ["chapter_flow", "original_language"].includes(insightTypeOf(i)),
  );
  if (!hasContextCards && !hasReferenceInsights) return null;

  return (
    <details id="author-audience-evidence" className="group scroll-mt-20 rounded-md border bg-card shadow-hair">
      <summary className="flex cursor-pointer list-none items-center justify-between p-3.5 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="text-eyebrow">Reference</span>
          <span className="text-section mt-0.5 block text-primary">Behind the Chapter</span>
        </span>
        <span aria-hidden className="text-[12px] font-medium text-accent-strong">
          <span className="group-open:hidden">Open ⌄</span>
          <span className="hidden group-open:inline">Close ⌃</span>
        </span>
      </summary>
      <div className="space-y-2.5 px-3.5 pb-3.5">
        {hasContextCards && <AuthorAudienceEvidence data={data} headless />}
        {/* Chapter Flow + Original Language are reference material too —
            they read here, not as equal-weight cards in the journey. */}
        <InsightCards data={data} types={["chapter_flow", "original_language"]} alwaysOpen />
      </div>
    </details>
  );
}
