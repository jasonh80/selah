"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { ChapterControls } from "@/components/chapter/ChapterControls";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";

// Small client-side coordinator: the top controls + the page's ONLY
// ScriptureReader, rendered directly beneath them as a collapsible disclosure.
//
// - Collapsed by default on a normal visit.
// - The reader is mounted lazily on FIRST open (so the ESV request doesn't fire
//   until Scripture is opened) and stays mounted afterwards (so reopening never
//   re-fetches — exactly one ESV request per page).
// - The #chapter anchor contract is preserved: the id lives on an always-present
//   region (so anchor jumps always have a target), a direct
//   /chapter/<slug>#chapter visit opens the disclosure, and same-page links to
//   #chapter (e.g. the Verse by Verse card in Go Deeper) open it too — even
//   when the hash is already #chapter and no hashchange event fires.
export function ScriptureDisclosure({ data }: { data: ChapterWorkup }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const regionRef = useRef<HTMLElement>(null);

  const openScripture = useCallback((opts: { focus?: boolean; scroll?: boolean }) => {
    setOpen(true);
    setEverOpened(true);
    // After the content paints: land keyboard/screen-reader users in the region,
    // and (for hash/link navigation) make sure the region is actually in view.
    requestAnimationFrame(() => {
      if (opts.scroll) regionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (opts.focus) regionRef.current?.focus({ preventScroll: true });
    });
  }, []);

  function toggle() {
    if (open) {
      setOpen(false);
    } else {
      openScripture({ focus: true });
    }
  }

  useEffect(() => {
    // Direct visit to /chapter/<slug>#chapter (and any later hash navigation).
    function openIfChapterHash() {
      if (window.location.hash === "#chapter") openScripture({ focus: true, scroll: true });
    }
    openIfChapterHash();
    window.addEventListener("hashchange", openIfChapterHash);

    // Same-page clicks on existing #chapter links must open the disclosure even
    // when the hash is already "#chapter" (no hashchange fires then).
    function onDocClick(e: MouseEvent) {
      const anchor = (e.target as Element | null)?.closest?.('a[href$="#chapter"]');
      if (anchor) openScripture({ scroll: true });
    }
    document.addEventListener("click", onDocClick);

    return () => {
      window.removeEventListener("hashchange", openIfChapterHash);
      document.removeEventListener("click", onDocClick);
    };
  }, [openScripture]);

  return (
    <div className="space-y-3">
      <ChapterControls reference={data.reference} scriptureOpen={open} onToggleScripture={toggle} />
      {/* Always-present anchor target (zero-height while collapsed) so #chapter
          navigation works in every state; only the content mounts/hides. */}
      <section
        id="chapter"
        ref={regionRef}
        tabIndex={-1}
        aria-label={`Read ${data.reference}`}
        className="scroll-mt-20 outline-none"
      >
        {everOpened && <div hidden={!open}>{<ScriptureReader data={data} />}</div>}
      </section>
    </div>
  );
}
