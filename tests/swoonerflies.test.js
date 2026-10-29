/**
 * World Swoonerflies (register G121): js/swoonerflies.js,
 * features/swoonerflies-feature.js and the street-ecology.json `swoonerflies`
 * map (build-street-ecology.mjs).
 *
 * Sources: glitch-GameServerJS items/npc_swoonerfly.js (onCreate 66-69
 * 'fly-rooked', fall 37-43, land 45-62, verbs 35, not_selectable 104),
 * items/npc_squid.js:311-317 createSwoonerfly (the only fall() caller), and the
 * archived location objects in streets/mnt/stos/location_data (LA51450HIC42Q4I,
 * LIF5UU8FO3029OK, LUVNIF7Q9KR2382; Area 42 LHF8DDDBTPF3P4U is an instance).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SWOONERFLY_CLASS,
  SWOONERFLY_LABEL,
  SWOONERFLY_PLACEMENT_KEY,
  SWOONERFLY_SHEET,
  SWOONERFLY_STATE,
  swoonerflyPlacementGroups,
  swoonerfliesFor,
} from '../public/js/swoonerflies.js?v=g369-1';
import { setWildlifeCatalog } from '../public/js/wildlife.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const locations = join(root, '..', 'streets', 'mnt', 'stos', 'location_data');
const hasGsjs = existsSync(gsjs);
const hasLocations = existsSync(locations);
const ecology = JSON.parse(readFileSync(join(pub, 'assets/content/street-ecology.json'), 'utf8'));
const WORLD = ['GA51450HIC42Q4I', 'GIF5UU8FO3029OK', 'GUVNIF7Q9KR2382'];

describe('source', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
  const s = () => readFileSync(join(gsjs, 'items/npc_swoonerfly.js'), 'utf8');

  it('starts fly-rooked, has no verbs and cannot be selected', () => {
    const text = s();
    assert.match(text, /^var label = "Swoonerfly";/m);
    assert.equal(SWOONERFLY_LABEL, 'Swoonerfly');
    assert.match(text, /function onCreate\(\)\{[^}]*this\.setAndBroadcastState\('fly-rooked'\);/);
    assert.equal(SWOONERFLY_STATE, 'fly-rooked');
    assert.match(text, /^var verbs = \{\};$/m);
    assert.match(text, /not_selectable\s*: true/);
    assert.match(text, /obey_physics\s*: false/);
    assert.equal((text.match(/setAndBroadcastState\(/g) || []).length, 1, 'land() sends an overlay, never a state');
  });

  it('only the squid makes one fall, in its own quest instance', () => {
    const callers = [];
    for (const dir of ['items', 'items/include', 'locations', 'players', 'quests']) {
      const abs = join(gsjs, dir);
      if (!existsSync(abs)) continue;
      for (const name of readdirSync(abs)) {
        if (!name.endsWith('.js')) continue;
        const text = readFileSync(join(abs, name), 'utf8');
        if (/npc_swoonerfly/.test(text) && /\.fall\(\)/.test(text)) callers.push(`${dir}/${name}`);
      }
    }
    assert.deepEqual(callers.filter((f) => f !== 'items/npc_swoonerfly.js'), ['items/npc_squid.js']);
    const squid = readFileSync(join(gsjs, 'items/npc_squid.js'), 'utf8');
    assert.match(squid, /this\.questPC\.location\.createItemStack\('npc_swoonerfly'/);
    assert.equal((squid.match(/this\.createSwoonerfly\(/g) || []).length, 5);
  });
});

describe('the archived placements', () => {
  it('three world streets hold one each; Area 42 is left to Gwendolyn\'s room', () => {
    assert.equal(ecology.swoonerflyStreetCount, 3);
    assert.deepEqual(Object.keys(ecology.swoonerflies).sort(), [...WORLD].sort());
    for (const tsid of WORLD) assert.equal(swoonerfliesFor(ecology, tsid), 1, tsid);
    assert.equal(swoonerfliesFor(ecology, 'GHF8DDDBTPF3P4U'), 0);
    assert.equal(swoonerfliesFor(ecology, 'LA51450HIC42Q4I'), 1, 'L alias');
  });

  it('matches the location objects', { skip: !hasLocations && 'location_data not beside this worktree' }, () => {
    const count = (tsid) => (readFileSync(join(locations, `${tsid}.xml`), 'utf8').match(/<objref tsid="I[A-Z0-9]+" label="Swoonerfly"\/>/g) || []).length;
    for (const tsid of WORLD) assert.equal(count(`L${tsid.slice(1)}`), 1, tsid);
    const area42 = readFileSync(join(locations, 'LHF8DDDBTPF3P4U.xml'), 'utf8');
    assert.equal(count('LHF8DDDBTPF3P4U'), 4);
    assert.match(area42, /<bool id="is_instance">true<\/bool>/);
    assert.match(area42, /<str id="instance_id">tower_quest_desert<\/str>/);
    // Only tsids and labels survive: no x, y or y_destination.
    assert.doesNotMatch(readFileSync(join(locations, 'LA51450HIC42Q4I.xml'), 'utf8'), /y_destination/);
  });

  it('one planner group per street, none without', () => {
    assert.deepEqual(swoonerflyPlacementGroups(1), [{ key: SWOONERFLY_PLACEMENT_KEY, count: 1, clearance: 80 }]);
    assert.deepEqual(swoonerflyPlacementGroups(0), []);
  });

  it('reuses the fly-rooked sheet Gwendolyn\'s room plays', () => {
    const room = readFileSync(join(pub, 'js/quest-rooms/gwendolyn.js'), 'utf8');
    assert.match(room, /const SWOON_FRAMES = 14; \/\/ npc_butterfly fly-rooked, 70 x 65/);
    assert.match(room, /\$\{ART\}swoonerfly_fall\.png/);
    assert.equal(SWOONERFLY_SHEET.path, 'assets/sprites/quest-rooms/gwendolyn/swoonerfly_fall.png');
    assert.ok(existsSync(join(pub, SWOONERFLY_SHEET.path)));
    const png = readFileSync(join(pub, SWOONERFLY_SHEET.path));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [SWOONERFLY_SHEET.fw * SWOONERFLY_SHEET.frames, SWOONERFLY_SHEET.fh]);
  });
});

describe('the feature', () => {
  it('is registered and draws one looping, untargetable sprite per objref', async () => {
    assert.match(readFileSync(join(pub, 'js/features/index.js'), 'utf8'), /import \{ swoonerfliesFeature \} from '\.\/swoonerflies-feature\.js\?v=g\d+-\d+'; FEATURES\.push\(swoonerfliesFeature\);/);
    const { swoonerfliesFeature } = await import('../public/js/features/swoonerflies-feature.js?v=g430-1');
    class AnimatedSprite {
      constructor(textures) {
        this.textures = textures;
        this.anchor = { set: (x, y) => { this.ax = x; this.ay = y; } };
        this.scale = { x: 1, y: 1 };
        this.playing = false;
        this.destroyed = false;
      }
      gotoAndPlay(f) { this.frame = f; this.playing = true; }
    }
    const PIXI = { AnimatedSprite, Texture: { EMPTY: {} }, Rectangle: class {} };
    const added = [];
    const registered = [];
    const data = {};
    const engine = {
      PIXI,
      streetTsid: 'GIF5UU8FO3029OK',
      entityLayer: { addChild: (c) => added.push(c) },
      player: { x: 500, y: 900 },
      param: () => null,
      setData: (k, v) => { data[k] = v; },
      placement: (key) => (key === SWOONERFLY_PLACEMENT_KEY ? [{ x: 1234, y: 870 }] : []),
      register: (t) => registered.push(t),
      transientInstance: () => false,
    };
    setWildlifeCatalog(ecology);
    swoonerfliesFeature.init(engine);
    assert.deepEqual(swoonerfliesFeature.placementGroups({}, { tsid: 'GIF5UU8FO3029OK' }), [{ key: SWOONERFLY_PLACEMENT_KEY, count: 1, clearance: 80 }]);
    assert.deepEqual(swoonerfliesFeature.placementGroups({}, { tsid: 'GHF8DDDBTPF3P4U' }), []);
    swoonerfliesFeature.onStreetEnter({ tsid: 'GIF5UU8FO3029OK' }, engine);
    for (let i = 0; i < 20 && !added.length; i += 1) await new Promise((r) => setTimeout(r, 5));
    assert.equal(added.length, 1);
    const [spr] = added;
    assert.deepEqual([spr.x, spr.y, spr.ax, spr.ay, spr.loop, spr.playing], [1234, 870, 0.5, 1, true, true]);
    assert.equal(registered.length, 0, 'not_selectable: no menu, no tooltip');
    assert.equal(data.swoonerflies, '1');
    swoonerfliesFeature.onStreetClear(engine);
    assert.equal(swoonerfliesFeature._state().count, 0);
    setWildlifeCatalog(null);
  });
});

describe('the inventory', () => {
  it('reads npc_swoonerfly reachable, citing the world placements', () => {
    const o = JSON.parse(readFileSync(join(root, 'tools/inventory/overrides.json'), 'utf8'))['npc:npc_swoonerfly'];
    assert.equal(o.status, 'source');
    for (const tsid of WORLD) assert.ok(o.reason.includes(tsid), tsid);
    assert.match(readFileSync(join(root, 'tools/inventory/build.mjs'), 'utf8'), /'vendors', 'swoonerflies'\]/);
    assert.equal(SWOONERFLY_CLASS, 'npc_swoonerfly');
  });
});
