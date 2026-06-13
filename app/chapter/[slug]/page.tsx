import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { loadGlobalChapterWorkup } from "@/lib/chapters/registry";

// Any chapter renders through the same ChapterView template, e.g. /chapter/exodus-27.
// Dynamic + no generateStaticParams on purpose: chapters are generated lazily on
// first request, never pre-built in bulk.
export const dynamic = "force-dynamic";

export default async function ChapterPage({ params }: { params: { slug: string } }) {
  const data = await loadGlobalChapterWorkup(params.slug);

  // MVP: no workup yet → 404.
  // Production: replace this with the lazy-generation flow — kick off the global
  // generation job and render <GeneratingChapterState chapterLabel={...} /> until
  // status becomes "ready", then render <ChapterView />. The chapter is generated
  // once on this first request and cached forever for everyone after.
  if (!data) notFound();

  return (
    <AppShell>
      <ChapterView data={data} />
    </AppShell>
  );
}
