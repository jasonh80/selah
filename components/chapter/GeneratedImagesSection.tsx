import type { ChapterWorkup, ChapterImage } from "@/lib/types";
import { SectionHead } from "@/components/chapter/SectionHead";
import { getImageTitle } from "@/lib/content/chapter-content";

export function GeneratedImagesSection({ data }: { data: ChapterWorkup }) {
  // The hero already shows the establishing shot, so we don't repeat it here —
  // these carry the complementary detail + human-moment scenes.
  const rest = data.images.filter((i) => i.kind !== "establishing");
  if (rest.length === 0) return null;

  return (
    <section>
      <SectionHead title={`Scenes from ${data.reference}`} />
      <div className="grid grid-cols-2 gap-2.5">
        {rest.map((img) => (
          <ImageCard key={img.kind} img={img} title={getImageTitle(data.slug, img.kind, img.label)} />
        ))}
      </div>
    </section>
  );
}

function ImageCard({ img, title }: { img: ChapterImage; title: string }) {
  return (
    <figure className="relative block w-full overflow-hidden rounded-md border shadow-hair aspect-[4/5]">
      <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
      <span className="absolute inset-0 bg-gradient-to-t from-[rgba(16,16,20,0.82)] via-[rgba(16,16,20,0.05)] to-transparent" />
      <figcaption className="absolute inset-x-2.5 bottom-2.5">
        <span className="block text-[13px] font-semibold text-white">{title}</span>
      </figcaption>
    </figure>
  );
}
