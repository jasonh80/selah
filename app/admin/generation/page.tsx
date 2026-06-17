"use client";

import { useRef, useState } from "react";
import { BIBLE_BOOKS, chapterCount, slugFor } from "@/lib/bible/books";

// Guided "Launch New Chapter" console. Nothing sensitive is in the page — all
// data comes from the token-gated API; the Supabase service-role key stays
// server-side. Locked workflow: Generate Draft → Preview Draft → Publish Final.
type GenSettings = {
  text_generation_enabled: boolean;
  image_generation_enabled: boolean;
  allowed_slugs: string[];
  selected_text_model: string;
  selected_image_model: string;
  daily_budget_limit_usd: number | null;
  require_confirm: boolean;
  updated_at: string;
};

type Phase = "idle" | "generating" | "ready" | "error";

export default function AdminGenerationPage() {
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<GenSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [book, setBook] = useState("Mark");
  const [chapter, setChapter] = useState(6);
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewed, setPreviewed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const activeSlug = useRef("");

  const slug = slugFor(book, chapter) ?? "";

  async function api(method: "GET" | "POST", body?: unknown) {
    const r = await fetch("/api/admin/generation", {
      method,
      headers: { "x-admin-token": token, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  async function connect() {
    setBusy(true);
    setMsg("");
    const j = await api("GET");
    setBusy(false);
    if (j.ok) setSettings(j.settings);
    else setMsg(j.error || "unauthorized");
  }

  function resetFlow() {
    setPhase("idle");
    setPreviewed(false);
    setMsg("");
  }

  async function pollStatus(target: string, attempt = 0) {
    if (activeSlug.current !== target) return; // a different chapter was picked
    if (attempt > 48) {
      setPhase("error");
      setMsg("Timed out waiting for the draft. Check the audit log in Supabase.");
      return;
    }
    const j = await api("POST", { action: "status", slug: target });
    const st = j.status as string | null;
    if (st === "draft" || st === "ready" || st === "reviewed") {
      setPhase("ready");
      setMsg("Draft generated successfully. Next step: Preview Draft.");
    } else if (st === "failed") {
      setPhase("error");
      setMsg("Generation failed — check the audit log.");
    } else {
      setTimeout(() => pollStatus(target, attempt + 1), 5000);
    }
  }

  async function generateDraft() {
    if (!slug) return;
    if (settings?.require_confirm && !window.confirm(`Generate a draft for ${book} ${chapter}? This spends tokens.`)) return;
    setPhase("generating");
    setPreviewed(false);
    setMsg(`Generating ${book} ${chapter}…`);
    activeSlug.current = slug;
    const j = await api("POST", { action: "generate", slug, confirm: true });
    if (!j.ok) {
      setPhase("error");
      setMsg(j.error || "generate failed");
      return;
    }
    pollStatus(slug);
  }

  function previewDraft() {
    window.open(`/dev/preview/${slug}?token=${encodeURIComponent(token)}`, "_blank", "noreferrer");
    setPreviewed(true);
  }

  async function publishFinal() {
    setBusy(true);
    const j = await api("POST", { action: "publish", slug });
    setBusy(false);
    setMsg(j.ok ? `Published — ${book} ${chapter} is live at /chapter/${slug}.` : j.error || "publish failed");
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    const j = await api("POST", { action: "save", settings });
    setBusy(false);
    if (j.ok) {
      setSettings(j.settings);
      setMsg("Advanced settings saved.");
    } else setMsg(j.error || "save failed");
  }

  function setS<K extends keyof GenSettings>(k: K, v: GenSettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  }

  const field = "w-full rounded-sm border bg-card-soft px-2.5 py-1.5 text-[13px] text-primary";
  const primary = "rounded-full bg-accent-strong px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40";
  const ghost = "rounded-full border bg-card px-4 py-2 text-[13px] font-medium text-primary disabled:opacity-40";

  if (!settings) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-title text-primary">Selah Admin</h1>
        <p className="mt-2 text-[13px] text-secondary">Enter the admin token to continue.</p>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin token" className={`${field} mt-4`} />
        <button onClick={connect} disabled={busy || !token} className={`${primary} mt-3`}>{busy ? "…" : "Connect"}</button>
        {msg && <p className="mt-3 text-[12px] text-jesus-red">{msg}</p>}
      </div>
    );
  }

  const textOff = !settings.text_generation_enabled;

  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-10">
      <h1 className="text-title text-primary">Launch New Chapter</h1>

      {/* Step 1 — choose */}
      <div className="rounded-md border bg-card p-4 shadow-hair">
        <p className="text-eyebrow">1 · Choose chapter</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-secondary">Book</label>
            <select
              className={`${field} mt-1`}
              value={book}
              onChange={(e) => {
                setBook(e.target.value);
                setChapter(1);
                resetFlow();
              }}
            >
              {BIBLE_BOOKS.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-secondary">Chapter</label>
            <select
              className={`${field} mt-1`}
              value={chapter}
              onChange={(e) => {
                setChapter(Number(e.target.value));
                resetFlow();
              }}
            >
              {Array.from({ length: chapterCount(book) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-secondary">Slug: <code className="text-primary">{slug}</code></p>
      </div>

      {/* Steps 2-4 — generate / preview / publish */}
      <div className="rounded-md border bg-card p-4 shadow-hair">
        <p className="text-eyebrow">2 · Generate · Preview · Publish</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={generateDraft} disabled={phase === "generating" || textOff} className={primary}>
            {phase === "generating" ? "Generating…" : "Generate Draft"}
          </button>
          <button onClick={previewDraft} disabled={phase !== "ready"} className={ghost}>Preview Draft ↗</button>
          <button onClick={publishFinal} disabled={phase !== "ready" || !previewed || busy} className={ghost}>Publish Final</button>
        </div>
        {textOff && (
          <p className="mt-2 text-[12px] text-jesus-red">Text Generation is OFF — enable it in Advanced Settings ↓ before generating.</p>
        )}
        {phase === "generating" && (
          <p className="mt-2 flex items-center gap-2 text-[12px] text-secondary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent-strong" /> Working… text generation can take ~1–2 minutes.
          </p>
        )}
        {!previewed && phase === "ready" && (
          <p className="mt-2 text-[12px] text-secondary">Draft ready — Preview it before Publish Final unlocks.</p>
        )}
      </div>

      {msg && <p className="rounded-md border bg-card-soft p-3 text-[12px] leading-relaxed text-secondary">{msg}</p>}

      {/* Advanced */}
      <div className="rounded-md border bg-card shadow-hair">
        <button onClick={() => setShowAdvanced((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-medium text-primary">
          Advanced Settings <span className="text-secondary">{showAdvanced ? "⌃" : "⌄"}</span>
        </button>
        {showAdvanced && (
          <div className="space-y-2.5 border-t px-4 py-3">
            <label className="flex items-center justify-between text-[13px] text-primary">
              Text Generation
              <input type="checkbox" checked={settings.text_generation_enabled} onChange={(e) => setS("text_generation_enabled", e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-[13px] text-primary">
              Image Generation <span className="text-[11px] text-secondary">(keep OFF)</span>
              <input type="checkbox" checked={settings.image_generation_enabled} onChange={(e) => setS("image_generation_enabled", e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-[13px] text-primary">
              Require confirmation
              <input type="checkbox" checked={settings.require_confirm} onChange={(e) => setS("require_confirm", e.target.checked)} />
            </label>
            <div>
              <p className="text-eyebrow">Allowed slugs</p>
              <input className={`${field} mt-1`} value={settings.allowed_slugs.join(", ")} onChange={(e) => setS("allowed_slugs", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-eyebrow">Text model</p>
                <input className={`${field} mt-1`} value={settings.selected_text_model} onChange={(e) => setS("selected_text_model", e.target.value)} />
              </div>
              <div>
                <p className="text-eyebrow">Image model</p>
                <input className={`${field} mt-1`} value={settings.selected_image_model} onChange={(e) => setS("selected_image_model", e.target.value)} />
              </div>
            </div>
            <div>
              <p className="text-eyebrow">Daily budget (USD, optional · not yet enforced)</p>
              <input className={`${field} mt-1`} type="number" value={settings.daily_budget_limit_usd ?? ""} onChange={(e) => setS("daily_budget_limit_usd", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <p className="text-[11px] text-secondary">Last updated: {settings.updated_at || "—"}</p>
            <button onClick={saveSettings} disabled={busy} className={primary}>{busy ? "…" : "Save settings"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
