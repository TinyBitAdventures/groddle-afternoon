# Level builder: design spec

Status: approved 2026-10-30; phases P0 and P1 built (see 14.1 for what was built and where it deviates). Five of the open questions are decided (section 15).

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
| PHY-006 | warn | Tight jump | A required edge has under 8 px of margin (rise or gap) |
| PHY-007 | info | Unreachable area | Standable surfaces no arrival reaches (fine for scenery; listed) |
| PHY-008 | warn | Ladder with no deck | No `isStandable` line at the bottom, or `ladderTopDeck` finds none at the top (`street-model.js:463-475`) |
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
| PRF-001 | warn / error | Too heavy | Over the limits in section 12 (warn at 80%, error over) |

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
   - Each edge keeps its margin: how much higher or wider the jump could have been. That margin feeds PHY-006.

**One stepper, shared with the game.** In phase 2 the stepper is a copy of the physics constants with a parity test:

- it must reproduce the 105 px apex and the 198 px running jump;
- its arcs must match `?physicsdemo=1&physicsautoplay=jump` on the normal street to within 2 px.

Phase 2 also extracts the airborne step from `game.js physics()` into `public/js/avatar-step.js`, which both the game and the validator use. That is a careful refactor of the game, covered by the movement tests and the physics QA route.

**Limits** (stated in every report header):

- **Plain jump only.** No triple jump (it needs Imagination upgrades), no coyote time (90 ms) and no jump buffer. So "reachable" means reachable by a new player.
- **Sampled, not exhaustive.** Mid-air steering is "hold toward" only. A path that needs a reversal in the air can be missed, which gives a false "unreachable". That is why waivers exist.
- **Fixed 60 fps steps.** At low fps the game steps by up to 2.5 frames (FRAME_DT_CAP), which bends arcs slightly. PHY-006's 8 px margin covers it.
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
| `set <street>/<id> key=value …`, `rm <street>/<id>` | Edit or remove anything by id |
| `platform --street k --from x,y --to x,y [--perm floor\|roof\|soft\|hard]` | Add a line |
| `wall`, `ladder`, `signpost --street k --x --y` | Add geometry |
| `connect <streetA> <streetB> [--a-post id] [--b-post id]` | Two-way connects, arrivals computed |
| `link-world <street> --from <shipped tsid> [--post id]` | Add the `edits[]` connect from a shipped street |
| `populate --street k npc_piggy=2 trant_fruit=1 [--quoins 6]` | Set the population |
| `hub map --street k --line x1,y1,x2,y2` | Draw the hub map |
| `ops <file.json>` | Apply a batch of ops atomically |
| `decos <query> [--layer sky] [--hub 58] [--limit 20]` | Search the deco catalog |
| `style [hub-58\|default]` | Print a style profile |
| `validate [--rule PHY-*]` | Findings; exit 1 on error or fatal |
| `render --street k [--view full\|camera] [--x --y] [--scale 0.25] [--overlay geometry,reach,findings] --out f.png` | PNG |
| `asset add <file> --name gz_x --licence own-work-CC0\|ai-generated [--author --tool --prompt]` | Intake (9.1) |
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
| GET/POST/DELETE `keys` | (cookie only, never a key) | builder keys |

**Op names:**

- `street.add`, `street.set`, `street.remove`;
- `layer.add`, `layer.set`, `layer.remove`, `layer.move`;
- `deco.add`, `deco.set`, `deco.remove`, `deco.move` (re-layer);
- `platform.*`, `barrier.*`, `ladder.*`, `signpost.*`, `connect.add`, `connect.remove`;
- `population.set`, `hub.set`, `hubmap.set`, `edit.add`, `edit.remove`, `waiver.add`, `waiver.remove`.

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
| `overlay` | any of `geometry`, `reach`, `findings` (rule ids drawn at their `where`), `arrivals`, `populations`, `grid` (100 px world grid with labels, so an agent can read coordinates off the picture) |
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

$ node tools/builder/cli.mjs style hub-58 --json | jq '.layers.sky'
{"z":-3,"w":0.75,"h":1,"filters":{"saturation":[-83,-46,-15],"blur":[2,3,5]},"density":[1.25,4,16]}

$ node tools/builder/cli.mjs street add --draft mossy-hollow --key lane --label "Mossy Lane" \
    --template meadow --width 3000 --json
{"rev":2,"street":"GZ0000000000001","layers":["sky","bg_1","middleground","middleplus"]}
$ node tools/builder/cli.mjs street add --draft mossy-hollow --key end --label "Hollow End" \
    --template meadow --width 2000 --json
{"rev":3,"street":"GZ0000000000002"}

$ node tools/builder/cli.mjs decos "bush" --layer middleground --hub 58 --limit 3 --json
[{"name":"bush_3","placements":10700,"drawn":{"w_med":160,"h_med":90}}, …]

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
{"rev":4,"changed":["lane/plat_2","lane/d_14","end/d_9"],"findings":{"error":0,"warn":0}}

$ node tools/builder/cli.mjs connect lane end --json            # a post at each facing end, on its highest floor
{"rev":5,"posts":["lane/signpost_1","end/signpost_1"]}
$ node tools/builder/cli.mjs link-world lane --from GLI2V0UN7RD1T2J --json   # an arm on Hechey Track
{"rev":6,"edits":1}

$ node tools/builder/cli.mjs validate --draft mossy-hollow --json
{"ok":false,"rev":6,"counts":{"fatal":0,"error":1,"warn":0,"info":2},"findings":[
 {"rule":"PHY-003","severity":"error","at":"lane/signpost_1","message":"Signpost signpost_1 (to Hollow End) cannot be reached from the arrival at 150, 940.",
  "data":{"closest":{"x":2700,"y":940,"rise":132,"jump":105}},"fix":"Lower the ledge under the post to 100 px or less above the floor, or add a ladder."},
 {"rule":"NAV-005","severity":"info", …}]}

$ node tools/builder/cli.mjs render --draft mossy-hollow --street lane --scale 0.25 \
    --overlay geometry,reach,findings,grid --out lane.png
lane.png 750x250  rev 6  findings 1 error, 1 warn
# The agent looks at lane.png: the post stands on the new ledge, 132 px over the floor, with no way up.

$ node tools/builder/cli.mjs set lane/plat_2 y1=-150 y2=-150 --draft mossy-hollow --json   # 90 px rise
{"rev":7}
$ node tools/builder/cli.mjs validate --draft mossy-hollow --json | jq .counts
{"fatal":0,"error":0,"warn":0,"info":2}

$ node tools/builder/cli.mjs play --draft mossy-hollow --street lane
https://groddle.localhost/play/?practice=1&autostart=1&draft=mossy-hollow&street=lane
$ curl -s -X POST "$GRODDLE_BUILDER_URL/wp-json/groddle/v1/admin/builder/drafts/mossy-hollow/publish-request" \
    -H "X-Groddle-Builder: $(node tools/builder/cli.mjs sign POST /groddle/v1/admin/builder/drafts/mossy-hollow/publish-request '{"note":"ready"}')" \
    -H 'Content-Type: application/json' -d '{"note":"ready"}'
{"state":"ready","rev":7}
```

Austin then play-tests it, and runs `publish --write` in a clean worktree (section 11). The zone document at rev 7 looks like this (shortened; the full form passes the schema):

```json
{
  "format": "groddle-zone/1", "id": "mossy-hollow", "title": "Mossy Hollow", "rev": 7,
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
        "signposts": [ { "id": "signpost_1", "x": 1350, "y": -60, "w": 100, "h": 200, "connects": [
          { "tsid": "GZ0000000000002", "label": "Hollow End", "hub_id": "900", "arrive": { "x": 150, "y": 940 } } ] } ],
        "stats": { "platformCount": 1, "layerCount": 1, "decoCount": 1, "signpostCount": 1 } },
      "population": { "counts": { "npc_piggy": 2, "trant_fruit": 1 }, "quoins": 6 } }
  ],
  "edits": [ { "tsid": "GLI2V0UN7RD1T2J", "op": "add-connect", "signpost": "signpost_1",
    "connect": { "tsid": "GZ0000000000001", "label": "Mossy Lane", "hub_id": "900", "arrive": { "x": 150, "y": 940 } } } ],
  "assets": { "patch_dirt_2a": { "origin": "tinyspeck-cc0", "licence": "CC0-1.0", "source": "groddle1.swf#patch_dirt_2a" } }
}
```

Phase 4's acceptance test is this session as a script (`tools/builder/example-session.mjs`), run against groddle.localhost. It deletes its draft and key afterwards.

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
   | `build-hub-maps.mjs` | nothing: zones stay off the world map and out of Completist counting (decided, section 15). Their streets carry `noMap` |
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
| API rate per key | 120 writes/min, 20 renders/min, 60 validates/min | 429 |
| Asset intake | 8 MB upload, 4096 px a side, 200 new assets per zone | 9.1 |

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

---

## 15. Open questions for Austin

### Decided 2026-10-30

Numbered as they were asked.

- **Q1, licence for new art:** "anything as open license as we can". New art, whether Austin's own work or AI-generated, ships under CC0 1.0, with every asset's provenance recorded: who or what made it, and from what inputs. Inputs must be CC0 or Austin's own. Section 10 has the policy; the validator's licence rule (AST-004) checks provenance and CC0 and no longer blocks AI art.
- **Q5, the world map and badges:** new zones are just new content. They stay off the world map (`noMap`) and do not count toward Completist badges (`hub-maps-data.js` is not merged). **Future work:** zones may get a map system of their own later, with links to the existing world.
- **Q6, multiplayer:** "potentially". Not in the first release: zones are solo only, and `/play/online/` never sees them. The design keeps it possible later: each zone street has one tsid and one population row, so the per-street realtime builders (`build-realtime-*.mjs`) can run over zone streets in a later release (section 11).
- **Q7, agent keys:** local agents only for now. Builder keys (8.4) are for agents on Austin's machine; a remote connector waits for a later decision. The 30-day default expiry stands.
- **Q8, the reach standard:** the remake's 105 px jump, so the validator matches what players can actually do (2.3, 7.4).

### Still open

The lead's defaults for P0 and P1 are in brackets; they hold until Austin answers.

2. **Where the builder runs.** groddle.localhost only (recommended until P6), or also on groddleafternoon.com's console? Live drafts would sit in the production database, and render and validate would need a worker there. [groddle.localhost only: the Builder tab, `/console/builder/` and every builder route are behind the site option `groddle_builder_enabled`, on locally and off when unset, so a release ships it dark.]
3. **Edits to shipped streets.** Forks only, plus new connects (recommended)? Or should fixes to Tiny Speck's own streets be published too? That needs a patch layer applied after the XML builders. [Forks plus new connects: P1 forks a shipped street into a draft and never edits a shipped file.]
4. **Ids.** GZ + 13 for new street tsids, and hub ids 900-999 for new hubs: fine? [Used as written.]
9. **Events.** Should the builder ever author location events (the GSJS `admin_events_*` model), or should zones stay event-free?
10. **Names.** Should builder street and hub names follow a naming guide (Tiny Speck's style of invented names), and should TXT-002 also refuse names close to a shipped one?
