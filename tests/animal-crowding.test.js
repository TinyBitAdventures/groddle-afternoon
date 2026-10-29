import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  CHECK_ON_REMOVE,
  CROWD_LEAVE_LINE,
  CROWD_SAD_LINES,
  CROWD_SAD_REASONS,
  CROWD_TIMING,
  POPULATION_CONTROLS,
  NO_LIMIT,
  canStartSadness,
  crowdChance,
  crowdGoneReturns,
  crowdRespawnBoundary,
  crowdSadClip,
  crowdSadLinePool,
  gloomOnLoad,
  isCrowdSad,
  randInt,
  sadnessCheck,
  sadnessEnd,
  sadnessMax,
  sadnessStart,
  streetWidth,
} from '../public/js/animal-crowding.js';
import { SAD_PIGGY_LINES, ensurePiggyMood } from '../public/js/animal-mood.js';
import { createAnimalState } from '../public/js/animals.js?v=g414-1';
import { GAME_DAY_MS, getGameDayStartMs } from '../public/js/game-day.js';
import { advanceYard, capturePiggy, createMachine, normalizeHusbandryPack } from '../public/js/animal-husbandry.js?v=g414-1';
import { getVerbsFor } from '../public/content.js?v=g414-1';
import { animalCrowdChanged, animalMoodFeature, crowdLimit } from '../public/js/features/animal-mood-feature.js?v=g442-6';

const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const fixed = (v) => () => v;
const HOUR = 60 * 60 * 1000;

describe('getSadnessMax (animal_sadness.js 126-151, config_prod.js 1205-1221)', () => {
  it('reads the street width as |l| + |r| and falls back to the world width', () => {
    assert.equal(streetWidth({ l: -3000, r: 3000 }), 6000);
    assert.equal(streetWidth({ l: 0, r: 2400 }), 2400);
    assert.equal(streetWidth(null, 1500), 1500);
  });

  it('halves the limit on public streets', () => {
    // Hechey Track, 6000 px: piggies min(max(6 * 7, 18), 40) = 40, halved 20; chickens/butterflies min(24, 20) = 20, halved 10.
    assert.equal(sadnessMax('npc_piggy', { width: 6000 }), 20);
    assert.equal(sadnessMax('npc_chicken', { width: 6000 }), 10);
    assert.equal(sadnessMax('npc_butterfly', { width: 6000 }), 10);
    // Market St, 3000 px: 21 halves to Math.round(10.5) = 11.
    assert.equal(sadnessMax('npc_piggy', { width: 3000 }), 11);
    // A short street still holds min_max / 2.
    assert.equal(sadnessMax('npc_piggy', { width: 800 }), 9);
    assert.equal(sadnessMax('npc_chicken', { width: 800 }), 3);
  });

  it('gives your yard the whole limit and the Happy Animals cards on top', () => {
    // A 1500 px starter yard: round(1.5) = 2 → 14 piggies, raised to min_max 18.
    assert.equal(sadnessMax('npc_piggy', { width: 1500, pol: true }), 18);
    assert.equal(sadnessMax('npc_piggy', { width: 1500, pol: true, upgrades: ['herdkeeping_animal_sadness_1'] }), 20);
    assert.equal(sadnessMax('npc_piggy', { width: 1500, pol: true, upgrades: ['herdkeeping_animal_sadness_1', 'herdkeeping_animal_sadness_2'] }), 22);
    assert.equal(sadnessMax('npc_chicken', { width: 1500, pol: true }), 8);
    assert.equal(sadnessMax('npc_chicken', { width: 1500, pol: true, upgrades: ['herdkeeping_animal_sadness_1'] }), 9);
    assert.equal(sadnessMax('npc_chicken', { width: 1500, pol: true, upgrades: ['herdkeeping_animal_sadness_2'] }), 10);
    // The cards only count on your own land.
    assert.equal(sadnessMax('npc_piggy', { width: 1500, upgrades: ['herdkeeping_animal_sadness_2'] }), 9);
  });

  it('has no limit for other classes', () => {
    assert.equal(sadnessMax('npc_batterfly', { width: 6000 }), NO_LIMIT);
    assert.equal(sadnessMax('npc_fox', { width: 6000, pol: true }), NO_LIMIT);
  });
});

describe('onSadnessCheck (animal_sadness.js 65-124)', () => {
  it('uses the four chance bands', () => {
    assert.equal(crowdChance(20, 20), 0.9);
    assert.equal(crowdChance(25, 20), 0.9);
    assert.equal(crowdChance(18, 20), 0.6);
    assert.equal(crowdChance(16, 20), 0.45);
    assert.equal(crowdChance(14, 20), 0.3);
    assert.equal(crowdChance(13, 20), 0);
  });

  it('starts sadness in randInt(1, 23) seconds on a hit', () => {
    assert.deepEqual(sadnessCheck({ classId: 'npc_piggy', population: 20, max: 20, rng: fixed(0.5) }), { outcome: 'sad', delayMs: 12000, chance: 0.9 });
    // is_chance is random <= prob (common.js 351-361).
    assert.equal(sadnessCheck({ classId: 'npc_piggy', population: 20, max: 20, rng: fixed(0.9) }).outcome, 'sad');
    assert.equal(randInt(1, 23, fixed(0)), 1);
    assert.equal(randInt(1, 23, fixed(0.999)), 23);
  });

  it('sends 5% of hits at 90% of the limit away, never below it', () => {
    assert.deepEqual(sadnessCheck({ classId: 'npc_chicken', population: 9, max: 10, rng: fixed(0.03) }), { outcome: 'leave', delayMs: 7000, chance: 0.6 });
    const below = sadnessCheck({ classId: 'npc_chicken', population: 8, max: 10, rng: fixed(0.03) });
    assert.equal(below.outcome, 'sad', 'at 80% a hit only sulks');
    assert.equal(below.delayMs, 1000);
  });

  it('puffs an animal away when the roll misses at the limit', () => {
    assert.deepEqual(sadnessCheck({ classId: 'npc_butterfly', population: 10, max: 10, rng: fixed(0.95) }), { outcome: 'vanish', delayMs: 500, chance: 0.9 });
    assert.equal(sadnessCheck({ classId: 'npc_butterfly', population: 9, max: 10, rng: fixed(0.95) }).outcome, null);
  });

  it('never sends an incubating chicken away ("don\'t steal players\' eggs")', () => {
    assert.equal(sadnessCheck({ classId: 'npc_chicken', population: 10, max: 10, incubating: true, rng: fixed(0.95) }).outcome, null);
    assert.equal(sadnessCheck({ classId: 'npc_chicken', population: 10, max: 10, incubating: true, rng: fixed(0.03) }).outcome, 'sad');
    assert.equal(canStartSadness('npc_chicken', { incubating: true }), false, 'and onSadnessStart refuses it');
    assert.equal(canStartSadness('npc_piggy', { incubating: true }), true);
  });

  it('skips Batterflies, and leaves a piggy somewhere depressing to its place sadness', () => {
    assert.equal(sadnessCheck({ classId: 'npc_batterfly', population: 99, max: 1, rng: fixed(0) }).outcome, null);
    assert.deepEqual(sadnessCheck({ classId: 'npc_piggy', population: 1, max: 20, depressing: true, rng: fixed(0) }), { outcome: 'depressed', delayMs: 500, chance: 0 });
    assert.equal(sadnessCheck({ classId: 'npc_chicken', population: 1, max: 20, depressing: true, rng: fixed(0) }).outcome, null);
  });

  it('checks chickens and butterflies when one leaves, piggies only when one arrives', () => {
    assert.deepEqual({ ...CHECK_ON_REMOVE }, { npc_piggy: false, npc_chicken: true, npc_butterfly: true });
  });
});

describe('onSadnessStart / Interval / End (animal_sadness.js 153-255)', () => {
  it('is sad for 3 minutes, first line at once somewhere depressing, else 1-23 s', () => {
    assert.deepEqual(sadnessStart(1000, { rng: fixed(0) }), { until: 1000 + 180000, firstLineAt: 2000 });
    assert.deepEqual(sadnessStart(1000, { depressing: true }), { until: 181000, firstLineAt: 1000 });
    assert.equal(CROWD_TIMING.intervalMs, 30000);
    assert.equal(isCrowdSad({ crowdSadUntil: 5000 }, 4999), true);
    assert.equal(isCrowdSad({ crowdSadUntil: 5000 }, 5000), false);
  });

  it('checks again in 5 minutes while crowded, else for up to 4 spells', () => {
    assert.deepEqual(sadnessEnd({ population: 20, max: 20, spells: 7 }), { spells: 8, recheck: true });
    assert.deepEqual(sadnessEnd({ population: 10, max: 20, spells: 0 }), { spells: 1, recheck: true });
    assert.deepEqual(sadnessEnd({ population: 10, max: 20, spells: 2 }), { spells: 3, recheck: true });
    assert.deepEqual(sadnessEnd({ population: 10, max: 20, spells: 3 }), { spells: 0, recheck: false });
    assert.equal(CROWD_TIMING.recheckMs, 5 * 60 * 1000);
  });

  it('picks the source clips and lines', () => {
    assert.equal(crowdSadClip('npc_piggy', fixed(0.1)), 'rooked2');
    assert.equal(crowdSadClip('npc_piggy', fixed(0.5)), 'too_much_nibble');
    assert.equal(crowdSadClip('npc_chicken', fixed(0.5)), 'sit');
    assert.equal(crowdSadClip('npc_butterfly', fixed(0.1)), 'fly-rooked');
    assert.equal(crowdSadLinePool('npc_chicken'), CROWD_SAD_LINES);
    assert.equal(crowdSadLinePool('npc_piggy', { depressing: true, depressedLines: SAD_PIGGY_LINES }), SAD_PIGGY_LINES);
    assert.equal(crowdSadLinePool('npc_piggy', { depressing: false, depressedLines: SAD_PIGGY_LINES }), CROWD_SAD_LINES);
  });

  it('sends chickens and butterflies out of gloomy places on load (onLoad)', () => {
    assert.deepEqual(gloomOnLoad('npc_chicken', true), { outcome: 'leave', delayMs: 1000 });
    assert.deepEqual(gloomOnLoad('npc_butterfly', true), { outcome: 'vanish', delayMs: 0 });
    assert.equal(gloomOnLoad('npc_piggy', true), null);
    assert.equal(gloomOnLoad('npc_chicken', false), null);
  });
});

describe('Crowding on the street (animal-mood feature)', () => {
  const realNow = Date.now;
  let clock = 1_800_000_000_000;
  afterEach(() => {
    Date.now = realNow;
    animalMoodFeature.onStreetClear();
  });

  function street(targets, params = {}, { tsid = 'GLI2V0UN7RD1T2J', bounds = { l: -3000, r: 3000 }, pc = {} } = {}) {
    const data = {};
    const said = [];
    return {
      data,
      said,
      started: true,
      street: { tsid, hubId: '56', hubName: 'Groddle Forest', bounds },
      streetTsid: tsid,
      worldW: streetWidth(bounds),
      groundY: 500,
      pc: { energy: 80, mood: 50, imaginationUpgrades: [], ...pc },
      inv: { pig_bait: 1 },
      learnedSkills: ['herdkeeping_1'],
      inScene: () => false,
      transientInstance: () => false,
      interactables: [...targets],
      droppedItems: { streets: {} },
      textures: {},
      platforms: [],
      player: { x: 0, y: 0 },
      acting: () => false,
      param: (k) => (k in params ? params[k] : null),
      setData: (k, v) => { data[k] = v; },
      say: (t, m) => said.push([t, m]),
      save: () => {},
    };
  }
  const animal = (classId, extra = {}) => ({
    classId,
    state: createAnimalState(classId, classId === 'npc_piggy' ? { hungerAt: clock + 10 * HOUR } : {}),
    sprite: { x: 400, y: 500, vx: 0.45, range: 90, baseX: 400, scale: { x: 1 }, anchor: { y: 1 }, visible: true, destroyed: false },
    ...extra,
  });
  const herd = (classId, n) => Array.from({ length: n }, () => animal(classId));
  const tick = (engine, ms = 16) => {
    clock += ms;
    animalMoodFeature.onTick(ms, clock, engine);
  };

  it('fills a public street to its limit, then everyone sulks, shows it and refuses verbs', () => {
    Date.now = () => clock;
    const chickens = herd('npc_chicken', 10);
    const engine = street(chickens, { animalcrowdroll: '0.5' });
    assert.equal(crowdLimit(engine, 'npc_chicken'), 10);
    tick(engine); // adopt; nothing checks on load
    assert.equal(animalMoodFeature._state().crowdStats.checks, 0);
    assert.equal(animalCrowdChanged(engine, 'npc_chicken', { exclude: chickens[9] }), 9);
    assert.ok(animalMoodFeature._state().crowd.every((r) => r.mode === 'pending'));
    assert.ok(engine.data.animalCrowd.split(',').includes('npc_chicken:10/10'), engine.data.animalCrowd);
    tick(engine, 12000); // randInt(1, 23) with 0.5 → 12 s
    const modes = animalMoodFeature._state().crowd.map((r) => r.mode);
    assert.equal(modes.filter((m) => m === 'sad').length, 9);
    assert.ok(isCrowdSad(chickens[0].state, clock));
    assert.equal(chickens[0].sprite.range, 2, 'fullStop');
    // The first line comes randInt(1, 23) s later, then every 30 s.
    tick(engine, 12000);
    assert.ok(engine.said.some(([, m]) => CROWD_SAD_LINES.includes(m)));
    const verbs = animalMoodFeature.decorateVerbs(chickens[0], getVerbsFor(chickens[0], { pc: engine.pc, inv: { grain: 1 }, learned: [] }), engine);
    const squeeze = verbs.find((v) => v.id === 'squeeze');
    assert.equal(squeeze.enabled, false);
    assert.equal(squeeze.reason, "Can't do that! Chicken is sad!.");
    assert.equal(verbs.find((v) => v.id === 'butter_up').reason, 'Hold the butter! This chicken is too sad.');
    // Three minutes on, they get up, and (at the limit) will check again in 5 minutes.
    tick(engine, 3 * 60 * 1000);
    assert.equal(isCrowdSad(chickens[0].state, clock), false);
    assert.equal(chickens[0].sprite.range, 90);
    assert.equal(chickens[0].state.crowdSpells, 1);
    assert.equal(chickens[0].state.crowdCheckAt, clock + 5 * 60 * 1000);
  });

  it('sends a 5% leaver off with the OUT of here line, a puff, and a check for the rest', () => {
    Date.now = () => clock;
    const butterflies = herd('npc_butterfly', 10);
    const engine = street(butterflies, { animalcrowdroll: '0.03' });
    tick(engine);
    animalCrowdChanged(engine, 'npc_butterfly', { exclude: butterflies[9] });
    assert.equal(engine.said.filter(([, m]) => m === CROWD_LEAVE_LINE).length, 9);
    assert.ok(butterflies[0].state.crowdGone > 0, 'an ecology butterfly stays gone');
    tick(engine, 6999);
    assert.equal(engine.interactables.length, 10, 'still here for 7 s');
    tick(engine, 2);
    // They left; the one butterfly left behind checked (9 checks + 1 per departure).
    assert.deepEqual(engine.interactables, [butterflies[9]]);
    assert.ok(animalMoodFeature._state().crowdStats.checks >= 10);
  });

  it('puffs released animals away through their husbandry slot', () => {
    Date.now = () => clock;
    const finished = [];
    const piggies = herd('npc_piggy', 20).map((p, i) => Object.assign(p, {
      husbandryAnimal: `a${i}`,
      husbandryVanish: () => () => finished.push(i),
    }));
    const engine = street(piggies, { animalcrowdroll: '0.95' });
    tick(engine);
    animalCrowdChanged(engine, 'npc_piggy', { exclude: piggies[19] });
    tick(engine, 501);
    assert.equal(finished.length, 19);
    assert.equal(piggies[0].state.crowdGone, undefined, 'a released piggy leaves its slot instead');
    // Piggies leaving do not make the others check (npc_piggy.js onContainerItemRemoved).
    assert.equal(animalMoodFeature._state().crowdStats.checks, 19);
  });

  it('keeps ecology animals that left gone on the next visit, without a check', () => {
    Date.now = () => clock;
    const gone = animal('npc_piggy');
    // Left earlier the same game day (G82: it is back only after the day rolls).
    gone.state.crowdGone = Math.max(getGameDayStartMs(clock) + 1, clock - HOUR);
    const stay = animal('npc_piggy');
    const engine = street([gone, stay]);
    tick(engine);
    assert.deepEqual(engine.interactables, [stay]);
    assert.equal(gone.sprite.visible, false);
    assert.equal(animalMoodFeature._state().crowdStats.checks, 0);
  });

  it('brings an ecology animal that left before today back on the next visit, without a check (G82)', () => {
    Date.now = () => clock;
    animalMoodFeature.restore(undefined);
    const back = animal('npc_chicken');
    back.state.crowdGone = getGameDayStartMs(clock) - 1;
    const stay = animal('npc_chicken');
    const engine = street([back, stay]);
    tick(engine);
    assert.deepEqual(engine.interactables, [back, stay]);
    assert.equal(back.sprite.visible, true);
    assert.equal(back.state.crowdGone, undefined, 'the saved flag is cleared');
    assert.equal(animalMoodFeature._state().crowdStats.returned, 1);
    assert.equal(animalMoodFeature._state().crowdStats.checks, 0, 'arrivals from the archive are a load: nothing checks');
    tick(engine, 600);
    assert.equal(engine.data.animalCrowdReturned, '1');
  });

  it('walks street animals that left back at the day roll; released ones stay gone (G82)', () => {
    Date.now = () => clock;
    animalMoodFeature.restore(undefined);
    const ecology = herd('npc_piggy', 6);
    const released = herd('npc_piggy', 14);
    const engine = street([...ecology, ...released], { animalcrowdroll: '0.03' });
    const finished = [];
    released.forEach((p, i) => Object.assign(p, {
      husbandryAnimal: `a${i}`,
      husbandryVanish: () => () => {
        finished.push(i);
        engine.interactables.splice(engine.interactables.indexOf(p), 1);
      },
    }));
    tick(engine);
    animalCrowdChanged(engine, 'npc_piggy');
    tick(engine, 7001);
    assert.equal(engine.interactables.length, 0, 'all 20 said they were OUT of here and left');
    assert.equal(finished.length, 14);
    assert.ok(ecology.every((p) => p.state.crowdGone > 0 && p.sprite.visible === false));
    assert.equal(engine.data.animalCrowdLeft, '6');
    // The day rolls mid-day (a forced roll counts as much as midnight).
    tick(engine, 60000);
    assert.equal(animalMoodFeature.onNewDay(clock, engine), 6);
    assert.deepEqual(engine.interactables, ecology, 'the six street piggies are back; the released fourteen are not');
    assert.ok(ecology.every((p) => p.sprite.visible === true && p.state.crowdGone === undefined && !p._crowdGone));
    assert.equal(engine.data.animalCrowdReturned, '6');
    assert.equal(engine.data.animalCrowdLeft, '0');
    assert.deepEqual(animalMoodFeature.save(), { crowdRolledAt: clock }, 'the roll is saved');
    // A later leaver stays gone until the next roll; the saved roll survives a reload.
    const later = animal('npc_piggy');
    later.state.crowdGone = clock + 1000;
    animalMoodFeature.restore({ crowdRolledAt: clock });
    tick(engine, 2000);
    animalMoodFeature.onStreetEnter(engine.street, engine);
    const engine2 = street([later]);
    tick(engine2);
    assert.deepEqual(engine2.interactables, [], 'left after the roll: still gone');
    animalMoodFeature.restore(undefined);
    assert.equal(animalMoodFeature.save(), undefined);
  });

  it('arms the &animalcrowdrespawn=1 day roll only once the leavers are gone (G82)', () => {
    Date.now = () => clock;
    const piggies = herd('npc_piggy', 20);
    const engine = street(piggies, { animalcrowdroll: '0.03', animalcrowdrespawn: '1' });
    tick(engine);
    animalCrowdChanged(engine, 'npc_piggy');
    tick(engine, 1001);
    assert.equal(engine.data.animalCrowdRespawn, '', 'still saying goodbye');
    tick(engine, 6000);
    tick(engine, 1001);
    assert.equal(engine.data.animalCrowdRespawn, 'armed');
    // 1.5 s later it sets the saved game day back one day; the game's own poll rolls it.
    const store = new Map();
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    });
    try {
      tick(engine, 1600);
      tick(engine, 600);
      assert.equal(engine.data.animalCrowdRespawn, 'rolled');
      assert.equal(Number(store.get('groddle_last_new_day_ts')), clock - 600 - GAME_DAY_MS);
    } finally {
      if (had) Object.defineProperty(globalThis, 'localStorage', had);
      else delete globalThis.localStorage;
    }
  });

  it('resumes a saved sulk and runs a check that fell due while you were away', () => {
    Date.now = () => clock;
    const sulking = animal('npc_piggy');
    sulking.state.crowdSadUntil = clock + 60000;
    const due = animal('npc_piggy');
    due.state.crowdCheckAt = clock - 1;
    const engine = street([sulking, due], { animalcrowdroll: '0.99' });
    tick(engine);
    assert.equal(animalMoodFeature._state().crowd.find((r) => r.target === sulking)?.mode, 'sad');
    assert.equal(due.state.crowdCheckAt, undefined, 'the due check ran (2 of 20: nothing happens)');
    assert.equal(animalMoodFeature._state().crowdStats.checks, 1);
  });

  it('turns a crowd-sad piggy\'s verbs off, keeps the capture cooldown and still catches it', () => {
    Date.now = () => clock;
    normalizeHusbandryPack({ captures: { GLI2V0UN7RD1T2J: clock } });
    const piggy = animal('npc_piggy');
    piggy.state.crowdSadUntil = clock + 60000;
    const engine = street([piggy]);
    const verbs = getVerbsFor(piggy, { pc: engine.pc, inv: engine.inv, learned: engine.learnedSkills, streetTsid: engine.streetTsid });
    const out = animalMoodFeature.decorateVerbs(piggy, verbs, engine);
    assert.equal(out.find((v) => v.id === 'pet').reason, "Can't do that! Piggy is sad!.");
    assert.equal(out.find((v) => v.id === 'capture').enabled, false, 'crowding is not a depressing place: the cooldown stays');
    normalizeHusbandryPack({});
    const res = capturePiggy(piggy.state, { pc: { energy: 50, mood: 10 }, inv: { pig_bait: 1 }, learned: ['herdkeeping_1'], streetTsid: 'X', sad: true, depressing: false, rng: fixed(0.99) });
    assert.equal(res.ok, true, 'a sad piggy is always caught (npc_piggy.js 439-444)');
    normalizeHusbandryPack({});
  });

  it('sends chickens and butterflies away from a gloomy street on arrival', () => {
    Date.now = () => clock;
    const chicken = animal('npc_chicken');
    const butterfly = animal('npc_butterfly');
    const engine = street([chicken, butterfly], {}, { tsid: 'GA9114MS8B32FB2', bounds: { l: -1500, r: 1500 } });
    engine.street.hubId = '78';
    engine.street.hubName = 'Ilmenskie Deeps';
    animalMoodFeature.onStreetEnter(engine.street, engine);
    tick(engine);
    assert.deepEqual(engine.interactables, [chicken], 'the butterfly is deleted at once');
    tick(engine, 1000);
    assert.deepEqual(engine.interactables, [], 'the chicken leaves a second later');
    assert.ok(chicken.state.crowdGone > 0);
  });

  it('uses your yard\'s full limit and your Happy Animals card', () => {
    const engine = street([], {}, { tsid: 'RH_HOME_EXT', bounds: { l: 0, r: 1500 }, pc: { imaginationUpgrades: ['herdkeeping_animal_sadness_1'] } });
    assert.equal(crowdLimit(engine, 'npc_piggy'), 20);
    engine.pc.imaginationUpgrades.push('herdkeeping_animal_sadness_2');
    assert.equal(crowdLimit(engine, 'npc_piggy'), 22);
  });
});

describe('Back yard replay (advanceYard) and crowding', () => {
  const piggy = (state = {}) => ({ id: 'p', classId: 'npc_piggy', x: 500, state: ensurePiggyMood({ mood: 1, hunger: 1, ...state }, 0) });

  it('skips a sulking piggy\'s tick and the Meat Collector skips it', () => {
    const sad = piggy({ hunger: 0, hungerAt: 1000, crowdSadUntil: 10 * HOUR });
    const yard = { animals: [sad], machines: [createMachine('meat_collector', 900, 0)] };
    yard.machines[0].nextAt = 1000;
    advanceYard(yard, 2000, { rng: fixed(0.99) });
    assert.equal(sad.state.hunger, 0, 'no tick while sad (onTwiceDaily 1834)');
    assert.equal(yard.machines[0].inside, 0, 'meat_collector.js 371');
  });

  it('feeds a hungry piggy from a yard stack first, then a tree, while you are away', () => {
    const p = piggy({ hunger: 1, hungerAt: 1000, isDaily: 0 });
    const stacks = [{ classTsid: 'potato', count: 1, x: 520 }];
    const tree = { classTsid: 'trant_fruit', fruitCount: 2 };
    const yard = { animals: [p], machines: [] };
    const events = advanceYard(yard, 1000 + 2 * 4 * HOUR, { food: { stacks, trees: [tree] }, deathRng: fixed(0.99) });
    const ate = events.filter((e) => e.type === 'ate');
    assert.deepEqual(ate.map((e) => e.kind), ['stack', 'trant', 'trant']);
    assert.equal(stacks[0].count, 0);
    assert.equal(tree.fruitCount, 0);
    assert.equal(p.state.hunger, 0);
  });

  it('keeps stacks outside a Magic Pig Stick\'s range out of reach', () => {
    const p = piggy({ hunger: 3, hungerAt: 1000 });
    const stacks = [{ classTsid: 'potato', count: 1, x: 2000 }];
    const events = advanceYard({ animals: [p], machines: [] }, 1001, { food: { stacks, trees: [], stick: { x: 500, distance: 300 } } });
    assert.equal(events.filter((e) => e.type === 'ate').length, 0);
    assert.equal(stacks[0].count, 1);
  });
});

describe('Crowding source copy (GSJS)', { skip: !existsSync(GSJS) }, () => {
  it('quotes animal_sadness.js, the verb reasons, population_controls and the cards exactly', () => {
    const sadness = readFileSync(join(GSJS, 'items/include/animal_sadness.js'), 'utf8');
    for (const line of [CROWD_LEAVE_LINE, ...CROWD_SAD_LINES]) assert.ok(sadness.includes(`"${line}"`), line);
    assert.ok(sadness.includes("this.apiSetTimer('onSadnessEnd', 3 * 60 * 1000);"));
    assert.ok(sadness.includes('max += Math.round(max*0.2);'));
    for (const [cls, reasons] of Object.entries(CROWD_SAD_REASONS)) {
      const src = readFileSync(join(GSJS, `items/${cls}.js`), 'utf8');
      for (const reason of Object.values(reasons)) assert.ok(src.includes(reason), `${cls}: ${reason}`);
    }
    const config = readFileSync(join(GSJS, 'config_prod.js'), 'utf8');
    const block = config.slice(config.indexOf('var population_controls'), config.indexOf('var hubs'));
    for (const [cls, c] of Object.entries(POPULATION_CONTROLS)) {
      const row = block.slice(block.indexOf(`'${cls}'`));
      assert.match(row, new RegExp(`per_width: ${c.perWidth},\\s+min_max: ${c.minMax},\\s+max_max: ${c.maxMax}`), cls);
    }
    const cards = readFileSync(join(GSJS, 'inc_data_imagination.js'), 'utf8');
    assert.ok(cards.includes('name: "Happy Animals"'));
    assert.ok(cards.includes('name: "Super Happy Animals"'));
  });
});

describe('Street animals respawn at the day roll (G82)', () => {
  it('uses the later of the game-day start and the last roll as the boundary', () => {
    const t = 1_800_000_000_000;
    const start = getGameDayStartMs(t);
    assert.equal(crowdRespawnBoundary(t), start);
    assert.equal(crowdRespawnBoundary(t, start - GAME_DAY_MS), start);
    assert.equal(crowdRespawnBoundary(t, t - 5), t - 5, 'a forced roll today counts');
  });

  it('brings back only animals that left before the boundary', () => {
    assert.equal(crowdGoneReturns(99, 100), true);
    assert.equal(crowdGoneReturns(100, 100), false);
    assert.equal(crowdGoneReturns(0, 100), false, 'never left');
    assert.equal(crowdGoneReturns(undefined, 100), false);
  });
});
