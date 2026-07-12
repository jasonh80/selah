"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChapterWorkup } from "@/lib/types";
import { ChapterControls } from "@/components/chapter/ChapterControls";
import { ScriptureReader } from "@/components/chapter/ScriptureReader";

// Small client-side coordinator: the top controls + the page's ONLY
// ScriptureReader, rendered directly beneath them as a collapsible disclosure.
//
// - Collapsed by default on a normal visit.
// - The reader is mounted lazily on FIRST open (so no ESV request is made until
//   Scripture is opened) and stays mounted afterwards (reopening via the toggle
//   or #chapter links does not refetch; switching versions inside the reader
//   keeps its own existing fetch behavior).
// - Focus follows the standard disclosure pattern: activating the Read/Close
//   BUTTON keeps focus on the button. Only hash/anchor NAVIGATION (direct
//   #chapter visit or a same-page #chapter link) moves focus into the region,
//   with a visible focus ring.
// - The #chapter anchor contract is preserved: the id lives on an always-present
//   element (so anchor jumps always have a target), but the element only exposes
//   region semantics + a tab stop while Scripture is open — collapsed, it is a
//   neutral, empty anchor point in the accessibility tree.
export function ScriptureDisclosure({ data }: { data: ChapterWorkup }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const regionRef = useRef<HTMLElement>(null);
  // Set when a same-document #chapter click was already handled, so the
  // hashchange that may follow the same click doesn't schedule a second run.
  const clickHandled = useRef(false);

  const openScripture = useCallback((opts: { focusRegion?: boolean; scroll?: boolean } = {}) => {
    setOpen(true);
    setEverOpened(true);
    if (!opts.scroll && !opts.focusRegion) return;
    // After the content has painted:
    requestAnimationFrame(() => {
      if (opts.scroll) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        regionRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
      if (opts.focusRegion) regionRef.current?.focus({ preventScroll: true });
    });
  }, []);

  // Toggle from the Read/Close control — focus stays on the button itself
  // (standard disclosure behavior; aria-expanded announces the state change).
  function toggle() {
    if (open) {
      setOpen(false);
    } else {
      openScripture();
    }
  }

  useEffect(() => {
    function openFromHashNavigation() {
      if (window.location.hash === "#chapter") openScripture({ focusRegion: true, scroll: true });
    }
    // Direct visit to /chapter/<slug>#chapter.
    openFromHashNavigation();

    function onHashChange() {
      // The click handler below already handled this same click; don't run twice.
      if (clickHandled.current) {
        clickHandled.current = false;
        return;
      }
      openFromHashNavigation();
    }
    window.addEventListener("hashchange", onHashChange);

    // Same-document, unmodified left-clicks on #chapter links must open the
    // disclosure exactly once — including when the hash is ALREADY "#chapter"
    // and no hashchange event will fire (focus is applied here for that case).
    function onDocClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href$="#chapter"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.host !== window.location.host || anchor.pathname !== window.location.pathname) return;
      clickHandled.current = true;
      openScripture({ focusRegion: true, scroll: true });
    }
    document.addEventListener("click", onDocClick);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onDocClick);
    };
  }, [openScripture]);

  return (
    <div className="space-y-3">
      <ChapterControls reference={data.reference} scriptureOpen={open} onToggleScripture={toggle} />
      {/* Always-present anchor target (zero-height while collapsed) so #chapter
          navigation works in every state. Region semantics, the tab stop, and
          the focus ring exist only while open; collapsed, this is neutral. */}
      <section
        id="chapter"
        ref={regionRef}
        tabIndex={open ? -1 : undefined}
        aria-label={open ? `Read ${data.reference}` : undefined}
        className="scroll-mt-20 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-strong/50"
      >
        {everOpened && <div hidden={!open}>{<ScriptureReader data={data} />}</div>}
      </section>
    </div>
  );
}
