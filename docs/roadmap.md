# Selah roadmap (future ideas — not built)

Captured for later. None of these are implemented yet.

## 1. Modern View / "Standing There Today"
Show what a chapter's location might look like if the user were standing there
today, using **official Google Maps / Street View APIs** where licensing allows.
- Do NOT scrape screenshots or imagery.
- Respect Google Maps Platform terms (attribution, usage limits, billing).
- Will surface in the **Maps & Places** section (the "Standing there today"
  placeholder card was removed from the showcase; bring it back when real).

## 2. Verse Highlights
Let users highlight verses while reading and revisit all highlighted verses in
one place later.
- Per-user data → lives in the future personalization layer (`user_chapter_layers`),
  never in the global chapter workup.
- Needs auth first.

## 3. Trusted Voices
Show what respected Christian authors, theologians, pastors, and speakers have
said about a verse or topic.
- Proper attribution; copyright-safe quoting/summarizing only.
- Curated/licensed sources — not scraped.

## 4. Dramatic Scripture narration (voice)
Future: a "Listen" / "Dramatic Reading" / "Spoken Scripture" mode that reads the
chapter aloud.
- Desired voice: deep, warm, resonant, cinematic, reverent, authoritative,
  slow-paced biblical narration.
- Do NOT imitate or clone any specific real actor's voice — describe the style,
  don't mimic a person.
- Labels to consider: Listen · Dramatic Reading · Spoken Scripture · Chapter Reading.
- Roadmap only; not built.

## 5. Character Repository ("Visual Bible")
Future: a repository so recurring biblical figures stay visually consistent
across chapters and generated images. Each character could carry:
`characterId`, `name`, age range by chapter/era, historical setting,
clothing/material references, hair/beard/face notes, physical build, emotional
presence, approved base image references, negative prompts, continuity notes.
- Characters can age/change by era but should still feel consistent when
  appropriate (e.g. David as young shepherd vs David as king).
- Examples: Moses, Aaron, David (shepherd / king), Peter, Paul, Mary, Pharaoh,
  tabernacle priest.
- Roadmap only; not built.

## 6. More photorealistic chapter images
Current Psalm 23 images are good enough for the showcase, but long-term the
generated chapter images should feel more like a still from a high-end
historical documentary:
- more photo-real historical realism; less "AI-polished" look
- more documentary / cinematic realism
- more accurate ancient clothing, materials, and terrain
- less fantasy, less illustration
Approach later via stronger prompts and/or a higher-fidelity image model. Do NOT
regenerate now — roadmap only.

---
Already noted elsewhere (not in this pass): real chapter image generation
(Phase 3), audio/Listen, additional Bible translations, admin review UI.
