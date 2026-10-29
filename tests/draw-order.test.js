/**
 * Draw order among the things on a street (LAYERS2, after G410's front layers). The client's
 * middleground renderer stacks its holders in one fixed order (MiddleGroundRenderer.setupEndShapes
 * 111-171): decos, then the item holders (background, normal, foreground items: every NPC is an
 * item), then other players' avatars, overlays below your avatar, your avatar, the foremost items
 * (only the Crusher, Item.as 436-440) and front/ceiling furniture. In the remake the player's body
 * is zIndex 50 in the entity layer, so world items and NPCs sit under 49, other players between 49
 * and 50 in arrival order, and only worn or carried things, effects and the Crusher above 50.
 * LAYERS3: ceiling furniture hangs over the avatars (FG_FURN), the newest window is on top
 * (TSMainView.addView), and player and item overlays draw in the overlay holder, over a street's
 * front layers (AnnouncementController.addItemOrPcOverlayWhereItGoes 495-540).
 * Run: node --test tests/draw-order.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remoteAvatarZ } from '../public/js/features/realtime-feature.js?v=g413-1';
import { FRONT_FURNITURE_SLOTS, furnitureDrawsInFront } from '../public/js/home-decor.js?v=g418-1';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js';
import { SCREEN_SELECTOR, WINDOW_SELECTOR, stackZ } from '../public/js/window-stack.js?v=g418-1';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const clientRoot = join(here, '../../glitch-client/com/tinyspeck/engine');
const PLAYER_Z = 50;

/** The first `<name>.zIndex = n` after `marker` in `src`. */
function zAfter(src, marker, name = 'sprite') {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, `marker not found: ${marker}`);
  const m = new RegExp(`\\b${name}\\.zIndex = (\\d+(?:\\.\\d+)?)`).exec(src.slice(at, at + 1600));
  assert.ok(m, `no zIndex after ${marker}`);
  return Number(m[1]);
}

describe('the client stacks items, other players, your avatar and the foremost items', { skip: !existsSync(clientRoot) && 'glitch-client not beside the repo' }, () => {
  it('MiddleGroundRenderer adds its holders in that order', () => {
    const src = readFileSync(join(clientRoot, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    const setup = src.slice(src.indexOf('override protected function setupEndShapes'));
    const order = ['BG_ITEM', 'NRM_ITEM', 'FG_ITEM', 'OTHER_AV', 'OV_BELOW_YOUR_PLAYER', 'YOUR_AVATAR', 'FOREMOST_ITEMS', 'FG_FURN']
      .map((name) => setup.indexOf(`addChild(${name})`));
    assert.ok(order.every((i) => i > 0), 'every holder is added');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in this order');
    // Other players go in under the marker one after another, so the newest draws on top.
    assert.match(src, /addOtherAvatar\(pc:PC\):void \{[\s\S]{0,120}addUnder\(pcView, OTHER_AV\)/);
  });

  it('only the Crusher is a foremost item', () => {
    const item = readFileSync(join(clientRoot, 'data/item/Item.as'), 'utf8');
    const sets = [...item.matchAll(/in_foremostground = true/g)];
    assert.equal(sets.length, 1);
    assert.match(item, /if \(item\.tsid == 'crusher'\) \{\s*item\.in_foremostground = true;/);
  });
});

describe('world items and NPCs draw under the player', () => {
  const game = read('public/game.js');
  for (const [what, marker, name] of [
    ['Mr. Hairball (npc_dustbunny)', 'function spawnMrHairball()'],
    ['the Rook Egg (rook_egg, in_background)', 'function spawnRookEgg()'],
    ['the museum speakers (rook_hall_speaker)', 'function makeRookMuseumSpeaker(exhibit)'],
    ['Greeterbot Sentry G-42', 'function spawnRookMuseumGreeter()'],
    ["Storyland's wall buttons (wall_button)", "root.name = `greedy-story-act-${actIndex + 1}`;", 'root'],
    ["Storyland's exit sign", "root.label = 'greedy-story-exit';", 'root'],
  ]) {
    it(what, () => assert.ok(zAfter(game, marker, name) < 49, `${what} z ${zAfter(game, marker, name)}`));
  }

  it('fireflies, the courier frog and racing cubimals (in_foreground items)', () => {
    const nodes = read('public/js/features/resource-nodes-feature.js');
    assert.ok(Number(/firefly: (\d+)/.exec(nodes)[1]) < 49);
    assert.ok(Number(/const FROG_Z = (\d+);/.exec(read('public/js/features/mail-courier-feature.js'))[1]) < 49);
    assert.ok(Number(/const RACER_Z = (\d+);/.exec(read('public/js/features/cubimal-race-feature.js'))[1]) < 49);
  });

  it('remote players sit under your avatar and over the items, the newest arrival on top', () => {
    const zs = [0, 1, 2, 50, 8999].map(remoteAvatarZ);
    assert.ok(zs.every((z) => z >= 49 && z < PLAYER_Z), zs.join(','));
    for (let i = 1; i < zs.length; i += 1) assert.ok(zs[i] > zs[i - 1]);
    assert.match(read('public/js/features/realtime-feature.js'), /root\.zIndex = remoteAvatarZ\(arrivals\+\+\)/);
  });
});

describe('worn, carried and foremost things draw over the player', () => {
  const game = read('public/game.js');
  it('the Crushers (the one in_foremostground item)', () => {
    assert.ok(zAfter(game, 'function drawRookCrusher(spec)', 'root') > PLAYER_Z);
  });
  it('the hog-tied piggy you carry in the Hog Haul', () => {
    assert.match(game, /hogHaulCarrySprite\.zIndex = 100;/);
    assert.match(read('public/js/features/hog-haul-mp-feature.js'), /spr\.zIndex = 100;/);
  });
  it('the Game of Crowns crown over its holder', () => {
    const crowns = read('public/js/features/crowns-feature.js');
    assert.ok([...crowns.matchAll(/crownSprite\.zIndex = (\d+);/g)].every((m) => Number(m[1]) > PLAYER_Z));
  });
});

describe('speech bubbles', () => {
  it('are opaque, so a hint chip or another bubble never shows through', () => {
    const game = read('public/game.js');
    assert.match(game, /const SPEECH_FILL_ALPHA = 1;/);
    assert.doesNotMatch(game, /fill\(\{ color: 0xfffdf5, alpha: 0\.97 \}\)/);
  });
});

describe('ceiling furniture hangs over the avatars (FG_FURN)', () => {
  it('the client puts front and ceiling plats in the foreground furniture holder', { skip: !existsSync(clientRoot) && 'glitch-client not beside the repo' }, () => {
    const loc = readFileSync(join(clientRoot, 'view/renderer/LocationRenderer.as'), 'utf8');
    assert.match(loc, /placement_userdeco_set == 'front'\) \{\s*mgr\.addForegroundFurnitureItem\(lis\);/);
    assert.match(loc, /placement_userdeco_set == 'ceiling'\) \{[\s\S]{0,220}mgr\.addForegroundFurnitureItem\(lis\);/);
  });

  it('every ceiling class, and only those slots, draws in front', () => {
    assert.deepEqual([...FRONT_FURNITURE_SLOTS], ['ceiling', 'front']);
    const ceiling = Object.values(FURNITURE_CATALOG).filter((def) => def.placementSet?.includes('ceiling')).map((def) => def.classTsid).sort();
    assert.deepEqual(ceiling, ['furniture_ceilingdeco', 'furniture_ceilinglamp', 'furniture_lamp']);
    for (const cls of ceiling) assert.equal(FURNITURE_CATALOG[cls].slot, 'ceiling', cls);
    assert.equal(furnitureDrawsInFront({ slot: 'ceiling' }), true);
    for (const slot of ['floor', 'wall', 'rug']) assert.equal(furnitureDrawsInFront({ slot }), false, slot);
  });

  it('the front holder sits over you, other players and worn things, in your house and on a visit', () => {
    const homes = read('public/js/features/homes-feature.js');
    const frontZ = Number(/const FURNITURE_FRONT_Z = (\d+);/.exec(homes)[1]);
    assert.ok(frontZ > PLAYER_Z && frontZ > remoteAvatarZ(8999) && frontZ > 60, `front z ${frontZ}`);
    assert.ok(frontZ < 95, 'under the Decorate ghost');
    assert.match(homes, /back: make\(FURNITURE_Z, 'home-furniture'\), front: make\(FURNITURE_FRONT_Z, 'home-furniture-front'\)/);
    // Your rooms (house, upper floors, tower floors) and a neighbour's (visitorHomeScene) all split.
    assert.equal([...homes.matchAll(/scene\.furnitureFrontLayer = layers\.front;/g)].length, 3);
    assert.match(homes, /export function visitorHomeScene[\s\S]{0,1800}const layers = addFurnitureLayers\(eng, x0\);[\s\S]{0,400}furnitureHolder\(layers, item\)\.addChild\(box\);/);
    // A press finds the hanging piece first.
    assert.match(homes, /function furnitureAt\(point\) \{[\s\S]{0,300}top\.filter\(furnitureDrawsInFront\)/);
  });
});

describe('the newest window is on top (TSMainView.addView)', () => {
  it('the client adds each dialog as the top child and raises one pressed on', { skip: !existsSync(clientRoot) && 'glitch-client not beside the repo' }, () => {
    const main = readFileSync(join(clientRoot, 'view/TSMainView.as'), 'utf8');
    const addView = main.slice(main.indexOf('public function addView'), main.indexOf('private function changeDialogsZ'));
    assert.match(addView, /\} else \{\s*addChild\(DO\);\s*\}/);
    const dialog = readFileSync(join(clientRoot, 'view/ui/Dialog.as'), 'utf8');
    assert.match(dialog, /TSFrontController\.instance\.getMainView\(\)\.addView\(this\);/);
    assert.match(dialog, /mouseDownInHeaderHandler[\s\S]{0,120}if \(parent\) TSFrontController\.instance\.getMainView\(\)\.addView\(this\);/);
  });

  it('a Map opened after the Magic Rock offer goes over it, and back when the offer closes', () => {
    // Opened in this order: the offer (CSS 510), then the Map (CSS 40).
    assert.deepEqual(stackZ([{ base: 510 }, { base: 40 }]), [510, 511]);
    // The Map alone is back at its own value.
    assert.deepEqual(stackZ([{ base: 40 }]), [40]);
    // The offer over the Map keeps its 510.
    assert.deepEqual(stackZ([{ base: 40 }, { base: 510 }]), [40, 510]);
    // A side panel opened over the Map.
    assert.deepEqual(stackZ([{ base: 40 }, { base: 35 }]), [40, 41]);
  });

  it('a full-screen view goes over every window (changeDialogsZ)', () => {
    assert.deepEqual(stackZ([{ base: 96, screen: true }, { base: 510 }]), [511, 510]);
  });

  it('covers the panels, the quest card and feature dialogs; leaves the prompt stack docked', () => {
    for (const sel of ['.map-panel', '.side-panel', '.glitch-modal', '.quest-dialogue', '.familiar-dialog', '[role="dialog"][aria-modal="true"]']) assert.ok(WINDOW_SELECTOR.includes(sel), sel);
    assert.match(SCREEN_SELECTOR, /\.award-screen/);
    const game = read('public/game.js');
    assert.match(game, /windowStack = createWindowStack\(\{/);
    assert.match(game, /windowStack\.install\(\);/);
    // Escape closes the topmost panel first, and hands a feature dialog's Escape to the topmost one.
    assert.match(game, /if \(e\.key === 'Escape'\) \{\s*if \(escapeTopPanel\(\)\) return;\s*if \(escapeOpenFeatureDialog\(\)\) return;/);
    assert.match(game, /const top = windowStack \? windowStack\.topmost\(shown\) : shown\.at\(-1\);/);
  });
});

describe('the Enter chip and its target\'s bubble', () => {
  it('the client hides a stack\'s indicators while its own bubble shows', { skip: !existsSync(clientRoot) && 'glitch-client not beside the repo' }, () => {
    const mgr = readFileSync(join(clientRoot, 'view/itemstack/LisChatBubbleManager.as'), 'utf8');
    assert.match(mgr, /\/\/hide the indicators\s*_aivs_hidden_for_bubble = true;/);
    assert.match(mgr, /\/\/bring back the indicators\s*_aivs_hidden_for_bubble = false;/);
  });

  it('the chip waits while the thing it names is talking', () => {
    const game = read('public/game.js');
    assert.match(game, /if \(!enterHeldBy\(\) && !speakingNow\(near\)\) want = \{/);
    assert.match(game, /function speakingNow\(target\) \{[\s\S]{0,200}speechBubbles\.some/);
  });
});

describe('player and item overlays draw over the street\'s front layers', () => {
  const game = read('public/game.js');
  it('the client puts pc and itemstack overlays in the scrolling overlay holder', { skip: !existsSync(clientRoot) && 'glitch-client not beside the repo' }, () => {
    const annc = readFileSync(join(clientRoot, 'control/engine/AnnouncementController.as'), 'utf8');
    assert.match(annc, /if \(annc\.plot_id == -1\)\{\s*\/\/place it above everything except for at_top overlays\s*gameRenderer\.placeOverlayInSCH/);
    assert.match(readFileSync(join(clientRoot, 'data/client/Announcement.as'), 'utf8'), /public var plot_id:int = -1;/);
  });

  it('the fx layer is drawn after the front layers', () => {
    assert.match(game, /world\.addChild\(bgLayer, entityLayer, streetFrontLayer, atmosphere, fxLayer\);/);
  });

  it('the Winter Walk snow falls over the front layers, under the bubbles and chip', () => {
    const snow = game.slice(game.indexOf('function spawnWinterSnow()'), game.indexOf('function updateWinterSnow('));
    assert.match(snow, /fxLayer\.addChildAt\(snow, 0\);/);
    assert.doesNotMatch(snow, /entityLayer\.addChild/);
  });

  for (const [what, file, pattern] of [
    ['the Wine of the Dead pour', 'public/js/features/homes-feature.js', /const layer = engine\.fxLayer \|\| engine\.entityLayer;\s*if \(!frames\.length[\s\S]{0,400}layer\.addChild\(clip\);/],
    ['a potion bottle', 'public/js/features/potions-feature.js', /function bottleFx[\s\S]{0,300}const layer = engine\.fxLayer \|\| engine\.entityLayer;[\s\S]{0,400}layer\.addChild\(spr\);/],
    ['a cultivation poofing in', 'public/js/features/homes-feature.js', /playPoofIn\(engine\.PIXI, \{ layer: engine\.fxLayer \|\| engine\.entityLayer, x: cultivationWorldX/],
    ['the Butler box puff', 'public/js/features/butler-feature.js', /'proto_puff', \{ layer: engine\.fxLayer \|\| engine\.entityLayer/],
    ['the Craftybot puff', 'public/js/features/craftybot-feature.js', /'proto_puff', \{ layer: engine\.fxLayer \|\| engine\.entityLayer/],
    ['the piggy death puff', 'public/js/features/animal-mood-feature.js', /const layer = engine\?\.fxLayer \|\| engine\?\.entityLayer;/],
    ['set free', 'public/js/features/animal-husbandry-feature.js', /SET_FREE\.puff\.overlay, \{\s*layer: engine\.fxLayer \|\| engine\.entityLayer/],
    ['sneezing powder', 'public/js/features/powders-feature.js', /const layer = engine\.fxLayer \|\| engine\.entityLayer;[\s\S]{0,120}'overlay_sneezing_powder'/],
    ['the secret spot rainbow', 'public/js/features/secret-spots-feature.js', /'rainbow_secretspot', \{\s*layer: engine\.fxLayer \|\| engine\.entityLayer/],
    ['the charades rainbows', 'public/js/features/player-verbs-mp-feature.js', /'rainbow_youdidit', \{ layer: engine\.fxLayer \|\| engine\.entityLayer/],
    ['racing cubimals poofing in', 'public/js/features/cubimal-race-feature.js', /playPoofIn\(engine\.PIXI, \{ layer: engine\.fxLayer \|\| engine\.entityLayer/],
    ['purple quoins poofing in', 'public/js/features/purple-journey-feature.js', /playPoofIn\(PIXI, \{ layer: engine\.fxLayer \|\| engine\.entityLayer/],
    ['the maintenance bot smoke', 'public/js/quest-rooms/back-alley.js', /'smoke_puff', \{ layer: ctx\.engine\.fxLayer \|\| ctx\.engine\.entityLayer/],
    ["Mr. Block's letter blocks", 'public/game.js', /playPoofIn\(PIXI, \{ layer: fxLayer \|\| entityLayer, x: spr\.x, bottom: spr\.y/],
  ]) {
    it(what, () => assert.match(read(file), pattern));
  }

  it('the Gentle Island puffs and poofs', () => {
    const nx = read('public/js/features/newxp-feature.js');
    assert.equal([...nx.matchAll(/layer: engine\.entityLayer/g)].length, 0);
    assert.ok([...nx.matchAll(/layer: engine\.fxLayer \|\| engine\.entityLayer/g)].length >= 3);
  });

  it('in-world overlays stay in the street: the phantom (a location overlay) and the secret spot marker', () => {
    assert.match(game, /playOverlay\(PIXI, 'phantom_glitch', \{ layer: entityLayer,/);
    assert.match(read('public/js/features/secret-spots-feature.js'), /'secret_location_marker', \{\s*layer: engine\.entityLayer/);
  });
});
