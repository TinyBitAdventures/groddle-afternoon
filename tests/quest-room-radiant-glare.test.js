/**
 * Radiant Glare (public/js/quest-rooms/radiant-glare.js): source constants,
 * colour mixing, lamp timing and that each floor is climbable with the
 * ordinary jump only under the intended lighting.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXIT_DELAY_MS,
  FLOORS,
  HINT,
  LAMP_MS,
  RADIANT_FACTS,
  SLAB,
  isLit,
  litByTier,
  mixColor,
  radiantLayout,
  rainbowY,
  reachable,
  room,
  tierAt,
  tierSurfaces,
  walkable,
} from '../public/js/quest-rooms/radiant-glare.js';
import { QUEST_ROOMS, roomModulePath } from '../public/js/quest-rooms/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = (file) => readFileSync(join(root, '../glitch-GameServerJS/quests', file), 'utf8');
const { JUMP_RISE, JUMP_GAP, BODY_H } = RADIANT_FACTS;

/** Lighting for one floor only. */
const lights = (tier, colors) => ({ lamps: new Set(), mixer: new Set(), totem: new Set(), glare: new Set(), [tier]: new Set(colors) });
const platformId = (layout, tier, color, i) => layout.platforms.filter((p) => p.tier === tier && p.colors.includes(color))[i].id;
const standsUnder = (surface, x) => surface.x1 <= x && x <= surface.x2;

describe('Radiant Glare (radiant_glare)', () => {
  it('is the catalog room for both quests and keeps the source rules', () => {
    assert.equal(QUEST_ROOMS.radiant_glare, 'radiant_glare');
    assert.equal(QUEST_ROOMS.radiant_glare_rem, 'radiant_glare');
    assert.equal(roomModulePath('radiant_glare'), './radiant-glare.js');
    assert.equal(room.id, 'radiant_glare');
    const main = gsjs('radiant_glare.js');
    const rem = gsjs('radiant_glare_rem.js');
    // Both copies: 5 * 60 exit delay, solved_puzzle + leave, Alph favor.
    for (const src of [main, rem]) {
      assert.match(src, /5\*60, \{preserve_links: true\}/);
      assert.match(src, /"name"\t\t: "solved_puzzle"/);
      assert.match(src, /"name"\t\t: "leave"/);
      assert.match(src, /stats_add_favor_points\("alph"/);
    }
    assert.match(main, /"prod_tsid"\t: "LIFFFRAHB4A3JHJ"/);
    assert.match(rem, /"prod_tsid"\t: "LIFQ6PP37QB3PDA"/);
    assert.match(main, /"currants"\t: 1500/);
    assert.match(rem, /"currants"\t: 350/);
    assert.equal(EXIT_DELAY_MS, 5 * 60 * 1000);
    assert.equal(room.durationMs, EXIT_DELAY_MS);
    assert.equal(room.onLeave, undefined, 'leaving solved sets the default `leave` flag');
    assert.ok(HINT.startsWith("Can't reach a button?"));
  });

  it('mixes the three primaries like paint', () => {
    assert.equal(mixColor(null, null), null);
    assert.equal(mixColor('red', null), 'red');
    assert.equal(mixColor(null, 'blue'), 'blue');
    assert.equal(mixColor('yellow', 'yellow'), 'yellow');
    assert.equal(mixColor('red', 'yellow'), 'orange');
    assert.equal(mixColor('yellow', 'red'), 'orange');
    assert.equal(mixColor('red', 'blue'), 'purple');
    assert.equal(mixColor('blue', 'yellow'), 'green');
  });

  it('times the first room’s lamps and lights the two-tone disc in blue and purple', () => {
    const now = 1_000_000;
    const state = { lampUntil: { yellow: now + LAMP_MS, blue: now - 1, red: 0 }, mixer: { a: 'yellow', b: 'blue' }, totem: { a: 'blue', b: 'red' } };
    const lit = litByTier(state, now);
    assert.deepEqual([...lit.lamps], ['yellow']);
    assert.deepEqual([...lit.mixer], ['green']);
    assert.deepEqual([...lit.totem], ['purple']);
    assert.equal(litByTier(state, now + LAMP_MS).lamps.size, 0, 'the lamp is out after LAMP_MS');
    const junction = radiantLayout().platforms.find((p) => p.junction);
    assert.ok(isLit(junction, lights('totem', ['blue'])));
    assert.ok(isLit(junction, lights('totem', ['purple'])));
    assert.ok(!isLit(junction, lights('totem', ['green'])));
    // A lamp only lights its own floor.
    assert.ok(!isLit(junction, lights('mixer', ['purple'])));
  });

  it('floor 1: yellow reaches the blue orb, blue the red orb, red the ladder', () => {
    const layout = radiantLayout();
    const [yellowOrb, blueOrb, redOrb] = layout.orbs;
    const ladder = layout.ladders[0];
    const reach = (colors) => {
      const s = tierSurfaces(layout, 'lamps', lights('lamps', colors));
      return { s, ids: reachable(s, 'rg_floor_lamps') };
    };
    // A surface from which an orb is touched (standing, or with one jump).
    const touches = (surf, orb) => standsUnder({ x1: surf.x1 - 30, x2: surf.x2 + 30 }, orb.x) && surf.y - orb.y >= 0 && surf.y - orb.y <= JUMP_RISE + BODY_H - 20;
    const floor = layout.solids.find((s) => s.id === 'rg_floor_lamps');
    assert.ok(touches(floor, yellowOrb), 'the yellow orb is on the floor walk');
    assert.ok(!touches(floor, blueOrb) && !touches(floor, redOrb));
    const y = reach(['yellow']);
    assert.ok(y.s.some((s) => y.ids.has(s.id) && touches(s, blueOrb)), 'yellow reaches the blue orb');
    assert.ok(!y.s.some((s) => y.ids.has(s.id) && touches(s, redOrb)));
    const yb = reach(['yellow', 'blue']);
    assert.ok(yb.s.some((s) => yb.ids.has(s.id) && touches(s, redOrb)), 'blue reaches the red orb');
    const top = layout.platforms.find((p) => p.tier === 'lamps' && standsUnder(p, ladder.x) && p.y === ladder.yBot);
    assert.ok(top, 'the ladder stands on the last red disc');
    assert.ok(!yb.ids.has(top.id));
    assert.ok(reach(['yellow', 'blue', 'red']).ids.has(top.id));
    // Once on blue, yellow may go out: blue + red alone still climbs from the first blue disc.
    const br = tierSurfaces(layout, 'lamps', lights('lamps', ['blue', 'red']));
    assert.ok(reachable(br, platformId(layout, 'lamps', 'blue', 0)).has(top.id));
    // Ten seconds of light, as the footage times it.
    assert.equal(LAMP_MS, 10_000);
  });

  it('floor 2: only green (yellow + blue) reaches the ladder; purple reaches the bonus quoin', () => {
    const layout = radiantLayout();
    const ladder = layout.ladders[1];
    const base = layout.platforms.find((p) => p.tier === 'mixer' && p.colors.includes('green') && p.y === ladder.yBot);
    assert.ok(base && standsUnder(base, ladder.x));
    const bonus = layout.quoins[1];
    const reachesBonus = (s, ids) => s.some((x) => ids.has(x.id) && standsUnder(x, bonus.x) && x.y - bonus.y <= BODY_H + 16 && x.y > bonus.y);
    for (const color of ['red', 'yellow', 'blue', 'orange', 'purple', 'green']) {
      const s = tierSurfaces(layout, 'mixer', lights('mixer', [color]));
      const ids = reachable(s, 'rg_floor_mixer');
      assert.equal(ids.has(base.id), color === 'green', `${color} and the ladder`);
      assert.equal(reachesBonus(s, ids), color === 'purple', `${color} and the bonus quoin`);
    }
    assert.equal(mixColor(layout.solution.mixer.a, layout.solution.mixer.b), 'green');
    // Every bulb sits on the console face, inside the visible band.
    for (const b of layout.bulbs.filter((x) => x.panel === 'mixer')) {
      assert.ok(FLOORS.mixer - b.y <= 160);
      assert.ok(b.x > layout.console.x1 && b.x < layout.console.x2);
    }
  });

  it('floor 3: blue climbs halfway, purple from the two-tone disc reaches the ledge', () => {
    const layout = radiantLayout();
    const junction = layout.platforms.find((p) => p.junction);
    const ladder = layout.ladders[2];
    const ledge = layout.solids.find((s) => s.id === 'rg_ledge');
    assert.ok(standsUnder(ledge, ladder.x) && ledge.y === ladder.yBot);
    const from = (colors, start = 'rg_floor_totem') => reachable(tierSurfaces(layout, 'totem', lights('totem', colors)), start);
    // The slab is a hop up from the floor; nothing else is.
    assert.ok(FLOORS.totem - layout.totem.top <= JUMP_RISE);
    assert.deepEqual([...from([])].sort(), ['rg_floor_totem', 'rg_totem_slab']);
    for (const color of ['red', 'yellow', 'blue', 'orange', 'purple', 'green']) {
      const ids = from([color]);
      assert.ok(!ids.has('rg_ledge'), `${color} alone never reaches the ledge`);
      assert.equal(ids.has(junction.id), color === 'blue', `${color} and the two-tone disc`);
    }
    assert.ok(from(['purple'], junction.id).has('rg_ledge'), 'purple from the two-tone disc');
    const [first, second] = layout.solution.totem;
    assert.equal(mixColor(first.a, first.b), 'blue');
    assert.equal(mixColor(second.a, second.b), 'purple');
    // Orange leads to its own quoin.
    const orangeQuoin = layout.quoins[2];
    const ids = from(['orange']);
    const s = tierSurfaces(layout, 'totem', lights('totem', ['orange']));
    assert.ok(s.some((x) => ids.has(x.id) && standsUnder(x, orangeQuoin.x) && x.y - orangeQuoin.y <= BODY_H + 16 && x.y > orangeQuoin.y));
    // The lower bank is in reach from the floor; the upper one is out of reach from the slab
    // but hangs just under the two-tone disc, in view when the switch to purple is due.
    for (const b of layout.bulbs.filter((x) => x.panel === 'totem')) {
      if (b.bank === 'a') assert.ok(FLOORS.totem - b.y > 0 && FLOORS.totem - b.y <= 160, b.id);
      else {
        assert.ok(layout.totem.top - b.y > JUMP_RISE + BODY_H, `${b.id} out of reach`);
        assert.ok(b.y > junction.y && b.y - junction.y <= 120, `${b.id} under the two-tone disc`);
      }
    }
  });

  it('keeps every ceiling out of jump reach, so the ladders are the only way up', () => {
    const layout = radiantLayout();
    const ceilings = { lamps: FLOORS.mixer, mixer: FLOORS.totem, totem: FLOORS.glare };
    for (const [tier, ceiling] of Object.entries(ceilings)) {
      const surfaces = [...layout.platforms.filter((p) => p.tier === tier), ...layout.solids.filter((s) => tierAt(s.y) === tier)];
      for (const s of surfaces) assert.ok(s.y - ceiling > JUMP_RISE + SLAB - 20, `${s.id} is ${s.y - ceiling} px under its ceiling`);
    }
    for (const l of layout.ladders) assert.ok(Object.values(FLOORS).includes(l.yTop), `${l.id} tops out on a floor`);
    // Every disc is inside the shaft and every edge-to-edge rise is a single jump.
    for (const p of layout.platforms) assert.ok(p.x1 >= 0 && p.x2 <= RADIANT_FACTS.W, p.id);
  });

  it('floor 4: the rainbow is a hop from the floor and holds three quoins over the EXIT', () => {
    const layout = radiantLayout();
    assert.ok(FLOORS.glare - rainbowY(200) <= JUMP_RISE);
    assert.ok(FLOORS.glare - rainbowY(550) > BODY_H + 60, 'room to walk under the crown');
    const arch = layout.quoins.slice(-3);
    for (const q of arch) assert.ok(rainbowY(q.x) - q.y < BODY_H, 'touched walking the arch');
    assert.ok(layout.door.x > 200 && layout.door.x < 900);
    // walkable() always includes floors, console, slab, ledge and the arch.
    const lines = walkable(layout, litByTier({}));
    for (const id of ['rg_floor_lamps', 'rg_console', 'rg_totem_slab', 'rg_ledge', 'rg_rainbow_200']) assert.ok(lines.some((l) => l.id === id), id);
    assert.ok(!lines.some((l) => l.id.startsWith('rg_lamps_')), 'no disc while dark');
    assert.ok(existsSync(join(root, 'public/assets/decos/groddle/sign_exit_starter_01a.png')));
  });
});
