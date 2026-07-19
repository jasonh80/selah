import type { ChapterWorkup } from "@/lib/types";
import { HeroImage } from "@/components/chapter/HeroImage";
import { MetadataChips } from "@/components/chapter/MetadataChips";
import { QuickSummaryCard } from "@/components/chapter/QuickSummaryCard";
import { TimelineSection } from "@/components/chapter/TimelineSection";
import { VisualChapterPath } from "@/components/chapter/VisualChapterPath";
import { InsightCards } from "@/components/chapter/InsightCardGrid";
import { KeyPersonCard } from "@/components/chapter/VisualDashboardGrid";
import { ChaptersSection } from "@/components/chapter/ChaptersSection";
import { MapsSection } from "@/components/chapter/MapsSection";
import { GeoMapSection } from "@/components/chapter/GeoMapSection";
import { getGeoChapterMap } from "@/lib/maps/geo-chapter-maps";
import { getChapterContext } from "@/lib/content/chapter-content";
import { ChapterTopControls } from "@/components/chapter/ChapterTopControls";
import { CompactPreviewRow } from "@/components/chapter/CompactPreviewRow";
import { MostPeopleMissSection } from "@/components/chapter/MostPeopleMissSection";
import { SceneCheckSection } from "@/components/chapter/SceneCheckSection";
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
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 md:max-w-[720px] lg:px-6">
      <main className="min-w-0 space-y-s6 pb-s12 pt-s2 lg:pt-s4">
        {/* Above the fold: title + controls on one header row (owner decision
            A2), subtitle below, inline Scripture, key image. */}
        <div className="space-y-s3">
          <ChapterTopControls data={data} publishedSlugs={publishedSlugs} />
        </div>

        {/* Owner layout order (2026-07-19 "mix up"): every text box full
            width; duplicate boxes removed (WMPM card, World-Behind-It card,
            the Deep Dive rail/header, the half-page dashboard grid). */}
        <div className="space-y-s3">
          <HeroImage data={data} />
          <QuickSummaryCard data={data} />
          <MetadataChips data={data} />
          <CompactPreviewRow data={data} />
          {/* Scene check(s) not bound to a path image sit right here, under
              the top block — paired with the hero directly above. */}
          <SceneCheckSection data={data} />
        </div>

        {/* The visual walk: each image with ITS scene check attached */}
        <VisualChapterPath data={data} />

        <TimelineSection data={data} />
        <KeyPersonCard data={data} />
        <MostPeopleMissSection data={data} />
        <InsightCards data={data} types={["jesus_connection"]} />

        {/* Maps, with the expandable Map Notes card directly beneath */}
        {getGeoChapterMap(data.slug) ? <GeoMapSection data={data} /> : <MapsSection data={data} />}
        <InsightCards data={data} types={["map_notes"]} />

        <InsightCards data={data} types={["big_idea", "chapter_flow"]} />
        <AuthorAudienceEvidence data={data} />
        <InsightCards
          data={data}
          excludeTypes={[
            "jesus_connection",
            "map_notes",
            "big_idea",
            "chapter_flow",
            "what_most_people_miss",
            // The world/context card is excluded ONLY when Behind-the-Chapter
            // actually renders and carries it (canonical mapping) — a legacy
            // chapter without that section keeps its context card.
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
