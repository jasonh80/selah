import { ESV_ATTRIBUTION_NOTICE, ESV_ORG_URL } from "@/lib/esv-attribution";

// The ONE reusable ESV/Crossway attribution (owner direction, PR #33,
// 2026-07-16): the full official notice plus the required esv.org link.
// Render this wherever ESV text appears — collapsed preview, full reader,
// and verse-by-verse alike. Never attach it to Selah's fallback text.
export function EsvAttribution({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] leading-relaxed text-secondary ${className ?? ""}`}>
      {ESV_ATTRIBUTION_NOTICE}{" "}
      <a href={ESV_ORG_URL} target="_blank" rel="noreferrer" className="underline">
        esv.org
      </a>
    </p>
  );
}
