/**
 * Register G528: /stuck is the way off a floor no plain jump leaves, and it has to be findable.
 * - A one-time hint after a while on such a floor (tools/ecology/build-street-traps.mjs lists
 *   them with the builder's reach graph).
 * - The / key opens the chat box without its slash, so "/stuck" typed from the street came out as
 *   "stuck", said aloud: the time it "did nothing" (narwhal probe, 2026-11-05). The client left the
 *   slash in the box (RightSideView.as 130-132); here a line that is only a command's name runs it.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUCK_TEXT, bareCommand, slashPlan } from '../public/js/slash-commands.js?v=02bedb12';
import { STUCK_HINT_DWELL_MS, onTrapFloor, slashCommandsFeature, trapLinesOn } from '../public/js/features/slash-commands-feature.js?v=be9d630b';
import { STREET_TRAPS } from '../public/js/street-traps-data.js?v=1ac4d01b';
import { TRAP_JUMPS, renderTraps, trapLinesOf } from '../tools/ecology/build-street-traps.mjs';
import { reachStreet, streetBuff } from '../public/js/builder/reach-graph.js?v=b8634e9a';
import { validateShippedStreet } from '../public/js/builder/validate.js?v=3201ce6e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVEL_3_WEST = 'GLI107JLRU11EM2';
const PIENE = 'GHVL2NDFT732BK3';
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const AWAY = { owned: true, inHome: false, room: 'street' };

function fakeEngine(over = {}) {
  const log = [];
  const toasts = [];
  return {
    log,
    toasts,
    saves: 0,
    started: true,
    player: { x: 2250, y: 966, onGround: true },
    setData: () => {},
    pushActivity: (t) => log.push(t),
    toast: (t) => toasts.push(t),
    save() { this.saves += 1; },
    homeContext: () => AWAY,
    whoIsHere: () => ['Ur'],
    acting: () => false,
    busy: () => false,
    transientInstance: () => false,
    movementBuff: () => ({ jump: 0.7105 }),
    ...over,
  };
}

/** Runs ticks across `ms` of the feature's clock. */
function ticks(engine, ms, step = 500) {
  for (let t = 0; t <= ms; t += step) {
    clock += step;
    slashCommandsFeature.onTick(step, clock, engine);
  }
}
let clock = 1_000_000;

describe('/stuck hint: the floors it knows', () => {
  it('lists Level 3 West\'s pit and leaves out Piene Question, whose ladders are in reach of a jump', () => {
    assert.deepEqual(Object.keys(STREET_TRAPS[LEVEL_3_WEST]).sort(), ['_pl1271533147724', '_pl1271533157246', '_pl1278705608815', 'pl1271537898408', 'plat_1335378574757']);
    assert.equal(STREET_TRAPS[PIENE], undefined);
  });

  it('the reach graph takes a ladder a jump lifts you to (Piene Question\'s stand 82 px over the floor)', () => {
    const s = street(PIENE);
    const buff = { ...streetBuff(s).buff, jump: 0.7105 };
    const arrivals = [{ x: 300, y: 1099, from: 'west' }, { x: 4700, y: 1047, from: 'east' }];
    assert.deepEqual(reachStreet(s, arrivals, { jumpGrab: true, buff }).traps, []);
    assert.ok(reachStreet(s, arrivals, { buff }).traps.length > 0, 'off by default: the placement data is built without it');
  });

  it('G555: the level builder reports no trap on Piene Question, and still reports Level 3 West\'s; the placement data stays without the jump', () => {
    const pieneArrivals = [{ x: 300, y: 1099, from: 'west' }, { x: 4700, y: 1047, from: 'east' }];
    const traps = (tsid, arr) => validateShippedStreet(street(tsid), arr, { rules: ['PHY-005'] }).findings.map((f) => f.at);
    assert.deepEqual(traps(PIENE, pieneArrivals), []);
    const editor = readFileSync(join(root, 'public/js/builder/editor.js'), 'utf8');
    assert.match(editor, /m\.reachStreet\(s, arrivals, \{ jumpGrab: true \}\)/, 'the reach map the editor draws agrees');
    assert.doesNotMatch(readFileSync(join(root, 'tools/ecology/build-unreached-floors.mjs'), 'utf8'), /jumpGrab/, 'street ecology is built without it');
    // Level 3 West, from Level 2 West's and The Drop's signposts (tests/cave-pit.test.js).
    const westArrivals = ['GHH1011JSO11ORS', 'GHH12E1QP611OPA'].flatMap((tsid) => street(tsid).signposts.flatMap((post) => post.connects || [])
      .filter((c) => c.tsid?.slice(1) === LEVEL_3_WEST.slice(1)).map((c) => ({ ...c.arrive, from: tsid })));
    assert.ok(traps(LEVEL_3_WEST, westArrivals).length > 0);
  });

  it('builds a line per floor at the highest jump it traps at', () => {
    assert.deepEqual([...TRAP_JUMPS], [0.7105, 0.907, 1]);
    const lines = trapLinesOf(street(LEVEL_3_WEST), [{ x: 4382, y: 599 }, { x: 101, y: 414 }]);
    assert.deepEqual(lines, STREET_TRAPS[LEVEL_3_WEST]);
    assert.ok(renderTraps({ G1: { a: 1 } }).includes('"G1": {"a":1},'));
  });

  it('every listed street is a shipped one and every line a floor on it', () => {
    assert.ok(Object.keys(STREET_TRAPS).length > 10);
    for (const [tsid, row] of Object.entries(STREET_TRAPS)) {
      const ids = new Set(street(tsid).platforms.map((p) => p.id));
      for (const [line, jump] of Object.entries(row)) {
        assert.ok(ids.has(line), `${tsid} ${line}`);
        assert.ok(TRAP_JUMPS.includes(jump), `${tsid} ${line} ${jump}`);
      }
    }
  });

  it('the puzzle streets are left out (their rebuilt boxes aren\'t in the model)', () => {
    const puzzles = JSON.parse(readFileSync(join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8')).streets;
    for (const tsid of Object.keys(puzzles)) assert.equal(STREET_TRAPS[tsid], undefined, tsid);
  });

  it('leaves the list out of the game\'s first load: the feature imports it when asked', () => {
    const src = readFileSync(join(root, 'public/js/features/slash-commands-feature.js'), 'utf8');
    assert.doesNotMatch(src, /^import [^;]*street-traps-data/m);
    assert.match(src, /import\('\.\.\/street-traps-data\.js/);
  });

  it('asks about feet on the floor and the jump you have now', () => {
    const lines = trapLinesOn(street(LEVEL_3_WEST), STREET_TRAPS);
    assert.equal(lines.length, 5);
    assert.equal(onTrapFloor(lines, { x: 2250, y: 966, onGround: true }, 0.7105), true);
    assert.equal(onTrapFloor(lines, { x: 2250, y: 966, onGround: true }, 1), true);
    assert.equal(onTrapFloor(lines, { x: 2250, y: 966, onGround: true }, 1.05), false, 'High Jumper III, spinach');
    assert.equal(onTrapFloor(lines, { x: 2250, y: 900, onGround: false }, 1), false, 'in the air');
    assert.equal(onTrapFloor(lines, { x: 300, y: 420, onGround: true }, 1), false, 'up on an island');
  });
});

describe('/stuck hint: once, when it would help', () => {
  afterEach(() => slashCommandsFeature._reset());
  const enter = async (engine) => {
    slashCommandsFeature._setClock(() => clock);
    await slashCommandsFeature.onStreetEnter(street(LEVEL_3_WEST), engine);
  };

  it('comes after the dwell, names /stuck, and saves', async () => {
    const engine = fakeEngine();
    await enter(engine);
    ticks(engine, STUCK_HINT_DWELL_MS - 2000);
    assert.deepEqual(engine.log, []);
    ticks(engine, 3000);
    assert.deepEqual(engine.log, [STUCK_TEXT.hint]);
    assert.deepEqual(engine.toasts, [STUCK_TEXT.hint]);
    assert.match(STUCK_TEXT.hint, /\/stuck/);
    assert.doesNotMatch(STUCK_TEXT.hint, /—/);
    assert.equal(engine.saves, 1);
    assert.equal(slashCommandsFeature.save().stuckHinted, true);
    ticks(engine, STUCK_HINT_DWELL_MS * 2);
    assert.equal(engine.log.length, 1);
  });

  it('never again after a reload, on any street', async () => {
    slashCommandsFeature.restore({ stuckHinted: true });
    const engine = fakeEngine();
    await enter(engine);
    ticks(engine, STUCK_HINT_DWELL_MS * 2);
    assert.deepEqual(engine.log, []);
    assert.equal(slashCommandsFeature.save().stuckHinted, true);
  });

  it('counts only time on the trap floor, not on an island, in the air or with a panel open', async () => {
    for (const over of [
      { player: { x: 300, y: 420, onGround: true } },
      { player: { x: 2250, y: 900, onGround: false } },
      { busy: () => true },
      { movementBuff: () => ({ jump: 4.5 }) },
    ]) {
      const engine = fakeEngine(over);
      await enter(engine);
      ticks(engine, STUCK_HINT_DWELL_MS * 2);
      assert.deepEqual(engine.log, [], JSON.stringify(Object.keys(over)));
      slashCommandsFeature._reset();
    }
  });

  it('is not shown where /stuck would refuse: a timed room, dead in Hell, or on its cooldown', async () => {
    const engine = fakeEngine({ transientInstance: () => true });
    await enter(engine);
    ticks(engine, STUCK_HINT_DWELL_MS * 2);
    assert.deepEqual(engine.log, []);
    assert.equal(slashCommandsFeature.save().stuckHinted, undefined);
    assert.ok(slashPlan('/stuck', { home: AWAY, stuckWaitMs: 1000 }).say, 'on the cooldown it answers, it doesn\'t move');
  });

  it('a street with no trap floors never ticks up', async () => {
    const engine = fakeEngine();
    await slashCommandsFeature.onStreetEnter({ tsid: PIENE, platforms: street(PIENE).platforms, bounds: street(PIENE).bounds }, engine);
    ticks(engine, STUCK_HINT_DWELL_MS * 2);
    assert.deepEqual(engine.log, []);
  });
});

describe('the / key and a command typed after it', () => {
  afterEach(() => {
    slashCommandsFeature._reset();
    delete globalThis.document;
  });

  it('names only a whole line that is a listed command', () => {
    for (const [line, want] of [['stuck', '/stuck'], [' STUCK ', '/stuck'], ['help', '/help'], ['home', '/home'], ['who', '/who']]) assert.equal(bareCommand(line), want);
    for (const line of ['', 'stuck here', 'hello', 'beans', '/stuck', 'help me']) assert.equal(bareCommand(line), '', line);
  });

  const dom = (value) => {
    const box = { id: 'local-chat-input', value };
    globalThis.document = { activeElement: box, getElementById: (id) => (id === 'local-chat-input' ? box : null), addEventListener: () => {} };
    return box;
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const submit = () => slashCommandsFeature._onChatSubmit({ target: { id: 'local-chat-form' } });
  const slash = (target = { matches: () => false }) => slashCommandsFeature._onSlashKey({ key: '/', target });

  it('a box the key opened turns "stuck" into the command, before the chats read it', async () => {
    const engine = fakeEngine();
    const box = dom('');
    slashCommandsFeature.init(engine);
    slash();
    await flush();
    box.value = 'stuck';
    submit();
    assert.equal(box.value, '/stuck');
    assert.equal(slashCommandsFeature._state().last, 'slash-key:/stuck');
  });

  it('ordinary chat after the key is left alone, and the line after it is not rewritten', async () => {
    const box = dom('');
    slashCommandsFeature.init(fakeEngine());
    slash();
    await flush();
    box.value = 'stuck in the caves';
    submit();
    assert.equal(box.value, 'stuck in the caves');
    box.value = 'stuck';
    submit();
    assert.equal(box.value, 'stuck', 'the mark lasts one line');
  });

  it('a box opened by a click, the key in a field, or a blur in between is plain chat', async () => {
    const box = dom('');
    slashCommandsFeature.init(fakeEngine());
    box.value = 'stuck';
    submit();
    assert.equal(box.value, 'stuck', 'never pressed');
    box.value = '';
    slash({ matches: () => true });
    await flush();
    box.value = 'stuck';
    submit();
    assert.equal(box.value, 'stuck', 'pressed while typing');
    box.value = '';
    slash();
    await flush();
    slashCommandsFeature._onChatBlur({ target: { id: 'local-chat-input' } });
    box.value = 'stuck';
    submit();
    assert.equal(box.value, 'stuck', 'left the box');
  });

  it('the key that opened nothing (a dialog up) marks nothing', async () => {
    const box = dom('');
    globalThis.document.activeElement = null;
    slashCommandsFeature.init(fakeEngine());
    slash();
    await flush();
    globalThis.document.activeElement = box;
    box.value = 'stuck';
    submit();
    assert.equal(box.value, 'stuck');
  });
});
