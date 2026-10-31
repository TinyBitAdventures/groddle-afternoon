/**
 * G190: the three SWFs (Wrangle) and the Game they make (createGlitchGame),
 * plus the Game's Play verb. Each rule is checked against its GameServerJS
 * source. Run: node --test tests/swf.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GAME_BOX,
  GAME_STAGES,
  GLITCH_GAME,
  PLAY,
  SWF_CLASSES,
  WRANGLE,
  dropPoints,
  gameBoxVerbs,
  hasAllSwfs,
  normalizeSwfState,
  playMessage,
  swfAddedWithSet,
  swfVerbs,
  wrangleMessage,
} from '../public/js/swf.js?v=6dd72036';
import { swfFeature } from '../public/js/features/swf-feature.js?v=c0df83f4';
import { FEATURES } from '../public/js/features/index.js?v=75bb7fb7';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=85d4faba';
import { DROP_ITEMS, DROP_TABLES } from '../public/js/drop-tables-data.js?v=c51a6400';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');

function fakeEngine(over = {}) {
  const data = {};
  const log = [];
  const toasts = [];
  const dropped = { streets: {} };
  let nextId = 1;
  const engine = {
    started: true,
    inv: {},
    pc: { mood: 100, moodMax: 100, imagination: 0, xp: 0 },
    player: { x: 500, y: 600 },
    streetTsid: 'GTEST',
    worldW: 3000,
    data,
    log,
    toasts,
    dropped,
    setData: (k, v) => { data[k] = v; },
    pushActivity: (t) => log.push(t),
    toast: (t) => toasts.push(t),
    refreshPack: () => {},
    save: () => {},
    updateHud: () => {},
    floatText: () => {},
    playSound: () => {},
    param: () => null,
    get droppedItems() { return dropped; },
    droppedItemsChanged: () => {},
    dropWorldStack(classTsid, count, x, y) {
      const rows = dropped.streets[engine.streetTsid] ||= [];
      const stack = { id: `world-item-${nextId++}`, classTsid, count, x, y };
      rows.push(stack);
      return { ok: true, stack: { ...stack } };
    },
    ...over,
  };
  return engine;
}

/** Run the feature's tick until `until` (ms), in 100 ms frames. */
function run(engine, from, until) {
  for (let t = from; t <= until; t += 100) swfFeature.onTick(100, t, engine);
}

afterEach(() => swfFeature._reset());

describe('SWF wrangle (items/swf_1.js 29-84, swf_2.js, swf_3.js)', () => {
  it('keeps the source verb, line and 25 iMG with the mood bonus', () => {
    for (const cls of SWF_CLASSES) {
      const s = src(`items/${cls}.js`);
      assert.ok(s.includes(`"tooltip"			: "${WRANGLE.tooltip}"`), cls);
      assert.ok(s.includes(`self_msgs.push("${WRANGLE.line}")`), cls);
      assert.ok(s.includes('pc.stats_add_xp(25 * msg.count, false, context)'), cls);
      assert.ok(s.includes('"ok_states"			: ["in_pack"]'), cls);
      assert.ok(s.includes('this.apiDelete();'), cls);
      assert.ok(s.includes('var stackmax = 1;'), cls);
    }
    assert.equal(WRANGLE.xpPerSwf, 25);
    assert.equal(wrangleMessage(), `You wrangled a SWF. ${WRANGLE.line}`);
  });

  it('offers Wrangle on every SWF in the pack and nothing else', () => {
    assert.deepEqual(swfVerbs('swf_2', { swf_2: 1 }).map((v) => v.id), ['wrangle']);
    assert.deepEqual(swfVerbs('swf_2', {}), []);
    assert.deepEqual(swfVerbs('apple', { apple: 1 }), []);
  });

  it('the feature pays 25 iMG at full mood (x1.2 band), deletes the SWF and logs the line', () => {
    const engine = fakeEngine();
    engine.inv.swf_3 = 1;
    assert.ok(swfFeature.runPackVerb('swf_3', 'wrangle', engine));
    assert.equal(engine.inv.swf_3, 0);
    assert.equal(engine.pc.imagination, 30); // stats_xp_apply_bonus at 100% mood
    assert.equal(engine.log[0].base, wrangleMessage());
    assert.deepEqual(engine.log[0].effects, { xp: 30 });
  });
});

describe('createGlitchGame (players/inc_items.js 650-805)', () => {
  const inc = src('players/inc_items.js');

  it('quotes the trigger, timers, offsets and overlay from the source', () => {
    for (const [a, b, c] of [['swf_1', 'swf_2', 'swf_3'], ['swf_2', 'swf_1', 'swf_3'], ['swf_3', 'swf_1', 'swf_2']]) {
      assert.ok(inc.includes(`stack.class_tsid == '${a}') {\n\t\tif (this.items_has('${b}', 1) && this.items_has('${c}', 1)) {\n\t\t\tthis.apiSetTimer('createGlitchGame', 400);`), a);
    }
    assert.ok(inc.includes(GLITCH_GAME.overlay.text.replace("'", "\\'")));
    assert.ok(inc.includes('duration: 5000,') && inc.includes('locking: true,') && inc.includes("top_y: '15%',"));
    assert.ok(inc.includes('this.x + 40, this.y') && inc.includes('this.x + 80, this.y'));
    assert.ok(inc.includes("this.createItemFromGround('game_box', 1)"));
    assert.equal((inc.match(/apiSetTimer\('on(DropFirstSwf|DropSecondSwf|DropThirdSwf|FinishCreateGame)', 400\)/g) || []).length, 4);
    assert.deepEqual([...GLITCH_GAME.dropOffsets], [0, 40, 80]);
    assert.equal(GLITCH_GAME.stepMs, 400);
    assert.deepEqual([...GAME_STAGES], ['announce', 'drop2', 'drop3', 'create', 'finish']);
  });

  it('fires only when an SWF arrives and the set is complete', () => {
    const all = { swf_1: 1, swf_2: 1, swf_3: 1 };
    assert.ok(hasAllSwfs(all));
    assert.ok(!hasAllSwfs({ swf_1: 1, swf_2: 1 }));
    assert.ok(swfAddedWithSet({ swf_1: 1, swf_2: 1, swf_3: 0 }, all));
    assert.ok(!swfAddedWithSet(all, all), 'no new SWF, no game');
    assert.ok(!swfAddedWithSet({}, { swf_1: 1, swf_2: 1 }));
    assert.ok(swfAddedWithSet(null, all), 'a save that already holds all three makes its Game');
  });

  it('drops x, x + 40, x + 80 inside the street', () => {
    assert.deepEqual(dropPoints(500), [500, 540, 580]);
    assert.deepEqual(dropPoints(2950, 3000), [2950, 2976, 2976]);
  });

  it('runs the whole sequence: overlay lock, three drops, a Game, the SWFs gone', () => {
    const engine = fakeEngine();
    engine.inv.swf_1 = 1;
    engine.inv.swf_2 = 1;
    run(engine, 0, 300);
    assert.equal(swfFeature._state().game, null);
    engine.inv.swf_3 = 1; // picked up
    swfFeature.onTick(100, 1000, engine);
    assert.equal(swfFeature._state().game.stage, 'announce');
    swfFeature.onTick(100, 1399, engine);
    assert.equal(engine.inv.swf_1, 1, 'nothing for the first 400 ms');
    swfFeature.onTick(100, 1400, engine);
    assert.equal(engine.inv.swf_1, 0);
    assert.deepEqual(swfFeature.physics(), { speed: 0, jump: 0 }, 'the overlay is locking');
    assert.equal(engine.dropped.streets.GTEST.length, 1);
    swfFeature.onTick(100, 1800, engine);
    swfFeature.onTick(100, 2200, engine);
    assert.deepEqual(engine.dropped.streets.GTEST.map((r) => [r.classTsid, r.x]), [['swf_1', 500], ['swf_2', 540], ['swf_3', 580]]);
    assert.ok(!engine.inv[GAME_BOX]);
    swfFeature.onTick(100, 2600, engine);
    assert.equal(engine.inv[GAME_BOX], 1);
    assert.equal(engine.dropped.streets.GTEST.length, 3, 'the SWFs lie there one more beat');
    swfFeature.onTick(100, 3000, engine);
    assert.equal(engine.dropped.streets.GTEST, undefined);
    assert.equal(swfFeature._state().game, null);
    assert.equal(swfFeature._state().state.games, 1);
    for (const cls of SWF_CLASSES) assert.equal(engine.inv[cls], 0);
  });

  it('deletes an SWF picked back up mid-sequence, and goes again with a second set', () => {
    const engine = fakeEngine();
    Object.assign(engine.inv, { swf_1: 2, swf_2: 2, swf_3: 2 });
    run(engine, 0, 1300); // queued at 400, drops at 400 / 800 / 1200
    // Pick swf_1 back up off the ground before the finish.
    const rows = engine.dropped.streets.GTEST;
    rows.splice(rows.findIndex((r) => r.classTsid === 'swf_1'), 1);
    engine.inv.swf_1 += 1;
    run(engine, 1400, 2000);
    assert.equal(engine.inv[GAME_BOX], 1);
    assert.equal(engine.inv.swf_1, 1, 'the picked-up one still went');
    assert.ok(swfFeature._state().game, 'three more SWFs: check again');
    run(engine, 3100, 6000);
    assert.equal(engine.inv[GAME_BOX], 2);
    for (const cls of SWF_CLASSES) assert.equal(engine.inv[cls], 0);
  });

  it('a reload mid-sequence finishes the Game at once', () => {
    const engine = fakeEngine();
    Object.assign(engine.inv, { swf_1: 1, swf_2: 1, swf_3: 1 });
    run(engine, 0, 500); // announced at 400: swf_1 is on the ground
    const saved = JSON.parse(JSON.stringify(swfFeature.save()));
    assert.equal(saved.game.stage, 'drop2');
    swfFeature._reset();
    swfFeature.restore(saved);
    swfFeature.onStreetEnter({ tsid: 'GTEST' }, engine);
    assert.equal(engine.inv[GAME_BOX], 1);
    assert.equal(engine.dropped.streets.GTEST, undefined);
    for (const cls of SWF_CLASSES) assert.equal(engine.inv[cls], 0);
  });
});

describe('Game (items/game_box.js)', () => {
  const box = src('items/game_box.js');

  it('quotes Play, its 24.5 s, 250 iMG, line and the drop block', () => {
    assert.ok(box.includes(`"tooltip"			: "${PLAY.tooltip}"`));
    assert.ok(box.includes('duration: 24500,'));
    assert.ok(box.includes("this.events_add({callback: 'onFinishPlayGame', pc: pc}, 24.5);"));
    assert.ok(box.includes('this.player.stats_add_xp(250, false, context)'));
    assert.ok(box.includes(`self_msgs.push("${PLAY.line}")`));
    assert.ok(box.includes(`reason: "${PLAY.alreadyPlaying}"`));
    assert.ok(box.includes(`reason:"${PLAY.noDrop}"`));
    assert.equal(playMessage(), `You played a Game. ${PLAY.line}`);
  });

  it('plays, blocks Drop while it plays, then pays 250 iMG (x1.2) and is gone', () => {
    const engine = fakeEngine();
    engine.inv[GAME_BOX] = 1;
    const t0 = Date.now();
    assert.ok(swfFeature.runPackVerb(GAME_BOX, 'play', engine));
    assert.equal(swfFeature.packDropBlockReason(GAME_BOX), PLAY.noDrop);
    assert.equal(swfFeature.packDropBlockReason('apple'), null);
    assert.deepEqual(gameBoxVerbs(engine.inv, true)[0].reason, PLAY.alreadyPlaying);
    assert.equal(swfFeature.packVerbs(GAME_BOX, engine)[0].enabled, false);
    swfFeature.onTick(100, t0 + PLAY.durationMs - 1000, engine);
    assert.equal(engine.inv[GAME_BOX], 1);
    swfFeature.onTick(100, t0 + PLAY.durationMs + 50, engine);
    assert.equal(engine.inv[GAME_BOX], 0);
    assert.equal(engine.pc.imagination, 300);
    assert.equal(engine.log.at(-1).base, playMessage());
    assert.equal(swfFeature.packDropBlockReason(GAME_BOX), null);
  });

  it('a play survives a reload', () => {
    const engine = fakeEngine();
    engine.inv[GAME_BOX] = 1;
    swfFeature.runPackVerb(GAME_BOX, 'play', engine);
    const saved = JSON.parse(JSON.stringify(swfFeature.save()));
    swfFeature._reset();
    swfFeature.restore(saved);
    assert.ok(normalizeSwfState(saved).playUntil > Date.now());
    swfFeature.onTick(100, saved.playUntil + 1, engine);
    assert.equal(engine.inv[GAME_BOX], 0);
  });
});

describe('G311: a move takes play_glitch down (cancelAllOverlaysWeCan 193-215)', () => {
  it('the pc_overlay goes with the street and is not sent again; the play still pays', async () => {
    const { cancelAllOverlays, liveOverlayCount } = await import('../public/js/overlay-art.js?v=3753a0d2');
    cancelAllOverlays();
    swfFeature._reset();
    const engine = fakeEngine(); // no Pixi layer: the announcement is tracked all the same
    engine.inv[GAME_BOX] = 1;
    const t0 = Date.now();
    assert.ok(swfFeature.runPackVerb(GAME_BOX, 'play', engine));
    assert.equal(engine.data.swfPlayOverlay, 'playing');
    assert.ok(liveOverlayCount() >= 1, 'tracked while it plays, art loaded or not');
    assert.ok(cancelAllOverlays() >= 1);
    assert.equal(engine.data.swfPlayOverlay, 'cancelled');
    assert.equal(swfFeature._state().badge, null);
    swfFeature.onStreetClear(engine);
    swfFeature.onStreetEnter({ tsid: 'GNEXT' }, engine);
    await new Promise((r) => setTimeout(r, 20)); // a manifest load in flight does not bring it back
    assert.equal(swfFeature._state().badge, null, 'GSJS does not send it again');
    swfFeature.onTick(100, t0 + PLAY.durationMs + 50, engine);
    assert.equal(engine.inv[GAME_BOX], 0);
    assert.equal(engine.pc.imagination, 300);
    assert.equal(liveOverlayCount(), 0);
  });
});

describe('Wiring and art', () => {
  it('is registered once, and game.js asks features before a pack drop', () => {
    assert.equal(FEATURES.filter((f) => f.id === 'swf').length, 1);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /function packDropBlockReason\(classTsid\) \{\n[^\n]*\n\s*const featureReason = features\.query\('packDropBlockReason', classTsid, engine\);/);
  });

  it('barnacle scraping still rolls the three SWFs', () => {
    for (const [table, cls] of [['swfs_1', 'swf_1'], ['swfs_2', 'swf_2'], ['swfs_3', 'swf_3']]) {
      assert.ok(DROP_TABLES[table].rows.some(([, entries]) => entries.some((e) => e.item === cls)), table);
    }
  });

  it('every SWF and the Game have CC0 icons (1x and @3x), and the drop data knows it', () => {
    for (const cls of [...SWF_CLASSES, GAME_BOX]) {
      for (const f of [`${cls}.png`, `${cls}@3x.png`]) assert.ok(existsSync(join(root, 'public/assets/sprites/icons', f)), f);
      assert.equal(DROP_ITEMS[cls].art, true, cls);
    }
    // swf_1's icon is cut from Tiny Speck's own glitch-items SWF (tools/icon-hires/plan.json).
    const plan = JSON.parse(readFileSync(join(root, 'tools/icon-hires/plan.json'), 'utf8'));
    assert.match(plan.swf_1.swf, /glitch-items\/misc\/swf_1\/swf_1\.swf$/);
  });

  it('names the items as the source does', () => {
    swfFeature.init();
    for (const cls of SWF_CLASSES) assert.equal(ITEM_CATALOG[cls].label, 'SWF');
    assert.equal(ITEM_CATALOG[GAME_BOX].label, 'Game');
    assert.equal(ITEM_CATALOG[GAME_BOX].namePlural, 'Games');
  });
});
