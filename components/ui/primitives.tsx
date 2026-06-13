import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-card border bg-card shadow-card ${
        accent ? "ring-1 ring-accent/20" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "jesus";
}) {
  const tones = {
    default: "bg-tint text-primary",
    accent: "bg-accent/12 text-accent-strong",
    jesus: "bg-jesus-red/10 text-jesus-red",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {eyebrow && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-strong">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-2xl font-semibold text-primary md:text-[28px]">
        {title}
      </h2>
    </div>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-secondary">
      {children}
    </p>
  );
}
