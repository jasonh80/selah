// Selah data model. Phase 0: filled from a local placeholder file.
// Phase 1+: produced once by the generation service and cached in Supabase.

export type ImageKind = "establishing" | "detail" | "human";

export interface ChapterImage {
  kind: ImageKind;
  index: number; // 1, 2, 3
  label: string; // "Establishing Shot" | "Detail Shot" | "Human Moment"
  prompt: string;
  caption: string;
  src: string;
  alt: string;
}

export interface Character {
  name: string;
  role: string;
}

export interface ChapterMap {
  caption: string;
  src: string;
  alt: string;
  note?: string;
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
  jesusConnectionShort: string;

  images: ChapterImage[];
  metaChips: MetaChip[];
  navCards: NavCard[];
  timelineMini: TimelineMini;
  insights: Insight[];
  deeperGroups: DeeperGroup[];

  quickSummary: string;
  summary: string;
  context: string;
  modernReadersMiss: string;
  jesusConnection: string;
  application: string;
  prayer: string;

  characters: Character[];
  modernMap: ChapterMap;
  historicMap: ChapterMap;
  timeline: TimelineEvent[];
  keyItems: KeyItem[];

  versions: string[];
  defaultVersion: string;
  verses: Verse[];
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
