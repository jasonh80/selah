import type { ReactNode } from "react";

// Consistent centered container + heading for the non-chapter app pages.
export function PageBody({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[760px] px-4 pb-12 pt-5">
      <div className="mb-6">
        <p className="text-eyebrow">{eyebrow}</p>
        <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.02em] text-primary">
          {title}
        </h1>
        {sub && <p className="text-body mt-1.5 text-secondary">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function ComingLater() {
  return (
    <span className="rounded-full bg-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-strong">
      Coming later
    </span>
  );
}
