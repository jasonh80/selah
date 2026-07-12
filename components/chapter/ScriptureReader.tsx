"use client";

import { useEffect, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { VersionSelect } from "@/components/chapter/VersionSelect";
import { VERSIONS, useVersion } from "@/components/VersionProvider";
import { getVerseNotes } from "@/lib/content/chapter-content";

type Mode = "read" | "verse";
type EsvState = { loading: boolean; found?: boolean; text?: string; copyright?: string };

export function ScriptureReader({ data }: { data: ChapterWorkup }) {
  const { version, setVersion } = useVersion();
  const [mode, setMode] = useState<Mode>("read");
  const [esv, setEsv] = useState<EsvState>({ loading: false });

  // Fetch real ESV text server-side (key stays private) when ESV is selected.
  useEffect(() => {
    if (version !== "ESV") {
      setEsv({ loading: false });
      return;
    }
    let cancelled = false;
    setEsv({ loading: true });
    fetch(`/api/scripture?ref=${encodeURIComponent(data.reference)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setEsv({ loading: false, found: j.found, text: j.text, copyright: j.copyright });
      })
      .catch(() => {
        if (!cancelled) setEsv({ loading: false, found: false });
      });
    return () => {
      cancelled = true;
    };
  }, [version, data.reference]);

  const showEsv = version === "ESV" && esv.found && Boolean(esv.text);
  const verseNotes = getVerseNotes(data.slug);

  // The #chapter anchor id lives on the ScriptureDisclosure region that wraps
  // this reader (exactly one id on the page).
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-section text-primary">Read the Chapter</h2>
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
          <VerseByVerse text={esv.text!} notes={verseNotes} copyright={esv.copyright} />
        ) : showEsv ? (
          <div>
            <div className="text-scripture whitespace-pre-line text-primary">{esv.text}</div>
            <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-secondary">{esv.copyright}</p>
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

// Verse-by-verse: the real ESV text (parsed from the licensed API response) with
// a brief, static Selah explanation under each verse. No generated content.
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
  copyright,
}: {
  text: string;
  notes: Record<number, string> | null;
  copyright?: string;
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
      {copyright && <p className="border-t pt-3 text-[11px] leading-relaxed text-secondary">{copyright}</p>}
    </div>
  );
}
