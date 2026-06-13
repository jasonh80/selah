import type { ChapterWorkup } from "@/lib/types";

export function HeroImage({ data }: { data: ChapterWorkup }) {
  const establishing = data.images.find((i) => i.kind === "establishing")!;
  return (
    <section className="overflow-hidden rounded-lg border shadow-soft">
      <div className="aspect-[16/10] w-full bg-card-soft lg:aspect-[16/9]">
        <img src={establishing.src} alt={establishing.alt} className="h-full w-full object-cover" />
      </div>
    </section>
  );
}
