// Selah's main-UI voice: confident, warm, pastoral — not hedged or academic.
// Honest nuance still belongs in detail/transparency areas; this only de-hedges
// short main-view strings (chips, labels). Applied at render time, so it works
// for any chapter without touching stored content.
export function confident(text: string): string {
  if (!text) return text;
  let s = text.trim();

  // Strip hedging lead-ins and trailers.
  s = s.replace(/^traditionally[,\s]+/i, "");
  s = s.replace(/[,;]?\s*but(?:\s+it'?s|\s+it\s+is)?\s+(?:still\s+)?debated\.?$/i, "");
  s = s.replace(/[,;]?\s*\(?\s*debated\s*\)?\.?$/i, "");
  s = s.replace(/[,;]?\s*\(?\s*(?:date\s+)?uncertain\s*\)?\.?$/i, "");

  // Soften weak qualifiers into confident-but-honest phrasing.
  s = s.replace(/\bpossibly connected to\b/gi, "rooted in");
  s = s.replace(/\bpossibly\b/gi, "likely");
  s = s.replace(/\bperhaps\b/gi, "likely");
  s = s.replace(/\bmay have been\b/gi, "was likely");

  s = s.replace(/\s{2,}/g, " ").trim();

  // Capitalize first letter, but keep "c." (circa) lowercase.
  if (!/^c\.\s/i.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}
