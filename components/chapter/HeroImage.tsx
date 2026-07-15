import type { ChapterWorkup, ChapterImage } from "@/lib/types";
import { getHeroKindOverride } from "@/lib/content/chapter-content";
import { ExpandableImage } from "@/components/chapter/ExpandableImage";

// New generated chapters explicitly choose their most meaningful scene. Older
// chapters keep the established establishing → first fallback unchanged.
// Protected published chapters can re-anchor via a render-level override
// (layout spec §1) without touching the stored workup.
export function heroImageFor(data: ChapterWorkup): ChapterImage | undefined {
  const heroKind = getHeroKindOverride(data.slug) ?? data.heroKind;
  if (heroKind) {
    const selected = data.images.find((image) => image.kind === heroKind);
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
        <ExpandableImage src={hero.src} alt={hero.alt} className="h-full w-full object-cover" />
      </div>
    </section>
  );
}
