"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Layout spec §9 (approved): click → the image enlarges from its position into
// a near-full-screen viewer. v1 ships close + zoom + pinch + pan with source
// limits; swiping between images comes later. Only completed chapter images
// (site-relative or https) are expandable — placeholders never look clickable.
const MAX_SCALE = 4;
const MIN_SCALE = 1;

function isExpandableSrc(src: string): boolean {
  return src.startsWith("/") || src.startsWith("https://");
}

export interface ImageCaption {
  title: string;
  body: string;
}

export function ExpandableImage({
  src,
  alt,
  className,
  caption,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Scene-check caption shown at the bottom of the full-size viewer (owner
   * direction 2026-07-20); hidden while zoomed in so it never covers detail. */
  caption?: ImageCaption;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLImageElement | null>(null);
  const expandable = isExpandableSrc(src) && !src.startsWith("/img/placeholder/");

  if (!expandable) {
    return <img src={src} alt={alt} className={className} />;
  }

  // Keyboard-reachable trigger; focus returns here when the viewer closes.
  return (
    <>
      <img
        ref={triggerRef}
        src={src}
        alt={alt}
        role="button"
        tabIndex={0}
        aria-label={`Enlarge image: ${alt}`}
        className={`${className ?? ""} cursor-zoom-in`}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      {open && (
        <ImageViewer
          src={src}
          alt={alt}
          caption={caption}
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function ImageViewer({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  alt: string;
  caption?: ImageCaption;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [entered, setEntered] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  // Enter animation: grow from a slightly smaller state toward full size, so
  // the image reads as enlarging from its place on the page. Keyboard focus
  // moves to the close button so Escape/Enter work immediately.
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    closeButtonRef.current?.focus();
    return () => cancelAnimationFrame(id);
  }, []);

  const close = useCallback(() => {
    setEntered(false);
    window.setTimeout(onClose, 160);
  }, [onClose]);

  useEffect(() => {
    // Escape closes; Tab is TRAPPED inside the dialog (cycles its buttons) so
    // keyboard focus can never wander into the dimmed page behind it.
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key === "Tab") {
        const focusables = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!focusables || focusables.length === 0) return;
        const list = [...focusables];
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        const next = event.shiftKey
          ? list[(index - 1 + list.length) % list.length]
          : list[(index + 1) % list.length];
        next.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [close]);

  function clampScale(next: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  }

  function applyScale(next: number) {
    const clamped = clampScale(next);
    setScale(clamped);
    if (clamped === MIN_SCALE) {
      setTx(0);
      setTy(0);
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { x: event.clientX, y: event.clientY, tx, ty };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0) {
        applyScale((dist / pinchStart.current.dist) * pinchStart.current.scale);
      }
      return;
    }
    if (drag.current && scale > MIN_SCALE) {
      setTx(drag.current.tx + (event.clientX - drag.current.x));
      setTy(drag.current.ty + (event.clientY - drag.current.y));
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) drag.current = null;
    // Mobile double-tap toggles zoom (dblclick doesn't fire on many touch
    // browsers): two taps within 300ms and ~24px of each other.
    if (event.pointerType === "touch" && pointers.current.size === 0) {
      const now = performance.now();
      const prior = lastTap.current;
      lastTap.current = { time: now, x: event.clientX, y: event.clientY };
      if (
        prior &&
        now - prior.time < 300 &&
        Math.hypot(event.clientX - prior.x, event.clientY - prior.y) < 24
      ) {
        lastTap.current = null;
        applyScale(scale > MIN_SCALE ? MIN_SCALE : 2);
      }
    }
  }

  function onWheel(event: React.WheelEvent) {
    applyScale(scale * (event.deltaY > 0 ? 0.88 : 1.14));
  }

  function onDoubleClick() {
    applyScale(scale > MIN_SCALE ? MIN_SCALE : 2);
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(10,9,14,0.92)] backdrop-blur-sm transition-opacity duration-150 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className={`transition-transform duration-200 ease-out ${entered ? "scale-100" : "scale-90"}`}
        // touch-action none: without it, mobile browsers claim pinch/drag for
        // page zoom/scroll and the viewer's pointer handlers never fire.
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${entered ? scale : scale * 0.9})`, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`max-h-[92vh] max-w-[96vw] select-none rounded-md object-contain ${
            scale > MIN_SCALE ? "cursor-grab" : "cursor-zoom-in"
          }`}
        />
      </div>

      {/* The photo's scene-check caption rides the bottom of the viewer while
          the image is at rest; zooming hides it so nothing covers detail. */}
      {caption && scale === MIN_SCALE && (
        <div className="pointer-events-none fixed inset-x-4 bottom-20 mx-auto max-w-[64ch] rounded-md bg-[rgba(10,9,14,0.78)] px-4 py-3 backdrop-blur">
          <p className="text-[14px] font-semibold leading-snug text-white">{caption.title}</p>
          <p className="mt-1 max-h-28 overflow-y-auto text-[13px] leading-relaxed text-white/80 [pointer-events:auto]">
            {caption.body}
          </p>
        </div>
      )}

      <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
        <ViewerButton label="Zoom out" onClick={() => applyScale(scale * 0.8)}>
          −
        </ViewerButton>
        <ViewerButton label="Zoom in" onClick={() => applyScale(scale * 1.25)}>
          +
        </ViewerButton>
      </div>

      <ViewerButton
        label="Close image"
        onClick={close}
        className="fixed right-4 top-4"
        buttonRef={closeButtonRef}
      >
        ✕
      </ViewerButton>
    </div>
  );
}

function ViewerButton({
  label,
  onClick,
  className,
  children,
  buttonRef,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,255,255,0.12)] text-lg text-white backdrop-blur transition hover:bg-[rgba(255,255,255,0.22)] ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
