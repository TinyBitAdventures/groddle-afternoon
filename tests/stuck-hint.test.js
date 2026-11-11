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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUCK_TEXT, bareCommand, slashPlan } from '../public/js/slash-commands.js?v=8533e143';
import { STUCK_HINT_DWELL_MS, onTrapFloor, slashCommandsFeature, trapLinesOn } from '../public/js/features/slash-commands-feature.js?v=e5dea0a6';
import { STREET_TRAPS } from '../public/js/street-traps-data.js?v=b2911c49';
import { TRAP_JUMPS, renderTraps, trapLinesOf } from '../tools/ecology/build-street-traps.mjs';
import { reachStreet, streetBuff } from '../public/js/builder/reach-graph.js?v=22368fd6';
import { validateShippedStreet } from '../public/js/builder/validate.js?v=f651621c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVEL_3_WEST = 'GLI107JLRU11EM2';
const PIENE = 'GHVL2NDFT732BK3';
const HERB_GARDENS = 'GA97L62229522GS';
const SIMO_STEER = 'GIF113PVOQU1UE5';
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const AWAY = { owned: true, inHome: false, room: 'street' };
const xmlDir = join(root, '../streets/mnt/stos/location_data');

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
      for (const [line, entry] of Object.entries(row)) {
        assert.ok(ids.has(line), `${tsid} ${line}`);
        // A plain jump, or [jump, x1, x2] runs for a floor that traps along part of it (tests/wintry-trap.test.js).
        for (const jump of Array.isArray(entry) ? entry.map((r) => r[0]) : [entry]) assert.ok(TRAP_JUMPS.includes(jump), `${tsid} ${line} ${jump}`);
        if (Array.isArray(entry)) for (const [, a, b] of entry) assert.ok(a < b, `${tsid} ${line} ${a}..${b}`);
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

  // Jethimadh (2026-11-07, a player stuck "in these dino bowels", then saved on Simo Steer): the
  // hub's geometry is Tiny Speck's to the line (2,321 platforms, every ladder, wall and door as in
  // glitch-locations), and the reach graph finds one trap in it, Herb Gardens' west floor.
  it('Jethimadh: Herb Gardens\' west floor traps a new character, and no other street in the hub traps anyone', () => {
    const index = JSON.parse(readFileSync(join(root, 'public/assets/streets/index.json'), 'utf8')).streets;
    const hub = Object.keys(index).filter((t) => index[t].hubName === 'Jethimadh');
    assert.equal(hub.length, 33);
    assert.deepEqual(hub.filter((t) => STREET_TRAPS[t]), [HERB_GARDENS]);
    const row = STREET_TRAPS[HERB_GARDENS];
    assert.equal(Object.keys(row).length, 13, 'the floor from the west end to the wall under the walkway');
    assert.ok(Object.values(row).every((j) => j === 0.7105), 'High Jumper I gets back up');
    const lines = trapLinesOn(street(HERB_GARDENS), STREET_TRAPS);
    const under = lines.find((p) => p.id === 'plat_1302676320142');
    const y = (under.y1 + under.y2) / 2;
    assert.equal(onTrapFloor(lines, { x: (under.x1 + under.x2) / 2, y, onGround: true }, 0.7105), true);
    assert.equal(onTrapFloor(lines, { x: (under.x1 + under.x2) / 2, y, onGround: true }, 0.907), false);
  });

  it('Jethimadh: the generator gets Herb Gardens from its two arrivals, and finds nothing on Simo Steer from its five', () => {
    const into = (tsid, from) => from.flatMap((t) => street(t).signposts.flatMap((post) => post.connects || [])
      .filter((c) => c.tsid?.slice(1) === tsid.slice(1) && !c.hidden).map((c) => ({ ...c.arrive, from: t })));
    const herb = into(HERB_GARDENS, ['GIF102S56SV16TJ', 'GIF15S7VPRV1DIP']);
    assert.equal(herb.length, 2);
    assert.deepEqual(trapLinesOf(street(HERB_GARDENS), herb), STREET_TRAPS[HERB_GARDENS]);
    const simo = into(SIMO_STEER, ['GIF126GSMBU1V2Q', 'GIF1AUQNSDU1UFL', 'GIF1GTHPO9V14NG', 'GIFGR4QG5IV1QPI', 'GIFMOLVTLHV1RAR']);
    assert.equal(simo.length, 5);
    assert.equal(trapLinesOf(street(SIMO_STEER), simo), null);
  });

  it('Jethimadh: the trap is Tiny Speck\'s own (no ladder, door, wall or teleporter dropped), so it stays and the hint covers it', { skip: !existsSync(xmlDir) && 'locations dump not beside this worktree' }, () => {
    const s = street(HERB_GARDENS);
    const geo = readFileSync(join(xmlDir, `${HERB_GARDENS}.xml`), 'utf8');
    assert.match(geo, /<object id="ladders">\s*<\/object>/);
    assert.match(geo, /<object id="doors">\s*<\/object>/);
    assert.equal(s.ladders, undefined);
    assert.equal(s.doors, undefined);
    // Every platform as the source has it: ends and the avatar's permeability.
    for (const p of s.platforms) {
      const at = geo.indexOf(`<object id="${p.id}">`);
      assert.ok(at > 0, p.id);
      const seg = geo.slice(at, geo.indexOf('<object id="plat_', at + 10) > 0 ? geo.indexOf('<object id="plat_', at + 10) : at + 2000);
      const end = (k) => { const b = seg.match(new RegExp(`id="${k}">([\\s\\S]*?)</object>`))[1]; return [Number(b.match(/id="x">(-?\d+)/)[1]), Number(b.match(/id="y">(-?\d+)/)[1])]; };
      const [a, b] = [end('start'), end('end')].sort((m, n) => m[0] - n[0]);
      assert.deepEqual([p.x1, p.y1, p.x2, p.y2], [...a, ...b], p.id);
    }
    assert.equal(s.platforms.length, (geo.match(/<object id="plat_\d+">/g) || []).length);
    // The three walls, with their x and permeability (wall_1315545660524, pc_perm 0, is open).
    const walls = geo.match(/<object id="wall_\d+">/g) || [];
    assert.equal(walls.length, 3);
    assert.deepEqual(s.barriers.map((w) => [w.id, w.x, w.pc_perm]), [['wall_1302676320139', -266, null], ['wall_1308962454338', 2282, null], ['wall_1315545660524', -1668, 0]]);
    const items = readFileSync(join(xmlDir, `L${HERB_GARDENS.slice(1)}.xml`), 'utf8');
    assert.doesNotMatch(items, /Teleporter|Portal|Physics Changer/);
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
