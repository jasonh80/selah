export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark select-none text-primary ${className}`}>
      Selah
    </span>
  );
}
