/** Heli Kitties: rules (js/heli-kitties.js) and the feature's placement helper. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KITTY_MOTION,
  KITTY_PAUSE_CHOICES,
  KITTY_PET,
  KITTY_SOURCE_HIDDEN_VERBS,
  canNameKitty,
  choosePause,
  createKitty,
  kickKitty,
  kittyCountFor,
  kittyLabel,
  kittyVerbs,
  nameKitty,
  normalizeKittySlot,
  petKitty,
  rollScare,
  sanitizeKittyName,
  scareChance,
  stepKitty,
} from '../public/js/heli-kitties.js?v=g414-1';
import { KITTY_SHEETS, heliKittiesFeature, kittyPlacementGroups } from '../public/js/features/heli-kitties-feature.js?v=g442-6';
import { foxesFeature } from '../public/js/features/foxes-feature.js?v=g442-6';
import { createFeatureHost } from '../public/js/feature-host.js';
import { setWildlifeCatalog } from '../public/js/wildlife.js';
import { readFileSync } from 'node:fs';

const flat = (y = 300) => ({ geo: { l: 0, r: 3000 }, groundY: y, surfaceY: () => y, landY: () => y });

describe('Heli Kitty source numbers', () => {
  it('pets for -4 energy, +10 mood, +4 iMG and sleeps 26/30 + 58/30 s', () => {
    assert.equal(KITTY_PET.energy, 4);
    assert.equal(KITTY_PET.mood, 10);
    assert.equal(KITTY_PET.xp, 4);
    assert.equal(KITTY_PET.sleepStartMs, 867);
    assert.equal(KITTY_PET.sleepMs, 1933);
    assert.equal(KITTY_PET.totalMs, 2810);
    assert.equal(KITTY_PET.bubble, 'purrrrrr');
  });

  it('keeps the walkable speed, pause cadence, and scare chances', () => {
    assert.deepEqual([KITTY_MOTION.walkSpeedMin, KITTY_MOTION.walkSpeedMax], [50, 55]);
    assert.deepEqual([KITTY_MOTION.pauseEveryMinMs, KITTY_MOTION.pauseEveryMaxMs], [6000, 14000]);
    assert.equal(scareChance([]), 0.75);
    assert.equal(scareChance(['animalkinship_1']), 0.25);
    assert.equal(KITTY_MOTION.kickVy, -200);
    assert.equal(KITTY_PAUSE_CHOICES.length, 7);
    assert.equal(KITTY_PAUSE_CHOICES.filter((c) => c[1] === '3blink').length, 3);
    assert.deepEqual(choosePause(() => 0.5), { clip: '3happy', ms: 1267 });
    assert.deepEqual(choosePause(() => 0.7), { clip: '3chew', ms: 4000 });
  });

  it('hides every chicken verb the kitty class switches off', () => {
    assert.deepEqual([...KITTY_SOURCE_HIDDEN_VERBS], ['butter_up', 'squeeze', 'talk_to', 'incubate', 'apply_youth', 'set_free']);
    const verbs = kittyVerbs(createKitty(), { learned: [] }).map((v) => v.id);
    assert.deepEqual(verbs, ['pet']);
    for (const id of KITTY_SOURCE_HIDDEN_VERBS) assert.equal(verbs.includes(id), false);
  });

  it('slices the adult sheets on their measured cells', () => {
    assert.equal(KITTY_SHEETS['3fly'].frames, 20);
    assert.equal(KITTY_SHEETS['3sleepStart'].frames, 26);
    assert.equal(KITTY_SHEETS['3sleep'].frames, 57);
    assert.equal(KITTY_SHEETS['3appear'].first, 1);
    for (const def of Object.values(KITTY_SHEETS)) {
      assert.equal(def.fw, 136);
      assert.equal(def.fh, 115);
    }
  });
});

describe('petting', () => {
  it('applies the metabolics and curls up, then flies on after one sleep cycle', () => {
    const kitty = createKitty({ x: 500, y: 300, rng: () => 0 });
    kitty.state = 'move';
    const pc = { energy: 50, mood: 95, xp: 10, imagination: 10 };
    const r = petKitty(kitty, pc);
    // stats_add_xp(4) after the mood gain: a full tank pays x1.2, 5 iMG (G148).
    assert.deepEqual([r.energy, r.mood, r.xp], [-4, 5, 5]);
    assert.deepEqual([pc.energy, pc.mood, pc.xp], [46, 100, 15]);
    assert.equal(kitty.state, 'sleepStart');
    stepKitty(kitty, 867, flat());
    assert.equal(kitty.state, 'sleep');
    assert.equal(kitty.clip, '3sleep');
    const events = stepKitty(kitty, 1943, flat());
    assert.deepEqual(events, ['woke']);
    assert.equal(kitty.state, 'move');
  });

  it('takes whatever energy is left and refuses while airborne', () => {
    const pc = { energy: 2, mood: 0, xp: 0 };
    assert.equal(petKitty(createKitty(), pc).energy, -2);
    assert.equal(pc.energy, 0);
    const kitty = createKitty();
    kickKitty(kitty, () => 0.5);
    assert.equal(petKitty(kitty, { energy: 50 }).ok, false);
    assert.equal(kittyVerbs(kitty).find((v) => v.id === 'pet').enabled, false);
  });
});

describe('scares and flight', () => {
  it('startles three times in four (one in four with Animal Kinship I), never while asleep', () => {
    const kitty = createKitty();
    kitty.state = 'move';
    assert.equal(rollScare(kitty, [], () => 0.7), true);
    assert.equal(rollScare(kitty, ['animalkinship_1'], () => 0.3), false);
    kitty.state = 'sleep';
    assert.equal(rollScare(kitty, [], () => 0), false);
  });

  it('kicks up at -200 px/s and lands back on the floor, then resumes after a second', () => {
    const kitty = createKitty({ x: 1000, y: 300 });
    kitty.state = 'move';
    kickKitty(kitty, () => 0.9999);
    assert.equal(kitty.vx, 100);
    assert.equal(kitty.flying, true);
    let landed = false;
    for (let i = 0; i < 400 && !landed; i += 1) landed = stepKitty(kitty, 16, flat()).includes('landed');
    assert.equal(landed, true);
    assert.equal(kitty.y, 300);
    assert.ok(kitty.x > 1000);
    stepKitty(kitty, 1000, flat());
    assert.equal(kitty.state, 'move');
  });

  it('wanders edge to edge and turns at the 100 px inset', () => {
    const kitty = createKitty({ x: 120, y: 300, rng: () => 0 });
    kitty.state = 'move';
    kitty.nextPauseMs = 1e9;
    stepKitty(kitty, 1000, flat());
    assert.equal(kitty.x, 100);
    assert.equal(kitty.dir, 'right');
  });
});

describe('naming', () => {
  it('needs Animal Kinship V and keeps letters, digits, and spaces from the first 32 characters', () => {
    const kitty = createKitty();
    assert.equal(canNameKitty(kitty, { learned: [] }).ok, false);
    assert.equal(sanitizeKittyName('Mr. Whiskers!! the 3rd of a very long kitty line'), 'Mr Whiskers the 3rd of a very');
    const r = nameKitty(kitty, 'Whirly', { learned: ['animalkinship_5'], playerId: 'p1', nowS: 1000 });
    assert.equal(r.bubble, 'And they shall call me "Whirly"');
    assert.equal(r.counter, 'animals_named:npc_kitty_chicken');
    assert.equal(kittyLabel(kitty), 'A Heli Kitty Named Whirly');
    assert.deepEqual(kittyVerbs(kitty, { learned: ['animalkinship_5'], playerId: 'p1', nowS: 1001 }).map((v) => v.id), ['pet', 'rename']);
  });

  it('lets another player rename only after an hour', () => {
    const kitty = createKitty({ name: 'Whirly', namer: 'p1', namedOn: 1000 });
    const opts = { learned: ['animalkinship_5'], playerId: 'p2' };
    assert.equal(canNameKitty(kitty, { ...opts, nowS: 4000 }).ok, false);
    assert.equal(canNameKitty(kitty, { ...opts, nowS: 4601 }).ok, true);
  });

  it('persists only clean names per street', () => {
    const slot = normalizeKittySlot({ names: { 'kitty:0': { name: 'Whirly!', namer: 'player', namedOn: 5 }, bad: { name: 'x' }, 'kitty:1': { name: '' } } });
    assert.deepEqual(slot, { names: { 'kitty:0': { name: 'Whirly', namer: 'player', namedOn: 5 } } });
  });
});

describe('placement', () => {
  it('requests up to three kitties from the archived count', () => {
    assert.equal(kittyCountFor({ npc_kitty_chicken: 3 }), 3);
    assert.equal(kittyCountFor({ npc_kitty_chicken: 9 }), 3);
    assert.deepEqual(kittyPlacementGroups({ npc_kitty_chicken: 1 }), [{ key: 'kitty', count: 1, clearance: 90 }]);
    assert.deepEqual(kittyPlacementGroups({ fox_stop_marker: 5 }), []);
    assert.deepEqual(kittyPlacementGroups(null), []);
  });
});

describe('kitty feature registers cleanly', () => {
  it('shares a host with the fox feature and keeps no player slice', () => {
    const host = createFeatureHost([foxesFeature, heliKittiesFeature]);
    assert.equal(host.get('heli-kitties'), heliKittiesFeature);
    assert.deepEqual(Object.keys(host.save()), ['foxes']);
    assert.deepEqual(host.collect('placementGroups', {}, { tsid: 'GA5215DAMMR2G95' }, {}), []);
    setWildlifeCatalog(JSON.parse(readFileSync(new URL('../public/assets/content/street-ecology.json', import.meta.url))));
    // Ramyeon Kon keeps its three archived Heli Kitties; Gyerean Park (a preserve) has none.
    assert.deepEqual(host.collect('placementGroups', {}, { tsid: 'GA5215DAMMR2G95' }, {}), [{ key: 'kitty', count: 3, clearance: 90 }]);
    assert.deepEqual(host.collect('placementGroups', {}, { tsid: 'GA53N05IG9S2BLR' }, {}), []);
    setWildlifeCatalog(null);
  });
});
