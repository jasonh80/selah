// verify:layout-320 — IQ-003 regression pin (board #29, Codex overnight QA of
// published Mark 9, 2026-07-18).
//
// The finding: the chapter header's control row ([ Read <ref> ] [ Quick Dive ]
// [ Deep Dive ]) was flex-nowrap, and at a TRUE 320px content viewport the
// three pills measure ~330.6px — an 11px horizontal overflow. The fix allows
// that one row to wrap; wrapping only engages below ~332px.
//
// This check is a SOURCE pin, stated honestly: offline gates have no browser,
// so it cannot measure rendered pixels. It fails if the control row regresses
// to a no-wrap layout, and it pins the pill sizing classes the 330.6px
// measurement was taken against — if someone changes pill size/typography the
// pin fails so the 320px measurement is redone by a human, not assumed.
// (Codex re-measured the rendered row at 320/390px post-merge; this keeps
// that result from silently rotting.)
import { readFileSync } from "node:fs";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    console.error(`verify:layout-320 FAILED: ${label}`);
    process.exit(1);
  }
}

const source = readFileSync("components/chapter/ChapterTopControls.tsx", "utf8");

// 1. The control row must be allowed to wrap.
const rowMatch = source.match(/<div className="flex ([^"]*items-center[^"]*)">[\s\S]{0,1200}Quick Dive/);
ok(rowMatch !== null, "the control row markup (flex ... Quick Dive) was found");
ok(!/flex-nowrap/.test(rowMatch![1]), "the control row must NOT be flex-nowrap (IQ-003: 11px overflow at 320px)");
ok(/flex-wrap/.test(rowMatch![1]), "the control row explicitly allows wrapping (flex-wrap)");

// 2. Pin the pill metrics the 330.6px measurement assumed. A change here is
// not a failure of taste — it just means the 320px measurement must be
// redone, so the pin forces that conversation instead of silently drifting.
ok(
  source.includes('"flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition sm:px-4"'),
  "pill base classes unchanged (h-9 / px-3 / text-[13px] / sm:px-4) — if this fails, re-measure the row at 320px and update this pin deliberately",
);

// 3. The row's gap the measurement assumed.
ok(/flex-wrap items-center gap-s2/.test(source), "control-row gap (gap-s2) unchanged from the measured layout");

console.log(`verify:layout-320 ✓ ${checks} checks passed (IQ-003: the Quick/Deep control row may wrap at true 320px; pill metrics pinned to the measured values)`);
