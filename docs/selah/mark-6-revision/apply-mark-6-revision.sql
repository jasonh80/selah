-- ============================================================================
-- MEGA MARK 6 — snapshot-first protected apply (owner-approved copy, head 1e7fcb5)
-- Board #29: Codex editorial approve + Jason copy approval, 2026-07-20.
-- Run the WHOLE script at once in the Supabase SQL editor.
--
-- What it does, in one transaction:
--   1. Archives the current live Mark 6 row into chapter_workup_versions
--      (next version number, labeled) — the rollback point.
--   2. Updates EXACTLY the 10 approved text paths inside workup_json.
--      Every path is guarded: if the live row differs AT ALL from the
--      reviewed base (drift since the snapshot), the update matches zero
--      rows, the assert below raises, and the WHOLE transaction — snapshot
--      included — rolls back. Nothing half-applies.
--   3. Asserts the new copy landed, and prints a verification summary.
-- Images, maps, verses, structure, metadata: untouched by construction
-- (jsonb_set on the 10 text paths only).
-- Rollback afterward = rollback-mark-6-revision.sql (restores the snapshot).
-- ============================================================================

begin;

-- 1) Snapshot (the rollback point)
insert into chapter_workup_versions (slug, version, label, status, workup_json)
select slug,
       coalesce((select max(version) from chapter_workup_versions where slug = 'mark-6'), 0) + 1,
       'pre-mega-mark-6 snapshot (apply 2026-07-20, PR #77 head 1e7fcb5)',
       status,
       workup_json
from chapter_workups
where slug = 'mark-6';

-- 2) Guarded apply — 10 text paths, all-or-nothing
update chapter_workups
set workup_json = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(workup_json, '{quickSummary}', to_jsonb($SELAH$Mark 6 keeps putting people close to Jesus—and showing how easy it is to miss Him. Nazareth dismisses Him, Herod hears truth and will not obey it, the disciples misunderstand Him, and Gennesaret runs to Him. Between them, two banquets: Herod protects his image and produces death; Jesus gives Himself and produces abundance.$SELAH$::text)), '{summary}', to_jsonb($SELAH$The chapter moves across Galilee with quick, vivid scenes: a synagogue in Nazareth, dusty village roads, a royal banquet hall, a lonely wilderness meal, a stormy lake at night, and crowded marketplaces filled with the sick. Mark is not simply collecting miracles. He is showing what kind of King Jesus is—and how people answer Him.$SELAH$::text)), '{modernReadersMiss}', to_jsonb($SELAH$The miracles are not random displays of power. Mark wants you to compare: Herod’s banquet with Jesus’ banquet, the Twelve’s mission with John’s martyrdom, Nazareth’s dismissal with Gennesaret’s run toward Him, and the disciples’ amazement with their failure to understand. They receive the bread, but they miss what the bread is saying.$SELAH$::text)), '{insights,0,preview}', to_jsonb($SELAH$Nazareth dismisses Him, Herod dodges the truth, the disciples misunderstand Him, Gennesaret runs to Him. One helpful way to read Mark 6: watch four responses to Jesus—and check yours.$SELAH$::text)), '{insights,0,body}', to_jsonb($SELAH$One helpful way to read Mark 6 is to watch four responses to Jesus.

Nazareth knows Him and dismisses Him—they can name His family and His trade, so they assume they have measured Him. Herod hears truth and will not obey it—John’s preaching fascinates him and troubles him, but he fears his guests more than God. The disciples work beside Jesus and still misunderstand Him—they hand out miracle bread and miss what it means. And Gennesaret knows it needs Him and runs toward Him—no credentials, just need, carried to the right person.

You can grow up around Jesus, listen to truth about Jesus, work for Jesus and receive from Jesus—and still miss who He is.

Between them sit two banquets—Herod’s and Jesus’. One table looks powerful. The other one is.

The line to carry is simple: do not receive the bread and miss who gave it.$SELAH$::text)), '{insights,1,body}', to_jsonb($SELAH$In verses 1-6, Jesus returns to Nazareth. The synagogue crowd is astonished, but their amazement curdles into offense. They know His family and trade, so they assume they know His limits. Familiarity can feel like understanding. It isn’t.

In verses 7-13, Jesus sends the Twelve out in pairs. They carry His authority, but not much else. No image campaign, no pile of supplies, no illusion of self-sufficiency. They preach repentance, confront evil, and heal the sick.

In verses 14-29, Mark interrupts the mission report with Herod’s memory of John. It is not random. John’s death shows what happens when truth confronts a ruler who is fascinated but unrepentant. Herodias wants revenge, Herod makes a reckless oath, and a prophet dies because a weak man will not look weak in front of guests.

In verses 30-44, the apostles return, and Jesus tries to take them away for rest. The crowds follow. Jesus does not treat them as an inconvenience. He sees shepherdless people, teaches them, and feeds them from almost nothing multiplied in His hands.

In verses 45-52, the disciples are on the lake at night, straining against the wind. Jesus sees them, comes to them walking on the sea, and speaks courage into their terror. Mark then gives the sting: they had not understood the loaves. They saw power and still missed His identity.

In verses 53-56, Gennesaret becomes a landscape of desperate faith. People carry the sick to Jesus and beg for even the slightest contact. The chapter that began with hometown rejection ends with needy strangers reaching for mercy. The people who knew Jesus best missed Him. The people who only knew their need found Him.$SELAH$::text)), '{insights,3,body}', to_jsonb($SELAH$Modern readers often treat the feeding and the walking on water as two separate miracle stories. Mark connects them. After Jesus comes to the disciples on the sea, Mark says their amazement is tied to their failure to understand the loaves.

That means the feeding was not only about hungry people getting food, though it was truly that. It was a sign revealing Jesus’ identity. In the wilderness, with shepherdless people, Jesus provides bread in abundance. This echoes Israel’s story and the hope that God Himself would shepherd His people.

The disciples do not need more data. They have seen demons yield, sickness healed, bread multiplied, and water under Jesus’ feet. Their issue is deeper: they receive Jesus’ help without fully seeing who He is.

The disciples are holding leftovers and still missing the point. You humans, you’re remarkably consistent.

That is still possible. You can be grateful for the bread and still miss the Shepherd.$SELAH$::text)), '{insights,8,body}', to_jsonb($SELAH$Mark places Herod’s banquet close to Jesus’ feeding of the five thousand for a reason. Herod gathers the powerful. Jesus gathers the needy. Herod’s table is full of performance, manipulation, and fear. Jesus’ meal begins with compassion and ends with leftovers.

Herod protects his image and produces death—a prophet dies so a king can save face. Jesus gives Himself and produces abundance—five thousand fed, twelve baskets left over. He shepherds people everyone else is ready to send away.

This is more than a moral lesson about bad parties and good picnics. It is a kingdom contrast. Which table looks powerful? Which table is actually life?$SELAH$::text)), '{insights,6,preview}', to_jsonb($SELAH$Let Mark 6 search the places where Jesus has become too familiar, where fear of people feels stronger than obedience, where the storm feels unseen—and where your need is the thing to bring Him.$SELAH$::text)), '{insights,6,body}', to_jsonb($SELAH$Start with Nazareth. The danger is not knowing too much about Jesus. The danger is thinking you know Him so well that you no longer listen.

Then look at Herod. Where do you protect your image instead of obeying the truth? He knows enough to be troubled, not enough to repent. Fear wearing royal clothing is still fear.

Then look at the disciples. Jesus sends them before they fully understand Him. You do not have to be impressive to obey the next clear thing. Dependence is not a backup plan; it is part of following Jesus.

Finally, look at the storm. Here is the good news. Jesus sees the disciples straining before they understand Him. He comes toward them in the dark—not after they pass a theology exam. Their faith is unfinished. Their Shepherd is not.

When you do not know what to bring Him, bring what Gennesaret brought: plain need. As many as touched even the edge of His garment were healed.$SELAH$::text)),
    updated_at = now()
where slug = 'mark-6'
  and workup_json->>'quickSummary' = $SELAH$Mark 6 places two kingdoms side by side: Herod’s fearful, image-driven power and Jesus’ humble, life-giving authority. Jesus is rejected at home, sends the Twelve, feeds a wilderness crowd, walks on the sea, and heals the sick, while Herod’s banquet exposes the violence of a ruler with power but no moral spine.$SELAH$
  and workup_json->>'summary' = $SELAH$The chapter moves across Galilee with quick, vivid scenes: a synagogue in Nazareth, dusty village roads, a royal banquet hall, a lonely wilderness meal, a stormy lake at night, and crowded marketplaces filled with the sick. Mark is not simply collecting miracles. He is showing what kind of King Jesus is.$SELAH$
  and workup_json->>'modernReadersMiss' = $SELAH$The miracles are not random displays of power. Mark wants the reader to compare Herod’s banquet with Jesus’ banquet, the disciples’ mission with John’s martyrdom, and the disciples’ amazement with their failure to understand. They receive the bread, but they miss what the bread is saying.$SELAH$
  and workup_json->'insights'->0->>'preview' = $SELAH$Mark 6 puts two kingdoms on the page: Herod’s kingdom of fear and Jesus’ kingdom of compassion. The question is not whether Jesus is useful, but whether we see who He is.$SELAH$
  and workup_json->'insights'->0->>'body' = $SELAH$Mark 6 is built on contrast. One kingdom is Herod’s: polished, powerful, image-obsessed, and deadly. The other is Jesus’ kingdom: humble, rejected, dependent, compassionate, and overflowing with life.

The chapter begins with people in Jesus’ hometown refusing Him because He seems too familiar. It moves to the Twelve being sent with little in their hands, then to John the Baptist losing his life because a ruler cared more about saving face than obeying truth. Then Mark shows Jesus feeding a crowd in the wilderness and walking to His disciples over the sea.

That movement matters. Herod’s feast ends with death. Jesus’ feast ends with leftovers. Herod hears truth and silences it. Jesus sees need and shepherds it. The disciples receive bread but still do not grasp who stands before them.

The line to carry is simple: do not receive the bread and miss who gave it.$SELAH$
  and workup_json->'insights'->1->>'body' = $SELAH$In verses 1-6, Jesus returns to Nazareth. The synagogue crowd is astonished, but their amazement curdles into offense. They know His family and trade, so they assume they know His limits. Familiarity pretending to be discernment.

In verses 7-13, Jesus sends the Twelve out in pairs. They carry His authority, but not much else. No image management campaign, no pile of supplies, no illusion of self-sufficiency. They preach repentance, confront evil, and heal the sick.

In verses 14-29, Mark interrupts the mission report with Herod’s memory of John. It is not random. John’s death shows what happens when truth confronts a ruler who is fascinated but unrepentant. Herodias wants revenge, Herod makes a reckless oath, and a prophet dies because a weak man will not look weak in front of guests.

In verses 30-44, the apostles return, and Jesus tries to take them away for rest. The crowds follow. Jesus does not treat them as an inconvenience. He sees shepherdless people. He teaches them and then feeds them with a small amount of food multiplied in His hands.

In verses 45-52, the disciples are on the lake at night, straining against the wind. Jesus sees them, comes to them walking on the sea, and speaks courage into their terror. Mark then gives the sting: they had not understood the meaning of the loaves. They saw power, but they had not yet understood His identity.

In verses 53-56, Gennesaret becomes a landscape of desperate faith. People carry the sick to Jesus and beg for even the slightest contact. The chapter that began with hometown rejection ends with needy strangers reaching for mercy.$SELAH$
  and workup_json->'insights'->3->>'body' = $SELAH$Modern readers often treat the feeding and the walking on water as two separate miracle stories. Mark connects them. After Jesus comes to the disciples on the sea, Mark says their amazement is tied to their failure to understand the loaves.

That means the feeding was not only about hungry people getting food, though it was truly that. It was a sign revealing Jesus’ identity. In the wilderness, with shepherdless people, Jesus provides bread in abundance. This echoes Israel’s story and the hope that God Himself would shepherd His people.

The disciples do not need more data. They have seen demons yield, sickness healed, bread multiplied, and water under Jesus’ feet. Their issue is deeper: they benefit from Jesus’ power without fully beholding Jesus’ person.

That is still possible. You can want help from Jesus and still resist worshiping Him as Lord. You can be grateful for the bread and still miss the Shepherd.$SELAH$
  and workup_json->'insights'->8->>'body' = $SELAH$Mark places Herod’s banquet close to Jesus’ feeding of the five thousand for a reason. Herod gathers the powerful. Jesus gathers the needy. Herod’s table is full of performance, manipulation, and fear. Jesus’ meal begins with compassion and ends with leftovers.

The contrast is sharp: Herod’s feast produces death for a righteous man; Jesus’ feast gives life to hungry people. Herod protects his reputation. Jesus gives Himself to shepherd the crowd.

This is more than a moral lesson about bad parties and good picnics. It is a kingdom contrast. Which table looks powerful? Which table is actually life?$SELAH$
  and workup_json->'insights'->6->>'preview' = $SELAH$Let Mark 6 search the places where Jesus has become too familiar, where fear of people feels stronger than obedience, and where the storm feels unseen.$SELAH$
  and workup_json->'insights'->6->>'body' = $SELAH$Start with Nazareth. Where has closeness to religious language made Jesus seem ordinary in the wrong way? The danger is not knowing too much about Him. The danger is thinking you know Him so well that you no longer listen.

Then look at Herod. Where are you tempted to protect your image instead of obeying the truth? Herod’s collapse is painfully modern: he knows enough to be troubled, but not enough to repent. Fear wearing royal clothing is still fear.

Then look at the disciples. Jesus sends them before they fully understand Him. That should comfort and humble us. You do not have to be impressive to obey the next clear thing. Dependence is not a backup plan; it is part of discipleship.

Finally, look at the storm. Jesus saw them straining. He came to them before they understood. Trust Him before you can see how the whole crossing works out. The Shepherd is not only present at the miracle meal. He is Lord in the exhausting night crossing too.$SELAH$
  and workup_json->'insights'->0->>'id' = 'big-idea'
  and workup_json->'insights'->1->>'id' = 'chapter-flow'
  and workup_json->'insights'->3->>'id' = 'what-most-miss'
  and workup_json->'insights'->8->>'id' = 'two-banquets'
  and workup_json->'insights'->6->>'id' = 'application';

-- 3) Assert it landed (otherwise abort EVERYTHING, snapshot included)
do $assert$
begin
  if not exists (
    select 1 from chapter_workups
    where slug = 'mark-6'
      and workup_json->>'quickSummary' like 'Mark 6 keeps putting people close to Jesus%'
      and workup_json->'insights'->6->>'body' like '%Their faith is unfinished. Their Shepherd is not.%'
  ) then
    raise exception 'MEGA MARK 6 APPLY DID NOT MATCH THE LIVE ROW - aborted, nothing changed. Tell Claude: the row drifted from the reviewed base.';
  end if;
end
$assert$;

commit;

-- 4) Verification summary (read-only)
select
  left(workup_json->>'quickSummary', 70)  as new_quick_summary_start,
  jsonb_array_length(workup_json->'images')       as images_count_expect_5,
  workup_json->'modernMap'->>'src'                 as modern_map_untouched,
  (select max(version) from chapter_workup_versions where slug='mark-6') as snapshot_version
from chapter_workups where slug = 'mark-6';
