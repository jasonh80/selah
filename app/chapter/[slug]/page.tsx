import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { GeneratingChapterState } from "@/components/chapter/GeneratingChapterState";
import { resolveChapter } from "@/lib/chapters/registry";
import { heroImageFor } from "@/components/chapter/HeroImage";
import { generationAllowed, parseSlug } from "@/lib/server/generate-chapter-workup";
import { getChapterStatus } from "@/lib/server/chapter-workups-repository";

export const dynamic = "force-dynamic";

// Chapter-specific metadata (IQ-016, Codex post-launch audit 2026-07-18):
// each chapter page carries its own title, description, canonical URL, and
// social preview — never the generic "daily" site copy. The canonical always
// uses /chapter/{slug} (owner direction IQ-007: that URL is the chapter's
// one shareable home).
const SITE_URL = "https://selahlearn.netlify.app";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const resolved = await resolveChapter(params.slug);
  if (!resolved) return {};
  const w = resolved.workup;
  const title = `${w.reference} — ${w.subtitle} · Selah`;
  const description = (w.quickSummary || `${w.reference}, made visual, simple, and personal.`).slice(0, 300);
  const canonical = `${SITE_URL}/chapter/${w.slug}`;
  // The SAME hero the page renders (heroKind + overrides + fallback via
  // heroImageFor) — the social preview must never disagree with the visible
  // hero (Codex #61 review: Mark 6 overrides its hero to walking-water).
  const hero = heroImageFor(w);
  const image = hero?.src && /^https?:\/\//.test(hero.src) ? hero.src : undefined;
  const imageAlt = image ? hero?.alt : undefined;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      siteName: "Selah",
      ...(image ? { images: [{ url: image, ...(imageAlt ? { alt: imageAlt } : {}) }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ChapterPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  // 1) Already available (Supabase ready/reviewed, or a local chapter)?
  const resolved = await resolveChapter(slug);
  if (resolved) {
    return (
      <AppShell>
        <ChapterView data={resolved.workup} source={resolved.source} />
      </AppShell>
    );
  }

  // 2) Page loads NEVER start generation (cost safety). We only show the
  //    "Preparing…" screen if a manual job (via /dev/regenerate) is already
  //    in progress, and it auto-refreshes until that job saves a ready workup.
  if ((await generationAllowed(slug)) && (await getChapterStatus(slug)) === "generating") {
    const parsed = parseSlug(slug);
    return (
      <AppShell>
        <GeneratingChapterState chapterLabel={parsed ? `${parsed.book} ${parsed.chapter}` : slug} />
      </AppShell>
    );
  }

  // 3) Not found / not generated.
  notFound();
}
