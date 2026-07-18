"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { useReadingMode, type ReadingMode } from "@/components/ReadingModeProvider";
import { useVersion } from "@/components/VersionProvider";
import { useEsvText } from "@/components/chapter/useEsvText";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";

// The chapter header (layout spec §2/§3; owner decision A2, 2026-07-16):
// title left with the control row — [ Read Mark 6 ] [ Quick Dive ]
// [ Deep Dive ] — on the SAME row at md+ (wrapping below when the title
// needs the width), and a tight controls row directly below the title on
// phones. Below that, a collapsed Scripture preview (first words of the
// selected translation). "Read Mark 6" expands the FULL chapter inline right
// here — content pushes down, no jump to a lower section. Expanded, the
// control reads "Hide Mark 6". Selah Focus lives in the app header beside
// the version/theme controls.
export function ChapterTopControls({ data }: { data: ChapterWorkup }) {
  const { mode, setMode } = useReadingMode();
  const { version } = useVersion();
  const [scriptureOpen, setScriptureOpen] = useState(false);
  const esv = useEsvText(data.reference, version === "ESV");

  const base =
    "flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition sm:px-4";

  const modeBtn = (m: ReadingMode) =>
    `${base} ${mode === m ? "bg-accent-strong text-white shadow-hair" : "border bg-card text-secondary hover:text-primary"}`;

  // The preview labels ONLY what it is actually showing: real ESV words get
  // the ESV tag (attribution at a glance); anything else is Selah's own
  // fallback rendering and must never sit under a translation's name.
  const showingEsv = version === "ESV" && esv.found === true && Boolean(esv.text);
  const previewText = buildPreviewText(
    showingEsv ? esv.text : undefined,
    data.verses?.[0]?.text,
  );

  return (
    <div id="chapter" className="scroll-mt-20 space-y-s3">
      <div className="pt-2">
        <div className="flex flex-col gap-s3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <h1 className="text-title text-primary lg:text-[48px]">{data.title}</h1>
          {/* flex-wrap (IQ-003): at a true 320px content viewport the three
              pills measure ~330.6px, so Deep Dive must be allowed to wrap to
              a second line instead of overflowing an 11px sliver. Wrapping
              only engages below ~332px; typography and pill sizes unchanged. */}
          <div className="flex flex-wrap items-center gap-s2">
            <button
              onClick={() => setScriptureOpen((open) => !open)}
              aria-expanded={scriptureOpen}
              className={`${base} border bg-card text-primary hover:border-accent/40`}
            >
              {scriptureOpen ? `Hide ${data.reference}` : `Read ${data.reference}`}
              <span aria-hidden className={`text-secondary transition-transform ${scriptureOpen ? "rotate-180" : ""}`}>
                ⌄
              </span>
            </button>
            <button onClick={() => setMode("quick")} aria-pressed={mode === "quick"} className={modeBtn("quick")}>
              Quick Dive
            </button>
            <button onClick={() => setMode("deep")} aria-pressed={mode === "deep"} className={modeBtn("deep")}>
              Deep Dive
            </button>
          </div>
        </div>
        <p className="text-subtitle mt-2.5 text-primary">{data.subtitle}</p>
      </div>

      {scriptureOpen ? (
        <div className="rounded-lg border bg-card-soft/40 p-s3">
          <ScriptureReader data={data} esv={version === "ESV" ? esv : undefined} embedded />
        </div>
      ) : (
        previewText && (
          <div className="rounded-md border bg-card shadow-hair transition hover:border-accent/40">
            <button
              onClick={() => setScriptureOpen(true)}
              className="block w-full p-s3 text-left"
            >
              <span className="text-eyebrow">
                {data.reference}
                {showingEsv ? " · ESV" : ""}
              </span>
              <p className="mt-1 line-clamp-2 text-scripture text-secondary">{previewText}</p>
            </button>
          </div>
        )
      )}
    </div>
  );
}

// First words of the selected translation for the collapsed preview. ESV text
// arrives with a heading line and [n] verse markers — strip both.
function buildPreviewText(esvText: string | undefined, fallback: string | undefined): string {
  const source = esvText
    ? esvText.slice(esvText.indexOf("[")).replace(/\[\d+\]/g, " ")
    : fallback;
  if (!source) return "";
  const words = source.replace(/\s+/g, " ").trim().split(" ");
  const clipped = words.slice(0, 28).join(" ");
  return words.length > 28 ? `${clipped}…` : clipped;
}
