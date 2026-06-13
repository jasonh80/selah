import { exodus27 } from "@/lib/chapters/exodus-27";
import { AppHeader } from "@/components/chapter/AppHeader";
import { ChapterHero } from "@/components/chapter/ChapterHero";
import { HeroImage } from "@/components/chapter/HeroImage";
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

export default function Home() {
  const data = exodus27;
  return (
    <div className="min-h-screen">
      <AppHeader versions={data.versions} defaultVersion={data.defaultVersion} />

      <div className="mx-auto max-w-[1180px] px-4 lg:px-6">
        {/* Phone-first: 480 → tablet 760 → desktop two-pane */}
        <div className="mx-auto max-w-[480px] md:max-w-[760px] min-[1100px]:max-w-none min-[1100px]:grid min-[1100px]:grid-cols-[minmax(0,680px)_minmax(280px,340px)] min-[1100px]:justify-center min-[1100px]:gap-7">
          {/* Main chapter experience */}
          <main className="min-w-0 space-y-6 pb-12 pt-3">
            <ChapterHero data={data} />

            <div className="space-y-3">
              <HeroImage data={data} />
              <VisualDashboardGrid data={data} />
              <QuickSummaryCard data={data} />
            </div>

            <GeneratedImagesSection data={data} />
            <InsightCardGrid data={data} />
            <ScriptureReader data={data} />
            <ChaptersSection />
            <MapsSection data={data} />

            {/* Keep Going + transparency live in the companion on desktop */}
            <div className="min-[1100px]:hidden">
              <GoDeeperSection data={data} />
            </div>
            <div className="min-[1100px]:hidden">
              <CostDrawer />
            </div>

            <footer className="flex flex-col items-center gap-2 pt-2 text-center">
              <span className="wordmark text-xs text-secondary">Selah</span>
              <p className="text-[11px] text-secondary">Pause. Reflect. Lift up.</p>
            </footer>
          </main>

          {/* Desktop companion column */}
          <aside className="hidden min-w-0 pt-3 min-[1100px]:block">
            <div className="sticky top-[84px]">
              <CompanionColumn data={data} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
