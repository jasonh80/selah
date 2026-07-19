import type { ChapterWorkup } from "@/lib/types";

// Deriving WHEN a chapter happens — shared by the "Where It Fits" timeline pin
// and the date chip's "years ago" suffix, so the two can never disagree.
// Dates are handled honestly: the visible label always says "about".

// Best-effort year from visible date copy like "c. 1446 BC", "AD 30", or
// "1st century AD". Averages a range ("AD 30–33" → 32). Negative = BC.
export function parseYear(raw?: string): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const isBC = /\bb\.?c\.?(e)?\b/.test(s);
  const cent = s.match(/(\d+)(?:st|nd|rd|th)\s+century/);
  if (cent) {
    const mid = (parseInt(cent[1], 10) - 1) * 100 + 50;
    return isBC ? -mid : mid;
  }
  const nums = s.match(/\d{1,4}/g);
  if (!nums) return null;
  const avg = Math.round(nums.map(Number).reduce((a, b) => a + b, 0) / nums.length);
  return isBC ? -avg : avg;
}

// The chapter's single estimated year (negative = BC), preferring structured
// timeline data over parsing display copy.
export function chapterYear(data: ChapterWorkup): number | null {
  const bt = data.biblicalTimeline;
  const range = bt?.dateRange;
  return (
    bt?.estimatedYear ??
    (range ? Math.round((range.startYear + range.endYear) / 2) : null) ??
    parseYear(data.estimatedDate)
  );
}

// "about 1,996 years ago" — always "about" (estimated dates are never shown as
// certain), recomputed from the current year on every render so it updates
// itself annually. Returns null when no year is derivable.
export function yearsAgoLabel(data: ChapterWorkup, now = new Date()): string | null {
  const year = chapterYear(data);
  if (year == null || year === 0) return null;
  const current = now.getFullYear();
  // No year zero: 1 BC to AD 1 is one year.
  const yearsAgo = year > 0 ? current - year : current + -year - 1;
  if (yearsAgo <= 0) return null;
  // Fixed locale keeps "1,996" identical on server and client.
  return `about ${yearsAgo.toLocaleString("en-US")} years ago`;
}
