import type { ChapterWorkup, ChapterImage } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";

export function GeneratedImagesSection({ data }: { data: ChapterWorkup }) {
  // The hero already shows the establishing shot, so we don't repeat it here —
  // "See the Chapter" carries the complementary detail + human-moment views.
  const rest = data.images.filter((i) => i.kind !== "establishing");
  if (rest.length === 0) return null;

  return (
    <section>
      <SectionHead title="See the Chapter" sub={`Scenes from ${data.reference}`} />
      <div className="grid grid-cols-2 gap-2.5">
        {rest.map((img) => (
          <ImageCard key={img.kind} img={img} />
        ))}
      </div>
    </section>
  );
}

// Static figure — images are display only (no detail view yet), so no
// button/chevron affordance that implies a click.
function ImageCard({ img, tall = false }: { img: ChapterImage; tall?: boolean }) {
  return (
    <figure
      className={`relative block w-full overflow-hidden rounded-md border shadow-hair ${
        tall ? "aspect-[16/10]" : "aspect-[4/5]"
      }`}
    >
      <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
      <span className="absolute inset-0 bg-gradient-to-t from-[rgba(16,16,20,0.8)] via-[rgba(16,16,20,0.05)] to-transparent" />
      <span className="absolute left-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(16,16,20,0.55)] text-[10px] font-bold text-white backdrop-blur-sm">
        {img.index}
      </span>
      <figcaption className="absolute inset-x-2.5 bottom-2.5">
        <span className="block text-[13px] font-semibold text-white">{img.label}</span>
        {tall && <span className="mt-0.5 block text-[11px] leading-snug text-white/80">{img.caption}</span>}
      </figcaption>
    </figure>
  );
}
