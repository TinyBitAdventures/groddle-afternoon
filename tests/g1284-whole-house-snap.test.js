/**
 * G1284 (report #669, Austin 2026-11-25: "can we expand the snapshot feature to take a photo of the
 * entire house like in Glitch?"): Camera Mode's "Snap the whole house" (Tower, home street).
 *
 * Glitch's camera snapped the viewport only (glitch-client CameraMan.as snap 492-515,
 * SNAPSHOT_TYPE_USER; LocationRenderer.as getSnapshot 594-615 keeps the view for a user snap); the
 * whole home was saveHomeImg's automatic picture (TSFrontController.as 1515-1546, the location at
 * its own width off the camera, posted 3 s later by APICall.as homeImage 354-370), taken after
 * decorating (HandOfDecorator.as 952), a chassis change (ChassisManager.as 552) and cultivation
 * (CultManager.as 201). The camera option is a remake addition (inventions: camera-whole-house).
 *
 * - js/home-shot.js: where it is offered (own home only; a visit and anywhere else say why not), the
 *   stacked bands of 1, 2 and 3 floors and a Tower (every floor, the full width; the picture is the
 *   place at the chosen scale), and the size cap (the site's 1920x1200).
 * - js/home-shot-render.js on a fake renderer: one read per floor at its own frame, the live floor
 *   drawn with the camera over that frame (engine.viewAt) and put back, the floors stacked top first
 *   with no gap; the whole street at the street's full width.
 * - features/snaps-feature.js on a fake page: the button's label, the refusals, and the save: the
 *   ordinary Snap request (no public flag: private until Make public, Austin's snaps ruling).
 * - features/profiles-feature.js: a change marks the home street picture stale (saveHomeImg).
 *
 * Run: node --test tests/g1284-whole-house-snap.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SITE_DIR } from '../tools/repos.mjs';
import { fileURLToPath } from 'node:url';

import { HOME_SHOT_COPY, homeShotBands, homeShotRows, homeShotScale, homeShotSize, homeShotState } from '../public/js/home-shot.js?v=8198618a';
import { renderHomeShot } from '../public/js/home-shot-render.js?v=43fe6e26';
import { roomPieces } from '../public/js/home-wallpaper.js?v=5d3594e4';
import { createHomeDecorState, INTERIOR } from '../public/js/home-decor.js?v=3a84d959';
import { HOME_STALE_DELAY_MS, RETRY_MS, staleRefreshDue } from '../public/js/profiles.js?v=1daccbb9';
import { snapSteps, SNAP_MAX_H, SNAP_MAX_W, WHOLE_SNAP } from '../public/js/snaps.js?v=b5be8bff';
import { snapsFeature } from '../public/js/features/snaps-feature.js?fresh=g1284';
import { profilesFeature } from '../public/js/features/profiles-feature.js?fresh=g1284';
import { HAS_PHP, PHP } from './php.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, '..', f), 'utf8');

/** A house of `n` floors (ground floor open to the back yard) or a Tower of `n`, as homes-feature homeShotSource lists them. */
function floorsOf(kind, n, { segments = 7, live = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const state = kind === 'tower'
      ? createHomeDecorState({ layout: 'tower', wallSegments: 6, wall: 'grey_unfinished', floor: 'starter_crappy', ceiling: 'starter_crappy_ceiling' })
      : createHomeDecorState({ layout: 'house', wallSegments: segments });
    const room = roomPieces(state, { floorY: INTERIOR.floorY, leftOpen: kind === 'house' && i === 0 });
    out.push({ index: i, top: room.top, bottom: room.bottom, frameTop: room.frameTop, bound: room.bound, pitch: room.pitch, width: room.width, x0: kind === 'house' && i === 0 ? 600 : 0, live: i === live });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Where it is offered                                                  */
/* ------------------------------------------------------------------ */

describe('the option is offered at your own home only (Austin\'s call: own home)', () => {
  it('your house, your Tower and your home street each get their own words', () => {
    assert.deepEqual(homeShotState({ ctx: { inHome: true, owned: true, room: 'interior' } }), { kind: 'house', label: 'Snap the whole house' });
    assert.deepEqual(homeShotState({ ctx: { inHome: true, owned: true, room: 'interior' }, tower: true }), { kind: 'tower', label: 'Snap the whole Tower' });
    assert.deepEqual(homeShotState({ ctx: { inHome: true, owned: true, room: 'street' } }), { kind: 'street', label: 'Snap the whole street' });
  });

  it('a visit says why not; away from home it is not offered', () => {
    assert.deepEqual(homeShotState({ ctx: { inHome: false }, visiting: true }), { refused: HOME_SHOT_COPY.refusedVisit });
    assert.deepEqual(homeShotState({ ctx: { inHome: true, owned: false, room: 'interior' } }), { refused: HOME_SHOT_COPY.refusedVisit });
    assert.equal(homeShotState({ ctx: { inHome: false, room: 'street' } }), null);
    assert.equal(homeShotState({}), null);
    for (const line of Object.values(HOME_SHOT_COPY)) assert.doesNotMatch(line, /\u2014/, 'no em dashes in player text');
  });
});

/* ------------------------------------------------------------------ */
/* Every floor, the full width                                          */
/* ------------------------------------------------------------------ */

describe('the bands cover every floor stacked, top floor first, with no gap', () => {
  for (const [kind, n] of [['house', 1], ['house', 2], ['house', 3], ['tower', 2], ['tower', 4], ['tower', 9]]) {
    it(`${kind}, ${n} floor${n > 1 ? 's' : ''}`, () => {
      const floors = floorsOf(kind, n);
      const plan = homeShotBands(floors);
      assert.equal(plan.bands.length, n, 'one band a floor');
      assert.deepEqual(plan.bands.map((b) => b.index), [...Array(n).keys()].reverse(), 'the top floor first, the ground floor last');
      // Each band starts where the one above it ended, and the last ends at the picture's foot.
      let y = 0;
      for (const b of plan.bands) {
        assert.equal(b.dy, y);
        y += b.y1 - b.y0;
      }
      assert.equal(y, plan.h);
      const f = floors[0];
      // G1289 (#669, Austin 2026-11-25): the top floor from its top frame (no attic), the ground floor
      // down to its floor frame (no earth), as the 2012 picture of a whole house shows.
      assert.equal(plan.bands[0].y0, f.frameTop);
      assert.equal(plan.bands.at(-1).y1, f.bound);
      if (kind === 'house') {
        assert.ok(f.frameTop > f.top, 'the attic is left out');
        assert.ok(f.bottom > f.bound, 'the earth is left out');
      }
      // The place's height: the top frame, a storey a floor.
      assert.equal(plan.h, (f.bound - f.pitch - f.frameTop) + n * f.pitch);
      // Each storey shows its whole wall: from the frame over it to the frame under it.
      for (const b of plan.bands.slice(1, -1)) assert.equal(b.y1 - b.y0, f.pitch);
    });
  }

  it('a house storey is the 458 px wall and its 17 px frame; a Tower\'s frame is 28', () => {
    assert.equal(floorsOf('house', 1)[0].pitch, 475);
    assert.equal(floorsOf('tower', 1)[0].pitch, 486);
    assert.equal(floorsOf('house', 1, { segments: 9 })[0].width, 9 * 150);
  });
});

describe('the picture is the place at the chosen scale, within the site\'s Snap size', () => {
  it('full resolution where it fits; fitted to 1920x1200 where it does not', () => {
    assert.equal(homeShotScale({ w: 900, h: 600, resolution: 2 }), 2);
    assert.equal(homeShotScale({ w: 1050, h: 600, resolution: 2 }), 1920 / 1050);
    assert.equal(homeShotScale({ w: 1050, h: 1708, resolution: 1 }), 1200 / 1708);
    assert.equal(homeShotScale({ w: 1050, h: 1708, width: 720 }), 720 / 1050, 'a set width (saveHomeImg posted 720 wide)');
    assert.equal(homeShotScale({ w: 0, h: 10 }), 0);
  });

  for (const [kind, n] of [['house', 1], ['house', 2], ['house', 3], ['tower', 9]]) {
    it(`${kind} of ${n}: every size within the site's limits, its shape kept`, () => {
      const floors = floorsOf(kind, n);
      const plan = homeShotBands(floors);
      for (const resolution of [1, 2, 3]) {
        const scale = homeShotScale({ w: floors[0].width, h: plan.h, resolution });
        const size = homeShotSize(floors[0].width, plan.h, scale);
        assert.equal(size.w, Math.round(floors[0].width * scale));
        assert.equal(size.h, Math.round(plan.h * scale));
        assert.ok(size.w <= SNAP_MAX_W && size.h <= SNAP_MAX_H, JSON.stringify(size));
        assert.ok(Math.abs(size.w / size.h - floors[0].width / plan.h) < 0.01);
        // The Snap's own encoder keeps it whole (its first step is its own size) and never over the site's.
        const first = snapSteps(size.w, size.h)[0];
        assert.deepEqual([first.w, first.h], [size.w, size.h]);
        // The rows fill the picture exactly.
        const rows = homeShotRows(plan.bands, scale);
        assert.equal(rows[0].y, 0);
        for (let i = 1; i < rows.length; i += 1) assert.equal(rows[i].y, rows[i - 1].y + rows[i - 1].h);
        assert.equal(rows.at(-1).y + rows.at(-1).h, size.h);
      }
    });
  }
});

describe('a whole-home Snap may be taller (Austin 2026-11-25: a 9-floor Tower kept readable)', () => {
  it('a 9-floor Tower keeps at least 960 px of width, within 1920x3600 and 2 MB', () => {
    assert.deepEqual(WHOLE_SNAP, { maxW: 1920, maxH: 3600, maxBytes: 2_000_000 });
    const floors = floorsOf('tower', 9);
    const plan = homeShotBands(floors);
    assert.equal(plan.h, 4402, 'the roof frame, nine 486 px storeys');
    for (const resolution of [1, 2, 3]) {
      const scale = homeShotScale({ w: floors[0].width, h: plan.h, resolution, maxW: WHOLE_SNAP.maxW, maxH: WHOLE_SNAP.maxH });
      const size = homeShotSize(floors[0].width, plan.h, scale);
      assert.deepEqual(size, { w: 963, h: 3600 }, `at ${resolution}x (it was 321 x 1200 under a Snap's 1200 high)`);
      const first = snapSteps(size.w, size.h, WHOLE_SNAP)[0];
      assert.deepEqual([first.w, first.h], [963, 3600], 'kept whole by the encoder under the whole-home limits');
      for (const step of snapSteps(size.w, size.h, WHOLE_SNAP)) assert.ok(step.w <= 1920 && step.h <= 3600, JSON.stringify(step));
    }
    // A 3-floor house is drawn at the screen's own pixels on a 1x screen, as big as it is.
    const house = homeShotBands(floorsOf('house', 3));
    assert.equal(homeShotScale({ w: 1050, h: house.h, resolution: 1, maxW: WHOLE_SNAP.maxW, maxH: WHOLE_SNAP.maxH }), 1);
    // An ordinary Snap keeps its own limits.
    assert.deepEqual(snapSteps(963, 3600)[0], { w: 321, h: 1200, quality: 0.85 });
  });

  const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  const hasPhp = HAS_PHP;
  const gdArgs = hasPhp && spawnSync(PHP, ['-r', 'exit(function_exists("imagecreatetruecolor") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=gd'] : [];
  const haveSite = existsSync(join(SITE_DIR, 'src/SnapImage.php'));
  it('the site takes the taller picture only from an upload that says whole (php)', { skip: !(hasPhp && haveSite && existsSync(join(engineDir, 'src/Minn/Autoloader.php'))) && 'php, the site or Minn Engine not found' }, () => {
    const out = JSON.parse(execFileSync(PHP, [...gdArgs, join(here, 'fixtures/snaps/whole-snap.php'), engineDir, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out, {
      limits: [1920, 1200, 1_000_000, WHOLE_SNAP.maxH, WHOLE_SNAP.maxBytes],
      towerWhole: 'ok:963x3600:fits:small',
      towerPlain: 'groddle_snap_size:400',
      tooTallWhole: 'groddle_snap_size:400',
      tooWideWhole: 'groddle_snap_size:400',
      viewPlain: 'ok:1920x1200:fits:small',
      bytesOverWhole: 'groddle_snap_too_large:413',
      bytesOverPlain: 'groddle_snap_too_large:413',
    });
  });

  it('Snaps::save asks for the whole-home limits only on a literal true', { skip: !haveSite && 'no site repo' }, () => {
    const src = readFileSync(join(SITE_DIR, 'src/Snaps.php'), 'utf8');
    assert.match(src, /SnapImage::accept\(\$body\['image'\] \?\? null, \(\$body\['whole'\] \?\? false\) === true\)/);
  });
});

/* ------------------------------------------------------------------ */
/* The render, on a fake renderer                                       */
/* ------------------------------------------------------------------ */

function fakeCanvas(w = 0, h = 0, log = null) {
  return {
    width: w,
    height: h,
    getContext: () => ({
      fillRect() {},
      drawImage: (img, x, y, dw, dh) => log?.push({ img, x, y, dw, dh }),
      set fillStyle(v) {},
      set imageSmoothingEnabled(v) {},
      set imageSmoothingQuality(v) {},
    }),
    toDataURL: () => `data:image/jpeg;base64,${'A'.repeat(4000)}`,
  };
}

function fakeRenderEngine({ worldW = 2670 } = {}) {
  const world = { children: [], x: -100, y: -50 };
  const views = [];
  const engine = {
    worldW,
    entityLayer: { parent: world },
    viewAt(frame, fn) {
      const was = { x: world.x, y: world.y };
      world.x = -frame.x;
      world.y = -frame.y;
      views.push({ ...frame });
      try { return fn(); } finally { world.x = was.x; world.y = was.y; }
    },
  };
  return { engine, world, views };
}

function fakeIo(world) {
  const reads = [];
  const draws = [];
  return {
    reads,
    draws,
    io: {
      read(container, opts) {
        reads.push({ live: container === world, worldAt: container === world ? { x: world.x, y: world.y } : null, ...opts });
        return fakeCanvas(Math.round(opts.width * opts.resolution), Math.round(opts.height * opts.resolution));
      },
      canvas: (w, h) => fakeCanvas(w, h, draws),
    },
  };
}

describe('the render draws every floor, the live one with the camera over it', () => {
  for (const [kind, n, live] of [['house', 1, 0], ['house', 2, 1], ['house', 3, 0], ['house', 3, 2], ['tower', 4, 1]]) {
    it(`${kind} of ${n}, standing on floor ${live}`, async () => {
      const { engine, world, views } = fakeRenderEngine();
      const { io, reads, draws } = fakeIo(world);
      const built = [];
      const floors = floorsOf(kind, n, { live }).map((f) => (f.live ? f : { ...f, live: false, build: () => { const c = { children: [], destroyed: false, destroy() { this.destroyed = true; } }; built.push(c); return c; } }));
      const shot = await renderHomeShot(engine, { kind, width: floors[0].width, floors }, { resolution: 1, io, timeoutMs: 0 });
      const plan = homeShotBands(floors);
      assert.equal(shot.floors, n);
      assert.deepEqual([shot.placeW, shot.placeH], [floors[0].width, plan.h]);
      assert.deepEqual([shot.w, shot.h], [Math.round(floors[0].width * shot.scale), Math.round(plan.h * shot.scale)], 'the image is the house at the chosen scale');
      assert.equal(reads.length, n, 'one read a floor');
      for (const [i, r] of reads.entries()) {
        const band = plan.bands[i];
        const floor = floors.find((f) => f.index === band.index);
        assert.equal(r.width, floors[0].width, 'the full width');
        assert.equal(r.height, band.y1 - band.y0);
        assert.equal(r.x, floor.x0);
        assert.equal(r.y, band.y0);
        assert.equal(r.resolution, shot.scale);
        assert.equal(r.live, floor.live, 'the floor you stand on is the scene itself');
        if (r.live) assert.deepEqual(r.worldAt, { x: -floor.x0, y: -band.y0 }, 'drawn with the camera over the whole floor, not the view');
      }
      assert.deepEqual({ x: world.x, y: world.y }, { x: -100, y: -50 }, 'the camera is put back');
      assert.ok(views.some((v) => v.w === floors[0].width), 'engine.viewAt over the floor\'s whole width (R37: the full scene)');
      assert.equal(built.length, n - 1, 'each other floor drawn from what the home keeps');
      assert.ok(built.every((c) => c.destroyed), 'and let go after');
      // Stacked top first, each under the last, filling the picture.
      assert.equal(draws.length, n);
      assert.equal(draws[0].y, 0);
      for (let i = 1; i < n; i += 1) assert.equal(draws[i].y, draws[i - 1].y + draws[i - 1].dh);
      assert.equal(draws.at(-1).y + draws.at(-1).dh, shot.h);
      assert.ok(draws.every((d) => d.x === 0 && d.dw === shot.w));
    });
  }

  it('the whole street: HOMESHOT\'s frame over the street\'s full width', async () => {
    const { engine, world, views } = fakeRenderEngine({ worldW: 2670 });
    const { io, reads } = fakeIo(world);
    const shot = await renderHomeShot(engine, { kind: 'street', frame: { x: 0, y: 150, w: 2670, h: 720 } }, { resolution: 2, io, timeoutMs: 0 });
    assert.equal(shot.kind, 'street');
    assert.equal(reads.length, 1);
    assert.deepEqual([reads[0].x, reads[0].width, reads[0].height], [0, 2670, 720]);
    assert.equal(reads[0].resolution, 1920 / 2670, 'fitted to the site\'s 1920 wide');
    assert.ok(views.every((v) => v.w === 2670));
    assert.equal(shot.w, 1920);
  });

  it('nothing to draw is no picture', async () => {
    const { engine, world } = fakeRenderEngine();
    const { io } = fakeIo(world);
    assert.equal(await renderHomeShot(engine, null, { io }), null);
    assert.equal(await renderHomeShot(engine, { kind: 'house', width: 1050, floors: [] }, { io }), null);
  });
});

/* ------------------------------------------------------------------ */
/* The Snap: button, refusals, save private                             */
/* ------------------------------------------------------------------ */

class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.parent = null;
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) };
    if (tag === 'canvas') Object.assign(this, fakeCanvas());
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  append(...kids) { for (const k of kids) if (k && typeof k === 'object') { k.parent = this; this.children.push(k); } }
  insertBefore(k) { this.append(k); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { if (!this.disabled) for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); }
  focus() {}
  querySelector(sel) { return this.all().find((n) => matches(n, sel)) || null; }
  querySelectorAll() { return []; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

function matches(n, sel) {
  if (sel.startsWith('[')) {
    const [k, v] = sel.slice(1, -1).split('=');
    return Object.hasOwn(n.attrs, k) && (v === undefined || n.attrs[k] === v.replace(/"/g, ''));
  }
  if (sel.startsWith('.')) return String(n.attrs.class || '').split(' ').includes(sel.slice(1));
  return n.tag === sel;
}

function fakePage(routes) {
  const body = new FakeEl('body');
  const head = new FakeEl('head');
  const gameRoot = new FakeEl('div');
  gameRoot.id = 'game-root';
  body.append(gameRoot);
  const calls = [];
  globalThis.document = {
    baseURI: 'https://groddle.localhost/',
    body,
    head,
    createElement: (tag) => new FakeEl(tag),
    createTextNode: (t) => Object.assign(new FakeEl('#text'), { textContent: t }),
    getElementById: (id) => [body, head, ...body.all(), ...head.all()].find((n) => n.id === id) || null,
  };
  globalThis.requestAnimationFrame = (fn) => fn();
  globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const b = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path: new URL(url).pathname.replace(/^\/wp-json\/groddle\/v1\//, ''), method, body: b });
    const answer = routes(calls.at(-1).path, method, b) || { status: 404, body: { code: 'nope', message: 'nope' } };
    return { status: answer.status || 200, ok: (answer.status || 200) < 300, headers: { get: () => null }, json: async () => answer.body, text: async () => '' };
  };
  return {
    body,
    calls,
    done() {
      for (const k of ['document', 'requestAnimationFrame', 'GRODDLE_MP_BOOT', 'fetch', 'groddleSnaps']) delete globalThis[k];
    },
  };
}

function snapEngine({ ctx = { inHome: true, owned: true, room: 'interior' }, visiting = null, source = undefined, card = true } = {}) {
  const log = { toasts: [], data: {} };
  const { engine: render, world } = fakeRenderEngine();
  const { io } = fakeIo(world);
  const floors = floorsOf('house', 3, { live: 0 }).map((f) => (f.live ? f : { ...f, build: () => ({ children: [], destroy() {} }) }));
  const src = source === undefined ? { kind: 'house', width: floors[0].width, floors } : source;
  const engine = {
    ...render,
    homeShotIo: io,
    mode: 'multiplayer',
    started: true,
    inv: {},
    pc: { imaginationUpgrades: card ? ['snapshotting'] : [], level: 7 },
    player: { x: 700, y: 620 },
    streetTsid: 'RH_HOME_INT',
    renderer: { resolution: 2 },
    homeContext: () => ctx,
    toast: (m) => log.toasts.push(m),
    playSound: () => {},
    setData: (k, v) => { log.data[k] = v; },
    query(hook, ...args) {
      if (hook === 'neighboursVisiting') return visiting;
      if (hook === 'homeShotSource') return src;
      return null;
    },
  };
  return { engine, log };
}

const flush = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r)); };

describe('Snap the whole house in Camera Mode (fake page)', () => {
  it('your house: the button says so; without the card or in solo there is none', () => {
    const page = fakePage(() => ({ body: { snaps: [], max: 60 } }));
    try {
      const { engine } = snapEngine();
      snapsFeature.init(engine);
      assert.equal(snapsFeature.cameraWholeLabel(engine), 'Snap the whole house');
      assert.equal(snapsFeature.cameraWholeLabel(snapEngine({ ctx: { inHome: true, owned: true, room: 'interior' }, source: { kind: 'tower', width: 1178, floors: [] } }).engine), 'Snap the whole Tower');
      assert.equal(snapsFeature.cameraWholeLabel(snapEngine({ ctx: { inHome: true, owned: true, room: 'street' } }).engine), 'Snap the whole street');
      assert.equal(snapsFeature.cameraWholeLabel(snapEngine({ card: false }).engine), null);
      assert.equal(snapsFeature.cameraWholeLabel(snapEngine({ ctx: { inHome: false, room: 'street' } }).engine), null, 'away from home: no button');
      assert.equal(snapsFeature.cameraWholeLabel({ ...engine, mode: 'solo' }), null);
    } finally {
      page.done();
    }
  });

  it('refused outside your home, and on a visit, with a clear line and nothing drawn', async () => {
    const page = fakePage(() => ({ body: { snaps: [], max: 60 } }));
    try {
      const away = snapEngine({ ctx: { inHome: false, room: 'street' }, source: null });
      snapsFeature.init(away.engine);
      assert.equal(await snapsFeature.cameraWholeSnap(away.engine, {}), true);
      assert.deepEqual(away.log.toasts, ['You can only snap the whole house in your own home.']);
      assert.equal(away.log.data.snapsLast, 'whole-refused');
      const visit = snapEngine({ ctx: { inHome: false, room: 'interior' }, visiting: { owner: 9, key: false } });
      assert.equal(await snapsFeature.cameraWholeSnap(visit.engine, {}), true);
      assert.deepEqual(visit.log.toasts, ['You can only snap the whole house in your own home, not on a visit.']);
      assert.equal(snapsFeature.cameraWholeLabel(visit.engine), 'Snap the whole house', 'a visit shows the button, which says why not');
      assert.equal(page.calls.filter((c) => c.method === 'POST').length, 0, 'nothing saved');
    } finally {
      page.done();
    }
  });

  it('a 3-floor house: the whole picture, then the ordinary save, private until made public', async () => {
    const saved = [];
    const page = fakePage((path, method, body) => {
      if (path === 'snaps' && method === 'POST') {
        saved.push(body);
        return { status: 201, body: { snap: { id: 5 }, snaps: [{ id: 5, url: '/players/7/snaps/5/picture', download: '/players/7/snaps/5/download', public: false }], max: 60 } };
      }
      return { body: { snaps: [], max: 60 } };
    });
    try {
      const { engine, log } = snapEngine();
      snapsFeature.init(engine);
      await snapsFeature.cameraWholeSnap(engine, {});
      // The flash peaks 100 ms in, then the polaroid (CameraMan.as snap).
      await new Promise((r) => setTimeout(r, 160));
      const plan = homeShotBands(floorsOf('house', 3));
      const scale = homeShotScale({ w: 1050, h: plan.h, resolution: 2, maxW: WHOLE_SNAP.maxW, maxH: WHOLE_SNAP.maxH });
      assert.equal(log.data.snapSize, `${Math.round(1050 * scale)}x${Math.round(plan.h * scale)}`, 'the whole house at the chosen scale (within a whole-home Snap\'s 1920x3600)');
      assert.equal(log.data.snapSize, '1920x2637', 'no attic or earth (G1289)');
      assert.equal(log.data.snapsLast, 'whole:house:3');
      assert.equal(log.data.snapDialog, 'open', 'the polaroid, as any Snap');
      page.body.querySelector('[data-snap-save]').click();
      await new Promise((r) => setTimeout(r, 50));
      await flush();
      assert.equal(saved.length, 1, JSON.stringify([log.data, page.calls]));
      assert.equal(Object.hasOwn(saved[0], 'public'), false, 'the save asks nothing about public: the site keeps it private');
      assert.equal(saved[0].whole, true, 'a whole-home Snap says so, for the site\'s larger limits');
      assert.equal(saved[0].street, '', 'a home is a private place: no street to travel to');
      assert.match(saved[0].image, /^A+$/);
      assert.equal(log.data.snapDialog, 'saved');
      assert.ok(page.body.querySelector('[data-snap-saved=public]'), 'Snap Saved! offers Make public');
      assert.ok(page.body.querySelector('[data-snap-saved=view]'), 'and the full-size viewer');
      assert.ok(page.body.querySelector('[data-snap-saved=download]'), 'and the download');
      page.body.querySelector('[data-snap-done]').click();
      await new Promise((r) => setTimeout(r, 1200));
    } finally {
      page.done();
    }
  });
});

describe('Camera Mode wiring and the home picture refresh', () => {
  it('the overlay has the button, and Shift+Enter asks for the whole picture', () => {
    const src = read('public/js/features/camera-mode-feature.js');
    assert.match(src, /data-camera-whole/);
    assert.match(src, /cameraWholeLabel/);
    assert.match(src, /if \(kept === 'whole' && snapWholeNow\(engine\)\) return;/);
    assert.match(src, /return e\.shiftKey \? 'whole' : 'snap';/, 'cameraKey: Shift+Enter is the whole picture (G1286)');
    const css = read('public/style.css');
    assert.match(css, /\.camera-mode-whole \{/);
    assert.match(css, /:root\.touch-phone \.camera-mode-whole/, 'a phone gets a tap-sized button');
  });

  it('homes-feature says what the home holds; a change marks the profile picture stale (saveHomeImg)', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /homeShotSource\(engine, kind = null\) \{\n    return homeShotSource\(engine, kind\);/);
    assert.match(homes, /if \(endsEditing\) homePictureStale\(engine, endsEditing\);/, 'leaving Decoration or Cultivation Mode');
    assert.match(homes, /homePictureStale\(engine, 'house'\);/, 'a house change');
    assert.match(read('public/js/features/home-tower-feature.js'), /query\?\.\('homePictureStale', 'tower', engine\)/, 'a Tower change');
  });

  it('a stale picture is due 3 s after the change, within the profile\'s own throttle', () => {
    assert.equal(HOME_STALE_DELAY_MS, 3000, 'saveHomeImg: setTimeout(api_call.homeImage, 3000)');
    assert.equal(staleRefreshDue({ staleAt: 0, now: 10_000 }), false);
    assert.equal(staleRefreshDue({ staleAt: 9_000, now: 10_000 }), false);
    assert.equal(staleRefreshDue({ staleAt: 6_000, now: 10_000 }), true);
    assert.equal(staleRefreshDue({ staleAt: 6_000, now: 9_999 + RETRY_MS, lastTry: 10_000 }), false);
    assert.equal(staleRefreshDue({ staleAt: 6_000, now: 10_001 + RETRY_MS, lastTry: 10_000 }), true);
  });

  it('profiles-feature hears homePictureStale in multiplayer only', () => {
    assert.equal(profilesFeature.homePictureStale('decorate', { mode: 'solo' }), null);
    const src = read('public/js/features/profiles-feature.js');
    assert.match(src, /uploadHome\(engine, state, \{ force: homeStale \}\)/);
    assert.match(src, /uploadLayout\(engine, state, \{ force: layoutStale \}\)/);
  });
});
