/**
 * Register G1086 (#573): Jacob's Climb's lower-left pocket. ladder_1316049716226's foot hangs
 * 147 px over the floor and wall_1316049716224 closes the pocket under it; the grab reaches 113 px
 * over the feet (street-model.js LADDER_GRAB_BELOW, Glitch's hit box), so a player who climbs
 * down it finds Up at its foot does nothing. The way out is Glitch's own: a jump, then Up in the
 * air (js/movement.js ladderMount). The geometry and the grab stay; the builder lists such
 * pockets (tools/ecology/build-ladder-pockets.mjs) and a hint says how out, once a visit.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LADDER_POCKETS } from '../public/js/ladder-pockets-data.js?v=eb8f9176';
import { STREET_TRAPS } from '../public/js/street-traps-data.js?v=f6eb19ad';
import { LADDER_POCKET_DWELL_MS, ladderPocketText, onTrapFloor, slashCommandsFeature, trapLinesOn } from '../public/js/features/slash-commands-feature.js?v=9a72e1f2';
import { STUCK_TEXT } from '../public/js/slash-commands.js?v=bb2569aa';
import { ladderMount } from '../public/js/movement.js?v=f4be1a05';
import { LADDER_GRAB_BELOW, platformYAt } from '../public/js/street-model.js?v=a9a05f9d';
import { TRAP_JUMPS } from '../tools/ecology/build-street-traps.mjs';
import { highLadders, ladderPocketsOf, renderPockets } from '../tools/ecology/build-ladder-pockets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const JACOBS_CLIMB = 'GCR13L1JQEM1OSG';
const FLOOR = '_pl1290542624379';
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
/** Where the roads into Jacob's Climb put you (its two neighbours' signposts). */
const arrivals = () => ['GCR12NU45AM12BB', 'GCRHJHOFQNL1PHP'].flatMap((tsid) => street(tsid).signposts.flatMap((post) => post.connects || [])
  .filter((c) => c.tsid?.slice(1) === JACOBS_CLIMB.slice(1) && !c.hidden).map((c) => ({ ...c.arrive, from: tsid })));

/** Feet on Jacob's Climb's bottom floor at screen x: in the pocket (left of the wall, x 107) or out. */
function onFloor(x) {
  const s = street(JACOBS_CLIMB);
  const p = trapLinesOn(s, { [JACOBS_CLIMB]: { [FLOOR]: 1 } })[0];
  return { x, y: platformYAt(p, x), onGround: true };
}
const IN_POCKET = 60;
const OUTSIDE = 300;

describe('ladder pockets: the list', () => {
  it('Jacob\'s Climb: the ladder\'s foot hangs 147 px over the floor, out of the 113 px grab, and a new character\'s jump makes up the 34', () => {
    const s = street(JACOBS_CLIMB);
    assert.deepEqual(s.ladders.find((l) => l.id === 'ladder_1316049716226'), { id: 'ladder_1316049716226', x: -705, y: -241, w: 50, h: 217 });
    assert.ok(s.barriers.some((b) => b.id === 'wall_1316049716224' && b.x === -643 && b.pc_perm == null), 'the wall, solid both ways');
    const high = highLadders(s);
    assert.deepEqual(high.map((l) => [l.id, l.line, l.gap]), [['ladder_1316049716226', FLOOR, 147]]);
    assert.equal(LADDER_GRAB_BELOW, 113);
    const { ladders } = ladderPocketsOf(s, arrivals());
    const l = ladders[0];
    assert.equal(l.need, 34);
    for (const jump of TRAP_JUMPS) {
      assert.equal(l.under[jump], 'pocket', `jump ${jump}`);
      assert.ok(l.jumpRise[jump] > l.need, `jump ${jump} rises ${l.jumpRise[jump]}`);
    }
    // A new character's jump gets out of the pocket onto the ladder; the floor above it still
    // doesn't lead off the street at that jump, and /stuck's hint covers that (street-traps-data).
    assert.equal(l.exit[0.7105], false);
    assert.equal(l.exit[1], true);
    assert.equal(STREET_TRAPS[JACOBS_CLIMB][FLOOR], 0.7105);
  });

  it('the generator finds the pocket left of the wall, and only that stretch of the floor', () => {
    const { lines } = ladderPocketsOf(street(JACOBS_CLIMB), arrivals());
    assert.deepEqual(lines, LADDER_POCKETS[JACOBS_CLIMB]);
    assert.deepEqual(Object.keys(lines), [FLOOR]);
    const [[jump, x1, x2]] = lines[FLOOR];
    assert.equal(jump, 1);
    // Screen x: the street's left end is 0, the wall at 107.
    assert.ok(x1 >= 0 && x1 <= 30 && x2 >= 90 && x2 <= 110, `${x1}..${x2}`);
    const pocket = trapLinesOn(street(JACOBS_CLIMB), LADDER_POCKETS);
    assert.equal(onTrapFloor(pocket, onFloor(IN_POCKET), 0.7105), true);
    assert.equal(onTrapFloor(pocket, onFloor(IN_POCKET), 1), true);
    assert.equal(onTrapFloor(pocket, onFloor(OUTSIDE), 0.7105), false, 'the floor outside the wall');
  });

  it('every listed street is a shipped one and every line a floor on it', () => {
    for (const [tsid, row] of Object.entries(LADDER_POCKETS)) {
      const ids = new Set(street(tsid).platforms.map((p) => p.id));
      for (const [line, entry] of Object.entries(row)) {
        assert.ok(ids.has(line), `${tsid} ${line}`);
        for (const jump of Array.isArray(entry) ? entry.map((r) => r[0]) : [entry]) assert.ok(TRAP_JUMPS.includes(jump), `${tsid} ${line} ${jump}`);
      }
    }
    assert.ok(renderPockets({ G1: { a: 1 } }).includes('"G1": {"a":1},'));
  });

  it('Glitch\'s way out: Up pressed in the air beside a ladder takes it', () => {
    assert.equal(ladderMount({ up: true, near: true, upPressedMs: 0, onGround: false }), 'up');
    assert.equal(ladderMount({ up: true, near: true, upPressedMs: 1000, onGround: false }), '', 'not the press that jumped');
  });
});

describe('ladder pocket hint', () => {
  let clock = 1_000_000;
  afterEach(() => slashCommandsFeature._reset());

  function fakeEngine(at, over = {}) {
    const log = [];
    const toasts = [];
    return {
      log,
      toasts,
      started: true,
      player: at,
      setData: () => {},
      pushActivity: (t) => log.push(t),
      toast: (t) => toasts.push(t),
      save() {},
      homeContext: () => ({ owned: true, inHome: false, room: 'street' }),
      whoIsHere: () => ['Ur'],
      acting: () => false,
      busy: () => false,
      transientInstance: () => false,
      movementBuff: () => ({ jump: 1 }),
      ...over,
    };
  }
  function ticks(engine, ms, step = 500) {
    for (let t = 0; t <= ms; t += step) {
      clock += step;
      slashCommandsFeature.onTick(step, clock, engine);
    }
  }
  async function enter(engine) {
    slashCommandsFeature._setClock(() => clock);
    // Hinted /stuck already, so only the pocket's hint can show.
    slashCommandsFeature.restore({ stuckHinted: true });
    await slashCommandsFeature.onStreetEnter(street(JACOBS_CLIMB), engine);
  }

  it('in the pocket, after a few seconds, says how out, once a visit', async () => {
    const engine = fakeEngine(onFloor(IN_POCKET));
    await enter(engine);
    ticks(engine, LADDER_POCKET_DWELL_MS - 1500);
    assert.deepEqual(engine.log, []);
    ticks(engine, 2000);
    assert.deepEqual(engine.log, [STUCK_TEXT.ladderJump]);
    assert.deepEqual(engine.toasts, [STUCK_TEXT.ladderJump]);
    ticks(engine, LADDER_POCKET_DWELL_MS * 3);
    assert.equal(engine.log.length, 1, 'once');
    // Another visit, another hint.
    await slashCommandsFeature.onStreetEnter(street(JACOBS_CLIMB), engine);
    ticks(engine, LADDER_POCKET_DWELL_MS + 1000);
    assert.equal(engine.log.length, 2);
  });

  it('time in the pocket adds up between jumps at the ladder', async () => {
    const engine = fakeEngine(onFloor(IN_POCKET));
    await enter(engine);
    for (let i = 0; i < 6; i += 1) {
      engine.player = onFloor(IN_POCKET);
      ticks(engine, 1000);
      engine.player = { ...onFloor(IN_POCKET), onGround: false };
      ticks(engine, 1000);
    }
    assert.deepEqual(engine.log, [STUCK_TEXT.ladderJump]);
  });

  it('not on the floor outside the wall, not in the air, not with a panel open, not with a jump that clears the wall', async () => {
    for (const [at, over] of [
      [onFloor(OUTSIDE), {}],
      [{ ...onFloor(IN_POCKET), onGround: false }, {}],
      [onFloor(IN_POCKET), { busy: () => true }],
      [onFloor(IN_POCKET), { movementBuff: () => ({ jump: 1.2 }) }],
    ]) {
      const engine = fakeEngine(at, over);
      await enter(engine);
      ticks(engine, LADDER_POCKET_DWELL_MS * 3);
      assert.deepEqual(engine.log, [], JSON.stringify({ at, over: Object.keys(over) }));
      slashCommandsFeature._reset();
    }
  });

  it('a new character in the pocket gets this hint first; /stuck\'s comes after its own wait, as the floor above leads nowhere at that jump', async () => {
    const engine = fakeEngine(onFloor(IN_POCKET), { movementBuff: () => ({ jump: 0.7105 }) });
    slashCommandsFeature._setClock(() => clock);
    await slashCommandsFeature.onStreetEnter(street(JACOBS_CLIMB), engine);
    ticks(engine, 13000);
    assert.deepEqual(engine.log, [STUCK_TEXT.ladderJump, STUCK_TEXT.hint]);
  });

  it('a phone names the Jump button and the stick; the words are plain', () => {
    assert.equal(ladderPocketText(false), 'Jump, then press Up in the air to grab the ladder.');
    assert.equal(ladderPocketText(true), 'Tap Jump, then push the stick up in the air to grab the ladder.');
    for (const t of [STUCK_TEXT.ladderJump, STUCK_TEXT.ladderJumpTouch]) assert.doesNotMatch(t, /—/);
  });
});
