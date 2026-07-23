"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { useVersion } from "@/components/VersionProvider";
import { useEsvText } from "@/components/chapter/useEsvText";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";
import { TitleNav } from "@/components/chapter/TitleNav";
import { ReadingModeToggle } from "@/components/chapter/ReadingModeToggle";

// The chapter header (layout spec §2/§3; owner decision A2, 2026-07-16):
// title left with the control row — [ Read Mark 6 ] [ Quick Study | Deep
// Study ] (the mode toggle returned 2026-07-20, owner direction: Quick
// compacts cards/captions to their authored short lines, Deep is the
// zero-click full scroll). Below that, a collapsed Scripture preview (first
// words of the selected translation). "Read Mark 6" expands the FULL chapter
// inline right here — content pushes down, no jump to a lower section.
// Expanded, the control reads "Hide Mark 6". Selah Focus lives in the app
// header beside the version/theme controls.
export function ChapterTopControls({
  data,
  publishedSlugs,
}: {
  data: ChapterWorkup;
  publishedSlugs?: string[];
}) {
  const { version } = useVersion();
  const [scriptureOpen, setScriptureOpen] = useState(false);
  const esv = useEsvText(data.reference, version === "ESV");

  const base =
    "flex h-9 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium transition sm:px-3.5 sm:text-[13px]";


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
        {/* HEADLINE FIRST (owner ruling 2026-07-23: the chapter title looked
            "underwhelming and tucked in"). Magazine hierarchy — the reference
            is a small locator (still the chapter picker), the chapter's own
            title is the page's display headline, then the controls. */}
        {publishedSlugs && publishedSlugs.length > 0 ? (
          <TitleNav slug={data.slug} title={data.title} publishedSlugs={publishedSlugs} />
        ) : (
          <h1 className="text-title text-primary lg:text-[48px]">{data.title}</h1>
        )}
        {/* The chapter's own title sits directly under its name and ABOVE the
            controls — being buried beneath the buttons is what made it read
            "tucked in". It stays clearly subordinate to the chapter name. */}
        <p className="text-subtitle mt-1 text-primary">{data.subtitle}</p>
        <div className="mt-s3 flex flex-col gap-s3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          {/* flex-wrap (IQ-003): with the mode toggle back, the control row
              can exceed a true 320px content viewport again — it MUST keep
              wrapping to a second line instead of overflowing. Typography and
              pill sizes unchanged. */}
          <div className="flex items-center justify-center gap-1.5">
            {/* The Scripture pane below carries "Read" itself (owner ruling
                2026-07-23 — the button and the pane were saying the same
                thing). This control only appears when there is NO pane to
                carry it, so the chapter text is never unreachable. */}
            {!previewText && !scriptureOpen && (
              <button
                onClick={() => setScriptureOpen(true)}
                aria-expanded={false}
                className={`${base} border bg-card text-primary hover:border-accent/40`}
              >
                {`Read ${data.reference}`}
                <span aria-hidden className="text-secondary">⌄</span>
              </button>
            )}
            <ReadingModeToggle />
          </div>
        </div>
      </div>

      {scriptureOpen ? (
        <div className="rounded-lg border bg-card-soft/40 p-s3">
          <button
            onClick={() => setScriptureOpen(false)}
            aria-expanded
            className="mb-2 flex w-full items-center text-left"
          >
            <span className="text-eyebrow">
              {data.reference}
              {showingEsv ? " · ESV" : ""}
            </span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent-strong px-3 py-1 text-[12.5px] font-semibold text-white shadow-hair">
              Hide <span aria-hidden>⌃</span>
            </span>
          </button>
          <ScriptureReader data={data} esv={version === "ESV" ? esv : undefined} embedded />
        </div>
      ) : (
        previewText && (
          <div className="rounded-md border bg-card shadow-hair transition hover:border-accent/40">
            <button
              onClick={() => setScriptureOpen(true)}
              className="block w-full p-s3 text-left"
            >
              {/* The pill IS the label now (owner ruling 2026-07-23 — the
                  reference was printed twice side by side). Only the ESV
                  attribution stays, as Crossway's terms require it with the
                  quotation. */}
              <span className="flex items-center justify-center gap-2">
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent-strong px-3 py-1 text-[12.5px] font-semibold text-white shadow-hair">
                  Read {data.reference}
                  <span aria-hidden>⌄</span>
                </span>
                {showingEsv && <span className="text-eyebrow">ESV</span>}
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
