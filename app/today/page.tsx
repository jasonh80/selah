import { redirect } from "next/navigation";
import { resolveTodaysChapter } from "@/lib/chapters/registry";

// IQ-007 (owner direction, board #29 2026-07-18): /today is retained for
// compatibility only — a QUIET temporary redirect to the newest published
// chapter's canonical URL. The browser must END on /chapter/{slug}; this
// route never renders duplicate chapter content on a second URL.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { workup } = await resolveTodaysChapter();
  redirect(`/chapter/${workup.slug}`);
}
