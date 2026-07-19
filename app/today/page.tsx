import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { resolveTodaysChapter, listNavigableSlugs } from "@/lib/chapters/registry";

// Render fresh on every request so deploys are never masked by a stale HTML cache.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { workup, source } = await resolveTodaysChapter();
  const publishedSlugs = await listNavigableSlugs();
  return (
    <AppShell>
      <ChapterView data={workup} source={source} publishedSlugs={publishedSlugs} />
    </AppShell>
  );
}
