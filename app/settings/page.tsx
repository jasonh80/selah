import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageBody, ComingLater } from "@/components/shell/PageBody";
import { ThemePicker, VersionPicker, TransparencyToggle } from "@/components/settings/controls";
import { BUILD_ID } from "@/lib/build";
import { CHAPTER_SOURCE } from "@/lib/chapters/source";

const SOUNDS = [
  "None",
  "White noise",
  "Rain",
  "Desert wind",
  "Living water",
  "Morning birds",
  "Gregorian chant",
  "Instrumental praise",
  "Soft worship",
];

export default function SettingsPage() {
  return (
    <AppShell>
      <PageBody eyebrow="Preferences" title="Settings">
        <div className="space-y-4">
          <Section label="Theme">
            <ThemePicker />
          </Section>

          <Section label="Bible version">
            <VersionPicker />
            <p className="mt-2 text-[12px] text-secondary">Used across the app. Translation text is wired up later.</p>
          </Section>

          <Section label="Sound & Stillness" badge>
            <div className="flex flex-wrap gap-2">
              {SOUNDS.map((s) => (
                <span
                  key={s}
                  className="cursor-not-allowed rounded-full border bg-card-soft px-3 py-1.5 text-sm text-secondary opacity-70"
                >
                  {s}
                </span>
              ))}
            </div>
          </Section>

          <Section label="Generation transparency" badge>
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-secondary">Show estimated AI cost on chapter pages.</p>
              <TransparencyToggle />
            </div>
          </Section>

          <p className="pt-2 text-center text-[11px] text-secondary/70">
            Build: {BUILD_ID} · Source: {CHAPTER_SOURCE}
          </p>
        </div>
      </PageBody>
    </AppShell>
  );
}

function Section({ label, badge = false, children }: { label: string; badge?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-4 shadow-hair">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-label text-secondary">{label}</p>
        {badge && <ComingLater />}
      </div>
      {children}
    </div>
  );
}
