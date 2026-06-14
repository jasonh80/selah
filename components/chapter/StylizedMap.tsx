// A minimal, elegant, theme-aware stylized region map drawn as inline SVG.
// No placeholder image files, no Google, no generated art. Colors come from the
// active theme via CSS variables, so it adapts (Air gray/blue, Living Water
// ocean, Garden olive, Starlight muted, Sonrise/Sonset desert stone).
//
// Geography is intentionally soft/representative (not precise) — the Judean
// hill country around Jerusalem & Bethlehem, suitable for Psalm 23.

type Place = { x: number; y: number; label: string; below?: boolean };

const PLACES: Place[] = [
  { x: 196, y: 70, label: "Jerusalem" },
  { x: 182, y: 96, label: "Bethlehem", below: true },
];

export function StylizedMap({
  variant,
  regionLabel,
}: {
  variant: "ancient" | "modern";
  regionLabel: string;
}) {
  const dashed = variant === "ancient";
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-sm" style={{ background: "var(--card-soft)" }}>
      <svg viewBox="0 0 320 180" className="h-full w-full" role="img" aria-label={`${regionLabel} — approximate stylized map`}>
        {/* layered shepherding hills */}
        <path d="M0,116 C50,98 92,106 140,99 C196,91 250,103 320,94 L320,180 L0,180 Z" style={{ fill: "var(--accent)", opacity: 0.14 }} />
        <path d="M0,134 C60,120 112,130 172,123 C232,117 282,129 320,123 L320,180 L0,180 Z" style={{ fill: "var(--accent)", opacity: 0.24 }} />

        {/* Dead Sea / water to the east */}
        <path d="M244,60 C253,78 253,98 242,114 C236,100 236,74 244,60 Z" style={{ fill: "var(--accent-strong)", opacity: 0.3 }} />

        {/* region of Judah */}
        <path
          d="M150,40 C182,31 216,42 224,66 C232,92 214,114 184,118 C150,122 124,108 120,80 C117,57 124,48 150,40 Z"
          style={{ fill: "var(--accent)", opacity: 0.1, stroke: "var(--accent-strong)", strokeOpacity: 0.55, strokeWidth: 1.4 }}
          strokeDasharray={dashed ? "4 4" : undefined}
          fillRule="evenodd"
        />

        {/* region label */}
        <text x="138" y="60" textAnchor="middle" style={{ fill: "var(--text-secondary)", letterSpacing: "0.12em" }} fontSize="8" fontWeight={600}>
          {regionLabel.toUpperCase()}
        </text>

        {/* places */}
        {PLACES.map((p) => (
          <g key={p.label}>
            {variant === "modern" ? (
              <path
                d={`M${p.x},${p.y - 8} C${p.x + 5},${p.y - 8} ${p.x + 5},${p.y - 1} ${p.x},${p.y + 2} C${p.x - 5},${p.y - 1} ${p.x - 5},${p.y - 8} ${p.x},${p.y - 8} Z`}
                style={{ fill: "var(--accent-strong)" }}
              />
            ) : (
              <circle cx={p.x} cy={p.y} r={3.2} style={{ fill: "var(--card)", stroke: "var(--accent-strong)", strokeWidth: 2 }} />
            )}
            <text
              x={p.x + 9}
              y={p.below ? p.y + 11 : p.y + 1}
              style={{ fill: "var(--text-primary)" }}
              fontSize="9"
              fontWeight={600}
            >
              {p.label}
            </text>
          </g>
        ))}

        {/* approximate tag */}
        <text x="312" y="18" textAnchor="end" style={{ fill: "var(--text-secondary)", letterSpacing: "0.1em" }} fontSize="7.5" fontWeight={600}>
          APPROXIMATE
        </text>
      </svg>
    </div>
  );
}
