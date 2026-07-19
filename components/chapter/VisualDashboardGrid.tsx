import type { ChapterWorkup } from "@/lib/types";

// Owner direction (2026-07-19): Key Object is retired; the Jesus card was a
// duplicate of Jesus at the Center. Key Person remains — full column width —
// until Kelly's character system replaces it with real people profiles.
export function KeyPersonCard({ data }: { data: ChapterWorkup }) {
  const person = data.navCards?.find((c) => c.id === "key-person");
  if (!person) return null;
  return (
    <div id="people" className="w-full scroll-mt-20 rounded-md border bg-card p-3.5 shadow-hair">
      <p className="text-eyebrow">Key Person</p>
      <p className="mt-1 text-card-title text-primary">{person.support}</p>
    </div>
  );
}
