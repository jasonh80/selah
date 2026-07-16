"use client";

import {
  PREPARE_NOTE_GROUPS,
  prepareSummaryLine,
  type PrepareChapterViewModel,
} from "@/lib/studio-prepare-chapter";

// The Prepare Chapter screen (owner decision A5 + Codex spec, board #29,
// 2026-07-16): the Brain's whole proposal on ONE scrollable page — chapter
// path, guidance notes plainly grouped, locations, watch-outs — read once,
// approved once with a single primary action in a sticky finish row. No
// per-item switches, no new gates. Approval seeds preparation only: nothing
// is generated, fetched from the ESV, or published from this screen.
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
  onApprove: () => void;
  onBack: () => void;
}) {
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
                className="flex items-baseline gap-2.5 rounded-md border bg-card px-3 py-2 text-[13px]"
              >
                <span className="shrink-0 font-semibold text-accent-strong">{index + 1}</span>
                <span className="text-primary">
                  {movement.startVerse === movement.endVerse
                    ? `Verse ${movement.startVerse}`
                    : `Verses ${movement.startVerse}–${movement.endVerse}`}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-primary">Chapter guidance</h2>
          <p className="mt-0.5 text-[12px] text-secondary">
            {proposal.notes.length} notes the writing AI must honor
          </p>
          {grouped.map(({ group, notes }) => (
            <div key={group} className="mt-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-secondary">
                {group}
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed text-primary"
                  >
                    {note.text}
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
              No location entries yet — maps ride a later config pass after you
              approve the location library. Preparing now changes nothing about maps.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {proposal.locations.map((location) => (
                <li
                  key={location.name}
                  className="rounded-md border bg-card px-3 py-2 text-[13px]"
                >
                  <span className="font-semibold text-primary">{location.name}</span>
                  <span className="text-secondary"> — {location.certainty}. {location.display}</span>
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
            onClick={onApprove}
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
