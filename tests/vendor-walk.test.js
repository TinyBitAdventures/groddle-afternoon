/**
 * The vendor NPCs walk (register G680): js/vendor-walk.js, the walk strips in js/vendor-npcs.js
 * VENDOR_NPC_MOTION_ART, features/vendor-npcs-feature.js. Sources: glitch-GameServerJS
 * items/npc_tool_vendor.js, npc_cooking_vendor.js, npc_jabba1.js, npc_jabba2.js,
 * npc_sno_cone_vending_machine.js, npc_gardening_vendor.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VENDOR_PLAN_MOVES,
  VENDOR_POSES,
  VENDOR_RESUME_MS,
  VENDOR_WALK,
  faceToward,
  holdVendor,
  releaseVendor,
  vendorClip,
  vendorClock,
  vendorHeld,
  vendorPlan,
  vendorWalkAt,
} from '../public/js/vendor-walk.js?v=babf9297';
import {
  VENDOR_NPC_ART,
  VENDOR_NPC_CLASSES,
  VENDOR_NPC_MOTION_ART,
  vendorAnchor,
  vendorSheet,
  vendorStates,
  vendorStrip,
} from '../public/js/vendor-npcs.js?v=7cfca6a9';
import { walkerSpan } from '../public/js/street-creatures.js?v=f0568fb4';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'items/npc_tool_vendor.js'));
const gsjsItem = (cls) => readFileSync(join(GSJS, 'items', `${cls}.js`), 'utf8');

const HOME = { l: 300, r: 2200, x0: 1200 };
const CLIPS = { turn: { 1: 367, '-1': 333 }, end: 467 };
const walks = (plan) => plan.segs.filter((g) => g.pose === 'walk');

describe('the source\'s walk rules', () => {
  it('reads each class\'s speed, steps and stops from its GSJS item', { skip: !hasGsjs && 'needs glitch-GameServerJS beside the repo' }, () => {
    const tool = gsjsItem('npc_tool_vendor');
    assert.match(tool, /"walk_type"\s*:\s*"roam"/);
    assert.match(tool, /this\.npc_walk_speed = this\.npc_climb_speed = randInt\(50,55\);/);
    assert.match(tool, /choose_one\(\[-400, -250\]\)/);
    // Its own onPathing stands 10 s on arriving and does not turn round.
    assert.match(tool, /function onPathing\(args\)\{ \/\/ defined by npc_tool_vendor\s*\/\/[^\n]*\n\s*if \(args\.status == 3 \|\| args\.status == 4\)\{\s*this\.stopMoving\(\);\s*this\.apiSetTimer\('startMoving', 10000\);\s*\}/);
    assert.match(gsjsItem('npc_cooking_vendor'), /this\.setAndBroadcastState\('walk_left_end'\)/);
    for (const cls of ['npc_jabba1', 'npc_jabba2']) {
      const src = gsjsItem(cls);
      assert.match(src, /this\.npc_walk_speed = 50;/, cls);
      assert.match(src, /this\.state='walk_end';[\s\S]*?this\.apiSetTimer\('stopMoving', 2000\);[\s\S]*?this\.state='impatient';\s*this\.apiSetTimer\('startMoving', 4000\);/, cls);
    }
    const sno = gsjsItem('npc_sno_cone_vending_machine');
    assert.match(sno, /this\.npc_walk_speed = 100;/);
    assert.match(sno, /this\.setAndBroadcastState\('walk_end'\);\s*this\.turnAround\(\);/);
    assert.match(sno, /'start_moving', null, getTime\(\)\+5000/);
    // The scarecrow defines startMoving but nothing calls it: it stood still.
    const scarecrow = gsjsItem('npc_gardening_vendor');
    assert.equal((scarecrow.match(/startMoving\(\)/g) || []).length, 2, 'its own definition and the npc parent\'s pathfinding_paused line');
    assert.match(scarecrow, /function onPlayerEnter\(pc\)\{ \/\/ defined by npc_gardening_vendor\s*\/\/[^\n]*\n\s*return;/);
    assert.match(tool, /function onWaitEnd\(\)\{ \/\/ defined by npc_walkable\s*this\.apiSetTimer\('startMoving', 1500\);/);
    assert.equal(VENDOR_RESUME_MS, 1500);
  });

  it('walks five of the six; the scarecrow stands', () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      const plan = vendorPlan(cls, HOME, 7, CLIPS);
      if (cls === 'npc_gardening_vendor') assert.equal(plan, null);
      else assert.ok(walks(plan).length >= VENDOR_PLAN_MOVES, cls);
    }
    assert.equal(VENDOR_WALK.npc_gardening_vendor, null);
  });

  it('the Tool Vendor roams 250 or 400 px one way, standing 10 s, until its floor ends, then turns', () => {
    const plan = vendorPlan('npc_tool_vendor', HOME, 11, CLIPS);
    assert.ok(plan.speed >= 50 && plan.speed <= 55);
    const w = walks(plan).slice(0, VENDOR_PLAN_MOVES);
    assert.ok(w[0].to < w[0].x, 'go_dir starts left');
    for (let i = 1; i < w.length; i += 1) {
      const d = w[i].to - w[i].x;
      const clamped = w[i].to === HOME.l || w[i].to === HOME.r;
      assert.ok(clamped || [250, 400].includes(Math.abs(Math.round(d))), `step ${d}`);
      // No turn on arriving: it only sets off the other way after its floor stopped it.
      if (Math.sign(d) !== Math.sign(w[i - 1].to - w[i - 1].x)) assert.ok([HOME.l, HOME.r].includes(w[i - 1].to), `turned at ${w[i - 1].to}`);
    }
    const stand = plan.segs[plan.segs.indexOf(w[0]) + 1];
    assert.deepEqual([stand.pose, stand.ms], ['idle', 10000]);
    assert.ok(plan.segs.some((g) => g.pose === 'turn'), 'turn_left / turn_right play');
  });

  it('Uncle Friendly and Helga go the other way every walk at 50 px/s: turn, walk, walk_end 2 s, impatient 4 s', () => {
    for (const cls of ['npc_jabba1', 'npc_jabba2']) {
      const plan = vendorPlan(cls, HOME, 3, CLIPS);
      assert.equal(plan.speed, 50);
      const w = walks(plan).slice(0, VENDOR_PLAN_MOVES);
      for (let i = 1; i < w.length; i += 1) assert.notEqual(Math.sign(w[i].to - w[i].x), Math.sign(w[i - 1].to - w[i - 1].x), cls);
      const i = plan.segs.indexOf(w[1]);
      assert.deepEqual(plan.segs.slice(i - 1, i + 3).map((g) => [g.pose, Math.round(g.ms)]).map(([p, ms]) => (p === 'walk' ? p : `${p}:${ms}`)), ['turn:367', 'walk', 'end:2000', 'impatient:4000']);
    }
  });

  it('the Sno Cone machine idles 5 s, rolls 250 or 400 px at 100 px/s, stops and goes back', () => {
    const plan = vendorPlan('npc_sno_cone_vending_machine', HOME, 5, CLIPS);
    assert.equal(plan.speed, 100);
    assert.deepEqual([plan.segs[0].pose, plan.segs[0].ms], ['idle', 5000]);
    const w = walks(plan).slice(0, 4);
    assert.ok(w[0].to > w[0].x, 'go_dir unset: the right');
    for (let i = 1; i < w.length; i += 1) assert.notEqual(Math.sign(w[i].to - w[i].x), Math.sign(w[i - 1].to - w[i - 1].x));
    const after = plan.segs[plan.segs.indexOf(w[0]) + 1];
    assert.deepEqual([after.pose, after.ms], ['end', 467]);
  });

  it('the Meal Vendor stops with walk_left_end or walk_right_end, then idles to its 10 s', () => {
    const plan = vendorPlan('npc_cooking_vendor', HOME, 9, CLIPS);
    const w = walks(plan)[0];
    const i = plan.segs.indexOf(w);
    assert.deepEqual(plan.segs.slice(i + 1, i + 3).map((g) => [g.pose, g.ms]), [['end', 1000], ['idle', 9000]]);
    assert.deepEqual(vendorClip('npc_cooking_vendor', 'end', -1), { state: 'walk_left_end', flip: false });
    assert.deepEqual(vendorClip('npc_cooking_vendor', 'end', 1), { state: 'walk_right_end', flip: false });
  });
});

describe('a vendor\'s round', () => {
  it('stays on its run of floor and comes home, so the next round carries on without a jump', () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      for (const seed of [1, 2, 99, 12345]) {
        const plan = vendorPlan(cls, HOME, seed, CLIPS);
        if (!plan) continue;
        for (const g of plan.segs) {
          assert.ok(g.x >= HOME.l - 0.01 && g.x <= HOME.r + 0.01 && g.to >= HOME.l - 0.01 && g.to <= HOME.r + 0.01, `${cls} ${g.x}->${g.to}`);
        }
        assert.ok(Math.abs(vendorWalkAt(plan, plan.ms - 1, HOME.x0).x - HOME.x0) < 0.5, cls);
        assert.equal(vendorWalkAt(plan, plan.ms - 1).dir, plan.dir0, `${cls} faces the way the round began`);
        // Moves at its own speed, never jumps.
        let prev = vendorWalkAt(plan, 0).x;
        for (let t = 50; t < plan.ms; t += 50) {
          const x = vendorWalkAt(plan, t).x;
          assert.ok(Math.abs(x - prev) <= (plan.speed * 50) / 1000 + 0.01, `${cls} at ${t}: ${prev} -> ${x}`);
          prev = x;
        }
      }
    }
  });

  it('a short floor keeps it there (the original\'s 100 px off the street\'s ends, its floor\'s ends)', () => {
    const platforms = [{ x1: 0, y1: 800, x2: 900, y2: 800, pc_perm: -1, item_perm: -1 }, { x1: 1000, y1: 800, x2: 3000, y2: 800, pc_perm: -1, item_perm: -1 }];
    const span = walkerSpan(platforms, 500, 800, { worldW: 3000, up: 40, down: 70, edge: 100 });
    assert.equal(span.l, 100);
    assert.ok(span.r >= 898 && span.r <= 900);
    const plan = vendorPlan('npc_tool_vendor', { ...span, x0: 500 }, 4, CLIPS);
    for (const g of walks(plan)) assert.ok(g.to >= span.l && g.to <= span.r, String(g.to));
  });

  it('is the same on every page with the same spot and seed', () => {
    const a = vendorPlan('npc_jabba2', HOME, 42, CLIPS);
    const b = vendorPlan('npc_jabba2', { ...HOME }, 42, { turn: { ...CLIPS.turn }, end: CLIPS.end });
    for (const t of [0, 5000, 33333, 120000]) assert.deepEqual(vendorWalkAt(a, t), vendorWalkAt(b, t));
  });
});

describe('stopping for a player', () => {
  it('stands while held, stands 1.5 s more, then walks on from where it stopped', () => {
    const plan = vendorPlan('npc_tool_vendor', HOME, 11, CLIPS);
    const firstWalk = walks(plan)[0];
    const hold = { lag: 0, since: 0, until: 0 };
    const t0 = firstWalk.at + 2000; // mid-walk
    const at = (now) => vendorWalkAt(plan, vendorClock(hold, now, 0)).x;
    const stopX = at(t0);
    holdVendor(hold, t0);
    assert.ok(vendorHeld(hold, t0 + 10));
    assert.equal(at(t0 + 30000), stopX, 'stands while the menu is open');
    releaseVendor(hold, t0 + 30000);
    assert.ok(vendorHeld(hold, t0 + 30000 + VENDOR_RESUME_MS - 1));
    assert.equal(at(t0 + 30000 + VENDOR_RESUME_MS), stopX, 'onWaitEnd: 1.5 s before it walks on');
    assert.ok(!vendorHeld(hold, t0 + 30000 + VENDOR_RESUME_MS));
    const later = at(t0 + 30000 + VENDOR_RESUME_MS + 1000);
    assert.ok(Math.abs(Math.abs(later - stopX) - plan.speed) < 0.5, `walks on from there: ${stopX} -> ${later}`);
    // A second menu while it waits to walk on holds it on the same spot.
    holdVendor(hold, t0 + 30000 + 500);
    releaseVendor(hold, t0 + 31000);
    assert.equal(at(t0 + 31000 + VENDOR_RESUME_MS), stopX);
  });

  it('faces the player where its art can turn', () => {
    assert.equal(faceToward(1000, 800, 1), -1);
    assert.equal(faceToward(1000, 1300, -1), 1);
    assert.equal(faceToward(1000, 1001, -1), -1, 'right on top of it: keeps its way');
    assert.deepEqual(vendorClip('npc_tool_vendor', 'idle', -1), { state: 'idle', flip: true });
    assert.deepEqual(vendorClip('npc_tool_vendor', 'talk', 1), { state: 'talk', flip: false });
    assert.deepEqual(vendorClip('npc_jabba1', 'idle', -1), { state: 'idle', flip: true });
    // Lettering, a cart or a scarecrow facing the screen: never flipped.
    for (const cls of ['npc_sno_cone_vending_machine', 'npc_cooking_vendor', 'npc_gardening_vendor']) {
      assert.equal(vendorClip(cls, 'idle', -VENDOR_POSES[cls].rest).flip, false, cls);
    }
  });
});

describe('the walk strips', () => {
  it('every pose a plan can reach has a strip, the right way round', () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      const plan = vendorPlan(cls, HOME, 8, CLIPS);
      for (const g of plan?.segs || []) {
        const clip = vendorClip(cls, g.pose, g.dir);
        if (g.pose === 'turn' && !clip) continue; // the Meal Vendor and Sno Cone machine have no turn art
        assert.ok(clip && vendorStrip(cls, clip.state), `${cls} ${g.pose} ${g.dir}`);
      }
    }
    assert.deepEqual(vendorClip('npc_tool_vendor', 'walk', -1), { state: 'walk_left', flip: false });
    assert.deepEqual(vendorClip('npc_tool_vendor', 'turn', -1), { state: 'turn_left', flip: false });
    assert.deepEqual(vendorClip('npc_jabba1', 'walk', -1), { state: 'walk', flip: true });
    assert.deepEqual(vendorClip('npc_jabba1', 'turn', 1), { state: 'turn', flip: true });
    assert.deepEqual(vendorClip('npc_sno_cone_vending_machine', 'attract', 1), { state: 'attract', flip: false });
  });

  it('ships every strip at the size VENDOR_NPC_MOTION_ART describes, feet on the idle strip\'s row', () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      const idle = VENDOR_NPC_ART[cls].states.idle.crop;
      for (const state of Object.keys(VENDOR_NPC_MOTION_ART[cls])) {
        const sheet = vendorSheet(cls, state);
        const buf = readFileSync(join(PUBLIC, sheet.path));
        assert.equal(buf.toString('ascii', 12, 16), 'VP8L', sheet.path);
        const bits = buf.readUInt32LE(21);
        // A strip of fewer frames than its 8 columns is one row that wide.
        assert.equal((bits & 0x3fff) + 1, sheet.fw * Math.min(sheet.cols, sheet.frames), `${sheet.path} width`);
        assert.equal(((bits >> 14) & 0x3fff) + 1, sheet.fh * Math.ceil(sheet.frames / sheet.cols), `${sheet.path} height`);
        const crop = vendorStrip(cls, state).crop;
        assert.ok(crop.x + crop.w <= VENDOR_NPC_ART[cls].cell.w && crop.y + crop.h <= VENDOR_NPC_ART[cls].cell.h, `${cls} ${state} inside its cell`);
        const a = vendorAnchor(cls, state);
        // The anchor is the idle strip's feet in the same cell: (feet - crop.y) / crop.h.
        assert.ok(Math.abs(a.y * crop.h + crop.y - (idle.y + idle.h)) < 1e-6, `${cls} ${state}`);
        assert.ok(Math.abs(a.x * crop.w + crop.x - VENDOR_NPC_ART[cls].cell.w / 2) < 1e-6, `${cls} ${state}`);
      }
      assert.deepEqual(vendorStates(cls).slice(0, 2), ['idle', 'talk']);
      assert.equal(vendorAnchor(cls, 'idle').y, 1);
    }
  });

  it('the jabbas\' left walks are their walk drawn the other way (so the walk is flipped, not shipped twice)', () => {
    // npc_jabba1 walk_reverse and npc_jabba2 walk_left: crops mirror walk's about the cell's centre.
    const cell1 = VENDOR_NPC_ART.npc_jabba1.cell.w;
    const walk1 = VENDOR_NPC_MOTION_ART.npc_jabba1.walk.crop;
    assert.equal(cell1 - (walk1.x + walk1.w), 102, 'walk_reverse crop x (measured 102)');
    const cell2 = VENDOR_NPC_ART.npc_jabba2.cell.w;
    const walk2 = VENDOR_NPC_MOTION_ART.npc_jabba2.walk.crop;
    assert.ok(Math.abs(cell2 - (walk2.x + walk2.w) - 118) <= 1, 'walk_left crop x (measured 118)');
  });
});

describe('the walk strips at 3x (lane vendors3x)', () => {
  const results = JSON.parse(readFileSync(join(ROOT, 'tools/vector-sprites/results.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'tools/vector-sprites/characters.json'), 'utf8'));
  /** Strips that stay 1x because no SWF run matches them frame for frame (empty: every one matched). */
  const KEEP_1X = new Set([]);
  const motionPaths = () => Object.entries(VENDOR_NPC_MOTION_ART).flatMap(([cls, states]) => Object.keys(states).map((state) => [cls, state, vendorSheet(cls, state).path]));

  it('each strip has its own job, so a poor match never costs the idle and talk 3x', () => {
    for (const [cls, state, path] of motionPaths()) {
      const job = manifest.jobs.find((j) => j.sheets.some((s) => s.path === path));
      assert.ok(job, `${cls} ${state} is in tools/vector-sprites/characters.json`);
      assert.match(job.character, /-motion$/, path);
      assert.ok(!manifest.jobs.some((j) => j.character === job.character && j.sheets.some((s) => /_(idle|talk)\.webp$/.test(s.path))), path);
    }
  });

  it('swaps every matched strip to a 3x render on first draw: same cells, frame count, run and feet', async () => {
    const { FIRST_DRAW_SPRITES, HIRES_SPRITES, SPLIT_SPRITES } = await import('../public/js/sprite-hires.js?v=add7b764');
    for (const [cls, state, path] of motionPaths()) {
      const r = results[path];
      const strip = vendorStrip(cls, state);
      if (KEEP_1X.has(path)) {
        assert.equal(r?.status, 'rejected', path);
        assert.ok(!HIRES_SPRITES.has(path) && !SPLIT_SPRITES.has(path), `${path} stays 1x`);
        continue;
      }
      assert.equal(r?.status, 'ok', `${path} ${r?.reason || ''}`);
      assert.ok(FIRST_DRAW_SPRITES.has(path), path);
      assert.ok(HIRES_SPRITES.has(path) || SPLIT_SPRITES.has(path), path);
      // Same crop and frame count, unmirrored, one unbroken run of SWF frames (so the 30 fps clip keeps its timing).
      assert.deepEqual([r.fw, r.fh, r.cells, r.mirror], [strip.crop.w, strip.crop.h, strip.frames, false], path);
      assert.equal(r.swfFrames[1] - r.swfFrames[0], strip.frames - 1, path);
      assert.equal(r.label, strip.oga, path);
      assert.ok(r.score >= 0.95 && r.minFrame >= 0.85, `${path} ${r.score} ${r.minFrame}`);
      assert.equal(r.drift.length, 0, path);
      // Feet: the render sits where the idle strip's does, moved by the crop difference
      // (offset3x is the SWF origin in 3x px of the cell), within one 1x pixel.
      const idle = results[vendorSheet(cls, 'idle').path];
      const ic = VENDOR_NPC_ART[cls].states.idle.crop;
      const want = [idle.offset3x[0] - 3 * (strip.crop.x - ic.x), idle.offset3x[1] - 3 * (strip.crop.y - ic.y)];
      assert.ok(Math.abs(r.offset3x[0] - want[0]) <= 2 && Math.abs(r.offset3x[1] - want[1]) <= 2, `${path} offset ${r.offset3x} want ${want}`);
    }
  });

  it('each walk keeps the OGA strip\'s run of its SWF label (the walks skip the label\'s start-up frames)', () => {
    // frame-match.mjs at the idle placement: the OGA walk strips hold the label's last frames
    // (Meal Vendor walk_left 16 of 24, Uncle Friendly walk 14 of 22, Helga walk 16 of 23, Sno Cone 7 of 14).
    const RUNS = {
      npc_cooking_vendor_walk_left: [43, 58], npc_cooking_vendor_walk_right: [5, 20],
      npc_jabba1_walk: [9, 22], npc_jabba2_walk: [62, 77],
      npc_sno_cone_vending_machine_walk_left: [23, 29], npc_sno_cone_vending_machine_walk_right: [9, 15],
      npc_tool_vendor_walk: [1, 24], npc_jabba1_impatient: [356, 441], npc_jabba2_turn: [93, 110],
    };
    for (const [name, run] of Object.entries(RUNS)) {
      const r = results[`assets/sprites/vendors/${name}.webp`];
      assert.deepEqual(r?.swfFrames, run, name);
    }
  });

  it('a sharp desktop swaps vendor strips to 3x on first draw; a phone (render cap 1) keeps the 1x strips', async () => {
    const { resolutionCap } = await import('../public/js/render-density.js?v=74c6f5f9');
    const { installHiresSprites, installHiresFirstDraw, hiresSpriteUrl } = await import('../public/js/sprite-hires.js?v=add7b764');
    const textures = { addUrlRoute() {} };
    const renderer = () => ({ texture: { _initSource() { return {}; } } });
    // game.js artDpr(): min(devicePixelRatio, the device's render cap).
    installHiresSprites(textures, { dpr: Math.min(3, resolutionCap({ device: 'phone' })), viewWidth: 402 });
    const phone = renderer();
    installHiresFirstDraw(phone);
    assert.equal(phone.texture.hiresFirstDraw, undefined, 'a phone never swaps');
    assert.equal(hiresSpriteUrl(vendorSheet('npc_tool_vendor', 'walk').path), null);
    installHiresSprites(textures, { dpr: Math.min(2, resolutionCap({ device: 'computer' })), viewWidth: 1280 });
    const desktop = renderer();
    installHiresFirstDraw(desktop);
    assert.equal(desktop.texture.hiresFirstDraw, true, 'a 2x desktop swaps on first draw');
    assert.equal(hiresSpriteUrl(vendorSheet('npc_tool_vendor', 'walk').path), 'assets/sprites/vendors/npc_tool_vendor_walk@3x.webp');
  });

  it('the idle and talk 3x strips are all still there', () => {
    for (const cls of VENDOR_NPC_CLASSES) {
      for (const state of ['idle', 'talk']) assert.equal(results[vendorSheet(cls, state).path]?.status, 'ok', `${cls} ${state}`);
    }
  });
});
