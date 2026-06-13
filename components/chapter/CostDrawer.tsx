"use client";

import { useState } from "react";
import { BUILD_ID } from "@/lib/build";

// Quiet, collapsed-by-default transparency drawer. Placeholder numbers in
// Phase 0; fed by real logged CostEvents later. Intentionally understated.
export function CostDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-md">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-full border bg-card px-4 py-2 text-xs text-secondary shadow-soft transition hover:text-primary"
      >
        Generation transparency
        <span className={`transition ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="mt-2 rounded-2xl border bg-card p-4 text-sm shadow-soft">
          <Row label="Daily rundown" value="$0.0042" />
          <Row label="Images (3)" value="$0.1200" />
          <Row label="Cached page load" value="$0.00" />
          <div className="my-2 border-t" />
          <Row label="Total estimated AI cost" value="$0.1242" strong />
          <p className="mt-3 text-xs text-secondary">
            Generated once and cached — most loads cost nothing.
          </p>
        </div>
      )}

      <p className="mt-2 text-center text-[10px] text-secondary/70">Build: {BUILD_ID}</p>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={strong ? "font-medium text-primary" : "text-secondary"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-medium text-primary" : "text-secondary"}`}>
        {value}
      </span>
    </div>
  );
}
