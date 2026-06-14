-- Seed Exodus 27 into chapter_workups WITHOUT Node.
-- Paste into the Supabase SQL Editor and Run. Idempotent (upsert on slug).
-- workup_json holds the RENDER-ready ChapterWorkup (adapter output from the
-- generated fixture). Dollar-quoted so apostrophes need no escaping.

insert into chapter_workups
  (book, chapter, slug, title, subtitle, status, source, version, reviewed_at, bible_version, workup_json)
values (
  'Exodus', 27, 'exodus-27',
  'Exodus 27', 'The Bronze Altar, the Courtyard, and the Lamp',
  'reviewed', 'generated-fixture', '1', now(), 'ESV',
  $json$
{
  "status": "reviewed",
  "version": "1",
  "reviewedAt": "2026-06-13",
  "slug": "exodus-27",
  "book": "Exodus",
  "chapter": 27,
  "reference": "Exodus 27",
  "title": "Exodus 27",
  "subtitle": "The Bronze Altar, the Courtyard, and the Lamp",
  "tagline": "Pause. Reflect. Elevate.",
  "theme": "Holy access to God",
  "estimatedDate": "c. 1446 BC",
  "estimatedLocation": "Wilderness of Sinai",
  "jesusConnectionShort": "sacrifice • priesthood • light",
  "images": [
    { "kind": "establishing", "index": 1, "label": "Establishing Shot", "prompt": "Wide historically grounded view of the Israelite wilderness camp, many tents across a dry desert, the tabernacle courtyard at center with white linen curtains, the bronze altar near the entrance with smoke rising, priests moving, Sinai mountains in the distance, golden hour.", "caption": "The wilderness camp around the tabernacle courtyard.", "src": "/img/exodus-27/establishing.svg", "alt": "Wide view of the Israelite wilderness camp around the tabernacle courtyard.", "status": "placeholder" },
    { "kind": "detail", "index": 2, "label": "Detail Shot", "prompt": "Close realistic view of the bronze altar of acacia wood overlaid with bronze, horns on its corners, bronze utensils nearby, ash and glowing embers inside, warm light, priests tending the fire.", "caption": "The bronze altar — horns, tools, ash, and embers.", "src": "/img/exodus-27/detail.svg", "alt": "Close view of the bronze altar with horns, tools, ash and embers.", "status": "placeholder" },
    { "kind": "human", "index": 3, "label": "Human Moment", "prompt": "A priest in linen carefully pouring pure olive oil into a lamp at dusk inside the courtyard, warm light beginning to glow against linen curtains and desert darkness outside, reverent and still.", "caption": "A priest tending the lamp oil at dusk — keeping the light.", "src": "/img/exodus-27/human.svg", "alt": "A priest tending lamp oil at dusk in the tabernacle courtyard.", "status": "placeholder" }
  ],
  "metaChips": [
    { "icon": "📅", "text": "c. 1446 BC" },
    { "icon": "📍", "text": "Wilderness of Sinai" },
    { "icon": "✦", "text": "Holy access to God" },
    { "icon": "✝", "text": "Jesus: sacrifice • priesthood • light", "jesus": true }
  ],
  "navCards": [
    { "id": "key-object", "label": "Key Object", "support": "Bronze altar", "thumb": "/img/exodus-27/detail.svg" },
    { "id": "key-person", "label": "Key Person", "support": "Moses", "thumb": "/img/exodus-27/person.svg" },
    { "id": "jesus", "label": "Jesus", "support": "sacrifice • priesthood • light", "thumb": "/img/exodus-27/jesus.svg", "jesus": true }
  ],
  "timelineMini": { "labels": ["Passover", "Exodus", "Sinai", "Tabernacle"], "activeIndex": 2 },
  "insights": [
    { "id": "context", "icon": "🏛", "title": "Historical Context", "preview": "Israel is camped at Sinai, learning who their God is through a portable sanctuary.", "body": "Everything here is measured in cubits and made of specific materials: bronze for the courtyard and altar (the place of judgment and sacrifice), with silver and gold deeper inside. The closer you move toward God's presence, the more precious the metal — a built-in lesson in holiness." },
    { "id": "miss", "icon": "🔍", "title": "What Most People Miss", "preview": "To Israel an altar was blood, smoke, and cost — the visible price of drawing near.", "body": "To a modern reader an 'altar' is a quaint religious object. To Israel it was a place of blood, smoke, and cost — the visible price of drawing near to God. The horns were grasped for mercy, and the single gate meant there was one way in, not many." },
    { "id": "jesus", "icon": "✝", "title": "Jesus at the Center", "preview": "The altar and lamp point forward to Christ — our sacrifice and true light.", "body": "The bronze altar stands at the entrance — you cannot reach God's presence without first passing the place of sacrifice. Jesus becomes both the altar and the offering. The continually burning lamp points to the One who calls himself the light of the world, and the single courtyard gate anticipates his words: 'I am the door; whoever enters through me will be saved.'", "jesus": true },
    { "id": "theology", "icon": "🛡", "title": "Theology Principle", "subtitle": "Holiness", "preview": "God is set apart, and access to Him comes through what He ordained.", "body": "God is holy — utterly set apart — and people cannot approach on their own terms. Yet he provides the way: an altar, a sacrifice, an ordered space, and a light that never goes out. Later chapters build the priesthood and sacrificial system on top of this." },
    { "id": "application", "icon": "🌱", "title": "Practical Application", "preview": "Begin the day at the altar — in gratitude, not performance.", "body": "Approaching God has never been casual or self-made; it runs through what he provides. Before rushing into the day, pause at the 'altar' — receive that the way to God is already opened, not earned. Let gratitude, not performance, be the doorway." },
    { "id": "prayer", "icon": "🙏", "title": "Prayer", "preview": "Lord, teach me to approach You with reverence and live in the light of Your presence.", "body": "Father, thank you that you made a way to be near you when I could not make one myself. Like the altar at the entrance, let me begin here — at the cross, in gratitude. Keep the light of your presence burning in me today, and help me walk through the one door you opened in Jesus. Amen." }
  ],
  "deeperGroups": [
    { "label": "Learn More", "rows": [ { "title": "Bronze altar", "desc": "Understand the first object seen inside the courtyard." }, { "title": "Tabernacle courtyard", "desc": "See how sacred space taught Israel about access to God." } ] },
    { "label": "Dive Deeper", "rows": [ { "title": "Read Hebrews 9-10", "desc": "See how sacrifice and priesthood are fulfilled in Christ." }, { "title": "Study holiness", "desc": "Learn why God's nearness is both gift and danger." } ] },
    { "label": "Grow Closer", "rows": [ { "title": "Pray about reverence", "desc": "Ask God to make worship weighty again." }, { "title": "Sit with the lamp imagery", "desc": "Reflect on Christ as the true light." } ] }
  ],
  "quickSummary": "God gives Israel instructions for the bronze altar, the surrounding courtyard, and the oil for a lamp that must burn continually — together describing how a holy God makes a way to be approached.",
  "summary": "Israel is camped at the foot of Mount Sinai, freshly freed from Egypt, receiving the blueprint for the tabernacle — a portable sanctuary where God will dwell in the middle of the camp.",
  "context": "Everything here is measured in cubits and made of specific materials: bronze for the courtyard and altar (the place of judgment and sacrifice), with silver and gold deeper inside. The closer you move toward God's presence, the more precious the metal — a built-in lesson in holiness.",
  "modernReadersMiss": "To a modern reader an 'altar' is a quaint religious object. To Israel it was a place of blood, smoke, and cost — the visible price of drawing near to God. The horns were grasped for mercy, and the single gate meant there was one way in, not many.",
  "jesusConnection": "The bronze altar stands at the entrance — you cannot reach God's presence without first passing the place of sacrifice. Jesus becomes both the altar and the offering. The continually burning lamp points to the One who calls himself the light of the world, and the single courtyard gate anticipates his words: 'I am the door; whoever enters through me will be saved.'",
  "application": "Approaching God has never been casual or self-made; it runs through what he provides. Before rushing into the day, pause at the 'altar' — receive that the way to God is already opened, not earned. Let gratitude, not performance, be the doorway.",
  "prayer": "Father, thank you that you made a way to be near you when I could not make one myself. Like the altar at the entrance, let me begin here — at the cross, in gratitude. Keep the light of your presence burning in me today, and help me walk through the one door you opened in Jesus. Amen.",
  "characters": [
    { "name": "Moses", "role": "Receiving the tabernacle plans on Sinai" },
    { "name": "Aaron and his sons", "role": "The priests who will tend the altar and lamp" }
  ],
  "modernMap": { "caption": "The Sinai Peninsula with modern political borders.", "src": "/img/exodus-27/map-modern.svg", "alt": "The Sinai Peninsula with modern political borders.", "note": "Approximate region today; the exact site of Mount Sinai is debated.", "uncertaintyNote": "Approximate region today; the exact site of Mount Sinai is debated." },
  "historicMap": { "caption": "Egypt, Sinai, and Canaan in the biblical world, with Israel's wilderness route.", "src": "/img/exodus-27/map-historic.svg", "alt": "Egypt, Sinai, and Canaan in the biblical world, with Israel's wilderness route.", "note": "Possible route; details are traditional, not certain.", "uncertaintyNote": "Possible route; details are traditional, not certain." },
  "timeline": [
    { "label": "Passover", "detail": "Israel is spared and leaves Egypt.", "current": false },
    { "label": "Exodus", "detail": "Crossing the Red Sea out of slavery.", "current": false },
    { "label": "Sinai", "detail": "The covenant and the tabernacle instructions.", "current": true },
    { "label": "Tabernacle", "detail": "God's presence fills the completed sanctuary.", "current": false }
  ],
  "keyItems": [
    { "name": "Bronze altar", "type": "object", "blurb": "5 cubits square with four horns and a bronze grating for sacrifices." },
    { "name": "The courtyard", "type": "object", "blurb": "100x50 cubits of linen curtains on bronze posts enclosing the holy space." },
    { "name": "Continual lamp", "type": "object", "blurb": "Pure beaten olive oil keeps the light burning from evening to morning." }
  ],
  "versions": ["ESV"],
  "defaultVersion": "ESV",
  "verses": [
    { "number": 1, "text": "“You shall make the altar of acacia wood, five cubits long and five cubits broad. The altar shall be square, and its height shall be three cubits.”", "redLetter": true },
    { "number": 2, "text": "“And you shall make horns for it on its four corners; its horns shall be of one piece with it, and you shall overlay it with bronze.”", "redLetter": true },
    { "number": 3, "text": "“You shall make pots for it to receive its ashes, and shovels and basins and forks and fire pans. You shall make all its utensils of bronze.”", "redLetter": true },
    { "number": 8, "text": "“You shall make it hollow, with boards. As it has been shown you on the mountain, so shall it be made.”", "redLetter": true },
    { "number": 20, "text": "“You shall command the people of Israel that they bring to you pure beaten olive oil for the light, that a lamp may regularly be set up to burn.”", "redLetter": true },
    { "number": 21, "text": "“It shall be a statute forever to be observed throughout their generations by the people of Israel.”", "redLetter": true }
  ],
  "cost": { "textEstimateUsd": 0.0178, "imageEstimateUsd": 0.12, "totalEstimateUsd": 0.1378, "cached": true }
}
$json$::jsonb
)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  status = excluded.status,
  source = excluded.source,
  version = excluded.version,
  reviewed_at = excluded.reviewed_at,
  bible_version = excluded.bible_version,
  workup_json = excluded.workup_json,
  generation_completed_at = now(),
  updated_at = now();
