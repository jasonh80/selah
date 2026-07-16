import type { ChapterWorkup, NavCard } from "@/lib/types";

// Static info cards (Key Object / Key Person / Jesus). No detail view exists yet,
// so they're plain cards — no button/chevron affordance and no placeholder
// thumbnail. The label becomes a quiet eyebrow over the actual value.
export function VisualDashboardGrid({ data }: { data: ChapterWorkup }) {
  const obj = data.navCards.find((c) => c.id === "key-object")!;
  const person = data.navCards.find((c) => c.id === "key-person")!;
  const jesus = data.navCards.find((c) => c.id === "jesus")!;

  return (
    <div className="grid grid-cols-2 gap-3">
      <FactCard card={obj} />
      <FactCard card={person} />
      <JesusCard card={jesus} />
    </div>
  );
}

function FactCard({ card }: { card: NavCard }) {
  return (
    <div className="rounded-md border bg-card p-3.5 shadow-hair">
      <p className="text-eyebrow">{card.label}</p>
      <p className="text-card-title mt-1 text-primary">{card.support}</p>
    </div>
  );
}

function JesusCard({ card }: { card: NavCard }) {
  return (
    <div className="col-span-2 rounded-md border bg-card p-3.5 shadow-hair ring-1 ring-[rgba(178,58,58,0.18)]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jesus-red-soft text-jesus-red">
          ✝
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-card-title text-jesus-red">{card.label}</span>
          <span className="block text-[12px] text-primary">{card.support}</span>
        </span>
      </div>
    </div>
  );
}
