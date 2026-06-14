"use client";

import { useEffect, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { VersionSelect } from "@/components/chapter/VersionSelect";
import { VERSIONS, useVersion } from "@/components/VersionProvider";

type Mode = "read" | "listen" | "verse";
type EsvState = { loading: boolean; found?: boolean; text?: string; copyright?: string };

export function ScriptureReader({ data }: { data: ChapterWorkup }) {
  const { version, setVersion } = useVersion();
  const [mode, setMode] = useState<Mode>("read");
  const [esv, setEsv] = useState<EsvState>({ loading: false });

  // Fetch real ESV text server-side (key stays private) when ESV is selected.
  useEffect(() => {
    if (version !== "ESV") {
      setEsv({ loading: false });
      return;
    }
    let cancelled = false;
    setEsv({ loading: true });
    fetch(`/api/scripture?ref=${encodeURIComponent(data.reference)}`)
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
  }, [version, data.reference]);

  const showEsv = version === "ESV" && esv.found && Boolean(esv.text);

  return (
    <section id="chapter" className="scroll-mt-20 space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow">Scripture</p>
          <h2 className="text-section mt-0.5 text-primary">Read the Chapter</h2>
        </div>
        <VersionSelect versions={[...VERSIONS]} value={version} onChange={(v) => setVersion(v as typeof version)} prefix />
      </div>

      <div className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-hair">
        {(["read", "listen", "verse"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              mode === m ? "bg-accent-strong text-white" : "text-secondary"
            }`}
          >
            {m === "verse" ? "Verse by Verse" : m === "read" ? "Read" : "Listen"}
          </button>
        ))}
      </div>

      {!showEsv && mode !== "listen" && version !== "ESV" && (
        <p className="text-[12px] text-secondary">
          {version} text isn’t available yet — switch to ESV for the full chapter.
        </p>
      )}

      <div className="rounded-md border bg-card p-5 shadow-hair">
        {mode === "listen" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tint text-2xl text-accent-strong">
              ▶
            </div>
            <p className="text-sm text-secondary">Audio reading — coming soon ({version})</p>
          </div>
        ) : version === "ESV" && (esv.loading || esv.found === undefined) ? (
          <p className="py-6 text-center text-sm text-secondary">Loading ESV text…</p>
        ) : showEsv ? (
          <div>
            <div className="text-scripture whitespace-pre-line text-primary">{esv.text}</div>
            <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-secondary">{esv.copyright}</p>
          </div>
        ) : mode === "verse" ? (
          <div className="space-y-4">
            {data.verses.map((v) => (
              <div key={v.number} className="flex gap-3.5">
                <span className="w-5 shrink-0 pt-1 text-right text-xs font-semibold text-accent-strong">
                  {v.number}
                </span>
                <p className={`text-scripture ${v.redLetter ? "red-letter" : "text-primary"}`}>{v.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-scripture text-primary">
            {data.verses.map((v) => (
              <span key={v.number} className={v.redLetter ? "red-letter" : ""}>
                <sup className="mr-1 text-xs text-secondary">{v.number}</sup>
                {v.text}{" "}
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
