// Offline gate for /today resolution (Codex review, PR #49). No framework,
// no Supabase, no network: drives the REAL resolveTodaysChapterWith search
// order with injected fakes and proves:
//   1. the newest VALID published chapter wins;
//   2. a rejected/unservable/erroring newest candidate is SKIPPED (the local
//      fallback can never truncate the search early);
//   3. empty/error lookup — and Supabase unconfigured — fall back to Exodus 27.
import assert from "node:assert/strict";
import {
  resolveTodaysChapterWith,
  listNavigableSlugsWith,
  type TodaysChapterDeps,
  type NavigableSlugsDeps,
} from "../lib/chapters/registry";
import type { ChapterWorkup } from "../lib/types";

let checks = 0;
function ok(cond: boolean, label: string): void {
  checks++;
  assert.ok(cond, label);
}

const workupFor = (slug: string) => ({ slug, title: slug }) as unknown as ChapterWorkup;
const EXODUS = {
  workup: workupFor("exodus-27"),
  source: "Local file" as never,
};

function deps(overrides: Partial<TodaysChapterDeps>): TodaysChapterDeps {
  return {
    supabaseConfigured: () => true,
    listReviewedSlugsNewestFirst: async () => [],
    readPublishedChapter: async () => null,
    localFallback: async () => EXODUS,
    ...overrides,
  };
}

const main = async () => {
  // 1. Newest valid published chapter wins — and the search stops there.
  {
    const reads: string[] = [];
    const resolved = await resolveTodaysChapterWith(deps({
      listReviewedSlugsNewestFirst: async () => ["mark-9", "mark-8", "mark-7"],
      readPublishedChapter: async (slug) => {
        reads.push(slug);
        return workupFor(slug);
      },
    }));
    ok(resolved.workup.slug === "mark-9" && resolved.source === "Supabase", "1. newest published chapter wins");
    ok(reads.length === 1, "1. search stops at the first servable candidate");
  }

  // 2. Rejected/unservable newest candidate is SKIPPED — null (serve guard)
  //    and thrown (read failure) both continue to the next-newest.
  {
    const resolved = await resolveTodaysChapterWith(deps({
      listReviewedSlugsNewestFirst: async () => ["mark-9", "mark-8"],
      readPublishedChapter: async (slug) => (slug === "mark-9" ? null : workupFor(slug)),
    }));
    ok(resolved.workup.slug === "mark-8", "2. guard-rejected newest is skipped, next-newest serves");

    const afterThrow = await resolveTodaysChapterWith(deps({
      listReviewedSlugsNewestFirst: async () => ["mark-9", "mark-8"],
      readPublishedChapter: async (slug) => {
        if (slug === "mark-9") throw new Error("row unreadable");
        return workupFor(slug);
      },
    }));
    ok(afterThrow.workup.slug === "mark-8", "2. an erroring candidate is skipped, not fatal");

    // The decisive regression: a reviewed-but-unservable candidate whose slug
    // has a LOCAL fixture (exodus-27) must NOT truncate the search — an older
    // servable PUBLISHED chapter still wins over the local file.
    const localShadow = await resolveTodaysChapterWith(deps({
      listReviewedSlugsNewestFirst: async () => ["exodus-27", "mark-8"],
      readPublishedChapter: async (slug) => (slug === "exodus-27" ? null : workupFor(slug)),
    }));
    ok(
      localShadow.workup.slug === "mark-8" && localShadow.source === "Supabase",
      "2. an unservable candidate with a local fixture does not end the search early",
    );
  }

  // 3. Exhausted/empty/error lookups — and unconfigured Supabase — fall back
  //    to the guaranteed local Exodus 27.
  {
    const empty = await resolveTodaysChapterWith(deps({}));
    ok(empty.workup.slug === "exodus-27", "3. empty reviewed list falls back to Exodus 27");

    const listError = await resolveTodaysChapterWith(deps({
      listReviewedSlugsNewestFirst: async () => {
        throw new Error("lookup down");
      },
    }));
    ok(listError.workup.slug === "exodus-27", "3. lookup error falls back to Exodus 27");

    const allRejected = await resolveTodaysChapterWith(deps({
      listReviewedSlugsNewestFirst: async () => ["mark-9", "mark-8"],
      readPublishedChapter: async () => null,
    }));
    ok(allRejected.workup.slug === "exodus-27", "3. every candidate rejected falls back to Exodus 27");

    let listed = false;
    const unconfigured = await resolveTodaysChapterWith(deps({
      supabaseConfigured: () => false,
      listReviewedSlugsNewestFirst: async () => {
        listed = true;
        return ["mark-9"];
      },
    }));
    ok(unconfigured.workup.slug === "exodus-27" && !listed, "3. unconfigured Supabase never queries and falls back");
  }

  // 4. Title-as-navigation slug list (Codex #67 P1): every database candidate
  //    passes the GUARDED public reader — a reviewed-but-unservable protected
  //    row must stay greyed, never linked to a 404.
  {
    const navDeps = (overrides: Partial<NavigableSlugsDeps>): NavigableSlugsDeps => ({
      supabaseConfigured: () => true,
      listReviewedSlugsNewestFirst: async () => [],
      readPublishedChapter: async () => null,
      localSlugs: () => ["exodus-27"],
      ...overrides,
    });
    const guarded = await listNavigableSlugsWith(navDeps({
      // mark-7 reviewed but serve-refused (receipt drift): reader returns null.
      listReviewedSlugsNewestFirst: async () => ["mark-9", "mark-7"],
      readPublishedChapter: async (slug) =>
        slug === "mark-9" || slug === "psalm-23" ? workupFor(slug) : null,
    }));
    ok(guarded.includes("mark-9") && guarded.includes("psalm-23") && guarded.includes("exodus-27"),
      "4. servable reviewed chapters, psalm-23, and local fixtures link");
    ok(!guarded.includes("mark-7"),
      "4. a reviewed-but-unservable row stays greyed (guarded reader is the authority)");

    const erroring = await listNavigableSlugsWith(navDeps({
      listReviewedSlugsNewestFirst: async () => ["mark-9"],
      readPublishedChapter: async (slug) => {
        if (slug === "mark-9") throw new Error("row unreadable");
        return null;
      },
    }));
    ok(!erroring.includes("mark-9") && erroring.includes("exodus-27"),
      "4. an erroring candidate stays greyed; locals still link");

    let queried = false;
    const offline = await listNavigableSlugsWith(navDeps({
      supabaseConfigured: () => false,
      readPublishedChapter: async () => {
        queried = true;
        return null;
      },
    }));
    ok(offline.length === 1 && offline[0] === "exodus-27" && !queried,
      "4. unconfigured Supabase links only local fixtures, no queries");
  }

  console.log(`verify:today ✓ ${checks} checks passed (newest servable published chapter wins; local fallback only after every candidate is exhausted; nav slugs pass the guarded reader)`);
};

main().catch((error) => {
  console.error("verify:today FAILED:", error.message ?? error);
  process.exit(1);
});
