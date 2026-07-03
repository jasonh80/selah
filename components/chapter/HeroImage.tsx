import type { ChapterWorkup, ChapterImage } from "@/lib/types";

// The hero image: the chapter's "establishing" image when one exists, else the
// first image in the set (chapter-driven plans may use custom kinds).
export function heroImageFor(data: ChapterWorkup): ChapterImage | undefined {
  return data.images.find((i) => i.kind === "establishing") ?? data.images[0];
}

export function HeroImage({ data }: { data: ChapterWorkup }) {
  const hero = heroImageFor(data);
  if (!hero) return null;
  return (
    <section className="overflow-hidden rounded-lg border shadow-soft">
      <div className="aspect-[16/10] w-full bg-card-soft lg:aspect-[16/9]">
        <img src={hero.src} alt={hero.alt} className="h-full w-full object-cover" />
      </div>
    </section>
  );
}
