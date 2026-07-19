"use client";

// Self-serve Prepare card (IQ-011, owner decision 2026-07-18). Renders in
// Step 2 for every chapter OUTSIDE the protected Mark lane that has no draft
// yet: create one preparation proposal (estimated conservative ceiling shown, one confirmation, no
// auto-retry), review it calmly — Passage flow · What Selah should notice ·
// Watch-outs · Places (hidden when not useful) — then Approve & set up
// (digest-bound) or Reject. Approval alone unlocks the separate, separately
// confirmed Generate Draft flow; it spends nothing itself.
import { useCallback, useEffect, useRef, useState } from "react";

interface ProposalMovement {
  id: string;
  startVerse: number;
  endVerse: number;
  name: string;
  reason: string;
}
interface ProposalLocation {
  name: string;
  featureKind: string;
  certainty: string;
  role: string;
  display: string;
}
interface ProposalContent {
  sourceReference: string;
  expectedVerseCount: number;
  movements: ProposalMovement[];
  notes: { id: string; text: string }[];
  watchouts: string[];
  textualVariants: string[];
  locations: ProposalLocation[];
}
interface ProposalStatus {
  ok: boolean;
  status: "none" | "generating" | "running" | "proposed" | "failed" | "approved" | "superseded";
  proposal: ProposalContent | null;
  proposalDigest: string | null;
  error: string | null;
  maxCostUsd: number;
}

export function PrepareProposalCard({
  slug,
  chapterLabel,
  api,
  onApproved,
}: {
  slug: string;
  chapterLabel: string;
  api: (method: "GET" | "POST", body?: unknown) => Promise<unknown>;
  onApproved: () => void;
}) {
  const [state, setState] = useState<ProposalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSlug = useRef(slug);

  const refresh = useCallback(async () => {
    activeSlug.current = slug;
    let res: (ProposalStatus & { error?: string }) | null = null;
    let dropped = false;
    try {
      res = (await api("POST", { action: "prepare_proposal_status", slug })) as ProposalStatus & { error?: string };
    } catch {
      dropped = true; // connection drop: keep polling rather than sticking
    }
    if (activeSlug.current !== slug) return;
    if (dropped || !res) {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => void refresh(), 7000);
      return;
    }
    if (!res.ok) {
      // Lane-refused chapter (protected/legacy) renders nothing; a 503
      // storage outage keeps polling — the server is the authority either way.
      const outage = /storage/.test(res.error ?? "");
      if (outage) {
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = setTimeout(() => void refresh(), 7000);
        return;
      }
      setState({ ok: false, status: "none", proposal: null, proposalDigest: null, error: null, maxCostUsd: 0, ineligible: true } as ProposalStatus & { ineligible: boolean });
      return;
    }
    setState(res);
    // generating (queued) and running (worker consumed) are ONE waiting state
    // for the owner — keep polling through both (Codex #58 P1-6).
    if (res.status === "generating" || res.status === "running") {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => void refresh(), 5000);
    }
  }, [api, slug]);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refresh]);

  async function create() {
    setBusy(true);
    setMessage("");
    try {
      const res = (await api("POST", { action: "prepare_proposal_create", slug, confirm: true })) as {
        ok: boolean;
        error?: string;
      };
      if (!res?.ok) {
        setMessage(res?.error ?? "The proposal could not be started.");
        return;
      }
      void refresh();
    } catch {
      setMessage("The connection dropped — check the status again before retrying.");
      void refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function decide(action: "prepare_proposal_approve" | "prepare_proposal_reject") {
    if (!state?.proposalDigest) return;
    setBusy(true);
    setMessage("");
    try {
      const res = (await api("POST", {
        action,
        slug,
        proposalDigest: state.proposalDigest,
        ...(action === "prepare_proposal_approve" ? { confirm: true } : {}),
      })) as { ok: boolean; error?: string };
      if (!res?.ok) {
        setMessage(res?.error ?? "That decision could not be recorded.");
        void refresh();
        return;
      }
      if (action === "prepare_proposal_approve") onApproved();
      void refresh();
    } catch {
      setMessage("The connection dropped — the decision may not have been recorded; check the status.");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  const ghost =
    "rounded-full border bg-card px-4 py-2 text-[13px] font-medium text-secondary transition hover:text-primary";
  const primary =
    "rounded-full bg-accent-strong px-4 py-2 text-[13px] font-medium text-white shadow-hair transition disabled:opacity-50";

  if (!state) {
    return <p className="text-[13px] text-secondary">Checking {chapterLabel} preparation…</p>;
  }
  if ((state as ProposalStatus & { ineligible?: boolean }).ineligible) {
    return null; // this chapter is served by another lane (or storage is off)
  }

  if (state.status === "generating" || state.status === "running") {
    return (
      <div className="rounded-lg border bg-card-soft p-3">
        <p className="text-[13px] font-medium text-primary">Creating the {chapterLabel} preparation proposal</p>
        <p className="mt-1 text-[12px] text-secondary">
          One bounded request; structured proposal data only. Nothing is drafted, imaged, or published by this step.
        </p>
      </div>
    );
  }

  if (state.status === "approved") {
    return (
      <p className="mb-2.5 text-[13px] font-medium text-accent-strong">
        ✓ {chapterLabel} preparation approved — Generate Draft is unlocked below.
      </p>
    );
  }

  if (state.status === "proposed" && state.proposal) {
    const p = state.proposal;
    return (
      <div className="space-y-3 rounded-lg border bg-card-soft p-3">
        <p className="text-[13px] font-medium text-primary">
          Review the {chapterLabel} preparation ({p.expectedVerseCount} verses)
        </p>
        <div>
          <p className="text-eyebrow">Passage flow</p>
          <ul className="mt-1 space-y-1">
            {p.movements.map((m) => (
              <li key={m.id} className="text-[13px] text-primary">
                <span className="font-medium">
                  {m.startVerse}–{m.endVerse} · {m.name}
                </span>
                <span className="text-secondary"> — {m.reason}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-eyebrow">What Selah should notice</p>
          <ul className="mt-1 space-y-1">
            {p.notes.map((n) => (
              <li key={n.id} className="text-[13px] text-secondary">
                {n.text}
              </li>
            ))}
          </ul>
        </div>
        {p.watchouts.length > 0 && (
          <div>
            <p className="text-eyebrow">Watch-outs</p>
            <ul className="mt-1 space-y-1">
              {p.watchouts.map((w) => (
                <li key={w} className="text-[13px] text-secondary">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.textualVariants.length > 0 && (
          <div>
            <p className="text-eyebrow">Textual variants</p>
            <ul className="mt-1 space-y-1">
              {p.textualVariants.map((v) => (
                <li key={v} className="text-[13px] text-secondary">
                  {v}
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.locations.length > 0 && (
          <div>
            <p className="text-eyebrow">Places</p>
            <ul className="mt-1 space-y-1">
              {p.locations.map((l) => (
                <li key={l.name} className="text-[13px] text-secondary">
                  <span className="font-medium text-primary">{l.name}</span> · {l.featureKind}/{l.certainty} —{" "}
                  {l.display}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void decide("prepare_proposal_approve")} className={primary}>
            Approve &amp; set up
          </button>
          <button type="button" disabled={busy} onClick={() => void decide("prepare_proposal_reject")} className={ghost}>
            Reject
          </button>
        </div>
        <p className="text-[12px] text-secondary">
          Approval binds exactly this reviewed proposal. It spends nothing; the draft itself stays a separate,
          separately confirmed step. Editing a proposal on-screen is not built yet — to change one, Reject it and
          create a fresh proposal.
        </p>
        {message && <p className="text-[12px] text-red-400">{message}</p>}
      </div>
    );
  }

  // none / failed / superseded → offer creation (with the failure reason shown
  // plainly when there is one).
  return (
    <div className="rounded-lg border bg-card-soft p-3">
      <p className="text-[13px] font-medium text-primary">Prepare {chapterLabel}</p>
      <p className="mt-1 text-[12px] text-secondary">
        {chapterLabel} has no approved preparation yet. Studio can propose one — movements, guidance, watch-outs, and
        honest places only when useful — for you to review before anything is drafted.
      </p>
      {state.status === "failed" && state.error && (
        <p className="mt-2 text-[12px] text-red-400">Last attempt stopped: {state.error}</p>
      )}
      {confirming ? (
        <div className="mt-2.5">
          <p className="text-[13px] text-primary">
            Create one preparation proposal for {chapterLabel}? Estimated conservative ceiling about ${state.maxCostUsd.toFixed(2)} —
            exactly one request, no automatic retry. It cannot draft, image, or publish anything.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void create()} className={primary}>
              Create proposal
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={ghost}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={`${primary} mt-2.5`}>
          Create preparation proposal
        </button>
      )}
      {message && <p className="mt-2 text-[12px] text-red-400">{message}</p>}
    </div>
  );
}
