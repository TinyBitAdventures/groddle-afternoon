/**
 * G435: the Garden Gnome (items/npc_garden_gnome.js): place, teach, flip, pick up, and a bump.
 * Online, a visitor to your home sees your gnomes and can bump them (the last suite).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GNOME_CLASS,
  GNOME_HIT_BOX,
  GNOME_PHRASE_MAX,
  GNOME_TEXT as T,
  GNOME_TIMES,
  GNOME_VISIT_MAX,
  bumpGnome,
  cleanPhrases,
  createGnomeRuntime,
  forgetPhrase,
  gnomeCell,
  gnomeFrameIndex,
  gnomePlaceFor,
  gnomeScaleX,
  gnomeVisual,
  gnomesHere,
  inGnomeBox,
  learnPhrase,
  normalizeGnomeSlice,
  normalizeVisitGnomes,
  phraseMs,
  placeState,
  resetDirection,
  shiftGnomes,
  teachMenu,
  tickGnome,
  visitGnomePlace,
} from '../public/js/garden-gnome.js?v=d9f8e52b';
import { gardenGnomeFeature as feature } from '../public/js/features/garden-gnome-feature.js?v=feca566e';
import { worldArtFor } from '../public/js/world-art.js?v=0729bf92';
import { GNOME_ART, GNOME_ART_DIR } from '../public/js/garden-gnome-art.js?v=994b7c76';
import { HOME_STREET_TSID } from '../public/js/homes.js?v=631ab6b8';
import { normalizeHomeView, readVisitScene } from '../public/js/neighbours-mp.js?v=f469e970';
import { neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=ee6a285c';
import { HAS_SITE, SITE_DIR, sitePath } from '../tools/repos.mjs';

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

describe('a gnome keeps its place beside the house when the home grows (G640)', () => {
  beforeEach(() => feature._reset());
  const placed = () => [
    { id: 'st', place: 'street', x: 800, y: 870, facingLeft: true, phrases: ['hello'] },
    { id: 'ho', place: 'house', x: 1700, y: 620, facingLeft: false, phrases: [] },
    { id: 'up', place: 'house:1', x: 300, y: 620, facingLeft: true, phrases: [] },
    { id: 'to', place: 'tower:2', x: 400, y: 620, facingLeft: true, phrases: [] },
  ];
  const xs = (list) => Object.fromEntries(list.map((g) => [g.id, g.x]));
  const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : spawnSync('php', ['-v']).status !== 0 ? 'no php' : false;

  it('the source never moves what is set down: the house is x 0 and only the left edge moves', { skip: !existsSync(join(root, '../glitch-GameServerJS/locations/inc_homes.js')) && 'glitch-GameServerJS is not beside the game' }, () => {
    const src = readFileSync(join(root, '../glitch-GameServerJS/locations/inc_homes.js'), 'utf8');
    const fn = src.slice(src.indexOf('function homes_yard_rebuild'), src.indexOf('this.apiGeometryUpdated()', src.indexOf('function homes_yard_rebuild')));
    assert.match(fn, /new_dims\.l = 0 - sz\[0\];/);
    assert.match(fn, /new_dims\.l = 0 - this\.home_get_yard_size\(\);/);
  });

  it('a left expansion of the home street moves the street\'s gnomes by as much, and no others', () => {
    const list = placed();
    assert.deepEqual(shiftGnomes(list, 'street', 600).map((g) => g.id), ['st']);
    assert.deepEqual(xs(list), { st: 1400, ho: 1700, up: 300, to: 400 });
    // A removed expansion moves them back.
    shiftGnomes(list, 'street', -600);
    assert.equal(list[0].x, 800);
  });

  it('a back-yard expansion moves the gnomes on the house\'s ground floor, not upstairs or in the Tower', () => {
    const list = placed();
    assert.deepEqual(shiftGnomes(list, 'interior', 300.4).map((g) => g.id), ['ho']);
    assert.deepEqual(xs(list), { st: 800, ho: 2000, up: 300, to: 400 });
  });

  it('nothing moves without a real shift or a room it knows', () => {
    const list = placed();
    for (const [room, dx] of [['street', 0], ['street', NaN], ['street', undefined], ['tower', 50], ['', 50], [null, 50]]) {
      assert.deepEqual(shiftGnomes(list, room, dx), []);
    }
    assert.deepEqual(shiftGnomes(null, 'street', 50), []);
    assert.deepEqual(xs(list), { st: 800, ho: 1700, up: 300, to: 400 });
  });

  it('the feature hears homes-feature\'s shift as the stacks and the Craftybot do, and the save keeps the same shape', () => {
    feature.restore({ placed: placed() });
    const before = feature.save();
    assert.equal(feature.homeRoomShifted('street', 600, null), null, 'null, so every feature hears it');
    const after = feature.save();
    assert.deepEqual(xs(after.placed), { st: 1400, ho: 1700, up: 300, to: 400 });
    // Only x changed: the site (Neighbours::gnomeRows) reads the same fields as before.
    assert.deepEqual(after.placed.map((g) => ({ ...g, x: 0 })), before.placed.map((g) => ({ ...g, x: 0 })));
    assert.deepEqual(Object.keys(after.placed[0]).sort(), ['facingLeft', 'id', 'phrases', 'place', 'x', 'y']);
    feature.homeRoomShifted('interior', -150, null);
    assert.equal(feature.save().placed[1].x, 1550);
    // An old save is left as it stands: nothing moves until the home next grows.
    feature.restore({ placed: placed() });
    assert.deepEqual(xs(feature.save().placed), { st: 800, ho: 1700, up: 300, to: 400 });
    const homes = readFileSync(join(root, 'public/js/features/homes-feature.js'), 'utf8');
    const shift = homes.slice(homes.indexOf('function shiftShownRoom'), homes.indexOf('function keepStacksInHouse'));
    assert.match(shift, /engine\.query\?\.\('homeRoomShifted', room, dx, engine\);\s+engine\.save\?\.\(\);/);
  });

  it('a visitor is sent the moved x as it is stored', { skip: skipSite }, () => {
    feature.restore({ placed: placed() });
    feature.homeRoomShifted('street', 600, null);
    const state = { systems: { features: { 'garden-gnome': feature.save() } } };
    const out = JSON.parse(execFileSync('php', ['-r', `foreach (["WordFilter", "Neighbours"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; echo json_encode(Groddle\\Minn\\Neighbours::gnomeRows(json_decode(${JSON.stringify(JSON.stringify(state))}), true));`]).toString());
    assert.deepEqual(out.map((g) => [g.id, g.place, g.x]), [['st', 'street', 1400], ['ho', 'house', 1700], ['to', 'tower:2', 400]]);
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

describe('someone else\'s gnome, on a visit (multiplayer)', () => {
  const hasPhp = spawnSync('php', ['-v']).status === 0;
  const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
  const placed = [
    { id: 'gs1', place: 'street', x: 812, y: 870, facingLeft: false, phrases: ['Welcome!'] },
    { id: 'gh1', place: 'house', x: 300, y: 620, facingLeft: true, phrases: [] },
    { id: 'gt2', place: 'tower:2', x: 55, y: 620, facingLeft: true, phrases: ['Up here'] },
  ];

  it('the source lets anyone bump it and only its owner teach, flip or pick it up', { skip: !existsSync(GS) && 'glitch-GameServerJS is not beside the game' }, () => {
    const src = readFileSync(GS, 'utf8').split('\n');
    // onPlayerCollision 744-748: any player's bump reaches the state machine.
    assert.ok(src[743].includes('function onPlayerCollision(pc)'));
    assert.ok(src[745].includes("this.fsm_event_notify('player_collision', pc);"));
    // talk_onRun 611-616: the bubble has no player, so the whole location reads it, chat-filtered.
    assert.ok(src[615].includes('this.sendBubble(utils.filter_chat(phrase), duration + 250);'));
    // flip 232-243, pickup 303-312, teach 354-364: hidden (state null) from anyone but the owner.
    assert.ok(src[237].includes('else if (this.owner == pc.tsid)') && src[241].includes('return {state:null};'), 'flip');
    assert.ok(src[307].includes('else if (this.owner != pc.tsid)') && src[308].includes('return {state:null};'), 'pick up');
    assert.ok(src[359].includes('else if (this.owner == pc.tsid)') && src[363].includes('return {state:null};'), 'teach');
  });

  it('names the room a visitor stands in as the owner\'s gnome does', () => {
    assert.equal(visitGnomePlace(readVisitScene('MPH_7')), 'street');
    assert.equal(visitGnomePlace(readVisitScene('MPH_7_IN')), 'house');
    assert.equal(visitGnomePlace(readVisitScene('MPH_7_T2')), 'tower:2');
    assert.equal(visitGnomePlace(readVisitScene('GLI2V0UN7RD1T2J')), null);
    assert.equal(visitGnomePlace({ room: 'tower', floor: 12 }), null);
    // The owner's own names for the same rooms (an upper house floor is no room a visitor reaches).
    assert.equal(gnomePlaceFor({ room: 'street' }, { inHome: true }), 'street');
    assert.equal(gnomePlaceFor({ room: 'interior' }, { inHome: true }), 'house');
    assert.equal(gnomePlaceFor({ room: 'interior', tower: 2 }, { inHome: true }), 'tower:2');
    assert.equal(gnomePlaceFor({ room: 'interior', houseFloor: 1 }, { inHome: true }), 'house:1');
  });

  it('reads the site\'s list, checked: only rooms a visitor can reach, three phrases of 150', () => {
    const list = normalizeVisitGnomes([
      ...placed,
      { id: 'up', place: 'house:1', x: 1, y: 1 },
      { id: 'bad id', place: 'street', x: 1, y: 1 },
      { id: 'nox', place: 'street', y: 1 },
      { id: 'talk', place: 'street', x: 9.6, y: 870.2, phrases: ['a', '', 'b', 'c', 'd', 'x'.repeat(400)] },
      'junk',
      null,
    ]);
    assert.deepEqual(list.map((g) => g.id), ['gs1', 'gh1', 'gt2', 'talk']);
    assert.deepEqual(list[0], { facingLeft: false, phrases: ['Welcome!'], id: 'gs1', place: 'street', x: 812, y: 870 });
    assert.deepEqual([list[3].x, list[3].y, list[3].phrases], [10, 870, ['a', 'b', 'c']]);
    assert.deepEqual(normalizeVisitGnomes(null), []);
    assert.equal(normalizeVisitGnomes(Array.from({ length: 200 }, (_, i) => ({ id: `g${i}`, place: 'street', x: i, y: 0 }))).length, GNOME_VISIT_MAX);
    // The visit's view carries them; a site from before the list gives none.
    const view = { owner: { id: 7, name: 'Ada' }, home: { owned: true, style: 'meadow' }, homes: {}, gnomes: placed };
    assert.deepEqual(normalizeHomeView(view).gnomes.map((g) => g.id), ['gs1', 'gh1', 'gt2']);
    assert.deepEqual(normalizeHomeView({ ...view, gnomes: undefined }).gnomes, []);
  });

  it('shows the owner\'s gnomes of the room you stand in, and yours only at your own home', () => {
    const visit = { owner: 7, name: 'Ada', gnomes: normalizeVisitGnomes(placed) };
    const mine = [{ id: 'm1', place: 'street', x: 1, y: 2, facingLeft: true, phrases: [] }];
    const street = gnomesHere({ placed: mine, multiplayer: true, scene: readVisitScene('MPH_7'), visit });
    assert.deepEqual([street.key, street.own, street.name, street.list.map((g) => g.id)], ['visit:7:street', false, 'Ada', ['gs1']]);
    assert.deepEqual(gnomesHere({ multiplayer: true, scene: readVisitScene('MPH_7_IN'), visit }).list.map((g) => g.id), ['gh1']);
    assert.deepEqual(gnomesHere({ multiplayer: true, scene: readVisitScene('MPH_7_T2'), visit }).list.map((g) => g.id), ['gt2']);
    assert.deepEqual(gnomesHere({ multiplayer: true, scene: readVisitScene('MPH_7_T1'), visit }).list, []);
    // Someone else's visit data never shows at another home, off a visit, or in solo.
    assert.equal(gnomesHere({ multiplayer: true, scene: readVisitScene('MPH_9'), visit }), null);
    assert.equal(gnomesHere({ multiplayer: true, scene: null, visit }), null);
    assert.equal(gnomesHere({ multiplayer: false, scene: readVisitScene('MPH_7'), visit }), null);
    assert.equal(gnomesHere({ multiplayer: true, scene: readVisitScene('MPH_7'), visit: null }), null);
    // At your own home: yours, as before.
    const own = gnomesHere({ ownPlace: 'street', placed: mine, multiplayer: true, scene: null, visit });
    assert.deepEqual([own.key, own.own, own.list], ['street', true, mine]);
  });

  it('a visitor\'s bump makes it hop and say its owner\'s phrase', () => {
    const [g] = normalizeVisitGnomes(placed);
    const rt = createGnomeRuntime(g);
    assert.equal(bumpGnome(g, rt, { x: g.x, playerX: g.x - 50, now: 1000 }), 'hop');
    assert.deepEqual(run(g, rt, 1000).map((line) => line.say), ['Welcome!']);
  });

  it('has no verbs for a visitor, is never saved, and tells whose it is', () => {
    const f = readFileSync(join(root, 'public/js/features/garden-gnome-feature.js'), 'utf8');
    assert.match(f, /if \(!e\.own\) return \[\];/, 'verbsFor: Teach, Flip and Pick up are the owner\'s');
    assert.match(f, /if \(!e \|\| !e\.own\) return false;/, 'runVerb');
    assert.match(f, /\.\.\.\(own \? \{\} : \{ subtitle: T\.theirs\(name\), emptyMenuGrowl: T\.theirs\(name\) \}\),/);
    assert.equal(T.theirs('Ada'), 'That belongs to Ada.');
    // save() writes only the slice; a visit's list lives in the visit view.
    assert.match(f, /const visit = scene \? engine\.query\?\.\('homeVisitGnomes', engine\) : null;/);
    assert.doesNotMatch(f, /slice\.placed\.push\([^g]/);
    feature._reset();
    assert.equal(feature.save(), undefined);
    // The hook answers only in multiplayer with a visit under way.
    assert.equal(neighboursMpFeature.homeVisitGnomes({ mode: 'solo', streetTsid: 'MPH_7' }), null);
    assert.equal(neighboursMpFeature.homeVisitGnomes({ mode: 'multiplayer', streetTsid: 'MPH_7' }), null);
  });

  it('the site lists them from the owner\'s save, word-filtered; house phrases only for the owner and key-holders', { skip: skipSite }, () => {
    const state = { systems: { features: { 'garden-gnome': { placed: [
      { id: 'gs1', place: 'street', x: 812.4, y: 870, facingLeft: false, phrases: ['Hello  <b>there</b>', '  ', 'shit happens', 'four', 'five'] },
      { id: 'gh1', place: 'house', x: 300, y: 620, phrases: ['secret'] },
      { id: 'gu1', place: 'house:1', x: 300, y: 620, phrases: ['upstairs'] },
      { id: 'gt2', place: 'tower:2', x: '55', y: 620 },
      { id: 'bad id', place: 'street', x: 1, y: 1 },
      'junk',
      { id: 'g5', place: 'street', x: 'x', y: 1 },
    ], packed: [{ phrases: ['in the pack'] }] } } } };
    const run2 = (s, key) => execFileSync('php', ['-r', `foreach (["WordFilter", "Neighbours"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; echo json_encode(Groddle\\Minn\\Neighbours::gnomeRows(json_decode(${JSON.stringify(JSON.stringify(s))}), ${key ? 'true' : 'false'}));`]).toString();
    const noKey = JSON.parse(run2(state, false));
    assert.deepEqual(noKey.map((g) => [g.id, g.place, g.x, g.y, g.facingLeft]), [['gs1', 'street', 812, 870, false], ['gh1', 'house', 300, 620, true], ['gt2', 'tower:2', 55, 620, true]]);
    assert.equal(noKey[0].phrases.length, 3);
    assert.equal(noKey[0].phrases[0], 'Hello there');
    assert.match(noKey[0].phrases[1], /^\S{4} happens$/);
    assert.doesNotMatch(noKey[0].phrases[1], /shit/);
    assert.deepEqual(noKey[1].phrases, [], 'a gnome in the house is silent for someone without the key');
    assert.deepEqual(JSON.parse(run2(state, true))[1].phrases, ['secret']);
    assert.doesNotMatch(run2(state, true), /in the pack|upstairs/);
    assert.equal(run2({}, true), '[]');
    const many = { systems: { features: { 'garden-gnome': { placed: Array.from({ length: 90 }, (_, i) => ({ id: `g${i}`, place: 'street', x: i, y: 0 })) } } } };
    assert.equal(JSON.parse(run2(many, false)).length, GNOME_VISIT_MAX);
    // What the game reads back is what the site sent.
    assert.deepEqual(normalizeVisitGnomes(noKey), noKey.map((g) => ({ facingLeft: g.facingLeft, phrases: g.phrases, id: g.id, place: g.place, x: g.x, y: g.y })));
    const src = readFileSync(sitePath('src', 'Neighbours.php'), 'utf8');
    assert.match(src, /'gnomes' => self::gnomeRows\(\$theirs, \$key\),/);
    assert.match(src, new RegExp(`GNOMES_MAX = ${GNOME_VISIT_MAX};`));
    assert.match(src, new RegExp(`GNOME_PHRASE_MAX = ${GNOME_PHRASE_MAX};`));
  });
});
