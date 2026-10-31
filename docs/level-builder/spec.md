# Level builder: design spec

Status: approved 2026-10-30; every phase, P0 to P6, built (see 14.1 for what was built and where it deviates), zone ambient effects added on 2026-10-31, and the VOLCANO run's follow-ups built in P7 (14.1). Five of the open questions are decided by Austin, and two by the lead until he says otherwise (section 15).

The level builder is a tool in the administrators' console (`/console/`) for editing streets and making new zones. It serves two users equally:

- a person editing by eye in the browser;
- an AI agent working through files, a CLI and an API.

Both use one draft format (`zone.schema.json` in this folder) and one validator. Austin's goal: "eventually give an AI agent everything it needs to generate new background, game assets and maps for complete new ideas/zones."

How code is cited below:

| Where | Written as |
|---|---|
| This repo (the game) | its path, `public/js/street-model.js:297` |
| The site repo | `site:` + path, `site:src/AdminConsole.php:92` |
| Tiny Speck's CC0 sources in the audit workspace beside the repos | `glitch-client/...` and `glitch-GameServerJS/...` |

Contents:

1. [Goals and non-goals](#1-goals-and-non-goals)
2. [What exists today](#2-what-exists-today)
3. [Prior art: LocoDeco](#3-prior-art-locodeco)
4. [The draft format](#4-the-draft-format)
5. [Storage and versions](#5-storage-and-versions)
6. [The editor](#6-the-editor)
7. [The validator](#7-the-validator)
8. [The agent interface](#8-the-agent-interface)
9. [Asset intake and the style guide](#9-asset-intake-and-the-style-guide)
10. [Licences for new art](#10-licences-for-new-art)
11. [Publishing](#11-publishing)
12. [Performance limits](#12-performance-limits)
13. [Security](#13-security)
14. [Phases](#14-phases)
15. [Open questions for Austin](#15-open-questions-for-austin)

---

## 1. Goals and non-goals

**Goals**

| # | Goal | Done when |
|---|---|---|
| G1 | Open any shipped street in the console, drawn by the game's own renderer, with its layers, geometry and signposts shown | All 1,460 streets open, and parallax and colour match `/play/` |
| G2 | Edit decos, geometry, signposts, the sky and layer filters, then save a draft | Every outline item in section 6 works with undo and redo |
| G3 | Play-test a draft in `/play/` with one click, without shipping it | `/play/?draft=<id>` loads the draft and the real save is never touched |
| G4 | Make new zones (streets and a hub joined by signposts) from the CC0 deco library | A two-street zone is built by hand in under 30 minutes |
| G5 | A validator that runs the remake's jump physics | Every signpost and door is reachable, nothing spawns inside a wall, and every finding has an id |
| G6 | An agent interface that can do everything the editor can | The example session (8.7) runs end to end as an automated check |
| G7 | Publishing turns a draft into game data through the normal commit and release flow | A published zone passes `npm test`, and `--check` modes catch drift |

**Non-goals (for now)**

- **No live editing of the shared world.** LocoDeco edited a running server under a lock (section 3). Here a draft is never seen by players until it is published and released.
- **No changes to shipped streets beyond new signpost connects.** The build scripts regenerate those files from Tiny Speck's XML (section 2.2). Forking a shipped street into a new one is allowed.
- **No event scripting.** No `events`, `eventBoxes` or per-street `physics` on builder streets (the schema forbids them). Section 3.4 explains how to add events later.
- **No hand-placed items or NPCs.** Populations go through the ecology planner, as on every shipped street.
- **No art generation inside the site.** The builder takes art in and checks it. An agent makes art elsewhere and sends it through intake.
- **No SVG uploads and no animated uploads** in the first version.

---

## 2. What exists today

### 2.1 Street JSON

There are 1,460 street files in `public/assets/streets/<tsid>.json`, 57 MB in all. The largest is 126 KB and the mean is 38 KB. Next to them:

- `index.json`: 1,460 rows of `label`, `file`, `hubId`, `hubName`, `platforms`, `decos`, plus `store`, `internalLabel` and `reconstructed` on some rows;
- `import-skips.json`, `missing-decos.json` and `SOURCE.txt`.

The base file came from `convertGameObjectToStreet` (`public/js/location-xml.js:133-308`). It was run by an importer that is no longer in the repo (`scripts/import-locations-xml.mjs`, named at `public/js/street-loader.js:3`). Build scripts then patch the files in place.

Coordinate spaces matter for every editor tool:

| Thing | Space | Anchor | Cite |
|---|---|---|---|
| platforms, barriers, ladders, signposts | world, y up is negative (b about 0, t about -1000) | line ends; barrier top y and h down; ladder bottom-centre and h up; signpost bottom-centre | `public/js/street-model.js:1-7, 55-72, 182-205` |
| middleground decos | world | bottom-centre; w and h are the drawn size; r in degrees; flip mirrors about the anchor | `public/js/street-render.js:1517-1554` |
| decos on other layers (and `T_*` layers) | layer-local, 0..w by 0..h | same | `public/js/street-render.js:1511-1519` |
| doors, boxes, eventBoxes, connect `arrive` | screen (x - bounds.l, y - bounds.t) | bottom-centre | `build-street-navigation.mjs:1-20` |

**Fields and who owns them.** Counts are from a scan of all 1,460 files on 2026-10-30.

| Field | Streets | Owner (writer) | Builder |
|---|---|---|---|
| `source`, `tsid`, `label`, `swf_file`, `bounds`, `platforms[]` (id, x1..y2, pc_perm), `layers[]` (id, name, z, decos[] sprite x y w h z r), `signposts[]` (id, x y w h, connects[] tsid label hub_id), `stats` | 1,460 | the original importer (`location-xml.js:133-308`) | edits all |
| `label`, `hubId`, `hubName`, `internalLabel`; index `label/internalLabel/hubId/hubName/store` | 1,391 hub rows | `build-street-names.mjs:106-135, 140, 160` | sets on new streets |
| `layers[].w/h/filters/hidden`, `decos[].flip/hidden/animated`, `platforms[].item_perm`, `gradient`, `musicFile`, `noMap`, `fogMap` | 1,264 have a gradient | `build-street-layers.mjs:173-247` | edits all except musicFile (picked from a list) |
| `doors`, `ladders`, `barriers`, `boxes`, `stats.*Count`, connects' `hidden` and `arrive` | 146 / 581 / 497 / 191 | `build-street-navigation.mjs:106-112`, `public/js/location-navigation.js:279-298` | ladders, barriers, signposts; doors only re-skinned |
| `physics`, `events`, `eventBoxes` | 103 / 135 / 41 | `build-street-events.mjs:166-215` | kept, never on builder streets |
| `reconstructed`, `why`, `template`, `ownLight`, `subway`, `enchantedForest`, `starJinglers`, `glowOrbs`, `soilArt`, legacy `walls` | 1 to 38 each | hand-built rooms and features (`tools/build-subway.mjs`, `tools/build-enchanted-forests.mjs`, quest-room tools) | kept as data |

Every build script skips a street that has no Tiny Speck XML (`build-street-layers.mjs:167`, `build-street-navigation.mjs:102`). That is why builder streets are safe from them. The exception is a signpost connect added to a shipped street: when `build-street-navigation.mjs` runs again, it keeps the connect but drops its `arrive`, because the connect has no source match (`public/js/location-navigation.js:286-296`). Publishing has to apply zone edits after navigation (section 11).

**How a signpost names its destination.** Each `connects[]` row carries:

- `tsid`: all 4,820 are the L form from the XML objref;
- `label`: the text drawn on the arm. It is the name the XML carried, and 59 differ from the index label;
- `hub_id`, plus `hidden` and `arrive`.

`street-loader.js` resolves L and G aliases (`public/js/street-loader.js:74-87`). It also drops hidden connects and posts left with no visible connect (`public/js/street-model.js:231-241`).

**Around the streets:**

- **Hub maps:** `public/assets/maps/hubs/hub-<id>.json` (94 hubs, a 760 x 460 map, `streets[]` as lines, `hubs[]` as exits) and `assets/maps/index.json`. They came from GSJS `inc_data_maps_prod.js`, and no build script for them is in the repo.
- **Hub membership:** `public/js/hub-maps-data.js` comes from `build-hub-maps.mjs`, and the Completist badge reads it. That script rebuilds it from GSJS alone (`build-hub-maps.mjs:20-42`). Zones stay out of it (decided, section 15): they are neither on the world map nor counted for Completist badges.
- **Routing:** `public/assets/content/signpost-graph.json` comes from `tools/build-signpost-graph.mjs`, and its `--check` mode is enforced by `tests/map-routes.test.js`.
- **Populations:** `public/assets/content/street-ecology.json` comes from `build-street-ecology.mjs:345`. It holds one row per street (`counts` over 25 classes, `quoins`, `interior`, `exact`). The planner places them at run time: `planStreetPlacements` and `buildPlatformCandidates` (`public/js/street-ecology.js:349-466`).

### 2.2 Loading, rendering and how `/play/` picks a street

**Loading** (`street-loader.js`):

- `loadStreetData` fetches `index.json`, resolves the tsid, fetches `meta.file`, asserts the geometry, fills the hub and filters signposts (`public/js/street-loader.js:112-127`).
- `applyStreetIndex` merges index rows (`:35-41`). There is no public way to prime the cache with a street that is not a file.

**Rendering:** `buildStreetView(street, PIXI, opts)` (`public/js/street-render.js:1361`) draws the street.

- It takes `opts.decoBase` (`:1362`).
- It sorts layers by z, with the middleground at 0 (`layerDrawsInFront`, `:1114-1126`), and skips hidden layers (`:1129-1131`).
- Parallax: `parallaxLayerOffset` (`:1103-1112`).
- Colour: `glitchLayerMatrix` (`:377`).
- Blurred layers are baked into tiles, with recolour and blur budgets of 192 and 160 MB (`:470-478, 872`).
- Deco files: every deco has a 2x WebP. Some also have an `@1.5x` file (3x) or an SVG "sharp" copy, chosen by `public/js/deco-hires.js` and `deco-sharp-list.js`.

**Choosing the street in `/play/`:**

- `?autostart=1` starts the game (`public/game.js:27400`).
- `?streetdemo=<tsid>&streetx=&streety=` picks the street and spot (`public/game.js:25633-25645`).
- `?practice=1` sends every storage read and write to a per-tab copy (`public/js/practice-mode.js:1-20`).
- `/play/index.html` uses `<base href="../">`, and data URLs get content keys from `js/data-urls.js`.

### 2.3 Physics the validator must match

All values are in px per frame at 60 fps. They come from `public/game.js` `handleInput` and `physics()`.

| Quantity | Value | Cite |
|---|---|---|
| Gravity | 0.42 x street multiplier | `public/game.js:12496` |
| Jump speed | -9.6 x jump multiplier | `public/game.js:12420`, `public/js/hidden-floors.js:734-745` |
| Walk max / floor accel / air accel | 4.4 / 0.58 / 0.58 x 0.22/0.3 | `public/game.js:12417-12418` |
| Terminal fall | 9.6 x 670/570, about 11.3 | `public/game.js:12247` |
| Body height, head reach | 80 px; 111 px over the feet at scale 1 | `public/game.js:11816`, `public/js/street-model.js:362-368` |
| Plain jump apex | 105 px measured, 104.9 simulated | `public/js/summers-day.js:91-96` |
| Running jump, same height | 198 px measured, 198 simulated | `public/js/summers-day.js:91` |
| Air jump | one, only after walking off a ledge; the triple jump needs Imagination upgrades | `public/js/movement.js:125-185, 141` |
| Ground snap | 12 px, more when falling fast (FRAME_DT_CAP 2.5) | `public/js/street-model.js:419-455` |

The 2012 client jumped higher (about 134 px, `public/js/hidden-floors.js:54`). A few shipped spots are therefore out of reach in the remake, and the validator's calibration run (section 7.4) will list them. The validator uses the remake's 105 px jump (decided, section 15): it must match what players can actually do.

**Line rules:**

| Line | Who it holds | Cite |
|---|---|---|
| pc_perm -1 or unset | stands the avatar | `isStandable`, `public/js/street-model.js:297-300` |
| pc_perm 0 | soft: no collider for the avatar | `tests/soft-lines.test.js:1-10` |
| pc_perm 1 or null | stops a rising head | `isSolidFromBelow`, `:345-347` |
| item_perm (falls back to pc_perm) | holds items | `isItemSolid`, `:321-325`; `tests/item-lines.test.js:1-9` |
| both | a spot for a placed thing | `isItemFloor`, `:334-336` |

**Collision helpers:**

- Barriers block from the side their pc_perm names: `blockBarrierCrossing`, `public/js/street-model.js:212-229`.
- Ladders mount only by Up or Down: `ladderTopDeck`, `:463-475`.

There is no reachability code yet. The nearest things to it:

- `reach.js` `floorBetween`: line of sight between the avatar and a thing (`public/js/reach.js:1-80`);
- `jumpApex`: one arc (`public/js/hidden-floors.js:734`);
- the Summer's Day Annex shelves, spaced by hand to the measured jump (`public/js/summers-day.js:88-96`).

### 2.4 The deco library

Counted 2026-10-30:

| What | Count | Where |
|---|---|---|
| Library decos (2x WebP) | 2,990 | `public/assets/decos/groddle/*.webp`, `manifest.json` |
| With a 3x file (`@1.5x.webp`) | 2,333 | `public/js/deco-hires-list.js` |
| With an SVG sharp copy | 992 | `public/js/deco-sharp-list.js` |
| Animated (frame strips) | 60 | `public/assets/decos/animated/*.json` |
| Distinct sprites placed on shipped streets | 2,891 (555,837 placements) | street scan |
| Library decos never placed | 137 | street scan |
| Placed names with no file | 38 | street scan; `street-render.js:1522-1529` draws placeholders for some |
| Sprites on one street only | 855 (median: 3 streets; p90: 49) | street scan |
| SWF bundles (art sets) | 41 (groddle1 487, firebog 373, leavens1 373, zutto1 366, ...) | `tools/deco-pipeline/plan.json` |
| Name families (first word) | 354 (cl2 173, tree 156, cave 145, ground 132, ...) | names |

**Metadata per deco today:**

- `plan.json` gives name, `size2` (the 2x pixel size, which is also the logical size), SWF bundle and symbol, mode, hires flags and placement count;
- `tools/deco-audit/report.json` and `verdicts.json` hold the audit scores;
- the deco lists hold the hires, sharp and animated flags.

Layer use, the streets and hubs that use a deco, and its typical drawn size are not stored anywhere yet. The picker needs them, so phase 0 adds a generated catalog (section 6.4).

### 2.5 The console

The console is in the site repo, which is Minn plus the Groddle extension.

- **The page.** `/console/` is served by `site:src/AdminConsolePage.php`. It is gated in the handler: signed out it redirects to the sign-in, and without `manage_options` it answers 403 (`:54-66`). It loads `console/console.js` and `console.css` from the theme folder with a `?v=` key (`:38-41`).
- **Tabs.** It has two tabs, Players and Reports (`:100-102`).
- **The data.** Every figure comes from `groddle/v1/admin/*` routes with `Policy(Access::Cap, 'manage_options')` (`site:src/AdminConsole.php:20-36, 92`). They are called with the session's REST nonce, fetched from `/wp-admin/admin-ajax.php?action=rest-nonce` (`site:console/console.js:187-205`).
- **Logging.** Each action writes a line in `groddle_admin_actions` (`site:minn.json`); a broadcast writes player 0.
- **Signing.** Signed server-to-server calls already exist: `X-Groddle-Service: <seconds>.<nonce>.<HMAC-SHA256>` over method, route, time, nonce and the body hash, with a 60 s window (`site:src/ServiceCall.php:11-30, 38-45`).
- **Pictures.** Uploaded pictures are precedent for asset intake. They are stored as `mediumblob` rows (`groddle_ticket_pictures`, `site:minn.json:470-478`), decoded and re-encoded by GD (`site:src/ReportPicture.php:33-41, 89`), and served by a page route with the session cookie (`site:src/TicketPictures.php:1-12`).
- **Tables.** Minn applies a changed `minn.json` table declaration on the next request, and changes must stay additive.

---

## 3. Prior art: LocoDeco

LocoDeco was Tiny Speck's level editor. It was a Flex panel that the editor build of the 2012 client loaded into itself; there was no standalone app. Paths in this section are under `glitch-client/`. **LD** is `locodeco/lib/src/locodeco/` and **BR** is `com/tinyspeck/engine/admin/locodeco/LocoDecoSWFBridge.as`.

### 3.1 What it did

- **Panels.** In order: View, Props, Layers, Decos, Geo, Filters, Misc (`locodeco/swf/src/LocoDeco.mxml:35-69`).
- **Editing.** Every edit changed the live location model and renderer.
- **Save.** Shift+S, or the god menu, healed the geometry (lines left to right and clipped to bounds; `com/tinyspeck/engine/physics/util/LocationPhysicsHealer.as:31-77`). It then sent `edit_location` with the whole location (`com/tinyspeck/engine/control/TSFrontController.as:2424-2452`).
- **Server.** `doReplaceGeometry` (`glitch-GameServerJS/main.js:4185-4247`):
  - allowed gods only, and refused upgradeable streets;
  - turned connect `street_tsid` into objrefs;
  - replaced the `dynamic` blob in one call;
  - logged `locodeco-replace`.

  That blob is what `streets/mnt/stos/location_data/G*.xml` holds today.
- **Play-testing.** There was no play mode. Leaving edit mode rebuilt physics from the unsaved geometry, so you tested by walking (`TSFrontController.as:4211-4214`).
- **Signpost connects** were not editable in LocoDeco. A separate web tool handled them (`modify_street_obj-signposts` lines in the L files' edit history).
- **Events.** GSJS had admin calls to edit location events: `admin_events_get`, `add_action`, `delete_action`, `run` and `reorder` (`glitch-GameServerJS/locations/inc_events.js:7-149`; line 83 has a bug, `ev.action` where `ev.actions` was meant). LocoDeco never called them. `inc_geo_edit.js:1-16` only kept a log of the last 20 geometry edits.

### 3.2 Selection, handles and keys

- **Handles by type** (`BR:2048-2069`):
  - platform: two end squares, and Shift levels the dragged end (`components/PlatformControlPoints.as:24-26, 108-121`);
  - wall: top and bottom circles, vertical only (`WallControlPoints.as:17-18, 96-109`);
  - ladder: bottom-middle only (`LadderControlPoints.as:7-12`);
  - everything else: eight resize handles that keep the bottom-centre anchor, honour flip and rotation, and keep proportions with Shift (`ResizeableControlPoints.as:37-44, 154-218`).
- **Picking.** Geometry wins over decos, and platforms win over other geometry. A deco covering 80% of its layer is skipped unless that layer is selected (`BR:2077-2110, 2176-2205`). C held limits picking to the selected layer (`BR:2172`), and A lists everything under the cursor (`BR:406-425`).
- **Multi-select.** Shift-click; Ctrl+A for the layer and Ctrl+Shift+A for all layers (`BR:869-886, 402-405`). There was no marquee.
- **Snapping.** No grid. On mouse-up, platform ends snap within 30 px to other ends and to walls (`BR:685-702`, `LocationPhysicsHealer.as:21-24, 89-140`). C held while dragging an end moves the lines joined to it (`BR:1508-1541`).
- **Keys:**
  - D opens the picker (`BR:362`);
  - Q, W and E plus a drag draw a platform, wall or ladder (`BR:836-853, 2709-2739`);
  - arrows nudge 5 px, Shift 20 px, Z held 1 px (`BR:589-630`);
  - R with Left or Right rotates (`BR:580-587`);
  - Ctrl+Up or Down changes z, with Shift for top or bottom (`BR:542-575`);
  - Esc reverts the selection to how it was when selected (`BR:448-454, 2814-2834`);
  - Ctrl+X, C and V use local storage, so paste works across streets, and Shift pastes in place (`BR:2345-2540`).
- **Undo.** Whole-location snapshots, with no redo (`TSFrontController.as:2397-2422`).
- **Picker.** No text search: category chips (all, anims, doors, signs, ladders, art sets) over the current location's assets only (`DecoSelectorDialog.as:322-394, 336-357`).
- **Overlays.** Geometry, players, items, a "Proxy PC Jump Arc", the interaction region and a ruler (`LD/MiscPanel.mxml:201-242`). Layer presets (Standard, Vertical Parallax, Forest) set layer sizes as a percent of the middleground (`LD/MiscPanel.mxml:20-55, 158-187`).

### 3.3 Mapping: theirs to ours

| LocoDeco | Ours | Kept or changed |
|---|---|---|
| ViewportPanel (zoom 0.2-1, view presets 650x450, 900x600) | Zoom 5-400% and view frames for Wide and Original (1000 x 600, `js/world-zoom.js`) | kept, wider range |
| PropertiesPanel | Inspector: x, y, w, h with lock aspect and reset to file size; r; flip; perms (Floor -1, Roof 1, Soft 0, Hard null, `LD/PropertiesPanel.mxml:47-58`); sign text; animated | kept |
| LayerPanel (drag order, add, remove, rename, w/h, visible) | Layers panel: z order, eye, lock, solo, size as a percent of the street, filters, parallax preview | kept, plus lock and solo |
| DecoPanel (per-layer list, drag = z) | Outliner tree: layer, then decos, then geometry | kept |
| GeoPanel | Geometry tab of the outliner | kept |
| FilterPanel (blur, saturation, brightness, contrast, tint, gradient) | Layer filters and the sky gradient, previewed through `glitchLayerMatrix` | kept |
| MiscPanel overlays (jump arc, ruler) | Overlays: geometry, reach map, jump arc, ruler, view frame, arrivals | kept, and the reach map is new |
| MiscPanel layer presets | Street templates (section 6.3), sized from the measured style profile | kept |
| DecoSelectorDialog | Deco picker with text search, facets and hub usage (6.4) | changed: search the whole library |
| Control points by type | The same handle set per type | kept |
| Q / W / E draw tools, D picker | The same keys | kept |
| Snap healer (30 px) | Endpoint snap 30 px, plus optional grid, guides and a deco-to-floor snap | kept, plus a grid |
| No marquee | Marquee on empty space | new |
| Snapshot undo, no redo | Op-based undo and redo (6.6) | changed |
| Esc reverts the selection | Same | kept |
| Shift+S save to the live server | Autosave of ops to a draft; nothing is live until publish | changed |
| Leave edit mode to test | Play-test in `/play/?draft=` (6.8) | changed |
| Connects in a separate web tool | Connects edited in the inspector with the target picked from the index | changed |
| `admin_events_*` | Not in v1 (3.4) | later |

### 3.4 Lessons to borrow

1. **Replace the whole document.** Save the whole document and keep a log line, as `apiReplaceDynamic` did. Ops (6.6) are the wire format, but the stored truth is a full zone at each revision.
2. **Heal geometry on save.** Run lines left to right, clip them to bounds and snap ends together. Do it in code, not by asking the user.
3. **Use the same handles and keys.** Tiny Speck's editors used them for years, and the street data was made with them.
4. **Show the jump arc.** LocoDeco had an overlay for it. We go further and compute reach.
5. **Add events later the way GSJS did.** A per-event ordered action list, with add, delete, reorder and run (`inc_events.js:67-149`). The street JSON already holds that shape (`events: {name: action[]}`).

---

## 4. The draft format

A **zone** is one JSON document. `zone.schema.json` (JSON Schema 2020-12) defines it, and the validator (section 7) adds the rules a schema cannot express.

```
zone
├─ format "groddle-zone/1", id, title, rev, baseCommit, notes
├─ hub         { id, name, isNew, map { colours, streets[] lines, hubs[] exits } }
├─ streets[]   { key, street <street JSON>, population, editor }
├─ edits[]     new connects on shipped streets, so the zone can be reached
├─ assets{}    sprite name → provenance row (every sprite used has one)
├─ waivers[]   findings a person accepted after a play-test
└─ style       { profile }
```

**The street part.** `$defs/street` describes the street JSON the game loads. It is a superset that every shipped street fits: **1,460 of 1,460 pass**, checked with Ajv 8 (2020 dialect, strict). Two shipped quirks are allowed on purpose:

- one layer has `z: -2.5`;
- 13 signs carry `signText` longer than 64 characters (up to 188).

**Builder streets.** `$defs/draftStreet` tightens the street part:

| Rule | Value |
|---|---|
| `tsid` | `GZ` + 13 capitals or digits. No shipped tsid starts with GZ: the prefixes in use are GA, GC, GD, GH, GI, GL, GM, GN, GT and GU |
| `source` | starts with `groddle-builder ` |
| required | `hubId`, `hubName`, `gradient`, `stats` |
| forbidden | `events`, `eventBoxes`, `physics` and the feature-owned fields |
| limits | bounds within 8000 x 6000; at most 600 platforms and 24 layers |
| may carry | `emitters[]` and `rumble`: zone ambient effects (below); no shipped street has them |

**Zone ambient effects** (decided by the lead, 15 Q12). A builder street may carry steam vents, lava squirts and embers, placed like decos, and a street-wide earthquake rumble. They are zone content, not location events: they need no event scripting and no GSJS (Q9 stays open).

- `emitters[]` (`$defs/emitter`, ids `fx_<n>`): `kind` (`steam`, `lava`, `embers`), `layer` (default the middleground), `x, y` (the vent's mouth, in its layer's space as a deco's anchor is), `rate` (particles a second while it puffs), `size`, `height` (how high the plume rises or the squirt flies), `spread` (degrees either side of straight up), `period` ([min, max] seconds from one burst's start to the next; left out, it never stops) and `burst` (seconds), `sprite` (the particle's art: a library deco or the zone's gz_ art; left out, a soft built-in shape) and `hidden`.
- `rumble` (`$defs/rumble`): `every` ([min, max] seconds between rumbles), `duration` (seconds), `strength` (the camera shake in px) and `sound` (default true: Tiny Speck's `ROCKS_DISAPPEAR`, a low rocky rumble).
- `public/js/street-effects.js` holds both halves: the pure one (defaults, ranges, the cost the validator caps, the rumble's seeded clock) and a pooled Pixi view the game, the editor and the render page share.

**Provenance on every asset.** `assets{}` has one row per sprite the zone uses:

| origin | licence | Filled by | Checked by |
|---|---|---|---|
| `tinyspeck-cc0` | `CC0-1.0` | the store, from `plan.json` (`source`: bundle and symbol) | AST-003: the sprite must be in the library |
| `new` | `own-work-CC0` or `ai-generated` (both are CC0 1.0 dedications; the value says who made it) | asset intake (9.1): sha256, size, registration, author, tool, prompt, `inputs`, intake report id | AST-002 and AST-004 |

**Ids.**

- Every deco on a builder street gets an `id` (`d_<n>`), so ops can name it. Shipped decos mostly have none (1,637 of 555,837 do).
- Platform, wall, ladder and signpost ids follow Tiny Speck's patterns (`plat_<n>`, `wall_<n>`, `ladder_<n>`, `signpost_<n>`).
- New hubs take ids 900-999. Tiny Speck's run 1-143.

**Connections.**

- Signposts are the only way between streets in a new zone (doors stay re-skin only).
- A connect names its target by tsid. `arrive` is computed the way `build-street-navigation.mjs` does it: the target's screen space, on the nearest platform within 80 px.
- The hub map's lines are drawn by hand in the hub map editor (6.3). NAV-006 checks them against the streets.

A full two-street example is in 8.7. It also passes the schema.

---

## 5. Storage and versions

**Recommendation: Minn tables on the site, with a file form for agents and the CLI.**

| Option | For | Against |
|---|---|---|
| **Minn tables** (chosen) | The same on groddle.localhost and Kinsta (open_basedir, no writes to the game folder); revisions and If-Match concurrency; the same admin gate and log as the console; console and API share one store | Not in git until publish; needs export for agents (the CLI does `pull` and `push`) |
| Files in the game repo (`drafts/*.zone.json`) | Git history, easy for agents | The site cannot write the game repo on Kinsta; uncommitted churn in the public repo; no locking |
| Files under the site's uploads | none worth it | Served by the web server; no history |

**Tables** (additive, in `site:minn.json`):

```
groddle_builder_drafts     id varchar(48) PK, title, rev int, zone longtext, sha256 char(64),
                           state varchar(12) (draft|archived|published), base_commit,
                           created_by, updated_by (user id or "key:<id>"), created_at, updated_at,
                           published_commit
groddle_builder_revisions  draft_id, rev, zone longblob (gzip), sha256, author, at, note,
                           ops_summary text, PRIMARY KEY (draft_id, rev)
groddle_builder_assets     sha256 PK, name, draft_id, origin, licence, meta text (JSON),
                           file2 mediumblob, file3 mediumblob NULL, width, height, bytes,
                           report text (intake JSON), created_by, created_at
groddle_builder_keys       key_id char(16) PK, label, scopes, created_by, created_at,
                           expires_at, last_used_at, revoked_at
groddle_builder_nonces     key_id, nonce char(16), at, PRIMARY KEY (key_id, nonce)
```

**Versions:**

- Every write makes a new `rev`.
- A write must send `If-Match: <rev>`; a stale write gets **409 `builder_rev_conflict`** with the current rev.
- Revisions are kept in full (gzip), thinned after 200 per draft to one per hour.
- Restore copies an old revision forward as a new rev, so nothing is lost.
- Each write also logs one line in `groddle_admin_actions`, kind `builder`, player 0, the detail being `<draft> rev <n> <ops summary>` (the broadcast precedent).

**Where the builder runs.** groddle.localhost only, until Austin decides otherwise (Q2). Publishing needs a game repo checkout anyway.

---

## 6. The editor

### 6.1 How the console loads the renderer

**Recommendation:**

- The editor's code lives in the **game repo** at `public/js/builder/`. It imports the real renderer by relative path with its `?v=` keys (`../street-render.js?v=…`), so the editor and the game never drift. `tests/release-cache-keys.test.js` already keeps those keys honest.
- The site repo adds only a gated shell page, **`/console/builder/`**, served by a new `AdminBuilderPage` with the same gate as `AdminConsolePage` (`site:src/AdminConsolePage.php:54-66`). It emits, in order:
  1. `<base href="/">` (so relative deco paths resolve, as `<base href="../">` does for `/play/`);
  2. `/vendor/pixi/pixi-8.22.0.min.js`;
  3. `/js/data-versions.js`, then `/js/data-urls.js`;
  4. `<script type="module" src="/js/builder/editor.js?v=<key>">`, with the key read from `js/data-versions.js`.
- The console gains a third tab, **Builder**, that lists drafts and links to the page.
- The built game is public, so the editor's code is public too. That is fine: the repo is public, and every byte of draft data comes through admin routes.

Rejected alternatives:

- an iframe of `/play/`: it boots the whole game, and its storage and HUD fight the editor;
- copying the renderer into the site repo: it would drift.

### 6.2 Layout

```
┌ Console ─ Players | Reports | Builder ───────────────────────────────────────────┐
│ Draft: Mossy Hollow ▾  Street: Mossy Lane ▾  rev 12 · saved   [Validate 0✖ 2⚠] [Play] │
├──────────────┬───────────────────────────────────────────────┬──────────────────┤
│ Layers       │                                               │ Inspector        │
│  ◉ 🔒 sky -3  │              canvas (Pixi, real renderer)      │  deco bush_3     │
│  ◉    bg_1 -1│     handles · overlays · view frame            │  x 300  y -60    │
│  ◉    middle 0│                                               │  w 160  h 90 🔗  │
│  ◉    mplus 1 │                                               │  r 0  ⇋ flip     │
│ Outliner     │                                               │  layer [middle▾] │
│  ▸ decos 312 │                                               │ Filters / Sky    │
│  ▸ geometry  ├───────────────────────────────────────────────┤ Connects         │
│ Picker 🔍    │ minimap strip of the whole street             │ Findings (2)     │
└──────────────┴───────────────────────────────────────────────┴──────────────────┘
```

The panels can be collapsed, and each panel's state is kept in localStorage. The words follow house style: plain, no em dashes in anything a player could see, and never the word "Glitch".

### 6.3 Streets, hubs and templates

**Opening a street:**

- **Open street** searches the 1,460 shipped streets (the same list as `GET admin/streets`, `site:src/AdminConsole.php:209-219`) and the draft's own streets.
- A shipped street opens read-only, with **Fork into draft**. A fork copies it under a new GZ tsid and label, with provenance rows filled.

**New street:**

- Pick a template: Meadow (Standard), Tall (Vertical Parallax), Forest, Cave or Blank. Each is a layer stack with names, z, sizes as a percent of the street and default filters, taken from the measured style profile (9.2).
- Pick a width (1,000-8,000; default 3,000) and height (default 1,000).
- The template adds a floor line and a gradient.

**New zone:** a title and id, then a new hub (name, id from 900, colours) or an existing hub.

**Hub map editor:** draws the 760 x 460 map with each street as a line you drag, and exits to other hubs.

### 6.4 Deco picker

The picker searches the whole library: 2,990 decos, plus the zone's own new art. It works from **`assets/content/deco-catalog.json`**, generated by `tools/builder/deco-catalog.mjs` (with `--check` enforced by a test). One row per deco:

```
name, family (first word), bundle (SWF art set), size2 [w,h], hires, sharp, animated,
placements, streets, hubs (top 5 by placements), layers {role: count},
drawn {w_med, h_med} (median placed size), neverPlaced
```

**Searching and ranking:**

- **Search:** tokens of the name (split on `_`, digits and case), the family and the bundle.
- **Facets:** layer role (sky, bg, middleground, middleplus, foreground), art set, "used in this hub", animated, size class and never placed.
- **Ranking:** text match first, then placements in the current hub, then placements overall. With 2,891 placed sprites and 855 used on one street only, usage counts are a strong signal.
- **Thumbnails:** the 2x WebP on a checkerboard or a grey slider, as DecoSelectorDialog had (`DecoSelectorDialog.as:143-154`).
- **Placing:** drag onto the canvas, or press Enter to place at the view centre. The new deco takes its median drawn size for the active layer role.

### 6.5 Selection, handles, snapping and keys

**Selection:**

- Click picks the topmost thing on the active layer. Geometry wins over decos (LocoDeco's order).
- Alt+click cycles through everything under the pointer.
- Shift+click adds or removes.
- Dragging on empty space draws a marquee.
- Ctrl/Cmd+A selects the active layer; with Shift it selects all layers.
- Esc reverts the selection to how it was when selected, and a second Esc deselects.

**Handles** are LocoDeco's set (3.2):

- deco, door, signpost, box: eight handles plus a rotation knob;
- platform: two ends, with Shift to level;
- wall: top and bottom;
- ladder: bottom, plus a height grip.

Drag across the view edge to pan.

**Snapping** (toggled with `;`):

- platform ends to other ends and to wall ends within 30 px, on release;
- an optional 10 px grid (`G`);
- guides dragged from the rulers;
- middleground decos snap their bottom to the floor line under them (new; most middleground decos sit on a line).
- Ctrl/Cmd held while dragging a joined end drags its neighbours (LocoDeco used C).

**Keys:**

| Key | Does |
|---|---|
| V / Q / W / E / S | Select / draw platform / wall / ladder / signpost |
| D | Open the deco picker |
| Arrows | Nudge 5 px; Shift 20 px; Alt 1 px |
| R + Left/Right | Rotate 1°; with Shift 15° |
| H | Flip |
| Ctrl/Cmd+] and [ (also Ctrl+Up/Down) | z up and down; with Shift, top and bottom |
| Alt+Up/Down | Move to the layer above or below, keeping the on-screen position |
| Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z | Undo, redo |
| Ctrl/Cmd+C / X / V, Shift+Ctrl/Cmd+V | Copy, cut, paste at view centre, paste in place; works across streets and drafts |
| Delete | Delete |
| Space+drag, wheel, Ctrl/Cmd+wheel | Pan, pan, zoom |
| 0 / 1 | Fit the street / 100% |
| L | Lock the active layer |
| P | Play-test from the view centre |
| Ctrl/Cmd+S | Save now |
| ? | Key sheet |

**Re-layering** moves a deco between layers. Its layer-local and world coordinates are converted with the current camera's parallax offsets (`parallaxLayerOffset`), so it stays where it appears. The inspector shows both coordinate spaces.

**Zoom** runs from 5% to 400%. The canvas draws through the real renderer with culling. At 100% it shows exactly what `/play/` shows at the same camera.

**Layer visibility.** The eye in the Layers panel hides a layer in the editor only. Layer `hidden` (never drawn in game, `street-render.js:1129`) is a separate checkbox in the inspector. **Parallax preview** switches between:

- "as played": layers offset for the current camera;
- "layout": every layer drawn at the offset for the camera's x, which makes hand alignment easier.

### 6.6 Undo, redo and autosave: one op vocabulary

Every edit is an **op**, and the same ops are the API's write format (8.3). Each op has an inverse:

```json
{ "op": "deco.set", "street": "lane", "id": "d_12", "set": { "x": 310, "flip": true } }
```

- Undo applies the inverse. A drag is one op group.
- The history lasts for the session and has no limit.
- Pending ops are sent every 2 s as a batch (`POST …/ops`, If-Match rev).
- On 409 the editor fetches the new rev and re-applies its pending ops. If they no longer apply (an element is gone), it shows the conflict and keeps the local ops as a "stash" you can re-apply.

Because the agent and the person write the same ops, an agent's edits appear in an open editor at the next poll (5 s, while the tab is visible, like the console's own polling, `site:console/console.js:31`).

### 6.7 Overlays

- **Geometry:** lines coloured by permeability (Floor, Roof, Soft dashed, Hard); barriers with their blocking side; ladders; boxes.
- **Reach map:** the validator's reachable surfaces in green and unreachable ones in red; arrival points; failing targets.
- **Jump arc:** from the pointer, a plain and a running arc drawn with the validator's stepper.
- **View frame:** 960 x 408 (Wide), and 1000 x 600 (Original).
- **Ruler**, **populations** (the planner's spots for the current seed) and **missing art** (placeholders).

### 6.8 Play-test

- **Play** saves, then opens `/play/?practice=1&autostart=1&draft=<id>&street=<key>&streetx=<x>&streety=<y>` in a new tab, at the view centre on the nearest floor.
- `practice-mode.js` treats `draft` as implying `practice=1`. The real save never records a GZ street.
- **A new module, `public/js/builder/draft-play.js`,** runs in `beginGame` before the start street is chosen:
  1. It fetches the REST nonce, then `GET groddle/v1/admin/builder/drafts/<id>/play`. That returns the zone's streets, index rows, ecology rows and hub, at the current rev.
  2. It calls a new seam, **`registerDraftStreets(rows, streetsByTsid)`**, in `street-loader.js`. The seam merges the rows (`applyStreetIndex`) and primes the cache, so `loadStreetData` never fetches a file.
  3. It merges ecology rows through `setStreetEcologyCatalog` (`street-ecology.js:173`).
  4. It sets the start tsid as `streetdemo` does.
- A small banner reads "Draft: Mossy Lane (rev 12)" with **Back to the builder**.
- Signposts between the draft's streets work. Signposts to shipped streets work too, and leave the draft.
- **Refusals:**
  - `/play/online/` refuses `draft` (multiplayer never sees drafts);
  - a non-administrator gets the route's 401/403, and the game says "That draft is not available." and starts on the default street.
- **No quest offers** (P7). Quests are never part of a zone, so a draft play-test holds every quest offer (the quest-offers feature is quiet and its `holdQuestOffers` holds the other features' offers through `engine.questOffersHeld`) unless the address says `questoffer=now`; `questoffer=off` silences them on any page.

**Scripted play-testing (P7), for agents.** `node tools/builder/playtest.mjs --draft <id> [--street k] [--json] [--game <checkout>/public] [--shots <dir>]` signs in with a one-time link minted on the machine (the play route takes an administrator's session, never a builder key), opens each street's play-test in Chrome under the browser lock, sets the avatar down at an arrival, and walks to every signpost and door the way the validator says a keyboard player can (`reach-graph.js reachRoutes`: walk, jump, running jump, walk-off, air jump, ladder), with real key presses, then reports which it reached (exit 1 on a miss). `--game` answers the game's files from a checkout, for game changes not yet synced. The pieces are exported for other scripts: `installKeyboard` (a frame-by-frame keyboard player in the page: `place`, `walkTo`, `jump`, `climb`), `playStep`, `openPlaytest`, `playStreet`. The QA hooks it uses, all read-only but one:

| Hook | Gives |
|---|---|
| `groddleQA.snapshot()` | street, player `{x, y, vx, vy, onGround, climbing}`, busy, signposts, interactables |
| `groddleQA.idleState()` | the avatar's x, y, vx, vy, onGround and climbing, cheap enough for every frame |
| `groddleQA.placeAvatar(x, y)` | sets the avatar down at a screen-space spot (world x - bounds.l, world y - bounds.t) |
| `groddleQA.streetDeco(id)` | a placed deco as drawn |

Keys go in as `KeyboardEvent`s on `window` by `e.key` (`ArrowLeft`, `ArrowRight`, `" "` to jump, `ArrowUp` to jump or climb); a press made on one animation frame acts on the next. The guide (8.6) carries the same, under `playtest`.

---

## 7. The validator

### 7.1 One module, three callers

**`public/js/builder/validate.js`** is pure: no DOM and no Pixi. It imports `street-model.js`, `street-ecology.js` and `reach.js`.

| Caller | Runs it in |
|---|---|
| Editor | a Web Worker, 400 ms after the last edit |
| CLI | Node |
| API | the builder worker (8.4), a Node process the PHP route calls |

The PHP side only runs a cheap structural check on write: JSON shape, sizes and limits. That way nothing malformed is stored, and the physics live in one place.

### 7.2 Finding format

```json
{
  "rule": "PHY-003", "severity": "error", "street": "lane", "at": "lane/signpost_1",
  "message": "Signpost signpost_1 (to Hollow End) cannot be reached from the arrival at 150, 940.",
  "where": { "x": 2850, "y": 808, "space": "screen" },
  "data": { "from": "arrive:end>lane", "closest": { "x": 2700, "y": 940, "rise": 132, "jump": 105 } },
  "fix": "Lower the ledge under the post to 100 px or less above the floor, or add a ladder.",
  "fingerprint": "9f0c2a77d41e6b03"
}
```

**Severities:**

| Severity | Blocks |
|---|---|
| `fatal` | play-test, render and publish (the street would not load) |
| `error` | publish |
| `warn` | publish only until acknowledged |
| `info` | nothing |

A **waiver** (schema `waivers[]`) accepts one finding at one place after a play-test, with a reason. It stops matching when the geometry fingerprint changes. Fatal findings and AST-004 cannot be waived.

### 7.3 Rules

| Id | Sev | Message (short) | How it is computed |
|---|---|---|---|
| SCH-001 | fatal | Zone does not fit the schema | Ajv-equivalent check against `zone.schema.json` (path and keyword in `data`) |
| STR-001 | fatal | Duplicate id | Ids unique per kind within a street; layer ids unique |
| STR-002 | fatal | No middleground layer | Exactly one layer with id `middleground` |
| STR-003 | fatal | No floor | `assertStreetGeometry` (`street-model.js:579-597`) plus at least one `isStandable` line |
| STR-004 | error | Street smaller than the view | Builder streets: bounds at least 1000 x 600, the 2012 view (`public/js/world-zoom.js:6-7`). 13 shipped streets are smaller (down to 1460 x 560), so calibration skips this rule |
| STR-005 | warn | Parallax layer smaller than the view | A non-middleground layer with w under 960 or h under 600 shows its edges |
| STR-006 | info | Healed geometry | Lines run left to right and are clipped to bounds, as LocoDeco did on save (`LocationPhysicsHealer.as:31-77`); applied automatically |
| STR-007 | warn | Line steeper than 60° | `\|dy\| > 1.73 \|dx\|`: walks badly; use a barrier |
| PHY-001 | error | Arrival not on a floor | Every arrival (incoming connect `arrive`, `editor.spawn`) has an `isStandable` line within 12 px below (`resolveGround` snap) |
| PHY-002 | error | Arrival inside a wall or under a low ceiling | Arrival x not within 2 px of a barrier overlapping 0-80 px over the feet; no `isSolidFromBelow` line within 111 px over the feet (`avatarHeadReach`) |
| PHY-003 | error | Signpost unreachable | From every arrival, the avatar can stand within 120 px in x of the post and within its height band (stricter than `signpostNear`, which checks x only, `street-model.js:477-490`) |
| PHY-004 | error | Door unreachable | As PHY-003 for the door's rect |
| PHY-005 | error | Trap: no way out | Every reachable surface can reach at least one exit (signpost or door) |
| PHY-006 | warn | Tight jump | Every route to an exit needs a jump with under 8 px of height to spare, or (P7) a landing a keyboard player often misses: under 60% of the tries land (takeoffs up to 12 px early or late; an air jump 1 to 3 frames early or late) |
| PHY-007 | info | Unreachable area | Standable surfaces no arrival reaches (fine for scenery; listed) |
| PHY-008 | warn | Ladder with no deck | No `isStandable` line at the bottom, or `ladderTopDeck` finds none at the top (`street-model.js:463-475`) |
| PHY-009 | warn | Signpost off its floor | Zone streets (P7): a post's foot more than 4 px over or under the nearest standable line within 80 px (a fork's Tiny Speck posts may stand up to 48 px over and 8 under), or no floor under it at all (`js/builder/posts.js`). When an arm lands at such a post, PHY-001 names the post instead |
| POP-001 | warn | Population does not fit | `planStreetPlacements` places fewer than requested (`street-ecology.js:419-466`) |
| POP-002 | error | Nowhere to place things | Population not empty but no `isItemFloor` line (`street-model.js:334`) |
| NAV-001 | fatal | Unknown destination | Connect tsid not in the index or the zone (after L/G aliasing) |
| NAV-002 | error | Arrival off the target's floor | `arrive` fails PHY-001 on the target street |
| NAV-003 | warn | One-way road | A to B without B to A |
| NAV-004 | error | Zone unreachable from the world | No `edits[]` connect or door leads into the zone from a shipped street (publish only) |
| NAV-005 | info | Arm label differs from street name | Connect label differs from the target's label |
| NAV-006 | error | Hub map and streets disagree | A new hub's map lists exactly the zone's streets |
| AST-001 | fatal | Missing art | A sprite is neither in the library manifest nor in zone assets |
| AST-002 | error | No provenance | A used sprite has no `assets` row |
| AST-003 | error | Wrong provenance | A `tinyspeck-cc0` row for a sprite not in the library, or a `new` row whose sha256 does not match the stored file |
| AST-004 | error | Licence or provenance not allowed | The asset is not a CC0 1.0 dedication (`CC0-1.0`, `own-work-CC0`, `ai-generated`), or its provenance is incomplete: no author, no tool for ai-generated art, or `inputs` naming anything that is not CC0 or Austin's own (section 10); not waivable. AI-generated art is allowed |
| AST-005 | warn | Drawn too large | Drawn size over the deco's logical size (`size2`) and no sharp copy: it will look soft |
| AST-006 | warn | Not animated | `animated` set on a deco with no strip in `deco-anim-list.js` |
| STY-001 | warn | Layer order | sky below the bg layers, and those below the middleground; foreground above |
| STY-002 | info | Filter outside the usual range | Layer filter outside its role's p10-p90 band (9.2) |
| STY-003 | info | Density outside the usual range | Decos per 1,000 px outside the role's p10-p90 band |
| STY-004 | warn | No sky gradient | No `gradient`: the painted fallback sky shows |
| STY-005 | info | Unusual layer for this deco | Deco placed on a layer role where the catalog shows it is never placed |
| TXT-001 | error | Words not allowed | Street, hub, signpost arm or sign text contains "glitch" (any case) or an em dash |
| TXT-002 | error | Name taken | A street label equal to a shipped street's label (case-insensitive), which would make `/tp` and the map ambiguous |
| PRF-001 | warn / error | Too heavy | Over the limits in section 12 (warn at 80%, error over); for effects, a street's emitters, the most particles alive at once, and their overdraw |
| FX-001 | error | Effect on a missing layer | An emitter's `layer` is not one of the street's layers |
| FX-002 | warn | Effect off its layer | An emitter's mouth is outside its layer (the street for the middleground), so nobody sees it |
| FX-003 | warn | Rumble too often or too strong | The rumble shakes more than a third of the time (duration over the shortest gap), or over 16 px |
| FX-004 | info | Burst trimmed to its period | A `burst` longer than the shortest `period` (the game trims it) |

### 7.4 Reachability: how it works and its limits

**Model.** Screen space, from `platformsScreen` and `barriersScreen`, plus ladders as climb zones.

1. **Stand points.** Sample every `isStandable` line every 8 px. Points on one line, and on lines joined within 4 px, are connected by walking, unless `blockBarrierCrossing` stops the body (80 px).
2. **Jump and fall edges.** From stand points sampled every 16 px, step the avatar frame by frame with the constants in 2.3:
   - a standing jump and a running jump (vx 4.4), each with input held toward each side;
   - a straight-up jump;
   - a walk off each line end, with the one allowed air jump tried at every 4th frame.

   Each frame applies, in the game's order (`public/game.js:12496-12530`):
   - gravity;
   - the terminal speed cap;
   - `headCeiling` against `isSolidFromBelow` lines;
   - `blockBarrierCrossing`;
   - landing through `resolveGround`.

   A landing adds an edge to the nearest stand point. Arcs stop after 240 frames or outside the bounds.
3. **Ladder edges.** Bottom floor to top deck, both ways (`ladderTopDeck`).
4. **Search.** Breadth-first from each arrival.
   - Targets are signposts (PHY-003) and doors (PHY-004).
   - PHY-005 runs the same search on the reversed graph from the exits.
   - Each edge keeps its margin: how much higher the jump could have been, and (P7) for a jump onto another floor the share of a keyboard player's tries that land (14.1 P7). Those feed PHY-006.

**One stepper, shared with the game.** In phase 2 the stepper is a copy of the physics constants with a parity test:

- it must reproduce the 105 px apex and the 198 px running jump;
- its arcs must match `?physicsdemo=1&physicsautoplay=jump` on the normal street to within 2 px.

Phase 2 also extracts the airborne step from `game.js physics()` into `public/js/avatar-step.js`, which both the game and the validator use. That is a careful refactor of the game, covered by the movement tests and the physics QA route.

**Limits** (stated in every report header):

- **Plain jump only.** No triple jump (it needs Imagination upgrades), no coyote time (90 ms) and no jump buffer. So "reachable" means reachable by a new player.
- **Sampled, not exhaustive.** Mid-air steering is "hold toward" only. A path that needs a reversal in the air can be missed, which gives a false "unreachable". That is why waivers exist.
- **Fixed 60 fps steps.** At low fps the game steps by up to 2.5 frames (FRAME_DT_CAP), which bends arcs slightly. PHY-006's 8 px margin covers it.
- **A keyboard player** (P7): a jump onto another floor counts as tight when fewer than 60% of eight takeoffs up to 12 px early or late land (an air jump: six presses 1 to 3 frames early or late); a takeoff past the end of its floor is taken at that end (the game's 90 ms coyote time forgives a late press there). A plain walk-off and a ladder hop are judged by height only (a player steers them all the way down). A running jump starts at the speed the floor behind it gives room for.
- **Normal physics only.** Builder streets cannot set per-street physics. The calibration run over shipped streets applies each street's multipliers, and marks jetpack streets as approximate.
- **Not modelled:** items, NPCs and other players are not colliders; event-toggled lines are ignored (builder streets have none); slope walking (`js/slope-walk.js`) is approximated by joined lines.

**Calibration** (phase 2 acceptance): run the validator over all 1,460 shipped streets, using arrivals from the shipped connects.

- It must finish in under 10 minutes on Austin's Mac.
- Every PHY-003/004/005 finding goes into `tools/builder/calibration.json`.
- 20 findings picked at random are play-tested. Under 10% may be false. The real ones are game bugs or the 105 vs 134 px gap, and they go to the register. Under the decided 105 px standard, a spot only the 2012 jump reached is a game bug in the remake, not a validator error.

---

## 8. The agent interface

### 8.1 The split: CLI and API

**Recommendation: the CLI is the agent's main tool, and the REST API is the shared store and the remote path.** Both speak the same ops and get the same findings.

| | CLI (`node tools/builder/cli.mjs`) | REST (`groddle/v1/admin/builder/*`) |
|---|---|---|
| Where | In a game repo checkout | Any HTTPS client |
| Works offline on a file | Yes (`file:zone.json` for ops, validate, render) | No |
| Validate / render | Locally, with the real modules (render through Playwright under the browser lock) | Through the builder worker; 503 when it is not running |
| Writes drafts | `push`, `ops` (calls the API) | `PUT`, `POST …/ops` |
| Publish | `publish --write`, locally, into the working tree | Never. `publish-request` only marks a draft ready |
| Auth | Builder key from `~/.config/groddle/builder.env` | Cookie + nonce (console), or a signed builder key |

### 8.2 CLI commands

Every command takes `--json`, which prints findings and results as JSON for agents, and `--draft <id>` or `file:<path>`.

| Command | Does |
|---|---|
| `drafts` | List drafts (id, title, rev, state, findings) |
| `new <id> --title T (--hub 58 \| --new-hub "Name")` | Create a zone |
| `pull <id> [--out f]`, `push <f> [-m note]` | Copy a draft to a file and back (If-Match) |
| `street add --key k --label L [--template meadow] [--width 3000 --height 1000]` | New street from a template |
| `street fork <shipped tsid> --key k --label L` | Copy a shipped street into the zone |
| `place --street k --layer middleground --sprite bush_3 --x 300 --y -60 [--w --h --flip --z --r]` | Add a deco (w/h default to the median drawn size) |
| `set <street>/<id> key=value … [--no-carry]`, `rm <street>/<id>` | Edit or remove anything by id; a line that moves carries the signposts standing on it, and the arms landing there follow (P7) |
| `platform --street k --from x,y --to x,y [--perm floor\|roof\|soft\|hard]` | Add a line |
| `wall`, `ladder`, `signpost --street k --x --y` | Add geometry (`ladder --tiling wood\|stone\|none`: wood by default, since a bare ladder draws nothing) |
| `connect <streetA> <streetB> [--a-post id] [--b-post id]` | Two-way connects, arrivals computed |
| `arrivals [--street k] [--posts]` | Work every arm's arrival out again; `--posts` first stands floating or sunk signposts on their floor (P7) |
| `link-world <street> --from <shipped tsid> [--post id]` | Add the `edits[]` connect from a shipped street |
| `populate --street k npc_piggy=2 trant_fruit=1 [--quoins 6]` | Set the population |
| `effect --street k --kind steam\|lava\|embers --x --y [--layer --rate --size --height --spread --period a,b --burst s \| --always --sprite s]` | Add a zone ambient effect (`set` and `rm` it by its `fx_` id) |
| `rumble --street k [--every a,b --duration s --strength px --quiet] \| --off` | Set or remove the street's rumble |
| `effects [--street k]` | Each street's effects and rumble, and their cost against the limits |
| `connect ... [--a-at x] [--b-at x] [--a-floor highest\|lowest\|<line>] [--b-floor ...]` | P7: where each new post stands (the default is the highest floor 150 px in from the facing end) |
| `hub map --street k --line x1,y1,x2,y2` | Draw the hub map |
| `ops <file.json>` | Apply a batch of ops atomically |
| `decos <query> [--layer sky] [--hub 58] [--limit 20]` | Search the deco catalog |
| `style [hub-58\|default]` | Print a style profile |
| `validate [--rule PHY-*]` | Findings; exit 1 on error or fatal |
| `render --street k [--view full\|camera] [--x --y] [--scale 0.25] [--overlay geometry,reach,findings,effects] --out f.png` | PNG |
| `assets` | The draft's new art as intake kept it: size, what was trimmed, warnings |
| `asset add <file> --name gz_x --licence own-work-CC0\|ai-generated [--author --tool --prompt]` | Intake (9.1) |
| `asset add <file> <file> ... [--names a,b]` | P7: several files in one call; names from the files (`gz_`, or `gz_ai_` for AI art), a `<base>@1.5x.<ext>` beside one is its 3x; one batch of `asset.set` ops |
| `play [--street k]` | Print the play-test URL |
| `history`, `restore <rev>` | Revisions |
| `publish --dry-run \| --write` | Section 11 (local only) |

### 8.3 REST routes

Every route is under `/wp-json/groddle/v1/admin/builder/`.

| Method and path | Body or query | Answer |
|---|---|---|
| GET `drafts` | | `{drafts:[{id,title,rev,state,updatedAt,findings:{error,warn}}]}` |
| POST `drafts` | `{id,title,hub}` | 201, the zone |
| GET `drafts/{id}` | `?rev=` | zone; `ETag: "<rev>"` |
| PUT `drafts/{id}` | zone, `If-Match` | `{rev}`; 409, 413, 422 |
| POST `drafts/{id}/ops` | `{ops:[…], note}`, `If-Match` | `{rev, changed:[ids], findings:{quick}}` |
| GET `drafts/{id}/revisions`, POST `drafts/{id}/restore` | `{rev}` | list / `{rev}` |
| POST `drafts/{id}/validate` | `{rules?}` | report (7.2); 503 without the worker |
| GET `drafts/{id}/render.png` | `street, view, x, y, w, h, scale, overlay, layers` | `image/png`; 503 without the worker |
| GET `drafts/{id}/play` | (cookie only) | play bundle (6.8) |
| POST `drafts/{id}/publish-request` | `{note}` | marks ready; publish stays local |
| DELETE `drafts/{id}` | | archived, never hard-deleted |
| GET `decos` | `q, layer, hub, family, animated, limit` | catalog rows |
| GET `style/{profile}` | | style profile (9.2) |
| POST `assets` | `{name, file2 (base64), file3?, licence, author?, tool?, prompt?}` | intake report (9.1) |
| GET `assets/{sha}` | | metadata |
| GET `/builder-art/{sha}` | page route, cookie | `image/webp` |
| GET `drafts/{id}/art/{sha}` | `size=3` for the 3x file | `image/webp`: a kept file the draft's zone names, or that the caller sent into the draft (P7, for `publish`) |
| GET/POST/DELETE `keys` | (cookie only, never a key) | builder keys |

**Op names:**

- `street.add`, `street.set`, `street.remove`;
- `layer.add`, `layer.set`, `layer.remove`, `layer.move`;
- `deco.add`, `deco.set`, `deco.remove`, `deco.move` (re-layer);
- `platform.*`, `barrier.*`, `ladder.*`, `signpost.*`, `connect.add`, `connect.remove`;
- `population.set`, `hub.set`, `hubmap.set`, `edit.add`, `edit.remove`, `waiver.add`, `waiver.remove`.

**Op shapes as built** (P1 to P3; `ops.js` and the site's `BuilderOps.php`, held to the same bytes by `tests/builder-ops.test.js`). A street is named by its key, a deco or layer by its id; every op's inverse is an op of this list.

| Op | Shape |
|---|---|
| `zone.set` | `{set: {title?, notes?}, unset?, order?}` |
| `hub.set` | `{hub: {id, name, isNew?, map?} \| null, order?}` |
| `hubmap.set` | `{map: {color?, top_color?, btm_color?, streets: [{tsid, name, x1, y1, x2, y2}], hubs?: [{tsid, hub_id, hubName?, label, x, y, arrow?}]} \| null, order?}`; the zone needs a hub (`builder_no_hub`) |
| `asset.set` | `{name, asset: {...} \| null, order?}` |
| `street.add`, `street.remove` | `{street, draftStreet, at?}`, `{street}` |
| `street.set` | `{street, set, unset?, order?}` over label, internalLabel, hubId, hubName, gradient, musicFile, noMap, fogMap, bounds |
| `editor.set` | `{street, editor \| null, order?}` |
| `population.set` | `{street, population: {counts, quoins?, interior?, exact?, giantId?} \| null, order?}` |
| `layer.set` | `{street, layer, set, unset?, order?}` |
| `deco.add`, `deco.remove`, `deco.set`, `deco.move` | `{street, layer, deco, at?}`, `{street, id}`, `{street, id, set, unset?, order?}`, `{street, id, layer, at?, set?: {x, y}}` |
| `platform.*`, `barrier.*`, `ladder.*`, `signpost.*` | `.add {street, <kind>: {id?, ...}, at?, order?}`, `.remove {street, id, prune?}`, `.set {street, id, set, unset?, order?}` |
| `connect.add`, `connect.remove`, `connect.set` | `{street, signpost, connect, at?}`, `{street, signpost, at}`, `{street, signpost, at, set, unset?, order?}` |
| `emitter.add`, `emitter.remove`, `emitter.set` | zone ambient effects, the geometry ops' shapes: `{street, emitter: {id?, kind, layer?, x, y, ...}, at?}`, `{street, id, prune?}`, `{street, id, set, unset?, order?}`; the rumble is `street.set {set: {rumble}}` |
| `edit.add` | `{edit: {tsid, op: "add-connect", signpost, connect} \| {tsid, op: "add-signpost", newSignpost}, at?, order?}` |
| `edit.remove` | `{at, prune?}` (prune drops `edits` when it empties, the inverse of an add that made it) |

Not built yet: `layer.add`, `layer.remove`, `layer.move` (templates make a street's layers whole, through `street.add`) and `waiver.add`, `waiver.remove`.

A batch is atomic: if one op fails, nothing is stored, and the answer is 422 with the op's index.

**Errors** use the shape the site already returns, `{code, message, data:{status, …}}`:

| Code | Status | When |
|---|---|---|
| `builder_rev_conflict` | 409 | `data.rev` is the current rev |
| `builder_invalid` | 422 | `data.findings` are the fatal findings, `data.op` the failing op |
| `builder_too_large` | 413 | over a limit in section 12 |
| `builder_key_scope` | 403 | the key lacks the scope |
| `builder_rate_limited` | 429 | `Retry-After` is set |
| `builder_worker_unavailable` | 503 | the builder worker is not running |
| `builder_not_found` | 404 | no such draft, rev or asset |

### 8.4 Auth for an agent, and the builder worker

**Humans** use the console session: cookie plus REST nonce, and `manage_options`, as the console does today.

**Agents** use **builder keys**, made in the Builder tab. Each key has a label, scopes, an expiry (30 days by default) and can be revoked. Keys are for local agents only for now (decided, section 15).

- **Scopes:** `drafts:read`, `drafts:write`, `assets:write`, `validate`, `render`. No scope can publish, manage keys, or reach any other admin route. That is why keys are better than a Minn application password: an application password would carry `manage_options` for the whole site, bans and gives included.
- **Header:** `X-Groddle-Builder: <key id>.<unix seconds>.<16 hex nonce>.<base64url HMAC-SHA256>`.
- **What is signed:** `"groddle-builder/1\n" METHOD "\n" route "\n" query "\n" seconds "\n" nonce "\n" hex(sha256(body))`. This is ServiceCall's scheme (`site:src/ServiceCall.php:11-30`) with its own prefix.
- **Window and replays:** a request is good for 60 s either side of the site clock. Builder writes are not idempotent, so seen nonces are kept for 2 minutes and a repeat is refused.
- **Secret:** the key's secret is `HMAC-SHA256(master, "groddle-builder-key/1\n" key_id "\n" created_at)`. The master lives in a file outside the webroot, like the realtime secret (option `groddle_builder_secret_file`). The database never holds a usable secret. Rotating the master revokes every key.
- **Where the secret goes:** it is shown once at creation, and goes in `~/.config/groddle/builder.env`, never in a repo.
- **Log:** each keyed write logs `key:<id>` (and the key's creator) in `groddle_admin_actions`.

**The builder worker** (`node tools/builder/worker.mjs`, 127.0.0.1:8794):

- It runs validate, render and the deco catalog queries for the PHP routes.
- The PHP calls it signed, the ServiceCall way, with the worker's own secret.
- For renders it opens Chrome through `tools/qa/browser.mjs` under the shared browser lock (`GRODDLE_BROWSER_LOCK`), and closes it after 60 s idle so other lanes can use the browser.
- On Kinsta there is no worker, so those routes answer 503.

### 8.5 The render endpoint

The render endpoint shows an agent its work.

**How it renders.** The worker loads a small page in the built game, **`/builder-render/`**, which draws a street with `buildStreetView` and the same overlays as the editor (6.7). It calls `renderer.extract` and returns the PNG. This is the real renderer, so an agent sees what a player sees: filters, blur, parallax and the sky gradient.

**Parameters:**

| Parameter | Values |
|---|---|
| `view` | `full`: the whole street, every layer at the parallax offset for the street's centre; or `camera`: what the player sees at camera `x,y` |
| `scale` | 0.05 to 1; the output is at most 4096 px a side |
| `overlay` | any of `geometry`, `reach`, `findings` (rule ids drawn at their `where`), `arrivals`, `populations`, `grid` (100 px world grid with labels, so an agent can read coordinates off the picture), `effects` (each emitter's mouth, plume height, id and kind; the rumble named) |
| `layers` | a comma list, to show some layers only |

**Headers:** `X-Builder-Rev` and `X-Builder-Findings: <error>,<warn>`.

**Speed:** about 2 to 5 s per render. Results are cached by (draft, rev, params).

### 8.6 What an agent needs to know, in one place

The worker serves `GET …/builder/guide`: a JSON digest that reads like a card. It holds:

- the coordinate spaces table (2.1);
- the jump numbers (2.3);
- the layer roles with their measured bands (9.2);
- the op list;
- the rule ids;
- the limits (12).

It comes from the same constants the validator imports, so it cannot drift.

### 8.7 Example session: a two-street zone, end to end

An agent with a key (scopes: drafts, assets, validate, render) builds "Mossy Hollow" beside Hechey Track.

```sh
$ export $(cat ~/.config/groddle/builder.env)   # GRODDLE_BUILDER_URL, GRODDLE_BUILDER_KEY
$ node tools/builder/cli.mjs new mossy-hollow --title "Mossy Hollow" --new-hub "Mossy Hollow" --json
{"id":"mossy-hollow","rev":1,"hub":{"id":"900","name":"Mossy Hollow","isNew":true}}

$ node tools/builder/cli.mjs style hub-58 --json | jq '.layers.sky | {z, w, density}'
{"z":[-3,-4,-3],"w":[0.61,0.67,0.78],"density":[1.3,2,3.5]}

$ node tools/builder/cli.mjs street add --draft mossy-hollow --key lane --label "Mossy Lane" \
    --template meadow --width 3000 --json
{"rev":2,"changed":["asset:evenground_platform_long","lane","hub"],"street":"GZ0000000000001","layers":["sky","bg_1","middleground","middleplus"]}
$ node tools/builder/cli.mjs street add --draft mossy-hollow --key end --label "Hollow End" \
    --template meadow --width 2000 --json
{"rev":3,"changed":["end","hub"],"street":"GZ0000000000002","layers":["sky","bg_1","middleground","middleplus"]}

$ node tools/builder/cli.mjs decos "bush" --layer middleground --hub 58 --limit 3 --json
[{"name":"bush_1","placements":625,"inHub":47,"drawn":{"w_med":104,"h_med":83}, …}, {"name":"bush_patch_1", …}, {"name":"bush_3", …}]

$ cat > ops.json <<'EOF'
{ "ops": [
  { "op": "platform.add", "street": "lane", "platform": { "x1": 1250, "y1": -192, "x2": 1450, "y2": -192, "pc_perm": -1 } },
  { "op": "deco.add", "street": "lane", "layer": "middleground",
    "deco": { "sprite": "heights_topper_2", "x": 1350, "y": -192, "w": 220, "h": 60, "z": 2, "r": 0 } },
  { "op": "deco.add", "street": "end", "layer": "middleground",
    "deco": { "sprite": "bush_3", "x": 300, "y": -60, "w": 160, "h": 90, "z": 1, "r": 0 } },
  { "op": "population.set", "street": "lane", "population": { "counts": { "npc_piggy": 2, "trant_fruit": 1 }, "quoins": 6 } }
] }
EOF
$ node tools/builder/cli.mjs ops --draft mossy-hollow ops.json --json
{"rev":4,"changed":["lane/plat_2","asset:heights_topper_2","lane/d_4","asset:bush_3","end/d_3","lane/population"]}
# ops fills in deco ids, and the provenance rows of library decos the zone has none for.

$ node tools/builder/cli.mjs connect lane end --json            # a post at each facing end, on its highest floor
{"rev":5,"changed":["lane/signpost_1","end/signpost_1"],"posts":["lane/signpost_1","end/signpost_1"]}
$ node tools/builder/cli.mjs link-world lane --from GLI2V0UN7RD1T2J --json   # an arm on Hechey Track, and one back
{"rev":6,"changed":["lane/signpost_2","edits"],"edits":1,"post":"lane/signpost_2","on":"GLI2V0UN7RD1T2J/signpost_3"}
# The arm goes on the shipped post that shows the fewest arms (signpost_1 already shows four, the most
# the game draws); the way back is a new post at Mossy Lane's left end.

$ node tools/builder/cli.mjs validate --draft mossy-hollow --json
{"ok":false,"rev":6,"counts":{"fatal":0,"error":1,"warn":0,"info":6},"findings":[
 {"rule":"PHY-003","severity":"error","at":"lane/signpost_1","message":"Signpost signpost_1 (to Hollow End) cannot be reached from the arrival at 150, 940.",
  "data":{"closest":{"x":2700,"y":940,"rise":132,"jump":105}},"fix":"Lower the ledge under the post to 100 px or less above the floor, or add a ladder."},
 {"rule":"STY-003","severity":"info", …}]}

$ node tools/builder/cli.mjs render --draft mossy-hollow --street lane --scale 0.25 \
    --overlay geometry,reach,findings,grid --out lane.png
lane.png 750x250  rev 6  findings 1 error, 0 warnings
# The agent looks at lane.png: the post stands on the new ledge, 132 px over the floor, with no way up.

$ node tools/builder/cli.mjs set lane/plat_2 y1=-150 y2=-150 --json      # a 90 px rise; the post on it comes too
{"rev":7,"changed":["lane/plat_2","lane/signpost_1","end/signpost_1"],"carried":["lane/signpost_1"],"arms":["end/signpost_1/0"]}
$ node tools/builder/cli.mjs set lane/d_4 y=-150 --json                  # the ledge's topper with it
$ node tools/builder/cli.mjs arrivals --posts --json                     # every post on its floor, every arm landing there
{"changed":[],"arms":[],"posts":[],"none":[]}
$ node tools/builder/cli.mjs validate --draft mossy-hollow --json | jq .counts
{"fatal":0,"error":0,"warn":0,"info":6}

$ node tools/builder/cli.mjs play --draft mossy-hollow --street lane
https://groddle.localhost/play/?practice=1&autostart=1&draft=mossy-hollow&street=lane
$ curl -s -X POST "$GRODDLE_BUILDER_URL/wp-json/groddle/v1/admin/builder/drafts/mossy-hollow/publish-request" \
    -H "X-Groddle-Builder: $(node tools/builder/cli.mjs sign POST /groddle/v1/admin/builder/drafts/mossy-hollow/publish-request '{"note":"ready"}')" \
    -H 'Content-Type: application/json' -d '{"note":"ready"}'
{"id":"mossy-hollow","state":"ready","rev":8}
```

Austin then play-tests it, and runs `publish --write` in a clean worktree (section 11). The zone document at rev 8 looks like this (shortened; the full form passes the schema):

```json
{
  "format": "groddle-zone/1", "id": "mossy-hollow", "title": "Mossy Hollow", "rev": 8,
  "hub": { "id": "900", "name": "Mossy Hollow", "isNew": true, "map": { "streets": [
    { "tsid": "GZ0000000000001", "name": "Mossy Lane", "x1": 200, "y1": 260, "x2": 380, "y2": 240 },
    { "tsid": "GZ0000000000002", "name": "Hollow End", "x1": 380, "y1": 240, "x2": 560, "y2": 270 } ] } },
  "streets": [
    { "key": "lane", "street": { "source": "groddle-builder mossy-hollow", "tsid": "GZ0000000000001",
        "label": "Mossy Lane", "hubId": "900", "hubName": "Mossy Hollow",
        "bounds": { "l": -1500, "r": 1500, "t": -1000, "b": 0 },
        "gradient": { "top": "87A8C9", "bottom": "FFE7A0" },
        "platforms": [ { "id": "plat_1", "x1": -1480, "y1": -60, "x2": 1480, "y2": -60, "pc_perm": -1, "item_perm": -1 } ],
        "layers": [ { "id": "middleground", "name": "middleground", "z": 0, "decos": [
          { "id": "d_9", "sprite": "patch_dirt_2a", "x": 0, "y": -40, "w": 600, "h": 90, "z": 1, "r": 0 } ] } ],
        "signposts": [ { "id": "signpost_1", "x": 1350, "y": -150, "w": 150, "h": 200, "connects": [
            { "tsid": "GZ0000000000002", "label": "Hollow End", "hub_id": "900", "arrive": { "x": 150, "y": 940 } } ] },
          { "id": "signpost_2", "x": -1350, "y": -60, "w": 150, "h": 200, "connects": [
            { "tsid": "GLI2V0UN7RD1T2J", "label": "Hechey Track", "hub_id": "56", "arrive": { "x": 2026, "y": 894 } } ] } ],
        "stats": { "platformCount": 1, "layerCount": 1, "decoCount": 1, "signpostCount": 2 } },
      "population": { "counts": { "npc_piggy": 2, "trant_fruit": 1 }, "quoins": 6 } }
  ],
  "edits": [ { "tsid": "GLI2V0UN7RD1T2J", "op": "add-connect", "signpost": "signpost_3",
    "connect": { "tsid": "GZ0000000000001", "label": "Mossy Lane", "hub_id": "900", "arrive": { "x": 150, "y": 940 } } } ],
  "assets": { "patch_dirt_2a": { "origin": "tinyspeck-cc0", "licence": "CC0-1.0", "source": "groddle1.swf#patch_dirt_2a" } }
}
```

Phase 4's acceptance test is this session as a script (`tools/builder/example-session.mjs`), run against groddle.localhost. It deletes its draft, its art and its key afterwards. (Ids and positions above are as the script's run gave them; a template street's own decos come first, so the ops' new decos number on from them.)

---

## 9. Asset intake and the style guide

### 9.1 Intake checks

New art arrives through `POST assets` or `cli asset add`. The site decodes it with GD or Imagick and re-encodes it, as `ReportPicture` does (`site:src/ReportPicture.php:89`). No uploaded byte is ever served as it came.

| Check | Rule | Severity |
|---|---|---|
| Format | PNG or WebP only (SVG, GIF and anything else refused); decodes cleanly; RGBA | refuse |
| Size | Upload at most 8 MB; at most 4096 px a side; at least 8 px | refuse |
| Scale | The file is 2x art: its pixel size is the deco's logical size, and placements draw it at about half (`deco-hires.js` notes). An optional 3x file must be exactly 1.5x the 2x file (±1 px) | refuse if 3x is wrong |
| Name | `gz_` + lowercase words joined by `_`, unique against the library and the zone | refuse |
| Transparency | Has alpha. A border more than 30% opaque is warned ("square edges") unless the role is sky or backdrop. Colour bleeding on transparent pixels is cleared | warn |
| Registration | The game anchors decos bottom-centre (`street-render.js:1538`). Intake trims transparent margins. A visible bottom more than 2 px above the file's bottom is warned ("floats over its anchor"). The trimmed offset is recorded | warn |
| Style | Mean lightness, saturation and hue histogram (alpha-weighted) against the intended layer role's band (9.2) | info |
| Provenance | `licence` is required (`own-work-CC0` or `ai-generated`); `author`; `tool` and `prompt` for ai-generated; sha256 of the re-encoded 2x file | refuse if missing |

The report is stored with the asset (`groddle_builder_assets.report`), and the asset's `intake` id is written into the zone's `assets` row.

### 9.2 Style guide: what can be measured from Tiny Speck's art

All figures below were measured on 2026-10-30 over the 1,460 shipped streets. Phase 5's `tools/builder/style-profile.mjs` writes them per hub and for the whole world, as `assets/content/style-profiles.json` (`--check` test). The validator's STY rules and the CLI's `style` command read that file.

**Street size:**

- width p10/50/90: 2,500 / 6,000 / 6,000 px, max 8,000;
- height: 1,000 / 1,000 / 2,400, max 6,000;
- layers per street: 4 / 6 / 8, max 22.

**Layer roles.** A layer's role is its name normalised (`bg1` and `bg 2` become bg).

| Role | Streets | z (median, range) | Width ÷ street | Deco w p10/50/90 | Deco h p10/50/90 | Decos per 1,000 px p10/50/90 |
|---|---|---|---|---|---|---|
| sky | 1,095 | -3 (-11 to -1) | 0.75 (0.67-0.88) | 72 / 454 / 1,156 | 25 / 119 / 392 | 1.3 / 4 / 16 |
| bg_3 | 198 | -3 (-9 to -2) | 0.90 | 33 / 136 / 1,106 | 11 / 28 / 112 | 3.8 / 6.3 / 26.6 |
| bg_2 | 835 | -2 (-8 to -1) | 0.83 (0.77-0.94) | 52 / 218 / 1,063 | 17 / 65 / 277 | 2.1 / 6.6 / 17 |
| bg_1 | 946 | -1 (-9 to -1) | 0.90 (0.86-0.97) | 59 / 288 / 912 | 27 / 81 / 378 | 3.6 / 8.2 / 20.7 |
| middleground | 1,456 | 0 | 1 | 87 / 251 / 702 | 37 / 75 / 217 | 0.4 / 27.7 / 86.8 |
| middleplus | 1,088 | 1 (1 to 3) | 1.00 | 81 / 168 / 580 | 44 / 84 / 229 | 0.5 / 4.2 / 16 |
| foreground | 590 | 2 (1 to 4) | 1.08 (1.03-1.11) | 98 / 238 / 839 | 123 / 288 / 632 | 0 / 1.7 / 11.6 |

Layer heights equal the street height (ratio 1) for every role. 10.4% of decos are flipped and 27.9% are rotated.

**Layer filters** by role (p10 / median / p90; how many layers of that role have the filter):

| Role | Brightness | Contrast | Saturation | Tint amount | Blur |
|---|---|---|---|---|---|
| sky | -60 / 3 / 44 (849) | -85 / -19 / 11 | -83 / -46 / -15 | 18 / 72 / 82 (460) | 2 / 3 / 5 (516) |
| bg_2 | -35 / 13 / 30 | -40 / -21 / -3 | -48 / -15 / 10 | 15 / 47 / 63 | 1 / 2 / 3 (349) |
| bg_1 | -39 / 5 / 25 | -38 / -15 / -7 | -45 / -15 / 13 | 15 / 46 / 60 | 1 / 1 / 2 (166) |
| middleground | -32 / 1 / 22 | -20 / -4 / 25 | -39 / -13 / 18 | 11 / 27 / 52 | none |
| middleplus | -34 / -5 / 22 | -20 / -9 / 35 | -40 / -15 / 18 | 11 / 30 / 53 | 1 layer |
| foreground | -70 / -41 / -5 | -40 / -15 / 25 | -60 / -27 / 7 | 16 / 30 / 100 | 2 / 4 / 8 (228) |

Depth reads as more desaturation and more blur further back, and a darker foreground.

**Sky gradient** (1,264 streets):

| | Hue p10 / 50 / 90 | Saturation median | Lightness p10 / 50 / 90 |
|---|---|---|---|
| top | 0° / 200° / 214° | 0.40 | 0.11 / 0.60 / 0.79 |
| bottom | 0° / 49° / 200° | 1.0 | 0.13 / 0.67 / 0.95 |

The bottom is lighter than the top on 855 of 1,264 streets (a glow at the horizon).

**Palette per role** cannot be read from the street JSON. Phase 5 computes it:

1. For each library deco, decode the 2x WebP. Use Playwright's Chrome with OffscreenCanvas; the repo has no Node image decoder, and the deco pipeline uses Pillow from python3.11.
2. Take alpha-weighted mean HSL and a 12-bin hue histogram.
3. Weight by placements per role, per hub and overall, and write bands as above.

Intake's style check and STY-002 use those bands. They are advice, never a block: a new zone may look new on purpose.

---

## 10. Licences for new art

Today only Tiny Speck's CC0 art and sounds ship, plus self-hosted Nunito (OFL). `tests/g316-provenance.test.js` keeps anything else out. A zone built only from the CC0 library raises no new question.

| Option | What it means | Risk | Work |
|---|---|---|---|
| A. CC0 library only | Zones use the 2,990 library decos (plus forks and recolours via layer filters) | None | None |
| B. Own work, released CC0 | Art Austin or a named person draws, dedicated CC0 so the art set stays one licence | Low: clear authorship | Intake, a provenance file, a credits line |
| C. AI-generated, released CC0 "to the extent any rights exist" | Art from an image model; provenance records model, version, prompt and date; kept apart (`gz_ai_*`) and listed | Unsettled law (below) and the reputational question for a project built on Tiny Speck's gift | Intake plus a policy flag |
| D. Third-party packs (CC-BY, other CC0 sites) | Per-asset attribution and mixed licences | Medium: licence tracking; breaks the "one licence" story | Attribution plumbing |

**The law on AI images is unsettled.**

- In the United States, the Copyright Office's position (its 2025 report on copyrightability) and the courts so far (*Thaler v. Perlmutter*, D.C. Cir. 2025) say purely machine-made images have no copyright, because a human author is required.
- Other countries differ: the UK has a "computer-generated works" rule, and at least one Chinese court has protected an AI image.
- Separately, whether an output can infringe the works a model was trained on is being argued in several open lawsuits.

None of this is settled. Austin should check its status when he decides. Two consequences:

- a CC0 dedication of AI art is honest but may dedicate nothing;
- the real risk is resemblance to someone else's work, not loss of our rights.

**Decided (Austin, 2026-10-30): "anything as open license as we can".**

1. **Everything ships as CC0 1.0.** The Tiny Speck library (option A), and new art whether it is Austin's own work (option B) or AI-generated (option C), all carry a CC0 1.0 dedication, so the art set stays one licence.
2. **Every asset's provenance is recorded:** who or what made it (author; for AI art the model and version, and the prompt) and from what inputs (`assets{}.inputs`: library deco names, Austin's own sketches or photos). Publishing writes it into `tools/provenance/new-art.json`, and the credits page lists new art by maker.
3. **Inputs must be CC0 or Austin's own.** AI art made from style references or image-to-image takes only Tiny Speck's CC0 decos or Austin's own work as its inputs. That lowers, but does not remove, the resemblance risk above, because a base model's training data is still unknown.
4. **The validator checks provenance and CC0** (AST-004, section 7.3). It no longer blocks AI art: the publish policy (`tools/builder/licence-policy.json`) lists `CC0-1.0`, `own-work-CC0` and `ai-generated`, and requires complete provenance. AI files keep their own prefix (`gz_ai_*`) so they stay easy to list.
5. **Option D** (third-party packs) is not used.

---

## 11. Publishing

Publishing runs in a **clean worktree** of the game repo:

```
node tools/builder/cli.mjs publish mossy-hollow --rev 7 --dry-run
node tools/builder/cli.mjs publish mossy-hollow --rev 7 --write
```

It never commits, tags or pushes.

1. **Gate.**
   - Pull the named rev.
   - It needs no fatal or error findings; every warn must be acknowledged or waived.
   - Every asset licence must be in `licence-policy.json` (CC0 1.0 dedications), with complete provenance.
   - Labels must be unique against the index.
   - The draft's `baseCommit` must be an ancestor of HEAD; otherwise re-validate first.
2. **Write the zone's own files.**
   - `public/assets/zones/<id>.json`: the canonical published zone, without editor state. Generators read it as a second source beside Tiny Speck's.
   - `public/assets/streets/<GZ tsid>.json` for each street, with `stats` recomputed.
   - New art: `public/assets/decos/groddle/gz_*.webp` (and `@1.5x`), with rows added to `manifest.json` and `js/deco-hires-list.js`, and `tools/provenance/new-art.json` (sha256, licence, author, tool, prompt).
3. **Merge into generated data.** Each generator learns to read `assets/zones/*.json`, so a later rebuild from Tiny Speck's sources keeps the zone:

   | Generator | Adds |
   |---|---|
   | `build-street-names.mjs` | index rows (label, hub, counts) |
   | `build-hub-maps.mjs` | nothing: zones stay off the world map and out of Completist counting (decided, section 15). The zone markers keep them apart (index and hub map rows' `zone`); their streets show their own street map (15 Q11) |
   | new `tools/builder/build-zone-maps.mjs` | `assets/maps/hubs/hub-<id>.json` and its `assets/maps/index.json` row |
   | `build-street-ecology.mjs` | the population rows |
   | `tools/builder/apply-zone-edits.mjs` | the `edits[]` connects on shipped streets, with `arrive` recomputed. It runs after `build-street-navigation.mjs`, which would drop an unmatched connect's `arrive` (`location-navigation.js:286-296`) |
   | `tools/build-signpost-graph.mjs`, `tools/data-versions/build.mjs` | as today |
   | `build-realtime-*.mjs` | not in the first release (zones are solo only, decided, section 15). Phase 6 keeps zone streets keyable the same way (one tsid, one population row), so a later release can run these builders over them |

4. **Check.**
   - `npm test`, plus a new `tests/zones.test.js`:
     - every zone file passes the schema and the validator with no errors;
     - `apply-zone-edits.mjs --check` and the generators' `--check` modes are clean;
     - every `gz_` file has a provenance row;
     - no label has "glitch" or an em dash.
   - `tests/g316-provenance.test.js` gains the new-art list as allowed files.
5. **Commit and release.** Austin commits (`📦 NEW: Mossy Hollow, a new hub to explore`), and the normal release flow ships it: `tools/release/status.mjs`, tags, `kinsta.sh`. The draft's state becomes `published`, with `published_commit` set.

**Rollback** is the release rollback. A later fix starts from a new draft forked from the published zone file (`new --from-zone`).

---

## 12. Performance limits

| Limit | Value | Basis |
|---|---|---|
| Streets per zone | 40 | Schema |
| Street bounds | 8,000 x 6,000 | Shipped max |
| Layers / decos / platforms per street | 24 / 1,500 / 600 | Shipped max 22 / 1,341 / 538 |
| Connects per signpost | 8 (warn over 5) | Shipped max 5 |
| Zone document | 4 MB (a street averages 38 KB, max 126 KB) | 413 over it |
| Ops per batch | 500 | 413 |
| Texture memory estimate per street | warn at 150 MB, error at 192 MB | Recolour budget, `street-render.js:872` |
| Editor | 60 fps at 1x on Hechey Track with overlays; culling as in game (`CULL_MARGIN` 256) | Measured with rAF in phase 1 |
| Validator | 300 ms for a typical street and 2 s for the worst, in a Worker; all 1,460 shipped streets in 10 minutes | Phase 2 |
| Render | 5 s, at most 4096 px a side and 4 MB, cached by rev and params | Phase 4 |
| API rate per key | 120 writes/min, 20 renders/min, 60 validates/min, 300 fetches of new art's files/min | 429 |
| Asset intake | 8 MB upload, 4096 px a side, 200 new assets per zone | 9.1 |
| Zone effects per street | 40 emitters; 400 particles alive at once; overdraw 4 Wide views (each particle's largest area, summed); warn at 80% | `js/street-effects.js` `EFFECT_LIMITS`: the pools are made once, so this is also the memory |
| Rumble | shakes at most a third of the time and 16 px (warn); schema caps 24 px and 6 s | Motion comfort; none at all under `prefers-reduced-motion` |

---

## 13. Security

- **Admin only.** Every route and page is gated by `manage_options` (cookie plus nonce), or by a builder key limited to its scopes. Keys can never reach other admin routes, manage keys, or publish.
- **Signed.** Keyed requests are HMAC-signed with a time window and a nonce store (8.4). Secrets are derived from a master file outside the webroot, never stored, shown once, and live in `~/.config/groddle/`.
- **No upload ever executes:**
  - images are decoded and re-encoded server-side;
  - only PNG and WebP are accepted, never SVG;
  - bytes are stored in the database, not in a served folder;
  - they are served by a page route as `image/webp` with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'` and `Cache-Control: private, no-store`.
- **Text is text.** Every label, sign text and note is set as text in the editor (as the console already does), and length-capped by the schema.
- **JSON only.** The zone document is parsed as JSON and checked against the schema before anything uses it. Ops name elements by id; nothing is evaluated.
- **The worker is private.** It listens on 127.0.0.1 only, and accepts only signed calls from the site. Its Chrome opens only `/builder-render/` on its own origin.
- **Drafts never reach players.** `/play/?draft=` needs an administrator session, forces practice mode, and is refused in `/play/online/`. Nothing in a draft reaches the realtime server.
- **Publishing is a person.** Only the CLI publishes, in a local worktree, and only Austin commits and releases. Before a push, the release flow greps for `/Users/` and secrets, as today.
- **Logged.** Every write is a line in `groddle_admin_actions`.

---

## 14. Phases

Sizes: S is 1-2 lane-days, M is 3-4, L is 5-7.

| Phase | Size | Builds | Acceptance | Tests and checks |
|---|---|---|---|---|
| **P0 Foundations** | S | Schema in the repo; `tools/builder/deco-catalog.mjs` → `assets/content/deco-catalog.json`; `registerDraftStreets` seam in `street-loader.js`; `practice-mode.js` honours `draft` | All shipped streets pass the street schema; catalog has 2,990 rows with layer usage | `tests/zone-schema.test.js` (Ajv vendored as a dev dependency, or a small 2020-12 subset checker); `deco-catalog --check`; seam unit test (primed street loads without fetch) |
| **P1 Viewer, store, deco editing** | M | Site: tables, CRUD and ops routes, revisions, the Builder tab and `/console/builder/` shell. Game: `js/builder/editor.js` with the real renderer; open any street; fork; select, move, resize, flip, rotate, z, re-layer decos; inspector; outliner; undo and redo; autosave; play-test | 10 sample streets (Hechey Track, a Jal street, a cave, a tall street) match `/play/` screenshots at the same camera; an edit round trip survives reload; 409 path works; play-test shows the edit; 60 fps on Hechey Track | `php -l` over site `src/`; console helper tests (as `tests/g407-admin-console.test.js`); ops inverse property test (apply, then the inverse, gives a byte-equal zone); Playwright check of the builder page in light and dark |
| **P2 Geometry and validator v1** | L | Handles for platforms, walls, ladders, signposts; snapping; sky gradient and layer filters; connect editing; `js/builder/validate.js` with every rule but STY; reach overlay and jump arc; `js/avatar-step.js` extracted from `game.js` | Calibration over 1,460 streets in under 10 minutes; 20 sampled findings play-tested with under 10% false; parity: apex 105 px, flat running jump 198 px, arcs within 2 px of `?physicsdemo=1&physicsautoplay=jump` | `tests/builder-validate.test.js` (one fixture per rule, pass and fail); `tests/movement.test.js` and the physics QA route unchanged after the extract; full `npm test` |
| **P3 New zones** | M | New zone, street and hub; templates; deco picker with search and facets; population editing with the planner's spots shown; hub map editor; `edits[]` | Mossy Hollow (two streets, new hub, linked from Hechey Track) built by hand in under 30 minutes, validates clean, played through both streets and back | Picker search tests (ranking, facets); NAV rule fixtures; a Playwright walk of the play-test across the zone's signposts |
| **P4 Agent interface** | L | CLI; builder keys and signed routes; builder worker (validate, render); `/builder-render/`; the guide route; rate limits | The 8.7 session runs as `tools/builder/example-session.mjs` against groddle.localhost and cleans up; a replayed or stale-signed request is refused; a key cannot reach `admin/give` | Signature vectors shared between PHP and JS (as ServiceCall's tests); CLI tests on `file:` zones; render golden check (pixel diff under 1% against a stored PNG of Hechey Track at scale 0.25) |
| **P5 Asset intake and style** | M | Intake checks and storage; `gz_` assets in drafts; `style-profile.mjs` and `style-profiles.json`; STY rules; licence policy file | A good PNG passes; an SVG, a 5,000 px file, a file without alpha and a mislabelled 3x are refused or warned as the table says; style bands printed for 5 hubs | Intake fixtures (including a PNG with a PHP payload in a text chunk, which must come out clean); `style-profile --check` |
| **P6 Publishing** | M | `publish --dry-run/--write`; zone sources in the generators; `apply-zone-edits.mjs`; `tests/zones.test.js`; provenance list for new art; realtime builders checked | Mossy Hollow published in a worktree; `npm test` green; re-running every street build script leaves the zone intact; the release status tool lists the zone files | `tests/zones.test.js`; every generator's `--check`; `tests/map-routes.test.js`; `tests/g316-provenance.test.js`; the two-player online smoke check with the zone synced |

**Order and dependencies.** P0 comes first, then P1, then P2. P3 and P4 can run as two lanes after P2, split by file ownership: P3 owns `js/builder/editor*`, and P4 owns `tools/builder/*` and the site routes. P5 can start after P1. P6 is last.

### 14.1 What was built, and where it differs from the plan

**P0 (2026-10-30).**

- **Schema checker, not Ajv.** `public/js/builder/schema-check.js` is a strict 2020-12 checker for the keywords `zone.schema.json` uses (an unknown keyword is a compile error, as in Ajv's strict mode). It is pure, so the editor and the P2 validator share it, and the repo gains no dependency. All 1,460 shipped streets pass `$defs/street` in about 2 s (`tests/zone-schema.test.js`).
- **The schema stays at `docs/level-builder/zone.schema.json`.** Its only change is `assets{}.inputs` (decided Q1).
- **Layer roles.** `public/js/builder/layer-role.js` names a layer's role from its name where it says one (sky, cloud, star, fore, fg) and from its depth against the middleground otherwise; the catalog, the picker's facets and the STY rules use it. Roles are the five facet roles (sky, bg, middleground, middleplus, foreground); bg_1/bg_2/bg_3 are one role.
- **Deco catalog.** `tools/builder/deco-catalog.mjs` writes `public/assets/content/deco-catalog.json` (957 KB, one row a line). Two additions to the row in 6.4: `source` (the SWF bundle and symbol, which a fork writes into `assets{}`), and `hires` means a 3x file exists (2,333; the runtime list `deco-hires-list.js` holds 2,292 because the 41 big ones are picked elsewhere). `drawn` is the median over every role. Placements are counted under the art the renderer draws (`DECO_TWINS`), 555,702 in all; the 135 others name art that is missing.
- **Seam.** `registerDraftStreets(rows, streetsByTsid)` in `street-loader.js` keeps draft streets in their own map: their rows survive a later index load, and `loadStreetData` returns them without a fetch even after the cache is cleared. Each street is copied and checked as a file is (`assertStreetGeometry`, hidden connects dropped).
- **Practice.** `practice-mode.js` treats `?draft=` as `practice=1`, never on a multiplayer page.

**P1 (2026-10-30).** Where it lives: site `src/AdminBuilder.php` (routes), `src/BuilderStore.php` (tables, revisions, log), `src/BuilderOps.php` (ops and the structural check), `src/AdminBuilderPage.php` (`/console/builder/`) and the Builder tab in `console/console.js`; game `public/js/builder/` (`editor.js`, `ops.js`, `session.js`, `api.js`, `handles.js`, `zone.js`, `draft-play.js`) and `public/css/builder.css`.

- **Off unless switched on (Q2 default).** The site option `groddle_builder_enabled` (`1`, `yes`, `true` or `on`) turns on the Builder tab, `/console/builder/` and every builder route; unset, the routes answer 404 `builder_disabled` and the page does not exist. It is set on groddle.localhost only.
- **Tables.** Only the two P1 needs: `groddle_builder_drafts` and `groddle_builder_revisions` (`minn.json` 0.5.24). Assets, keys and nonces come with P4 and P5. Revisions go in through `FROM_BASE64`, as ticket pictures do, because Minn's database refuses a statement carrying bytes that are not UTF-8.
- **Writes.** A write without `If-Match` is refused with **428 `builder_rev_required`** (a code the table in 8.3 did not have). The 409, 413 and 422 answers are as 8.3 says; a failing op in a batch gives its index in `data.op`.
- **Log.** An open editor saves every 2 s, so a run of saves to one draft by one administrator within 10 minutes updates one `groddle_admin_actions` line (revs from and to, how many changes) instead of adding a line a save. Creating and archiving a draft are lines of their own.
- **Ops.** P1's ops are `zone.set`, `hub.set`, `asset.set`, `street.add`, `street.remove`, `street.set`, `editor.set`, `layer.set` and the four deco ops; `deco.move` takes the new `x, y` (the editor works them out with the camera's parallax). Ops never touch `stats` (the fork computes them; publishing recomputes them) or `rev`. An inverse that puts back a removed field carries `order`, the object's keys as they were, so undo gives the same bytes, not just the same values. The site's PHP port is held to the same bytes by `tests/builder-ops.test.js`.
- **Fork.** The copy gets a random GZ tsid (not a sequence, so drafts never collide), `source` `groddle-builder <zone> (fork of <tsid>)`, its decos numbered `d_1..d_n` in layer order, its stats recomputed and its population from the shipped ecology row. It drops what builder streets never carry, including `walls` (the legacy colliders on 2 streets), `internalLabel` and `swf_file`. The 196 shipped streets with no sky gradient get a default one in the fork, because the schema requires it on builder streets. A shipped street opened to look at is numbered the same way, so the inspector shows the id the fork will have. A new draft has no streets and no hub until the first fork, which also sets the hub; `baseCommit` is not set yet (P2 or P6).
- **The shell page** keys each game file by the sha256 of its bytes as the synced build has it, rather than reading a key from `js/data-versions.js` (which keys data and art, not modules). `editor.js`'s bytes carry its imports' content keys, so its key changes whenever anything it loads does. When the synced build has no `editor.js`, the page says so.
- **The editor** sets Pixi up as `game.js` does (filters at the renderer's resolution, `installPixiFixes`, WebP and 3x decos through `installHiresDecos`), draws with `buildStreetView`, and drops hidden connects as `loadStreetData` does. Edits move sprites in place; adding, removing, re-layering and edits on blurred layers draw the street again (12 ms on Hechey Track). Picking and handles are computed from the deco's data and its layer's parallax offset, never from Pixi's transforms (a blurred layer's sprites are parked off the stage).
- **Editor state** (panels, each street's camera, keep proportions, the clipboard) is kept in this device's localStorage, not in the draft's `editor` field; layer lock and the editor-only eye last for the session. The undo history is cleared after a 409 rebase or an agent's edit arrives, because its inverses were made against the old rev.
- **Play-test.** The banner sits at the bottom left, clear of the street nameplate and the pack. `/play/` gained one read-only QA hook, `groddleQA.streetDeco(id)`.
- **Stylesheet.** `public/css/builder.css` uses the site's light and dark tokens; its font sizes are in `em`, because the game's token lint covers every stylesheet under `public/` and this page does not load the game's token block.
- **Not in P1** (later phases, as the table says): the deco picker and D, snapping, the grid, guides and rulers, panning at the view edge while dragging, the "layout" parallax preview, the view frame overlay, layer filter and sky editing, and the Q, W, E and S draw tools.
- **Acceptance, measured 2026-10-30 on groddle.localhost:** 10 streets (Hechey Track, two Jal streets, two caves, two tall streets and three others) at the same camera and view as `/play/`: 0.5% to 8% of pixels differ by more than 32 levels, all of it the game's avatar, animals, vendors and gardens; an edit survives a reload byte for byte; a 409 rebases (both writers' changes kept) and a change that no longer fits is kept aside; the play-test draws the edited deco on the GZ street; 60 fps on Hechey Track at 100% with the selection drawn.

**P2 (2026-10-31).** Where it lives: game `public/js/avatar-step.js` (the movement frame, shared), `public/js/builder/reach-graph.js` (reachability and the jump arcs), `public/js/builder/validate.js` (the rules), `public/js/builder/validate-worker.js` (the editor's worker), the geometry ops in `public/js/builder/ops.js`, `tools/builder/validator-context.mjs` (the validator's data in Node) and `tools/builder/calibrate.mjs` → `tools/builder/calibration.json`; site `src/BuilderOps.php` (the same geometry ops).

- **One stepper, not a copy.** P2 extracts the frame instead of copying the constants (7.4 allowed a copy with a parity test first). `js/avatar-step.js` holds the walking and airborne frame of `game.js physics()` (`stepAvatar`), the floor resolve (`avatarGround`, which was `game.js resolveGround`), the steering of `handleInput` (`steerX`, `steerAccel`, `coastX`) and the per-street fall rules (`streetPhysicsFreeFall`, `streetPhysicsExtras`). `game.js` calls them; climbing, Paradise courses, menus and the animation stay in the game. `tests/movement.test.js` is unchanged and passes; two source checks (`tests/slope-walk.test.js`, `tests/underside-corners.test.js`) now read the moved lines in `avatar-step.js`.
- **Parity, measured in Chrome against the game** (`/play/` from the worktree, every frame sampled): a plain jump on Hechey Track peaks at 104.94 px in the game and in the stepper, frame by frame within 0.06 px; a flat running jump lands 198 px on in both, within 0.02 px by x; `?physicsdemo=1&physicsautoplay=jump` (Asura Spire, its own swim physics) peaks at 147.92 px in both, within 0.03 px. The physics QA route still publishes `physicsApex` 148.
- **The game's own seams are in the model.** Where no standable line is within 8 px across, the game stands the avatar at the lowest line near it, or at the height of the lowest line on the street (`avatarGround`): imported streets walk over their seams that way, and an avatar walking into a stretch whose lowest line is above its feet is set onto that line. The reach graph has this as virtual "floor" lines (drawn in the reach map, never listed as findings), and an arc that lands on ground that is no line walks on until it reaches one.
- **Ops.** `platform.*`, `barrier.*`, `ladder.*` and `signpost.*` (`add`, `remove`, `set`) and `connect.add`, `connect.remove`, `connect.set`. `connect.set` is new (8.3 listed add and remove only): it edits an arm's label, hidden or arrive in place. An add without an id takes the next `plat_<n>`, `wall_<n>`, `ladder_<n>` or `signpost_<n>`; `pc_perm` and `item_perm` may be set to null (hard); a remove carries `prune` when the add made the list, so undo gives the same bytes. The PHP port is held to the same bytes and error codes by `tests/builder-ops.test.js`.
- **Arrivals and targets.** A zone street's arrivals are the zone's own arms and `edits[]` that land on it, plus `editor.spawn`. A street nothing leads to yet is reached from the floor at each of its signposts, so the reach map still means something while it is built; findings from those stand-in arrivals say so (`data.fallback`). A signpost is in reach from a stand point within 120 px across whose feet are between the post's top and 60 px under its foot; a door within 60 px of its sides. A ladder-top signpost is reached with its ladder, a buried one from 110 px of its rim. PHY-006 takes each arrival's best route.
- **The schema in the browser.** The editor's worker reads `public/assets/content/zone.schema.json`, a copy of this folder's schema that `tests/builder-validate.test.js` keeps byte-equal, since `docs/` is not served. The worker fetches its data only at URLs the page keyed with `groddleDataUrl` and posted to it (the worker's own module URL comes from its keyed import), so `tests/data-versions.test.js` lets these two files make a Worker. A shipped street opened to look at gets no worker: its reach map is worked out in the page.
- **Calibration** (`node tools/builder/calibrate.mjs`, all cores): 1,460 streets in 38 s on Austin's Mac (8 cores). 1,348 were checked; 112 have no shipped arrival (147 connects carry no `arrive`). Every street runs with its own physics. Two kinds of street are outside the model and marked approximate, their findings kept apart from the sample: 45 swim (jetpack) streets, and 51 streets whose location events change physics (bounces and gravity flips, such as Kloro's mushrooms). Each kept finding also says whether the 2012 client's 134 px jump (jump x 1.127 with the remake's steps) would reach it (`data.jump2012`).

  | | All | In the model (on streets) | Of those, the 2012 jump reaches |
  |---|---|---|---|
  | PHY-003 signpost | 207 | 113 (93) | 85 |
  | PHY-004 door | 26 | 19 (11) | 4 |
  | PHY-005 trap (per line) | 1,926 | 804 (30) | 661 |

  So most in-model findings are the 105 vs 134 px gap (decided: bugs in the remake, not validator errors). Traps cluster on a few tall streets climbed by ledges spaced for the 2012 jump.

- **Play-test of 20 findings**, sampled at random from the in-model ones (seed 7), in the real game served from the worktree. For each finding the avatar is set down (a new QA hook, `groddleQA.placeAvatar(x, y)`) at the four spots nearest the goal that the validator says a player reaches but that never lead there (for a trap, to any exit), and plays 15 moves from each with the keyboard: straight up; a standing jump and two running jumps each way; a jump that turns round in the air (outside the validator's model); walking off each way with the air jump early and late; Up at a ladder and a jump off it. Standing 3 frames on a spot that leads to the goal counts as reached. Six positive controls (a known jump between two goal lines on the sampled streets) check the method. **0 of 20 were false** (16 traps, 4 signposts; 17 of the 20 are in reach of the 2012 jump, so they are the 105 vs 134 px gap). 4 of 5 controls were reached; the fifth showed a limit, below.
- **The editor** (`editor.js`, with `js/builder/geometry-handles.js` and `js/builder/snap.js`): LocoDeco's handles for platforms (two ends, Shift levels), walls (top and bottom), ladders (the foot, and a grip for the height) and signposts (eight, bottom-centre); V, Q, W, E and S; snapping as 6.5 says; the inspector's perms (players and items, with plain meanings), a signpost's arms (add from a search of the draft's and shipped streets with the label, hub and arrival filled in; edit, hide, remove, work the arrival out again), and "Sky and layer filters" previewed as you drag. Overlays (each remembered on this device): geometry by permeability with a key, the reach map, the jump arc from the pointer, the Wide and Original view frames, rulers and guides, "as played" or "layout" parallax, and panning at the view edge while dragging. The bar's Validate count and a Findings panel (by severity; a click centres on the place and selects the thing) come from the worker 400 ms after an edit. Where they differ from 6.5 and 6.7:
  - guides are kept on this device per street, like P1's other editor state, not in the draft's `editor.guides`;
  - G (the grid) works whether `;` is on or not, and `;` also drops middleground decos onto the floor under them and makes guides pull;
  - lines, walls and ladders are picked only while the geometry overlay or a draw tool is on (signposts always), so decos stay easy to pick;
  - "layout" places every layer as the game would for a Wide view centred on the view;
  - the marquee still selects decos only;
  - on a shipped street, or without the worker, the reach map is worked out in the page from the floor under the view centre.
- **Limits found while calibrating** (added to the model's limits): a running jump starts at full speed from any stand point, even one without room for a run-up, so the validator can call a spot reachable that needs a longer run (the missed control); PHY-006's margin is the vertical one only (how much higher the apex went than the landing), not how close a landing came to a ledge's end; and the ground resolve's 16 px snap lets a falling avatar step up onto a line as much as 16 px over its apex, which the model has too (with 0 px of margin, so PHY-006 flags it).
- **Not in P2:** the STY rules (P5's `style-rules.js`, run by `validate.js` since the rebase), NAV-004 runs only with `publish`, AST-003's file check runs only when the caller passes the stored files (P4's worker).

**P3 (2026-10-31).** Where it lives: game `public/js/builder/templates.js` (templates, hubs, the hub map's lines), `public/js/builder/deco-search.js` (the picker's search, pure), `public/js/builder/editor-picker.js` (the picker and the new-art form), `public/js/builder/editor-zone.js` (the New draft and New street dialogs, the hub map editor, the population and zone panels), the P3 ops in `public/js/builder/ops.js`, the zone-edit helpers in `public/js/builder/zone.js`, the NAV rules for edits in `public/js/builder/validate.js`, and `applyZoneEdits` in `public/js/builder/draft-play.js`; site `src/BuilderOps.php` (the same ops), `src/BuilderStore.php` (a draft's hub in the list) and `src/AdminBuilder.php` (the play bundle carries the edits).

- **New draft.** A title and id, then a new hub (the lowest id from 900 that no listed draft's hub has, a name, Groddle Meadow's map colours) or one of Tiny Speck's hubs, sent as `POST drafts {id, title, hub}`. The draft list's rows now carry `hub {id, name, isNew}` (8.3 named no hub) so the next free id can be worked out. The New street dialog opens next.
- **Templates** read `style-profiles.json`: Meadow from Groddle Meadow (hub 58: sky, bg_1, middleground, middleplus), Tall from the world's profile at 2,400 high, Forest from Groddle Forest (hub 56: sky, bg_2, bg_1, middleground, middleplus, foreground), Cave from Ilmenskie Caverns (hub 50: sky, bg_1, middleground, middleplus, foreground), Blank (the middleground only). A back layer takes its role's median z (kept behind the layer in front), median width ratio and the filters at least half that role's layers carry, at their median; bg_2 is 7% narrower than bg_1. The sky is the profile's median top and bottom colour. Two additions to 6.3: "Vertical Parallax" is read as back layers shorter than the street in the same ratio as they are narrower (the profiles show every role at the street's height, so there is nothing to measure; P7 replaced this with Tiny Speck's tall streets' measured heights); and every template lays its hub's most placed long ground piece end to end along the floor (`evenground_platform_long`, `dirt_platform_long`, `cave_gr_texture_2`), because the game will not load a street without a deco (`assertStreetGeometry`). The floor line runs 20 px in from each end at y -60, the street is centred on x 0 with its bottom at y 0, and it carries `noMap` (zones stay off the world map). `newStreetOps` adds the street, its art's provenance rows and, for a new hub, its line on the hub map, as one undo step.
- **Deco picker** (D, or the Deco picker section under the layers). Search splits names on `_`, digits and case; a query's every word must match a name token (whole 30, start 20), the family (15), the art set (10) or anywhere in the name (5); the name typed exactly adds 1,000 and a name starting with the query 100. Then placements in the current street's hub, then placements overall. Facets: layer role, art set, used in this hub, animated, size class (by the longer drawn side: under 100, 300, 700 px, or over) and never placed, each with what it would leave. Where it differs from 6.4: "used in this hub" reads the catalog's top five hubs per deco, so a deco placed a little in many hubs can miss one; the new deco takes the catalog's median drawn size over every role (P0's catalog keeps no size per role); a click (or Enter on a result) places at the view centre, Enter in the search box places the best match; a dropped middleground deco stands on the floor under it while snapping is on. The zone's own new art comes first when nothing is typed, drawn from `/builder-art/<sha256>`. **Add new art** opens a form for P5's `POST admin/builder/assets` (the 2x and optional 3x file, the gz_ name, own work or AI-generated, maker, model and prompt, what it was made from, the layer it is for), shows intake's report, and sends the answer's `asset.set` op through the draft's ops.
- **Populations.** With nothing selected, the inspector lists the street's population by class in plain words (add a class, set a count, quoins, indoors) as `population.set`. The **Populations** overlay draws the planner's spots: `planStreetPlacements` over the street's lines with the game's request list (`validate.js placementRequests`), seeded by the tsid and keeping clear of the signposts, as `game.js` plans a street, coloured by kind.
- **Hub map editor.** A dialog with the 760 x 460 map (an SVG over the map's top and bottom colours): each zone street a line, its ends and the line itself dragged (or typed, or moved with the arrow keys, Shift 20 px), exits to Tiny Speck's hubs (a hub, a street in it, then placed and moved like the ends), the three colours, and "Draw the zone's streets" to add missing lines and drop stray ones (NAV-006). Each change is one `hubmap.set`. A Tiny Speck hub's map is not edited (zones stay off the world map).
- **Ways in (`edits[]`).** With a draft chosen, open a shipped street (or press "Add the way back on <street>" on an arm that leads out to one), pick a signpost, and "Add a way in" names one of the draft's streets: an `add-connect` edit whose arrival is where that street's signpost leading back stands (`arriveFor`). The shipped street on screen shows the draft's edits on its signposts (never written into its file), and the zone panel lists them with a way to open each street or remove the edit. An arm out to a shipped street works out its own arrival on the shipped street with the draft's edits on it. The play-test does the same: `applyZoneEdits` loads each street the edits name, puts the arms on a copy and registers it for that play only, and the site's play bundle now carries `edits`.
- **NAV rules for edits** (new in P3; 7.3's rows read "connect"): an edit on a street that is not shipped, on a signpost that street lacks, or leading to a street not in the zone is NAV-001; one with no arrival or one off the zone street's floor is NAV-002; a way in with no arm back, and a road out from a zone street to a shipped street with no way back in, are NAV-003; NAV-005 and TXT-001 read an edit's arm as the zone's own. The editor's worker gets the shipped streets the zone names from the page (`shipped` in its message). The Mossy Hollow fixture gained the arm from Mossy Lane back to Hechey Track that the new NAV-003 asks for.
- **Fixes to earlier phases found on the way:** the builder's address (`history.replaceState` with a bare `#...` resolved against `<base href="/">`, so the address bar pointed at the site's home page and a reload left the builder); opening a draft now sends its pending edits before fetching it (and keeps the session when you come back to the draft from a shipped street); P2's geometry saving was checked live on groddle.localhost (a platform's height and perm, a new wall, ladder and signpost with an arm: saved, reloaded, byte for byte).
- **A signpost shows four arms.** The game draws a post's first four arms (`street-render.js`), so a way in added to a full post would never show. The editor says so on such a post and offers no way in there, and warns on a zone post with four arms. Mossy Hollow's way in is therefore on Hechey Track's `signpost_3` (Grand Mile), not on the four-armed `signpost_1` the 8.7 example names; the fixture follows.
- **Acceptance, measured 2026-10-31 on groddle.localhost** (Playwright driving the editor's UI, the game's files from the worktree): Mossy Hollow built from an empty draft: New draft with a new hub (an id from 900), Mossy Lane (Meadow, 3,000) and Hollow End (Forest, 2,000), decos placed from the picker by Enter, click and drag, a signpost at each end with arms both ways, the arrivals worked out, the way in from Hechey Track added on its signpost, a population on each street with the planner's spots shown, a line dragged and an exit added on the hub map: 20 of 20 checks, 24 s of interaction, and it validates with no fatal finding, error or warning (7 notes: empty back layers, STY-003). The play-test (`/play/?draft=`) then walked Mossy Lane to its post, took it to Hollow End, walked Hollow End and back to its post, returned to Mossy Lane (arriving at its post), walked the length of Mossy Lane to Hechey Track (arriving at its signpost), and came back in by clicking the new Mossy Lane arm on Hechey Track's signpost: 14 of 14, the real save untouched. New art through the picker's form: taken by intake, its row in the draft, first in the picker, drawn from `/builder-art/`, placed. The draft as built is kept as `tests/fixtures/builder/mossy-hollow-editor.zone.json`; the test drafts and the test art were deleted from the site.

**P5 (2026-10-31).** Where it lives: site `src/BuilderIntake.php` (the checks, pure), `src/BuilderAssets.php` (the rows), `src/AdminBuilderAssets.php` (the routes), `src/BuilderArt.php` (`/builder-art/`); game `tools/builder/style-profile.mjs`, `tools/builder/deco-palette.mjs`, `tools/builder/licence-policy.json`, `public/js/builder/style-rules.js`, `public/js/builder/colour-stats.js` and `public/js/builder/new-art.js`.

- **Intake.** `POST admin/builder/assets` takes `{draft, name, file2, file3?, licence, author, tool?, prompt?, inputs?, role?}` (the table in 8.3 named no draft and no `inputs`; both are needed). It does not write the zone: it answers 201 with the report, the zone's `assets{}` row and the `asset.set` op that puts it in, and the caller sends that op through `drafts/{id}/ops` with If-Match, so intake never races an open editor. A refusal is **422 `builder_asset_refused`** with the report in `data.report`. `GET assets?draft=` lists a draft's art; `GET assets/{sha256 or name}` gives one. No new op was needed (`asset.set` is P1's).
- **The checks**, as 9.1 says, with these readings: the type comes from the bytes; a PNG is walked chunk by chunk (CRCs, IHDR first, IEND last) and a WebP chunk by chunk, and the size is read from the header and refused before GD allocates anything. GD decodes and writes a **lossless WebP**, which is all that is kept, so every chunk but the pixels is gone (a PHP payload in `tEXt`, `zTXt` or `iTXt`, bytes after IEND, EXIF, XMP, colour profiles); the report lists what was stripped. Colour under fully transparent pixels is cleared by compositing onto transparent black. GD keeps alpha in 7 bits. Animated PNGs and WebPs are refused.
- **No alpha is a warn**, not a refusal (the Transparency row; the Format row's "RGBA" is what is kept). For a sky it is info. Every pixel solid in a file with an alpha channel warns the same way.
- **Trim and registration.** Intake trims the top fully and the sides evenly, never the bottom, so the bottom-centre anchor stays where the artist put it; the trim and `registration` (w/2, h of the kept file) are in the report and the row. A visible bottom over 2 px above the file's bottom warns ("floats"); the gap is kept, as a hanging thing may mean it. A 3x file is checked against the 2x as sent (1.5 times, within 1 px) and cropped to 1.5 times the kept 2x.
- **Square edges** compares the visible box's outline: more than 30% of it solid (opacity over half) warns, except for the sky and bg roles.
- **Names.** `gz_` and lowercase words; AI art must be `gz_ai_…` and own work must not be (spec 10). `inputs` are `deco:<library name>` (checked against the library) or `own:<what>`. `CC0-1.0` is the library's licence, so new art cannot claim it.
- **Table.** `groddle_builder_assets` (`minn.json` 0.5.25) is keyed by **name**, with sha256 unique, not by sha256 alone: a gz_ name becomes one file when published, so it is one picture everywhere. The same picture under the same name again answers 200 with the row already kept; the name holding another picture, or the picture under another name, is 409. `report` is mediumtext. At most 200 a draft (413).
- **Provenance cannot be edited.** `BuilderStore::write` checks every `origin: new` row against the kept row (the same values in any key order). An op that changes a maker, a licence or a sha256, or makes up a row for art that never came in, is 422 `builder_invalid`. So AST-003's sha256 check holds on the site, at every write.
- **The art route** is `/builder-art/<sha256>` (`?size=3` for the 3x file), a page route so textures load it with the cookie. It serves only a stored WebP, as `image/webp` with nosniff, `default-src 'none'; sandbox` and `private, no-store`; signed out, not an administrator, the builder off or a miss is the site's 404. No file extension, so no web server answers it from disk.
- **The editor** draws gz_ sprites with the game's own renderer: a URL route in `js/textures.js` sends `assets/decos/groddle/gz_*.png` to `/builder-art/<sha256>` and the names join the renderer's `available` set (2x only for now). The inspector shows a gz_ sprite's provenance (licence, maker, model, prompt, what it was made from, size, sha256) and any policy problem, read-only; that is the only change to `editor.js`.
- **Style profile.** `style-profiles.json` (132 KB, one profile a line) has `default` and one profile per hub with streets (57). Roles are layer-role.js's five, so bg_1, bg_2 and bg_3 are one role; the world's figures match 9.2's where the roles agree (middleground density 0.4 / 27.7 / 86.8). Rules use the hub's band when the hub has at least 5 streets with the role, else the world's. `--show <profile…>` prints bands as text.
- **Palette.** `tools/builder/deco-palette.mjs` measures every library deco once in Chrome (about 45 s, under the browser lock) into `tools/builder/deco-palette.json` (opacity-weighted lightness and saturation, 12 hue bins weighted by opacity times saturation, cover); `style-profile.mjs` weights it by placements, so `--check` needs no browser. `deco-palette --check` catches a deco whose file changed size. The site's port of `colourStats` is held to the JS within 0.01.
- **STY rules.** STY-001 reads a layer's stated role from its name (sky, cloud, star, infinity; fore, fg; bg, back) and checks it against its z, since layer-role.js derives roles from z. Over the shipped streets: STY-001 on 7, STY-004 on 196 (no gradient), STY-005 on none; STY-002 and STY-003 fire on about a fifth of layers by construction (outside p10 to p90).
- **The licence policy** is `tools/builder/licence-policy.json`, mirrored in `js/builder/new-art.js` (`LICENCE_POLICY`, with `provenanceProblems` for AST-004) and in `BuilderIntake::LICENCES`; a test holds the three together.
- **Intake's style check** reads the world's palette bands from the synced build's `style-profiles.json`; until the lead syncs a build that has it, intake skips that info check.
- **Acceptance, measured 2026-10-31 on groddle.localhost:** a good PNG passes (with its 3x); an SVG, a 5,000 px file and a mislabelled 3x are refused, and a file without alpha is warned; a PNG with a PHP payload in a text chunk comes out as a clean lossless WebP; the art draws in the editor and the inspector shows its provenance; a forged provenance edit is refused; bands are printed for Groddle Meadow, Groddle Forest, Alakol, Baqala and Ix; `style-profile --check` passes.

**P4 (2026-10-31).** Where it lives: game `tools/builder/cli.mjs` (the CLI), `sign.mjs` (signing), `worker.mjs` (the builder worker), `render.mjs` (renders in Chrome), `catalog.mjs` (deco search and style profiles), `guide.mjs` (the guide), `limits.mjs`, `admin-session.mjs` and `example-session.mjs` (8.7 as a script), `public/builder-render/` (the render page) and `public/js/builder/overlays.js` (the overlays the render page draws, taken from the editor's); site `src/BuilderKeys.php` (keys, signatures, nonces, rate limits), `src/BuilderAuth.php` and `src/BuilderActor.php` (the one gate), `src/AdminBuilderKeys.php` (keys and purge, session only), `src/AdminBuilderAgent.php` (validate, render, decos, style, guide, publish-request), `src/BuilderWorker.php` (the signed calls to the worker) and `console/builder-keys.js` (keys in the Builder tab).

- **One gate, routes public to the router.** A builder key is not a Minn sign-in, so a `Policy(Access::Cap, 'manage_options')` route would refuse a keyed call before its handler ran. Every builder route (AdminBuilder, AdminBuilderAssets, AdminBuilderKeys, AdminBuilderAgent) is declared `Access::Public` and calls `BuilderAuth::gate($request, $scope)` first: the option, then a request with `X-Groddle-Builder` judged by its key alone, else the session with its REST nonce and `manage_options`. Session-only routes (keys, the play bundle, purge) pass no scope, and a key there is 403 `builder_key_scope`. Nothing else reads the header, so a key at `admin/give` (or any other console route) is a signed-out caller: 401.
- **Scopes by route:** `drafts:read` for the reads (drafts, revisions, assets, decos, style, guide); `drafts:write` for create, replace, ops, restore, archive and publish-request; `assets:write` for intake; `validate`; `render`.
- **The signature** is 8.4's. `query` is the request's pairs sorted by name then value, each part RFC 3986 encoded (PHP `rawurlencode`), joined by `&`, `rest_route` left out; `route` is the REST route without `/wp-json`. A key's secret is the HMAC as hex, over the key's `created_at` as stored (`Y-m-d H:i:s`, UTC). The Builder tab shows it once as the two `builder.env` lines; `GRODDLE_BUILDER_KEY` is `<key id>.<secret>`.
- **The master** is the file the option `groddle_builder_secret_file` names (else `builder.secret` beside the webroot). On groddle.localhost it is `~/.config/groddle/builder.secret` (made with `openssl rand -hex 32`, mode 600, in no repo). The worker's secret is `HMAC(master, "groddle-builder-worker/1")`, so the worker reads the same file and has no secret of its own.
- **Nonces and rates.** `groddle_builder_nonces` gained a `kind` column (write, render, validate, read; `minn.json` 0.5.26 with `groddle_builder_keys`). The rate limits of 12 count a key's nonces of that kind in the last minute, so there is no table of their own. 429 `builder_rate_limited` carries `data.retryAfter`; the `Retry-After` header is set on the routes AdminBuilderAgent answers (validate, render, publish-request), because Minn's `RestError` carries no headers and the draft routes throw it from inside the store.
- **Log.** A keyed write logs the key's creator with `key: <id>`, and a run of saves merges only with that key's own line. Making, revoking and deleting a key are lines of their own.
- **New routes** 8.3 did not list: `DELETE keys/{id}?purge=1` (revoke and delete the row: test keys), `POST drafts/{id}/purge` (an archived draft deleted for good with its revisions and new art; session only; the example session's cleanup). `publish-request` sets the draft's state to `ready`, a fourth state. `POST drafts/{id}/validate` takes `rules` as ids or prefixes and `reach: true` to include the reach map.
- **The worker** takes every call as a signed POST with the stored zone in the body (and, for a render, the new art's 2x files), so it needs no database. It serves its own checkout's `public/` and caches renders by the zone's bytes and the parameters (the same as draft, rev and parameters). `GET /health` is its only unsigned answer. Start it in a game checkout with `node tools/builder/worker.mjs` (127.0.0.1:8794; it refuses 8793).
- **Renders.** Chrome opens `http://builder-render.localhost/builder-render/`, an origin nothing serves: every request is fulfilled from the checkout's `public/` or the art handed in, and anything else is refused. `full` draws every layer where a Wide view at the street's centre puts it, with the sky over the whole street; `camera` takes `x, y` as the world point at the view's centre and `w, h` (960 x 540 by default). Fatal findings block a render except AST-001 (missing art), which the game draws as its placeholder and an agent needs to see. `X-Builder-Findings` counts fatal with error; `X-Builder-Size` is the picture's size. A render takes about 1.3 s cold and 0.4 s warm at 0.25 on Hechey Track.
- **Overlays.** `js/builder/overlays.js` holds the geometry and reach drawing and the colours; the editor and the render page both draw with it. The render page's populations overlay uses P3's `plannedSpots` and `SPOT_GROUPS` (`editor-zone.js`), so its spots and colours are the editor's.
- **The CLI.** Beyond 8.2: `guide`, `sign METHOD ROUTE [BODY]`, `set ... key=` removes a field, `set <street>/<post>/<n>` edits an arm, `ops` fills missing deco ids and adds the library provenance rows the decos need, `new --new-hub` takes the lowest hub id from 900 no other draft holds, the last draft named is remembered (`~/.config/groddle/builder-state.json`), and `GRODDLE_BUILDER_HOME` moves the config folder. `link-world` adds the `edits[]` arm and a post with an arm back on the zone street. `street add` uses P3's templates (`templates.js newStreet`, `newStreetOps`), and `new --new-hub` P3's `newHub` and `nextHubId`; `street fork` into a new hub adds the street's map line too, and `rm <street>` takes it off. `link-world` puts the arm on a shipped post with room (the game draws four arms; the zone's own edits count), the fewest arms first, then the lowest number, and refuses a full `--post`. `arrivals` works every arm's arrival out again (after moving a post or its floor), as connect.set and, for edits, edit.remove and edit.add. Ops 8.3 names but nobody built (`layer.add`, `layer.remove`, `layer.move`, `waiver.*`) are refused before anything is sent, as is any name ops.js does not know.
- **The example session** signs in with a one-time link minted on the machine (`minn login`), makes a key with the session, runs 8.7 with the CLI and the key only, adds a little new art through intake, checks the replay, stale and `admin/give` refusals, and deletes the draft (with its revisions and art) and the key. The key lives in a temporary folder, never in `~/.config/groddle`.
- **Acceptance, measured 2026-10-31 on groddle.localhost after P3 landed:** `example-session.mjs` ran 8.7 in full, 33 of 33 checks: a zone with a new hub (900), two Meadow streets, the ops batch, connect, link-world on Hechey Track's `signpost_3` (and a refusal on the four-armed `signpost_1`), populate, hub map, a `layer.add` refused before it is sent, new art through intake placed on Hollow End, PHY-003 on the ledge from the arrival from Hechey Track (exit 1), renders, the fix (ledge, topper and post down to a 90 px rise, `arrivals`), validate with no fatal finding, error or warning (6 notes), the play address, the publish request signed by `cli sign`; a replayed request 401 `replay`, a signature 120 s old 401 `stale`, the key at `admin/give` 401 and at `keys` 403; then the draft (14 revisions, 1 art row) and the key deleted. No 422 came back (the script keeps any 422's body in `session.json`). Earlier, before P3: the 20th render in a minute was 429 with `Retry-After`. Render golden: Hechey Track at 0.25 matches the stored picture (`tests/fixtures/builder/hechey-track-0.25.png`) within 1%.

**P6 (2026-10-31).** Where it lives: game `tools/builder/zones.mjs` (everything derived from a published zone, through a small file interface so a dry run and the tests work on an overlay or a temporary folder), `tools/builder/publish.mjs` (the gate and the write), `cli.mjs publish`, `tools/builder/build-zones.mjs`, `apply-zone-edits.mjs` and `build-zone-maps.mjs` (each with `--check`), `public/js/zone-streets.js` (how the game tells a zone street from Tiny Speck's), `public/js/deco-new-list.js` (generated) and `tests/zones.test.js`; changes to `build-street-names.mjs`, `build-street-ecology.mjs`, `build-street-navigation.mjs`, `js/street-loader.js`, `js/map-graph.js`, `js/deco-hires.js`, `js/street-render.js`, the three realtime builders that lay out streets, `tools/release/status.mjs` and `tools/qa/online-smoke.mjs`. No site change.

- **Publish** is `cli.mjs publish [<draft id> --rev n | file:<zone.json>] --dry-run | --write [--art <folder>] [--ack <fingerprint|rule|all>,...]`. A draft is pulled at the named rev with the key's `drafts:read`; the gate then runs here, against this checkout: the validator with the publish rules (NAV-004 on), no fatal finding or error, every warning waived in the zone or acknowledged with `--ack`, AST-003 and AST-004 on the new art, TXT-002 against the index. It refuses a checkout with uncommitted changes to tracked files (`--dirty` overrides, for tests and dry runs), and a zone that would take another published zone's streets or hub. Nothing is written until the whole publish is worked out (an overlay), so a refusal leaves the disk alone; `--dry-run` lists the files it would write. After `--write` it runs `build-signpost-graph.mjs`, `data-versions` and, when new art changed `js/deco-new-list.js`, `module-keys`, then says what is left (the builders in order, `npm test`, the commit). It never commits.
- **`baseCommit` is reported, not required.** The gate always validates against the checkout it publishes into, which is what 11's "otherwise re-validate first" asks; a draft made on a commit that is not behind HEAD gets a note saying it was validated again.
- **The zone file is the one source.** `public/assets/zones/<id>.json` is the zone without editor state (`streets[].editor` dropped, stats recomputed); it still passes the schema and the validator. Everything else is derived from it by `buildZones` and checked by `build-zones.mjs --check`: the street files; index rows (label, file, hub, platform and deco counts, and `zone: <id>`); ecology rows (the population as the play-test merges it, the street's label first; `streetCount` stays Tiny Speck's 1,422 and `zoneStreetCount` is added); a new hub's map file shaped as Tiny Speck's, with its `assets/maps/index.json` row; the ways in; the new art's provenance. Deleting a zone file and running `build-zones.mjs` takes all of it out again, byte for byte (a test does this).
- **Tiny Speck's generators keep the zones.** `build-street-names.mjs` merges the zones' index rows (`mergeZoneIndex`), `build-street-ecology.mjs` adds their population rows after its own (`mergeZoneEcology`), and `build-street-navigation.mjs` ends every run, `--only` too, by putting the zones' edits back (`applyZoneEdits`), since its own pass keeps a zone's arm without its `arrive`. The other street scripts skip zone streets already (no XML) or only patch their own rows. `build-hub-maps.mjs` is unchanged: zones never enter `hub-maps-data.js`.
- **Ways in (`apply-zone-edits.mjs`).** Every arm into a zone (any connect to a GZ tsid, and a post that held only such arms) is taken off a shipped street, then each published zone's edits are put back in order with `arrive` worked out again where the zone street's post leading back stands (`arriveFor`, else the edit's own). So a second run changes nothing, an unpublished zone's arms go, and a shipped street with the zone's arms taken off is byte for byte Tiny Speck's. Shipped streets change in no other way (Q3 stays open). `stats.signpostCount` is not touched (an `add-signpost` edit would leave it one short; no zone uses one yet).
- **Hub maps.** `build-zone-maps.mjs` writes `assets/maps/hubs/hub-<id>.json` with no painted art, and the index row carries `zone`. The map's hub picker (`listHubsFromIndex`) leaves zone hubs out unless it is the one on show, so a player in the zone sees its map, and nobody finds it in the world's list of regions. The signpost graph counts the zone's streets as drawn.
- **New art** goes to `assets/decos/groddle/gz_<name>.webp` (and `@1.5x.webp` when intake kept a 3x file) beside the library's, but **not** into `assets/decos/manifest.json` or `js/deco-hires-list.js` as 11 said: those are the deco pipeline's (`tools/deco-pipeline/build.py` rebuilds them from Tiny Speck's SWFs, and its `--check` fails on a name with no SWF), and the deco catalog, the palette and the validator's library are measured from the manifest. Instead `build-zones.mjs` writes `js/deco-new-list.js` (`NEW_DECOS`, `NEW_DECOS_HIRES`) from the published zones; `loadDecoManifest` adds `NEW_DECOS` to the renderer's set and `decoUrl` takes the 3x for `NEW_DECOS_HIRES`. `build.py --check` ignores `gz_` files. `tools/provenance/new-art.json` holds each picture's file, sha256 (and the 3x's), licence, maker, model and prompt for AI art, inputs, intake id and the zones that use it; `tests/g316-provenance.test.js` holds every `gz_` file to a row with its bytes and a licence the policy allows.
- **New art's bytes** come from `--art <folder>` (`<name>.webp` and `<name>@1.5x.webp`, the files intake kept; `/builder-art/` serves them to an administrator), checked against the row's sha256. A builder key could not fetch them then (P7 added the keyed route, and `publish` now fetches through it).
- **What is measured stays Tiny Speck's.** The deco catalog, the style profiles, the validator's calibration list and the restoration report's street and hub counts leave zone streets out, so publishing changes none of them. Tests that count Tiny Speck's streets (street files, item lines, `no_map` flags, rebuilt rooms' hubs, cave streets, ecology rows) count them alone, and the builder tests validate their fixtures against Tiny Speck's world (`loadValidatorContext({ zones: false })`: no zone's index rows, no arm into a zone), so they pass whatever is published. Without that, a published Mossy Hollow fails 13 tests: its labels are the fixtures' (TXT-002, rightly) and its arm fills Hechey Track's `signpost_3`.
- **Forks** leave out a published zone's arms on the shipped street they copy (`zone.js forkStreet`); `street fork` refuses a zone street, and `new --hub` a zone's hub (forking a published zone is `new --from-zone`, later).
- **Solo only (Q6).** `js/street-loader.js` reads the page's mode once: on a multiplayer page it drops the zones' index rows and every arm into a zone (a post left with none goes too), so no way in shows and nothing can travel there. The realtime builders that lay out streets (`build-realtime-objects`, `-quoins`, `-rook`) skip GZ streets and load streets as a multiplayer page does, so the server's data is the same with a zone published; `-foxes` reads only the preserves. A zone street keeps one tsid and one population row, so a later release can drop the filter.
- **Validator.** TXT-002 no longer counts the zone's own index rows (after publishing, its labels are in the index), so a zone published again validates as it did the first time.
- **Release status** lists each published zone under the game's notes: its streets and hub, then its files (zone file, street files, hub map, new art, the shipped streets its ways in are on), each marked new or changed since the tag, unchanged, or not committed.
- **The online smoke check** gained `--game=<dir>` (local only): the game's own paths are answered from a folder, a worktree's `public/` with a zone published in it say, through Playwright routes, while sign-up, saves and the realtime server stay the site's. When that folder has a zone, check 8 runs: the served index lists zone streets, the online page's street index has none, and the shipped streets carrying ways in show no arm into one.
- **`noMap`.** Zone streets carry `noMap` as P3's templates set it (11 says so). In the game that flag is Tiny Speck's own `no_map`: it hides the street's minimap (`js/ui/street-minimap.js` `minimapVisibility`), and the game says "No map: You're on your own" there. Kept as built; asked in 15. (Superseded on 2026-10-31: the lead decided Q11, and templates no longer set it.)
- **Acceptance, measured 2026-10-31 in a throwaway worktree** (Mossy Hollow is test content, so it is not committed): `publish file:tests/fixtures/builder/mossy-hollow-editor.zone.json --write` (rev 13: no fatal finding, error or warning, 7 notes) wrote 8 files (the zone, its two streets, index and ecology rows, hub 904's map and row, the arm on Hechey Track's `signpost_3`) and ran the signpost graph and data-versions; then the builders in order and every `--check` (data-versions, module-keys, play-online, codebase, build-zones, apply-zone-edits, build-zone-maps, deco-catalog, style-profile, deco-palette, signpost graph, build-street-names, the feature room builders, every realtime builder against the server repo: its data unchanged). `npm test` there: 6,694 pass, 0 fail (6,695 tests, the same as the branch). Re-running all 18 street build scripts (layers, navigation, events, names, ecology, jobs, hub maps and the 11 feature tools) changed only the 27 shipped street files they change on main too, none of the zone's; the zone checks stayed current. `release/status.mjs` lists the zone and its five files as not committed. `tests/map-routes.test.js` passes there. The two-player smoke check (`online-smoke.mjs --local --game=<worktree>/public`) passed all 8 checks with a clean cleanup: the served index lists the two zone streets, the online page's index has none and Hechey Track shows no arm into the zone. Solo `/play/` from the worktree, 13 of 13: in from Hechey Track by the new arm on `signpost_3`, arriving at Mossy Lane's post back; the zone's own map on Mossy Lane; Mossy Lane to Hollow End and back; the length of Mossy Lane and out, arriving at `signpost_3`; Groddle Forest's region list without Mossy Hollow; no page errors.
- **Left for later:** the site does not learn that a draft was published (`state: published`, `published_commit`), since that happens when Austin commits; a keyed route for new art's bytes (built in P7); `new --from-zone`.

**Zone ambient effects and the first agent-built zone (2026-10-31, lane VOLCANO).** Where it lives: game `public/js/street-effects.js` (both halves), `public/js/features/zone-effects-feature.js` (the game), `public/js/builder/editor-effects.js` (the editor's inspector and rumble section), the `emitter` kind in `ops.js` and `geometry-handles.js`, the FX rules in `validate.js`, `effect`, `rumble` and `effects` in `cli.mjs`, the `effects` section of the guide, the render page's still and `effects` overlay; site `src/BuilderOps.php` (the ops and the structural check), `src/AdminBuilder.php` (the play bundle's `art`), `src/AdminBuilderAgent.php` (the `effects` overlay, effects' new art sent to renders). The test is `tests/zone-effects.test.js`; `tests/builder-ops.test.js` and `tests/builder-validate.test.js` cover the new op and rules.

- **Effects are data on the street, drawn by the game's own code.** Ops: `emitter.add/remove/set` are the geometry ops' shapes (`emitters[]`, ids `fx_<n>`), and the rumble is a street field (`street.set {rumble}`), so the PHP port needed only its tables and the property test only new cases. Each emitter's sprites are made once (rate times the longest life) and reused; nothing is allocated per frame; an emitter off screen stops. An emitter draws in a container beside its layer's, just above that layer's decos, following the layer's parallax each render; it is not inside the layer, so a layer's colour bake or blur does not reach it (lava and embers draw additive, steam plain). The rumble shakes the camera through `nudgeCamera` (the Rook's shake) with a seeded clock, plays Tiny Speck's `ROCKS_DISAPPEAR` (a 3 s low rocky rumble, the only bass-heavy CC0 sound in the set) as each starts, and makes the effects puff harder while it lasts. Under `prefers-reduced-motion` the camera never moves (the sound still plays) and emitters run at half the rate and 60% of the height.
- **Where they show:** `/play/` and `/play/?draft=` (the feature runs on GZ streets in solo only), the editor (live; an Effects overlay switch; the rumble only on Shake now, since an editor that shook by itself would be no place to work), renders (a still with every emitter puffing 2.2 s in; overlay `effects` marks each emitter and names the rumble), the CLI and the guide. Publishing carries them in the zone and street files; new art an effect uses counts as used (`zones.mjs spritesUsed`).
- **The editor** places an effect like geometry: the Effect button puts a steam vent on the floor at the view centre, its ring drags (an effect on a parallax layer is in that layer's space, so the editor hands `geometry-handles.js` the layers' offsets each frame), Delete, copy and paste work, and the inspector tunes kind, layer, place, rate, size, height, spread, bursts or always on, particle art and hidden. The street's inspector (nothing selected) has the rumble and what the effects cost.
- **Validator:** FX-001 (an effect on a missing layer, error), FX-002 (off its layer, warn), FX-003 (a rumble more than a third of the time or over 16 px, warn), FX-004 (a burst trimmed to its period, info), and PRF-001 over 40 emitters, 400 live particles or 4 Wide views of overdraw (warn at 80%). An effect's particle sprite is checked like a deco's (AST-001, AST-002).
- **Fixes found by building Mount Ashomel through the CLI** (the friction log is in the lane's report):
  - a draft's new art never drew on the layers behind the middleground (editor, renders, play-test): those layers load their 2x files `{ raw: true }`, which skipped every URL route, including new art's to `/builder-art/`. `textures.js` routes may now apply to raw loads (`addUrlRoute(name, fn, { raw: true })`), and new art's does;
  - the play-test did not draw a draft's new art at all: the play bundle now carries `art` (name and sha256 of each `origin: new` row) and `draft-play.js useDraftArt` adds the names to the renderer's set and installs the `/builder-art/` route;
  - `cli.mjs ladder` made ladders that draw nothing (a ladder is only a climb zone without `tiling`, and most of Tiny Speck's have a ladder deco instead): it now tiles Tiny Speck's basic wood by default (`--tiling wood|stone|none`);
  - `cli.mjs place` sized the zone's own art at 100 by 100 (it has no catalog row): it now takes half the kept 2x size from the art's intake row;
  - a render's `layers` list could not hide the middleground (the renderer always builds it): the render page now hides every container not named;
  - `publish` without `--art` called every piece's file a mismatch (AST-003 "does not match its provenance"); a missing file now says it is not at hand and how to give it;
  - there was no way to list a draft's art with the sizes intake kept (it trims transparent tops and sides, which moves a topper's surface): `cli.mjs assets`.
- **Mount Ashomel** (draft `mount-ashomel` on groddle.localhost, not published): a new hub (900) of four Tall streets climbing a volcano (Cindra Foothold, Hoffo Zigzag, Grumblo Ledges, Ashomel Rim), linked from Tahli's Paaviri Vent, built with a builder key and the CLI only, with 27 pieces of original art drawn in code (`tools/builder/art/volcano/`, SVG rendered with `rsvg-convert`, CC0 1.0, provenance `ai-generated` naming Claude and the scripts) brought in through intake. It validates with no fatal finding, error or warning, and `publish --dry-run` writes 39 files. It was played by keyboard bottom to top and back in `/play/?draft=`.

**P7 follow-ups (2026-10-31, lane BUILD7).** The open items the VOLCANO run found.

- **A builder key fetches new art's bytes.** `GET admin/builder/drafts/{id}/art/{sha256}[?size=3]` (site `AdminBuilderAssets::file`) answers the kept WebP with `/builder-art/`'s headers. It takes `drafts:read`, is signed like every keyed call, counts in a new rate bucket `art` (300 a minute: a zone of 200 pieces with their 3x files fits in two minutes; `BuilderKeys::RATES`, `limits.mjs`), and logs a keyed run of fetches as one line per key, draft and 10 minutes. It hands out only art the draft's zone names (an `origin: new` row with that sha256 under the kept name) or that the caller sent into that draft (intake's `created_by`, before its `asset.set` op); anything else is 404 `builder_not_found`, so a key cannot read another draft's art by its hash. `cli.mjs publish <draft>` now fetches the art it needs this way into a temporary folder (a 404 on `?size=3` means no 3x file; a 429 waits its `Retry-After`), and `--art <folder>` stays the offline path (and the only one for `file:` zones).

- **A signpost and its floor.** `public/js/builder/posts.js` (pure; the CLI, the editor and the validator share it) finds the floor a post stands on: the nearest standable line within 80 px of its foot (as `platformYNear` finds an arrival's ground), else the first under it. A post the builder makes stands on the line; Tiny Speck's posts stand 1 to 47 px over theirs (2,715 shipped posts: median 16, p99 47), so a forked street is allowed 48 px over and 8 under, a built one 4 either way, and buried posts are left alone.
  - **The finding names the post.** A new rule, **PHY-009** (warn, zone streets only), names a post off its floor. When an arm lands at a post (the arrival is at the post's x and the post leads back) and there is no floor under the arrival, PHY-001 is now at the post (`lane/signpost_1`, "floats 40 px over its floor (plat_2). The arm from end/signpost_1 lands there ...") when the post is off its floor, and says "still lands where signpost_1 stood" when only the arm is stale. 8.2 listed no PHY-009; the rule table has it now.
  - **Resettling.** `cli.mjs arrivals --posts` stands every off-floor post on its floor, then works out the arms on every street that land at them (`settlePostOps`, then `arrivalOps`, which moved from `cli.mjs` into `posts.js` and gained `into`). The editor's signpost inspector says when a post is off its floor and offers **Stand it on the floor** (one undo step with the arms landing there).
  - **A line carries its posts.** When a platform moves (the editor's drag, handles, arrows and inspector; `cli.mjs set` on a line), the posts standing on it move with it, keeping their height over it, and the arms landing on that street are worked out again, in the same batch (`followPostOps`). `set --no-carry` keeps the old behaviour. So 8.7's fix is now one `set` on the ledge (the post comes along and the arm lands there again) and the topper's; `arrivals --posts` then has nothing to do, and `example-session.mjs` checks that (the revs in 8.7 moved down by two).
- **The Tall template's back layers reach the floor.** P3 read "Vertical Parallax" as back layers shorter than the street in the same ratio as they are narrower (the sky 75%, bg_1 90% of 2,400 px), so a back layer's bottom rode up to 300 px over the floor in a render of the whole street and in the editor's layout view (in play the floor is in view only near the bottom, where the layer's bottom meets it). Tiny Speck's tall streets do it differently: measured over the 203 streets 1,800 px or taller (950 back layers), a back layer's height is 92% to 100% of the street's (median 99% at z -1, 98% at -2, 95-97% deeper) whatever its width; Janagi Elations (GA911QQIDI32J6R, 2,700 high) has 2,646, 2,592 and 2,511. Their art is laid down to and past the layer's bottom. So the Tall template now takes each back layer's height by its depth (`templates.js tallLayerHeight`: 1% a step of z, at most 4% and at most 120 px, twice the floor's 60 px), which keeps the bottom under the floor line wherever the floor is in view and in a full render (the camera at the street's middle); widths and filters are unchanged. `tests/builder-zones.test.js` checks it through the game's own `parallaxLayerOffset`. Drafts made before keep their layers (Mount Ashomel's, for one); `set <street>/<layer> h=<n>` changes one.
- **Landings a keyboard player misses (PHY-006).** P2's tight-jump margin was the height to spare only, and every running jump started at full speed. Now (`reach-graph.js`):
  - **Run-up.** A running jump starts at the speed a run from a standstill reaches over the floor behind it (to a wall or a free line end; a joined end runs on), stepped with the game's own `steerX` (`runUpSpeed`; a full run needs about 20 px). Airborne, holding toward, the avatar catches up most of a slow start (a 6 px run-up lands about 3 px shorter), so this changes little.
  - **The keyboard player.** A jump from a stand point onto another floor is tried again from eight takeoffs spread over 12 px either way (about 2.7 frames early or late at a full run); an air jump after walking off a ledge with the press 1 to 3 frames early or late. A takeoff past the end of its floor is taken at that end (the game's 90 ms coyote time forgives a late press there). If both widest tries land the rest are taken to; under the bar, takeoffs 4 and 8 px either side are tried too and the best spot counts. A landing that **fewer than 60%** of the tries make is tight. A plain walk-off and a ladder hop are judged by height only (a player steers them all the way down). An edge's score is the smaller of (height to spare / 8 px) and (share landing / 60%); the widest-path search keeps each route's tightest, and PHY-006 fires when every route to an exit scores under 1, naming the jump, its kind (`data.kind` height or landing) and the share.
  - **What the game does that the model now knows:** the ground resolve stands a falling avatar on a line up to 8 px beyond its end and steps it up to 16 px, so even an 8 px ledge at the same height is landed by all eight takeoffs, and VOLCANO's 30 px overlaps (ledges 90 px apart) are comfortable: a jump held toward the upper ledge, from anywhere in the last 140 px of the lower one, lands 45 px or more onto it. The play-through that missed one used a straight-up jump from inside the overlap, and that jump is tight (4 of 8). What the rule now catches is a route with no such alternative: a ledge reached only by a straight-up jump at a ledge's end under a roof (`tests/builder-p7.test.js`).
  - **Calibrated in the real game** (`/play/` served from the worktree, the keyboard player in the page frame by frame, `groddleQA.placeAvatar` to set each try down): edges the model calls tight were sampled at random from 440 shipped streets (every third; 51,231 tight edges, the tightest per pair of floors and kind), 5 each of straight-up, held, running and air jumps, and each try was played with real key presses. A first sample at a 75% bar (seed 7) had 3 of 20 that the game made 75% of the time or more (borderline 5-of-8 landings), so the bar went to 60%. **A fresh sample at 60% (seed 11): 0 of 20 false** (the game made under 75% of the tries on all 20; 4 of them made 60-67%), and 5 of 6 controls (edges the model calls comfortable) were made by every try; the sixth (a running jump on Yokel Yarn 2) the in-page player could not set up, and the stepper run from the takeoff it actually made agreed. Try by try, the game and the stepper run from the takeoff the game made agree on 173 of 198 (87%); the differences are running and air jumps where the in-page player pressed a frame off.
  - **Calibration over all 1,460 shipped streets** (`calibrate.mjs`, which now keeps PHY-006 findings too, with their kind, and samples by `--rule`/`--kind`): PHY-003 207 → 206 (in the model 113 → 112: Vindel Frowns (GCR13974F4220EH) `signpost_2` is now reached: the run-up is the only change to what the model reaches, so a running jump that starts slower lands there), PHY-004 26 → 26, PHY-005 1,926 → 1,926, PHY-006 144 → 146 (in the model 124, all by height; no shipped exit needs a landing the keyboard player misses). It takes 1.5 to 3 minutes on 7 workers (was 38 s).
- **Scripted play-testing for agents** (6.8): `tools/builder/playtest.mjs` and `reach-graph.js reachRoutes` (routes as steps to play back: walk, jump, running jump, walk-off, air jump, ladder; a hop along one floor costs more than walking it); the QA hooks and keys are in 6.8 and the guide's new `playtest`, `posts` and `reach.keyboard` sections. A draft play-test no longer offers quests (`questoffer=now` brings them back).
- **Smaller VOLCANO items.**
  - `asset add` takes several files in one call (8.2); intake on the site is still one file a request, and the `asset.set` ops go in as one batch (a refusal part way keeps the ones before it and says so).
  - **The template's sky filters.** The Tall template's sky carries the world's median sky filters (brightness -14, contrast -18, saturation -43), made for Tiny Speck's painted art. They stay (they are measured), but `place` of the zone's own art on a filtered layer now says so and prints the `set <street>/<layer> filters=...` that halves them (or `filters=` to clear them).
  - **The worker** loads the validator once. It now notes the builder's and the game's modules' times at start: `GET /health` says `stale` (with the files), every answer carries `X-Builder-Worker-Stale: 1`, and it logs it once. `node tools/builder/worker.mjs --restart` stops the worker its pid file (`~/.config/groddle/builder-worker.pid`) names and starts again; `node --watch tools/builder/worker.mjs` restarts by itself.
  - `connect` takes `--a-at x`, `--b-at x` and `--a-floor`, `--b-floor` (`highest`, the default, `lowest`, or a line id) for where each new post stands.
- **Checked live on groddle.localhost** (the site theme pointed at the P7 site worktree under the lock, the worker from the P7 game worktree; a throwaway draft `p7-check` and key, deleted afterwards with the draft's 16 revisions and 2 pieces of art): a Tall street's back layers 2,304 and 2,352 of 2,400; two own-work pieces in one `asset add` (one with its 3x beside it); the filter note on the Tall sky; `connect --a-at 750 --a-floor plat_2`; `set` on the ledge carrying its post and its arm; `--no-carry`, then validate (through the worker) naming the post ("floats 20 px over its floor"); `arrivals --posts`; `publish p7-check --dry-run` with no `--art` and no session ("Fetched 2 pieces of new art with the key (1 with a 3x file)", 13 files); the art route giving the draft's art and its 3x as `image/webp` with the closed CSP, and 404 for Mount Ashomel's art asked through `p7-check`; the editor's "Stand it on the floor" by keyboard (light and dark, no page errors) moving a post 10 px under its floor onto it, saved, with the arm into it worked out again; `playtest.mjs` on both streets (every exit reached, no quest offer, no page errors); `worker.mjs --restart` after a code change (stale before, fresh after). After the rebase, `example-session.mjs` (8.7 with the one-`set` fix) ran 33 of 33 and deleted its draft and key.
- **Mount Ashomel under the new rules** (read only, rev 97, not changed): no fatal finding, error or warning, as before (7 notes); no post off its floor; every exit's tightest route lands all eight keyboard tries. Its ledges as first laid out (30 px narrower each side) also validate clean: the model says a jump held toward the next ledge makes them.
- **Deviations:** the art route is `drafts/{id}/art/{sha}` under the draft, not under `assets/`; PHY-006 by landing uses a 60% bar where the brief asked for "realistically misses"; ports 9080-9089 were all held by FrankenPHP, so the play-tests served the worktree on a free port the OS picked.

---

## 15. Open questions for Austin

### Decided 2026-10-30

Numbered as they were asked.

- **Q1, licence for new art:** "anything as open license as we can". New art, whether Austin's own work or AI-generated, ships under CC0 1.0, with every asset's provenance recorded: who or what made it, and from what inputs. Inputs must be CC0 or Austin's own. Section 10 has the policy; the validator's licence rule (AST-004) checks provenance and CC0 and no longer blocks AI art.
- **Q5, the world map and badges:** new zones are just new content. They stay off the world map (`noMap`) and do not count toward Completist badges (`hub-maps-data.js` is not merged). **Future work:** zones may get a map system of their own later, with links to the existing world.
- **Q6, multiplayer:** "potentially". Not in the first release: zones are solo only, and `/play/online/` never sees them. The design keeps it possible later: each zone street has one tsid and one population row, so the per-street realtime builders (`build-realtime-*.mjs`) can run over zone streets in a later release (section 11).
- **Q7, agent keys:** local agents only for now. Builder keys (8.4) are for agents on Austin's machine; a remote connector waits for a later decision. The 30-day default expiry stands.
- **Q8, the reach standard:** the remake's 105 px jump, so the validator matches what players can actually do (2.3, 7.4).

### Decided by the lead, 2026-10-31 (Austin can overrule)

- **Q11, a zone street's minimap:** zone streets show their street minimap. Austin's Q5 "off the world map" means the world map, the region lists and Completist, not the minimap on each street; a vertical climb needs its minimap. Templates no longer set `noMap` (`js/builder/templates.js`), and the zone markers P6 added (the `zone` field on index and hub map rows, `js/zone-streets.js`, `listHubsFromIndex`) keep zones off the world map and the region list. `noMap` stays a field an author may set on purpose, as Tiny Speck did on caves; drafts and fixtures made before this keep theirs.
- **Q12, zone ambient effects:** builder streets may carry steam vents, lava squirts and embers (`emitters[]`) and an earthquake `rumble` (section 4). These are zone content, placed and tuned like decos; they are **not** location events. They need no GSJS action list and no event scripting, so Q9 (events) stays open and untouched. The game plays them on zone streets only, in solo only; no shipped street has them, and `/play/online/` never sees a zone.

### Still open

The lead's defaults for P0 and P1 are in brackets; they hold until Austin answers.

2. **Where the builder runs.** groddle.localhost only (recommended until P6), or also on groddleafternoon.com's console? Live drafts would sit in the production database, and render and validate would need a worker there. [groddle.localhost only: the Builder tab, `/console/builder/` and every builder route are behind the site option `groddle_builder_enabled`, on locally and off when unset, so a release ships it dark.]
3. **Edits to shipped streets.** Forks only, plus new connects (recommended)? Or should fixes to Tiny Speck's own streets be published too? That needs a patch layer applied after the XML builders. [Forks plus new connects: P1 forks a shipped street into a draft and never edits a shipped file.]
4. **Ids.** GZ + 13 for new street tsids, and hub ids 900-999 for new hubs: fine? [Used as written.]
9. **Events.** Should the builder ever author location events (the GSJS `admin_events_*` model), or should zones stay event-free? (Zone ambient effects, Q12, are not events and do not answer this.)
10. **Names.** Should builder street and hub names follow a naming guide (Tiny Speck's style of invented names), and should TXT-002 also refuse names close to a shipped one?
11. *(Decided by the lead on 2026-10-31, above: zone streets show their minimap.)*
