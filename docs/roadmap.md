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

## 4. More photorealistic chapter images
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
