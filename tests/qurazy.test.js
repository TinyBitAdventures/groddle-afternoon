/**
 * G260 Qurazy quoins on a street's Qurazy marker (js/qurazy.js,
 * js/qurazy-markers.js, js/features/qurazy-feature.js): the per-player roll
 * from GameServerJS locations/location.js 200-265 and 731-760.
 * Run: node --test tests/qurazy.test.js
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DAY_MS, GAME_EPOCH_MS } from '../public/js/game-day.js';
import { QURAZY_MARKER_STREET_COUNT, qurazyMarkersFor } from '../public/js/qurazy-markers.js';
import {
  QURAZY_DAILY_MAX,
  QURAZY_SPAWN_LINE,
  createQurazyState,
  qurazyChance,
  qurazyDayIndex,
  qurazyFoundToday,
  qurazyHistoryChance,
  qurazyIsChance,
  rollQurazy,
} from '../public/js/qurazy.js';
import { planStreetQuoins } from '../public/js/quoins.js';
import {
  QURAZY_FEED_ATTR,
  QURAZY_OVERLAY,
  QURAZY_PILL_GAP,
  QURAZY_PLACEMENT_GROUP,
  boxesOverlap,
  qurazyBannerBox,
  qurazyBannerTopY,
  qurazyFeature,
  qurazyFeatureState,
  qurazyStreetEligible,
  resetQurazyFeatureForTests,
} from '../public/js/features/qurazy-feature.js?v=g446-2';
import * as qurazyModule from '../public/js/features/qurazy-feature.js?v=g446-2';
import { GENTLE_ISLAND } from '../public/js/newxp.js';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, '../public');
const DEFAULT_STREET = 'GLI2V0UN7RD1T2J';
const TWO_MARKERS = 'GA948QFPNDO2I94';
const NO_MARKER = 'GA9TCL1H7LD37DC'; // Bilicious Blues
// Noon of a game day, well away from a day boundary.
const NOW = GAME_EPOCH_MS + 5000 * GAME_DAY_MS + GAME_DAY_MS / 2;
const DAY = qurazyDayIndex(NOW);

/** Last-visit history where `tsid` is at `position` of `count`, newest first. */
function historyWith(tsid, position, count) {
  const out = {};
  for (let i = 1; i <= count; i += 1) {
    out[i === position ? tsid : `GSTREET${i}`] = NOW - i * 60_000;
  }
  return out;
}

describe('Qurazy markers (locations-xml item lists)', () => {
  it('knows the 1,306 archived streets with a marker, five with two', () => {
    assert.equal(QURAZY_MARKER_STREET_COUNT, 1306);
    assert.equal(qurazyMarkersFor(DEFAULT_STREET), 1);
    assert.equal(qurazyMarkersFor(TWO_MARKERS), 2);
    assert.equal(qurazyMarkersFor(`L${TWO_MARKERS.slice(1)}`), 2, 'L-prefixed alias');
    assert.equal(qurazyMarkersFor(NO_MARKER), 0);
    assert.equal(qurazyMarkersFor(''), 0);
  });

  it('every marker street is a street the game can build', () => {
    const have = new Set(readdirSync(join(PUBLIC, 'assets/streets')).map((f) => f.replace(/\.json$/, '')));
    const source = readFileSync(join(PUBLIC, 'js/qurazy-markers.js'), 'utf8');
    const listed = [...source.matchAll(/^  '([A-Z0-9 ]+)',$/gm)].flatMap((m) => m[1].split(' '));
    assert.equal(new Set(listed).size, 1306);
    assert.deepEqual(listed.filter((t) => !have.has(t)), []);
  });
});

describe('Qurazy chance (location.js 213-256)', () => {
  it('a first visit is always 1, before the day and daily checks', () => {
    const state = createQurazyState({ day: DAY, foundToday: { A: 5 }, lastFound: { X: DAY } });
    assert.deepEqual(qurazyChance(state, { tsid: 'X', visitsBefore: 0, day: DAY }), { chance: 1, reason: 'first_visit' });
  });

  it('follows the street history percentile, newest first', () => {
    const cases = [
      [1, 20, 0.2], // 0.05: under the 10th percentile stays 0.2
      [2, 20, 0.1], // 0.10
      [5, 20, 0.1], // 0.25
      [6, 20, 0.2], // 0.30
      [10, 20, 0.3], // 0.50
      [14, 20, 0.5], // 0.70
      [17, 20, 0.5], // 0.85
      [18, 20, 0.7], // 0.90
      [20, 20, 0.7], // 1.00: the street you were on longest ago
    ];
    for (const [position, count, chance] of cases) {
      const got = qurazyHistoryChance('X', historyWith('X', position, count));
      assert.equal(got.chance, chance, `${position}/${count}`);
      assert.equal(got.position, position);
    }
  });

  it('a street missing from the history sits last; an empty history leaves 0.2', () => {
    assert.equal(qurazyHistoryChance('X', historyWith('Y', 3, 10)).chance, 0.7);
    assert.equal(qurazyHistoryChance('X', {}).chance, 0.2);
  });

  it('a find here today, yesterday or the day before makes it 0', () => {
    const lastVisits = historyWith('X', 10, 10);
    for (const ago of [0, 1, 2]) {
      const state = createQurazyState({ day: DAY, lastFound: { X: DAY - ago } });
      assert.equal(qurazyChance(state, { tsid: 'X', visitsBefore: 3, lastVisits, day: DAY }).reason, 'found_recently', `${ago} days ago`);
    }
    const old = createQurazyState({ day: DAY, lastFound: { X: DAY - 3 } });
    assert.equal(qurazyChance(old, { tsid: 'X', visitsBefore: 3, lastVisits, day: DAY }).chance, 0.7);
  });

  it('five found today, anywhere, makes it 0', () => {
    const lastVisits = historyWith('X', 10, 10);
    const four = createQurazyState({ day: DAY, foundToday: { A: 2, B: 2 } });
    assert.equal(qurazyChance(four, { tsid: 'X', visitsBefore: 1, lastVisits, day: DAY }).chance, 0.7);
    const five = createQurazyState({ day: DAY, foundToday: { A: 3, B: 2 } });
    assert.equal(QURAZY_DAILY_MAX, 5);
    assert.deepEqual(
      [qurazyChance(five, { tsid: 'X', visitsBefore: 1, lastVisits, day: DAY }).chance, qurazyChance(five, { tsid: 'X', visitsBefore: 1, lastVisits, day: DAY }).reason],
      [0, 'daily_max']
    );
  });

  it('is_chance: 0 never, 1 always, otherwise rng() <= p', () => {
    assert.equal(qurazyIsChance(0, () => 0), false);
    assert.equal(qurazyIsChance(1, () => 0.9999), true);
    assert.equal(qurazyIsChance(0.3, () => 0.3), true);
    assert.equal(qurazyIsChance(0.3, () => 0.31), false);
  });
});

describe('rollQurazy', () => {
  it('a first visit spawns on a marker and counts the find', () => {
    const state = createQurazyState();
    const roll = rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 0, rng: () => 0.99, now: NOW });
    assert.equal(roll.spawn, true);
    assert.equal(roll.reason, 'first_visit');
    assert.equal(roll.markerIndex, 0);
    assert.equal(state.day, DAY);
    assert.deepEqual(state.foundToday, { X: 1 });
    assert.equal(state.lastFound.X, DAY);
    assert.equal(qurazyFoundToday(state), 1);
  });

  it('a miss ends rolls on that street until the next game day', () => {
    const state = createQurazyState();
    const lastVisits = historyWith('X', 10, 10);
    const miss = rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 2, lastVisits, rng: () => 0.9, now: NOW });
    assert.deepEqual([miss.rolled, miss.spawn, miss.chance], [true, false, 0.7]);
    const again = rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 3, lastVisits, rng: () => 0, now: NOW });
    assert.deepEqual([again.rolled, again.reason], [false, 'rolled_today']);
    // Max Luck does not undo a roll already spent today (the notfound label check comes first).
    assert.equal(rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 3, lastVisits, maxLuck: true, now: NOW }).spawn, false);
    const tomorrow = rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 3, lastVisits, rng: () => 0, now: NOW + GAME_DAY_MS });
    assert.equal(tomorrow.spawn, true);
  });

  it('coming back the same day after a find gives nothing, and the street is done', () => {
    const state = createQurazyState();
    rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 0, now: NOW });
    const back = rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 1, lastVisits: historyWith('X', 1, 4), rng: () => 0, now: NOW + 60_000 });
    assert.deepEqual([back.spawn, back.reason], [false, 'found_recently']);
    assert.ok(state.notFound.includes('X'));
  });

  it('Max Luck places one whatever the chance', () => {
    const state = createQurazyState({ day: DAY, foundToday: { A: 5 } });
    const roll = rollQurazy(state, { tsid: 'X', markers: 1, visitsBefore: 4, lastVisits: historyWith('X', 1, 10), maxLuck: true, rng: () => 0.99, now: NOW });
    assert.deepEqual([roll.spawn, roll.reason, roll.chance], [true, 'max_luck', 0]);
    assert.equal(qurazyFoundToday(state), 6);
  });

  it('chooses one of two markers at random', () => {
    const a = rollQurazy(createQurazyState(), { tsid: 'X', markers: 2, rng: () => 0.2, now: NOW });
    const b = rollQurazy(createQurazyState(), { tsid: 'X', markers: 2, rng: () => 0.8, now: NOW });
    assert.deepEqual([a.markerIndex, b.markerIndex], [0, 1]);
  });

  it('no marker, no roll and no state change', () => {
    const state = createQurazyState();
    const roll = rollQurazy(state, { tsid: 'X', markers: 0, now: NOW });
    assert.deepEqual([roll.rolled, roll.reason], [false, 'no_marker']);
    assert.deepEqual(state.notFound, []);
  });

  it('a new day clears the daily counters and keeps three days of finds', () => {
    const state = createQurazyState({ day: DAY - 1, notFound: ['A'], foundToday: { B: 2 }, lastFound: { B: DAY - 1, C: DAY - 3 } });
    rollQurazy(state, { tsid: 'Z', markers: 0, now: NOW });
    assert.deepEqual(state.notFound, []);
    assert.deepEqual(state.foundToday, {});
    assert.deepEqual(state.lastFound, { B: DAY - 1 });
  });

  it('normalizes a junk save', () => {
    const state = createQurazyState({ day: 'x', notFound: [1, 'A', 'A'], foundToday: { A: -1, B: '2' }, live: { tsid: 'A', x: 'nope' } });
    assert.deepEqual(state, { day: null, notFound: ['A'], foundToday: { B: 2 }, lastFound: {}, live: null, totalSpawned: 0 });
  });
});

describe('natural quoin plan (js/quoins.js)', () => {
  it('no natural spot is a Qurazy any more (the 1-in-29 stand-in is gone)', () => {
    const tsids = readdirSync(join(PUBLIC, 'assets/streets')).filter((f) => /^G.*\.json$/.test(f)).map((f) => f.slice(0, -5));
    assert.ok(tsids.length > 1000);
    for (const tsid of tsids) assert.ok(!planStreetQuoins(tsid, 8).includes('qurazy'), tsid);
  });
});

/** A small stand-in for game.js's feature engine. */
function fakeEngine({ tsid = DEFAULT_STREET, visitsBefore = 0, lastVisits = {}, points = [{ x: 900, y: 600 }], maxLuck = false, transient = false } = {}) {
  const data = {};
  const engine = {
    streetTsid: tsid,
    quoins: [],
    player: { x: 0, y: 0 },
    toasts: [],
    activity: [],
    saves: 0,
    placement: (key) => (key === QURAZY_PLACEMENT_GROUP ? points : [{ x: 100, y: 700 }]),
    spawnQuoin(spot, typeId, opts) {
      const q = { x: spot.x, y: spot.y, baseY: spot.y - 58, typeId, opts };
      engine.quoins.push(q);
      return q;
    },
    streetVisitsBefore: () => visitsBefore,
    streetLastVisits: () => lastVisits,
    transientInstance: () => transient,
    hasBuff: (id) => id === 'max_luck' && maxLuck,
    pushActivity: (line) => engine.activity.push(line),
    toast: (line) => engine.toasts.push(line),
    save: () => { engine.saves += 1; },
    setData: (key, value) => { data[key] = String(value); },
    data,
  };
  return engine;
}

describe('qurazy-feature', () => {
  beforeEach(() => resetQurazyFeatureForTests());

  it('asks the planner for one spot per marker, only where the roll runs', () => {
    assert.deepEqual(qurazyFeature.placementGroups({}, { tsid: DEFAULT_STREET }), [{ key: 'qurazy', count: 1, clearance: 40 }]);
    assert.deepEqual(qurazyFeature.placementGroups({}, { tsid: TWO_MARKERS })[0].count, 2);
    assert.deepEqual(qurazyFeature.placementGroups({}, { tsid: NO_MARKER }), []);
    // Gentle Island has markers, but newxp-feature places its scripted Qurazies.
    assert.equal(qurazyMarkersFor(GENTLE_ISLAND.surveyors_stroll), 1);
    assert.equal(qurazyStreetEligible(GENTLE_ISLAND.surveyors_stroll), false);
    assert.deepEqual(qurazyFeature.placementGroups({}, { tsid: GENTLE_ISLAND.surveyors_stroll }), []);
  });

  it('a first visit places your Qurazy on the marker spot with the source line', () => {
    const engine = fakeEngine();
    qurazyFeature.onStreetClear(engine);
    qurazyFeature.onStreetEnter({ tsid: DEFAULT_STREET }, engine, {});
    assert.equal(engine.quoins.length, 1);
    assert.equal(engine.quoins[0].typeId, 'qurazy');
    assert.deepEqual([engine.quoins[0].x, engine.quoins[0].y], [900, 600]);
    assert.deepEqual(engine.activity, [QURAZY_SPAWN_LINE]);
    assert.equal(QURAZY_SPAWN_LINE, "OMG! There's a Qurazy Quoin on this street for you!");
    assert.equal(engine.data.qurazyRoll, 'spawn:first_visit:1');
    assert.equal(engine.data.qurazyLive, '900,600');
    assert.equal(qurazyFeatureState().live.tsid, DEFAULT_STREET);
  });

  it('a reload keeps it; leaving drops it; coming back the same day finds none', () => {
    const engine = fakeEngine();
    qurazyFeature.onStreetEnter({ tsid: DEFAULT_STREET }, engine, {});
    const saved = qurazyFeature.save();
    assert.ok(saved.live);

    // Reload: restore, the boot's first clear, then the same street.
    qurazyFeature.restore(JSON.parse(JSON.stringify(saved)));
    const reloaded = fakeEngine({ visitsBefore: 1, points: [{ x: 50, y: 50 }] });
    qurazyFeature.onStreetClear(reloaded);
    qurazyFeature.onStreetEnter({ tsid: DEFAULT_STREET }, reloaded, {});
    assert.deepEqual([reloaded.quoins[0].x, reloaded.quoins[0].y], [900, 600], 'same spot as before');
    assert.equal(reloaded.data.qurazyRoll, 'spawn:reconnect:1');

    // Leave without grabbing it, then come back.
    qurazyFeature.onStreetClear(reloaded);
    assert.equal(qurazyFeatureState().live, null);
    const back = fakeEngine({ visitsBefore: 2, lastVisits: historyWith(DEFAULT_STREET, 1, 3) });
    qurazyFeature.onStreetEnter({ tsid: DEFAULT_STREET }, back, {});
    assert.equal(back.quoins.length, 0);
    assert.equal(back.data.qurazyRoll, 'miss:found_recently:0');
  });

  it('grabbing it clears the live Qurazy', () => {
    const engine = fakeEngine();
    qurazyFeature.onStreetEnter({ tsid: DEFAULT_STREET }, engine, {});
    qurazyFeature.onTick(16, NOW, engine);
    assert.ok(qurazyFeatureState().live);
    engine.quoins.length = 0; // the quoin loop collected it
    qurazyFeature.onTick(16, NOW, engine);
    assert.equal(qurazyFeatureState().live, null);
    assert.equal(engine.data.qurazyCollected, '1');
  });

  it('Max Luck places one on a street already found today; transient instances never roll', () => {
    const lucky = fakeEngine({ visitsBefore: 5, lastVisits: historyWith(DEFAULT_STREET, 1, 5), maxLuck: true });
    qurazyFeatureState().lastFound[DEFAULT_STREET] = qurazyDayIndex();
    qurazyFeatureState().day = qurazyDayIndex();
    qurazyFeature.onStreetEnter({ tsid: DEFAULT_STREET }, lucky, {});
    assert.equal(lucky.data.qurazyRoll, 'spawn:max_luck:0');

    resetQurazyFeatureForTests();
    const race = fakeEngine({ transient: true });
    qurazyFeature.onStreetEnter({ tsid: DEFAULT_STREET }, race, {});
    assert.equal(race.quoins.length, 0);
    assert.equal(race.data.qurazyRoll, 'skip:not_here:0');
  });

  it('no marker, no Qurazy', () => {
    const engine = fakeEngine({ tsid: NO_MARKER });
    qurazyFeature.onStreetEnter({ tsid: NO_MARKER }, engine, {});
    assert.equal(engine.quoins.length, 0);
    assert.equal(engine.data.qurazyRoll, 'skip:no_marker:0');
  });
});

describe('wiring', () => {
  it('the registry appends the feature and game.js gives it the engine calls', () => {
    const index = readFileSync(join(PUBLIC, 'js/features/index.js'), 'utf8');
    assert.match(index, /import \{ qurazyFeature \} from '\.\/qurazy-feature\.js\?v=[\w-]+'; FEATURES\.push\(qurazyFeature\);/);
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    for (const name of ['spawnQuoin(spot, typeId', 'streetVisitsBefore(tsid', 'streetLastVisits()']) {
      assert.ok(game.includes(name), name);
    }
    // The feature and its modules agree on one key per module.
    const feature = readFileSync(join(PUBLIC, 'js/features/qurazy-feature.js'), 'utf8');
    assert.match(feature, /qurazy\.js\?v=g\d+-\d+/);
    assert.match(feature, /qurazy-markers\.js\?v=g\d+-\d+/);
  });
});

describe('the spawn banner and the street-name pill (G274)', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'assets/sprites/overlays/overlays.json'), 'utf8'));
  const boxTop = manifest[QURAZY_OVERLAY.key].box[1];
  // Drawn top of the art in px, as overlayPlacement puts it.
  const drawnTop = (height, scale, topY) => height * topY + boxTop * scale;

  it('keeps the source top_y -5% when there is no pill', () => {
    assert.equal(qurazyBannerTopY({ height: 540, scale: 1, boxTop, pillBottom: null }), -0.05);
  });

  it('moves the drawn top just below the pill, at any width', () => {
    for (const [height, scale, pillBottom] of [[540, 1, 38], [420, 700 / 960, 30], [620, 1220 / 960, 46]]) {
      const topY = qurazyBannerTopY({ height, scale, boxTop, pillBottom });
      assert.ok(topY > QURAZY_OVERLAY.topY);
      assert.ok(Math.abs(drawnTop(height, scale, topY) - (pillBottom + QURAZY_PILL_GAP)) < 1e-9);
    }
  });

  it('never moves it up: a pill already clear of the banner keeps -5%', () => {
    assert.equal(qurazyBannerTopY({ height: 540, scale: 1, boxTop, pillBottom: -40 }), -0.05);
  });
});

describe('the banner on a street change (G303) and over the feed (G297)', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'assets/sprites/overlays/overlays.json'), 'utf8'));
  const meta = manifest[QURAZY_OVERLAY.key];
  it('the banner is an overlay-art player, so the street-change cancel stops it (G311)', () => {
    // G309 cancelAllOverlays (game.js endStreetOverlays) takes the canvas down; the old stopper is gone.
    assert.equal('stopQurazyBanner' in qurazyModule, false);
    const src = readFileSync(join(PUBLIC, 'js/features/qurazy-feature.js'), 'utf8');
    assert.match(src, /playVectorOverlay\(root, QURAZY_OVERLAY\.key/);
    // The feed fade ends with the canvas.
    assert.match(src, /if \(!canvas\.isConnected\) \{\s*feed\.removeAttribute\(QURAZY_FEED_ATTR\)/);
  });

  it('leaving the street clears it without a banner to stop', () => {
    const engine = fakeEngine();
    qurazyFeature.onStreetClear(engine);
    assert.equal(engine.data.qurazyOverlay, undefined);
  });

  it('the banner box is the art box where playVectorOverlay draws it', () => {
    const rect = { left: 10, top: 20, width: 960, height: 540 };
    const box = qurazyBannerBox(meta, rect, { topY: -0.05, scale: 1 });
    const [sw, sh] = meta.stage;
    const [bx, by, bw, bh] = meta.box;
    assert.equal(box.left, 10 + 480 + bx - sw / 2);
    assert.equal(box.top, 20 + 540 * -0.05 + by);
    assert.equal(box.right - box.left, bw);
    assert.equal(box.bottom - box.top, bh);
    assert.equal(qurazyBannerBox(null, rect), null);
  });

  it('at 760 px wide and below the banner meets the feed column', () => {
    // style.css: the feed at left 10, width min(300px, 72%) at 760 and below, min(320px, 42%) above.
    const feedAt = (w) => ({ left: 10, right: 10 + Math.min(w <= 760 ? 300 : 320, (w <= 760 ? 0.72 : 0.42) * w), top: 40, bottom: 70 });
    for (const [w, h, meets] of [[760, 430, true], [700, 400, true], [390, 300, true]]) {
      const box = qurazyBannerBox(meta, { left: 0, top: 0, width: w, height: h }, { topY: 0.05, scale: w / 960 });
      assert.equal(boxesOverlap(box, feedAt(w)), meets, `${w} px`);
    }
    assert.equal(QURAZY_FEED_ATTR, 'data-under-banner');
    const css = readFileSync(join(PUBLIC, 'style.css'), 'utf8');
    assert.match(css, /\.activity-feed\[data-under-banner\] \{ opacity: 0\.18; \}/);
  });
});
