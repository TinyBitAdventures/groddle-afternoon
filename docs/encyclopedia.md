# The Groddle Encyclopedia

A player stuck on a quest should be able to search one box and find out how to
get the quest, every step, what each step needs and where to go. The Item
catalog (now `/encyclopedia/items/`, tools/catalog) answered that for items only. The
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
| Items (the Item catalog, tools/catalog) | `/encyclopedia/items/` | `/encyclopedia/items/<class>/` | GSJS item class |
| Quests | `/encyclopedia/quests/` | `/encyclopedia/quests/<quest id>/` | GSJS `quests/<id>.js` |
| Animals and creatures | `/encyclopedia/animals/` | `/encyclopedia/animals/<npc class>/` | GSJS `items/npc_*.js` |
| People | `/encyclopedia/people/` | `/encyclopedia/people/<id>/` | npc class, item class (Street Spirit, Hell's Bartender, Magic Rock, Butler) or `vendor-<store key>` |
| Skills | `/encyclopedia/skills/` | `/encyclopedia/skills/<skill id>/` | `inc_data_skills.js` class (`alchemy_1`) |
| Places | `/encyclopedia/places/` | `/encyclopedia/places/<hub slug>/`, streets as `#<street tsid>` | `inc_data_maps_prod.js` hub, slug of its name |
| Achievements | `/encyclopedia/achievements/` | `/encyclopedia/achievements/<id>/` | GSJS `achievements/<id>.js` |
| Music and sounds | `/encyclopedia/sounds/`, the list `/encyclopedia/sounds/still-missing/` | `/encyclopedia/sounds/<key in lower case>/` | `assets/content/sound-keys.json` keys, street music keys and music set keys of `ambient-music.json` |
| Imagination upgrades | `/encyclopedia/imagination/` | `/encyclopedia/imagination/<card id>/` | `js/imagination-data.js` card id |
| Recipes (by tool) | `/encyclopedia/recipes/` | `/encyclopedia/recipes/<tool class>/`, recipes as `#r<recipe id>` | `recipes.json` `tool` |
| Buffs | `/encyclopedia/buffs/` | `/encyclopedia/buffs/<buff id>/` | `buffs.json` class |
| Feats and street projects | `/encyclopedia/feats/` | `/encyclopedia/feats/<feat id or project class>/` | `js/solo-feats.js` ids, `street-jobs.json` classes |
| Giants | `/encyclopedia/giants/` | `/encyclopedia/giants/<giant id>/` (`ti` is Tii) | GSJS `config_base.js` `giants` |

The sections added on 2026-11-05 (Imagination upgrades to Giants) each live in
their own module, listed in `tools/encyclopedia/sections.mjs`, which says what a
module exports; data.mjs and build.mjs register the list. The old `/giants/`
address answers a 301 to the Giants section (the site repo's `src/MovedPages.php`).

The catalog moved from `/items/` into the encyclopedia on 2026-11-02 (Austin:
"for consistency" with the other sections). The old addresses keep working:
the site repo's `src/MovedPages.php` answers `/items/` and everything under it
with a 301 to the same path under `/encyclopedia/items/`. On groddle.localhost
every folder address reaches PHP (Caddy's php_server serves files, not folder
indexes), so the route answers first. Kinsta's nginx serves a folder's
index.html itself, so there the old folder has to be gone: `tools/deploy/kinsta.sh`
rsyncs the game with `--delete` and drops a webroot link whose game entry left,
as `sync-to-cove.sh` does locally. One top-level folder (`encyclopedia/`)
keeps the number of built folders Minn links into its webroot small.
tools/catalog/build.mjs writes and checks `encyclopedia/items/`; the
encyclopedia's own build leaves that folder alone.

**Header menu.** The menu is content (Minn Admin). `tools/site-nav/apply.mjs`
and `SiteNav::SECTIONS` hold `'/encyclopedia/items/' => ['/encyclopedia/']` and
`'/items/' => ['/encyclopedia/']`, so an Items link marks the whole
encyclopedia, at the new address or at the old one a menu may still hold.

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

## Blank stubs are left out

Austin, 2026-11-03: "leave the blank pages out of the encyclopedia" (the
example was Kitty, `npc_kitty`). An entry gets no page, no search row and no
place in any count when it is not in the remake (Never finished, Not yet or
Lost), has no art of its own, no description beyond its name, no content of
its own (steps, rewards, Giants, conditions, streets, a store, info lines,
buffs), no link from another entry (a quest that only names it as who offers
or takes back the quest does not count), nothing in the remake's recipes,
stores, drop tables or conversions that names it, and no archived street
holding one. What its own class file lists (verbs, items it would create,
skills it checks) does not count: in a class nobody met, that is inherited
code. The rule is `isBlankStub` in `tools/encyclopedia/data.mjs`; the item
catalog reads the same list, and both builders print how many each section
leaves out. A link to a stub becomes its name in plain text.
`tests/encyclopedia-stubs.test.js` checks the rule, that nothing built links
to a stub's old address, and that every count agrees with the pages.

On 2026-11-03 that left out 11: Kitty and Black Juju (animals), Dumb Bot and
A Grendelian Stone (people), quest_map (skills), and Storage Display Box,
Classic Axe, Fireworks, Quoin Marker, Paper Plane and Token of Appreciation
(items). Their old addresses 404 after a deploy (`kinsta.sh` rsyncs with
`--delete`).

## Music and sounds

Austin, 2026-11-03: "a music/sound effects section ... a good way for
contributors to see what we've managed to recover vs what is still missing
from the original game." `tools/encyclopedia/sounds.mjs` adds one entry per
sound key of the catalog (`build-sound-keys.mjs` writes it), per street
music_file key and per key a music set names in `ambient-music.json`, read
through `tools/sound/sound-model.mjs`, the model the sound compare report
(`tools/sound/compare-report.mjs`) reads too: what Glitch played (the
original, if it survives, and where it came from) and what the remake plays
now. Nothing is copied by hand: rerun the builders after the catalog changes
and every count follows.

- **Status** (parts.mjs `snd_*`): Original (Tiny Speck's own recording, with
  its file name and where it came from: the downloads page, the game's own
  servers through web archives, Tiny Speck's sound sets on the Internet
  Archive, a fan's copy of the server's sound folder, their animation files),
  Stand-in (another recording plays: named and linked), Synth stand-in (a
  recipe of `js/synth-sfx.js`, playable on the page), Silent (as in the
  original: switched off before the game closed, or `NO_MUSIC`), Missing.
  A street music key takes what its street plays; a key of a music set the
  set's track in its place.
- **Groups**: Region music (the hub sets, by set, with their regions), Street
  music, Party and event music, Musicblocks, UI and the world, Creatures and
  trees, Tools and verbs, Machines and making, Quests, games and puzzles,
  Voices, New in the remake (moments the original had no sound for: never
  missing).
- **Index**: the headline counts the original's sounds only; status chips and
  group links are anchors without JavaScript (the By status lists, the group
  sections), and `encyclopedia.js` turns them into filters (`?st=`, `?g=`, `?q=`).
- **Entry**: plain name from the key (the item's own name when a tool or a
  Musicblock plays its class name), the key in small type for contributors,
  what plays now with `preload="none"` players on the game's own files under
  `assets/audio` (one at a time), the original's file name and source or the
  lost file's name with the ask, and where it plays: items, creatures, people
  and quests from the catalog's sources, streets and regions linked to Places
  (`#<street tsid>`), and the parts of the game in player words. Places,
  creatures, people, quests and item pages list their sounds back.
- **Still missing**: every sound of the original with no recording found,
  with Tiny Speck's file name where known, what it was for and what plays
  now, and the ask (hello@groddleafternoon.com, the Contribute page).
- **Words**: the catalog's moments only when they are player words
  (`playerMoment`: no file names, street tsids or music_map rows); the
  licence line says the recordings are Tiny Speck's own and the music what
  they published for everyone to download, never public domain.
  `tests/encyclopedia-sounds.test.js` holds the counts, the list and the words.

## Search

`/encyclopedia/search.json` lists every entry in every section (items from
`items/data.json` included): section, id, name, a short line, status, icon.
The home page searches it as you type (folded case and accents, every word
must match) and shows results as tiles grouped by section; filters by section
and "in the remake". Each section index is a server-drawn list (it reads
without JavaScript) with the same search box filtering its own entries.

## Visual design (Austin 2026-11-01: "link up more visually")

Related things are shown as pictures, not just text links. Shared parts
(`tools/encyclopedia/parts.mjs`, styles in `encyclopedia/items/catalog.css`, colours only
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
