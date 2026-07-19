import { redirect } from "next/navigation";
import { resolveTodaysChapter } from "@/lib/chapters/registry";

// IQ-007: Selah opens on the newest published chapter's CANONICAL URL —
// straight to /chapter/{slug}, no /today hop (the prescribed-daily framing
// is retired; chapter selection is the front door).
export const dynamic = "force-dynamic";

export default async function Home() {
  const { workup } = await resolveTodaysChapter();
  redirect(`/chapter/${workup.slug}`);
}
