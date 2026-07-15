"use client";

import { useEffect, useState } from "react";

export type EsvState = {
  loading: boolean;
  found?: boolean;
  text?: string;
  copyright?: string;
};

// Fetch real ESV text through the server proxy (the key stays private). Shared
// by the top-of-page preview and the inline reader so the chapter is fetched
// once per view.
export function useEsvText(reference: string, enabled: boolean): EsvState {
  const [esv, setEsv] = useState<EsvState>({ loading: false });

  useEffect(() => {
    if (!enabled) {
      setEsv({ loading: false });
      return;
    }
    let cancelled = false;
    setEsv({ loading: true });
    fetch(`/api/scripture?ref=${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setEsv({ loading: false, found: j.found, text: j.text, copyright: j.copyright });
      })
      .catch(() => {
        if (!cancelled) setEsv({ loading: false, found: false });
      });
    return () => {
      cancelled = true;
    };
  }, [reference, enabled]);

  return esv;
}
