/**
 * Draw order among the things on a street (LAYERS2, after G410's front layers). The client's
 * middleground renderer stacks its holders in one fixed order (MiddleGroundRenderer.setupEndShapes
 * 111-171): decos, then the item holders (background, normal, foreground items: every NPC is an
 * item), then other players' avatars, overlays below your avatar, your avatar, the foremost items
 * (only the Crusher, Item.as 436-440) and front/ceiling furniture. In the remake the player's body
 * is zIndex 50 in the entity layer, so world items and NPCs sit under 49, other players between 49
 * and 50 in arrival order, and only worn or carried things, effects and the Crusher above 50.
 * Run: node --test tests/draw-order.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remoteAvatarZ } from '../public/js/features/realtime-feature.js?v=g413-1';

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
