import { exodus27 } from "@/lib/chapters/exodus-27";
import { TopBar } from "@/components/chapter/TopBar";
import { ChapterHero } from "@/components/chapter/ChapterHero";
import { MetadataChips } from "@/components/chapter/MetadataChips";
import { Dashboard } from "@/components/chapter/Dashboard";
import { GeneratedImages } from "@/components/chapter/GeneratedImages";
import { BibleText } from "@/components/chapter/BibleText";
import { NarrativeSections } from "@/components/chapter/NarrativeSections";
import { DeeperStudy } from "@/components/chapter/DeeperStudy";
import { CostDrawer } from "@/components/chapter/CostDrawer";

export default function Home() {
  const data = exodus27;
  return (
    <div className="min-h-screen">
      <TopBar reference={data.reference} />

      <main className="mx-auto max-w-page space-y-12 px-4 py-6 md:px-6 md:py-10">
        <ChapterHero data={data} />

        {/* Visual dashboard, right under the headline */}
        <section className="space-y-4">
          <MetadataChips data={data} />
          <Dashboard data={data} />
        </section>

        <GeneratedImages data={data} />
        <BibleText data={data} />
        <NarrativeSections data={data} />
        <DeeperStudy data={data} />
        <CostDrawer />

        <footer className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="wordmark text-sm text-secondary">Selah</span>
          <p className="text-xs text-secondary">Learn more. Dive deeper. Grow closer to Jesus.</p>
        </footer>
      </main>
    </div>
  );
}
