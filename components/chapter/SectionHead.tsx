// Small uppercase eyebrow + editorial title. App-section feel, not a blog heading.
export function SectionHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <p className="text-eyebrow">{eyebrow}</p>
        <h2 className="text-section mt-0.5 text-primary">{title}</h2>
      </div>
      {action && (
        <button className="flex items-center gap-0.5 pb-1 text-sm font-medium text-secondary">
          {action} <span className="text-xs">›</span>
        </button>
      )}
    </div>
  );
}
