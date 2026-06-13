import type { ChapterWorkup, NavCard } from "@/lib/types";

export function VisualNavGrid({ data }: { data: ChapterWorkup }) {
  return (
    <nav className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4">
      {data.navCards.map((card) => (
        <NavTile key={card.id} card={card} />
      ))}
    </nav>
  );
}

function NavTile({ card }: { card: NavCard }) {
  return (
    <button className="flex w-[84px] shrink-0 flex-col items-center gap-2 rounded-md border bg-card p-2.5 shadow-hair transition active:scale-95">
      <div className="h-12 w-full overflow-hidden rounded-sm bg-card-soft">
        {card.miniTimeline ? (
          <MiniLine />
        ) : (
          <img src={card.thumb} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <span className={`text-[11px] font-semibold ${card.jesus ? "text-jesus-red" : "text-primary"}`}>
        {card.label}
      </span>
    </button>
  );
}

function MiniLine() {
  return (
    <svg viewBox="0 0 80 48" className="h-full w-full">
      <line x1="14" y1="24" x2="66" y2="24" stroke="var(--accent)" strokeWidth="2" />
      {[14, 40, 66].map((x) => (
        <circle key={x} cx={x} cy="24" r="4.5" fill="var(--accent-strong)" />
      ))}
    </svg>
  );
}
