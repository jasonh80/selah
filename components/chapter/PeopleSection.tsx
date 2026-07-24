"use client";

import { useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { SectionCard } from "@/components/chapter/SectionCard";
import { portraitFor, castFor } from "@/lib/characters/portraits";

/**
 * PEOPLE — the cast of this chapter.
 *
 * Owner ruling 2026-07-23: build the frame NOW so it is ready to receive the
 * visual cast — "then when we launch the cast we can populate this with image,
 * and brief bio info." This replaces the one-line "Jesus · Peter · James · …"
 * chip, which was the last placeholder left on the page.
 *
 * What it does today: a row of person tiles, each with name, role, and a
 * placeholder where the portrait goes. Tap a person to read their line.
 * What changes when the cast lands: `portraitFor()` starts returning paths and
 * the same tiles fill with faces. No component changes needed.
 *
 * HONESTY: an unmapped or uncast person renders a labelled placeholder. We
 * never borrow another character's face to fill a hole, and the placeholder is
 * obviously a placeholder — not a vague silhouette a reader might mistake for
 * a depiction.
 */
export function PeopleSection({ data }: { data: ChapterWorkup }) {
  const people = data.characters?.length
    ? data.characters
    : (data.primaryCharacters ?? []).map((name) => ({ name, role: undefined, description: undefined }));
  const [openName, setOpenName] = useState<string | null>(null);
  if (people.length === 0) return null;
  const open = people.find((p) => p.name === openName) ?? null;

  return (
    <SectionCard id="people" icon="" title={`People in ${data.reference}`}>
      <ul className="-mx-3.5 flex snap-x gap-2.5 overflow-x-auto px-3.5 pb-1">
        {people.map((person) => {
          const src = portraitFor(person.name);
          const isOpen = person.name === openName;
          return (
            <li key={person.name} className="w-[84px] shrink-0 snap-start">
              <button
                type="button"
                onClick={() => setOpenName(isOpen ? null : person.name)}
                aria-expanded={isOpen}
                className="w-full text-left"
              >
                <span
                  className={`block overflow-hidden rounded-md border bg-card-soft transition ${
                    isOpen ? "border-accent-strong" : ""
                  }`}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={person.name}
                      className="h-[104px] w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <PortraitPlaceholder name={person.name} cast={Boolean(castFor(person.name))} />
                  )}
                </span>
                <span className="mt-1 block truncate text-[12px] font-medium text-primary">
                  {person.name}
                </span>
                {person.role && (
                  <span className="block text-[11px] leading-snug text-secondary line-clamp-2">
                    {person.role}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {open?.description && (
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">
          <span className="font-medium text-primary">{open.name}</span> — {open.description}
        </p>
      )}
    </SectionCard>
  );
}

/** An obvious placeholder, not a face. `cast` distinguishes "this person has a
 * profile and a portrait is coming" from "this is a crowd figure or an unnamed
 * person we may never cast". */
function PortraitPlaceholder({ name, cast }: { name: string; cast: boolean }) {
  const initial = name.trim().replace(/^the\s+/i, "").charAt(0).toUpperCase() || "?";
  return (
    <span className="flex h-[104px] w-full flex-col items-center justify-center gap-1 bg-tint">
      <span className="text-[22px] font-semibold text-accent-strong/70">{initial}</span>
      <span className="px-1 text-center text-[9px] uppercase tracking-wide text-secondary">
        {cast ? "portrait soon" : "no portrait"}
      </span>
    </span>
  );
}
