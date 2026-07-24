import type { ChapterWorkup } from "@/lib/types";
import { SectionCard } from "@/components/chapter/SectionCard";
import { getChapterFaq } from "@/lib/content/chapter-content";

// "What People Ask" — static, approved chapter FAQ (not a live Ask Selah tool
// yet). Sits right after Deeper Study, near "What Most People Miss". Native
// <details> so it needs no client JS. Answers are in Selah's plainspoken voice.
export function WhatPeopleAskSection({ data }: { data: ChapterWorkup }) {
  const items = data.whatPeopleAsk?.length ? data.whatPeopleAsk : getChapterFaq(data.slug);
  if (!items || items.length === 0) return null;

  return (
    <SectionCard id="what-people-ask" icon="💬" title="What People Ask">
      <div className="-mx-1">
        {items.map((it, i) => (
          <details key={i} className="group border-t first:border-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-1 py-2 text-[13px] font-medium text-primary transition hover:text-accent-strong">
              <span>{it.question}</span>
              <span aria-hidden className="shrink-0 text-[15px] leading-none text-secondary transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="px-1 pb-2.5 text-[13px] leading-relaxed text-secondary">{it.answer}</p>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}
