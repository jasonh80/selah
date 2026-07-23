import type { ChapterWorkup } from "@/lib/types";
import { HeroImage } from "@/components/chapter/HeroImage";
import { MetadataChips, jesusChipLine } from "@/components/chapter/MetadataChips";
import { QuickSummaryCard } from "@/components/chapter/QuickSummaryCard";
import { TimelineSection } from "@/components/chapter/TimelineSection";
import { VisualChapterPath } from "@/components/chapter/VisualChapterPath";
import { InsightCards } from "@/components/chapter/InsightCardGrid";
import { insightTypeOf } from "@/lib/content/chapter-content";
import { ChaptersSection } from "@/components/chapter/ChaptersSection";
import { MapsSection } from "@/components/chapter/MapsSection";
import { GeoMapSection } from "@/components/chapter/GeoMapSection";
import { getGeoChapterMap } from "@/lib/maps/geo-chapter-maps";
import { getChapterContext } from "@/lib/content/chapter-content";
import { ChapterTopControls } from "@/components/chapter/ChapterTopControls";
import { CompactPreviewRow } from "@/components/chapter/CompactPreviewRow";
import { MostPeopleMissSection } from "@/components/chapter/MostPeopleMissSection";
import { AuthorAudienceEvidence } from "@/components/chapter/AuthorAudienceEvidence";
import { WhatPeopleAskSection } from "@/components/chapter/WhatPeopleAskSection";
import { EsvAttribution } from "@/components/chapter/EsvAttribution";

/**
 * Reusable chapter template (layout spec v1, Mark 6 pilot). Renders any global
 * chapter workup — no chapter content is hardcoded here.
 *
 * Above the fold: title · Read-the-chapter control (expands Scripture INLINE)
 * · Quick/Deep Dive · Selah Focus · collapsed Scripture preview · the key
 * image · the start of the Visual Chapter Path. Spacing follows the owner's
 * 4/8/12/16/24/32/48 token scale; 24px carries the section rhythm. Single
 * intentional column on every breakpoint.
 *
 * Provenance/build info is intentionally NOT public (spec §18). ESV
 * attribution follows Crossway's terms exactly: the short "ESV" label with
 * each quotation, and the full official notice + esv.org link ONCE per page,
 * here in the footer (its copyright page).
 */
export function ChapterView({
  data,
  publishedSlugs,
}: {
  data: ChapterWorkup;
  source?: string;
  /** Published chapter slugs for title-as-navigation; omitted on draft previews. */
  publishedSlugs?: string[];
}) {
  // The former red Jesus/theme chip merges INTO Jesus at the Center — one
  // entry point for the idea (UI-cleanup brief, board #29 2026-07-21).
  const jesusLead = jesusChipLine(data);
  // Map Notes ride INSIDE the map block; they must not also render as a card.
  const mapNotesInsight = (data.insights ?? []).find((i) => insightTypeOf(i) === "map_notes");
  const mapNotes = mapNotesInsight
    ? { title: mapNotesInsight.title, body: mapNotesInsight.body || mapNotesInsight.preview }
    : undefined;
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 md:max-w-[720px] lg:px-6">
      <main className="min-w-0 space-y-s4 pb-s12 pt-s2 lg:pt-s4">
        {/* APPROVED ORDER (Codex UI-cleanup brief + owner decisions, board
            #29 2026-07-21; owner confirmed the same order drives Quick AND
            Deep — only card expansion differs by mode):
            1 header+Scripture · 2 first image bank · 3 Big Idea (open) ·
            4 Where It Fits in the Story · 5 Quick Summary · 6 Jesus at the
            Center (chip merged) · 7 People · 8 second image bank · 9 map
            block · 10 What's-Easy-to-Miss · 11 third image bank · 12 Behind
            the Chapter (collapsed) · 13 Theology · 14 Live It · 15 Prayer.
            Shared rhythm: related items sit close (space-y-s3 groups),
            major sections breathe at the main space-y-s6. */}

        {/* 1 — Chapter header + Scripture preview */}
        <div className="space-y-s3">
          <ChapterTopControls data={data} publishedSlugs={publishedSlugs} />
          {/* Absorbed chips render nothing for typical chapters — only a chip
              no section owns survives here, never a stranded row. */}
          <MetadataChips data={data} />
        </div>

        {/* 2 — First image bank: the hero with its caption + checks */}
        <HeroImage data={data} />

        {/* 3 — Big Idea: open, full width, no More/Less */}
        <InsightCards data={data} types={["big_idea"]} alwaysOpen />

        {/* 4 — Where It Fits in the Story: the large timeline owns the
            date/place facts (chips absorbed into its context line) */}
        <TimelineSection data={data} />

        {/* 5 — Quick Summary: what happens (Big Idea interprets; this
            explains — two different jobs, no repetition) */}
        <QuickSummaryCard data={data} />

        {/* 6 — Jesus at the Center, with the former red chip merged in */}
        <InsightCards data={data} types={["jesus_connection"]} alwaysOpen leadLine={jesusLead} />

        {/* 7 — People (not redesigned — Kelly's character system replaces
            this later; position preserved, shared spacing only) */}
        <CompactPreviewRow data={data} />

        {/* 8 — Second image bank */}
        <VisualChapterPath data={data} bank="second" />

        {/* 9 — ONE map block: the map, its key, and its notes live in a
            single frame (owner ruling 2026-07-23 — notes attach under the
            key as a Dive deeper, never a separate floating card). */}
        {getGeoChapterMap(data.slug) ? (
          <GeoMapSection data={data} notes={mapNotes} />
        ) : (
          <MapsSection data={data} notes={mapNotes} />
        )}

        {/* 10 — What's Easy to Miss (label itself renames in the words PR) */}
        <MostPeopleMissSection data={data} />

        {/* 11 — Third image bank */}
        <VisualChapterPath data={data} bank="third" />

        {/* 12 — Behind the Chapter and its companions: SEPARATE sections
            (owner ruling 2026-07-23: condensed is fine, consolidated is not).
            Chapter Flow and Original Language stand alone as normal
            collapsed-in-Quick cards. */}
        <AuthorAudienceEvidence data={data} />
        <InsightCards data={data} types={["chapter_flow"]} />
        <InsightCards data={data} types={["original_language"]} />

        {/* 13/14/15 — Theology Principle · Live It · Prayer: open, full
            width. Discipleship stays HIDDEN (owner deferral IQ-019,
            re-confirmed on the 2026-07-23 phone pass) — its authored data
            remains stored, nothing renders until the owner un-defers. */}
        <InsightCards data={data} types={["theology"]} alwaysOpen />
        <InsightCards data={data} types={["application"]} alwaysOpen />
        <InsightCards data={data} types={["prayer"]} alwaysOpen />
        <InsightCards
          data={data}
          excludeTypes={[
            "jesus_connection",
            "map_notes",
            "big_idea",
            "chapter_flow",
            "original_language",
            "what_most_people_miss",
            "theology",
            "application",
            "discipleship",
            "prayer",
            // Behind-the-Chapter carries the world/context card wherever its
            // section renders (canonical mapping); a legacy chapter without
            // that section keeps its context card here.
            ...((data.behindTheChapter?.length ?? 0) > 0 || getChapterContext(data.slug)
              ? ["historical_world"]
              : []),
          ]}
        />

        <WhatPeopleAskSection data={data} />
        <ChaptersSection data={data} />

        <footer className="flex flex-col items-center gap-s2 pt-s2 text-center">
          <span className="wordmark text-xs text-secondary">Selah</span>
          <p className="text-[11px] text-secondary">Pause. Reflect. Elevate.</p>
          <EsvAttribution className="max-w-[60ch] opacity-80" />
        </footer>
      </main>
    </div>
  );
}
