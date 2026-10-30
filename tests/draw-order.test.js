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
 * ITEMBANDS: which of the three item holders a class draws in comes from its itemDef flags
 * (LocationRenderer.placeItemstackInMG 1508-1517); js/item-bands-data.js is generated from
 * GameServerJS by tools/build-item-bands.mjs and js/item-bands.js turns a class into its band's z
 * (background 10-19, normal 20-34, foreground 35-48). A street project sign (sign_stake) and a
 * Zilloween pumpkin are normal items, so they draw in front of a trant (in_background).
 * Run: node --test tests/draw-order.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remoteAvatarZ } from '../public/js/features/realtime-feature.js?v=g463-1';
import { FRONT_FURNITURE_SLOTS, furnitureDrawsInFront } from '../public/js/home-decor.js?v=g448-3';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js';
import { SCREEN_SELECTOR, WINDOW_SELECTOR, stackZ } from '../public/js/window-stack.js?v=g428-1';
import { BAND_Z, bandClass, itemBand, itemZ, knownItemClass } from '../public/js/item-bands.js?v=g429-1';
import { BACKGROUND_CLASSES, FOREGROUND_CLASSES, FOREMOST_CLASSES, NORMAL_CLASSES } from '../public/js/item-bands-data.js?v=g429-1';
import { buildItemBands, render as renderItemBands } from '../tools/build-item-bands.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const clientRoot = join(here, '../../glitch-client/com/tinyspeck/engine');
const gsjsRoot = join(here, '../../glitch-GameServerJS');
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
    ['the museum speakers (rook_hall_speaker)', 'function makeRookMuseumSpeaker(exhibit)'],
    ['Greeterbot Sentry G-42', 'function spawnRookMuseumGreeter()'],
    ["Storyland's wall buttons (wall_button)", "root.name = `greedy-story-act-${actIndex + 1}`;", 'root'],
    ["Storyland's exit sign", "root.label = 'greedy-story-exit';", 'root'],
  ]) {
    it(what, () => assert.ok(zAfter(game, marker, name) < 49, `${what} z ${zAfter(game, marker, name)}`));
  }

  it('the Rook Egg (rook_egg, in_background)', () => {
    assert.match(game, /function spawnRookEgg\(\) \{[\s\S]{0,400}sprite\.zIndex = itemZ\('rook_egg', 9\);/);
    assert.ok(itemZ('rook_egg', 9) < 49);
  });

  it('fireflies, the courier frog and racing cubimals (in_foreground items)', () => {
    const nodes = read('public/js/features/resource-nodes-feature.js');
    assert.match(nodes, /root\.zIndex = itemZ\(entity\.classTsid, Z\.firefly\);/);
    assert.equal(itemBand('npc_firefly'), 'foreground');
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
    ['the maintenance bot smoke', 'public/js/quest-rooms/back-alley.js', /'smoke_puff', \{ layer: wctx\.engine\.fxLayer \|\| wctx\.engine\.entityLayer/],
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

describe('item bands from the source (ITEMBANDS)', () => {
  it('the client picks a holder from in_background, then in_foreground, then in_foremostground', { skip: !existsSync(clientRoot) && 'glitch-client not beside the repo' }, () => {
    const loc = readFileSync(join(clientRoot, 'view/renderer/LocationRenderer.as'), 'utf8');
    assert.match(loc, /if \(lis\.item\.in_background === true\) \{\s*mgr\.addBackgroundItem\(lis\);\s*\} else if \(lis\.item\.in_foreground === true\) \{\s*mgr\.addForegroundItem\(lis\);\s*\} else if \(lis\.item\.in_foremostground === true\) \{\s*mgr\.addForemostGroundItem\(lis\);\s*\} else \{\s*mgr\.addNormalItem\(lis\);/);
    // Within a holder, stacks go in by stack z, each under the holder's marker: the later one on top.
    assert.match(loc, /getItemstacksASortedByZ\(loc\.itemstack_tsid_list\)/);
    assert.match(readFileSync(join(clientRoot, 'view/renderer/MiddleGroundRenderer.as'), 'utf8'), /addNormalItem\(iiv:LocationItemstackView\):void \{\s*addUnder\(LocationItemstackView\(iiv\), NRM_ITEM\);/);
  });

  it('item-bands-data.js is current with GameServerJS', { skip: !existsSync(gsjsRoot) && 'glitch-GameServerJS not beside the repo' }, () => {
    assert.equal(read('public/js/item-bands-data.js'), renderItemBands(buildItemBands(gsjsRoot)), 'run node tools/build-item-bands.mjs');
    const trant = readFileSync(join(gsjsRoot, 'items/trant_spice.js'), 'utf8').split('\n');
    assert.match(trant[1186], /in_background\s*:\s*true/);
    assert.match(trant[1187], /in_foreground\s*:\s*false/);
    const sign = readFileSync(join(gsjsRoot, 'items/sign_stake.js'), 'utf8');
    assert.match(sign, /in_background\s*:\s*false,\s*in_foreground\s*:\s*false/);
  });

  it('every class has one band; the lists are sorted and disjoint', () => {
    const all = [...BACKGROUND_CLASSES, ...NORMAL_CLASSES, ...FOREGROUND_CLASSES, ...FOREMOST_CLASSES];
    assert.equal(new Set(all).size, all.length);
    assert.ok(BACKGROUND_CLASSES.length > 150 && FOREGROUND_CLASSES.length > 100 && NORMAL_CLASSES.length > 900);
    assert.deepEqual([...FOREMOST_CLASSES], ['crusher']);
  });

  it('a few classes in each band', () => {
    for (const cls of ['trant_spice', 'trant_fruit', 'wood_tree', 'patch', 'rock_metal_1', 'peat_1', 'dirt_pile', 'npc_shrine_cosma', 'npc_mailbox', 'bag_notice_board', 'npc_spinning_wheel', 'npc_mail_dispatcher', 'rook_egg']) assert.equal(itemBand(cls), 'background', cls);
    for (const cls of ['sign_stake', 'pumpkin_lit_1', 'pumpkin_carved_3', 'apple', 'mortar_barnacle', 'ice_knob', 'visiting_stone', 'note', 'icon_cosma', 'fox_bait', 'musicblock_d_blue_01', 'npc_swoonerfly']) assert.equal(itemBand(cls), 'normal', cls);
    for (const cls of ['npc_piggy', 'npc_chicken', 'npc_butterfly', 'quoin', 'street_spirit', 'npc_bureaucrat', 'npc_rube', 'npc_fox', 'npc_juju_bandit', 'bag_butler', 'npc_firefly', 'npc_salmon']) assert.equal(itemBand(cls), 'foreground', cls);
    assert.equal(itemBand('crusher'), 'foremost');
  });

  it('remake stand-ins draw as the class they stand for', () => {
    assert.equal(bandClass('street_job_board'), 'sign_stake');
    assert.equal(bandClass('street_spirit_groceries'), 'street_spirit');
    assert.equal(itemBand('garden_plot'), 'background');
    assert.equal(itemBand('a_class_the_server_never_had'), 'normal');
    assert.equal(knownItemClass('a_class_the_server_never_had'), false);
  });

  it('bands stack background < normal < foreground < other players < you < foremost', () => {
    const top = (cls) => itemZ(cls, 1000);
    assert.ok(top('trant_spice') < itemZ('sign_stake'));
    assert.ok(top('sign_stake') < itemZ('npc_piggy'));
    assert.ok(top('npc_piggy') < remoteAvatarZ(0));
    assert.ok(remoteAvatarZ(8999) < PLAYER_Z && PLAYER_Z < itemZ('crusher'));
    assert.equal(itemZ('npc_mailbox', 4), BAND_Z.background + 4);
    assert.equal(itemZ('mortar_barnacle', { background: 9.2, normal: 1 }), BAND_Z.normal + 1);
    assert.equal(itemZ('peat_1', { background: 9.2, normal: 1 }), BAND_Z.background + 9.2);
  });

  it('a street project sign draws in front of a Spice Plant (The Great Hole to Ix)', () => {
    const jobs = read('public/js/features/street-jobs-feature.js');
    assert.match(jobs, /const BOARD_CLASS = 'street_job_board';/);
    assert.match(jobs, /function spawnBoard[\s\S]{0,700}spr\.zIndex = itemZ\(BOARD_CLASS, 1\);/);
    const game = read('public/game.js');
    assert.match(game, /function spawnTrees[\s\S]{0,4000}spr\.zIndex = itemZ\(classId, 6\);/);
    assert.ok(itemZ('street_job_board', 1) > itemZ('trant_spice', 6));
  });

  it('a Zilloween Jack-O-Lantern draws in front of a trant (Tii Street)', () => {
    const seasons = read('public/js/features/seasons-feature.js');
    assert.match(seasons, /function spawnLantern[\s\S]{0,500}spr\.zIndex = itemZ\(litClass\(face\), 1\);/);
    assert.match(seasons, /function spawnPlaced[\s\S]{0,500}spr\.zIndex = itemZ\(row\.cls, 1\);/);
    for (const n of [1, 2, 3, 4, 5]) {
      assert.ok(itemZ(`pumpkin_lit_${n}`, 1) > itemZ('trant_spice', 6));
      assert.ok(itemZ(`pumpkin_carved_${n}`, 1) > itemZ('trant_spice', 6));
    }
  });

  for (const [what, file, pattern] of [
    ['apples', 'public/game.js', /spr\.zIndex = itemZ\('apple', 4\);/],
    ['piggies', 'public/game.js', /spr\.zIndex = itemZ\('npc_piggy', 2\);/],
    ['quoins', 'public/game.js', /q\.zIndex = itemZ\('quoin', 4\);/],
    ['shrines', 'public/game.js', /spr\.zIndex = itemZ\(`npc_shrine_\$\{giant\.id\}`, 8\);/],
    ['mining rocks', 'public/game.js', /root\.zIndex = itemZ\(def\.classTsid, 9\.5\);/],
    ['dropped stacks', 'public/game.js', /spr\.zIndex = itemZ\(stack\.classTsid, 12\);/],
    ['the vendor', 'public/game.js', /g\.zIndex = itemZ\(activeVendor\.id, 5\);/],
    ['vendor NPCs', 'public/js/features/vendor-npcs-feature.js', /spr\.zIndex = itemZ\(classTsid, 5\);/],
    ['the street mailbox', 'public/js/features/street-furniture-feature.js', /spr\.zIndex = itemZ\(MAILBOX_CLASS, 4\);/],
    ['the notice board', 'public/js/features/street-furniture-feature.js', /spr\.zIndex = itemZ\(BOARD_CLASS, 0\.5\);/],
    ['peat, barnacles and the paper tree', 'public/js/features/resource-nodes-feature.js', /sprite\.zIndex = itemZ\(entity\.classTsid, entity\.classTsid === 'paper_tree' \? Z\.paper : Z\.ground\);/],
    ['the supply clerk', 'public/js/features/supply-feature.js', /spr\.zIndex = itemZ\(CLERK_CLASS, 0\);/],
    ['Rube', 'public/js/features/rube-feature.js', /spr\.zIndex = itemZ\(RUBE_CLASS, 0\);/],
    ['Giant icons', 'public/js/features/giant-icons-feature.js', /spr\.zIndex = itemZ\(def\.iconClass, 2\);/],
    ['swoonerflies', 'public/js/features/swoonerflies-feature.js', /spr\.zIndex = itemZ\(SWOONERFLY_CLASS, 10\);/],
  ]) {
    it(`${what} draw in their band`, () => assert.match(read(file), pattern));
  }

  it('every literal class handed to itemZ is a real class', () => {
    const files = ['public/game.js', ...['street-jobs', 'seasons', 'street-furniture', 'resource-nodes', 'foxes', 'heli-kitties', 'juju-bandits', 'butler', 'craftybot', 'rube', 'supply', 'giant-icons', 'mail-courier', 'rook-attack', 'animal-husbandry', 'yard-verbs-mp', 'neighbours-mp', 'small-items', 'item-verbs-more', 'vendor-npcs', 'potions', 'swoonerflies'].map((f) => `public/js/features/${f}-feature.js`)];
    for (const f of files) {
      const src = read(f);
      assert.match(src, /import \{ itemZ \} from '\.\.?\/(js\/)?item-bands\.js\?v=g429-1';/, f);
      for (const m of src.matchAll(/itemZ\('([a-z0-9_]+)'/g)) assert.ok(knownItemClass(m[1]), `${f}: ${m[1]}`);
    }
  });
});
