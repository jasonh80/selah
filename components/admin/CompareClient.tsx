"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

// Compare two saved draft versions section by section, flag changes, and choose
// V1 / V2 / a per-section merge. Saving writes the working draft + a new version
// snapshot — it NEVER publishes. Admin-token gated via the API.
type WP = Record<string, unknown>;
type Pick = "A" | "B";

const SCALARS: [string, string][] = [
  ["title", "Title"],
  ["subtitle", "Subtitle"],
  ["theme", "Theme"],
  ["quickSummary", "Quick Summary"],
  ["summary", "Summary"],
  ["context", "Historical Context"],
  ["modernReadersMiss", "What Readers Miss"],
  ["jesusConnection", "Jesus Connection"],
  ["application", "Application (Live It)"],
  ["prayer", "Prayer"],
  ["estimatedDate", "Date"],
  ["estimatedLocation", "Location"],
];

function fmtList(v: unknown, f: (o: Record<string, unknown>) => string, sep = "\n\n"): string {
  if (!Array.isArray(v)) return "";
  return v.map((x) => f(x as Record<string, unknown>)).join(sep);
}
const s = (o: Record<string, unknown>, k: string) => String(o[k] ?? "");

const BLOCKS: { key: string; label: string; fmt: (v: unknown) => string }[] = [
  { key: "sceneChecks", label: "Scene Checks", fmt: (v) => fmtList(v, (o) => `• ${s(o, "title")}: ${s(o, "body")}`) },
  { key: "behindTheChapter", label: "Behind the Chapter", fmt: (v) => fmtList(v, (o) => `${s(o, "category")} — ${s(o, "title")}: ${s(o, "body")}`) },
  { key: "characters", label: "Characters", fmt: (v) => fmtList(v, (o) => `${s(o, "name")} (${s(o, "role")})`, ", ") },
  { key: "keyItems", label: "Key Items", fmt: (v) => fmtList(v, (o) => `${s(o, "name")}: ${s(o, "blurb")}`, "\n") },
  { key: "images", label: "Image Plan", fmt: (v) => fmtList(v, (o) => s(o, "title"), ", ") },
];

const scalarText = (wp: WP | null, key: string) => (wp ? String(wp[key] ?? "") : "");
const insightKey = (id: string) => `insight:${id}`;

function insightId(o: Record<string, unknown>, i: number): string {
  return String(o.id ?? o.title ?? `card-${i}`);
}
function insightText(o: Record<string, unknown> | undefined): string {
  if (!o) return "";
  return [s(o, "title"), s(o, "preview"), s(o, "body")].filter(Boolean).join("\n");
}

export function CompareClient({ slug, token }: { slug: string; token: string }) {
  const [versions, setVersions] = useState<{ version: number; label: string | null }[] | null>(null);
  const [aNum, setANum] = useState<number | null>(null);
  const [bNum, setBNum] = useState<number | null>(null);
  const [wpA, setWpA] = useState<WP | null>(null);
  const [wpB, setWpB] = useState<WP | null>(null);
  const [sel, setSel] = useState<Record<string, Pick>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      const r = await fetch("/api/admin/generation", {
        method: "POST",
        headers: { "x-admin-token": token, "content-type": "application/json" },
        body: JSON.stringify({ action, slug, ...body }),
      });
      return r.json();
    },
    [slug, token],
  );

  useEffect(() => {
    void (async () => {
      const j = await api("versions_list");
      const vs = (j.versions ?? []) as { version: number; label: string | null }[];
      setVersions(vs);
      if (vs.length >= 1) {
        setANum(vs[0].version);
        setBNum(vs[vs.length - 1].version);
      }
    })();
  }, [api]);

  useEffect(() => {
    if (aNum == null) return;
    void (async () => {
      const j = await api("version_get", { version: aNum });
      setWpA((j.workup as WP) ?? null);
    })();
  }, [api, aNum]);

  useEffect(() => {
    if (bNum == null) return;
    void (async () => {
      const j = await api("version_get", { version: bNum });
      setWpB((j.workup as WP) ?? null);
    })();
  }, [api, bNum]);

  // Insight cards keyed by id, union in B-order then A-only appended.
  const insights = useMemo(() => {
    const aArr = (Array.isArray(wpA?.insights) ? (wpA!.insights as Record<string, unknown>[]) : []).map((o, i) => ({ id: insightId(o, i), o }));
    const bArr = (Array.isArray(wpB?.insights) ? (wpB!.insights as Record<string, unknown>[]) : []).map((o, i) => ({ id: insightId(o, i), o }));
    const aMap = new Map(aArr.map((x) => [x.id, x.o]));
    const bMap = new Map(bArr.map((x) => [x.id, x.o]));
    const ids: string[] = [...bArr.map((x) => x.id)];
    for (const x of aArr) if (!bMap.has(x.id)) ids.push(x.id);
    return { ids, aMap, bMap };
  }, [wpA, wpB]);

  // Smart defaults once both versions load: prefer B; fall back to whichever has content.
  useEffect(() => {
    if (!wpA || !wpB) return;
    const next: Record<string, Pick> = {};
    const def = (a: string, b: string): Pick => (b.trim() ? "B" : a.trim() ? "A" : "B");
    for (const [key] of SCALARS) next[key] = def(scalarText(wpA, key), scalarText(wpB, key));
    for (const blk of BLOCKS) next[blk.key] = def(blk.fmt(wpA[blk.key]), blk.fmt(wpB[blk.key]));
    for (const id of insights.ids) next[insightKey(id)] = insights.bMap.has(id) ? "B" : "A";
    setSel(next);
  }, [wpA, wpB, insights]);

  function setAll(pick: Pick) {
    const next: Record<string, Pick> = {};
    for (const [key] of SCALARS) next[key] = pick;
    for (const blk of BLOCKS) next[blk.key] = pick;
    for (const id of insights.ids) next[insightKey(id)] = pick;
    setSel(next);
  }

  async function save() {
    if (!wpA || !wpB) return;
    setBusy(true);
    const merged: WP = structuredClone(wpB);
    for (const [key] of SCALARS) if (sel[key] === "A") merged[key] = wpA[key];
    for (const blk of BLOCKS) if (sel[blk.key] === "A") merged[blk.key] = wpA[blk.key];
    merged.insights = insights.ids
      .map((id) => (sel[insightKey(id)] === "A" ? insights.aMap.get(id) : insights.bMap.get(id)))
      .filter(Boolean);
    const j = await api("version_apply", { workup: merged, label: `selected merge of v${aNum}+v${bNum}` });
    setBusy(false);
    setMsg(j.ok ? `Saved to the working draft (archived as version ${j.version}). Nothing published.` : "Save failed.");
  }

  if (versions == null) return <Pad>Loading versions…</Pad>;
  if (versions.length < 2)
    return (
      <Pad>
        <h1 className="text-title text-primary">Compare Versions</h1>
        <p className="mt-2 text-[14px] text-secondary">
          Only {versions.length} version of <code>{slug}</code> exists yet. Generate another draft to compare —
          the current draft is preserved as version 1.
        </p>
      </Pad>
    );

  const rows: { key: string; label: string; a: string; b: string }[] = [
    ...SCALARS.map(([key, label]) => ({ key, label, a: scalarText(wpA, key), b: scalarText(wpB, key) })),
    ...insights.ids.map((id) => ({
      key: insightKey(id),
      label: `Deeper Study — ${s((insights.bMap.get(id) ?? insights.aMap.get(id)) as Record<string, unknown>, "title") || id}`,
      a: insightText(insights.aMap.get(id)),
      b: insightText(insights.bMap.get(id)),
    })),
    ...BLOCKS.map((blk) => ({ key: blk.key, label: blk.label, a: blk.fmt(wpA?.[blk.key]), b: blk.fmt(wpB?.[blk.key]) })),
  ];
  const changedCount = rows.filter((r) => r.a.trim() !== r.b.trim()).length;

  return (
    <Pad>
      <h1 className="text-title text-primary">Compare Versions · {slug}</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Comparing <strong className="text-primary">v{aNum} (A)</strong> with{" "}
        <strong className="text-primary">v{bNum} (B)</strong> · {changedCount} section{changedCount === 1 ? "" : "s"} changed.
        Pick a side per section, or take a whole version. Saving never publishes.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-secondary">A:</label>
        <select className="rounded-md border bg-card-soft px-2 py-1 text-[13px] text-primary" value={aNum ?? ""} onChange={(e) => setANum(Number(e.target.value))}>
          {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.label ? ` · ${v.label}` : ""}</option>)}
        </select>
        <label className="ml-2 text-[12px] text-secondary">B:</label>
        <select className="rounded-md border bg-card-soft px-2 py-1 text-[13px] text-primary" value={bNum ?? ""} onChange={(e) => setBNum(Number(e.target.value))}>
          {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.label ? ` · ${v.label}` : ""}</option>)}
        </select>
        <span className="mx-1 h-4 w-px bg-line" />
        <button onClick={() => setAll("A")} className="rounded-full border bg-card px-3 py-1 text-[12px] text-primary">Use all v{aNum}</button>
        <button onClick={() => setAll("B")} className="rounded-full border bg-card px-3 py-1 text-[12px] text-primary">Use all v{bNum}</button>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const changed = row.a.trim() !== row.b.trim();
          if (!row.a.trim() && !row.b.trim()) return null;
          const pick = sel[row.key] ?? "B";
          return (
            <div key={row.key} className="rounded-lg border bg-card p-3 shadow-hair">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-primary">{row.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${changed ? "bg-accent-strong/15 text-accent-strong" : "bg-card-soft text-secondary"}`}>
                  {changed ? "changed" : "same"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Pane side="A" version={aNum} text={row.a} active={pick === "A"} changed={changed} onPick={() => setSel((p) => ({ ...p, [row.key]: "A" }))} />
                <Pane side="B" version={bNum} text={row.b} active={pick === "B"} changed={changed} onPick={() => setSel((p) => ({ ...p, [row.key]: "B" }))} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-3 mt-5 flex items-center gap-3 rounded-full border bg-card/95 px-4 py-2 shadow-hair backdrop-blur">
        <button onClick={save} disabled={busy} className="rounded-full bg-accent-strong px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
          {busy ? "Saving…" : "Save selection to working draft"}
        </button>
        <a href={`/dev/preview/${slug}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer" className="text-[13px] text-secondary underline">
          Preview working draft ↗
        </a>
        {msg && <span className="text-[12px] text-accent-strong">{msg}</span>}
      </div>
    </Pad>
  );
}

function Pane({ side, version, text, active, changed, onPick }: { side: Pick; version: number | null; text: string; active: boolean; changed: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={`rounded-lg border p-2.5 text-left transition ${active ? "border-accent-strong ring-1 ring-accent-strong/40" : "bg-card-soft"}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-secondary">
        <span className={`h-3 w-3 rounded-full border ${active ? "border-accent-strong bg-accent-strong" : ""}`} />
        v{version} ({side}) {active && <span className="text-accent-strong">· selected</span>}
      </div>
      <p className={`whitespace-pre-wrap text-[12.5px] leading-relaxed ${changed ? "text-primary" : "text-secondary"}`}>
        {text || <span className="italic text-secondary">— empty —</span>}
      </p>
    </button>
  );
}

function Pad({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-4 py-8">{children}</div>;
}
