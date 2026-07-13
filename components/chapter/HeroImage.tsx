import type { ChapterWorkup, ChapterImage } from "@/lib/types";

// New generated chapters explicitly choose their most meaningful scene. Older
// chapters keep the established establishing → first fallback unchanged.
export function heroImageFor(data: ChapterWorkup): ChapterImage | undefined {
  if (data.heroKind) {
    const selected = data.images.find((image) => image.kind === data.heroKind);
    if (selected) return selected;
  }
  return data.images.find((i) => i.kind === "establishing") ?? data.images[0];
}

export function supportingImagesFor(data: ChapterWorkup): ChapterImage[] {
  const hero = heroImageFor(data);
  return hero ? data.images.filter((image) => image.kind !== hero.kind) : [];
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
