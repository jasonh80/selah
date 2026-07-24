import type { ChapterWorkup } from "@/lib/types";
import { SectionCard } from "@/components/chapter/SectionCard";

// "Set the Scene" (Codex/owner 2026-07-23): one optional immersive reader card
// that grounds the reader in the physical world of the chapter — season,
// weather, terrain, light, sound, texture — before Big Idea explains what it
// means. Rendered through the ONE section frame (owner consistency rule); the
// immersion lives in the writing, not a different box. Always open, never a
// widget/forecast/dashboard. Absent chapters render nothing.
export function SetTheSceneCard({ data }: { data: ChapterWorkup }) {
  const scene = data.setTheScene;
  if (!scene || !scene.body.trim()) return null;
  const paragraphs = scene.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <SectionCard icon="🌅" title="Set the Scene" subtitle={scene.kicker}>
      <div className="space-y-2">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[13px] leading-relaxed text-secondary">
            {p}
          </p>
        ))}
      </div>
    </SectionCard>
  );
}
