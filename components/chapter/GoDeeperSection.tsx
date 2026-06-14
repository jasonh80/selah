import { SectionHead } from "@/components/chapter/SectionHead";

// One "Go Deeper" — a single grid of ways into the chapter's depth. Every card
// links to a real section already on the page (no unbuilt/"coming soon" cards).
type Topic = { icon: string; label: string; href: string; jesus?: boolean };

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
];

export function GoDeeperSection() {
  return (
    <section>
      <SectionHead eyebrow="Keep going" title="Go Deeper" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {TOPICS.map((t) => (
          <a
            key={t.label}
            href={t.href}
            className="flex flex-col rounded-md border bg-card p-3.5 shadow-hair transition hover:border-accent/40 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-base ${
                  t.jesus ? "bg-jesus-red-soft text-jesus-red" : "bg-tint text-accent-strong"
                }`}
                aria-hidden
              >
                {t.icon}
              </span>
              <span className="text-secondary">›</span>
            </div>
            <span className={`text-card-title mt-2.5 ${t.jesus ? "text-jesus-red" : "text-primary"}`}>
              {t.label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
