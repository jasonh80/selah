"use client";

import { useEffect } from "react";

// Reloads the page after a delay — used by GeneratingChapterState to pick up the
// finished workup once the background generation saves it as ready.
export function AutoReload({ seconds = 6 }: { seconds?: number }) {
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), seconds * 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return null;
}
