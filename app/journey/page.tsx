import { AppShell } from "@/components/shell/AppShell";
import { PageBody, ComingLater } from "@/components/shell/PageBody";

const CARDS = [
  { icon: "📝", title: "Saved notes", desc: "Notes you keep from a chapter will gather here." },
  { icon: "🙏", title: "Saved prayers", desc: "Prayers you save or write will live here." },
  { icon: "🕮", title: "Recently viewed chapters", desc: "Your reading history, ready to revisit." },
  { icon: "✨", title: "Personal reflections", desc: "Your own thoughts and what God is showing you." },
];

export default function JourneyPage() {
  return (
    <AppShell>
      <PageBody
        eyebrow="Your path"
        title="Journey"
        sub="Your personal layer — notes, prayers, and reflections — is coming soon."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {CARDS.map((c) => (
            <div key={c.title} className="rounded-md border bg-card p-4 shadow-hair">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tint text-base">
                  {c.icon}
                </span>
                <ComingLater />
              </div>
              <p className="text-card-title mt-3 text-primary">{c.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">{c.desc}</p>
            </div>
          ))}
        </div>
      </PageBody>
    </AppShell>
  );
}
