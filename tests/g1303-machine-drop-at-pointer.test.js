/**
 * G1303 (#669, Austin 2026-11-25): machines could not stand as close together as Glitch's did. Ours
 * set a machine down at your feet and measured the 200 px from there; Glitch's canDrop measured the
 * 200 px from the player (pc.findCloseStack, machine_stand.js 775-783; player.js 1152-1186 takes the
 * distance from this.x / this.y), and in Decoration Mode a stack dragged from the pack landed at the
 * pointer (HandOfDecorator.as dropItemFromPackOnTargetPlatform 1673-1690 sent drop_x / drop_y,
 * takeable.js 164-170 put it there). That is how the 2012 house's top floor has machines 115, 135
 * and 148 px apart. Austin: drop at the pointer in Decoration Mode, the 200 px rule kept.
 * Online (lane machine2k): the place act carries where the game draws the place's x 0 and walk line
 * (ox, oy); the realtime server reads the player's own position from its record of their moves against
 * them and sends it to the site as "from" (home_machines.go machineFromPos), and the site's placeWhy
 * measures the 200 px from there. tests/fixtures/machine-place-vectors.json is one table of cases run
 * on both the game's placeCheck and the site's placeWhy.
 * Run: GRODDLE_SITE_DIR=<site> GRODDLE_SERVER_DIR=<server> node --test tests/g1303-machine-drop-at-pointer.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { MACHINE_SPACING, placeCheck, roomFixedXs, roomMachineSpan, roomSpan } from '../public/js/home-machines.js?v=5a45be0c';
import { homeMachinesFeature } from '../public/js/features/home-machines-feature.js?v=7ca23ab8';
import { Display, FakeEl, fakePixi } from './fake-scene.js';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const client = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
const line = (file, n) => readFileSync(file, 'utf8').split('\n')[n - 1];
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const VECTORS = JSON.parse(read('tests/fixtures/machine-place-vectors.json')).cases;
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
const jsWhy = (c) => {
  const check = placeCheck({ machines: c.machines.map((rx) => ({ rx })), fixed: c.fixed, rx: c.rx, span: c.span ? { lo: c.span[0], hi: c.span[1] } : undefined, classTsid: 'fuelmaker', from: c.from });
  return check.ok ? null : check.why;
};

describe('Glitch measured the 200 px from the player, and put a dragged stack at the pointer', () => {
  it('the source says so', () => {
    assert.match(line(join(gsjs, 'items/machine_stand.js'), 775), /pc\.findCloseStack\('machine_stand', 200\)/);
    assert.match(line(join(gsjs, 'items/machine_stand.js'), 781), /pc\.findCloseStack\(is_machine, 200\)/);
    assert.match(line(join(gsjs, 'players/player.js'), 1169), /var dx = it\.x - this\.x;/);
    assert.match(line(join(gsjs, 'items/include/takeable.js'), 164), /var dest_x = pc\.x;/);
    assert.match(line(join(gsjs, 'items/include/takeable.js'), 169), /dest_x = intval\(msg\.drop_x\);/);
    assert.match(line(join(client, 'control/HandOfDecorator.as'), 1673), /function dropItemFromPackOnTargetPlatform/);
    assert.match(line(join(client, 'control/HandOfDecorator.as'), 1688), /last_closest_pl_pt\.x,/);
    assert.equal(MACHINE_SPACING, 200, 'the rule stays');
  });
});

describe('placeCheck: the 200 px from where you stand', () => {
  const span = roomSpan('house:2', { wallSegments: 11 });
  it('at your feet nothing changes: 200 px between machines', () => {
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 499, span, classTsid: 'woodworker' }).why, 'near');
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 500, span, classTsid: 'woodworker' }).ok, true);
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 499, span, classTsid: 'woodworker', from: { rx: 499, dy: 0 } }).why, 'near');
  });
  it('dropped nearer than 200 px is fine while you stand 200 px from every machine', () => {
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 420, span, classTsid: 'woodworker', from: { rx: 520, dy: 0 } }).ok, true);
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 420, span, classTsid: 'woodworker', from: { rx: 470, dy: 0 } }).why, 'near');
    // Euclidean, as findCloseStack: standing up on a piece counts the height too.
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 420, span, classTsid: 'woodworker', from: { rx: 460, dy: -150 } }).ok, true);
    assert.equal(placeCheck({ machines: [{ rx: 300 }], rx: 420, span, classTsid: 'woodworker', from: { rx: 460, dy: -100 } }).why, 'near');
  });
  it('the ends are where the machine goes', () => {
    assert.equal(placeCheck({ machines: [], rx: span.lo + 70, span, classTsid: 'woodworker', from: { rx: 700, dy: 0 } }).why, 'edge');
  });
  it('the 2012 house\'s top floor (158, 273, 408, 556: 115, 135 and 148 px apart) can be laid out again', () => {
    const house = JSON.parse(readFileSync(join(root, '..', 'research', 'houses', 'glitch-house-2012.json'), 'utf8'));
    const want = house.floors[2].machines;
    assert.deepEqual(want.map((m) => m.x), [158, 273, 408, 556]);
    const placed = [];
    for (const m of want) {
      // Stand just over 200 px right of the last one and drop it at its x.
      const stand = placed.length ? Math.max(...placed.map((p) => p.rx)) + 201 : m.x;
      const check = placeCheck({ machines: placed, rx: m.x, span: roomSpan('house:2', { wallSegments: house.segments }), classTsid: m.class, from: { rx: stand, dy: 0 } });
      assert.equal(check.ok, true, `${m.class} at ${m.x} (standing at ${stand})`);
      placed.push({ rx: check.rx });
    }
    const gaps = placed.slice(1).map((p, i) => p.rx - placed[i].rx);
    assert.deepEqual(gaps, [115, 135, 148]);
  });
});

describe('one table of cases: the game\'s placeCheck and the site\'s placeWhy agree', () => {
  it('the game', () => {
    assert.ok(VECTORS.length >= 15);
    for (const c of VECTORS) assert.equal(jsWhy(c), c.why, c.name);
  });
  it('the site (src/HomeMachines.php placeWhy)', { skip: skipSite }, () => {
    const code = `foreach (["HomePool", "HomeMachines"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeMachines as H; $R = H::rules();
      $out = []; foreach (json_decode($argv[1], true) as $c) { $out[] = H::placeWhy($R, array_map(fn ($x) => ["rx" => $x], $c["machines"]), "fuelmaker", $c["rx"], $c["span"], $c["fixed"], H::fromOf($c["from"])); }
      echo json_encode($out);`;
    const got = JSON.parse(execFileSync('php', ['-r', code, JSON.stringify(VECTORS)]).toString());
    VECTORS.forEach((c, i) => assert.equal(got[i], c.why, c.name));
  });
  it('the site refuses a from that is not one, and reads none as standing where it goes', { skip: skipSite }, () => {
    const code = `require ${JSON.stringify(SITE_DIR)} . "/src/HomeMachines.php"; use Groddle\\Minn\\HomeMachines as H;
      echo json_encode([H::fromOf(null), H::fromOf(["rx" => 5, "dy" => -3]), H::fromOf(["rx" => "5", "dy" => 0]), H::fromOf(["rx" => 5]), H::fromOf(7), H::fromOf(["rx" => 3000000, "dy" => 0])]);`;
    assert.deepEqual(JSON.parse(execFileSync('php', ['-r', code]).toString()), [null, { rx: 5, dy: -3 }, false, false, false, false]);
  });
  it('the realtime server sends its own position for the player, read against the game\'s origin', { skip: HAS_SERVER ? false : 'no groddle-afternoon-server checkout' }, () => {
    const go = readFileSync(serverPath('home_machines.go'), 'utf8');
    assert.match(go, /From  \*machineFrom `json:"from,omitempty"`/);
    assert.match(go, /px, py := cl\.Pos\(\)\n\t\ta\.From = machineFromPos\(px, py, msg\.Ox, msg\.Oy\)/);
    assert.match(go, /return &machineFrom\{Rx: int\(math\.Round\(px - \*ox\)\), Dy: int\(math\.Round\(py - \*oy\)\)\}/);
  });
});

describe('the feature: a drag let go at the pointer sets the machine down there', () => {
  const ROOM = 'GIF16EM56A12FSB'; // the Forest machine room: a place the solo session draws without a house scene
  const saved = {};
  let engine;
  const toasts = [];

  before(() => {
    for (const k of ['document', 'groddleHomeMachines', 'PIXI']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), body: new FakeEl('body'), head: new FakeEl('head'), getElementById: () => null, querySelector: () => null };
    globalThis.PIXI = fakePixi;
    engine = {
      mode: 'solo',
      started: true,
      PIXI: { Sprite: Display, Graphics: Display },
      entityLayer: new Display(),
      streetTsid: ROOM,
      platforms: [],
      inv: { woodworker: 3 },
      player: { x: 0, y: 570 },
      query: () => null,
      param: () => null,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      setData() {},
      toast(t) { toasts.push(t); },
      save() {},
      refreshPack() {},
      register(t) { return t; },
      unregister() {},
    };
    homeMachinesFeature._reset();
    homeMachinesFeature.onTick(16, Date.now(), engine);
  });

  after(() => {
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('lands at the pointer, nearer a machine than 200 px, when you stand 200 px from all of them', () => {
    const s = globalThis.groddleHomeMachines;
    assert.equal(s.state().where?.place, 'mr:forest');
    const x0 = s.home.x0;
    const fixed = roomFixedXs('mr:forest'); // -486, -29, 496: the room's own machines
    assert.deepEqual(fixed, [-486, -29, 496]);
    // Stand at room x 240 (269 px from -29, 256 from 496) and let go at 100 (129 px from the one at -29).
    engine.player.x = x0 + 240;
    const res = homeMachinesFeature.packDrop('woodworker', { x: x0 + 100, y: 570, pointer: true }, engine);
    assert.equal(res?.ok, true, toasts.at(-1));
    assert.equal(res.own, true);
    assert.deepEqual(s.state().machines.map((m) => m.rx), [100]);
    assert.equal(engine.inv.woodworker, 2);
  });

  it('refused while you stand within 200 px of one, wherever you let go', () => {
    const s = globalThis.groddleHomeMachines;
    engine.player.x = s.home.x0 + 250; // 150 px from the one just set at 100
    const res = homeMachinesFeature.packDrop('woodworker', { x: s.home.x0 + 290, y: 570, pointer: true }, engine);
    assert.equal(res?.ok, false);
    assert.equal(toasts.at(-1), 'Stand further from the other machines to set this one down.', '#730: the refusal says why');
    assert.equal(s.state().machines.length, 1);
  });

  it('without the pointer (Drop, or outside Decoration Mode) the general rules run; Place stays at your feet', () => {
    const s = globalThis.groddleHomeMachines;
    assert.equal(homeMachinesFeature.packDrop('woodworker', null, engine), null);
    assert.equal(homeMachinesFeature.packDrop('woodworker', { x: s.home.x0 + 290, y: 570 }, engine), null);
    assert.equal(homeMachinesFeature.packDrop('fuel_cell', { x: 0, y: 0, pointer: true }, engine), null);
    // Place from the pack menu: at your feet, the 200 px from there (span -700..700).
    assert.deepEqual(roomMachineSpan(), { lo: -700, hi: 700 });
    engine.player.x = s.home.x0 - 250;
    assert.equal(homeMachinesFeature.runPackVerb('woodworker', 'machine_place', engine), true);
    assert.deepEqual(s.state().machines.map((m) => m.rx), [100, -250]);
  });
});

describe('the wiring', () => {
  it('Decoration Mode takes a machine (a pack tool) and sends its pointer x and copy', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /if \(st\.from !== 'pack' \|\| \(st\.tool && !machine\)/);
    assert.match(homes, /if \(what\?\.machine\) return \{ x: p\.x, y: INTERIOR\.floorY, on: null \};/);
    assert.match(homes, /dropPackStackAt\?\.\(was\.classTsid, 1, target\.x \+ roomX0\(\), target\.y, \{ pointer: true, copy: was\.copy \}\)/);
    const game = read('public/game.js');
    assert.match(game, /features\.query\('packDrop', classTsid, \{ x, y, \.\.\.\(pointer \? \{ pointer: true \} : \{\}\), \.\.\.\(Number\.isInteger\(copy\) \? \{ copy \} : \{\}\) \}, engine\)/);
  });
});

describe('online: the place act carries the place\'s origin, so the server reads where you stand', () => {
  const ROOM = 'GIF16EM56A12FSB'; // the Forest machine room
  const saved = {};
  const sent = [];
  const toasts = [];
  let engine;
  let session;
  const flush = () => new Promise((r) => setImmediate(r));

  before(async () => {
    for (const k of ['document', 'fetch', 'GRODDLE_MP_BOOT', 'PIXI', 'groddleHomeMachines']) saved[k] = globalThis[k];
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, querySelector: () => null, head: { append() {} }, body: { append() {} } };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.PIXI = fakePixi;
    // Another player's machine at room x -300 (the room's own stand at -486, -29 and 496).
    const machine = { id: 'hm-00000000000000ab', class: 'woodworker', place: 'mr:forest', rx: -300, fuel: 50, music: true, job: null, waiting: [], owner: 11 };
    globalThis.fetch = async (url) => {
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      const out = path.startsWith('machine-rooms/') ? { now: Date.now(), machines: [machine] } : { machines: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out, text: async () => '' };
    };
    const client = { state: 'online', me: { id: 9, name: 'Bo' }, on() { return () => {}; }, send(kind, payload) { sent.push({ kind, ...payload }); return true; } };
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer: fakePixi.Container ? new fakePixi.Container() : null,
      streetTsid: ROOM,
      player: { x: 0, y: 0 },
      inv: { woodworker: 2 },
      pc: { imaginationUpgrades: [] },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      param: () => null,
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      setData() {},
      toast: (text) => toasts.push(text),
      pushActivity() {},
      refreshPack() {},
      register: (t) => t,
      unregister() {},
    };
    homeMachinesFeature._reset();
    homeMachinesFeature.onTick(16, 0, engine);
    session = globalThis.groddleHomeMachines;
    for (let i = 0; i < 20 && !session?.state().machines.length; i += 1) {
      await flush();
      homeMachinesFeature.onTick(16, i * 16, engine);
    }
  });

  after(() => {
    homeMachinesFeature._reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('let go 129 px from the room\'s machine at -29, standing 269 px from it: the act goes with ox and oy', async () => {
    assert.equal(session.state().machines.length, 1, JSON.stringify(session.state()));
    const { x0, groundY } = session.home;
    engine.player.x = x0 + 240; // 540 from -300, 269 from -29, 256 from 496
    engine.player.y = groundY;
    const res = homeMachinesFeature.packDrop('woodworker', { x: x0 + 100, y: groundY, pointer: true }, engine);
    assert.notEqual(res?.ok, false, toasts.at(-1));
    await flush();
    await flush();
    const f = sent.at(-1);
    assert.equal(f?.kind, 'home_machine');
    assert.equal(f.verb, 'place');
    assert.equal(f.rx, 100, 'where it was let go (129 px from -29: the site measures from you, not from it)');
    assert.equal(f.ox, x0);
    assert.equal(f.oy, groundY);
    assert.equal(f.from, undefined, 'the game never claims where it stands: the server reads its own record');
    // What the server reads (machineFromPos) is the solo rule's `from`.
    assert.deepEqual({ rx: Math.round(engine.player.x - f.ox), dy: Math.round(engine.player.y - f.oy) }, { rx: 240, dy: 0 });
    const c = { machines: [-300], fixed: roomFixedXs('mr:forest'), span: [-700, 700], rx: f.rx, from: { rx: 240, dy: 0 } };
    assert.equal(jsWhy(c), null);
    assert.equal(jsWhy({ ...c, from: null }), 'near', 'measured from where it goes, as the site did before');
  });
});
