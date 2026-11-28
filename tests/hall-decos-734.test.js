/**
 * #734 (Austin 2026-11-27): the Bureaucratic Hall's decos as the 2012 footage shows them. Eight
 * waiting chairs (the backdrop's six and two more by the counter's dividing wall, copied from the
 * backdrop's own chair), and the signs, the TV, the lights and the glass doors where the original
 * hung them. The positions are stage pixels on bureaucratic_hall_bg (2212 x 700). The waiting
 * area runs to the last chair (the Please Wait stand inside it), and the greeting's prompt points
 * at the area from wherever you stand.
 * Run: node --test tests/hall-decos-734.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HALL, HALL_DECOS, HALL_EXIT_DOOR_Y, HALL_EXTRA_CHAIRS, HALL_LAYOUT, HALL_TEXT, createHallFlow, inWaitingArea, waitPromptFor } from '../public/js/bureaucratic-hall.js?v=29db1c45';
import { CHAIR_PATHS } from '../tools/interrogation/build-chair.mjs';
import { PAINTED_CHAIR_BOX } from '../tools/bureaucratic-hall/build-chairs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => readFileSync(join(root, 'public', p), 'utf8');

/** Chair centres on the backdrop (stage x): the tipped one, the two, the three (measured off its art). */
const PAINTED = Object.freeze({ tipped: 680, two: [793, 884], three: [1020, 1106, 1193] });
/** The counter's dividing wall (the pillar's left face) and the corner pillar between the rooms. */
const DIVIDING_WALL_X = 1460;
const CORNER_PILLAR = Object.freeze({ l: 625, r: 700, top: 108 });
/** The pen table in the desk room, and the glass doors' side wall. */
const PEN_TABLE = Object.freeze({ l: 252, r: 550 });
const CHAIR_HALF = PAINTED_CHAIR_BOX.w / 2;

const at = (name) => {
  const row = HALL_DECOS.find(([n]) => n === name);
  assert.ok(row, name);
  const [, x, y, ax, ay, scale] = row;
  return { x, y, ax, ay, scale };
};

describe('#734 the hall decos follow the 2012 footage', () => {
  it('pins every deco where the footage hangs it', () => {
    assert.deepEqual(HALL_DECOS.map((row) => [...row]), [
      ['bureaucratic_hall_light_ray_1', 390, 96, 0.5, 0, 0.5],
      ['bureaucratic_hall_sign_1', 390, 313, 0.5, 0.5, 0.5],
      ['bureaucratic_hall_light_1', 1055, 76, 0.5, 0, 0.5],
      ['sign_waiting_area', 850, 308, 0.5, 0.5, 0.5],
      ['bureaucratic_hall_waitingroom_1', 952, 308, 0.5, 0.5, 0.5],
      ['bureaucratic_hall_tv_1', 733, 108, 0.5, 0, 0.5],
      ['bureaucratic_hall_sign_wait_1', 1382, 532, 0.5, 1, 0.5],
    ]);
    assert.equal(HALL_EXIT_DOOR_Y, 610);
    for (const [name] of HALL_DECOS) assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${name}.webp`)), name);
  });

  it('eight chairs: the backdrop\'s six and two copies of its own chair by the dividing wall', () => {
    const C = HALL_EXTRA_CHAIRS;
    assert.equal(C.painted + C.dx.length, 8);
    const centres = C.dx.map((dx) => PAINTED.three[2] + dx);
    assert.deepEqual(centres, [1319, 1406]);
    // The row's own spacing between the two, a gap a little under the two-to-three gap before them.
    assert.equal(centres[1] - centres[0], PAINTED.three[2] - PAINTED.three[1]);
    const gapBefore = PAINTED.three[0] - PAINTED.two[1];
    assert.ok(centres[0] - PAINTED.three[2] < gapBefore && centres[0] - PAINTED.three[2] > gapBefore * 0.85);
    // Clear of the dividing wall, inside the SVG's box.
    assert.ok(centres[1] + CHAIR_HALF < DIVIDING_WALL_X, 'the last chair stands clear of the dividing wall');
    assert.equal(C.x, PAINTED_CHAIR_BOX.x + C.dx[0]);
    assert.equal(C.x + C.w, PAINTED_CHAIR_BOX.x + PAINTED_CHAIR_BOX.w + C.dx[1]);
    assert.equal(C.y, PAINTED_CHAIR_BOX.y);
    assert.equal(C.h, PAINTED_CHAIR_BOX.h);
  });

  it('the two chairs are the backdrop chair\'s paths, colours untouched, with its provenance', () => {
    const svg = pub(HALL_EXTRA_CHAIRS.url);
    const C = HALL_EXTRA_CHAIRS;
    assert.match(svg, /bldg_int_bhall\.swf bureaucratic_hall_bg, CC0/);
    assert.match(svg, /tools\/bureaucratic-hall\/build-chairs\.mjs/);
    assert.match(svg, new RegExp(`width="${C.w * 2}" height="${C.h * 2}" viewBox="${C.x} ${C.y} ${C.w} ${C.h}"`));
    const groups = [...svg.matchAll(/<g transform="matrix\(1\.0, 0\.0, 0\.0, 1\.0, (\d+), 0\.1\)">([\s\S]*?)<\/g>/g)];
    assert.deepEqual(groups.map((g) => Number(g[1])), [...C.dx]);
    for (const g of groups) assert.equal((g[2].match(/<path /g) || []).length, CHAIR_PATHS.length);
    assert.equal(groups[0][2], groups[1][2], 'the same chair twice');
    // The hall's brown, not the Interrogation room's red-brown recolour.
    assert.match(svg, /stop-color="#945a2b"/);
    assert.doesNotMatch(svg, /#943a2b/);
  });

  it('the signs sit where the player\'s side-by-side puts them', () => {
    const pictogram = at('bureaucratic_hall_waitingroom_1');
    assert.equal(pictogram.x, (PAINTED.two[1] + PAINTED.three[0]) / 2, 'centred in the gap between the two and the three');
    assert.ok(pictogram.y < 336, 'a little higher than before (336)');
    const plaque = at('sign_waiting_area');
    assert.ok(plaque.x < pictogram.x, 'WAITING AREA left of the pictogram');
    assert.ok(Math.abs(plaque.x - PAINTED.two[1]) <= CHAIR_HALF, 'over the third chair from the left');
    assert.equal(plaque.y, pictogram.y);
    const wait = at('bureaucratic_hall_sign_wait_1');
    const lastChair = PAINTED.three[2] + HALL_EXTRA_CHAIRS.dx[1];
    assert.ok(Math.abs(wait.x - lastChair) < CHAIR_HALF, 'Please Wait in front of the rightmost chair');
    assert.ok(wait.y < HALL.ground, 'it stands behind the walk line, by the chairs');
    const tv = at('bureaucratic_hall_tv_1');
    assert.equal(tv.ay, 0);
    assert.equal(tv.y, CORNER_PILLAR.top, 'the TV\'s top level with the corner pillar\'s top');
    assert.ok(tv.x > CORNER_PILLAR.l && tv.x < CORNER_PILLAR.r + 60, 'in the waiting room\'s corner');
    const dept = at('bureaucratic_hall_sign_1');
    assert.ok(dept.x > PEN_TABLE.l && dept.x < PEN_TABLE.r, 'the Department lettering over the pen table');
    assert.ok(dept.y > 196, 'lower than the old lintel spot');
    const ray = at('bureaucratic_hall_light_ray_1');
    assert.equal(ray.x, dept.x, 'the light ray lights the lettering');
    const names = HALL_DECOS.map(([n]) => n);
    assert.ok(names.indexOf('bureaucratic_hall_light_ray_1') < names.indexOf('bureaucratic_hall_sign_1'), 'the lettering stays crisp over the light');
    assert.ok(at('bureaucratic_hall_light_1').y <= 76, 'the ceiling light at the ceiling\'s back edge');
  });

  it('the game draws them: the chairs into the backdrop, the doors on the floor', () => {
    const game = pub('game.js');
    const draw = game.slice(game.indexOf('function drawBureaucraticHall()'), game.indexOf('function drawHallOffice('));
    const bg = draw.indexOf("deco('bureaucratic_hall_bg'");
    const chairs = draw.indexOf('textureFromUrl(HALL_EXTRA_CHAIRS.url)');
    const decos = draw.indexOf('of HALL_DECOS)');
    assert.ok(bg > 0 && bg < chairs && chairs < decos, 'backdrop, chairs, decos');
    assert.doesNotMatch(draw, /deco\('bureaucratic_hall_(sign_1|tv_1|light_1)', \d/, 'no hand-placed signs left');
    const feature = pub('js/features/bureaucratic-halls-feature.js');
    assert.match(feature, /door\.position\.set\(EXIT_X, HALL_EXIT_DOOR_Y\);/);
  });
});

/** The visit's host, enough for the greeting and the walk to the area. */
function host() {
  const prompts = [];
  const removed = [];
  const pos = { x: HALL_LAYOUT.arrival.x, y: HALL.ground };
  let answer = null;
  return {
    pos,
    prompts,
    removed,
    answer: async (value) => {
      answer(value);
      await new Promise((r) => setImmediate(r));
    },
    host: {
      now: () => 1000,
      player: () => pos,
      pcLabel: () => 'Ur',
      clerkCount: 4,
      clerkLabel: (i) => `Clerk ${i}`,
      drawClerk() {},
      say() {},
      converse: () => new Promise((resolve) => { answer = resolve; }),
      prompt: (opts) => {
        prompts.push(opts.text);
        return `p${prompts.length}`;
      },
      removePrompt: (uid) => removed.push(uid),
      applyBuff() {},
      removeBuff() {},
      acting: () => false,
      learned: () => [],
      achievements: () => [],
      buy: () => 'ok',
      setData() {},
      rng: () => 0,
    },
  };
}

describe('#734 the waiting area reaches the eight chairs and the Please Wait stand', () => {
  it('the area runs from the tipped chair to the last chair, the stand inside', () => {
    const lastChairRight = HALL_EXTRA_CHAIRS.x + HALL_EXTRA_CHAIRS.w;
    assert.deepEqual([...HALL_LAYOUT.waitingArea], [647, lastChairRight]);
    for (const x of [PAINTED.three[2] + HALL_EXTRA_CHAIRS.dx[0], PAINTED.three[2] + HALL_EXTRA_CHAIRS.dx[1], at('bureaucratic_hall_sign_wait_1').x]) {
      assert.ok(inWaitingArea(x), `x ${x} is in the waiting area`);
    }
    assert.ok(lastChairRight < DIVIDING_WALL_X && lastChairRight < HALL_LAYOUT.greetMin, 'it stops at the dividing wall, short of the counter');
  });

  it('the prompt points at the area from either side of it', () => {
    assert.equal(waitPromptFor(HALL_LAYOUT.arrival.x), HALL_TEXT.waitRight);
    assert.equal(waitPromptFor(HALL_LAYOUT.waitingArea[0] - 1), HALL_TEXT.waitRight);
    assert.equal(waitPromptFor(HALL_LAYOUT.waitingArea[1] + 1), HALL_TEXT.waitLeft);
    assert.equal(waitPromptFor(HALL_LAYOUT.greetMin), HALL_TEXT.waitLeft);
  });

  it('standing at the stand ends go_wait: Please Wait starts there', async () => {
    const h = host();
    const flow = createHallFlow(h.host);
    flow.tick(16);
    flow.hurryClerks();
    flow.tick(16);
    await h.answer('greeting-ok');
    assert.equal(flow.state.waiting, true);
    h.pos.x = at('bureaucratic_hall_sign_wait_1').x;
    flow.tick(16);
    assert.equal(flow.state.waiting, false, 'the stand is in the waiting area');
    assert.equal(flow.state.buffOn, true, 'Please Wait');
  });

  it('walk past the area while sent to it and the prompt turns round', async () => {
    const h = host();
    const flow = createHallFlow(h.host);
    flow.tick(16);
    flow.hurryClerks();
    flow.tick(16);
    await h.answer('greeting-ok');
    assert.deepEqual(h.prompts, [HALL_TEXT.waitRight]);
    // Past the area on the counter side (jumped or ran through): now it is to your left.
    h.pos.x = HALL_LAYOUT.greetMin;
    flow.tick(16);
    assert.deepEqual(h.prompts, [HALL_TEXT.waitRight, HALL_TEXT.waitLeft]);
    assert.deepEqual(h.removed, ['p1'], 'the old prompt goes');
    flow.tick(16);
    assert.equal(h.prompts.length, 2, 'once per turn, not every frame');
    assert.equal(flow.state.waiting, true);
  });
});
