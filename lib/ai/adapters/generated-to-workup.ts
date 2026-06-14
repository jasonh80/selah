import type { GeneratedChapterWorkup, GeneratedImage } from "../schemas/chapter-workup-schema";
import type { ChapterWorkup, ChapterImage, Insight, ImageKind, KeyItem } from "../../types";

/**
 * Maps the canonical generated workup (AI output, Zod-validated) into the
 * render/view model consumed by ChapterView. Works for any chapter — no
 * chapter-specific values are hardcoded.
 *
 * Image and map URLs fall back to per-chapter placeholder assets
 * (/img/<slug>/...) when the generated record has no real URL yet, while
 * prompts/captions/alt/status are preserved from the generated data.
 */

const TAGLINE = "Pause. Reflect. Lift up.";
const IMAGE_ORDER: ImageKind[] = ["establishing", "detail", "human"];
const IMAGE_LABEL: Record<ImageKind, string> = {
  establishing: "Establishing Shot",
  detail: "Detail Shot",
  human: "Human Moment",
};

function firstSentence(text: string, max = 120): string {
  const trimmed = text.trim();
  const dot = trimmed.search(/[.!?](\s|$)/);
  const sentence = dot >= 0 ? trimmed.slice(0, dot + 1) : trimmed;
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + "…" : sentence;
}

function imageFallback(slug: string, kind: ImageKind): string {
  return `/img/${slug}/${kind}.svg`;
}

export function generatedToRenderWorkup(generated: GeneratedChapterWorkup): ChapterWorkup {
  const g = generated;

  // Images, normalized into establishing → detail → human order.
  const byKind = new Map<ImageKind, GeneratedImage>();
  g.generatedImages.forEach((img) => byKind.set(img.type, img));
  const images: ChapterImage[] = IMAGE_ORDER.filter((k) => byKind.has(k)).map((kind, i) => {
    const img = byKind.get(kind)!;
    return {
      kind,
      index: i + 1,
      label: img.title || IMAGE_LABEL[kind],
      prompt: img.prompt,
      caption: img.caption,
      src: img.imageUrl || imageFallback(g.slug, kind),
      alt: img.alt,
      status: img.status,
    };
  });

  // Metadata chips (date · location · theme · Jesus).
  const metaChips = [
    { icon: "📅", text: g.estimatedDate },
    { icon: "📍", text: g.estimatedLocation },
    { icon: "✦", text: g.theme },
    { icon: "✝", text: `Jesus: ${g.jesusConnection.short}`, jesus: true },
  ];

  // Dashboard nav cards (key object · key person · Jesus).
  const keyObject = g.keyObjects[0];
  const keyPerson = g.keyPeople[0];
  const navCards = [
    {
      id: "key-object",
      label: "Key Object",
      support: keyObject?.title ?? "Key object",
      thumb: keyObject?.imageUrl || imageFallback(g.slug, "detail"),
    },
    {
      id: "key-person",
      label: "Key Person",
      support: keyPerson?.name ?? "Key person",
      thumb: keyPerson?.imageUrl || `/img/${g.slug}/person.svg`,
    },
    {
      id: "jesus",
      label: "Jesus",
      support: g.jesusConnection.short,
      thumb: `/img/${g.slug}/jesus.svg`,
      jesus: true,
    },
  ];

  // Mini timeline.
  const activeIndex = Math.max(
    0,
    g.timeline.items.findIndex((it) => it.active),
  );
  const timelineMini = {
    labels: g.timeline.items.map((it) => it.title),
    activeIndex,
  };

  // Deeper-study expandable cards.
  const insights: Insight[] = [
    {
      id: "context",
      icon: "🏛",
      title: "Historical Context",
      preview: firstSentence(g.historicalContext),
      body: g.historicalContext,
    },
    {
      id: "miss",
      icon: "🔍",
      title: "What Most People Miss",
      preview: firstSentence(g.whatPeopleMiss),
      body: g.whatPeopleMiss,
    },
    {
      id: "jesus",
      icon: "✝",
      title: "Jesus at the Center",
      preview: firstSentence(g.jesusConnection.full),
      body: g.jesusConnection.full,
      jesus: true,
    },
    {
      id: "theology",
      icon: "🛡",
      title: "Theology Principle",
      subtitle: g.theologyPrinciple.name,
      preview: firstSentence(g.theologyPrinciple.explanation),
      body: g.theologyPrinciple.explanation,
    },
    {
      id: "application",
      icon: "🌱",
      title: "Practical Application",
      preview: firstSentence(g.application),
      body: g.application,
    },
    {
      id: "prayer",
      icon: "🙏",
      title: "Prayer",
      preview: firstSentence(g.prayer),
      body: g.prayer,
    },
  ];

  // Go deeper, grouped.
  const deeperGroups = [
    { label: "Learn More", rows: g.goDeeper.learnMore.map((r) => ({ title: r.title, desc: r.description })) },
    { label: "Dive Deeper", rows: g.goDeeper.diveDeeper.map((r) => ({ title: r.title, desc: r.description })) },
    { label: "Grow Closer", rows: g.goDeeper.growCloser.map((r) => ({ title: r.title, desc: r.description })) },
  ];

  const keyItems: KeyItem[] = g.keyObjects.map((o) => ({
    name: o.title,
    type: "object" as const,
    blurb: o.description,
  }));

  return {
    // record
    status: g.status,
    version: g.version,
    reviewedAt: g.reviewedAt,

    slug: g.slug,
    book: g.book,
    chapter: g.chapter,
    reference: `${g.book} ${g.chapter}`,
    title: g.title,
    subtitle: g.subtitle,
    tagline: TAGLINE,
    theme: g.theme,

    estimatedDate: g.estimatedDate,
    estimatedLocation: g.estimatedLocation,
    jesusConnectionShort: g.jesusConnection.short,

    images,
    metaChips,
    navCards,
    timelineMini,
    insights,
    deeperGroups,

    quickSummary: g.summary,
    summary: g.sceneSetter,
    context: g.historicalContext,
    modernReadersMiss: g.whatPeopleMiss,
    jesusConnection: g.jesusConnection.full,
    application: g.application,
    prayer: g.prayer,

    characters: g.keyPeople.map((p) => ({ name: p.name, role: p.role })),
    modernMap: {
      caption: g.maps.modern.description,
      src: g.maps.modern.imageUrl || `/img/${g.slug}/map-modern.svg`,
      alt: g.maps.modern.description,
      note: g.maps.modern.uncertaintyNote,
      uncertaintyNote: g.maps.modern.uncertaintyNote,
    },
    historicMap: {
      caption: g.maps.historic.description,
      src: g.maps.historic.imageUrl || `/img/${g.slug}/map-historic.svg`,
      alt: g.maps.historic.description,
      note: g.maps.historic.uncertaintyNote,
      uncertaintyNote: g.maps.historic.uncertaintyNote,
    },
    timeline: g.timeline.items.map((it) => ({
      label: it.title,
      detail: it.description ?? "",
      current: it.active,
    })),
    keyItems,

    versions: [g.bibleText.version],
    defaultVersion: g.bibleText.version,
    verses: (g.bibleText.verses ?? []).map((v) => ({
      number: v.number,
      text: v.text,
      redLetter: v.redLetter,
    })),

    cost: g.cost,
  };
}
