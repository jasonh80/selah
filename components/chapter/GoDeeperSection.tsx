import { SectionHead } from "@/components/chapter/SectionHead";

// One "Go Deeper" — a single grid of ways into the chapter's depth. Cards link
// to the relevant section on the page; future ones are marked.
type Topic = { icon: string; label: string; href?: string; jesus?: boolean; soon?: boolean };

const TOPICS: Topic[] = [
  { icon: "📖", label: "Verse by Verse", href: "#chapter" },
  { icon: "🏛", label: "Historical World", href: "#deeper-study" },
  { icon: "🛡", label: "Theology", href: "#deeper-study" },
  { icon: "✝", label: "Jesus Connection", href: "#deeper-study", jesus: true },
  { icon: "🗺", label: "Maps & Places", href: "#maps" },
  { icon: "🕰", label: "Timeline", href: "#timeline" },
  { icon: "🔤", label: "Original Language", href: "#deeper-study" },
  { icon: "🔍", label: "What Most People Miss", href: "#deeper-study" },
  { icon: "🙏", label: "Prayer", href: "#deeper-study" },
  { icon: "❒", label: "Related Chapters", href: "#chapters" },
  { icon: "💭", label: "Reflection Questions", soon: true },
];

export function GoDeeperSection() {
  return (
    <section>
      <SectionHead eyebrow="Keep going" title="Go Deeper" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {TOPICS.map((t) => {
          const inner = (
            <>
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-base ${
                    t.jesus ? "bg-jesus-red-soft text-jesus-red" : "bg-tint text-accent-strong"
                  }`}
                  aria-hidden
                >
                  {t.icon}
                </span>
                {t.soon ? (
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">
                    Soon
                  </span>
                ) : (
                  <span className="text-secondary">›</span>
                )}
              </div>
              <span className={`text-card-title mt-2.5 ${t.jesus ? "text-jesus-red" : "text-primary"}`}>
                {t.label}
              </span>
            </>
          );
          const cls =
            "flex flex-col rounded-md border bg-card p-3.5 shadow-hair transition active:scale-[0.98]";
          return t.href ? (
            <a key={t.label} href={t.href} className={`${cls} hover:border-accent/40`}>
              {inner}
            </a>
          ) : (
            <div key={t.label} className={`${cls} opacity-80`}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
