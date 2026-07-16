import type { ChapterWorkup } from "@/lib/types";
import { ChapterHero } from "@/components/chapter/ChapterHero";
import { HeroImage } from "@/components/chapter/HeroImage";
import { MetadataChips } from "@/components/chapter/MetadataChips";
import { VisualDashboardGrid } from "@/components/chapter/VisualDashboardGrid";
import { QuickSummaryCard } from "@/components/chapter/QuickSummaryCard";
import { TimelineSection } from "@/components/chapter/TimelineSection";
import { VisualChapterPath } from "@/components/chapter/VisualChapterPath";
import { InsightCardGrid } from "@/components/chapter/InsightCardGrid";
import { ChaptersSection } from "@/components/chapter/ChaptersSection";
import { MapsSection } from "@/components/chapter/MapsSection";
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
export function ChapterView({ data }: { data: ChapterWorkup; source?: string }) {
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 md:max-w-[720px] lg:px-6">
      <main className="min-w-0 space-y-s6 pb-s12 pt-s2 lg:pt-s4">
        {/* Above the fold: title, controls + inline Scripture, key image */}
        <div className="space-y-s3">
          <ChapterHero data={data} />
          <ChapterTopControls data={data} />
        </div>

        <div className="space-y-s3">
          <HeroImage data={data} />
          <QuickSummaryCard data={data} />
          <MetadataChips data={data} />
          <CompactPreviewRow data={data} />
        </div>

        {/* The chapter as a visual walk, with its scene checks attached */}
        <div className="space-y-s3">
          <VisualChapterPath data={data} />
          <SceneCheckSection data={data} />
        </div>

        {/* The freshest insights, adjacent (spec §14) */}
        <div className="space-y-s3">
          <MostPeopleMissSection data={data} />
          <WhatPeopleAskSection data={data} />
        </div>

        <div className="space-y-s3">
          <VisualDashboardGrid data={data} />
          <TimelineSection data={data} />
        </div>

        <AuthorAudienceEvidence data={data} />
        <InsightCardGrid data={data} />
        <MapsSection data={data} />
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
