import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { GeneratingChapterState } from "@/components/chapter/GeneratingChapterState";
import { resolveChapter } from "@/lib/chapters/registry";
import { generationAllowed, parseSlug } from "@/lib/server/generate-chapter-workup";
import {
  getChapterStatus,
  createGeneratingChapterWorkup,
} from "@/lib/server/chapter-workups-repository";
import { triggerBackgroundGeneration } from "@/lib/server/trigger-generation";

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

  // 2) Allowed to generate? Kick off a background job and show "Preparing…".
  //    Generation runs in a 15-min background function (not the request), so it
  //    isn't killed by the timeout. The page auto-refreshes until it's ready.
  if (generationAllowed(slug)) {
    const parsed = parseSlug(slug);
    const label = parsed ? `${parsed.book} ${parsed.chapter}` : slug;
    const status = await getChapterStatus(slug);

    if (parsed && status !== "generating") {
      // Mark generating first so refreshes don't re-trigger, then fire the job.
      await createGeneratingChapterWorkup({
        book: parsed.book,
        chapter: parsed.chapter,
        slug,
        title: label,
        source: "generated",
      });
      const host = headers().get("host") || "";
      await triggerBackgroundGeneration(slug, host);
    }

    return (
      <AppShell>
        <GeneratingChapterState chapterLabel={label} />
      </AppShell>
    );
  }

  // 3) Not found.
  notFound();
}
