import type { ChapterWorkup } from "@/lib/types";

export function ChapterHero({ data }: { data: ChapterWorkup }) {
  return (
    <section className="pt-2">
      <h1 className="text-title text-primary lg:text-[48px]">{data.title}</h1>
      <p className="text-subtitle mt-2.5 text-primary">{data.subtitle}</p>
    </section>
  );
}
