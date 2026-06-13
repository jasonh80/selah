import { Logo } from "@/components/Logo";

// Placeholder shown while a chapter's FIRST shared workup is being generated.
// Not wired to any AI pipeline yet — it exists so the lazy-generation flow can
// later render this instead of a 404 on a chapter's first ever request.
const STEPS = [
  "Reading the chapter",
  "Building the visual workup",
  "Preparing maps and timeline",
  "Creating image directions",
  "Centering the chapter on Jesus",
];

export function GeneratingChapterState({ chapterLabel }: { chapterLabel: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo className="text-[17px] text-accent-strong" />

      <div className="mt-10 w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-tint">
          <span className="h-3 w-3 animate-pulse rounded-full bg-accent-strong" />
        </div>

        <h1 className="text-section text-primary">Preparing {chapterLabel}</h1>
        <p className="mt-2 text-body text-secondary">
          Selah is creating the first shared workup for this chapter.
        </p>
        <p className="mt-1 text-[13px] text-secondary">
          This only happens once. Future readers will load it instantly.
        </p>

        <ul className="mx-auto mt-7 max-w-[260px] space-y-2.5 text-left">
          {STEPS.map((step) => (
            <li key={step} className="flex items-center gap-2.5 text-sm text-secondary">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
