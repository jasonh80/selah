// verify:set-the-scene — the "Set the Scene" reader card (Codex/owner spec).
// Proves the schema round-trips the field, the adapter passes it through, the
// card renders its copy (and nothing when absent), and ChapterView places it
// after the first image bank and before Big Idea.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as unknown as { React: typeof React }).React = React;
import { SetTheSceneCard } from "../components/chapter/SetTheSceneCard";
import { buildSetTheScenePreview, MARK_12_SET_THE_SCENE } from "../lib/chapters/set-the-scene-preview";
import type { ChapterWorkup } from "../lib/types";

let failures = 0;
const check = (ok: boolean, name: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// 1. Schema + adapter round-trip: the authored Mark 12 field survives
// parse → adapter into the render workup.
const preview = buildSetTheScenePreview();
check(!!preview.setTheScene, "setTheScene survives schema parse + adapter");
check(preview.setTheScene?.kicker === MARK_12_SET_THE_SCENE.kicker, "kicker preserved");
check((preview.setTheScene?.body ?? "").includes("Passover"), "body preserved");

// 2. The card renders the kicker and every paragraph, full-width, always open.
const html = renderToStaticMarkup(React.createElement(SetTheSceneCard, { data: preview }));
check(html.includes("Set the Scene"), "card renders the heading");
check(html.includes(MARK_12_SET_THE_SCENE.kicker), "card renders the kicker");
// Decode the entities renderToStaticMarkup emits (', &, ") before matching.
const decoded = html
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&");
const paragraphs = MARK_12_SET_THE_SCENE.body.split(/\n{2,}/);
check(paragraphs.every((p) => decoded.includes(p.trim())), `card renders all ${paragraphs.length} paragraphs`);
check(!html.includes("More ⌄") && !html.includes("Less ⌃"), "card is always open (no expand toggle)");

// 3. Absent / empty → renders nothing (legacy chapters, Mark 6–11).
const empty = renderToStaticMarkup(React.createElement(SetTheSceneCard, { data: {} as ChapterWorkup }));
check(empty.trim() === "", "renders nothing when the chapter has no setTheScene", JSON.stringify(empty.slice(0, 40)));
const blank = renderToStaticMarkup(
  React.createElement(SetTheSceneCard, { data: { setTheScene: { body: "   " } } as ChapterWorkup }),
);
check(blank.trim() === "", "renders nothing when the body is blank");

// 4. Placement: ChapterView renders <SetTheSceneCard> AFTER the first image bank
// (HeroImage) and BEFORE Big Idea (the big_idea InsightCards).
const here = dirname(fileURLToPath(import.meta.url));
const chapterView = readFileSync(resolve(here, "../components/ChapterView.tsx"), "utf8");
const iHero = chapterView.indexOf("<HeroImage");
const iScene = chapterView.indexOf("<SetTheSceneCard");
const iBigIdea = chapterView.indexOf('types={["big_idea"]}');
check(iHero >= 0 && iScene >= 0 && iBigIdea >= 0, "ChapterView references HeroImage, SetTheSceneCard, and Big Idea");
check(iHero < iScene && iScene < iBigIdea, "order: first image bank → Set the Scene → Big Idea", `${iHero}/${iScene}/${iBigIdea}`);

console.log(failures === 0 ? "\nverify:set-the-scene ✓ all checks passed" : `\nverify:set-the-scene ✗ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
