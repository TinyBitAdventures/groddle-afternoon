/**
 * The last imagination cards (Austin 2026-11-03: finish the upgrade cards that
 * don't work yet). Every card is accounted for: wired (live), a tutorial card
 * (starter), wired where its system lives, online (online), or one the original
 * never applied (none). Nothing is left "multiplayer" or "interface".
 *
 * Source (glitch-GameServerJS, CC0): inc_data_imagination.js (the cards),
 * players/inc_imagination.js 552 (secret cards are never dealt), player.js
 * 1851-1863 (meditation and chat), 3404-3406 (the Trade Channel), main.js
 * 6871-6893 (the filter packs), items/cauldron.js 320-329.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { IMAGINATION_UPGRADES } from '../public/js/imagination-data.js?v=4a85e7fe';
import { isOfferedInRemake, isOfferedOnline, remakeStatus } from '../public/js/imagination-remake.js?v=c37ad887';
import { FILTER_PACKS } from '../public/js/snap-filters.js?v=32315cf1';

const ROOT = join(import.meta.dirname, '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const HAS_GSJS = existsSync(join(GSJS, 'inc_data_imagination.js'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const NONE = ['crystallography_craft_multiple_crystals', 'inventory_search', 'map_search', 'mining_multitasking', 'jump_wall', 'potionmaking_imagination'];

function gsjsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) gsjsFiles(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('every card is accounted for', () => {
  it('counts from the rules: 269 of 275 work, the six left are the ones the original never applied', () => {
    const counts = {};
    for (const id of Object.keys(IMAGINATION_UPGRADES)) {
      const s = remakeStatus(id).status;
      counts[s] = (counts[s] || 0) + 1;
    }
    assert.equal(Object.keys(IMAGINATION_UPGRADES).length, 275);
    assert.deepEqual(counts, { live: 248, starter: 7, online: 14, none: 6 });
    assert.deepEqual(Object.keys(IMAGINATION_UPGRADES).filter((id) => remakeStatus(id).status === 'none').sort(), [...NONE].sort());
  });

  it('online cards are dealt in multiplayer only; solo deals what it did', () => {
    for (const id of Object.keys(IMAGINATION_UPGRADES)) {
      const s = remakeStatus(id).status;
      if (s === 'online') {
        assert.equal(isOfferedInRemake(id), false, id);
        assert.equal(isOfferedOnline(id), true, id);
      } else {
        assert.equal(isOfferedOnline(id), isOfferedInRemake(id), id);
      }
    }
  });

  it('no stale notes', () => {
    for (const id of Object.keys(IMAGINATION_UPGRADES)) {
      const { note } = remakeStatus(id);
      assert.doesNotMatch(note, /has no bags|not in the remake|needs other players|Not wired/, id);
    }
  });

  it('the restoration page and the coverage table count the online cards as working', () => {
    assert.match(read('public/restoration/restoration.js'), /return \(c\.live \|\| 0\) \+ \(c\.starter \|\| 0\) \+ \(c\.online \|\| 0\);/);
    assert.match(read('tools/coverage.mjs'), /data\.imagination\.counts\.starter \+ \(data\.imagination\.counts\.online \|\| 0\)/);
    assert.match(read('tools/inventory/detectors.mjs'), /online: 'source'/);
  });
});

describe('the six the original never applied (re-checked against GameServerJS)', { skip: HAS_GSJS ? false : 'needs glitch-GameServerJS beside the game' }, () => {
  it('five are secret with no rewards, and nothing outside the card data names them', () => {
    const data = readFileSync(join(GSJS, 'inc_data_imagination.js'), 'utf8');
    const files = gsjsFiles(GSJS).filter((p) => !p.endsWith('inc_data_imagination.js'));
    const texts = files.map((p) => [p, readFileSync(p, 'utf8')]);
    for (const id of ['crystallography_craft_multiple_crystals', 'inventory_search', 'map_search', 'mining_multitasking']) {
      const at = data.indexOf(`function imagination_get_${id}(){`);
      const body = data.slice(at, data.indexOf('};', at));
      assert.match(body, /is_secret: true/, id);
      assert.match(body, /rewards: \[\s*\]/, id);
      const uses = texts.filter(([, t]) => t.includes(`'${id}'`) || t.includes(`"${id}"`)).map(([p]) => p);
      // inventory_search also names a client UI part the tutorial streets hide (location.js hideUIOnLoad), not the card.
      for (const p of uses) assert.match(p, /locations\//, `${id} in ${p}`);
    }
    // Off The Wall Jump: secret too; its reward is the can_wall_jump physics, and a reset deletes it with the movement cards.
    const wall = data.slice(data.indexOf('function imagination_get_jump_wall(){'), data.indexOf('data_imagination_upgrades.jump_wall'));
    assert.match(wall, /is_secret: true/);
    assert.match(wall, /"can_wall_jump"\s*: 1/);
    assert.match(readFileSync(join(GSJS, 'players/inc_physics.js'), 'utf8'), /this\.imagination_delete_upgrade\('jump_wall'\);/);
    // inc_imagination.js 552: secret cards are left out of the deck.
    assert.match(readFileSync(join(GSJS, 'players/inc_imagination.js'), 'utf8'), /if \(u\.is_secret\) continue;/);
  });

  it('Potent Potions is dealt but never checked: the Cauldron rolls Shake Things Up', () => {
    const uses = gsjsFiles(GSJS).filter((p) => !p.endsWith('inc_data_imagination.js') && readFileSync(p, 'utf8').includes('potionmaking_imagination'));
    assert.deepEqual(uses, []);
    assert.match(readFileSync(join(GSJS, 'items/cauldron.js'), 'utf8'), /var upgrade_id = 'cocktail_crafting_imagination';/);
  });
});

describe('the online cards are wired', () => {
  it('meditation: an IM breaks it unless Tune Out The Chatter, your own chat unless Mantra Meditation', () => {
    const src = read('public/js/features/meditation-feature.js');
    assert.match(src, /c\.on\('msg:im', \(m\) => \{\n\s*if \(Number\(m\?\.line\?\.from\) === mpMe\(\)\) chatSaid\(engine\);\n\s*else if \(session && imInterrupts\(upgrades\(engine\)\)\) end\(engine, 'chat'\);/);
    assert.doesNotMatch(read('public/js/radiance-mp.js'), /players have no instant\s+messages/);
  });

  it('the Trade Channel needs the card on the site and in the game', () => {
    assert.match(read('public/js/features/groups-feature.js'), /includes\('trade_channel'\)/);
  });

  it('the filter packs add their filters to the Snap polaroid', () => {
    assert.deepEqual(Object.keys(FILTER_PACKS), ['snapshottery_basic_filter_pack', 'snapshottery_filter_pack_1', 'snapshottery_filter_pack_2', 'snapshottery_filter_pack_3']);
    for (const id of Object.keys(FILTER_PACKS)) assert.equal(remakeStatus(id).status, 'online', id);
    const snaps = read('public/js/features/snaps-feature.js');
    assert.match(snaps, /const filters = filterRow\(engine, s, picture, img\);/);
    assert.match(snaps, /const kept = filters \? filters\.picture\(\) : picture;/);
    assert.match(snaps, /image: kept\.b64/);
    assert.ok(existsSync(join(ROOT, 'public/assets/ui/snaps/filter-thumb.png')));
  });
});
