"use client";

import { useState } from "react";
import {
  PREPARE_NOTE_GROUPS,
  prepareSummaryLine,
  type PrepareChapterViewModel,
} from "@/lib/studio-prepare-chapter";

// The Prepare Chapter screen (owner decision A5 + Codex spec, board #29,
// 2026-07-16): the Brain's whole proposal on ONE scrollable page — chapter
// path with each movement's name and reason, the ten guidance notes plainly
// grouped and EDITABLE inline, locations under the honest certainty model,
// and watch-outs — read once, approved once with a single primary action in
// a sticky finish row. No per-item switches, no new gates. Approval seeds
// preparation only: nothing is generated, fetched from the ESV, or published
// from this screen.
export function PrepareChapterScreen({
  proposal,
  busy,
  error,
  onApprove,
  onBack,
}: {
  proposal: PrepareChapterViewModel;
  busy: boolean;
  error: string;
  onApprove: (editedNoteTexts: Record<string, string>) => void;
  onBack: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const grouped = PREPARE_NOTE_GROUPS.map((group) => ({
    group,
    notes: proposal.notes.filter((note) => note.group === group),
  })).filter((entry) => entry.notes.length > 0);
  const editedCount = proposal.notes.filter(
    (note) => (edits[note.id] ?? note.text).trim() !== note.text,
  ).length;

  const certaintyBadge: Record<string, string> = {
    known: "Known place",
    debated: "Debated area",
    uncertain: "Uncertain — no pin",
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-32 pt-6">
        <header>
          <h1 className="text-[24px] font-semibold text-primary">
            Prepare {proposal.label}
          </h1>
          <p className="mt-1 text-[13px] text-secondary">
            Nothing is generated or published yet.
          </p>
        </header>

        <section className="mt-5">
          <h2 className="text-[15px] font-semibold text-primary">Chapter path</h2>
          <p className="mt-0.5 text-[12px] text-secondary">
            {proposal.expectedVerseCount} verses in {proposal.movements.length} movements
          </p>
          <ol className="mt-2 space-y-1.5">
            {proposal.movements.map((movement, index) => (
              <li
                key={movement.id}
                className="rounded-md border bg-card px-3 py-2 text-[13px]"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="shrink-0 font-semibold text-accent-strong">{index + 1}</span>
                  <span className="font-semibold text-primary">
                    {movement.name || "Untitled movement"}
                  </span>
                  <span className="ml-auto shrink-0 text-secondary">
                    {movement.startVerse === movement.endVerse
                      ? `v. ${movement.startVerse}`
                      : `vv. ${movement.startVerse}–${movement.endVerse}`}
                  </span>
                </div>
                {movement.reason && (
                  <p className="mt-1 pl-[22px] text-[12px] leading-relaxed text-secondary">
                    {movement.reason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-primary">Chapter guidance</h2>
          <p className="mt-0.5 text-[12px] text-secondary">
            {proposal.notes.length} notes the writing AI must honor — edit any note
            before approving; the exact wording you approve is what gets used.
          </p>
          {grouped.map(({ group, notes }) => (
            <div key={group} className="mt-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-secondary">
                {group}
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {notes.map((note) => (
                  <li key={note.id}>
                    <textarea
                      value={edits[note.id] ?? note.text}
                      onChange={(event) =>
                        setEdits((current) => ({ ...current, [note.id]: event.target.value }))
                      }
                      rows={3}
                      className="w-full resize-y rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed text-primary"
                      aria-label={`Guidance note ${note.id}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-primary">Locations</h2>
          {proposal.locations.length === 0 ? (
            <p className="mt-1.5 rounded-md border bg-card-soft px-3 py-2 text-[13px] text-secondary">
              No location entries for this chapter yet.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {proposal.locations.map((location) => (
                <li
                  key={location.name}
                  className="rounded-md border bg-card px-3 py-2 text-[13px]"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-primary">{location.name}</span>
                    <span className="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-secondary">
                      {certaintyBadge[location.certainty] ?? location.certainty}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                    {location.display}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-primary">Watch-outs</h2>
          <ul className="mt-1.5 space-y-1.5">
            {proposal.watchouts.map((watchout) => (
              <li
                key={watchout}
                className="rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed text-primary"
                style={{ borderLeft: "3px solid var(--accent-strong)" }}
              >
                {watchout}
              </li>
            ))}
            {proposal.textualVariants.map((variant) => (
              <li
                key={variant}
                className="rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed text-secondary"
              >
                Textual note: {variant}
              </li>
            ))}
          </ul>
        </section>

        {error && (
          <p className="mt-5 rounded-md border bg-card-soft px-3 py-2 text-[13px] text-jesus-red">
            {error}
          </p>
        )}
      </div>

      {/* Sticky finish row: summary, Back, ONE primary action. */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-card">
        <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center gap-2.5 px-4 py-3">
          <span className="mr-auto text-[12px] text-secondary">
            {prepareSummaryLine(proposal)}
            {editedCount > 0 ? ` · ${editedCount} edited` : ""}
          </span>
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="rounded-full border bg-card px-4 py-2 text-[13px] font-medium text-secondary hover:text-primary"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => onApprove(edits)}
            disabled={busy}
            className="rounded-full bg-accent-strong px-4 py-2 text-[13px] font-semibold text-white shadow-hair disabled:opacity-60"
          >
            {busy ? "Preparing…" : `Approve & prepare ${proposal.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
