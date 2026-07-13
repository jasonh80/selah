"use client";

import { useRef, useState, type ReactNode } from "react";
import { BIBLE_BOOKS, chapterCount, slugFor } from "@/lib/bible/books";

// Selah Studio — a calm, guided publishing flow (not a developer console).
// Choose Chapter → Generate Draft → Preview Draft → Publish Final. All technical
// controls live behind Advanced Settings. Nothing sensitive is in the page; the
// Supabase service-role key stays server-side behind the token-gated API.
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

type AuditEntry = {
  created_at?: string;
  action: string;
  slug: string | null;
  status: string;
  model: string | null;
};

type Rule = {
  id: string;
  rule_id?: string | null;
  title: string;
  rule_text: string;
  category: string;
  priority?: string;
  active: boolean;
};

type Example = {
  id: string;
  title: string;
  genre: string;
  example_type: string;
  source_title: string | null;
  active: boolean;
};

type Phase = "idle" | "checking" | "generating" | "ready" | "error";
type Verdict = "" | "yes" | "needs_work";
type Scope = "chapter" | "future" | "both";
type StepState = "done" | "current" | "todo";

const QUICK_TAGS = [
  "Too academic",
  "Too generic",
  "Too much hedging",
  "Needs more visual detail",
  "Needs stronger Jesus connection",
  "Map missing",
  "Great — save as example",
];

export default function SelahStudioPage() {
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<GenSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState("");

  const [book, setBook] = useState("Mark");
  const [chapter, setChapter] = useState(8);
  const [phase, setPhase] = useState<Phase>("idle");
  const [genMsg, setGenMsg] = useState("");
  const [statusProblem, setStatusProblem] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [previewed, setPreviewed] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>("");
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<Scope>("chapter");
  const [tags, setTags] = useState<string[]>([]);
  const [noteSaved, setNoteSaved] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");

  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [examples, setExamples] = useState<Example[] | null>(null);

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
    setLoginMsg("");
    const j = await api("GET");
    setBusy(false);
    if (j.ok) {
      setSettings(j.settings);
      const target = slugFor(book, chapter) ?? "";
      activeSlug.current = target;
      if (target) {
        setPhase("checking");
        void loadChapterStatus(target);
      }
    } else setLoginMsg(j.error || "That key didn't work — try again.");
  }

  // Reset the review/publish state when the chapter changes or a fresh draft begins.
  function resetReview() {
    setPreviewed(false);
    setVerdict("");
    setNote("");
    setScope("chapter");
    setTags([]);
    setNoteSaved(false);
    setShowFeedback(false);
    setReviewMsg("");
    setPublished(false);
    setPublishMsg("");
  }

  function onPickChapter(nextBook: string, nextChapter: number) {
    setBook(nextBook);
    setChapter(nextChapter);
    setPhase("checking");
    setGenMsg("");
    setStatusProblem(false);
    setConfirming(false);
    resetReview();
    const target = slugFor(nextBook, nextChapter) ?? "";
    activeSlug.current = target;
    if (target) void loadChapterStatus(target);
  }

  async function loadChapterStatus(target: string) {
    setPhase("checking");
    setStatusProblem(false);
    setGenMsg("");

    let j: Record<string, unknown>;
    try {
      j = await api("POST", { action: "status", slug: target });
    } catch {
      if (activeSlug.current !== target) return;
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio could not check this chapter. Check your connection and try again.");
      return;
    }
    if (activeSlug.current !== target) return;
    if (!j.ok) {
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio could not check this chapter. Try again before creating a draft.");
      return;
    }

    const status = j.status as string | null;
    setStatusProblem(false);
    if (status === "reviewed") {
      setPhase("ready");
      setPublished(true);
      setGenMsg("");
    } else if (status === "draft" || status === "ready") {
      setPhase("ready");
      setPublished(false);
      setGenMsg("");
    } else if (status === "generating") {
      setPhase("generating");
      setPublished(false);
      setGenMsg("");
      void pollStatus(target);
    } else if (status === "failed") {
      setPhase("error");
      setPublished(false);
      setGenMsg("The last draft did not finish. You can try again when generation is ready.");
    } else {
      setPhase("idle");
      setPublished(false);
      setGenMsg("");
    }
  }

  async function pollStatus(target: string, attempt = 0) {
    if (activeSlug.current !== target) return;
    if (attempt > 48) {
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("This is taking longer than expected. Check Recent activity in Settings & history.");
      return;
    }
    let j: Record<string, unknown>;
    try {
      j = await api("POST", { action: "status", slug: target });
    } catch {
      if (activeSlug.current !== target) return;
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio lost its connection while checking the draft. Try checking again.");
      return;
    }
    if (activeSlug.current !== target) return;
    if (!j.ok) {
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio could not check the draft. Try checking again.");
      return;
    }
    const st = j.status as string | null;
    if (st === "draft" || st === "ready" || st === "reviewed") {
      setPhase("ready");
      setPublished(st === "reviewed");
      setGenMsg("");
    } else if (st === "failed") {
      setPhase("error");
      setStatusProblem(false);
      setGenMsg("Something went wrong while writing the draft. Check Recent activity.");
    } else {
      setTimeout(() => pollStatus(target, attempt + 1), 5000);
    }
  }

  function onGenerateClick() {
    if (!slug || phase === "checking" || phase === "generating" || statusProblem || published) return;
    if (settings?.require_confirm) {
      setConfirming(true);
      return;
    }
    void doGenerate();
  }

  async function doGenerate() {
    const target = slug;
    setConfirming(false);
    setPhase("generating");
    setGenMsg("");
    setStatusProblem(false);
    resetReview();
    activeSlug.current = target;
    let j: Record<string, unknown>;
    try {
      j = await api("POST", { action: "generate", slug: target, confirm: true });
    } catch {
      if (activeSlug.current !== target) return;
      setPhase("error");
      setGenMsg("Studio could not start the draft. Check your connection and try again.");
      return;
    }
    if (activeSlug.current !== target) return;
    if (!j.ok) {
      setPhase("error");
      setGenMsg(typeof j.error === "string" ? j.error : "Couldn't start the draft.");
      return;
    }
    void pollStatus(target);
  }

  function previewDraft() {
    window.open(`/dev/preview/${slug}?token=${encodeURIComponent(token)}`, "_blank", "noreferrer");
    setPreviewed(true);
  }

  function toggleTag(t: string) {
    setNoteSaved(false);
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function saveNote() {
    if (!verdict) return;
    const target = slug;
    setBusy(true);
    setReviewMsg("");
    try {
      const j = await api("POST", { action: "feedback", slug: target, verdict, note, scope, tags });
      if (activeSlug.current !== target) return;
      setNoteSaved(Boolean(j.ok));
      if (!j.ok) setReviewMsg("Studio could not save that feedback. Try again.");
      // A future/both note may have created a global rule — refresh the panel if open.
      if (j.ok && scope !== "chapter" && rules !== null) void loadRules();
    } catch {
      if (activeSlug.current === target) setReviewMsg("Studio could not save that feedback. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRules() {
    const j = await api("POST", { action: "rules_list" });
    if (j.ok) setRules(j.rules as Rule[]);
  }

  async function toggleRule(id: string, active: boolean) {
    setRules((rs) => rs?.map((r) => (r.id === id ? { ...r, active } : r)) ?? rs);
    await api("POST", { action: "rule_toggle", id, active });
  }

  async function removeRule(id: string) {
    setRules((rs) => rs?.filter((r) => r.id !== id) ?? rs);
    await api("POST", { action: "rule_delete", id });
  }

  async function loadExamples() {
    const j = await api("POST", { action: "examples_list" });
    if (j.ok) setExamples(j.examples as Example[]);
  }

  async function toggleExample(id: string, active: boolean) {
    setExamples((xs) => xs?.map((x) => (x.id === id ? { ...x, active } : x)) ?? xs);
    await api("POST", { action: "example_toggle", id, active });
  }

  async function removeExample(id: string) {
    setExamples((xs) => xs?.filter((x) => x.id !== id) ?? xs);
    await api("POST", { action: "example_delete", id });
  }

  async function publishFinal() {
    const target = slug;
    setBusy(true);
    setPublishing(true);
    setPublishMsg("");
    try {
      // Capture the positive review alongside the publish (if not already saved).
      if (verdict && !noteSaved) {
        const feedback = await api("POST", { action: "feedback", slug: target, verdict, note, scope, tags });
        if (activeSlug.current !== target) return;
        if (!feedback.ok) {
          setPublishMsg("Studio could not save your approval, so nothing was published. Try again.");
          return;
        }
        setNoteSaved(true);
      }
      const j = await api("POST", { action: "publish", slug: target });
      if (activeSlug.current !== target) {
        return;
      }
      setPublished(Boolean(j.ok));
      if (!j.ok) setPublishMsg(j.error || "Publish failed.");
    } catch {
      if (activeSlug.current === target) setPublishMsg("Studio lost its connection. Nothing was confirmed as published.");
    } finally {
      setBusy(false);
      setPublishing(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    const j = await api("POST", { action: "save", settings });
    setBusy(false);
    if (j.ok) setSettings(j.settings);
  }

  async function loadAudit() {
    const j = await api("POST", { action: "audit" });
    if (j.ok) setAudit(j.entries as AuditEntry[]);
  }

  function setS<K extends keyof GenSettings>(k: K, v: GenSettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  }

  // ---- shared styles ----
  const field = "w-full rounded-lg border bg-card-soft px-3 py-2 text-[14px] text-primary";
  const primary =
    "rounded-full bg-accent-strong px-5 py-2.5 text-[14px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40";
  const ghost =
    "rounded-full border bg-card px-5 py-2.5 text-[14px] font-medium text-primary transition disabled:cursor-not-allowed disabled:opacity-40";

  // ---------------- Login ----------------
  if (!settings) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <p className="text-eyebrow">SELAH STUDIO</p>
        <h1 className="mt-1 text-title text-primary">Welcome back</h1>
        <p className="mt-2 text-[14px] text-secondary">Enter your studio key to continue.</p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && token && connect()}
          placeholder="Studio key"
          className={`${field} mt-5`}
        />
        <button type="button" onClick={connect} disabled={busy || !token} className={`${primary} mt-3`}>
          {busy ? "…" : "Enter Studio"}
        </button>
        {loginMsg && <p className="mt-3 text-[13px] text-jesus-red">{loginMsg}</p>}
      </div>
    );
  }

  // ---------------- Step states ----------------
  const textOff = !settings.text_generation_enabled;
  const draftReady = phase === "ready";
  const canPublish = draftReady && previewed && verdict === "yes" && !published;

  const step1: StepState = phase === "idle" && !published ? "current" : "done";
  const step2: StepState =
    published ? "done" : phase === "idle" ? "todo" : phase === "ready" ? "done" : "current";
  const step3: StepState = published || previewed ? "done" : draftReady ? "current" : "todo";
  const step4: StepState = published ? "done" : verdict === "yes" && previewed ? "current" : "todo";

  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-12">
      <header className="mb-2">
        <p className="text-eyebrow">SELAH STUDIO</p>
        <h1 className="mt-1 text-title text-primary">Launch a Chapter</h1>
        <p className="mt-1 text-[14px] text-secondary">
          Choose a chapter, review one fresh draft, then decide when it goes live.
        </p>
      </header>

      {/* Step 1 — Choose Chapter */}
      <Step n={1} title="Choose Chapter" state={step1}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[12px] text-secondary">Book</label>
            <select disabled={busy} className={`${field} mt-1`} value={book} onChange={(e) => onPickChapter(e.target.value, 1)}>
              {BIBLE_BOOKS.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-secondary">Chapter</label>
            <select disabled={busy} className={`${field} mt-1`} value={chapter} onChange={(e) => onPickChapter(book, Number(e.target.value))}>
              {Array.from({ length: chapterCount(book) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[13px] text-secondary">
          You&rsquo;re working on <span className="font-semibold text-primary">{book} {chapter}</span>.
        </p>
      </Step>

      {/* Step 2 — Generate Draft */}
      <Step n={2} title="Generate Draft" state={step2}>
        {statusProblem ? (
          <button type="button" onClick={() => void loadChapterStatus(slug)} className={ghost}>
            Check chapter again
          </button>
        ) : !confirming ? (
          <button type="button" onClick={onGenerateClick} disabled={phase === "checking" || phase === "generating" || textOff || published} className={primary}>
            {published
              ? "Already Published"
              : phase === "checking"
                ? "Checking…"
                : phase === "generating"
                  ? "Generating…"
                  : draftReady
                    ? "Generate Again"
                    : "Generate Draft"}
          </button>
        ) : (
          <div className="rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] text-primary">
              Create one fresh private draft of <span className="font-semibold">{book} {chapter}</span>? It will not publish, and it uses a small amount of credit.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button type="button" onClick={() => void doGenerate()} className={primary}>Create draft</button>
              <button type="button" onClick={() => setConfirming(false)} className={ghost}>Cancel</button>
            </div>
          </div>
        )}

        {textOff && (
          <p className="mt-2.5 text-[13px] text-secondary">
            Draft creation is paused. Turn it on in <span className="text-primary">Settings &amp; history</span> below to begin.
          </p>
        )}
        {phase === "generating" && (
          <DraftWaitCard reference={`${book} ${chapter}`} />
        )}
        {draftReady && !published && <p className="mt-2.5 text-[13px] font-medium text-accent-strong">✓ Draft ready to review</p>}
        {published && <p className="mt-2.5 text-[13px] font-medium text-accent-strong">✓ This chapter is already live</p>}
        {phase === "error" && genMsg && <p role="alert" className="mt-2.5 text-[13px] text-jesus-red">{genMsg}</p>}
      </Step>

      {/* Step 3 — Preview Draft + Selah Brain review */}
      <Step n={3} title="Preview Draft" state={step3}>
        {published ? (
          <a href={`/chapter/${slug}`} target="_blank" rel="noreferrer" className="text-[13px] text-primary underline">
            View live chapter ↗
          </a>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={previewDraft} disabled={!draftReady} className={ghost}>
              Preview Draft ↗
            </button>
            {draftReady && (
              <a
                href={`/dev/compare/${slug}?token=${encodeURIComponent(token)}`}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-secondary underline"
              >
                Compare versions ↗
              </a>
            )}
          </div>
        )}
        {draftReady && !published && !previewed && (
          <p className="mt-2.5 text-[13px] text-secondary">Open the preview, then tell Selah how it feels.</p>
        )}

        {previewed && !published && (
          <div className="mt-3 space-y-4 rounded-lg border bg-card-soft p-4">
            <div>
              <p className="text-[14px] font-semibold text-primary">Is this ready to publish?</p>
              <div className="mt-2 flex gap-2">
                <Seg active={verdict === "yes"} onClick={() => { setVerdict("yes"); setNoteSaved(false); setShowFeedback(false); }}>Ready</Seg>
                <Seg active={verdict === "needs_work"} onClick={() => { setVerdict("needs_work"); setNoteSaved(false); setShowFeedback(true); }}>Needs work</Seg>
              </div>
            </div>

            {verdict && (
              <>
                {!showFeedback && (
                  <button
                    type="button"
                    onClick={() => setShowFeedback(true)}
                    className="text-[13px] text-secondary underline"
                  >
                    Add feedback for Selah Brain (optional)
                  </button>
                )}

                {showFeedback && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[13px] text-secondary">What should Selah learn?</label>
                      <textarea
                        value={note}
                        onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }}
                        rows={3}
                        placeholder="Tell Selah what was strong or what needs to change."
                        className={`${field} mt-1`}
                      />
                    </div>

                    <div>
                      <p className="text-[13px] text-secondary">Use this feedback for:</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <Seg active={scope === "chapter"} onClick={() => { setScope("chapter"); setNoteSaved(false); }}>Only this chapter</Seg>
                        <Seg active={scope === "future"} onClick={() => { setScope("future"); setNoteSaved(false); }}>Future chapters</Seg>
                        <Seg active={scope === "both"} onClick={() => { setScope("both"); setNoteSaved(false); }}>Both</Seg>
                      </div>
                    </div>

                    <div>
                      <p className="text-[13px] text-secondary">Quick notes (optional)</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {QUICK_TAGS.map((t) => (
                          <button
                            type="button"
                            key={t}
                            onClick={() => toggleTag(t)}
                            className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                              tags.includes(t) ? "border-accent-strong bg-accent-strong/15 text-primary" : "bg-card text-secondary"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button type="button" onClick={saveNote} disabled={busy} className={ghost}>
                        {busy ? "Saving…" : "Save feedback"}
                      </button>
                      {noteSaved && <span className="text-[13px] text-accent-strong">Saved</span>}
                    </div>
                    {reviewMsg && <p role="alert" className="text-[13px] text-jesus-red">{reviewMsg}</p>}
                  </div>
                )}

                {verdict === "needs_work" && (
                  <p className="text-[13px] text-secondary">
                    This won&rsquo;t publish. Adjust and <span className="text-primary">Generate Again</span> when you&rsquo;re ready.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Step>

      {/* Step 4 — Publish Final */}
      <Step n={4} title="Publish Final" state={step4}>
        <button type="button" onClick={publishFinal} disabled={!canPublish || busy} className={primary}>
          {publishing ? "Publishing…" : "Publish Final"}
        </button>
        {publishMsg && <p role="alert" className="mt-2.5 text-[13px] text-jesus-red">{publishMsg}</p>}
        {published ? (
          <p className="mt-2.5 text-[13px] font-medium text-accent-strong">
            ✓ Published — {book} {chapter} is live.{" "}
            <a href={`/chapter/${slug}`} target="_blank" rel="noreferrer" className="underline">View it ↗</a>
          </p>
        ) : (
          <p className="mt-2.5 text-[13px] text-secondary">
            {!draftReady
              ? "Generate a draft first."
              : !previewed
                ? "Preview the draft first."
                : verdict !== "yes"
                  ? "Confirm it feels like Selah above to unlock publishing."
                  : "Ready to go live."}
          </p>
        )}
      </Step>

      {/* Settings and history stay out of the main launch flow. */}
      <div className="mt-2 rounded-lg border bg-card shadow-hair">
        <button
          type="button"
          aria-expanded={showAdvanced}
          aria-controls="studio-settings-panel"
          onClick={() => {
            setShowAdvanced((v) => !v);
            if (!audit) void loadAudit();
            if (!rules) void loadRules();
            if (!examples) void loadExamples();
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-[14px] font-medium text-primary"
        >
          Settings &amp; history
          <span className="text-secondary">{showAdvanced ? "⌃" : "⌄"}</span>
        </button>
        {showAdvanced && (
          <div id="studio-settings-panel" className="space-y-3 border-t px-4 py-4">
            <Toggle label="Create text drafts" checked={settings.text_generation_enabled} onChange={(v) => setS("text_generation_enabled", v)} />
            <Toggle
              label="Create chapter images"
              hint="Keep off until the text is approved"
              checked={settings.image_generation_enabled}
              onChange={(v) => setS("image_generation_enabled", v)}
            />
            <Toggle label="Confirm before spending credit" checked={settings.require_confirm} onChange={(v) => setS("require_confirm", v)} />
            <p className="text-[12px] text-secondary">
              Chapter access and the approved AI setup are managed automatically.
            </p>

            <button type="button" onClick={saveSettings} disabled={busy} className={primary}>
              {busy ? "…" : "Save settings"}
            </button>

            {/* What Selah Has Learned — active global rules */}
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-primary">Selah Brain rules</summary>
              <div className="mt-1.5 space-y-1.5">
                {rules === null ? (
                  <p className="text-[12px] text-secondary">Loading…</p>
                ) : rules.length === 0 ? (
                  <p className="text-[12px] text-secondary">
                    No rules yet. Add one from a review, or run the Selah Brain SQL to seed the starters.
                  </p>
                ) : (
                  rules.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-2 rounded-lg border bg-card-soft px-2.5 py-2 ${r.active ? "" : "opacity-50"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-primary" title={r.rule_text}>{r.title}</p>
                        <p className="text-[11px] text-secondary">
                          {r.rule_id ? `${r.rule_id} · ` : ""}{r.category}{r.priority ? ` · ${r.priority}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRule(r.id, !r.active)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          r.active ? "border-accent-strong bg-accent-strong/15 text-primary" : "bg-card text-secondary"
                        }`}
                      >
                        {r.active ? "Active" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRule(r.id)}
                        title="Remove rule"
                        className="rounded-full px-1.5 text-[14px] text-secondary hover:text-jesus-red"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </details>

            {/* Approved Examples — voice exemplars retrieved by genre */}
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-primary">Approved examples</summary>
              <div className="mt-1.5 space-y-1.5">
                {examples === null ? (
                  <p className="text-[12px] text-secondary">Loading…</p>
                ) : examples.length === 0 ? (
                  <p className="text-[12px] text-secondary">No approved examples yet.</p>
                ) : (
                  examples.map((x) => (
                    <div key={x.id} className={`flex items-center gap-2 rounded-lg border bg-card-soft px-2.5 py-2 ${x.active ? "" : "opacity-50"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-primary">{x.title}</p>
                        <p className="text-[11px] text-secondary">{x.genre} · {x.example_type}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExample(x.id, !x.active)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${x.active ? "border-accent-strong bg-accent-strong/15 text-primary" : "bg-card text-secondary"}`}
                      >
                        {x.active ? "Active" : "Off"}
                      </button>
                      <button type="button" onClick={() => removeExample(x.id)} title="Remove example" className="rounded-full px-1.5 text-[14px] text-secondary hover:text-jesus-red">×</button>
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="border-t pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-primary">Recent activity</summary>
              <div className="mt-1.5 space-y-1">
                {audit === null ? (
                  <p className="text-[12px] text-secondary">Loading…</p>
                ) : audit.length === 0 ? (
                  <p className="text-[12px] text-secondary">Nothing yet.</p>
                ) : (
                  audit.map((e, i) => (
                    <p key={i} className="text-[12px] text-secondary">
                      <span className="text-primary">{e.action}</span>
                      {e.slug ? ` · ${e.slug}` : ""} · {e.status}
                      {e.created_at ? ` · ${e.created_at.slice(0, 16).replace("T", " ")}` : ""}
                    </p>
                  ))
                )}
              </div>
            </details>
            <p className="text-[11px] text-secondary">
              Last saved: {settings.updated_at ? settings.updated_at.slice(0, 16).replace("T", " ") : "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- small presentational helpers ----------------
function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children: ReactNode }) {
  const badge = state === "todo" ? "bg-card-soft text-secondary" : "bg-accent-strong text-white";
  return (
    <section
      className={`rounded-xl border bg-card p-4 shadow-hair transition ${state === "todo" ? "opacity-55" : ""} ${
        state === "current" ? "ring-1 ring-accent-strong/40" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${badge}`}>
          {state === "done" ? "✓" : n}
        </span>
        <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
      </div>
      <div className="mt-3 pl-[34px]">{children}</div>
    </section>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-[13px] transition ${
        active ? "border-transparent bg-accent-strong text-white" : "bg-card text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[14px] text-primary">
      <span>
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-secondary">({hint})</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function DraftWaitCard({ reference }: { reference: string }) {
  return (
    <div role="status" aria-live="polite" className="mt-3 rounded-lg border bg-card-soft p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-strong" aria-hidden="true" />
        <p className="text-[14px] font-semibold text-primary">Creating your private {reference} draft</p>
      </div>
      <p className="mt-2 text-[13px] text-secondary">
        This usually takes 2–4 minutes while Selah studies the chapter, writes the work-up, and checks it for completeness.
      </p>
      <p className="mt-2 text-[13px] font-medium text-primary">
        Nothing will publish automatically. Images come later, after you approve the text.
      </p>
      <p className="mt-2 text-[12px] text-secondary">
        You may safely leave this page and return. Studio will find the draft when it is ready.
      </p>
    </div>
  );
}
