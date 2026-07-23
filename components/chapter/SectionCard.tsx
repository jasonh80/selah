import type { ReactNode } from "react";

/**
 * THE ONE SECTION FRAME (owner ruling 2026-07-23: "I want everything to be
 * more consistent").
 *
 * Before this, a chapter page carried four different header treatments —
 * eyebrow-only, bare h2, icon-chip + card title, and emoji + uppercase label
 * with a purple bar — so every section looked like it came from a different
 * app. From here, EVERY section on the page renders through this component:
 *
 *   [icon chip] Title
 *   optional one-line subtitle
 *   …section content…
 *
 * The rules it enforces:
 *   · One frame: rounded border, card background, one padding scale.
 *   · One header: same icon-chip size, same title font/size/weight/color.
 *   · Accent means something — `tone="jesus"` is the ONLY red, reserved for
 *     Jesus at the Center. Everything else is the standard accent tint.
 *   · `bleed` lets a section (the map, a photo) run its content edge-to-edge
 *     inside the same frame instead of inventing its own box.
 */
export function SectionCard({
  id,
  icon,
  title,
  subtitle,
  tone = "default",
  bleed = false,
  headerRight,
  children,
}: {
  id?: string;
  /** Short glyph — every section has one, always in the same chip. */
  icon: string;
  title: string;
  subtitle?: string;
  tone?: "default" | "jesus";
  /** Content runs edge-to-edge under the header (maps, media). */
  bleed?: boolean;
  /** Small controls that belong on the header row (map chips). */
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const jesus = tone === "jesus";
  return (
    <section
      id={id}
      className={`scroll-mt-20 overflow-hidden rounded-md border bg-card shadow-hair ${
        jesus ? "ring-1 ring-[rgba(178,58,58,0.18)]" : ""
      }`}
    >
      <div className={`flex items-start gap-2 px-3.5 pt-3 ${bleed ? "pb-2.5" : "pb-0"}`}>
        {/* Icons earn their place only where they carry meaning words cannot
            (timeline anchors, map markers, and the one red cross on Jesus at
            the Center). Section headers are typography — quiet and
            consistent. */}
        {jesus && (
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jesus-red-soft text-sm text-jesus-red"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-card-title pt-0.5 ${jesus ? "text-jesus-red" : "text-primary"}`}>{title}</p>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-secondary">{subtitle}</p>}
        </div>
        {headerRight && <div className="flex shrink-0 items-center gap-1.5 pt-0.5">{headerRight}</div>}
      </div>
      <div className={bleed ? "" : "px-3.5 pb-3.5 pt-2"}>{children}</div>
    </section>
  );
}
