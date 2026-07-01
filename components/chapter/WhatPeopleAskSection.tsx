import type { ChapterWorkup } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";
import { getChapterFaq } from "@/lib/content/chapter-content";

// "What People Ask" — static, approved chapter FAQ (not a live Ask Selah tool
// yet). Sits right after Deeper Study, near "What Most People Miss". Native
// <details> so it needs no client JS. Answers are in Selah's plainspoken voice.
export function WhatPeopleAskSection({ data }: { data: ChapterWorkup }) {
  const items = data.whatPeopleAsk?.length ? data.whatPeopleAsk : getChapterFaq(data.slug);
  if (!items || items.length === 0) return null;

  return (
    <section id="what-people-ask" className="scroll-mt-20">
      <SectionHead title="What People Ask" />
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <details key={i} className="group rounded-md border bg-card shadow-hair">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-medium text-primary transition hover:text-accent-strong">
              <span>{it.question}</span>
              <span aria-hidden className="shrink-0 text-lg leading-none text-secondary transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="border-t px-4 py-3 text-[13px] leading-relaxed text-secondary">{it.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
