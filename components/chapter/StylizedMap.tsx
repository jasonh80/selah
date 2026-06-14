// An elegant, theme-aware stylized region map drawn as inline SVG — designed
// cartography, not decorative filler. Colors come from the active theme via CSS
// variables, so it stays legible and on-palette in every theme (deep purple in
// Starlight, deep ocean in Living Water, desert stone in Sonrise/Sonset, etc.).
//
// Geography is intentionally representative (not precise): the Judean hill
// country around Jerusalem & Bethlehem, suitable for Psalm 23.

type Place = { x: number; y: number; label: string; below?: boolean };

const PLACES: Place[] = [
  { x: 168, y: 92, label: "Jerusalem" },
  { x: 158, y: 120, label: "Bethlehem", below: true },
];

export function StylizedMap({
  variant,
  regionLabel,
  tag,
}: {
  variant: "ancient" | "modern";
  regionLabel: string;
  tag: string;
}) {
  const dashed = variant === "ancient";
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: "var(--card-soft)" }}>
      <svg viewBox="0 0 300 225" className="h-full w-full" role="img" aria-label={`${regionLabel} — representative stylized map`}>
        {/* faint graticule for a cartographic feel */}
        <g style={{ stroke: "var(--line)", opacity: 0.4 }} strokeWidth={0.6}>
          <line x1="75" y1="8" x2="75" y2="217" />
          <line x1="150" y1="8" x2="150" y2="217" />
          <line x1="225" y1="8" x2="225" y2="217" />
          <line x1="8" y1="75" x2="292" y2="75" />
          <line x1="8" y1="150" x2="292" y2="150" />
        </g>

        {/* hill country shading to the west */}
        <g style={{ stroke: "var(--accent)", opacity: 0.35 }} strokeWidth={1.4} strokeLinecap="round">
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M${60 + i * 9},${150 + (i % 2) * 6} q6,-7 12,0`} fill="none" />
          ))}
        </g>

        {/* region of Judah */}
        <path
          d="M118,52 C152,42 196,52 206,84 C214,112 196,150 158,156 C118,162 88,142 84,106 C81,78 94,62 118,52 Z"
          style={{ fill: "var(--accent)", fillOpacity: 0.16, stroke: "var(--accent-strong)", strokeOpacity: 0.7, strokeWidth: 1.8 }}
          strokeDasharray={dashed ? "5 4" : undefined}
        />
        <text x="112" y="80" textAnchor="middle" style={{ fill: "var(--text-secondary)", letterSpacing: "0.14em" }} fontSize="9" fontWeight={700}>
          {regionLabel.toUpperCase()}
        </text>

        {/* Jordan River + Dead Sea to the east */}
        <path d="M236,40 C228,66 246,80 238,104" fill="none" style={{ stroke: "var(--accent-strong)", opacity: 0.5 }} strokeWidth={1.6} />
        <path d="M240,104 C252,126 252,170 236,190 C229,170 229,126 240,104 Z" style={{ fill: "var(--accent-strong)", fillOpacity: 0.4 }} />
        <text x="244" y="150" style={{ fill: "var(--text-secondary)" }} fontSize="7.5" fontWeight={600}>
          Dead Sea
        </text>

        {/* places — glowing pins + clear labels */}
        {PLACES.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r={9} style={{ fill: "var(--accent)", opacity: 0.28 }} />
            <circle cx={p.x} cy={p.y} r={4} style={{ fill: "var(--accent-strong)", stroke: "var(--card)", strokeWidth: 1.6 }} />
            <text
              x={p.x + 11}
              y={p.below ? p.y + 13 : p.y + 1}
              style={{ fill: "var(--text-primary)" }}
              fontSize="11"
              fontWeight={700}
            >
              {p.label}
            </text>
          </g>
        ))}

        {/* compass */}
        <g transform="translate(276,26)">
          <path d="M0,-9 L4,4 L0,1 L-4,4 Z" style={{ fill: "var(--text-secondary)" }} />
          <text x="0" y="-12" textAnchor="middle" style={{ fill: "var(--text-secondary)" }} fontSize="8" fontWeight={700}>
            N
          </text>
        </g>

        {/* scale bar (representative) */}
        <g transform="translate(18,205)" style={{ stroke: "var(--text-secondary)", opacity: 0.7 }} strokeWidth={1.3}>
          <line x1="0" y1="0" x2="44" y2="0" />
          <line x1="0" y1="-3" x2="0" y2="3" />
          <line x1="44" y1="-3" x2="44" y2="3" />
        </g>
        <text x="48" y="208" style={{ fill: "var(--text-secondary)", opacity: 0.8 }} fontSize="7.5">
          ~25 km
        </text>

        {/* representative / approximate tag */}
        <text x="292" y="216" textAnchor="end" style={{ fill: "var(--text-secondary)", letterSpacing: "0.08em" }} fontSize="8" fontWeight={600}>
          {tag.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}
