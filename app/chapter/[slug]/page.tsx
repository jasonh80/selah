import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { resolveChapter } from "@/lib/chapters/registry";

// Any chapter renders through the same ChapterView template, e.g. /chapter/exodus-27.
// Supabase-first, then local fallback. Dynamic + no generateStaticParams on
// purpose: chapters are generated lazily on first request, never pre-built.
export const dynamic = "force-dynamic";
// First-request generation can take a while; allow a longer function timeout
// where the platform supports it.
export const maxDuration = 60;

export default async function ChapterPage({ params }: { params: { slug: string } }) {
  const resolved = await resolveChapter(params.slug);

  // MVP: no workup yet → 404.
  // Production: replace this with the lazy-generation flow — create a generation
  // job, render <GeneratingChapterState/> until status becomes "ready", then
  // render <ChapterView />. Generated once on first request, cached forever.
  if (!resolved) notFound();

  return (
    <AppShell>
      <ChapterView data={resolved.workup} source={resolved.source} />
    </AppShell>
  );
}
