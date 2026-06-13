import { exodus27 } from "@/lib/chapters/exodus-27";
import { AppHeader } from "@/components/chapter/AppHeader";
import { ChapterHero } from "@/components/chapter/ChapterHero";
import { HeroImage } from "@/components/chapter/HeroImage";
import { VisualDashboardGrid } from "@/components/chapter/VisualDashboardGrid";
import { QuickSummaryCard } from "@/components/chapter/QuickSummaryCard";
import { GeneratedImagesSection } from "@/components/chapter/GeneratedImagesSection";
import { InsightCardGrid } from "@/components/chapter/InsightCardGrid";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";
import { GoDeeperSection } from "@/components/chapter/GoDeeperSection";
import { CostDrawer } from "@/components/chapter/CostDrawer";

export default function Home() {
  const data = exodus27;
  return (
    <div className="min-h-screen lg:bg-card-soft lg:py-8">
      {/* Phone-first app column — centered on a soft canvas on desktop */}
      <div className="mx-auto w-full max-w-[468px] bg-background lg:min-h-[calc(100vh-4rem)] lg:rounded-[28px] lg:border lg:shadow-soft">
        <AppHeader versions={data.versions} defaultVersion={data.defaultVersion} />

        <main className="space-y-6 px-4 pb-12 pt-3">
          {/* Title block + primary actions */}
          <ChapterHero data={data} />

          {/* Visual chapter briefing — the hero of the page */}
          <div className="space-y-3">
            <HeroImage data={data} />
            <VisualDashboardGrid data={data} />
            <QuickSummaryCard data={data} />
          </div>

          <GeneratedImagesSection data={data} />

          {/* Deeper study — expandable cards, no walls of text */}
          <InsightCardGrid data={data} />

          {/* Scripture sits quieter, lower on the page */}
          <ScriptureReader data={data} />

          <GoDeeperSection data={data} />

          <CostDrawer />

          <footer className="flex flex-col items-center gap-2 pt-2 text-center">
            <span className="wordmark text-xs text-secondary">Selah</span>
            <p className="text-[11px] text-secondary">Pause. Reflect. Lift up.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
