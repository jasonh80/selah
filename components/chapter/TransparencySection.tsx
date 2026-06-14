import type { ChapterWorkup } from "@/lib/types";
import { BUILD_ID } from "@/lib/build";

// Quiet, collapsed-by-default provenance. Real facts only — no dollar estimates.
// Native <details> so it needs no client JS. Lives once, near the page bottom.
export function TransparencySection({ data, source }: { data: ChapterWorkup; source?: string }) {
  const imagesStored =
    data.images.length > 0 && data.images.every((i) => /^https?:\/\//.test(i.src));

  return (
    <details className="group mx-auto w-full max-w-md rounded-md border bg-card shadow-hair">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] text-secondary transition hover:text-primary">
        <span className="font-medium">Transparency &amp; build info</span>
        <span aria-hidden className="transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t px-4 py-3">
        <Row label="Content source" value={source ?? "Supabase"} />
        <Row label="Bible text" value="ESV API (esv.org)" />
        <Row label="Generation" value="Complete · cached" />
        <Row label="Images" value={imagesStored ? "Stored (Supabase Storage)" : "Placeholder art"} />
        <Row label="Build" value={BUILD_ID} />
        <p className="mt-3 text-[11px] leading-relaxed text-secondary">
          Generated once and cached — most page loads cost nothing. AI cost is tracked privately;
          no live estimate is shown here.
        </p>
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
      <span className="text-secondary">{label}</span>
      <span className="text-right font-medium text-primary">{value}</span>
    </div>
  );
}
