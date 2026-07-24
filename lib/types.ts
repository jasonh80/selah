// Selah data model. Phase 0: filled from a local placeholder file.
// Phase 1+: produced once by the generation service and cached in Supabase.

// Image kinds are chapter-driven (SB rule: no rigid buckets). The three classic
// kinds keep autocomplete; any chapter-specific kind string is valid too
// (e.g. "herods-feast", "walking-water").
export type ImageKind = "establishing" | "detail" | "human" | (string & {});

export interface ChapterImage {
  kind: ImageKind;
  index: number; // 1-3 or 1-5, in the chapter-selected plan order
  label: string; // "Establishing Shot" | "Detail Shot" | "Human Moment"
  description?: string;
  prompt: string;
  caption: string;
  src: string;
  alt: string;
  status?: "placeholder" | "generating" | "complete" | "failed";
}

export interface Character {
  name: string;
  role: string;
  estimatedAge?: string;
  description?: string;
  imageUrl?: string;
}

export interface ChapterMap {
  title?: string;
  caption: string;
  src: string;
  alt: string;
  note?: string;
  uncertaintyNote?: string;
}

export interface TimelineEvent {
  label: string;
  detail: string;
  current?: boolean;
}

export type KeyItemType = "object" | "place" | "person" | "custom";

export interface KeyItem {
  name: string;
  type: KeyItemType;
  blurb: string;
}

export interface Verse {
  number: number;
  text: string;
  redLetter?: boolean;
}

export interface VerseFlowItem {
  startVerse?: number;
  endVerse?: number;
  rangeLabel: string;
  title: string;
  explanation: string;
  jesusConnection?: string;
  application?: string;
}

export interface ChapterTopic {
  title: string;
  reason: string;
  priority: number;
}

// --- Dashboard-specific shapes (drive the iOS-style hero) ---

export interface MetaChip {
  icon: string;
  text: string;
  jesus?: boolean;
}

export interface NavCard {
  id: string;
  label: string;
  support: string; // one very short supporting line
  thumb?: string;
  jesus?: boolean;
}

export interface TimelineMini {
  labels: string[]; // e.g. Passover · Exodus · Sinai · Tabernacle
  activeIndex: number;
}

export interface Insight {
  id: string;
  /** Stable section type (generated workups) — routing/order key; display
   * titles are free to vary. Legacy workups route by id. */
  type?: string;
  icon: string;
  title: string;
  subtitle?: string; // e.g. "Holiness" under "Theology Principle"
  preview: string; // short text shown in the grid
  body: string; // full text revealed on expand
  jesus?: boolean;
}

export interface DeeperRow {
  title: string;
  desc: string;
}

export interface DeeperGroup {
  label: string; // "Learn More" | "Dive Deeper" | "Grow Closer"
  rows: DeeperRow[];
}

// Where a chapter sits in the big biblical story (Creation → Today). Dates are
// handled honestly — uncertain dates are never shown as certain years.
export interface BiblicalTimeline {
  era: string;
  estimatedYear?: number; // negative = BC/BCE
  estimatedYearLabel: string;
  dateRange?: { startYear: number; endYear: number };
  confidence: "high" | "medium" | "low" | "debated";
  chronologyBasis: string;
  uncertaintyNote: string;
  placementReason: string;
}

export interface ChapterWorkup {
  // --- Global workup record (one canonical workup per chapter) ---
  // Generate once. Save forever. Personalize only when needed.
  // Generation is lazy: a chapter moves draft → generating → ready/failed the
  // first time it is requested, then is cached forever.
  status?: "draft" | "generating" | "ready" | "failed" | "reviewed";
  version?: string;
  generationStartedAt?: string;
  generationCompletedAt?: string;
  generationError?: string;
  updatedAt?: string;
  reviewedAt?: string;
  // Server-owned provenance and private-draft review metadata. The overlap
  // marker contains only digests, closed finding codes, and counts—never Bible
  // text, generated prose, prompts, or excerpts.
  generationManifestDigest?: string;
  /** Machine review warnings persisted with the draft (safe enum codes, e.g. REPAIR-001). */
  qualityWarningCodes?: string[];
  sourceOverlapReview?: import("./source-overlap-review").SourceOverlapReviewWarning;

  slug: string;
  book: string;
  chapter: number;
  reference: string;
  title: string;
  subtitle: string; // "The Bronze Altar, the Courtyard, and the Lamp"
  tagline: string; // "Learn more. Dive deeper. Grow closer to Jesus."
  theme: string;

  estimatedDate: string;
  estimatedLocation: string;
  modernLocationNote?: string;
  jesusConnectionShort: string;
  primaryCharacters?: string[];

  // New generated workups name the most meaningful visual moment explicitly.
  // Optional keeps hand-authored and legacy chapters unchanged.
  heroKind?: ImageKind;
  images: ChapterImage[];
  metaChips: MetaChip[];
  navCards: NavCard[];
  timelineMini: TimelineMini;
  insights: Insight[];
  deeperGroups: DeeperGroup[];

  quickSummary: string;
  summary: string;
  /** "Set the Scene" — an optional immersive reader card (season/weather/
   * terrain/light/sound/texture) shown after the first image bank and before
   * Big Idea. Copy is hedged and bounded by the chapter's Season & Setting
   * evidence; absent chapters simply don't render it. */
  setTheScene?: { kicker?: string; body: string };
  context: string;
  whatHappens?: string;
  modernReadersMiss: string;
  jesusConnection: string;
  application: string;
  prayer: string;

  characters: Character[];
  modernMap: ChapterMap;
  historicMap: ChapterMap;
  timeline: TimelineEvent[];
  timelineLabel?: string;
  keyItems: KeyItem[];
  verseByVerse?: VerseFlowItem[];
  chapterSpecificTopics?: ChapterTopic[];

  versions: string[];
  defaultVersion: string;
  verses: Verse[];

  biblicalTimeline?: BiblicalTimeline;

  // Generated supplemental content (falls back to static config when absent).
  sceneChecks?: {
    label?: string;
    title: string;
    body: string;
    relatedVerses?: string[];
    visualAccuracyNotes?: string[];
    /** Explicit binding to ONE planned image kind (validated); a check with
     * no valid binding renders standalone, never positionally guessed. */
    imageKind?: string;
  }[];
  behindTheChapter?: { category: string; title: string; body: string }[];

  // Static, approved "What People Ask" FAQ (not a live Ask tool). Falls back to
  // CHAPTER_FAQ config when absent.
  whatPeopleAsk?: { question: string; answer: string }[];

  // Optional generation cost metadata (placeholder; not shown in the UI).
  cost?: {
    textEstimateUsd?: number;
    imageEstimateUsd?: number;
    totalEstimateUsd?: number;
    cached?: boolean;
  };
}

// Logged per AI request (Phase 1+). Here for design completeness.
export interface CostEvent {
  id: string;
  user_id: string | null;
  chapter: string;
  request_type: "text" | "image" | "personalized";
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  image_count: number;
  image_size: string;
  estimated_cost: number;
  created_at: string;
}
