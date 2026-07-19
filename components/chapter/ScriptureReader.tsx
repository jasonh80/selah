"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { VersionSelect } from "@/components/chapter/VersionSelect";
import { VERSIONS, useVersion } from "@/components/VersionProvider";
import { getVerseNotes } from "@/lib/content/chapter-content";
import { useEsvText, type EsvState } from "@/components/chapter/useEsvText";
import { ESV_SHORT_LABEL } from "@/lib/esv-attribution";

// Crossway's terms require only the letters "ESV" with each quotation; the
// full official notice renders ONCE per page in the chapter footer
// (components/ChapterView.tsx via EsvAttribution).
function EsvQuoteLabel() {
  return (
    <p className="mt-3 text-right text-[10px] font-medium tracking-wide text-secondary">
      {ESV_SHORT_LABEL}
    </p>
  );
}

type Mode = "read" | "verse";

// Renders the full chapter text. When the parent (ChapterTopControls) already
// fetched the ESV chapter, it passes that state down so opening the inline
// reader never refetches; standalone use keeps its own fetch.
export function ScriptureReader({
  data,
  esv: sharedEsv,
  embedded = false,
}: {
  data: ChapterWorkup;
  esv?: EsvState;
  embedded?: boolean;
}) {
  const { version, setVersion } = useVersion();
  const [mode, setMode] = useState<Mode>("read");
  const ownEsv = useEsvText(data.reference, sharedEsv === undefined && version === "ESV");
  const esv = sharedEsv ?? ownEsv;

  const showEsv = version === "ESV" && esv.found && Boolean(esv.text);
  // Verse-by-verse guidance: prefer the chapter's OWN reviewed verseByVerse
  // content (generated with the workup, owner-reviewed before publish —
  // Mark 9/10 style); fall back to the older hand-authored static notes
  // (Psalm 23 / Mark 6). Each range's explanation sits under its FIRST verse.
  const verseNotes = (() => {
    // PROTECTED hand-authored notes (Psalm 23 / Mark 6) always win — a row
    // that later carries generated verse-by-verse data must never silently
    // replace curated notes (Codex #64 review, finding 6).
    const curated = getVerseNotes(data.slug);
    if (curated) return curated;
    const flow = data.verseByVerse;
    if (flow && flow.length > 0) {
      const notes: Record<number, string> = {};
      for (const item of flow) {
        const at = item.startVerse ?? parseInt(item.rangeLabel, 10);
        if (!Number.isFinite(at) || notes[at]) continue;
        notes[at] = item.jesusConnection
          ? `${item.title} — ${item.explanation} ${item.jesusConnection}`
          : `${item.title} — ${item.explanation}`;
      }
      if (Object.keys(notes).length > 0) return notes;
    }
    return null;
  })();

  return (
    <section id={embedded ? undefined : "chapter"} className="scroll-mt-20 space-y-s3">
      <div className="flex items-end justify-between gap-3">
        {embedded ? (
          <span className="text-eyebrow">{data.reference}</span>
        ) : (
          <h2 className="text-section text-primary">Read the Chapter</h2>
        )}
        <VersionSelect versions={[...VERSIONS]} value={version} onChange={(v) => setVersion(v as typeof version)} prefix />
      </div>

      <div className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-hair">
        {(["read", "verse"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              mode === m ? "bg-accent-strong text-white" : "text-secondary"
            }`}
          >
            {m === "verse" ? "Verse by Verse" : "Read"}
          </button>
        ))}
      </div>

      {!showEsv && version !== "ESV" && (
        <p className="text-[12px] text-secondary">
          {version} text isn’t available yet — switch to ESV for the full chapter.
        </p>
      )}

      <div className="rounded-md border bg-card p-4 shadow-hair">
        {version === "ESV" && (esv.loading || esv.found === undefined) ? (
          <p className="py-6 text-center text-sm text-secondary">Loading ESV text…</p>
        ) : mode === "verse" && showEsv ? (
          <VerseByVerse text={esv.text!} notes={verseNotes} />
        ) : showEsv ? (
          <div>
            <div className="text-scripture whitespace-pre-line text-primary">{esv.text}</div>
            <EsvQuoteLabel />
          </div>
        ) : mode === "verse" ? (
          <div className="space-y-4">
            {data.verses.map((v) => (
              <div key={v.number} className="flex gap-3.5">
                <span className="w-5 shrink-0 pt-1 text-right text-xs font-semibold text-accent-strong">
                  {v.number}
                </span>
                <p className={`text-scripture ${v.redLetter ? "red-letter" : "text-primary"}`}>{v.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-scripture text-primary">
            {data.verses.map((v) => (
              <span key={v.number} className={v.redLetter ? "red-letter" : ""}>
                <sup className="mr-1 text-xs text-secondary">{v.number}</sup>
                {v.text}{" "}
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}

// Verse-by-verse: the real ESV text (parsed from the licensed API response)
// with a brief Selah explanation under each verse — the chapter's reviewed
// verseByVerse content when it exists, else the static notes.
function parseEsvVerses(text: string): { num: number; text: string }[] {
  const out: { num: number; text: string }[] = [];
  const re = /\[(\d+)\]\s*([\s\S]*?)(?=\s*\[\d+\]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ num: parseInt(m[1], 10), text: m[2].trim() });
  return out;
}

function VerseByVerse({
  text,
  notes,
}: {
  text: string;
  notes: Record<number, string> | null;
}) {
  const heading = text.split(/\[\d+\]/)[0].trim();
  const verses = parseEsvVerses(text);

  return (
    <div className="space-y-3.5">
      {heading && <p className="whitespace-pre-line text-[13px] font-semibold leading-snug text-primary">{heading}</p>}
      {verses.map((v) => (
        <div key={v.num} className="border-l-2 border-tint pl-3">
          <div className="flex gap-2.5">
            <span className="shrink-0 pt-px text-[11px] font-bold text-accent-strong">{v.num}</span>
            <p className="text-scripture whitespace-pre-line text-primary">{v.text}</p>
          </div>
          {notes?.[v.num] && (
            <p className="mt-1 pl-[26px] text-[12px] leading-relaxed text-secondary">{notes[v.num]}</p>
          )}
        </div>
      ))}
      {/* Verse-by-verse shows ESV text — the short quotation label is all the
          terms require here; the full notice lives once in the page footer. */}
      <EsvQuoteLabel />
    </div>
  );
}
