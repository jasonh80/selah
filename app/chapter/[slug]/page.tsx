import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { GeneratingChapterState } from "@/components/chapter/GeneratingChapterState";
import { resolveChapter } from "@/lib/chapters/registry";
import { generationAllowed, parseSlug } from "@/lib/server/generate-chapter-workup";
import { getChapterStatus } from "@/lib/server/chapter-workups-repository";

export const dynamic = "force-dynamic";

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
