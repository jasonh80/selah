import { exodus27 } from "@/lib/chapters/exodus-27";
import { AppHeader } from "@/components/chapter/AppHeader";
import { ChapterHero } from "@/components/chapter/ChapterHero";
import { HeroImage } from "@/components/chapter/HeroImage";
import { VisualNavGrid } from "@/components/chapter/VisualNavGrid";
import { DashboardRow } from "@/components/chapter/DashboardRow";
import { QuickSummaryCard } from "@/components/chapter/QuickSummaryCard";
import { GeneratedImagesSection } from "@/components/chapter/GeneratedImagesSection";
import { InsightCardGrid } from "@/components/chapter/InsightCardGrid";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";
import { GoDeeperSection } from "@/components/chapter/GoDeeperSection";
import { CostDrawer } from "@/components/chapter/CostDrawer";

export default function Home() {
  const data = exodus27;
  return (
    <div className="min-h-screen">
      <AppHeader versions={data.versions} defaultVersion={data.defaultVersion} />

      <main className="mx-auto max-w-app space-y-5 px-4 pb-12 pt-3">
        <ChapterHero data={data} />

        {/* Visual chapter briefing — the hero of the page */}
        <HeroImage data={data} />
        <VisualNavGrid data={data} />
        <DashboardRow data={data} />
        <QuickSummaryCard data={data} />

        <GeneratedImagesSection data={data} />

        {/* Deeper-study insight cards (tap to expand) */}
        <InsightCardGrid data={data} />

        {/* Scripture sits quieter, lower on the page */}
        <ScriptureReader data={data} />

        <GoDeeperSection data={data} />

        <CostDrawer />

        <footer className="flex flex-col items-center gap-2 pt-4 text-center">
          <span className="wordmark text-xs text-secondary">Selah</span>
          <p className="text-[11px] text-secondary">Learn more. Dive deeper. Grow closer to Jesus.</p>
        </footer>
      </main>
    </div>
  );
}
