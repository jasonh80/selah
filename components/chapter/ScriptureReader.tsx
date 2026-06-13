"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";

type Mode = "read" | "listen" | "verse";

export function ScriptureReader({ data }: { data: ChapterWorkup }) {
  const [version, setVersion] = useState(data.defaultVersion);
  const [mode, setMode] = useState<Mode>("read");

  return (
    <section id="chapter" className="scroll-mt-20 space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-eyebrow">Read</p>
          <h2 className="text-section mt-0.5 text-primary">The Chapter</h2>
        </div>
        <label className="relative">
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="appearance-none rounded-full border bg-card py-1.5 pl-3 pr-7 text-sm font-medium text-primary shadow-hair"
            aria-label="Bible version"
          >
            {data.versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-secondary">
            ⌄
          </span>
        </label>
      </div>

      <div className="inline-flex rounded-full border bg-card p-1 shadow-hair">
        {(["read", "listen", "verse"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm capitalize transition ${
              mode === m ? "bg-accent-strong text-white" : "text-secondary"
            }`}
          >
            {m === "verse" ? "Verse" : m}
          </button>
        ))}
      </div>

      <div className="rounded-md border bg-card p-5 shadow-hair">
        {mode === "listen" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tint text-2xl text-accent-strong">
              ▶
            </div>
            <p className="text-sm text-secondary">Audio reading — coming soon ({version})</p>
          </div>
        ) : mode === "verse" ? (
          <div className="space-y-4">
            {data.verses.map((v) => (
              <div key={v.number} className="flex gap-3.5">
                <span className="w-5 shrink-0 pt-1 text-right text-xs font-semibold text-accent-strong">
                  {v.number}
                </span>
                <p className={`text-scripture ${v.redLetter ? "red-letter" : "text-primary"}`}>
                  {v.text}
                </p>
              </div>
            ))}
            <p className="pt-1 text-xs text-secondary">Selected verses · placeholder ({version})</p>
          </div>
        ) : (
          <div>
            <p className="text-scripture text-primary">
              {data.verses.map((v) => (
                <span key={v.number} className={v.redLetter ? "red-letter" : ""}>
                  <sup className="mr-1 text-xs text-secondary">{v.number}</sup>
                  {v.text}{" "}
                </span>
              ))}
            </p>
            <p className="pt-3 text-xs text-secondary">Placeholder text ({version})</p>
          </div>
        )}
      </div>
    </section>
  );
}
