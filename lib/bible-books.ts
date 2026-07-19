// The 66-book Protestant canon with chapter counts — static data for the
// title-as-navigation dropdowns (owner approval, 2026-07-19: "Mark ⌄ 9 ⌄").
// slugBase is the chapter-slug prefix (`${slugBase}-${chapter}`); display is
// the dropdown label. They differ only where the canonical slug is singular
// (psalm-23 → "Psalms" in the list, "Psalm 23" on the page).
export interface BibleBook {
  display: string;
  slugBase: string;
  chapters: number;
}

const book = (display: string, chapters: number, slugBase?: string): BibleBook => ({
  display,
  chapters,
  slugBase: slugBase ?? display.toLowerCase().replace(/\s+/g, "-"),
});

export const BIBLE_BOOKS: readonly BibleBook[] = [
  book("Genesis", 50),
  book("Exodus", 40),
  book("Leviticus", 27),
  book("Numbers", 36),
  book("Deuteronomy", 34),
  book("Joshua", 24),
  book("Judges", 21),
  book("Ruth", 4),
  book("1 Samuel", 31),
  book("2 Samuel", 24),
  book("1 Kings", 22),
  book("2 Kings", 25),
  book("1 Chronicles", 29),
  book("2 Chronicles", 36),
  book("Ezra", 10),
  book("Nehemiah", 13),
  book("Esther", 10),
  book("Job", 42),
  book("Psalms", 150, "psalm"),
  book("Proverbs", 31),
  book("Ecclesiastes", 12),
  book("Song of Solomon", 8),
  book("Isaiah", 66),
  book("Jeremiah", 52),
  book("Lamentations", 5),
  book("Ezekiel", 48),
  book("Daniel", 12),
  book("Hosea", 14),
  book("Joel", 3),
  book("Amos", 9),
  book("Obadiah", 1),
  book("Jonah", 4),
  book("Micah", 7),
  book("Nahum", 3),
  book("Habakkuk", 3),
  book("Zephaniah", 3),
  book("Haggai", 2),
  book("Zechariah", 14),
  book("Malachi", 4),
  book("Matthew", 28),
  book("Mark", 16),
  book("Luke", 24),
  book("John", 21),
  book("Acts", 28),
  book("Romans", 16),
  book("1 Corinthians", 16),
  book("2 Corinthians", 13),
  book("Galatians", 6),
  book("Ephesians", 6),
  book("Philippians", 4),
  book("Colossians", 4),
  book("1 Thessalonians", 5),
  book("2 Thessalonians", 3),
  book("1 Timothy", 6),
  book("2 Timothy", 4),
  book("Titus", 3),
  book("Philemon", 1),
  book("Hebrews", 13),
  book("James", 5),
  book("1 Peter", 5),
  book("2 Peter", 3),
  book("1 John", 5),
  book("2 John", 1),
  book("3 John", 1),
  book("Jude", 1),
  book("Revelation", 22),
];

export function chapterSlug(bookEntry: BibleBook, chapter: number): string {
  return `${bookEntry.slugBase}-${chapter}`;
}

/** The book a chapter slug belongs to (slug shape `${slugBase}-${chapter}`). */
export function bookForSlug(slug: string): { book: BibleBook; chapter: number } | null {
  const m = slug.match(/^(.+)-(\d+)$/);
  if (!m) return null;
  const found = BIBLE_BOOKS.find((b) => b.slugBase === m[1]);
  if (!found) return null;
  const chapter = Number(m[2]);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > found.chapters) return null;
  return { book: found, chapter };
}
