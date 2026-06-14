import type { ChapterWorkup } from "@/lib/types";
import { ChapterHero } from "@/components/chapter/ChapterHero";
import { HeroImage } from "@/components/chapter/HeroImage";
import { MetadataChips } from "@/components/chapter/MetadataChips";
import { VisualDashboardGrid } from "@/components/chapter/VisualDashboardGrid";
import { QuickSummaryCard } from "@/components/chapter/QuickSummaryCard";
import { GeneratedImagesSection } from "@/components/chapter/GeneratedImagesSection";
import { InsightCardGrid } from "@/components/chapter/InsightCardGrid";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";
import { ChaptersSection } from "@/components/chapter/ChaptersSection";
import { MapsSection } from "@/components/chapter/MapsSection";
import { GoDeeperSection } from "@/components/chapter/GoDeeperSection";
import { CompanionColumn } from "@/components/chapter/CompanionColumn";
import { CostDrawer } from "@/components/chapter/CostDrawer";

/**
 * Reusable chapter template. Renders any global chapter workup.
 * Every section consumes `data` — no chapter content is hardcoded here, so the
 * same template serves Exodus 27 today and any future chapter unchanged.
 *
 * Personalization (notes, "go deeper" threads, custom prayers) will later layer
 * on top of this via a separate per-user component — without changing this view.
 */
export function ChapterView({ data, source }: { data: ChapterWorkup; source?: string }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 lg:px-6">
        {/* Phone-first: 480 → tablet 760 → desktop two-pane */}
        <div className="mx-auto max-w-[480px] md:max-w-[760px] lg:max-w-none lg:grid lg:grid-cols-[minmax(0,700px)_minmax(300px,360px)] lg:justify-center lg:gap-8">
          {/* Main chapter experience */}
          <main className="min-w-0 space-y-7 pb-12 pt-4 lg:pt-6">
            <ChapterHero data={data} />

            <div className="space-y-3">
              <HeroImage data={data} />
              <MetadataChips data={data} />
              <VisualDashboardGrid data={data} />
              <QuickSummaryCard data={data} />
            </div>

            <GeneratedImagesSection data={data} />
            <InsightCardGrid data={data} />
            <ScriptureReader data={data} />
            <ChaptersSection />
            <MapsSection data={data} />

            {/* Keep Going + transparency live in the companion on desktop */}
            <div className="lg:hidden">
              <GoDeeperSection data={data} />
            </div>
            <div className="lg:hidden">
              <CostDrawer source={source} />
            </div>

            <footer className="flex flex-col items-center gap-2 pt-2 text-center">
              <span className="wordmark text-xs text-secondary">Selah</span>
              <p className="text-[11px] text-secondary">Pause. Reflect. Elevate.</p>
            </footer>
          </main>

          {/* Desktop companion column — scrolls with the page (no separate scroll) */}
          <aside className="hidden min-w-0 pt-3 lg:block">
            <CompanionColumn data={data} source={source} />
          </aside>
        </div>
    </div>
  );
}
