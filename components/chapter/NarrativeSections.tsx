import type { ChapterWorkup } from "@/lib/types";
import { Card, CardLabel, SectionTitle } from "@/components/ui/primitives";

export function NarrativeSections({ data }: { data: ChapterWorkup }) {
  return (
    <section className="space-y-4">
      <SectionTitle eyebrow="Go deeper" title="Understanding the chapter" />

      <div className="grid gap-4 md:grid-cols-2">
        <Block label="Historical & cultural context" body={data.context} />
        <Block label="What modern readers may miss" body={data.modernReadersMiss} />
      </div>

      {/* Jesus connection — full, with red accent */}
      <Card className="p-6 md:p-7" accent>
        <CardLabel>
          <span className="text-jesus-red">Jesus at the center</span>
        </CardLabel>
        <p className="mt-3 text-[16px] leading-relaxed text-primary">{data.jesusConnection}</p>
      </Card>

      {/* Theology principle */}
      <Card className="p-6 md:p-7">
        <CardLabel>Theology principle · builds slowly</CardLabel>
        <h3 className="mt-2 font-display text-xl text-primary">{data.theologyPrinciple.title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-primary">{data.theologyPrinciple.body}</p>
        <p className="mt-3 rounded-xl bg-tint px-3 py-2 text-xs text-secondary">
          {data.theologyPrinciple.buildsOn}
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Block label="Practical application" body={data.application} />
        {/* Prayer */}
        <Card className="p-6 md:p-7">
          <CardLabel>Prayer</CardLabel>
          <p className="mt-3 font-display text-[16px] italic leading-relaxed text-primary">
            {data.prayer}
          </p>
        </Card>
      </div>
    </section>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <Card className="p-6 md:p-7">
      <CardLabel>{label}</CardLabel>
      <p className="mt-3 text-[15px] leading-relaxed text-primary">{body}</p>
    </Card>
  );
}
