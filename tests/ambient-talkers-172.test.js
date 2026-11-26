/**
 * Report #172 (register G629 open calls, Austin 2026-11-26): every ambient talker's line comes as
 * often, and stays up as long, as it did in Glitch. Each row names the source (GameServerJS, CC0)
 * and checks that the source says that number, then that ours is the same. Then the two places the
 * remake did not match: a croaking Piggy's first croak (every croaking Piggy on a street spoke 2 s
 * after you arrived, and 1.5 s after a tick, where the source's minute-long interval runs on the
 * Piggy), and the Huge rock's "I am huuuuuuuuuge!", which only online games said.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CROAK_INTERVAL_MS, PIGGY_LINES, SAD_INTERVAL_MS, nextCroakDelayMs } from '../public/js/animal-mood.js?v=c8cc8797';
import { CROWD_TIMING } from '../public/js/animal-crowding.js?v=1d19c205';
import { createAnimalState } from '../public/js/animals.js?v=be02c11e';
import { CHICKEN_SCARE } from '../public/js/chicken-scare.js?v=1df29bf0';
import { CRAB_REPLY_MS } from '../public/js/crabs.js?v=0d17853d';
import { KITTY_MOTION } from '../public/js/heli-kitties.js?v=e4af4096';
import { JUJU_BANDIT } from '../public/js/juju-bandits.js?v=0d3af5fe';
import { LOW_FUEL_BUBBLE_MS, LOW_FUEL_REPEAT_MS } from '../public/js/machine-art.js?v=d3381a4b';
import { MEGA_ROCK_LINE } from '../public/js/mining.js?v=7ecaa572';
import { LONELY_RULES } from '../public/js/spirit-loneliness.js?v=9259917d';
import { COPY as STREET_OBJECT_COPY } from '../public/js/street-objects.js?v=af409b82';
import { POISON_BUBBLE_EVERY_MS, POISON_BUBBLE_SHOW_MS, POISON_FIRST_BUBBLE_MS } from '../public/js/tree-poison.js?v=646d1bc1';
import { animalMoodFeature } from '../public/js/features/animal-mood-feature.js?v=4b7f5d64';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = [join(ROOT, '..', 'glitch-GameServerJS', 'items'), join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS/items')].find((p) => existsSync(p));
const gsjs = (file) => readFileSync(join(GSJS, file), 'utf8');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** [talker, source file, what the source says (a literal), ours, Glitch's number]. */
const TALKERS = [
  ['Piggy croak, interval', 'npc_piggy.js', "this.apiSetInterval('onCroaking', 1);", CROAK_INTERVAL_MS, 60_000],
  ['Piggy croak, on screen', 'npc_piggy.js', `this.sendBubble("I'm about to croak!", 10*1000);`, PIGGY_LINES.croakMs, 10_000],
  ['Piggy happy (twice-daily tick), on screen', 'npc_piggy.js', 'this.sendBubble("Other animals make me happy!", 3*1000);', PIGGY_LINES.happyMs, 3000],
  ['Piggy Yum!, on screen', 'npc_piggy.js', 'this.sendBubble("Yum!", 3*1000);', PIGGY_LINES.yumMs, 3000],
  ['Sad animal, interval', 'include/animal_sadness.js', "this.apiSetTimer('onSadnessInterval', 30 * 1000);", SAD_INTERVAL_MS, 30_000],
  ['Sad animal, interval (crowded)', 'include/animal_sadness.js', "this.apiSetTimer('onSadnessInterval', 30 * 1000);", CROWD_TIMING.intervalMs, 30_000],
  ['Sad animal, on screen', 'include/animal_sadness.js', "this.sendBubble(this.getSadnessResponse(), 7000);", CROWD_TIMING.bubbleMs, 7000],
  ['Huge rock, delay after it reforms', 'include/mining.js', "this.apiSetTimer('onMegaRoxx', 1000);", MEGA_ROCK_LINE.delayMs, 1000],
  ['Huge rock, on screen', 'include/mining.js', 'this.sendBubble("I am huuuuuuuuuge!", 5000);', MEGA_ROCK_LINE.ms, 5000],
  ['Crab reply, on screen', 'npc_crab.js', 'this.sendBubble(details.reply, 4000, pc, rewards);', CRAB_REPLY_MS, 4000],
  ['Chicken Squawk!, on screen', 'npc_chicken.js', "this.sendBubble('Squawk!', 1*1000);", CHICKEN_SCARE.lineMs, 1000],
  ['Heli Kitty Mew!, on screen', 'npc_kitty_chicken.js', "this.sendBubble('Mew!', 1*1000);", KITTY_MOTION.mewBubbleMs, 1000],
  ['Lonely Uralia spirit, first line', 'street_spirit_zutto.js', "this.apiSetTimer('declareLoneliness', randInt(5000, 10000));", LONELY_RULES.zuttoFirstMs, [5000, 10_000]],
  ['Lonely Uralia spirit, interval', 'street_spirit_zutto.js', "this.apiSetTimer('declareLoneliness', randInt(10000, 15000));", LONELY_RULES.zuttoEveryMs, [10_000, 15_000]],
  ['Lonely spirit, porthole plea', '../players/inc_world_events.js', 'args.duration = 14500', LONELY_RULES.announceMs, 14_500],
  ['Lonely spirit, party start, on screen', 'include/loneliness.js', 'this.sendBubble(text, 5000, pc);', LONELY_RULES.partyStartBubbleMs, 5000],
  ['Lonely spirit, party jabber, delay', 'include/loneliness.js', "this.apiSetTimer('lonelinessPartyJabber', 55000);", LONELY_RULES.partyJabberMs, 55_000],
  ['Machine low on fuel, interval', 'fuelmaker.js', "this.apiSetTimer('lowFuelAlert', 30*1000);", LOW_FUEL_REPEAT_MS, 30_000],
  ['Machine low on fuel, on screen', 'fuelmaker.js', "this.sendBubble('I am low on fuel!', 10000);", LOW_FUEL_BUBBLE_MS, 10_000],
  ['Juju Bandit declaration, interval', 'npc_juju_bandit.js', "this.apiSetTimer('makeDeclaration', 15000 + Math.random() * 5000);", [JUJU_BANDIT.redeclareMs, JUJU_BANDIT.redeclareMs + JUJU_BANDIT.redeclareJitterMs], [15_000, 20_000]],
  ['Poisoned tree, first line', 'include/trants.js', "this.apiSetTimer('onPoisoned', 3*1000);", POISON_FIRST_BUBBLE_MS, 3000],
  ['Poisoned tree, interval', 'include/trants.js', "this.apiSetTimer('onPoisoned', 30*1000);", POISON_BUBBLE_EVERY_MS, 30_000],
  ['Poisoned tree, on screen (source)', 'include/trants.js', 'this.sendBubble(phrase, 3*1000);', POISON_BUBBLE_SHOW_MS, 3000],
];

describe('Ambient talkers match Glitch (#172)', () => {
  for (const [talker, file, literal, ours, glitch] of TALKERS) {
    it(`${talker}: ${JSON.stringify(glitch)} ms`, () => {
      if (GSJS) assert.ok(gsjs(file).includes(literal), `${file} says ${literal}`);
      assert.deepEqual(ours, glitch);
    });
  }

  it('the Huge rock says the source\'s line, solo and online', () => {
    assert.equal(MEGA_ROCK_LINE.text, 'I am huuuuuuuuuge!');
    assert.equal(STREET_OBJECT_COPY.mega, MEGA_ROCK_LINE.text);
    if (GSJS) assert.ok(gsjs('include/mining.js').includes(`this.sendBubble("${MEGA_ROCK_LINE.text}", ${MEGA_ROCK_LINE.ms});`));
    // Solo: game.js's rock timer is where a rock reforms; it said "reforms and is ready to mine" only.
    const game = read('public/game.js');
    const at = game.indexOf('function tickAllMineRocks(');
    const body = game.slice(at, game.indexOf('\n}\n', at));
    assert.match(body, /MEGA_ROCK_LINE\.text/, 'a solo rock that reforms huge says so');
    assert.match(body, /MEGA_ROCK_LINE\.delayMs/, '1 s after it reforms (onMegaRoxx timer)');
    assert.match(body, /durationMs: MEGA_ROCK_LINE\.ms, exact: true/, 'for the source\'s 5 s');
    // Online: the shared rock's state says so (street-objects-feature), on the source's time.
    const feature = read('public/js/features/street-objects-feature.js');
    assert.match(feature, /MEGA_ROCK_LINE\.ms, \{ [^}]*exact: true/);
  });
});

describe('A croaking Piggy keeps its own minute (#172)', () => {
  const GROUND = 'GCR10K3BPJK1U6F';
  function streetEngine(targets) {
    const said = [];
    return {
      said,
      engine: {
        started: true,
        street: { tsid: GROUND, hubId: '56', hubName: 'Groddle Forest' },
        streetTsid: GROUND,
        inScene: () => false,
        transientInstance: () => false,
        interactables: targets,
        droppedItems: { streets: {} },
        textures: {},
        platforms: [],
        player: { x: 0, y: 0 },
        acting: () => false,
        param: () => null,
        setData: () => {},
        say: (target, text, ms, extra) => said.push({ target, text, ms, exact: extra?.exact === true, at: Date.now() }),
        save: () => {},
      },
    };
  }
  const piggy = (state) => ({
    classId: 'npc_piggy',
    state: createAnimalState('npc_piggy', state),
    sprite: { x: 400, y: 500, scale: { x: 1 }, visible: true, destroyed: false },
  });
  /** Run the feature on a clock we hold. */
  function clock(start) {
    const realNow = Date.now;
    const realRandom = Math.random;
    let t = start;
    Date.now = () => t;
    Math.random = () => 0.5;
    return { set: (ms) => (t = start + ms), restore: () => { Date.now = realNow; Math.random = realRandom; } };
  }
  const croaks = (said) => said.filter((s) => s.text === PIGGY_LINES.croak);

  it('the first croak a player sees lands anywhere in the minute, not 2 s after they arrive', () => {
    assert.equal(nextCroakDelayMs({ rng: () => 0 }), 0);
    assert.equal(nextCroakDelayMs({ rng: () => 0.5 }), 30_000);
    assert.ok(nextCroakDelayMs({ rng: () => 1 }) < CROAK_INTERVAL_MS);
    assert.equal(nextCroakDelayMs({ started: true }), CROAK_INTERVAL_MS, 'apiSetInterval calls it a minute on');

    const start = Date.now() + 30 * 24 * 3600 * 1000;
    const c = clock(start);
    try {
      animalMoodFeature.onStreetClear();
      const p = piggy({ hunger: 10, croaking: true, mood: 1, hungerAt: start + 3600 * 1000 });
      const { engine, said } = streetEngine([p]);
      animalMoodFeature.onTick(16, 0, engine);
      c.set(2500);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 0, 'not 2 s after arriving (Math.random 0.5: 30 s in)');
      c.set(30_500);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 1);
      assert.deepEqual({ ms: croaks(said)[0].ms, exact: croaks(said)[0].exact }, { ms: 10_000, exact: true });
      c.set(60_000);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 1, 'once a minute');
      c.set(90_600);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 2);
    } finally {
      animalMoodFeature.onStreetClear();
      c.restore();
    }
  });

  it('a tick that starts the croaking croaks a minute later; so does the server\'s tick online', () => {
    const start = Date.now() + 31 * 24 * 3600 * 1000;
    const c = clock(start);
    try {
      animalMoodFeature.onStreetClear();
      // At 10 but not croaking yet: its next twice-daily tick (1 s in) starts onCroaking.
      const p = piggy({ hunger: 10, croaking: false, mood: 1, hungerAt: start + 1000 });
      const { engine, said } = streetEngine([p]);
      animalMoodFeature.onTick(16, 0, engine);
      c.set(1100);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(p.state.croaking, true, 'the tick started the croaking');
      c.set(5000);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 0, 'not 1.5 s after the tick');
      c.set(61_200);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 1, 'a minute after the tick');

      // The server's tick (objects_pigs.go obj_ev croak) restarts the minute the same way.
      c.set(70_000);
      animalMoodFeature.sharedAnimalEvent(p, { ev: 'croak' }, engine);
      c.set(75_000);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 1, 'not 1.5 s after the server\'s tick');
      c.set(130_100);
      animalMoodFeature.onTick(16, 0, engine);
      assert.equal(croaks(said).length, 2);
    } finally {
      animalMoodFeature.onStreetClear();
      c.restore();
    }
  });
});
