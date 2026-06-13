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
import { CompanionNav } from "@/components/chapter/CompanionNav";
import { CostDrawer } from "@/components/chapter/CostDrawer";

export default function Home() {
  const data = exodus27;
  return (
    <div className="min-h-screen">
      <AppHeader versions={data.versions} defaultVersion={data.defaultVersion} />

      <main className="mx-auto max-w-[1180px] px-4 pb-12 pt-3 lg:px-8 lg:pt-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,500px)_minmax(0,340px)] lg:justify-center lg:gap-8">
          {/* Primary app column */}
          <div className="mx-auto w-full max-w-app space-y-5 lg:mx-0 lg:max-w-none">
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

            {/* Keep Going lives in the rail on desktop, inline on mobile */}
            <div className="lg:hidden">
              <GoDeeperSection data={data} />
            </div>
          </div>

          {/* Companion rail (becomes a bottom stack on mobile) */}
          <aside className="mx-auto mt-5 w-full max-w-app space-y-5 lg:mx-0 lg:mt-0">
            <CompanionNav data={data} />
            <div className="hidden lg:block">
              <GoDeeperSection data={data} />
            </div>
            <CostDrawer />
            <footer className="flex flex-col items-center gap-2 pt-2 text-center">
              <span className="wordmark text-xs text-secondary">Selah</span>
              <p className="text-[11px] text-secondary">Learn more. Dive deeper. Grow closer to Jesus.</p>
            </footer>
          </aside>
        </div>
      </main>
    </div>
  );
}
