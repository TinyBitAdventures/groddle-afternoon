import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  DISALLOW_ANIMALS_TSIDS,
  NIBBLE_NA_FAIL,
  PIGGY_LINES,
  PIGGY_STARVATION_DEATH,
  PIGGY_TICK_MS,
  SAD_BABY,
  SAD_PIGGY_LINES,
  advancePiggies,
  ensurePiggyMood,
  incPiggyMood,
  isSadIn,
  locationIsDepressing,
  piggyNibbleRefusal,
  piggyTwiceDailyTick,
  piggyWalkSpeed,
} from '../public/js/animal-mood.js';
import { createAnimalState, animalStatusLabel, resetAnimalDay } from '../public/js/animals.js';
import { performAnimalKinship } from '../public/js/animal-kinship.js';
import { advanceYard, capturePiggy, captureVerbState, feedPiggyStack, normalizeHusbandryPack } from '../public/js/animal-husbandry.js';
import { getVerbsFor, runVerb } from '../public/content.js';
import { animalMoodFeature, describeAnimalPlace } from '../public/js/features/animal-mood-feature.js';
import { remakeStatus } from '../public/js/imagination-remake.js';
import { animalHusbandryFeature } from '../public/js/features/animal-husbandry-feature.js';

const here = dirname(fileURLToPath(import.meta.url));
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS/items');
const AK6 = ['animalkinship_1', 'animalkinship_2', 'animalkinship_3', 'animalkinship_4', 'animalkinship_5', 'animalkinship_6'];

describe('locationIsDepressing (include/animal_sadness.js)', () => {
  it('maps the source hubs, forced streets, Hell, subways and instances', () => {
    assert.equal(locationIsDepressing({ tsid: 'GA9114MS8B32FB2', hubId: '50', hubName: 'Ilmenskie Caverns' }), true);
    assert.equal(locationIsDepressing({ tsid: 'X', hubId: '78' }), true);
    assert.equal(locationIsDepressing({ tsid: 'X', hubName: 'The Seams' }), true);
    assert.equal(locationIsDepressing({ tsid: 'X', hubId: '77' }), true);
    for (const hub of ['90', '86', '91', '95']) assert.equal(locationIsDepressing({ tsid: 'X', hubId: hub }), true, hub);
    assert.equal(locationIsDepressing({ tsid: 'GCR10K3BPJK1U6F', hubId: '56', hubName: 'Groddle Forest', label: 'Otterlane' }), false);
    assert.equal(locationIsDepressing({ tsid: 'X', hubId: '122' }), false);
    assert.equal(locationIsDepressing({ tsid: 'GA5PPFP86NF2FOS' }), true, 'Hell One');
    assert.equal(locationIsDepressing({ tsid: 'X', hubId: '40' }), true, 'Naraka');
    assert.equal(locationIsDepressing({ tsid: 'X', label: 'GFJ Subway Station' }), true);
    assert.equal(locationIsDepressing({ tsid: 'X', instance: true }), true);
    assert.equal(locationIsDepressing({ tsid: 'X', instance: true, newxp: true }), false);
    assert.equal(locationIsDepressing({ tsid: 'X', hubId: '50', race: true }), false, 'races are never sad');
    assert.equal(locationIsDepressing({ tsid: 'X', hubId: '50', game: true }), false);
    assert.equal(locationIsDepressing({ tsid: 'X', tower: true }), true);
  });

  it('carries the 461 disallow_animals streets, each a remake street', () => {
    assert.equal(DISALLOW_ANIMALS_TSIDS.size, 461);
    assert.equal(locationIsDepressing({ tsid: 'GA512T760J52JMS' }), true);
    for (const tsid of DISALLOW_ANIMALS_TSIDS) {
      assert.ok(existsSync(join(here, '../public/assets/streets', `${tsid}.json`)), tsid);
    }
  });

  it('makes only piggies and the three babies sad', () => {
    for (const cls of ['npc_piggy', 'chick', 'piglet', 'caterpillar']) assert.equal(isSadIn(cls, true), true);
    for (const cls of ['npc_chicken', 'npc_butterfly', 'npc_batterfly']) assert.equal(isSadIn(cls, true), false);
    assert.equal(isSadIn('npc_piggy', false), false);
  });

  it('reads the engine street and treats races and the Hog Haul as games', () => {
    const base = { street: { tsid: 'GA9114MS8B32FB2', hubId: '50', hubName: 'Ilmenskie Caverns', label: 'Churni Sanctum' }, streetTsid: 'GA9114MS8B32FB2', inScene: () => false, transientInstance: () => false };
    assert.equal(locationIsDepressing(describeAnimalPlace(base)), true);
    assert.equal(locationIsDepressing(describeAnimalPlace({ ...base, inScene: () => true })), false);
    const hog = { street: { tsid: 'GHVJQH26ERF3VMJ' }, streetTsid: 'GHVJQH26ERF3VMJ', inScene: () => false, transientInstance: () => true };
    assert.equal(locationIsDepressing(describeAnimalPlace(hog)), false);
  });
});

describe('Piggy mood and hunger (npc_piggy.js onTwiceDaily)', () => {
  it('starts at mood 1 and migrates older saves without locking nibble', () => {
    const t = 1_000_000;
    const fresh = ensurePiggyMood({}, t);
    assert.equal(fresh.mood, 1);
    assert.equal(fresh.hunger, 0);
    assert.equal(fresh.hungerAt, t + PIGGY_TICK_MS);
    assert.equal(fresh.isDaily, 1);
    const legacy = ensurePiggyMood({ hunger: 3, petted: true }, t);
    assert.equal(legacy.hunger, 2, 'the old 0..3 day counter holds at 2');
    assert.equal(legacy.mood, 1);
    const yard = ensurePiggyMood({ hunger: 7, hungerAt: t + 5 }, t);
    assert.equal(yard.hunger, 7, 'a yard piggy already on the source clock keeps its hunger');
    assert.equal(createAnimalState('npc_piggy').mood, 1);
    assert.ok(Number.isFinite(createAnimalState('npc_piggy').hungerAt));
  });

  it('loses a mood every game day (has_been_petted is never set) and stays in 0..2', () => {
    const s = ensurePiggyMood({ mood: 2, hunger: 0 }, 0);
    piggyTwiceDailyTick(s); // is_daily 1 -> 0: half day
    assert.equal(s.mood, 2);
    piggyTwiceDailyTick(s); // daily
    assert.equal(s.mood, 1);
    piggyTwiceDailyTick(s);
    piggyTwiceDailyTick(s);
    assert.equal(s.mood, 0);
    piggyTwiceDailyTick(s);
    piggyTwiceDailyTick(s);
    assert.equal(s.mood, 0);
    assert.equal(incPiggyMood(s, 1), 1);
    incPiggyMood(s, 1);
    assert.equal(incPiggyMood(s, 1), 0);
    assert.equal(s.mood, 2);
  });

  it('cheers a mood-0 piggy up when the others average mood 1', () => {
    const s = ensurePiggyMood({ mood: 0, hunger: 0, isDaily: 0 }, 0);
    const events = piggyTwiceDailyTick(s, { neighbourMoods: [1, 2, 0] });
    assert.equal(s.mood, 1);
    assert.deepEqual(events.map((e) => e.type), ['happy']);
    assert.equal(events[0].line, 'Other animals make me happy!');
    const lonely = ensurePiggyMood({ mood: 0, isDaily: 0 }, 0);
    assert.equal(piggyTwiceDailyTick(lonely, { neighbourMoods: [0, 1] }).length, 0);
    assert.equal(lonely.mood, 0);
  });

  it('gets hungry every half day to 2, then once a game day to 10, and croaks', () => {
    const s = ensurePiggyMood({ hunger: 0 }, 0);
    const seen = [];
    for (let i = 0; i < 20; i += 1) {
      piggyTwiceDailyTick(s);
      seen.push(s.hunger);
    }
    assert.deepEqual(seen.slice(0, 5), [1, 2, 2, 3, 3]);
    assert.equal(seen[17], 10);
    const events = piggyTwiceDailyTick(s, { rng: () => 0 });
    assert.deepEqual(events.map((e) => e.type), ['croak']);
    assert.equal(events[0].line, "I'm about to croak!");
    assert.equal(s.croaking, true);
    assert.equal(s.hunger, 10);
  });

  it('keeps starvation death off unless enabled', () => {
    assert.equal(PIGGY_STARVATION_DEATH, false);
    const s = ensurePiggyMood({ hunger: 10, hungerAt: 1 }, 0);
    assert.ok(!piggyTwiceDailyTick(s, { rng: () => 0 }).some((e) => e.type === 'die'));
    const t = ensurePiggyMood({ hunger: 10, hungerAt: 1 }, 0);
    assert.deepEqual(piggyTwiceDailyTick(t, { rng: () => 0, deathEnabled: true }).map((e) => e.type), ['croak', 'die']);
    const u = ensurePiggyMood({ hunger: 10, hungerAt: 1 }, 0);
    assert.ok(!piggyTwiceDailyTick(u, { rng: () => 0.6, deathEnabled: true }).some((e) => e.type === 'die'));
  });

  it('skips the tick while sad or rooked', () => {
    const s = ensurePiggyMood({ mood: 1, hunger: 0 }, 0);
    assert.deepEqual(piggyTwiceDailyTick(s, { sad: true }), []);
    assert.deepEqual(piggyTwiceDailyTick(s, { rooked: true }), []);
    assert.equal(s.hunger, 0);
    assert.equal(s.isDaily, 1);
  });

  it('sends a hungry piggy to food and replays an absence in time order', () => {
    const s = ensurePiggyMood({ hunger: 0 }, 0);
    const food = { kind: 'stack', id: 'w1' };
    assert.deepEqual(piggyTwiceDailyTick(s, { findFood: () => food }).map((e) => e.type), ['seek']);

    const t0 = 0;
    const rows = [
      { state: ensurePiggyMood({ hunger: 0, mood: 1 }, t0) },
      { state: ensurePiggyMood({ hunger: 0, mood: 1 }, t0) },
    ];
    let meals = 3;
    advancePiggies(rows, t0 + PIGGY_TICK_MS * 10, {
      ctxFor: () => ({ findFood: () => (meals > 0 ? food : null) }),
      eat: (row) => {
        meals -= 1;
        row.state.hunger = 0;
        return true;
      },
    });
    assert.equal(meals, 0, 'three meals eaten across the absence');
    assert.equal(rows[0].state.hungerAt, t0 + PIGGY_TICK_MS * 11);
    assert.ok(rows.every((r) => r.state.mood === 1), 'two piggies keep cheering each other back to 1');
    const solo = [{ state: ensurePiggyMood({ hunger: 0, mood: 1 }, t0) }];
    advancePiggies(solo, t0 + PIGGY_TICK_MS * 10);
    assert.equal(solo[0].state.mood, 0, 'alone, a day without a pet costs its mood');
  });

  it('walks at randInt(30,55) - hunger px/s', () => {
    assert.equal(piggyWalkSpeed(0, () => 0), 30);
    assert.equal(piggyWalkSpeed(9, () => 0.999), 46);
  });

  it('feeding a crop of base cost 5+ clears hunger and the croak', () => {
    const s = ensurePiggyMood({ hunger: 10, croaking: true, hungerAt: 1 }, 0);
    assert.equal(s.croaking, true);
    assert.match(animalStatusLabel('npc_piggy', s), /croak/);
    feedPiggyStack(s, 'apple', 1);
    assert.equal(s.hunger, 0);
    assert.equal(s.croaking, false);
    assert.match(animalStatusLabel('npc_piggy', s), /porcine|ready|Fed/);
  });

  it('new game days no longer bump piggy hunger (the tick owns it)', () => {
    const s = createAnimalState('npc_piggy', { hunger: 1 });
    resetAnimalDay('npc_piggy', s);
    assert.equal(s.hunger, 1);
  });
});

describe('Nibble mood gate (npc_piggy.js 862-910)', () => {
  const pc = () => ({ energy: 100, mood: 40, imagination: 0, xp: 0 });

  it('refuses at mood 0 or hunger > 2 without spending anything; a pet fixes mood', () => {
    const s = createAnimalState('npc_piggy', { mood: 0, hunger: 0 });
    const player = pc();
    const inv = {};
    assert.equal(piggyNibbleRefusal(s).reason, 'mood');
    const refused = performAnimalKinship(s, 'npc_piggy', 'nibble', { pc: player, inv, learned: AK6, rng: () => 0.5 });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'not_in_mood');
    assert.equal(refused.msg, PIGGY_LINES.nibbleRefused);
    assert.equal(player.energy, 100);
    assert.equal(inv.meat, undefined);
    assert.equal(s.nibbleUsesToday, 0);

    const pet = performAnimalKinship(s, 'npc_piggy', 'pet', { pc: player, inv, learned: AK6, rng: () => 0.5 });
    assert.equal(pet.ok, true);
    assert.equal(s.mood, 1);
    assert.equal(performAnimalKinship(s, 'npc_piggy', 'nibble', { pc: player, inv, learned: AK6, rng: () => 0.5 }).ok, true);
    assert.ok(inv.meat > 0);

    const hungry = createAnimalState('npc_piggy', { mood: 2, hunger: 3, hungerAt: 1 });
    assert.equal(piggyNibbleRefusal(hungry).reason, 'hunger');
    assert.equal(performAnimalKinship(hungry, 'npc_piggy', 'nibble', { pc: pc(), inv: {}, learned: AK6 }).reason, 'not_in_mood');
  });

  it('still asks for love first below Animal Kinship VI (source branch order)', () => {
    const s = createAnimalState('npc_piggy', { mood: 0 });
    const res = performAnimalKinship(s, 'npc_piggy', 'nibble', { pc: pc(), inv: {}, learned: [] });
    assert.equal(res.reason, 'needs_pet');
  });

  it('keeps the nibble verb enabled (the refusal is in the handler) and content.js refuses it', () => {
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy', { mood: 0 }) };
    const player = pc();
    const nibble = getVerbsFor(target, { pc: player, inv: {}, learned: AK6 }).find((v) => v.id === 'nibble');
    assert.equal(nibble.enabled, true);
    const res = runVerb(target, 'nibble', { pc: player, inv: {}, learned: AK6, rng: () => 0.5 });
    assert.equal(res.ok, false);
    assert.ok(res.msgs.includes(PIGGY_LINES.nibbleRefused));
    assert.equal(player.energy, 100);
  });
});

describe('animal-mood feature verbs', () => {
  function fakeEngine(street) {
    const calls = [];
    return {
      calls,
      street,
      streetTsid: street.tsid,
      inScene: () => false,
      transientInstance: () => false,
      inv: { pig_bait: 1 },
      learnedSkills: [...AK6, 'herdkeeping_1'],
      pc: { energy: 80, mood: 50 },
      interactables: [],
      toast: (m) => calls.push(['toast', m]),
      pushActivity: (m) => calls.push(['activity', m]),
      say: (t, m) => calls.push(['say', m]),
      setData: () => {},
      param: () => null,
    };
  }

  it('turns a sad piggy\'s verbs off with the source reasons and lets capture through', () => {
    normalizeHusbandryPack({ captures: { GA9114MS8B32FB2: Date.now() } });
    const engine = fakeEngine({ tsid: 'GA9114MS8B32FB2', hubId: '50', hubName: 'Ilmenskie Caverns' });
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy') };
    const verbs = getVerbsFor(target, { pc: engine.pc, inv: engine.inv, learned: engine.learnedSkills, streetTsid: engine.streetTsid });
    const out = animalMoodFeature.decorateVerbs(target, verbs, engine);
    for (const id of ['pet', 'nibble', 'feed']) {
      const v = out.find((x) => x.id === id);
      assert.equal(v.enabled, false, id);
      assert.equal(v.reason, "Can't do that! Piggy is sad!.");
    }
    const capture = out.find((x) => x.id === 'capture');
    assert.equal(verbs.find((x) => x.id === 'capture').enabled, false, 'the location cooldown applies elsewhere');
    assert.equal(capture.enabled, true, 'no capture cooldown where animals are sad');
    normalizeHusbandryPack({});
  });

  it('makes a refusing nibble instant and answers it with the source lines', () => {
    const engine = fakeEngine({ tsid: 'GCR10K3BPJK1U6F', hubId: '56', hubName: 'Groddle Forest' });
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy', { mood: 0 }), sprite: {} };
    const verbs = getVerbsFor(target, { pc: engine.pc, inv: engine.inv, learned: engine.learnedSkills });
    const nibble = animalMoodFeature.decorateVerbs(target, verbs, engine).find((v) => v.id === 'nibble');
    assert.equal(nibble.enabled, true);
    assert.equal(nibble.durationMs, 0);
    assert.equal(animalMoodFeature.runVerbOverride(target, 'nibble', engine), true);
    assert.deepEqual(engine.calls.find((c) => c[0] === 'activity'), ['activity', PIGGY_LINES.nibbleRefused]);
    assert.ok(NIBBLE_NA_FAIL.includes(engine.calls.find((c) => c[0] === 'say')[1]));
    target.state.mood = 1;
    assert.equal(animalMoodFeature.runVerbOverride(target, 'nibble', engine), null);
    assert.equal(animalMoodFeature.decorateVerbs(target, verbs, engine), null);
  });

  it('turns the pack babies sad in a depressing place (chick.js, piglet.js, caterpillar.js)', () => {
    const cave = fakeEngine({ tsid: 'GA9114MS8B32FB2', hubId: '78', hubName: 'Ilmenskie Deeps' });
    cave.inv = { piglet: 1, potato: 3, chick: 1, grain: 5 };
    cave.pc = { energy: 50, mood: 50 };
    cave.updateHud = () => {};
    cave.achievement = () => {};
    const feed = animalHusbandryFeature.packVerbs('piglet', cave).find((v) => v.id === 'feed');
    assert.equal(feed.enabled, false);
    assert.equal(feed.reason, SAD_BABY.piglet.feedReason);
    assert.equal(animalHusbandryFeature.runPackVerb('piglet', 'hum_to', cave), true);
    assert.equal(cave.pc.mood, 48);
    assert.equal(cave.pc.energy, 48);
    assert.equal(cave.calls.find((c) => c[0] === 'activity')[1].base, SAD_BABY.piglet.extraVerb.msg);
    animalHusbandryFeature.runPackVerb('chick', 'smile_at', cave);
    assert.equal(cave.pc.mood, 43);
    const forest = fakeEngine({ tsid: 'GCR10K3BPJK1U6F', hubId: '56', hubName: 'Groddle Forest' });
    forest.inv = { piglet: 1, potato: 3 };
    assert.equal(animalHusbandryFeature.packVerbs('piglet', forest).find((v) => v.id === 'feed').enabled, true);
  });

  it('captures a sad piggy every time', () => {
    normalizeHusbandryPack({});
    const pc = { energy: 80, mood: 10 };
    const inv = { pig_bait: 1 };
    const res = capturePiggy({}, { pc, inv, learned: ['herdkeeping_1'], streetTsid: 'S', sad: true, rng: () => 0.99 });
    assert.equal(res.ok, true);
    assert.equal(captureVerbState({ inv: {}, learned: ['herdkeeping_1'], energy: 80, streetTsid: 'S', depressing: true }).reason, 'You are too exhausted to capture another Piggy right now.');
    normalizeHusbandryPack({});
  });
});

describe('Back yard herd (advanceYard) moods', () => {
  it('replays mood loss and cheers through the yard tick', () => {
    const t0 = 0;
    const yard = {
      animals: [
        { classId: 'npc_piggy', state: { hunger: 0, mood: 0, isDaily: 0, hungerAt: t0 + 1000 } },
        { classId: 'npc_piggy', state: { hunger: 0, mood: 2, isDaily: 0, hungerAt: t0 + 2000 } },
      ],
      machines: [],
    };
    const events = advanceYard(yard, t0 + 3000);
    assert.equal(yard.animals[0].state.mood, 1, 'the other piggy (mood 2) cheers it up');
    assert.equal(events.filter((e) => e.type === 'happy').length, 1);
    assert.equal(yard.animals[1].state.mood, 1);
  });
});

describe('Source copy (GSJS)', { skip: !existsSync(GSJS) }, () => {
  it('quotes the piggy, baby and sadness lines exactly', () => {
    const piggy = readFileSync(join(GSJS, 'npc_piggy.js'), 'utf8');
    for (const line of [PIGGY_LINES.croak, PIGGY_LINES.yum, PIGGY_LINES.happy, PIGGY_LINES.sad, PIGGY_LINES.sadName, ...NIBBLE_NA_FAIL, ...SAD_PIGGY_LINES]) {
      assert.ok(piggy.includes(line), line);
    }
    assert.ok(piggy.includes('That " + this.name_single + " doesn\'t feel like being nibbled right now.'));
    assert.ok(piggy.includes('this.apiSetTimer(\'die\', 500);'), 'the death line PIGGY_STARVATION_DEATH cites');
    for (const [cls, sad] of Object.entries(SAD_BABY)) {
      const src = readFileSync(join(GSJS, `${cls}.js`), 'utf8');
      assert.ok(src.includes(sad.feedReason), `${cls} feed`);
      if (sad.extraVerb) assert.ok(src.includes(sad.extraVerb.msg), `${cls} verb`);
    }
  });
});

describe('Imagination card notes', () => {
  it('keeps the herdkeeping sadness cards out of the shop until crowding limits exist', () => {
    const { status, note } = remakeStatus('herdkeeping_animal_sadness_1');
    assert.equal(status, 'later');
    assert.match(note, /crowd/i);
  });
});
