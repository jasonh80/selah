/**
 * PERSONALIZATION — future per-user layer. NOT BUILT YET.
 *
 * Personalized content NEVER lives inside the global chapter workup. It attaches
 * on top, keyed by user + chapter, and is generated only when a user asks for it
 * (e.g. "explain this more simply", "give me a personal prayer", saved notes).
 *
 * This file is a placeholder so the separation is explicit. No storage, no auth,
 * no generation is implemented.
 */
export type UserChapterLayer = {
  userId: string;
  chapterWorkupId: string;
  savedNotes: unknown[];
  savedPrayers: unknown[];
  personalizedReflections: unknown[];
  diveDeeperThreads: unknown[];
};
