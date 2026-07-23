# Who Ruled Where — a dated territory map (proposal, 2026-07-23)

**Free proposal. Nothing built. For Jason + Codex to rule on.**

Owner: *"we may not know it exactly, but we should be able to get closer than
anybody else has ever done."* Agreed — but not by drawing a more precise line.
By being the first to show honestly where the line isn't, and by dating the map
to the chapter.

---

## 1. Why every Bible map you have seen is wrong

Open any study Bible. "The Kingdom of Herod the Great," or "Palestine in the
Time of Christ," with crisp coloured territories and hard borders. Two problems:

**The lines are invented.** Josephus does not give boundaries. He gives
**lists** — which cities, districts, and toparchies went to which heir when
Herod's kingdom was divided (*Antiquities* 17.317–320; *War* 2.94–100), and
Luke 3:1 names the tetrarchs at the start of John's ministry. Ancient
administration worked by city and district, not by surveyed line. The
cartographer draws the edge; the source never did.

**The maps are undated.** Territory changed constantly, and a single static map
is wrong for most chapters:

| Year | What changed |
|---|---|
| 4 BC | Herod the Great dies; the kingdom is divided among Archelaus, Antipas, Philip |
| AD 6 | Archelaus deposed; **Judea, Samaria, Idumea become a Roman province** under a prefect |
| AD 26–36 | **Pontius Pilate** is prefect |
| AD 34 | **Philip dies**; his tetrarchy is attached to the province of Syria |
| AD 39 | **Antipas deposed** and exiled |
| AD 41–44 | Agrippa I briefly reunites nearly the whole kingdom |

Mark's action sits around **AD 29–30**. A map labelled "Herod's Kingdom" is
describing a world that ended thirty years earlier.

## 2. What we propose instead

### (a) Cities, not areas — the ground truth

Plot the **towns the sources actually assign**, coloured by who ruled them. No
boundary is drawn at all. The reader sees the territory from its cities, which
is exactly how a first-century person would have understood it. This alone is
more honest than every printed map, and it needs no invented data.

### (b) A fade, not an edge

Where shading helps the eye, let the colour **thin out with distance from the
nearest attested city** rather than stopping at a line. The map then shows
confidence decreasing — which is the true state of our knowledge — instead of
asserting a frontier. No hard stroke anywhere.

### (c) Date it to the chapter

The map carries the chapter's year: **"AD 29 — who ruled where."** Rulers
whose dates do not contain the chapter year are not drawn. This is the piece
nobody does, and it is the one that makes the map genuinely more accurate
rather than merely more cautious.

### (d) Say the uncertainty in the reader's words

One line under the map, in the friend voice, not a disclaimer:

> These cities are recorded. The edges between them are not — ancient rulers
> governed towns and districts, not lines on a map, so we have shown where the
> certainty fades.

---

## 3. The data (AD 29 — needs Codex verification before anything is built)

Every entry needs three fields: **who assigns it** (source), **how sure the
location is**, and **the ruler for THIS year**. Coordinates below are
approximate and must be checked; identification confidence is flagged.

### Herod Antipas — tetrarch of Galilee and Perea (4 BC – AD 39)

| City | Location confidence | Note |
|---|---|---|
| Tiberias | secure | his capital, founded c. AD 20 |
| Sepphoris | secure | earlier capital |
| Capernaum | secure | Mark's home base |
| Magdala / Taricheae | secure | |
| Chorazin | secure | |
| Nazareth | secure | |
| Nain | secure | |
| Cana | **disputed** | Kh. Qana vs Kafr Kanna |
| Machaerus (Perea) | secure | where Josephus places John's execution |
| Livias / Betharamphtha (Perea) | reasonably secure | |
| Amathus (Perea) | reasonably secure | |

### Philip the Tetrarch — Iturea, Trachonitis, Gaulanitis, Batanea, Auranitis (4 BC – AD 34)

| City | Location confidence | Note |
|---|---|---|
| Caesarea Philippi (Paneas / Banias) | secure | Mark 8:27 |
| Bethsaida Julias | **disputed** | et-Tell vs el-Araj — already flagged in our Mark 8 map notes |

### Roman prefect (Pontius Pilate, AD 26–36) — Judea, Samaria, Idumea

| City | Location confidence | Note |
|---|---|---|
| Caesarea Maritima | secure | the prefect's actual seat, not Jerusalem |
| Jerusalem | secure | |
| Jericho | secure | |
| Bethlehem | secure | |
| Sebaste (Samaria) | secure | |
| Joppa | secure | |
| Lydda | secure | |
| Hebron | secure | |
| Emmaus | **disputed** | several candidates |

### The Decapolis — Greek cities, province of Syria

| City | Location confidence |
|---|---|
| Scythopolis (Beth Shean) | secure — the only one west of the Jordan |
| Gadara | secure |
| Hippos (Sussita) | secure |
| Pella | secure |
| Gerasa (Jerash) | secure |
| Philadelphia (Amman) | secure |
| Damascus | secure |
| Dion · Canatha · Raphana | Dion and Raphana **uncertain** |

*Note: the ancient lists of the Decapolis do not fully agree with each other.
The map should say "the cities usually counted," not "the ten."*

### Phoenicia — province of Syria

Tyre and Sidon, both secure. Mark 7 goes there.

---

## 4. Honesty gates (binding, same standard as the map notes)

1. **No hard boundary stroke anywhere.** If it looks like a border, it is one.
2. **Nothing plotted without a source** naming that city under that ruler.
3. **Disputed sites render as areas**, matching the existing marker rules.
4. **The year is always visible.** A territory map without a date is a claim we
   cannot support.
5. **Undated or out-of-range rulers are not drawn** — no Agrippa on a Mark map.
6. The reader-facing line goes through the copy gate like all copy.

## 5. What it takes

- Codex verifies the city/ruler assignments against the sources and rules on
  the disputed identifications.
- One authored data file (`lib/maps/territories.ts`): city, coordinates, ruler,
  date range, confidence.
- Renderer work in `GeoMapSection`: coloured city markers, a distance-based
  fade, the year badge, the reader line. Sits alongside the existing numbered
  chapter markers without competing with them.
- Owner approves the look on a preview before it ships.

**Next actor: Codex — verify the data and rule on the disputed sites. Jason
approves the design.**

---

## 6. Future lane — every journey in one map (owner idea, 2026-07-23)

*"After we make all of these maps for all the chapters of the Bible, it would
be interesting to have an overlay that shows all of the routes taken in the
Bible."*

This is almost free **if we do not break the data shape between now and then.**
Every chapter map already stores its route as a `corridor` — an ordered list of
waypoints with an honesty label. The whole-Bible overlay is simply every
corridor drawn at once, filterable by era, by person, or by book: Abraham's
wandering, the Exodus, David's flight from Saul, the exile road, Jesus'
ministry, Paul's voyages.

**What would kill it:** routes stored inconsistently chapter to chapter — some
as corridors, some as pins, some as prose. So this is recorded now as a
**constraint on the data**, not a feature to build later:

1. Every chapter route goes in as a `corridor` with waypoints, even when the
   chapter map does not visually need one.
2. Every corridor carries `who` and `era` fields from the start, so the overlay
   can filter without a migration.
3. The existing honesty rules travel with it — a corridor is a broad gesture,
   never a surveyed road, and an uncertain route stays uncertain at every zoom.
   **The combined map must not become a confident atlas by accumulation.**

No build proposed now. Recorded so the option stays open at zero cost.
