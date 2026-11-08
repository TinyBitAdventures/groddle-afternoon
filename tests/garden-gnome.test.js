/**
 * G435: the Garden Gnome (items/npc_garden_gnome.js): place, teach, flip, pick up, and a bump.
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GNOME_CLASS,
  GNOME_HIT_BOX,
  GNOME_PHRASE_MAX,
  GNOME_TEXT as T,
  GNOME_TIMES,
  bumpGnome,
  cleanPhrases,
  createGnomeRuntime,
  forgetPhrase,
  gnomeCell,
  gnomeFrameIndex,
  gnomePlaceFor,
  gnomeScaleX,
  gnomeVisual,
  inGnomeBox,
  learnPhrase,
  normalizeGnomeSlice,
  phraseMs,
  placeState,
  resetDirection,
  teachMenu,
  tickGnome,
} from '../public/js/garden-gnome.js?v=fd02c15b';
import { gardenGnomeFeature as feature } from '../public/js/features/garden-gnome-feature.js?v=2e65cefb';
import { worldArtFor } from '../public/js/world-art.js?v=df476660';
import { GNOME_ART, GNOME_ART_DIR } from '../public/js/garden-gnome-art.js?v=994b7c76';
import { HOME_STREET_TSID } from '../public/js/homes.js?v=631ab6b8';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS/items/npc_garden_gnome.js');

/** Runs the states from `at` until the gnome is back at idle0 or `ms` have passed; lines it said. */
function run(g, rt, at, ms = 60000) {
  const said = [];
  for (let t = at; t <= at + ms; t += 50) {
    const out = tickGnome(g, rt, t, () => 0);
    if (out?.say) said.push({ ...out, at: t });
    if (rt.state === 'idle0' && !rt.resetAt && t > at) break;
  }
  return said;
}

describe('the source', { skip: !existsSync(GS) && 'glitch-GameServerJS is not beside the game' }, () => {
  const src = existsSync(GS) ? readFileSync(GS, 'utf8') : '';
  it('holds every line of copy', () => {
    for (const line of [T.placeOnly, T.placeTip, T.teachTip, T.flipTip, T.full, T.some, T.none, T.teachWitty, T.nevermind, T.forgot, T.inputTitle, T.inputLabel]) {
      assert.ok(src.includes(line), line);
    }
    assert.ok(src.includes('BOOM! Now I know how to say: "'));
  });

  it('holds the numbers', () => {
    assert.match(src, /apiSetHitBox\(400, 150\)/);
    assert.deepEqual({ ...GNOME_HIT_BOX }, { w: 400, h: 150 });
    assert.match(src, /input_max_chars: 150/);
    assert.equal(GNOME_PHRASE_MAX, 150);
    assert.match(src, /time\(\) - this\['!colliders'\]\[pc\.tsid\] <= 60/);
    assert.match(src, /is_chance\(0\.25\)/);
    assert.match(src, /'onResetDirection', 20\*1000/);
    assert.match(src, /var duration = 1500 \+ \(phrase\.length \* 30\)/);
    assert.match(src, /getTime\(\)\+1500/);
    assert.match(src, /getTime\(\)\+1200/);
    assert.match(src, /getTime\(\)\+800/);
    assert.match(src, /var stackmax = 1;/);
  });
});

describe('placing', () => {
  it('is your own home only', () => {
    const home = { inHome: true };
    assert.equal(gnomePlaceFor({ room: 'street' }, home), 'street');
    assert.equal(gnomePlaceFor({ room: 'interior' }, home), 'house');
    assert.equal(gnomePlaceFor({ room: 'interior', houseFloor: 2 }, home), 'house:2');
    assert.equal(gnomePlaceFor({ room: 'interior', tower: 3 }, home), 'tower:3');
    assert.equal(gnomePlaceFor({ room: 'street' }, { inHome: false }), null);
    assert.equal(gnomePlaceFor({ room: 'street' }, { inHome: true, visiting: true }), null, 'someone else\'s home');
    assert.deepEqual(placeState('street'), { enabled: true, reason: '' });
    assert.deepEqual(placeState(null), { enabled: false, reason: T.placeOnly });
  });

  it('draws its own still picture', () => {
    const art = worldArtFor(GNOME_CLASS, 1);
    assert.deepEqual([art.w, art.h], [83, 129]);
    assert.ok(existsSync(join(root, 'public', art.url)));
  });
});

describe('teaching', () => {
  it('the menu follows how many it knows', () => {
    const none = teachMenu([]);
    assert.equal(none.text, T.none);
    assert.deepEqual(none.choices.map((c) => c.value), ['teach', 'nevermind']);
    assert.equal(none.choices[0].label, 'OK');
    const some = teachMenu(['Short', 'x'.repeat(25)]);
    assert.equal(some.text, T.some);
    assert.deepEqual(some.choices.map((c) => c.value), ['teach', 'forget-0', 'forget-1', 'nevermind']);
    assert.equal(some.choices[1].label, 'Forget "Short"');
    assert.equal(some.choices[2].label, `Forget "${'x'.repeat(20)}..."`);
    const full = teachMenu(['a', 'b', 'c']);
    assert.equal(full.text, T.full);
    assert.deepEqual(full.choices.map((c) => c.value), ['forget-0', 'forget-1', 'forget-2', 'nevermind']);
  });

  it('learns up to three, each cut to 150, and forgets one', () => {
    const g = { phrases: [] };
    assert.equal(learnPhrase(g, ''), null);
    assert.equal(learnPhrase(g, '   '), null);
    assert.equal(learnPhrase(g, 'y'.repeat(200)).length, 150);
    assert.equal(learnPhrase(g, 'two'), 'two');
    assert.equal(learnPhrase(g, 'three'), 'three');
    assert.equal(learnPhrase(g, 'four'), null);
    assert.equal(forgetPhrase(g, 9), false);
    assert.equal(forgetPhrase(g, 1), true);
    assert.equal(g.phrases[1], 'three');
    assert.deepEqual(cleanPhrases(['a', 7, '', null, 'b', 'c', 'd']), ['a', '7', 'b']);
  });
});

describe('a bump', () => {
  const fresh = (phrases = []) => {
    const g = { facingLeft: true, phrases };
    return { g, rt: createGnomeRuntime(g) };
  };

  it('has its 400 x 150 box', () => {
    const g = { x: 1000, y: 500 };
    assert.equal(inGnomeBox(g, 1200, 500), true);
    assert.equal(inGnomeBox(g, 1201, 500), false);
    assert.equal(inGnomeBox(g, 1000, 349), false);
  });

  it('turns to the player and hops; silent with no phrases', () => {
    const { g, rt } = fresh();
    assert.equal(bumpGnome(g, rt, { playerX: 900, x: 1000, now: 0 }), 'hop');
    assert.equal(rt.state, 'hopStart');
    tickGnome(g, rt, 100);
    assert.equal(rt.state, 'hopLoop');
    assert.equal(rt.dir, 'right', 'player on the left: the source says right');
    assert.equal(gnomeScaleX('right'), 1, 'and the art as drawn looks left, at them');
    assert.equal(tickGnome(g, rt, 900), null);
    assert.equal(rt.state, 'idle0');
  });

  it('says one phrase after the hop, for 1.5 s + 30 ms a character', () => {
    const { g, rt } = fresh(['Hello!']);
    bumpGnome(g, rt, { playerX: 1100, x: 1000, now: 0 });
    const said = run(g, rt, 100, 9000);
    assert.equal(said.length, 1);
    assert.equal(said[0].say, 'Hello!');
    assert.equal(said[0].ms, phraseMs('Hello!') + GNOME_TIMES.bubblePadMs);
    assert.equal(phraseMs('Hello!'), 1680);
    assert.equal(rt.state, 'idle0');
  });

  it('the same player inside 60 s gets a blink at most; after that a hop', () => {
    const { g, rt } = fresh();
    bumpGnome(g, rt, { playerX: 1100, x: 1000, now: 0 });
    run(g, rt, 100, 3000);
    assert.equal(bumpGnome(g, rt, { playerX: 1100, x: 1000, now: 5000, rng: () => 0.9 }), null);
    assert.equal(bumpGnome(g, rt, { playerX: 1100, x: 1000, now: 5000, rng: () => 0.1 }), 'blink');
    tickGnome(g, rt, 6000);
    assert.equal(rt.state, 'idle0');
    assert.equal(bumpGnome(g, rt, { playerX: 1100, x: 1000, now: 60000, rng: () => 0.9 }), null, 'still within 60 s');
    assert.equal(bumpGnome(g, rt, { playerX: 1100, x: 1000, now: 60001 }), 'hop');
  });

  it('turns back to its own way after 20 s, by a hop', () => {
    const { g, rt } = fresh();
    bumpGnome(g, rt, { playerX: 900, x: 1000, now: 0 });
    assert.equal(rt.resetAt, GNOME_TIMES.resetDirectionMs);
    run(g, rt, 100, 3000);
    assert.equal(rt.dir, 'right');
    tickGnome(g, rt, 20000);
    assert.equal(rt.state, 'hopStart');
    tickGnome(g, rt, 20100);
    assert.equal(rt.dir, 'left');
  });

  it('a flip hops and talks too (onResetDirection), and a hop only starts from idle', () => {
    const { g, rt } = fresh(['Hi']);
    g.facingLeft = false;
    assert.equal(resetDirection(g, rt, 0), true);
    assert.equal(rt.hopDir, 'right');
    assert.equal(resetDirection(g, rt, 10), false, 'already hopping');
  });
});

describe('the feature', () => {
  beforeEach(() => feature._reset());

  it('saves only what it has, and keeps what a picked-up gnome knows', () => {
    assert.equal(feature.save(), undefined);
    feature.restore({ placed: [{ id: 'a', place: 'street', x: 10.4, y: 20, phrases: ['p'], facingLeft: false }, { id: '', place: 'street' }], packed: [{ phrases: ['q', 'r', 's', 't'] }] });
    assert.deepEqual(feature.save(), {
      placed: [{ facingLeft: false, phrases: ['p'], id: 'a', place: 'street', x: 10, y: 20 }],
      packed: [{ facingLeft: true, phrases: ['q', 'r', 's'] }],
    });
    assert.deepEqual(normalizeGnomeSlice(null), { placed: [], packed: [] });
  });

  it('Place replaces Drop on the pack card, and is refused away from home with the source line', () => {
    const engine = { streetTsid: 'NOT_HOME', homeContext: () => ({ inHome: false }) };
    assert.equal(feature.packVerbs('apple', engine), null);
    const [verb] = feature.packVerbs(GNOME_CLASS, engine);
    assert.deepEqual([verb.id, verb.label, verb.tooltip, verb.enabled, verb.reason], ['gnome_place', 'Place', T.placeTip, false, T.placeOnly]);
    assert.equal(feature.packDropBlockReason(GNOME_CLASS), T.useInstead);
    assert.equal(feature.packDropBlockReason('apple'), null);
    assert.equal(feature.runPackVerb(GNOME_CLASS, 'gnome_place', { ...engine, inv: { [GNOME_CLASS]: 1 } }), false);
    assert.ok(HOME_STREET_TSID);
  });

  it('a flip names the gnome in its line', () => {
    const f = readFileSync(join(root, 'public/js/features/garden-gnome-feature.js'), 'utf8');
    assert.match(f, /`You flipped a \$\{NAME\}\.`/);
    assert.match(f, /const NAME = 'Garden Gnome';/);
  });

  it('player-facing copy has no em-dash', () => {
    const copy = Object.values(T).filter((v) => typeof v === 'string').join(' ');
    assert.doesNotMatch(copy, /—/);
  });
});

describe('the 140 frames (npc_garden_gnome.swf sprite 31)', () => {
  const a = GNOME_ART;
  it('ships every frame and the source\'s labels at 24 fps', () => {
    assert.equal(a.frames.length, 140);
    assert.equal(a.fps, 24);
    assert.deepEqual(a.labels, {
      idle0: [0, 1], idleBlink: [1, 7], bounce: [8, 28], hopStart: [36, 6], hopLoop: [42, 12],
      hopEnd: [54, 7], talk: [61, 48], look: [109, 15], lookSettle: [124, 16],
    });
    assert.equal(a.cells, 80, 'held drawings are kept once');
    assert.equal(new Set(a.frames).size, a.cells);
    assert.ok(a.frames.every((c) => c >= 0 && c < a.cells));
    assert.equal(a.swfFrames.length, a.cells);
    a.swfFrames.forEach((n, k) => assert.equal(a.frames[n - 1], k, `cell ${k} is frame ${n}`));
    assert.deepEqual(a.cell, { w: 83, h: 152 });
    for (const f of [a.file, a.file.replace(/\.webp$/, '@3x.webp')]) assert.ok(existsSync(join(root, 'public', GNOME_ART_DIR, f)), f);
    // The 3x render is the same sprite, cell for cell (tools/vector-sprites/garden-gnome.json).
    const m = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/garden-gnome.json'), 'utf8'));
    assert.deepEqual(m.jobs[0].sheets[0].frameList, a.swfFrames);
  });

  it('plays each state\'s own label: blink, hop, talk and look as the source names them', () => {
    // Every label the server sets has frames (setAndBroadcastState in npc_garden_gnome.js).
    for (const s of ['idle0', 'idleBlink', 'hopStart', 'hopLoop', 'hopEnd', 'talk', 'look', 'lookSettle']) assert.ok(a.labels[s], s);
    assert.equal(gnomeFrameIndex(a, 'idle0', 5000), 0);
    assert.equal(gnomeFrameIndex(a, 'idleBlink', 0), 1);
    assert.equal(gnomeFrameIndex(a, 'idleBlink', 900), 7, 'a blink plays once and holds');
    assert.equal(gnomeFrameIndex(a, 'hopLoop', 500), 42, 'the hop loops (12 frames, 0.5 s)');
    assert.equal(gnomeFrameIndex(a, 'talk', 2000 + 1000 / 24), 62, 'talk loops');
    assert.equal(gnomeFrameIndex(a, 'look', 1400), 123, 'look turns and holds');
    assert.equal(gnomeCell(a, 'lookSettle', 1100), a.frames[139]);
    // A blink, a landing, a talk and a settle all end on the idle drawing.
    for (const i of [7, 60, 108, 139]) assert.equal(a.frames[i], a.frames[0], `frame ${i + 1}`);
  });

  it('lands a hop with hopEnd before talking or standing still (hop_onExit 427-429)', () => {
    const ms = (7 * 1000) / 24;
    let v = gnomeVisual(null, 'idle0', 0, a);
    v = gnomeVisual(v, 'hopStart', 10, a);
    assert.equal(v.label, 'hopStart');
    v = gnomeVisual(v, 'hopLoop', 110, a);
    assert.equal(v.label, 'hopLoop');
    v = gnomeVisual(v, 'talk', 910, a);
    assert.equal(v.label, 'hopEnd');
    v = gnomeVisual(v, 'talk', 910 + ms - 1, a);
    assert.equal(v.label, 'hopEnd');
    v = gnomeVisual(v, 'talk', 910 + ms, a);
    assert.deepEqual([v.label, v.at], ['talk', 910 + ms]);
    v = gnomeVisual(v, 'look', 4000, a);
    assert.equal(v.label, 'look', 'only a hop has a landing');
    const g = { facingLeft: true, phrases: [] };
    const rt = createGnomeRuntime(g);
    bumpGnome(g, rt, { playerX: 900, x: 1000, now: 0 });
    let w = gnomeVisual(null, rt.state, 0, a);
    const seen = [];
    for (let t = 0; t <= 2000; t += 25) {
      tickGnome(g, rt, t);
      w = gnomeVisual(w, rt.state, t, a);
      if (seen.at(-1) !== w.label) seen.push(w.label);
    }
    assert.deepEqual(seen, ['hopStart', 'hopLoop', 'hopEnd', 'idle0'], 'no phrases: hop, land, stand');
  });

  it('draws the frames, not the still picture', () => {
    const src = readFileSync(join(root, 'public/js/features/garden-gnome-feature.js'), 'utf8');
    assert.match(src, /gnomeVisual\(e\.vis, e\.rt\.state, t, GNOME_ART\)/);
    assert.doesNotMatch(src, /hopLift|worldArtFor/);
  });
});
