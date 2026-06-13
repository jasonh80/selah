import { ChapterView } from "@/components/ChapterView";
import { getTodaysChapter } from "@/lib/chapters/registry";

// Render fresh on every request so deploys are never masked by a stale HTML cache.
export const dynamic = "force-dynamic";

export default function Home() {
  return <ChapterView data={getTodaysChapter()} />;
}
