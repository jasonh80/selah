import type { ChapterWorkup } from "@/lib/types";

// Placeholder content for the static prototype. In production this object is
// produced once by the generation service and cached forever.
export const exodus27: ChapterWorkup = {
  slug: "exodus-27",
  book: "Exodus",
  chapter: 27,
  reference: "Exodus 27",
  title: "The Altar and the Courtyard",
  theme: "Approaching a holy God",

  estimatedDate: "c. 1446 BC",
  estimatedLocation: "Wilderness of Sinai",
  jesusConnectionShort: "The altar foreshadows the cross",

  images: [
    {
      kind: "establishing",
      label: "Establishing Shot",
      prompt:
        "Israelite wilderness camp at golden hour with the tabernacle courtyard at the center, linen curtains on bronze posts, tents arranged around it, Sinai mountains in the distance.",
      caption:
        "The wilderness camp, with the tabernacle courtyard set apart at its center.",
      src: "/img/exodus-27/establishing.svg",
      alt: "Wide view of the Israelite wilderness camp around the tabernacle courtyard.",
    },
    {
      kind: "detail",
      label: "Detail Shot",
      prompt:
        "A bronze altar with four horns at its corners, bronze tools, grates, shovels and basins, ash and glowing embers, warm light.",
      caption: "The bronze altar — horns at each corner, tools, ash, and embers.",
      src: "/img/exodus-27/detail.svg",
      alt: "Close view of the bronze altar with horns, tools, ash and embers.",
    },
    {
      kind: "human",
      label: "Human Moment",
      prompt:
        "A priest in linen tending the lamp oil at dusk inside the courtyard, quiet and reverent, soft lamplight on his face.",
      caption: "A priest tending the lamp oil at dusk — keeping the light.",
      src: "/img/exodus-27/human.svg",
      alt: "A priest tending lamp oil at dusk in the tabernacle courtyard.",
    },
  ],

  summary:
    "God continues giving Moses the blueprint for the tabernacle. This chapter covers three things: the bronze altar where sacrifices are offered, the courtyard that surrounds the whole structure, and the oil for the lamp that must burn continually. Together they describe how a holy God makes a way to be approached — through sacrifice, within set-apart space, kept by a light that never goes out.",

  context:
    "Israel has just been freed from Egypt and is camped at Mount Sinai. They are a people on the move, living in tents, learning who their God is. The tabernacle is a portable sanctuary — God choosing to dwell in the middle of the camp. Everything here is measured in cubits and made of specific materials: bronze for the courtyard and altar (the place of judgment and sacrifice), silver and gold deeper inside. The closer you move toward God's presence, the more precious the metal — a built-in lesson in holiness.",

  modernReadersMiss:
    "To a modern reader an 'altar' is a quaint religious object. To Israel it was a place of blood, smoke, and cost — the visible price of drawing near to God. The four horns weren't decoration; they were grasped for mercy and used to bind the sacrifice. And the courtyard's single entrance mattered: there was one way in, not many. That detail is doing theological work.",

  jesusConnection:
    "The bronze altar stands at the entrance — you cannot reach God's presence without first passing the place of sacrifice. Centuries later, Jesus becomes both the altar and the offering. The continually burning lamp points to the One who calls himself the light of the world, and the single courtyard entrance anticipates his words: 'I am the door; whoever enters through me will be saved.'",

  theologyPrinciple: {
    title: "Atonement",
    body: "Sin separates people from a holy God, and the gap is closed by substitution — a life given in place of another. The altar teaches this in physical form long before the cross explains it in full. Today's principle is small and foundational; later chapters build on it.",
    buildsOn:
      "Foundational — later chapters build the priesthood and sacrificial system on top of this.",
  },

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
    caption: "Sinai Peninsula, modern political borders",
    src: "/img/exodus-27/map-modern.svg",
    alt: "Modern map of the Sinai Peninsula.",
    note: "The traditional location of Mount Sinai sits in the south of the peninsula, in present-day Egypt.",
  },
  historicMap: {
    caption: "The wilderness route, c. 1446 BC",
    src: "/img/exodus-27/map-historic.svg",
    alt: "Historic map of Israel's wilderness route from Egypt to Sinai.",
    note: "Israel camped at the foot of Sinai for roughly a year while receiving the law and building the tabernacle.",
  },

  timeline: [
    { label: "The Exodus from Egypt", detail: "Israel leaves slavery behind." },
    { label: "Crossing the Red Sea", detail: "Deliverance from Pharaoh's army." },
    { label: "Arrival at Sinai", detail: "The people camp at the mountain." },
    { label: "The Ten Commandments", detail: "The covenant is given." },
    {
      label: "Tabernacle instructions",
      detail: "Including the altar & courtyard of Exodus 27.",
      current: true,
    },
    { label: "The tabernacle is built", detail: "God's presence fills it." },
  ],

  keyItems: [
    { name: "Bronze altar", type: "object", blurb: "5 cubits square, with four horns and a bronze grating for sacrifices." },
    { name: "Horns of the altar", type: "object", blurb: "Corner projections grasped for mercy and used to bind the offering." },
    { name: "The courtyard", type: "place", blurb: "100×50 cubits of linen curtains on bronze posts, enclosing the holy space." },
    { name: "The single gate", type: "place", blurb: "One 20-cubit entrance — the only way in, on the east side." },
    { name: "Continual lamp", type: "custom", blurb: "Pure olive oil keeps the light burning from evening to morning." },
  ],

  versions: ["ESV", "NIV", "KJV", "NLT", "CSB"],
  defaultVersion: "ESV",
  verses: [
    { number: 1, text: "“You shall make the altar of acacia wood, five cubits long and five cubits broad. The altar shall be square, and its height shall be three cubits.”", redLetter: true },
    { number: 2, text: "“And you shall make horns for it on its four corners; its horns shall be of one piece with it, and you shall overlay it with bronze.”", redLetter: true },
    { number: 3, text: "“You shall make pots for it to receive its ashes, and shovels and basins and forks and fire pans. You shall make all its utensils of bronze.”", redLetter: true },
    { number: 8, text: "“You shall make it hollow, with boards. As it has been shown you on the mountain, so shall it be made.”", redLetter: true },
    { number: 20, text: "“You shall command the people of Israel that they bring to you pure beaten olive oil for the light, that a lamp may regularly be set up to burn.”", redLetter: true },
    { number: 21, text: "“It shall be a statute forever to be observed throughout their generations by the people of Israel.”", redLetter: true },
  ],

  deeper: [
    { group: "learn-more", title: "Why bronze, silver, and gold?", blurb: "How the tabernacle's metals map the journey toward God's presence." },
    { group: "learn-more", title: "What the horns of the altar meant", blurb: "Mercy, refuge, and the binding of the sacrifice." },
    { group: "dive-deeper", title: "The altar and the cross", blurb: "Trace the line from Exodus 27 to Hebrews 9–10." },
    { group: "dive-deeper", title: "One gate, one way in", blurb: "The single entrance and John 10:9." },
    { group: "grow-closer", title: "A practice of approach", blurb: "A short daily rhythm of beginning at the altar in gratitude." },
    { group: "grow-closer", title: "Keeping the light", blurb: "What 'a lamp that burns continually' asks of us today." },
  ],
};
