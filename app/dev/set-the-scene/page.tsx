import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { devRoutesEnabled } from "@/lib/server/dev-guard";
import { buildSetTheScenePreview } from "@/lib/chapters/set-the-scene-preview";

// DEV ONLY: preview the "Set the Scene" card in a real ChapterView (after the
// first image bank, before Big Idea) on Mark 12 content — no API, no DB, no
// paid Prepare. Deeper sections carry scaffold content; this proves the card.
export const dynamic = "force-dynamic";

export default function SetTheScenePreviewPage() {
  if (!devRoutesEnabled()) notFound();
  const data = buildSetTheScenePreview();
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pt-3 lg:px-6">
        <div className="rounded-md border border-dashed bg-card-soft px-3 py-2 text-[12px] text-secondary">
          <span className="font-semibold text-accent-strong">DEV PREVIEW</span> · Mark 12 “Set the Scene”
          card in real placement (after the first image bank, before Big Idea). Surrounding sections use
          scaffold content — this previews the card, not a full Mark 12 chapter.
        </div>
      </div>
      <ChapterView data={data} source="set-the-scene preview" />
    </AppShell>
  );
}
