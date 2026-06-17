// Canonical 66-book list with chapter counts — powers the admin book/chapter
// picker + validation (so you can't pick Mark 99) and slug generation.
export interface BibleBook {
  name: string;
  chapters: number;
  slug: string; // stem, e.g. "mark" → mark-6; "psalm" matches existing psalm-23
}

const RAW: [string, number][] = [
  ["Genesis", 50], ["Exodus", 40], ["Leviticus", 27], ["Numbers", 36], ["Deuteronomy", 34],
  ["Joshua", 24], ["Judges", 21], ["Ruth", 4], ["1 Samuel", 31], ["2 Samuel", 24],
  ["1 Kings", 22], ["2 Kings", 25], ["1 Chronicles", 29], ["2 Chronicles", 36], ["Ezra", 10],
  ["Nehemiah", 13], ["Esther", 10], ["Job", 42], ["Psalms", 150], ["Proverbs", 31],
  ["Ecclesiastes", 12], ["Song of Solomon", 8], ["Isaiah", 66], ["Jeremiah", 52], ["Lamentations", 5],
  ["Ezekiel", 48], ["Daniel", 12], ["Hosea", 14], ["Joel", 3], ["Amos", 9],
  ["Obadiah", 1], ["Jonah", 4], ["Micah", 7], ["Nahum", 3], ["Habakkuk", 3],
  ["Zephaniah", 3], ["Haggai", 2], ["Zechariah", 14], ["Malachi", 4], ["Matthew", 28],
  ["Mark", 16], ["Luke", 24], ["John", 21], ["Acts", 28], ["Romans", 16],
  ["1 Corinthians", 16], ["2 Corinthians", 13], ["Galatians", 6], ["Ephesians", 6], ["Philippians", 4],
  ["Colossians", 4], ["1 Thessalonians", 5], ["2 Thessalonians", 3], ["1 Timothy", 6], ["2 Timothy", 4],
  ["Titus", 3], ["Philemon", 1], ["Hebrews", 13], ["James", 5], ["1 Peter", 5],
  ["2 Peter", 3], ["1 John", 5], ["2 John", 1], ["3 John", 1], ["Jude", 1],
  ["Revelation", 22],
];

// Keep the slug stem consistent with existing chapters (psalm-23 is singular).
const SLUG_OVERRIDES: Record<string, string> = { Psalms: "psalm" };

export const BIBLE_BOOKS: BibleBook[] = RAW.map(([name, chapters]) => ({
  name,
  chapters,
  slug: SLUG_OVERRIDES[name] ?? name.toLowerCase().replace(/\s+/g, "-"),
}));

export function slugFor(bookName: string, chapter: number): string | null {
  const b = BIBLE_BOOKS.find((x) => x.name === bookName);
  if (!b || !Number.isInteger(chapter) || chapter < 1 || chapter > b.chapters) return null;
  return `${b.slug}-${chapter}`;
}

export function chapterCount(bookName: string): number {
  return BIBLE_BOOKS.find((x) => x.name === bookName)?.chapters ?? 0;
}
