import type { ChapterWorkup } from "@/lib/types";
import { ChapterHero } from "@/components/chapter/ChapterHero";
import { HeroImage } from "@/components/chapter/HeroImage";
import { MetadataChips } from "@/components/chapter/MetadataChips";
import { VisualDashboardGrid } from "@/components/chapter/VisualDashboardGrid";
import { QuickSummaryCard } from "@/components/chapter/QuickSummaryCard";
import { TimelineSection } from "@/components/chapter/TimelineSection";
import { GeneratedImagesSection } from "@/components/chapter/GeneratedImagesSection";
import { InsightCardGrid } from "@/components/chapter/InsightCardGrid";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";
import { ChaptersSection } from "@/components/chapter/ChaptersSection";
import { MapsSection } from "@/components/chapter/MapsSection";
import { GoDeeperSection } from "@/components/chapter/GoDeeperSection";
import { TransparencySection } from "@/components/chapter/TransparencySection";
import { ReadingModeToggle } from "@/components/chapter/ReadingModeToggle";

/**
 * Reusable chapter template. Renders any global chapter workup.
 * Every section consumes `data` — no chapter content is hardcoded here.
 *
 * Single intentional column on every breakpoint (no desktop sidebar). The
 * facts the old "Quick Info" sidebar repeated already live in the hero +
 * MetadataChips, so they appear exactly once. Provenance sits once, quietly,
 * at the bottom via TransparencySection.
 */
export function ChapterView({ data, source }: { data: ChapterWorkup; source?: string }) {
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 md:max-w-[720px] lg:px-6">
      <main className="min-w-0 space-y-7 pb-12 pt-4 lg:pt-6">
        <ChapterHero data={data} />

        <ReadingModeToggle />

        <div className="space-y-3">
          <HeroImage data={data} />
          <MetadataChips data={data} />
          <VisualDashboardGrid data={data} />
          <TimelineSection data={data} />
          <QuickSummaryCard data={data} />
        </div>

        <GeneratedImagesSection data={data} />
        <InsightCardGrid data={data} />
        <ScriptureReader data={data} />
        <MapsSection data={data} />
        <ChaptersSection data={data} />
        <GoDeeperSection />

        <TransparencySection data={data} source={source} />

        <footer className="flex flex-col items-center gap-2 pt-2 text-center">
          <span className="wordmark text-xs text-secondary">Selah</span>
          <p className="text-[11px] text-secondary">Pause. Reflect. Elevate.</p>
        </footer>
      </main>
    </div>
  );
}
