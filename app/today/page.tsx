import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { resolveTodaysChapter } from "@/lib/chapters/registry";

// Render fresh on every request so deploys are never masked by a stale HTML cache.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { workup, source } = await resolveTodaysChapter();
  return (
    <AppShell>
      <ChapterView data={workup} source={source} />
    </AppShell>
  );
}
