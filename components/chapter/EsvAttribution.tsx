import { ESV_ATTRIBUTION_NOTICE, ESV_ORG_URL } from "@/lib/esv-attribution";

// The ONE reusable ESV/Crossway attribution: the full official notice plus
// the required esv.org link. Per Crossway's terms the full notice belongs on
// a copyright page — ONCE per page (the chapter footer), not beside every
// quotation. Quotations themselves carry only the short "ESV" label
// (ESV_SHORT_LABEL), which is all the terms require there.
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
