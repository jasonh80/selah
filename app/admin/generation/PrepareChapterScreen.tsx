"use client";

import { useState } from "react";
import {
  PREPARE_NOTE_GROUPS,
  prepareLocationBadge,
  prepareNotesEdited,
  prepareSummaryLine,
  type PrepareChapterViewModel,
} from "@/lib/studio-prepare-chapter";

const NOTE_MAX_CHARS = 4000;

// The Prepare Chapter screen (owner decision A5 + Codex spec, board #29,
// 2026-07-16): the Brain's whole proposal on ONE scrollable page — chapter
// path with each movement's name and reason, guidance notes plainly grouped
// and EDITABLE inline (PR #40 review, item 6), honest locations, watch-outs —
// read once, approved once with a single primary action in a sticky finish
// row. No per-item switches, no new gates. Approval binds and seeds the exact
// on-screen packet only: nothing is generated, fetched from the ESV, or
// published from this screen.
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
  onApprove: (editedTexts: Readonly<Record<string, string>>) => void;
  onBack: () => void;
}) {
  // Inline edits live here until the ONE approval submits them. Keyed by
  // note id; absent = unedited.
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

  const textOf = (id: string, original: string) => editedTexts[id] ?? original;
  const edited = prepareNotesEdited(proposal, editedTexts);
  const editedCount = proposal.notes.filter(
    (note) => (editedTexts[note.id] ?? note.text) !== note.text,
  ).length;
  const anyInvalid = proposal.notes.some((note) => {
    const text = textOf(note.id, note.text);
    return text.trim() === "" || text.length > NOTE_MAX_CHARS;
  });

  const grouped = PREPARE_NOTE_GROUPS.map((group) => ({
    group,
    notes: proposal.notes.filter((note) => note.group === group),
  })).filter((entry) => entry.notes.length > 0);


  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-28 pt-6">
        <header>
          <h1 className="text-[24px] font-semibold text-primary">
            Prepare {proposal.label}
          </h1>
          <p className="mt-1 text-[13px] text-secondary">
            Nothing is generated or published yet.
          </p>
          {proposal.proposedBy && (
            <p className="mt-1 text-[11px] text-secondary">
              Proposed by Selah Brain — packet {proposal.proposedBy.packetId} v
              {proposal.proposedBy.packetVersion} · Brain library v
              {proposal.proposedBy.brainLibraryVersion} · writes with{" "}
              {proposal.proposedBy.expectedModel}
            </p>
          )}
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
                  <span className="font-medium text-primary">
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
            {proposal.notes.length} notes the writing AI must honor. Edit any note
            before approving — your approval binds exactly what is on this screen.
          </p>
          {grouped.map(({ group, notes }) => (
            <div key={group} className="mt-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-secondary">
                {group}
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {notes.map((note) => {
                  const current = textOf(note.id, note.text);
                  const noteEdited = current !== note.text;
                  const invalid = current.trim() === "" || current.length > NOTE_MAX_CHARS;
                  return (
                    <li key={note.id} className="rounded-md border bg-card px-3 py-2">
                      <textarea
                        value={current}
                        rows={Math.min(8, Math.max(2, Math.ceil(current.length / 90)))}
                        onChange={(event) =>
                          setEditedTexts((previous) => ({
                            ...previous,
                            [note.id]: event.target.value,
                          }))
                        }
                        disabled={busy}
                        className="w-full resize-y bg-transparent text-[13px] leading-relaxed text-primary outline-none"
                        aria-label={`Guidance note ${note.id}`}
                      />
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        {invalid ? (
                          <span className="text-jesus-red">
                            {current.trim() === ""
                              ? "A note cannot be empty."
                              : `Too long — keep it under ${NOTE_MAX_CHARS} characters.`}
                          </span>
                        ) : noteEdited ? (
                          <span className="font-medium text-accent-strong">Edited</span>
                        ) : (
                          <span className="text-secondary">Proposed</span>
                        )}
                        {noteEdited && !busy && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditedTexts((previous) => {
                                const next = { ...previous };
                                delete next[note.id];
                                return next;
                              })
                            }
                            className="text-secondary underline"
                          >
                            Reset to proposal
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-primary">Locations</h2>
          {proposal.locations.length === 0 ? (
            <p className="mt-1.5 rounded-md border bg-card-soft px-3 py-2 text-[13px] text-secondary">
              No location entries for this chapter yet. Maps render only from
              approved entries — never an invented pin.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {proposal.locations.map((location) => (
                <li
                  key={location.name}
                  className="rounded-md border bg-card px-3 py-2 text-[13px]"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold text-primary">{location.name}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        location.certainty === "known"
                          ? "text-accent-strong"
                          : "text-secondary"
                      }`}
                    >
                      {prepareLocationBadge(location)}
                    </span>
                    {location.role === "context" && (
                      <span className="rounded-full border px-2 py-0.5 text-[11px] text-secondary">
                        context
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-secondary">
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
            onClick={() => onApprove(editedTexts)}
            disabled={busy || anyInvalid}
            className="rounded-full bg-accent-strong px-4 py-2 text-[13px] font-semibold text-white shadow-hair disabled:opacity-60"
          >
            {busy
              ? "Preparing…"
              : edited
                ? `Approve edited packet & prepare ${proposal.label}`
                : `Approve & prepare ${proposal.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
