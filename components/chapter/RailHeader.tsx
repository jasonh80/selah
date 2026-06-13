export function RailHeader({
  icon,
  title,
  action,
}: {
  icon: string;
  title: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-primary">
        <span className="text-accent-strong" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {action && (
        <button className="flex items-center gap-0.5 text-sm font-medium text-secondary">
          {action} <span className="text-xs">›</span>
        </button>
      )}
    </div>
  );
}
