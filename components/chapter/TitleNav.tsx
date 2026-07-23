"use client";

// Title-as-navigation (owner approval, 2026-07-19): the chapter H1 itself is
// the navigation — "Mark ⌄ 9 ⌄". The book name opens a scrollable book list,
// the number opens that book's chapter list. Books with nothing published and
// unpublished chapters are greyed and disabled (IQ-012: navigation must only
// link chapters that actually render). Every selection lands on the chapter's
// canonical /chapter/{slug} URL (owner direction IQ-007).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BIBLE_BOOKS, bookForSlug, chapterSlug } from "@/lib/bible-books";

export function TitleNav({
  slug,
  title,
  publishedSlugs,
}: {
  slug: string;
  title: string;
  publishedSlugs: string[];
}) {
  const [open, setOpen] = useState<"book" | "chapter" | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const located = bookForSlug(slug);
  const published = new Set(publishedSlugs);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Unknown slug shape (nothing to navigate from): the plain title, unchanged.
  if (!located || publishedSlugs.length === 0) {
    return <p className="text-[15px] font-semibold text-secondary">{title}</p>;
  }
  const { book, chapter } = located;
  // The page keeps its own title form for the book word ("Psalm 23", not
  // "Psalms 23"); the slug's book portion is exactly that form.
  const bookWord = title.replace(/\s+\d+\s*$/u, "") || book.display;

  const firstPublishedIn = (slugBase: string, chapters: number): string | null => {
    for (let n = 1; n <= chapters; n++) {
      const candidate = `${slugBase}-${n}`;
      if (published.has(candidate)) return candidate;
    }
    return null;
  };

  const caret = (which: "book" | "chapter") => (
    <span
      aria-hidden
      className={`ml-1 text-[0.55em] leading-none text-secondary transition-transform ${open === which ? "rotate-180" : ""}`}
    >
      ⌄
    </span>
  );
  const menuClass =
    "absolute left-0 top-full z-30 mt-2 max-h-72 w-56 overflow-y-auto rounded-lg border bg-card p-1 shadow-hair";
  const itemBase = "block w-full rounded-md px-3 py-1.5 text-left text-[14px] font-medium";

  return (
    <div ref={rootRef} className="relative">
      <p className="text-[15px] font-semibold text-secondary">
        <span className="relative inline-block">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === "book"}
            aria-label="Choose a book"
            onClick={() => setOpen(open === "book" ? null : "book")}
            className="inline-flex items-baseline rounded-md hover:text-accent-strong"
          >
            {bookWord}
            {caret("book")}
          </button>
          {open === "book" && (
            <div role="menu" aria-label="Books" className={menuClass}>
              {BIBLE_BOOKS.map((entry) => {
                const target = firstPublishedIn(entry.slugBase, entry.chapters);
                return target ? (
                  <Link
                    key={entry.slugBase}
                    role="menuitem"
                    href={`/chapter/${target}`}
                    onClick={() => setOpen(null)}
                    className={`${itemBase} ${
                      entry.slugBase === book.slugBase
                        ? "bg-card-soft text-accent-strong"
                        : "text-primary hover:bg-card-soft"
                    }`}
                  >
                    {entry.display}
                  </Link>
                ) : (
                  <span
                    key={entry.slugBase}
                    role="menuitem"
                    aria-disabled="true"
                    className={`${itemBase} cursor-default text-secondary opacity-50`}
                  >
                    {entry.display}
                  </span>
                );
              })}
            </div>
          )}
        </span>{" "}
        <span className="relative inline-block">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === "chapter"}
            aria-label={`Choose a chapter of ${book.display}`}
            onClick={() => setOpen(open === "chapter" ? null : "chapter")}
            className="inline-flex items-baseline rounded-md hover:text-accent-strong"
          >
            {chapter}
            {caret("chapter")}
          </button>
          {open === "chapter" && (
            <div role="menu" aria-label={`${book.display} chapters`} className={`${menuClass} w-40`}>
              {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => {
                const target = chapterSlug(book, n);
                const isPublished = published.has(target);
                return isPublished ? (
                  <Link
                    key={n}
                    role="menuitem"
                    href={`/chapter/${target}`}
                    onClick={() => setOpen(null)}
                    className={`${itemBase} ${
                      n === chapter ? "bg-card-soft text-accent-strong" : "text-primary hover:bg-card-soft"
                    }`}
                  >
                    {book.display} {n}
                  </Link>
                ) : (
                  <span
                    key={n}
                    role="menuitem"
                    aria-disabled="true"
                    className={`${itemBase} cursor-default text-secondary opacity-50`}
                  >
                    {book.display} {n}
                  </span>
                );
              })}
            </div>
          )}
        </span>
      </p>
    </div>
  );
}
