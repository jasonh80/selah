import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { parseChapterWorkupJson } from "@/lib/ai/schemas/chapter-workup-schema";
import { generatedToRenderWorkup } from "@/lib/ai/adapters/generated-to-workup";
import fixture from "@/lib/ai/fixtures/exodus-27-generated.json";

// DEV ONLY: proves the generated-AI contract can render the real chapter page.
// fixture JSON → parse/validate → adapter → ChapterView. No API, no DB.
// /today keeps using the hand-authored workup until we choose to switch.
export const dynamic = "force-dynamic";

export default function GeneratedFixturePage() {
  const generated = parseChapterWorkupJson(JSON.stringify(fixture));
  const data = generatedToRenderWorkup(generated);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pt-3 lg:px-6">
        <div className="rounded-md border border-dashed bg-card-soft px-3 py-2 text-[12px] text-secondary">
          <span className="font-semibold text-accent-strong">DEV</span> · rendered from{" "}
          <code>exodus-27-generated.json</code> → parse → adapter → ChapterView
        </div>
      </div>
      <ChapterView data={data} />
    </AppShell>
  );
}
