"use client";

import { useState } from "react";

// Protected admin console for routine generation control. Nothing sensitive is
// in the page itself — all data comes from the token-gated API. The Supabase
// service-role key stays server-side.
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

export default function AdminGenerationPage() {
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<GenSettings | null>(null);
  const [slug, setSlug] = useState("mark-6");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

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

  async function save() {
    if (!settings) return;
    setBusy(true);
    const j = await api("POST", { action: "save", settings });
    setBusy(false);
    if (j.ok) {
      setSettings(j.settings);
      setMsg("Saved.");
    } else setMsg(j.error || "save failed");
  }

  async function generate() {
    setBusy(true);
    const j = await api("POST", { action: "generate", slug, confirm: true });
    setBusy(false);
    setMsg(j.ok ? j.note : j.error || "generate failed");
  }

  async function publish() {
    setBusy(true);
    const j = await api("POST", { action: "publish", slug });
    setBusy(false);
    setMsg(j.ok ? `Published ${slug} (status: ${j.status}).` : j.error || "publish failed");
  }

  function set<K extends keyof GenSettings>(k: K, v: GenSettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  }

  const box = "rounded-md border bg-card p-4 shadow-hair";
  const field = "w-full rounded-sm border bg-card-soft px-2.5 py-1.5 text-[13px] text-primary";
  const btn = "rounded-full bg-accent-strong px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50";

  if (!settings) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-title text-primary">Generation Admin</h1>
        <p className="mt-2 text-[13px] text-secondary">Enter the admin token to continue.</p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="DEV_ADMIN_TOKEN"
          className={`${field} mt-4`}
        />
        <button onClick={connect} disabled={busy || !token} className={`${btn} mt-3`}>
          {busy ? "…" : "Connect"}
        </button>
        {msg && <p className="mt-3 text-[12px] text-jesus-red">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-10">
      <h1 className="text-title text-primary">Generation Admin</h1>

      <div className={box}>
        <p className="text-eyebrow">Toggles</p>
        <label className="mt-2 flex items-center justify-between text-[13px] text-primary">
          Text Generation
          <input type="checkbox" checked={settings.text_generation_enabled} onChange={(e) => set("text_generation_enabled", e.target.checked)} />
        </label>
        <label className="mt-2 flex items-center justify-between text-[13px] text-primary">
          Image Generation <span className="text-[11px] text-secondary">(keep OFF until ready)</span>
          <input type="checkbox" checked={settings.image_generation_enabled} onChange={(e) => set("image_generation_enabled", e.target.checked)} />
        </label>
        <label className="mt-2 flex items-center justify-between text-[13px] text-primary">
          Require confirmation
          <input type="checkbox" checked={settings.require_confirm} onChange={(e) => set("require_confirm", e.target.checked)} />
        </label>
      </div>

      <div className={`${box} space-y-2.5`}>
        <div>
          <p className="text-eyebrow">Allowed slugs (comma-separated)</p>
          <input className={`${field} mt-1`} value={settings.allowed_slugs.join(", ")} onChange={(e) => set("allowed_slugs", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-eyebrow">Text model</p>
            <input className={`${field} mt-1`} value={settings.selected_text_model} onChange={(e) => set("selected_text_model", e.target.value)} />
          </div>
          <div>
            <p className="text-eyebrow">Image model</p>
            <input className={`${field} mt-1`} value={settings.selected_image_model} onChange={(e) => set("selected_image_model", e.target.value)} />
          </div>
        </div>
        <div>
          <p className="text-eyebrow">Daily budget limit (USD, optional)</p>
          <input className={`${field} mt-1`} type="number" value={settings.daily_budget_limit_usd ?? ""} onChange={(e) => set("daily_budget_limit_usd", e.target.value === "" ? null : Number(e.target.value))} />
        </div>
        <p className="text-[11px] text-secondary">Last updated: {settings.updated_at || "—"}</p>
        <button onClick={save} disabled={busy} className={btn}>{busy ? "…" : "Save settings"}</button>
      </div>

      <div className={`${box} space-y-2.5`}>
        <p className="text-eyebrow">Generate draft (text only)</p>
        <input className={field} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug e.g. mark-6" />
        <div className="flex flex-wrap gap-2">
          <button onClick={generate} disabled={busy} className={btn}>Generate Draft</button>
          <a href={`/dev/preview/${slug}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer" className="rounded-full border bg-card px-4 py-2 text-[13px] font-medium text-primary">Preview draft ↗</a>
          <button onClick={publish} disabled={busy} className="rounded-full border bg-card px-4 py-2 text-[13px] font-medium text-primary">Publish</button>
        </div>
      </div>

      {msg && <p className="rounded-md border bg-card-soft p-3 text-[12px] leading-relaxed text-secondary">{msg}</p>}
    </div>
  );
}
