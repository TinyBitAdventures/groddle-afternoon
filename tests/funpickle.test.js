/**
 * G209 Señor Funpickle, the Special Item That Only Beta Testers Get
 * (js/funpickle.js, js/features/funpickle-feature.js): the source's words,
 * verbs, powers, award, and the remake's rare late-game street find.
 * Run: node --test tests/funpickle.test.js
 */
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AWARD_ITEM,
  AWARD_LINE,
  COMEDIAN_LINE,
  COOLDOWN_REASON,
  FIND_MIN_LEVEL,
  FUNPICKLE,
  FUNPICKLE_ITEM,
  FUNPICKLE_VERBS,
  INTRO_REASON,
  IN_USE_REASON,
  INVOKE_LINE,
  PACK_EXPLODER_NOTHING,
  POWERS,
  POWER_LINES,
  PUBLIC_HUBS,
  SCREAM_LINES,
  SNEEZE_END_LINE,
  SNEEZE_LINES,
  brokenTeleporterLines,
  choosePower,
  funpickleVerbButtons,
  isFindStreet,
  normalizeFunpickleState,
  packExploderLine,
  packExploderPicks,
  pickRandomTeleport,
  prettyList,
  recordPower,
  shouldPlaceFind,
} from '../public/js/funpickle.js';
import { funpickleFeature, endComedian } from '../public/js/features/funpickle-feature.js?v=g442-6';
import { applyStreetIndex } from '../public/js/street-loader.js?v=g442-6';

const here = dirname(fileURLToPath(import.meta.url));
const spike = join(here, '..');
const GSJS = join(spike, '..', 'glitch-GameServerJS');
const SOURCE = join(GSJS, 'items', 'special_item_that_only_beta_testers_get.js');
const BUFFS = join(GSJS, 'items', 'catalog_buffs.js');
const hasGsjs = existsSync(SOURCE);
// GSJS escapes quotes and writes … as-is.
const src = hasGsjs ? readFileSync(SOURCE, 'utf8').replace(/\\"/g, '"').replace(/\\'/g, "'") : '';
const buffsSrc = existsSync(BUFFS) ? readFileSync(BUFFS, 'utf8') : '';

describe('G209 copy is the source file\'s', { skip: !hasGsjs && 'no GSJS checkout' }, () => {
  it('name, description and verb tooltips', () => {
    assert.ok(src.includes(`var name_single = "${FUNPICKLE_ITEM.label}"`));
    assert.ok(src.includes(`var name_plural = "${FUNPICKLE_ITEM.namePlural}"`));
    assert.ok(src.includes(FUNPICKLE_ITEM.desc));
    for (const v of FUNPICKLE_VERBS) {
      assert.ok(src.includes(`verbs.${v.id} = {`), v.id);
      assert.ok(src.includes(`"tooltip"			: "${v.tooltip}"`), v.tooltip);
      assert.ok(src.includes(`"${v.key}"	: "${v.id}"`), `key ${v.key}`);
    }
  });

  it('every power line, the award and the reasons', () => {
    for (const line of [COOLDOWN_REASON, INTRO_REASON, IN_USE_REASON, INVOKE_LINE, AWARD_LINE, PACK_EXPLODER_NOTHING, ...Object.values(POWER_LINES), ...SCREAM_LINES]) {
      assert.ok(src.includes(line), line);
    }
    assert.ok(src.includes(brokenTeleporterLines('x')[1]));
    assert.ok(src.includes("var powers = ['moonwalk', 'comedian', 'sneezingFit', 'scream', 'brokenTeleporter', 'packExploder'];"));
    assert.deepEqual(POWERS, ['moonwalk', 'comedian', 'sneezingFit', 'scream', 'brokenTeleporter', 'packExploder']);
    assert.ok(src.includes(`pc.createItemFromGround('${AWARD_ITEM}', 1, false);`));
  });

  it('the buffs\' lines are catalog_buffs.js\'s', { skip: !buffsSrc && 'no catalog_buffs.js' }, () => {
    for (const line of [COMEDIAN_LINE, SNEEZE_END_LINE, ...Object.values(SNEEZE_LINES)]) {
      assert.ok(buffsSrc.replace(/\\'/g, "'").includes(line), line);
    }
  });

  it('the pack exploder line keeps the source wording', () => {
    assert.equal(
      packExploderLine(['Cherry', 'Grain', 'Bean']),
      'They say that a fool and their money are soon parted. If rather than "a fool" they mean "you" and "money" they mean "Cherry, Grain and Bean", then yes, they\'re right.'
    );
    assert.equal(prettyList([]), '');
    assert.equal(prettyList(['A']), 'A');
    assert.equal(prettyList(['A', 'B']), 'A and B');
  });
});

describe('G209 rules', () => {
  it('verbs are disabled on Too Much Fun, before the intro and while it bounces', () => {
    assert.equal(funpickleVerbButtons().length, 7);
    assert.ok(funpickleVerbButtons().every((b) => b.enabled));
    assert.equal(funpickleVerbButtons({ cooldown: true })[0].reason, COOLDOWN_REASON);
    assert.equal(funpickleVerbButtons({ introDone: false })[3].reason, INTRO_REASON);
    assert.equal(funpickleVerbButtons({ inUse: true })[6].enabled, false);
  });

  it('chooses evenly before the award and by the weighted table after', () => {
    const st = normalizeFunpickleState();
    assert.equal(choosePower(st, () => 0), 'moonwalk');
    assert.equal(choosePower(st, () => 0.99), 'packExploder');
    assert.equal(choosePower(st, () => 0.5), 'scream');
    st.givenAward = true;
    assert.equal(choosePower(st, () => 0.3), 'moonwalk');
    assert.equal(choosePower(st, () => 0.31), 'comedian');
    assert.equal(choosePower(st, () => 0.65), 'sneezingFit');
    assert.equal(choosePower(st, () => 0.75), 'scream');
    assert.equal(choosePower(st, () => 0.85), 'brokenTeleporter');
    assert.equal(choosePower(st, () => 0.95), 'packExploder');
  });

  it('the award comes once, on the sixth different power; old spammer marks go', () => {
    const st = normalizeFunpickleState({ powersUsed: { spammer: 1 } });
    st.powersUsed.spammer = 1;
    assert.equal(recordPower(st, 'moonwalk'), false);
    assert.equal(st.powersUsed.spammer, undefined);
    assert.equal(recordPower(st, 'moonwalk'), false);
    for (const p of ['comedian', 'sneezingFit', 'scream', 'brokenTeleporter']) assert.equal(recordPower(st, p), false);
    assert.equal(recordPower(st, 'packExploder'), true);
    assert.equal(st.givenAward, true);
    assert.equal(recordPower(st, 'scream'), false);
  });

  it('pack exploder takes up to five cheap stacks, cheapest first, one each', () => {
    const costs = { apple: 3, cherry: 3, plank: 6, bag_generic: 50, element_red: 1, hatchet: 100, gold: 1500, grain: 2, bun: 12, meat: 10, quest_thing: 5 };
    const inv = { apple: 4, cherry: 1, plank: 2, bag_generic: 1, element_red: 9, hatchet: 1, gold: 1, grain: 0, bun: 1, meat: 3, quest_thing: 1, [FUNPICKLE]: 1 };
    const picks = packExploderPicks(inv, { baseCost: (id) => costs[id] || 0, tags: (id) => (id === 'quest_thing' ? ['quest-item'] : []) });
    assert.deepEqual(picks, ['apple', 'cherry', 'plank', 'meat', 'bun']);
    assert.deepEqual(packExploderPicks({ gold: 1 }, { baseCost: () => 1500 }), []);
  });

  it('random teleport picks a public hub street that passes the checks', () => {
    const streets = { A: { hubId: '27' }, B: { hubId: '27' }, C: { hubId: '9999' }, D: { hubId: '40' } };
    assert.ok(PUBLIC_HUBS.includes('27'));
    for (let i = 0; i < 20; i += 1) {
      const got = pickRandomTeleport(streets, Math.random, (t) => t !== 'A');
      assert.ok(['B', 'D'].includes(got), got);
    }
    assert.equal(pickRandomTeleport(streets, Math.random, () => false), null);
  });

  it('the find waits for level 30, about one street in 40, and comes once', () => {
    const st = normalizeFunpickleState();
    const streets = Array.from({ length: 4000 }, (_, i) => `GTEST${i}`);
    const hits = streets.filter(isFindStreet);
    assert.ok(hits.length > 60 && hits.length < 140, `hits ${hits.length}`);
    const tsid = hits[0];
    assert.equal(shouldPlaceFind(st, { tsid, level: FIND_MIN_LEVEL - 1 }), false);
    assert.equal(shouldPlaceFind(st, { tsid, level: FIND_MIN_LEVEL }), true);
    assert.equal(shouldPlaceFind(st, { tsid, level: 60, eligible: false }), false);
    assert.equal(shouldPlaceFind(st, { tsid, level: 60, owned: true }), false);
    assert.equal(shouldPlaceFind({ ...st, found: true }, { tsid, level: 60 }), false);
    assert.equal(shouldPlaceFind({ ...st, placed: { tsid, x: 1, y: 1 } }, { tsid, level: 60 }), false);
    assert.equal(shouldPlaceFind(st, { tsid: streets.find((t) => !isFindStreet(t)), level: 60 }), false);
  });

  it('the save normalizes', () => {
    const s = normalizeFunpickleState({ found: true, placed: { tsid: 'G1', x: '4', y: 5 }, powersUsed: { scream: 1, spammer: 1, nope: 1 }, out: true });
    assert.deepEqual(s, { version: 1, found: true, placed: { tsid: 'G1', x: 4, y: 5 }, powersUsed: { scream: 1 }, givenAward: false, out: true, uses: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* The feature with a stand-in engine                                   */
/* ------------------------------------------------------------------ */

function fakeEngine(opts = {}) {
  const buffs = new Map();
  const log = [];
  const sounds = [];
  const drops = [];
  const travels = [];
  const data = {};
  const engine = {
    started: true,
    inv: { ...(opts.inv || {}) },
    pc: { level: 40, mood: 100, moodMax: 200, energy: 100 },
    player: { x: 1000, y: 0, facing: 'right' },
    streetTsid: opts.tsid || 'GSTREET',
    worldW: 4000,
    platforms: [],
    localCompanions: [],
    hasBuff: (id) => buffs.has(id),
    applyBuff: (id) => { buffs.set(id, { appliedAt: Date.now() }); return { ok: true }; },
    removeBuff: (id) => { buffs.delete(id); return { ok: true }; },
    buffRow: (id) => buffs.get(id) || null,
    pushActivity: (line) => log.push(line),
    toast: () => {},
    playSound: (key) => sounds.push(key),
    dropWorldStack: (id, n, x, y) => { drops.push({ id, n, x, y }); return { ok: true }; },
    refreshPack: () => {},
    updateHud: () => {},
    save: () => {},
    setData: (k, v) => { data[k] = v; },
    param: (k) => (opts.params || {})[k] ?? null,
    whoIsHere: () => ['Ur'],
    floatText: () => {},
    achievement: () => {},
    metabolicGate: () => ({ ok: true }),
    transientInstance: () => false,
    placement: () => [],
    register: (t) => t,
    unregister: () => {},
    streetExists: () => true,
    travelGate: () => ({ ok: true }),
    travel: (tsid) => travels.push(tsid),
    vog: (o) => o.onComplete?.(),
  };
  return { engine, buffs, log, sounds, drops, travels, data };
}

describe('G209 feature', () => {
  beforeEach(() => {
    funpickleFeature._reset();
    mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  });
  afterEach(() => mock.timers.reset());

  function deployAndRun(t, power) {
    const verbs = funpickleFeature.packVerbs(FUNPICKLE, t.engine);
    assert.equal(verbs.length, 7);
    assert.equal(funpickleFeature.runPackVerb(FUNPICKLE, 'admire', t.engine), true);
    assert.equal(t.engine.inv[FUNPICKLE], 0, 'out of the pack while it bounces');
    assert.ok(t.buffs.has('beta_item_cooldown'));
    assert.equal(t.log.at(-1), INVOKE_LINE);
    assert.equal(funpickleFeature.verbsFor({ featureId: 'funpickle', state: { kind: 'deployed' } }, t.engine)[0].reason, IN_USE_REASON);
    mock.timers.tick(1000);
    funpickleFeature.onTick(16, Date.now(), t.engine);
    assert.ok(t.sounds.includes('SPECIAL_ITEM_THAT_ONLY_BETA_TESTERS_GET'));
    mock.timers.tick(5000);
    funpickleFeature.onTick(16, Date.now(), t.engine);
    assert.equal(t.engine.inv[FUNPICKLE], 1, 'back in the pack');
    assert.equal(t.data.funpickleLast, power);
  }

  it('deploys, bounces, uses the forced power and comes back (moonwalk)', () => {
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1 }, params: { funpicklepower: 'moonwalk' } });
    funpickleFeature.init(t.engine);
    deployAndRun(t, 'moonwalk');
    assert.ok(t.buffs.has('moonwalk'));
    assert.ok(t.log.includes(POWER_LINES.moonwalk));
    // Too Much Fun holds the verbs.
    assert.equal(funpickleFeature.packVerbs(FUNPICKLE, t.engine)[0].reason, COOLDOWN_REASON);
  });

  it('leaving the street just puts it back', () => {
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1 } });
    funpickleFeature.runPackVerb(FUNPICKLE, 'enjoy', t.engine);
    t.engine.streetTsid = 'GOTHER';
    mock.timers.tick(6000);
    funpickleFeature.onTick(16, Date.now(), t.engine);
    assert.equal(t.engine.inv[FUNPICKLE], 1);
    assert.equal(t.data.funpickleLast, 'returned');
  });

  it('comedian ends on your next chat line', () => {
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1 }, params: { funpicklepower: 'comedian' } });
    deployAndRun(t, 'comedian');
    assert.ok(t.buffs.has('comedian'));
    assert.equal(endComedian(t.engine), true);
    assert.equal(t.buffs.has('comedian'), false);
    assert.ok(t.sounds.includes('COMEDIAN'));
    assert.equal(t.log.at(-1), COMEDIAN_LINE);
  });

  it('sneezing fit sneezes ten times, beans and lines, then the end line', () => {
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1 }, params: { funpicklepower: 'sneezingFit' } });
    deployAndRun(t, 'sneezingFit');
    for (let i = 0; i < 11; i += 1) {
      mock.timers.tick(3000);
      funpickleFeature.onTick(16, Date.now(), t.engine);
    }
    assert.equal(t.sounds.filter((k) => k === 'SNEEZING_AHCHOO').length, 10);
    assert.equal(t.drops.filter((d) => d.id === 'bean_plain' && d.n === 2).length, 10);
    assert.equal(t.engine.pc.mood, 70);
    for (const line of Object.values(SNEEZE_LINES)) assert.ok(t.log.includes(line), line);
    t.buffs.delete('sneezing_fit');
    funpickleFeature.onTick(16, Date.now(), t.engine);
    assert.equal(t.log.at(-1), SNEEZE_END_LINE);
  });

  it('scream costs 5 mood', () => {
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1 }, params: { funpicklepower: 'scream' } });
    deployAndRun(t, 'scream');
    assert.ok(t.sounds.includes('WILHELM_SCREAM'));
    assert.equal(t.engine.pc.mood, 95);
    assert.ok(SCREAM_LINES.includes(t.log.at(-1)));
  });

  it('broken teleporter sends you to a random public street', () => {
    applyStreetIndex({ streets: { GSTREET: { hubId: '27' }, GAWAY: { hubId: '27' }, GPRIVATE: { hubId: '9999' } } });
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1 }, params: { funpicklepower: 'brokenTeleporter' } });
    deployAndRun(t, 'brokenTeleporter');
    mock.timers.tick(600);
    assert.deepEqual(t.travels, ['GAWAY']);
  });

  it('pack exploder throws your cheapest things onto the street', () => {
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1, apple: 3, cherry: 1, plank: 2, meat: 1, bun: 1, grain: 1 }, params: { funpicklepower: 'packExploder' } });
    deployAndRun(t, 'packExploder');
    assert.equal(t.drops.length, 5);
    assert.ok(t.drops.every((d) => d.n === 1 && Math.abs(d.x - 1000) <= 500));
    assert.equal(t.engine.inv.apple, 2);
    assert.ok(t.log.at(-1).startsWith('They say that a fool'));
  });

  it('the sixth different power sends Musicblock GNG once', () => {
    const t = fakeEngine({ inv: { [FUNPICKLE]: 1 }, params: { funpicklepower: 'scream' } });
    funpickleFeature.restore({ powersUsed: { moonwalk: 1, comedian: 1, sneezingFit: 1, brokenTeleporter: 1, packExploder: 1 } });
    deployAndRun(t, 'scream');
    assert.equal(t.engine.inv[AWARD_ITEM], 1);
    assert.ok(t.log.includes(AWARD_LINE));
    assert.equal(t.data.funpickleAward, '1');
  });

  it('a find street lays it down from level 30; pick up keeps it found', () => {
    const tsid = Array.from({ length: 2000 }, (_, i) => `GFIND${i}`).find(isFindStreet);
    applyStreetIndex({ streets: { [tsid]: { hubId: '27' } } });
    const low = fakeEngine({ tsid });
    low.engine.pc.level = FIND_MIN_LEVEL - 1;
    funpickleFeature.onStreetEnter({ tsid }, low.engine);
    assert.equal(low.data.funpicklePlaced, '');
    const t = fakeEngine({ tsid });
    funpickleFeature.onStreetEnter({ tsid }, t.engine);
    assert.equal(t.data.funpicklePlaced, tsid);
    assert.equal(funpickleFeature.runVerb({ featureId: 'funpickle', state: { kind: 'find' } }, 'pickup', t.engine), true);
    assert.equal(t.engine.inv[FUNPICKLE], 1);
    const saved = funpickleFeature.save();
    assert.equal(saved.found, true);
    assert.equal(saved.placed, null);
    t.engine.inv[FUNPICKLE] = 0;
    funpickleFeature.onStreetEnter({ tsid }, t.engine);
    assert.equal(t.data.funpicklePlaced, '');
  });

  it('a reload while it was out puts it back', () => {
    const t = fakeEngine({ inv: {} });
    funpickleFeature.restore({ found: true, out: true });
    funpickleFeature.onTick(16, Date.now(), t.engine);
    assert.equal(t.engine.inv[FUNPICKLE], 1);
    assert.equal(funpickleFeature.save().out, false);
  });
});

describe('G209 wiring', () => {
  it('the feature is registered and the art is in place', () => {
    const index = readFileSync(join(spike, 'public/js/features/index.js'), 'utf8');
    assert.match(index, /import \{ funpickleFeature \} from '\.\/funpickle-feature\.js\?v=[^']+'; FEATURES\.push\(funpickleFeature\);/);
    for (const file of ['assets/sprites/icons/special_item_that_only_beta_testers_get.png', 'assets/sprites/icons/special_item_that_only_beta_testers_get@3x.png', 'assets/sprites/small-items/funpickle_1.png', 'assets/sprites/small-items/funpickle_bounce2.webp']) {
      assert.ok(existsSync(join(spike, 'public', file)), file);
    }
    const overlays = JSON.parse(readFileSync(join(spike, 'public/assets/sprites/overlays/overlays.json'), 'utf8'));
    assert.equal(overlays.overlay_sneezing_powder?.kind, 'sheet');
  });
});
