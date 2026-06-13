// Small uppercase eyebrow + editorial title. App-section feel, not a blog heading.
export function SectionHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  action?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
        <h2 className="text-section mt-0.5 text-primary">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-secondary">{sub}</p>}
      </div>
      {action && (
        <button className="flex shrink-0 items-center gap-0.5 pb-1 text-sm font-medium text-secondary">
          {action} <span className="text-xs">›</span>
        </button>
      )}
    </div>
  );
}
