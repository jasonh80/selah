"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { Card, SectionTitle } from "@/components/ui/primitives";

type Mode = "read" | "listen" | "verse";

export function BibleText({ data }: { data: ChapterWorkup }) {
  const [version, setVersion] = useState(data.defaultVersion);
  const [mode, setMode] = useState<Mode>("read");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle eyebrow="The chapter" title={`${data.reference}`} />
        {/* Version selector (placeholder) */}
        <label className="flex items-center gap-2 text-sm text-secondary">
          Version
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="rounded-full border bg-card px-3 py-1.5 text-sm text-primary shadow-soft"
          >
            {data.versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Read / Listen / Verse-by-Verse */}
      <div className="inline-flex rounded-full border bg-card p-1 shadow-soft">
        {(["read", "listen", "verse"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm capitalize transition ${
              mode === m ? "bg-accent-strong text-white" : "text-secondary hover:text-primary"
            }`}
          >
            {m === "verse" ? "Verse by verse" : m}
          </button>
        ))}
      </div>

      <Card className="p-6 md:p-8">
        {mode === "listen" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tint text-2xl text-accent-strong">
              ▶
            </div>
            <p className="text-sm text-secondary">Audio reading — coming soon ({version})</p>
          </div>
        ) : mode === "verse" ? (
          <div className="space-y-4">
            {data.verses.map((v) => (
              <div key={v.number} className="flex gap-4">
                <span className="w-6 shrink-0 pt-1 text-right text-xs font-semibold text-accent-strong">
                  {v.number}
                </span>
                <p
                  className={`text-[17px] leading-8 ${
                    v.redLetter ? "red-letter" : "text-primary"
                  }`}
                >
                  {v.text}
                </p>
              </div>
            ))}
            <p className="pt-2 text-xs text-secondary">
              Showing selected verses · placeholder text ({version})
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-display text-[19px] leading-9 text-primary">
              {data.verses.map((v) => (
                <span key={v.number} className={v.redLetter ? "red-letter" : ""}>
                  <sup className="mr-1 text-xs text-secondary">{v.number}</sup>
                  {v.text}{" "}
                </span>
              ))}
            </p>
            <p className="pt-2 text-xs text-secondary">Placeholder text ({version})</p>
          </div>
        )}
      </Card>
    </section>
  );
}
