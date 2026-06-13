import { notFound } from "next/navigation";
import { ChapterView } from "@/components/ChapterView";
import { getChapterBySlug } from "@/lib/chapters/registry";

// Any chapter renders through the same ChapterView template, e.g. /chapter/exodus-27.
export const dynamic = "force-dynamic";

export default function ChapterPage({ params }: { params: { slug: string } }) {
  const data = getChapterBySlug(params.slug);
  if (!data) notFound();
  return <ChapterView data={data} />;
}
