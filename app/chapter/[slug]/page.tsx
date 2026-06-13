import { notFound } from "next/navigation";
import { ChapterView } from "@/components/ChapterView";
import { loadGlobalChapterWorkup } from "@/lib/chapters/registry";

// Any chapter renders through the same ChapterView template, e.g. /chapter/exodus-27.
// Dynamic + no generateStaticParams on purpose: chapters are generated lazily on
// first request, never pre-built in bulk.
export const dynamic = "force-dynamic";

export default async function ChapterPage({ params }: { params: { slug: string } }) {
  const data = await loadGlobalChapterWorkup(params.slug);
  if (!data) notFound();
  return <ChapterView data={data} />;
}
