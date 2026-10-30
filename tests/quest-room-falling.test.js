/**
 * The falling room (public/js/quest-rooms/falling-room.js + falling-room-scene.js):
 * players/player.js goToFallingLevel after the Fireflex 3000 Lab's teleporter,
 * the instance label, the arrival point, the hidden teleporter back to the quest
 * exit, the CC0 arbito1.swf art (tools/room-art set falling_room) and the
 * Firefly Whistle hand-off.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { ENTRY, FALL_HUB, INSTANCE_ID, INSTANCE_LABEL, LOADING_LABEL, PHYSICS, STAGE, TEMPLATE, falling, goToFallingLevel, onTeleporter, teleporterBox, withFallingRoom } from '../public/js/quest-rooms/falling-room.js';
import {
  ARRIVAL, BURSTS, COLUMNS, DRESSING, FALL, FALL_SPEED, FLOOR, FLOOR_Y, H, NUMBERS, TELEPORTER, TONGUE, TONGUE_MID, TONGUE_TOP, VY_MAX, W,
  fallPlatforms, numberAt, numberMarks, sx, sy, tonguePoint,
} from '../public/js/quest-rooms/falling-room-scene.js';
import { FALLING_ROOM_FILES } from '../public/js/quest-rooms/falling-room-art.js';
import { room as fireflyRoom } from '../public/js/quest-rooms/firefly-whistle.js?v=g463-2';
import * as kit from '../public/js/quest-rooms/kit.js?v=g458-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const GS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const hasGS = existsSync(GS);
const read = (p) => readFileSync(join(GS, p), 'utf8');
const plan = JSON.parse(readFileSync(join(root, 'tools/room-art/falling_room.json'), 'utf8'));

describe('falling room source', () => {
  it('keeps goToFallingLevel: template, instance id, label and arrival point', () => {
    assert.deepEqual(TEMPLATE, { prod: 'LLI12DVTLA01HT5', dev: 'LHH12F9DO801RUL' });
    assert.equal(INSTANCE_ID, 'falling');
    assert.equal(INSTANCE_LABEL, 'You Feel Woooooozy...');
    assert.deepEqual(ENTRY, { x: 0, y: -10000 });
    assert.deepEqual(ARRIVAL, ENTRY);
  });

  it('matches the GSJS it was read from', { skip: !hasGS && 'no GameServerJS checkout' }, () => {
    const player = read('players/player.js');
    const fn = player.slice(player.indexOf('function goToFallingLevel'), player.indexOf('function getGreetingLocation'));
    assert.match(fn, /config\.is_dev \? 'LHH12F9DO801RUL' : 'LLI12DVTLA01HT5'/);
    assert.ok(fn.includes(`instances_create('${INSTANCE_ID}', tsid, {instance_label: '${INSTANCE_LABEL}', no_auto_return: true})`));
    assert.match(fn, /find_items\('teleporter'\)\.pop\(\)/);
    assert.match(fn, /setInstanceProp\('target_tsid', exit\.tsid\)/);
    assert.ok(fn.includes(`instances_enter('falling', ${ENTRY.x}, ${ENTRY.y})`));
    const loc = read('locations/location.js');
    assert.match(loc, /pc\.instances_get_exit\('firefly_whistle'\);\s*pc\.goToFallingLevel\(exit\);/);
    assert.match(read('inc_data_maps_prod.js'), /"LLI12DVTLA01HT5"\s*: "The falling room"/);
    // The teleporter is the hidden collision kind: nothing marks it.
    assert.match(read('items/teleporter.js'), /var is_hidden = true;/);
  });
});

describe('falling room layout', () => {
  it('drops you from the arrival point onto the tongue, inside the room', () => {
    assert.ok(FALL.l < ENTRY.x && ENTRY.x < FALL.r && FALL.t < ENTRY.y && ENTRY.y < FALL.b);
    assert.equal(W, FALL.r - FALL.l);
    assert.equal(H, FALL.b - FALL.t);
    assert.equal(FLOOR, sy(FLOOR_Y));
    assert.equal(FLOOR, H - 80, 'the engine ground of a scene');
    // The top band spans the arrival x, a little under the arrival point.
    const xs = TONGUE_TOP.map(([x]) => TONGUE.x + x);
    assert.ok(Math.min(...xs) < ENTRY.x && ENTRY.x < Math.max(...xs));
    const top = Math.min(...TONGUE_TOP.map(([, y]) => TONGUE.y + y));
    assert.ok(top > ENTRY.y && top - ENTRY.y < 200);
    // Both bands sit inside the tongue's art.
    const [, tw, th] = FALLING_ROOM_FILES.ramp_3_headroom;
    for (const [x, y] of [...TONGUE_TOP, ...TONGUE_MID]) assert.ok(x >= 0 && x <= tw && y >= 0 && y <= th, `${x},${y}`);
  });

  it('builds invisible walkable lines for both tongue bands and the floor', () => {
    const plats = fallPlatforms(kit);
    assert.equal(plats.length, TONGUE_TOP.length - 1 + TONGUE_MID.length - 1 + 1);
    assert.ok(plats.every((p) => p.style === 'invisible'));
    const floor = plats.find((p) => p.id === 'falling_floor');
    assert.deepEqual([floor.x1, floor.x2, floor.y1, floor.y2], [0, W, FLOOR, FLOOR]);
    const [x0, y0] = tonguePoint(TONGUE_TOP[0]);
    assert.equal(plats[0].x1, Math.round(x0));
    assert.equal(plats[0].y1, Math.round(y0));
  });

  it('counts down the numberjumble columns, 997 to 29, as you fall', () => {
    const marks = numberMarks();
    assert.deepEqual(marks.map((m) => m.n), [997, 953, 947, 829, 811, 743, 631, 607, 587, 439, 421, 379, 257, 233, 191, 127, 71, 29]);
    for (let i = 1; i < marks.length; i += 1) assert.ok(marks[i].y > marks[i - 1].y, 'top to bottom');
    // 953 above the tongue, 947 below it (video t124).
    assert.ok(marks[1].y < TONGUE.y + 72 && marks[2].y > TONGUE.y + 72);
    // You land ~1.5 s after 29 at the fall speed.
    const gap = FLOOR_Y - marks.at(-1).y;
    assert.ok(gap > FALL_SPEED && gap < FALL_SPEED * 2.5, `${gap}`);
    assert.equal(numberAt(ENTRY.y), 953);
    assert.equal(numberAt(FLOOR_Y), 29);
    assert.equal(numberAt(FALL.t), '');
    // The video passes 829 at t133.8 and 29 at t157.6: ~282 px/s.
    const d = marks.at(-1).y - marks[3].y;
    assert.ok(Math.abs(d / (157.6 - 133.8) - FALL_SPEED) < 15);
    assert.ok(COLUMNS.every((c) => FALLING_ROOM_FILES[c.name]));
    assert.equal(COLUMNS[1].top, COLUMNS[0].top + FALLING_ROOM_FILES[COLUMNS[0].name][2]);
    assert.ok(NUMBERS.every(([name, list]) => list.length === 9 && FALLING_ROOM_FILES[name]));
  });

  it('caps the fall speed at the video speed (vy_max multiplier)', () => {
    assert.equal(VY_MAX, 0.42);
    assert.deepEqual(PHYSICS, { vyMax: VY_MAX });
    assert.deepEqual(falling.physics(), { vyMax: VY_MAX });
  });

  it('puts the hidden teleporter across the floor', () => {
    assert.equal(TELEPORTER.y, FLOOR_Y);
    assert.equal(TELEPORTER.w, W);
    const b = teleporterBox();
    assert.equal(b.x, W / 2);
    assert.ok(onTeleporter({ x: 4, y: FLOOR }));
    assert.ok(onTeleporter({ x: W - 4, y: FLOOR }));
    assert.ok(!onTeleporter({ x: W / 2, y: FLOOR - 200 }));
    assert.ok(!onTeleporter({ x: sx(ENTRY.x), y: sy(ENTRY.y) }));
  });

  it('dresses the fall only with the falling_room CC0 set', () => {
    for (const d of [...DRESSING, ...BURSTS]) assert.ok(FALLING_ROOM_FILES[d.name], d.name);
    for (const d of DRESSING) assert.ok(d.x > FALL.l && d.x < FALL.r && d.y > FALL.t && d.y < FALL.b, `${d.name} ${d.x},${d.y}`);
    const names = new Set(DRESSING.map((d) => d.name));
    for (const n of ['arbito_tree_2', 'arbito_flower_2', 'arbito_flower_4', 'flower_6', 'flower_8', 'eye_1', 'headroom_optic_eye']) assert.ok(names.has(n), n);
  });
});

describe('falling room art', () => {
  it('matches its room-art plan (tools/room-art/build.py falling_room)', () => {
    assert.match(plan.source, /glitch-locations arbito1\.swf \(CC0\)/);
    assert.deepEqual(Object.keys(plan.pieces).sort(), Object.keys(FALLING_ROOM_FILES).sort());
    for (const [name, row] of Object.entries(plan.pieces)) {
      const [file, w, h] = FALLING_ROOM_FILES[name];
      assert.equal(file, row.file);
      assert.deepEqual([w, h], row.world);
      assert.equal(row.swf, `bundle:arbito1.swf#${name}`);
      const bytes = readFileSync(join(publicDir, 'assets/sprites/quest-rooms/falling_room', file));
      assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
    }
  });
});

/** A room ctx stub: just what the wrapper and the stage touch. */
function fakeCtx(stage, extra = {}) {
  const calls = [];
  const data = {};
  const run = { stage, status: 'solved' };
  return {
    calls,
    data,
    run,
    get stage() { return run.stage; },
    player: { x: sx(ENTRY.x), y: sy(ENTRY.y), vx: 0, vy: 0, onGround: false },
    engine: { acting: () => false },
    param: () => null,
    fx: () => false,
    leave: (opts) => calls.push(['leave', opts]),
    gotoStage: (s, opts) => {
      calls.push(['gotoStage', s, opts]);
      run.stage = s;
      return Promise.resolve(true);
    },
    setData: (k, v) => { data[`$${k}`] = v; },
    ...extra,
  };
}

describe('falling room stage', () => {
  it('wraps the lab: the lab on its own stage, the fall on `falling`', () => {
    const seen = [];
    const lab = {
      id: 'lab', theme: 'lab', hubName: 'Lab hub', durationMs: 0,
      tick: () => seen.push('lab-tick'),
      physics: () => ({ speed: 0.5 }),
      onLeave: () => { seen.push('lab-leave'); return {}; },
    };
    const room = withFallingRoom(lab);
    assert.equal(room.firstStage(), 'main');
    assert.equal(room.stageLabel(STAGE), INSTANCE_LABEL);
    assert.equal(room.stageLabel('main'), '');
    // The loading card into the fall carries its own line (video 2Z76dO4DlJ4 t120).
    assert.equal(room.loadingLabel(STAGE), LOADING_LABEL);
    assert.equal(LOADING_LABEL, 'Back to life, back to the present time');
    assert.equal(room.loadingLabel('main'), '');
    const main = fakeCtx('main');
    room.tick(main, 16);
    assert.deepEqual(seen, ['lab-tick']);
    assert.deepEqual(room.physics(main), { speed: 0.5 });
    assert.equal(room.theme, 'lab');
    assert.equal(room.hubName, 'Lab hub');
    assert.notEqual(room.hud, false);
    main.run.stage = STAGE;
    assert.equal(room.theme, 'warm');
    assert.equal(room.hubName, FALL_HUB);
    assert.equal(room.hud, false, 'no room card in the fall');
    assert.deepEqual(room.physics(main), PHYSICS);
    room.onLeave(main, 'complete');
    assert.deepEqual(seen, ['lab-tick', 'lab-leave'], "the lab's cleanup still runs");
  });

  it('builds the fall scene with the instance label at the arrival point', () => {
    // Just enough PIXI and DOM for textures.js (restored after).
    const saved = { PIXI: globalThis.PIXI, Image: globalThis.Image, document: globalThis.document };
    globalThis.PIXI = { Texture: class { constructor(o) { Object.assign(this, o); } }, ImageSource: class { constructor(o) { Object.assign(this, o); } on() {} once() {} } };
    globalThis.Image = class { set src(_u) {} decode() { return new Promise(() => {}); } };
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
    class Graphics { rect() { return this; } fill() { return this; } }
    class Sprite { constructor() { this.anchor = { set() {} }; this.scale = { set() {} }; } }
    const layer = { kids: [], addChild(c) { this.kids.push(c); } };
    const scene = falling.build({ PIXI: { Graphics, Sprite }, kit: { ...kit, sceneRoot: () => ({ layer: () => layer }) }, param: () => null });
    // Bands, bursts, two number columns, the dressing and the tongue.
    assert.equal(layer.kids.length, 1 + BURSTS.length + COLUMNS.length + DRESSING.length + 1);
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
    assert.equal(scene.label, INSTANCE_LABEL);
    assert.equal(scene.hubName, FALL_HUB);
    assert.deepEqual(scene.spawn, { x: sx(ENTRY.x), y: sy(ENTRY.y) });
    assert.equal(scene.width, W);
    assert.equal(scene.height, H);
    assert.equal(scene.ownLight, true);
  });

  it('beams you to the quest exit when you reach the floor', () => {
    const ctx = fakeCtx(STAGE);
    falling.enter(ctx);
    ctx.player.vy = 4.7;
    falling.tick(ctx, 16);
    assert.equal(ctx.data.fall.state, 'falling');
    assert.deepEqual(ctx.calls, []);
    ctx.player.y = FLOOR - 10;
    falling.tick(ctx, 16);
    assert.equal(ctx.data.fall.state, 'beamed');
    assert.deepEqual(ctx.calls, [['leave', { transition: false }]]);
    falling.tick(ctx, 16);
    assert.equal(ctx.calls.length, 1, 'once');
    falling.publish(ctx);
    assert.equal(ctx.data.$fallLabel, INSTANCE_LABEL);
    assert.equal(ctx.data.$fallNumber, '29');
  });

  it('knows when you stand on the tongue', () => {
    const ctx = fakeCtx(STAGE);
    falling.enter(ctx);
    const [x, y] = tonguePoint(TONGUE_TOP[3]);
    Object.assign(ctx.player, { x, y, onGround: true });
    falling.tick(ctx, 16);
    assert.equal(ctx.data.fall.state, 'tongue');
  });
});

describe('Firefly Whistle hand-off', () => {
  it('the lab is wrapped with the falling stage', () => {
    assert.equal(fireflyRoom.id, 'firefly_whistle');
    assert.equal(fireflyRoom.stageLabel(STAGE), INSTANCE_LABEL);
    assert.equal(fireflyRoom.firstStage(), 'main');
    assert.equal(fireflyRoom.durationMs, 0);
  });

  it('goToFallingLevel moves the run to the falling stage (the run, its exit and outcome carry over)', async () => {
    const ctx = fakeCtx('main');
    await goToFallingLevel(ctx);
    assert.deepEqual(ctx.calls, [['gotoStage', STAGE, { transition: false }]]);
  });

  it("the lab's pad calls goToFallingLevel instead of leaving", () => {
    const src = readFileSync(join(publicDir, 'js/quest-rooms/firefly-whistle.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function exitByTeleporter'), src.indexOf('/* Ticking'));
    assert.match(fn, /goToFallingLevel\(ctx\)/);
    assert.doesNotMatch(fn, /ctx\.leave\(/);
  });
});
