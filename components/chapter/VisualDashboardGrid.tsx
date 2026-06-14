import type { ChapterWorkup, NavCard } from "@/lib/types";

export function VisualDashboardGrid({ data }: { data: ChapterWorkup }) {
  const obj = data.navCards.find((c) => c.id === "key-object")!;
  const person = data.navCards.find((c) => c.id === "key-person")!;
  const jesus = data.navCards.find((c) => c.id === "jesus")!;

  return (
    <div className="grid grid-cols-2 gap-3">
      <ThumbCard card={obj} />
      <ThumbCard card={person} />
      <JesusCard card={jesus} />
    </div>
  );
}

function CardShell({
  children,
  spanClass = "col-span-1",
  jesus = false,
}: {
  children: React.ReactNode;
  spanClass?: string;
  jesus?: boolean;
}) {
  return (
    <button
      className={`overflow-hidden rounded-md border bg-card text-left shadow-hair transition active:scale-[0.98] ${spanClass} ${
        jesus ? "ring-1 ring-[rgba(178,58,58,0.18)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

function ThumbCard({ card }: { card: NavCard }) {
  return (
    <CardShell>
      <div className="flex items-center gap-3 p-4">
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-card-soft">
          <img src={card.thumb} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-card-title text-primary">{card.label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-secondary">{card.support}</span>
        </span>
        <span className="shrink-0 pl-1 text-secondary">›</span>
      </div>
    </CardShell>
  );
}

function JesusCard({ card }: { card: NavCard }) {
  return (
    <CardShell spanClass="col-span-2 lg:col-span-2" jesus>
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jesus-red-soft text-jesus-red">
          ✝
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-card-title text-jesus-red">{card.label}</span>
          <span className="block text-[12px] text-primary">{card.support}</span>
        </span>
        <span className="text-jesus-red/70">›</span>
      </div>
    </CardShell>
  );
}
