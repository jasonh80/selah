"use client";

// Published-chapter single-image redo card (Codex APPROVE WITH CONDITIONS,
// board #29 2026-07-19). Renders ONLY for a live (reviewed) connected chapter.
// Flow, each step separately owner-driven:
//   pick image + notes → Check cost (free) → exact max charge shown →
//   Create one candidate (confirmation 1; one request, no auto-retry; the
//   LIVE page is untouched) → side-by-side review, open full size →
//   "Use on live chapter" (confirmation 2, digest/revision-bound) or Reject.
// After an apply, one-click owner-confirmed rollback stays available.
import { useCallback, useEffect, useRef, useState } from "react";

interface LiveImage {
  kind: string;
  label: string;
  src: string;
}
interface RedoRow {
  jobId: string;
  status:
    | "queued"
    | "running"
    | "candidate"
    | "failed"
    | "blocked"
    | "rejected"
    | "applied"
    | "rolled_back";
  kind: string;
  notes: string;
  candidateUrl: string | null;
  baseSrc: string;
  errorCode: string | null;
  spentCount: number;
  createdAt: string;
}
interface RedoStatus {
  ok: boolean;
  images: LiveImage[];
  redo: RedoRow | null;
  error?: string;
}
interface Preflight {
  kind: string;
  label: string;
  currentSrc: string;
  model: string;
  size: string;
  estimatedCostUsd: number;
  bindingDigest: string;
}

const HTTPS = /^https:\/\//u;
const SHA256 = /^[a-f0-9]{64}$/u;

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function PublishedRedoCard({
  slug,
  chapterLabel,
  api,
  imagesOff,
  onApplied,
}: {
  slug: string;
  chapterLabel: string;
  api: (method: "GET" | "POST", body?: unknown) => Promise<unknown>;
  imagesOff: boolean;
  onApplied: () => void;
}) {
  const [state, setState] = useState<RedoStatus | null>(null);
  const [kind, setKind] = useState("");
  const [notes, setNotes] = useState("");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [openedCandidateUrl, setOpenedCandidateUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSlug = useRef(slug);

  const refresh = useCallback(async () => {
    activeSlug.current = slug;
    let res: RedoStatus | null = null;
    let dropped = false;
    try {
      res = (await api("POST", { action: "published_redo_status", slug })) as RedoStatus;
    } catch {
      dropped = true; // connection drop: keep polling rather than sticking
    }
    if (activeSlug.current !== slug) return;
    if (dropped || !res || !res.ok) {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => void refresh(), 7000);
      return;
    }
    // Strict parses: malformed URLs or digests are treated as absent facts.
    const images = Array.isArray(res.images)
      ? res.images.filter((image) => HTTPS.test(image?.src ?? ""))
      : [];
    setState({ ...res, images });
    const status = res.redo?.status;
    if (status === "queued" || status === "running") {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => void refresh(), 6000);
    }
  }, [api, slug]);

  useEffect(() => {
    setPreflight(null);
    setOpenedCandidateUrl("");
    setMessage("");
    void refresh();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refresh]);

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setMessage("");
    try {
      return (await api("POST", body)) as Record<string, unknown>;
    } catch {
      setMessage("The connection dropped — check the status again before retrying.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function checkCost() {
    const res = await post({ action: "published_redo_preflight", slug, kind, notes });
    if (!res) return void refresh();
    if (res.ok !== true) {
      setMessage(String(res.error ?? "The cost check failed."));
      return;
    }
    const redo = res.redo as Preflight | undefined;
    if (!redo || !SHA256.test(redo.bindingDigest ?? "")) {
      setMessage("The cost check returned an unreadable answer — try again.");
      return;
    }
    setPreflight(redo);
  }

  async function createCandidate() {
    if (!preflight) return;
    const res = await post({
      action: "published_redo",
      slug,
      kind: preflight.kind,
      notes,
      bindingDigest: preflight.bindingDigest,
      confirm: true,
    });
    setPreflight(null);
    if (res && res.ok !== true) setMessage(String(res.error ?? "The candidate could not be started."));
    void refresh();
  }

  async function applyCandidate(row: RedoRow) {
    if (!row.candidateUrl || openedCandidateUrl !== row.candidateUrl) return;
    const res = await post({
      action: "published_redo_apply",
      slug,
      jobId: row.jobId,
      kind: row.kind,
      candidateUrl: row.candidateUrl,
      confirm: true,
    });
    if (res && res.ok !== true) {
      setMessage(String(res.error ?? "The apply was refused — the live chapter is unchanged."));
    } else if (res) {
      onApplied();
    }
    void refresh();
  }

  async function rejectCandidate() {
    const res = await post({ action: "published_redo_reject", slug });
    if (res && res.ok !== true) setMessage(String(res.error ?? "Nothing was cleared."));
    void refresh();
  }

  async function rollback(row: RedoRow) {
    const res = await post({ action: "published_redo_rollback", slug, jobId: row.jobId, confirm: true });
    if (res && res.ok !== true) {
      setMessage(String(res.error ?? "The rollback was refused — the live chapter is unchanged."));
    } else if (res) {
      onApplied();
    }
    void refresh();
  }

  if (!state) return null;
  const row = state.redo;
  const waiting = row?.status === "queued" || row?.status === "running";
  const idle =
    !row || row.status === "rejected" || row.status === "rolled_back" || row.status === "failed" || row.status === "applied";

  return (
    <div className="mt-3 rounded-lg border bg-card-soft p-4">
      <p className="text-[13px] font-semibold text-primary">Fix one live image</p>
      <p className="mt-1 text-[12px] text-secondary">
        Creates one replacement candidate for {chapterLabel}. The live chapter does not change until you
        approve the result in a second step, and a rollback snapshot is saved before any change.
      </p>

      {idle && (
        <div className="mt-3 space-y-2.5">
          {row?.status === "failed" && (
            <p role="alert" className="text-[13px] text-jesus-red">
              The last attempt failed ({row.errorCode ?? "unknown"}
              {row.spentCount > 0 ? "; its possible spend is recorded" : "; no credit was used"}). Start a
              fresh one when ready.
            </p>
          )}
          {row?.status === "applied" && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[13px] font-medium text-accent-strong">
                ✓ The live “{row.kind}” image uses your approved candidate.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void rollback(row)}
                className="mt-2 rounded-lg border px-3 py-1.5 text-[13px] text-primary disabled:opacity-50"
              >
                Roll back to the previous image
              </button>
              <p className="mt-1 text-[11px] text-secondary">
                Owner-confirmed; revalidates the whole chapter and saves another snapshot first.
              </p>
            </div>
          )}
          <div>
            <p className="text-[12px] font-medium text-primary">Which image?</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {state.images.map((image) => (
                <button
                  key={image.kind}
                  type="button"
                  onClick={() => {
                    setKind(image.kind);
                    setPreflight(null);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] ${
                    kind === image.kind ? "border-accent-strong font-semibold text-primary" : "text-secondary"
                  }`}
                >
                  {image.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setPreflight(null);
            }}
            maxLength={600}
            rows={2}
            placeholder="What should change? (kept exact — the rest of the scene stays the same)"
            className="w-full rounded-lg border bg-card p-2 text-[13px] text-primary"
          />
          {!preflight ? (
            <button
              type="button"
              disabled={busy || !kind || !notes.trim()}
              onClick={() => void checkCost()}
              className="rounded-lg border px-3 py-1.5 text-[13px] text-primary disabled:opacity-50"
            >
              Check cost (free)
            </button>
          ) : (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[13px] text-primary">
                One candidate image with {preflight.model} at {preflight.size} — maximum charge about{" "}
                <span className="font-semibold">{formatUsd(preflight.estimatedCostUsd)}</span>. Exactly one
                request, no automatic retry. The live chapter stays exactly as it is until you approve the
                result in a second step.
              </p>
              <button
                type="button"
                disabled={busy || imagesOff}
                onClick={() => void createCandidate()}
                className="mt-2 rounded-lg bg-accent-strong px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Create one candidate — about {formatUsd(preflight.estimatedCostUsd)}
              </button>
              {imagesOff && (
                <p className="mt-1 text-[11px] text-secondary">Image generation is switched off in Settings.</p>
              )}
            </div>
          )}
        </div>
      )}

      {waiting && (
        <p className="mt-3 text-[13px] text-secondary">
          Creating the candidate… the live chapter is untouched. This usually takes a minute or two.
        </p>
      )}

      {row?.status === "blocked" && (
        <p role="alert" className="mt-3 text-[13px] text-jesus-red">
          The last attempt stopped after possible spend and its cost could not be recorded — it stays locked
          for attention. Nothing on the live chapter changed.
        </p>
      )}

      {row?.status === "candidate" && row.candidateUrl && (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <figure>
              <img src={row.baseSrc} alt="Current live image" className="w-full rounded-lg border" />
              <figcaption className="mt-1 text-[11px] text-secondary">Live now</figcaption>
            </figure>
            <figure>
              <img src={row.candidateUrl} alt="Replacement candidate" className="w-full rounded-lg border" />
              <figcaption className="mt-1 text-[11px] text-secondary">Candidate (not live)</figcaption>
            </figure>
          </div>
          <button
            type="button"
            onClick={() => {
              window.open(row.candidateUrl!, "_blank", "noreferrer");
              setOpenedCandidateUrl(row.candidateUrl!);
            }}
            className="rounded-lg border px-3 py-1.5 text-[13px] text-primary"
          >
            Open candidate full size ↗
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || openedCandidateUrl !== row.candidateUrl}
              onClick={() => void applyCandidate(row)}
              className="rounded-lg bg-accent-strong px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Use on live chapter
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void rejectCandidate()}
              className="rounded-lg border px-3 py-1.5 text-[13px] text-primary disabled:opacity-50"
            >
              Reject candidate
            </button>
          </div>
          <p className="text-[11px] text-secondary">
            {openedCandidateUrl === row.candidateUrl
              ? "Using it swaps exactly this one image after a rollback snapshot and a full re-check of the chapter."
              : "Open the candidate full size first — approval is bound to exactly what you looked at."}
          </p>
        </div>
      )}

      {message && (
        <p role="alert" className="mt-2.5 text-[13px] text-jesus-red">
          {message}
        </p>
      )}
    </div>
  );
}
