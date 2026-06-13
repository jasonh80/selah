import type { ChapterWorkup } from "@/lib/types";

// Placeholder content for the static prototype. In production this object is
// produced once by the generation service and cached forever.
export const exodus27: ChapterWorkup = {
  slug: "exodus-27",
  book: "Exodus",
  chapter: 27,
  reference: "Exodus 27",
  title: "Exodus 27",
  subtitle: "The Bronze Altar, the Courtyard, and the Lamp",
  tagline: "Learn more. Dive deeper. Grow closer to Jesus.",
  theme: "Holy access to God",

  estimatedDate: "c. 1446 BC",
  estimatedLocation: "Sinai wilderness",
  jesusConnectionShort: "sacrifice • priesthood • light",

  images: [
    {
      kind: "establishing",
      index: 1,
      label: "Establishing Shot",
      prompt:
        "Wide historically grounded view of the Israelite wilderness camp, many tents across a dry desert, the tabernacle courtyard at center with white linen curtains, the bronze altar near the entrance with smoke rising, priests moving, the tabernacle tent behind.",
      caption: "The wilderness camp around the tabernacle courtyard.",
      src: "/img/exodus-27/establishing.svg",
      alt: "Wide view of the Israelite wilderness camp around the tabernacle courtyard.",
    },
    {
      kind: "detail",
      index: 2,
      label: "Detail Shot",
      prompt:
        "Close realistic view of the bronze altar of acacia wood overlaid with bronze, horns on its corners, bronze utensils nearby, ash and embers inside, priests tending the fire.",
      caption: "The bronze altar — horns, tools, ash, and embers.",
      src: "/img/exodus-27/detail.svg",
      alt: "Close view of the bronze altar with horns, tools, ash and embers.",
    },
    {
      kind: "human",
      index: 3,
      label: "Human Moment",
      prompt:
        "A priest carefully pouring pure olive oil into a lamp at dusk, warm light beginning to glow against linen curtains and desert darkness outside.",
      caption: "A priest tending the lamp oil at dusk.",
      src: "/img/exodus-27/human.svg",
      alt: "A priest tending lamp oil at dusk in the tabernacle courtyard.",
    },
  ],

  metaChips: [
    { icon: "📅", text: "c. 1446 BC" },
    { icon: "⛰", text: "Sinai wilderness" },
    { icon: "✦", text: "Theme: Holy access to God" },
    { icon: "✝", text: "Jesus: sacrifice • priesthood • light", jesus: true },
  ],

  navCards: [
    { id: "timeline", label: "Timeline", miniTimeline: true },
    { id: "modern-map", label: "Modern Map", thumb: "/img/exodus-27/map-modern.svg" },
    { id: "historic-map", label: "Historic Map", thumb: "/img/exodus-27/map-historic.svg" },
    { id: "key-object", label: "Key Object", thumb: "/img/exodus-27/detail.svg" },
    { id: "key-person", label: "Key Person", thumb: "/img/exodus-27/person.svg" },
    { id: "jesus", label: "Jesus", thumb: "/img/exodus-27/jesus.svg", jesus: true },
  ],

  timelineMini: {
    labels: ["Passover", "Exodus", "Sinai", "Tabernacle"],
    activeIndex: 1,
  },

  insights: [
    {
      id: "miss",
      icon: "🔍",
      title: "What Most People Miss",
      preview: "The tabernacle teaches theology through physical space and ritual.",
      body: "To a modern reader an 'altar' is a quaint religious object. To Israel it was a place of blood, smoke, and cost — the visible price of drawing near to God. The four horns weren't decoration; they were grasped for mercy and used to bind the sacrifice. And the courtyard's single entrance mattered: there was one way in, not many. The space itself is doing theological work.",
    },
    {
      id: "jesus",
      icon: "✝",
      title: "Jesus at the Center",
      preview: "The altar and lamp point forward to Christ — our sacrifice and true light.",
      body: "The bronze altar stands at the entrance — you cannot reach God's presence without first passing the place of sacrifice. Centuries later, Jesus becomes both the altar and the offering. The continually burning lamp points to the One who calls himself the light of the world, and the single courtyard entrance anticipates his words: 'I am the door; whoever enters through me will be saved.'",
      jesus: true,
    },
    {
      id: "theology",
      icon: "🛡",
      title: "Theology Principle",
      subtitle: "Holiness",
      preview: "God is set apart, and access to Him comes through what He ordained.",
      body: "God is holy — utterly set apart — and people cannot approach on their own terms. Yet he provides the way: an altar, a sacrifice, an ordered space, a light that never goes out. This is a small, foundational principle; later chapters build the priesthood and the sacrificial system on top of it.",
    },
    {
      id: "prayer",
      icon: "🙏",
      title: "Prayer",
      preview: "Lord, teach me to approach You with reverence and live in the light of Your presence.",
      body: "Father, thank you that you made a way to be near you when I could not make one myself. Like the altar at the entrance, let me begin here — at the cross, in gratitude. Keep the light of your presence burning in me today, and help me walk through the one door you opened in Jesus. Amen.",
    },
  ],

  deeperPills: [
    { icon: "📖", label: "Read Hebrews 9–10" },
    { icon: "✝", label: "Study sacrifice" },
    { icon: "👥", label: "Explore priesthood" },
    { icon: "🙏", label: "Pray about reverence" },
  ],

  quickSummary:
    "God gives Israel instructions for the bronze altar, the courtyard, and the lamp oil, teaching that worship is holy, ordered, and centered on access to God through sacrifice and His presence.",

  summary:
    "God continues giving Moses the blueprint for the tabernacle: the bronze altar where sacrifices are offered, the courtyard that surrounds the whole structure, and the oil for the lamp that must burn continually. Together they describe how a holy God makes a way to be approached.",

  context:
    "Israel has just been freed from Egypt and is camped at Mount Sinai — a people on the move, living in tents, learning who their God is. The tabernacle is a portable sanctuary: God choosing to dwell in the middle of the camp. Everything is measured in cubits and made of specific materials — bronze for the courtyard and altar, silver and gold deeper inside. The closer you move toward God's presence, the more precious the metal: a built-in lesson in holiness.",

  modernReadersMiss:
    "To a modern reader an 'altar' is a quaint religious object. To Israel it was a place of blood, smoke, and cost — the visible price of drawing near to God. The four horns weren't decoration; they were grasped for mercy and used to bind the sacrifice. And the single courtyard entrance mattered: there was one way in, not many.",

  jesusConnection:
    "The bronze altar stands at the entrance — you cannot reach God's presence without first passing the place of sacrifice. Centuries later, Jesus becomes both the altar and the offering. The continually burning lamp points to the One who calls himself the light of the world, and the single courtyard entrance anticipates his words: 'I am the door; whoever enters through me will be saved.'",

  application:
    "Approaching God has never been casual or self-made; it runs through what he provides. Before rushing into the day, pause at the 'altar' — receive that the way to God is already opened, not earned. Let gratitude, not performance, be the doorway.",

  prayer:
    "Father, thank you that you made a way to be near you when I could not make one myself. Like the altar at the entrance, let me begin here — at the cross, in gratitude. Keep the light of your presence burning in me today, and help me walk through the one door you opened in Jesus. Amen.",

  characters: [
    { name: "Moses", role: "Receiving the tabernacle plans on Sinai" },
    { name: "Aaron & his sons", role: "The priests who will tend the altar and lamp" },
    { name: "The people of Israel", role: "Asked to bring pure oil for the light" },
  ],

  modernMap: {
    caption: "Approximate region today",
    src: "/img/exodus-27/map-modern.svg",
    alt: "Modern map of the Sinai Peninsula.",
    note: "The traditional location of Mount Sinai sits in the south of the peninsula, in present-day Egypt. Exact site debated.",
  },
  historicMap: {
    caption: "Biblical world",
    src: "/img/exodus-27/map-historic.svg",
    alt: "Historic map of Egypt, Sinai, and Canaan.",
    note: "Israel camped at the foot of Sinai for roughly a year while receiving the law and building the tabernacle.",
  },

  timeline: [
    { label: "The Exodus from Egypt", detail: "Israel leaves slavery behind." },
    { label: "Crossing the Red Sea", detail: "Deliverance from Pharaoh's army." },
    { label: "Arrival at Sinai", detail: "The people camp at the mountain." },
    { label: "The Ten Commandments", detail: "The covenant is given." },
    { label: "Tabernacle instructions", detail: "Including the altar & courtyard of Exodus 27.", current: true },
    { label: "The tabernacle is built", detail: "God's presence fills it." },
  ],

  keyItems: [
    { name: "Bronze altar", type: "object", blurb: "5 cubits square, with four horns and a bronze grating for sacrifices." },
    { name: "Horns of the altar", type: "object", blurb: "Corner projections grasped for mercy and used to bind the offering." },
    { name: "The courtyard", type: "place", blurb: "100×50 cubits of linen curtains on bronze posts, enclosing the holy space." },
    { name: "The single gate", type: "place", blurb: "One 20-cubit entrance — the only way in, on the east side." },
    { name: "Continual lamp", type: "custom", blurb: "Pure olive oil keeps the light burning from evening to morning." },
  ],

  versions: ["ESV", "NIV", "KJV", "NLT", "CSB", "NKJV", "NASB"],
  defaultVersion: "ESV",
  verses: [
    { number: 1, text: "“You shall make the altar of acacia wood, five cubits long and five cubits broad. The altar shall be square, and its height shall be three cubits.”", redLetter: true },
    { number: 2, text: "“And you shall make horns for it on its four corners; its horns shall be of one piece with it, and you shall overlay it with bronze.”", redLetter: true },
    { number: 3, text: "“You shall make pots for it to receive its ashes, and shovels and basins and forks and fire pans. You shall make all its utensils of bronze.”", redLetter: true },
    { number: 8, text: "“You shall make it hollow, with boards. As it has been shown you on the mountain, so shall it be made.”", redLetter: true },
    { number: 20, text: "“You shall command the people of Israel that they bring to you pure beaten olive oil for the light, that a lamp may regularly be set up to burn.”", redLetter: true },
    { number: 21, text: "“It shall be a statute forever to be observed throughout their generations by the people of Israel.”", redLetter: true },
  ],
};
