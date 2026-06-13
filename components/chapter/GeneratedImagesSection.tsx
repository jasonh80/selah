import type { ChapterWorkup, ChapterImage } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

export function GeneratedImagesSection({ data }: { data: ChapterWorkup }) {
  const establishing = data.images.find((i) => i.kind === "establishing")!;
  const rest = data.images.filter((i) => i.kind !== "establishing");

  return (
    <section>
      <SectionHead eyebrow="See the Chapter" title="Generated Images" action="View All" />
      <div className="space-y-2.5">
        <ImageCard img={establishing} tall />
        <div className="grid grid-cols-2 gap-2.5">
          {rest.map((img) => (
            <ImageCard key={img.kind} img={img} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ImageCard({ img, tall = false }: { img: ChapterImage; tall?: boolean }) {
  return (
    <button
      className={`group relative block w-full overflow-hidden rounded-md border text-left shadow-hair transition active:scale-[0.99] ${
        tall ? "aspect-[16/10]" : "aspect-[4/5]"
      }`}
    >
      <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
      <span className="absolute inset-0 bg-gradient-to-t from-[rgba(16,16,20,0.8)] via-[rgba(16,16,20,0.05)] to-transparent" />
      <span className="absolute left-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(16,16,20,0.55)] text-[10px] font-bold text-white backdrop-blur-sm">
        {img.index}
      </span>
      <span className="absolute inset-x-2.5 bottom-2.5">
        <span className="flex items-center justify-between gap-1">
          <span className="text-[13px] font-semibold text-white">{img.label}</span>
          <span className="text-white/80">›</span>
        </span>
        {tall && <span className="mt-0.5 block text-[11px] leading-snug text-white/80">{img.caption}</span>}
      </span>
    </button>
  );
}
