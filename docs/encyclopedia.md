# The Groddle Encyclopedia

A player stuck on a quest should be able to search one box and find out how to
get the quest, every step, what each step needs and where to go. The Item
catalog (`/items/`, tools/catalog) answered that for items only. The
encyclopedia adds quests, animals, people, skills, places and achievements, all
generated from game data at build time, cross-linked both ways, and checked by
a `--check` that a test enforces, as the catalog already is.

Words about the original game are Tiny Speck's (GSJS and their CC0 data).
Words about the remake are ours: plain, factual, no em dashes, never the
"Glitch" word in the UI copy we write.

## URL scheme

| Section | Index | Entry | Source of ids |
|---|---|---|---|
| Home (search across everything) | `/encyclopedia/` | | |
| Items (unchanged) | `/items/` | `/items/<class>/` | GSJS item class |
| Quests | `/encyclopedia/quests/` | `/encyclopedia/quests/<quest id>/` | GSJS `quests/<id>.js` |
| Animals and creatures | `/encyclopedia/animals/` | `/encyclopedia/animals/<npc class>/` | GSJS `items/npc_*.js` |
| People | `/encyclopedia/people/` | `/encyclopedia/people/<id>/` | npc class, item class (Street Spirit, Hell's Bartender, Magic Rock, Butler) or `vendor-<store key>` |
| Skills | `/encyclopedia/skills/` | `/encyclopedia/skills/<skill id>/` | `inc_data_skills.js` class (`alchemy_1`) |
| Places | `/encyclopedia/places/` | `/encyclopedia/places/<hub slug>/`, streets as `#<street tsid>` | `inc_data_maps_prod.js` hub, slug of its name |
| Achievements | `/encyclopedia/achievements/` | `/encyclopedia/achievements/<id>/` | GSJS `achievements/<id>.js` |

Every existing `/items/<id>/` URL keeps working: items stay where they are and
gain the cross-links. One new top-level folder (`encyclopedia/`) keeps the
number of built folders Minn links into its webroot small.

**Header menu.** The menu is content (Minn Admin). `tools/site-nav/apply.mjs`
and `SiteNav::SECTIONS` gain `'/items/' => ['/encyclopedia/']` and
`'/encyclopedia/' => ['/items/']`, so whichever link the menu holds is marked on
both. Proposed for Austin: rename the "Items" link to "Encyclopedia" and point
it at `/encyclopedia/` (the home searches items too).

## Data sources

| Section | Original (Tiny Speck) | Remake status | Remake facts |
|---|---|---|---|
| Quests | `assets/content/quests.json` (built from GSJS `quests/*.js`): title, desc, offer, completion, requirements, rewards, prereqs, offer triggers, timers | inventory kind `quest` (job_* street projects are left out) | the same file's `solo`/`soloReason`, `instanceRoom` |
| Animals, people | GSJS `items/npc_*.js` and the item classes named above: `name_single`, `description`, verbs (name, tooltip), the item classes the file creates and the skills it checks | inventory kind `npc` (or `item`) | `street-ecology.json` (which streets have it), `js/vendor.js` stores |
| Skills | `assets/content/skills.json` (from `inc_data_skills.js`) | inventory kind `skill` | recipes (`recipes.json` `skill`), quests offered on learning |
| Places | hub maps `assets/maps/hubs/hub-<id>.json` (2012 map: streets, store, shrine), `assets/streets/index.json` | inventory kind `location` | `street-ecology.json` counts |
| Achievements | `assets/content/achievements.json` | inventory kind `achievement` | badge art `assets/badges/<id>.png` |

The inventory (`research/coverage/inventory.sqlite`) is outside the repo, as for
the catalog: the build and its tests need it, and skip without it.

## What each entry shows

Every entry: picture, name, status badge, Tiny Speck's description, then:

- **Quest**: How to get it (what offers it: a skill, a finished quest, a
  person, a level, an achievement), the steps in order (each step's own words
  from the quest file plus what it needs as tiles: items with counts, the
  recipe and tool for a "make" step, the animal for a counter, currants), a
  countdown if it has one, where to go (quest room, who to return to), rewards
  as chips (iMG, currants, mood, energy, favor with the Giant), what it leads
  to (quests and skills that need it), and the offer and completion text.
- **Animal**: verbs with Tiny Speck's tooltips, what it gives (items its file
  creates), skills that change it, where it lives (hubs with counts, linking
  the place), quests and achievements that involve it.
- **Person**: as an animal, plus what they sell (store tiles with prices) and
  where to find them. Shrines list the skills whose primary Giant they serve.
- **Skill**: learn time at the base speed, what it needs (skills, quests,
  achievements, level), what it unlocks (skills), the quest it opens, recipes
  and creatures that need it, its Giants.
- **Place** (hub): its map picture, its streets, and on each street the vendor,
  shrine, animals, trees and rocks; whether the remake has the street.
- **Achievement**: badge, description, category, rewards, and the items,
  animals or tools it counts.
- **Item** (existing pages, enriched): the quests that need it, give it or
  name it; animals and people that give or sell it; places it grows on.

Cross-links are built from one index (`tools/encyclopedia/data.mjs` `xref`)
so every link has its way back: a quest needing an item puts the quest on the
item page, an animal creating an item puts the animal there, and so on.

## Status

Each entry carries the inventory's status as a badge, in the catalog's words:
In the remake, Rebuilt (from footage), Reimagined, Adapted for solo, Partly
in, In multiplayer, Not yet, Lost, Never finished. One sentence under the badge
says what that means for this kind of entry (ours).

## Search

`/encyclopedia/search.json` lists every entry in every section (items from
`items/data.json` included): section, id, name, a short line, status, icon.
The home page searches it as you type (folded case and accents, every word
must match) and shows results as tiles grouped by section; filters by section
and "in the remake". Each section index is a server-drawn list (it reads
without JavaScript) with the same search box filtering its own entries.

## Visual design (Austin 2026-11-01: "link up more visually")

Related things are shown as pictures, not just text links. Shared parts
(`tools/encyclopedia/parts.mjs`, styles in `items/catalog.css`, colours only
from the site's tokens so light and dark both work):

- **Tile**: a small card with the thing's picture (item icon, creature or
  person portrait, skill's Giant, badge, quest book), its name and one short
  line (a count, a price, a status). Tiles sit in wrapping rows; on a phone
  they become a two or three column grid.
- **Recipe row**: ingredient tiles with counts, a plus between them, an arrow,
  the result tile; the tool as a chip ("with a Knife & Board"); the skill it
  needs as a chip. Used for "how to make it" and quest "make" steps.
- **Vendor card**: the Street Spirit portrait, the store name, the price with
  the currants icon; links to the store's page in People.
- **Stat chips**: base price (currants icon), stack size, energy and mood a
  food gives, iMG, favor with the Giant's icon, learn time.
- **Place chips**: a hub name with a count ("Groddle Meadow · 12"), linking
  the place.
- **Status badge**: the catalog's pill.

Pictures are only CC0 Tiny Speck art already in the repo
(`assets/sprites/icons`, `assets/badges`, `sprites/giant-icons`, the hub map
thumbnails, `ui/quest-book.png`). A creature with no single picture of its own
shows its Cubimal (Tiny Speck's toy likeness), labelled so. Images are lazy,
with fixed sizes, so pages stay fast; everything is drawn at build time.

## Tests

`tests/encyclopedia.test.js`: every non-excluded inventory entry of each built
section has a page and none other, statuses match the inventory, every link on
every page resolves (anchors included), each cross-link has its way back,
the header and theme script are on every page, no em dashes in our words, and
`node tools/encyclopedia/build.mjs --check`.

## Order of work and what is left

1. Quests and Animals (biggest value for stuck players), with the item page
   enrichment and the shared parts.
2. People.
3. Skills and Places.
4. Achievements.

Later: street projects (job_* quests) as their own section, imagination
upgrades, recipes as a section of their own, per-street pages, and creature
sprites cut from the sheets in place of the Cubimal stand-ins.
