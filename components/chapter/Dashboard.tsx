import type { ChapterWorkup } from "@/lib/types";
import { Card, CardLabel } from "@/components/ui/primitives";

export function Dashboard({ data }: { data: ChapterWorkup }) {
  const keyObject = data.keyItems.find((k) => k.type === "object") ?? data.keyItems[0];
  const keyPerson = data.characters[0];
  const jesusImg = data.images.find((i) => i.kind === "human");

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {/* Quick summary — wide */}
      <Card className="col-span-2 p-5 md:col-span-2 md:row-span-2">
        <CardLabel>Quick summary</CardLabel>
        <p className="mt-3 text-[15px] leading-relaxed text-primary">{data.summary}</p>
      </Card>

      {/* Jesus card */}
      <Card className="col-span-2 overflow-hidden md:col-span-2" accent>
        <div className="flex h-full">
          <div className="flex-1 p-5">
            <CardLabel>
              <span className="text-jesus-red">Jesus at the center</span>
            </CardLabel>
            <p className="mt-2 text-[15px] leading-relaxed text-primary">
              {data.jesusConnectionShort}.
            </p>
          </div>
          {jesusImg && (
            <div className="hidden w-28 shrink-0 sm:block">
              <img src={jesusImg.src} alt={jesusImg.alt} className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      </Card>

      {/* Timeline card */}
      <Card className="col-span-2 p-5">
        <CardLabel>Timeline</CardLabel>
        <ol className="mt-3 space-y-2">
          {data.timeline.map((e) => (
            <li key={e.label} className="flex items-start gap-2.5 text-sm">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  e.current ? "bg-accent-strong ring-4 ring-accent/20" : "bg-line"
                }`}
              />
              <span className={e.current ? "font-medium text-primary" : "text-secondary"}>
                {e.label}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Key object */}
      <MiniCard label="Key object">
        <p className="mt-2 font-display text-lg text-primary">{keyObject.name}</p>
        <p className="mt-1 text-sm text-secondary">{keyObject.blurb}</p>
      </MiniCard>

      {/* Key person */}
      <MiniCard label="Key person">
        <p className="mt-2 font-display text-lg text-primary">{keyPerson.name}</p>
        <p className="mt-1 text-sm text-secondary">{keyPerson.role}</p>
      </MiniCard>

      {/* Modern map */}
      <MapCard label="Modern map" src={data.modernMap.src} alt={data.modernMap.alt} caption={data.modernMap.caption} />

      {/* Historic map */}
      <MapCard label="Historic map" src={data.historicMap.src} alt={data.historicMap.alt} caption={data.historicMap.caption} />
    </div>
  );
}

function MiniCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="col-span-1 p-5">
      <CardLabel>{label}</CardLabel>
      {children}
    </Card>
  );
}

function MapCard({
  label,
  src,
  alt,
  caption,
}: {
  label: string;
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <Card className="col-span-1 overflow-hidden">
      <div className="aspect-[4/3] w-full bg-tint">
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </div>
      <div className="p-3.5">
        <CardLabel>{label}</CardLabel>
        <p className="mt-1 text-xs text-secondary">{caption}</p>
      </div>
    </Card>
  );
}
