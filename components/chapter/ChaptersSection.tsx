import { SectionHead } from "@/components/chapter/SectionHead";

export function ChaptersSection() {
  return (
    <section>
      <SectionHead eyebrow="Browse" title="Chapters" />
      <div className="overflow-hidden rounded-md border bg-card shadow-hair">
        <Row label="Exodus 26" sub="The Tabernacle" />
        <Row label="Exodus 27" sub="Today" active />
        <Row label="Exodus 28" sub="The Priestly Garments" />
      </div>
    </section>
  );
}

function Row({ label, sub, active = false }: { label: string; sub: string; active?: boolean }) {
  return (
    <button
      className={`flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-b-0 transition ${
        active ? "bg-tint" : "hover:bg-card-soft"
      }`}
    >
      <span>
        <span className={`block text-card-title ${active ? "text-accent-strong" : "text-primary"}`}>
          {label}
        </span>
        <span className="text-[12px] text-secondary">{sub}</span>
      </span>
      <span className={active ? "text-accent-strong" : "text-secondary"}>{active ? "●" : "›"}</span>
    </button>
  );
}
