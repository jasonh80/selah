import type { ChapterWorkup } from "@/lib/types";
import { parseChapterWorkupJson } from "@/lib/ai/schemas/chapter-workup-schema";
import { generatedToRenderWorkup } from "@/lib/ai/adapters/generated-to-workup";
import base from "@/lib/ai/fixtures/exodus-27-generated.json";

// Mark 12 "Set the Scene" PREVIEW ONLY. Built from a schema-valid base fixture
// with Mark 12 identity + the authored Set the Scene copy, so the real card can
// be reviewed in the real ChapterView (after the first image bank, before Big
// Idea) WITHOUT a paid Prepare. Deeper sections keep scaffold content — this
// proves the card, not a full Mark 12 chapter. Never served in production.

/** The authored Mark 12 Set the Scene reader copy. Its evidence lanes
 * (SCRIPTURE SAYS / SMART GUESS / OPEN CHOICE) live in
 * docs/selah/mark-12-season-and-setting-packet.md; the hedged wording here must
 * not outrun those sources. */
export const MARK_12_SET_THE_SCENE = {
  kicker: "What it may have felt like",
  body: [
    "Jerusalem is crowded and on edge. Passover is only days away, so at the feast the temple complex — one of Jerusalem's largest public spaces — would likely still have been thronged with pilgrims, the air heavy with the smoke of sacrifice.",
    "It is early spring in the Judean hills, and Jerusalem sits high, near 2,500 feet, so the days were probably mild — probably in the 60s or low 70s — while the nights could still turn cold enough to want a fire. Hard sunlight falls on pale limestone; coins ring into the temple treasury chests; the air likely carried dust, incense, and roasting food.",
    "This is not a quiet chapel. The hostile traps the leaders spring on Jesus here — about taxes, about resurrection — are sprung out in the open, in the noise, with a watching crowd; even the scribe who asks sincerely about the greatest command does so in public. The setting sharpens the moment: Jesus answers where everyone can hear.",
  ].join("\n\n"),
};

export function buildSetTheScenePreview(): ChapterWorkup {
  const generated = parseChapterWorkupJson(
    JSON.stringify({
      ...(base as Record<string, unknown>),
      book: "Mark",
      chapter: 12,
      slug: "mark-12",
      title: "Mark 12",
      subtitle: "Traps in the Temple Courts",
      summary:
        "In his last days of public teaching, Jesus faces a running series of challenges in the temple — the tenants, the tax coin, the resurrection — and a scribe's honest question about the greatest command, before closing by pointing not to the rich givers but to a poor widow and her two small coins.",
      setTheScene: MARK_12_SET_THE_SCENE,
    }),
  );
  const workup = generatedToRenderWorkup(generated);
  return { ...workup, slug: "mark-12-set-the-scene-preview" };
}
