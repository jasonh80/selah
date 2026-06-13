// Selah data model. Phase 0: filled from a local placeholder file.
// Phase 1+: produced once by the generation service and cached in Supabase.

export type ImageKind = "establishing" | "detail" | "human";

export interface ChapterImage {
  kind: ImageKind;
  label: string; // "Establishing Shot" | "Detail Shot" | "Human Moment"
  prompt: string; // the generation prompt (kept for transparency/regeneration)
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

export interface TheologyPrinciple {
  title: string;
  body: string;
  buildsOn: string; // how today's principle connects to the slow-build arc
}

export interface Verse {
  number: number;
  text: string;
  redLetter?: boolean; // "Jesus said" / divine speech → semantic red accent
}

export type DeeperGroup = "learn-more" | "dive-deeper" | "grow-closer";

export interface DeeperLink {
  group: DeeperGroup;
  title: string;
  blurb: string;
}

export interface ChapterWorkup {
  slug: string;
  book: string;
  chapter: number;
  reference: string;
  title: string;
  theme: string;

  estimatedDate: string;
  estimatedLocation: string;
  jesusConnectionShort: string;

  images: ChapterImage[]; // exactly 3: establishing, detail, human

  summary: string;
  context: string;
  modernReadersMiss: string;
  jesusConnection: string;
  theologyPrinciple: TheologyPrinciple;
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

  deeper: DeeperLink[];
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
