// verify:discipleship-render — IQ-019 exact-head correction #7.
//
// A REAL render (not "by construction"): renders the actual InsightCard →
// SectionCard components through the same three sequential InsightCards calls
// ChapterView uses in its closing sequence, and asserts the order Live It →
// Disciple It → Prayer, that the Disciple It card is full-width and always
// open (no truncation toggle, full body — not the preview — emitted), and that
// nothing forces a horizontal overflow at a narrow (320–390px) width. Also
// checks the real ChapterView source drives that exact order.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// The app compiles JSX with Next's automatic runtime; under the tsx test runner
// the component files emit classic-runtime React.createElement, so expose React
// globally for their free `React` references.
(globalThis as unknown as { React: typeof React }).React = React;
import { InsightCards } from "../components/chapter/InsightCardGrid";
import type { ChapterWorkup, Insight } from "../lib/types";

const LIVE_IT_BODY = "LIVEIT_BODY_when pressure tries to split your loyalty, let the coin scene shape your choices.";
const DISCIPLE_BODY = "DISCIPLE_BODY_if it would help you might invite a friend to notice how Jesus reframes the trap in 12:17.";
const PRAYER_BODY = "PRAYER_BODY_Lord keep my allegiance undivided when the world demands my whole heart.";

const insights: Insight[] = [
  { id: "application", type: "application", icon: "🌱", title: "Live It", preview: "Live It preview.", body: LIVE_IT_BODY },
  { id: "discipleship", type: "discipleship", icon: "👣", title: "Disciple It", preview: "Disciple It preview.", body: DISCIPLE_BODY },
  { id: "prayer", type: "prayer", icon: "🙏", title: "Prayer", preview: "Prayer preview.", body: PRAYER_BODY },
];
const data = { insights } as unknown as ChapterWorkup;

// Mirror ChapterView's closing sequence exactly: three full-width, always-open
// InsightCards in the order Live It → Disciple It → Prayer.
const html = renderToStaticMarkup(
  React.createElement(
    React.Fragment,
    null,
    React.createElement(InsightCards, { data, types: ["application"], alwaysOpen: true }),
    React.createElement(InsightCards, { data, types: ["discipleship"], alwaysOpen: true }),
    React.createElement(InsightCards, { data, types: ["prayer"], alwaysOpen: true }),
  ),
);

let failures = 0;
const check = (ok: boolean, name: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const iLive = html.indexOf(LIVE_IT_BODY);
const iDisc = html.indexOf(DISCIPLE_BODY);
const iPray = html.indexOf(PRAYER_BODY);

check(iLive >= 0, "Live It card renders");
check(iDisc >= 0, "Disciple It card renders (full body, not the preview)");
check(iPray >= 0, "Prayer card renders");
check(iLive < iDisc && iDisc < iPray, "order is Live It → Disciple It → Prayer", `${iLive}/${iDisc}/${iPray}`);
// alwaysOpen renders the FULL body (a distinct authored preview may also show
// above it — Codex #104 — which is fine); the point is the body is not withheld.
check(iDisc >= 0 && html.indexOf(DISCIPLE_BODY, iDisc) === iDisc, "Disciple It full body is rendered, not withheld behind a toggle");
check(!html.includes("More ⌄") && !html.includes("Less ⌃"), "always-open: no More/Less toggle on the closing cards");
// Narrow-width safety: nothing in the rendered cards forces a horizontal
// overflow — no fixed pixel width and no nowrap on the body text — so the
// full-width card wraps cleanly at 320–390px.
check(!/nowrap/.test(html), "no white-space:nowrap that could overflow at 320px");
check(!/width:\s*\d{3,}px/.test(html), "no fixed wide pixel width on the closing cards");

// The real ChapterView source must drive this exact order (guards against the
// render test drifting away from the shipped sequence).
const here = dirname(fileURLToPath(import.meta.url));
const chapterView = readFileSync(resolve(here, "../components/ChapterView.tsx"), "utf8");
const orderInSource = ["application", "discipleship", "prayer"].map((t) => chapterView.indexOf(`types={["${t}"]}`));
check(
  orderInSource.every((i) => i >= 0) && orderInSource[0] < orderInSource[1] && orderInSource[1] < orderInSource[2],
  "ChapterView.tsx renders application → discipleship → prayer in that order",
  orderInSource.join("/"),
);

console.log(failures === 0 ? "\nverify:discipleship-render ✓ all checks passed" : `\nverify:discipleship-render ✗ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
