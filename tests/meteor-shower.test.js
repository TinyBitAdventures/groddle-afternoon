/**
 * Meteor showers and lone shooting stars (ours, Austin 2026-11-27; js/meteor-shower.js,
 * features/meteor-shower-feature.js, the realtime server's meteor.go, the site's AdminSky). Glitch had
 * neither. An administrator starts one from the console; the server sends one event with a seed to every
 * game online, and every page draws the same streaks from it at the same moment, in the night sky we
 * built for #749 (only where the sky follows the clock, as strongly as its stars are out; NIGHT TINT off
 * hides it). A Snap taken while a streak shows keeps a "Shooting star" tag.
 *
 * Run: node --test tests/meteor-shower.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  METEOR,
  METEOR_TEXT,
  demoMeteorEvent,
  drawMeteorStreaks,
  meteorEventOf,
  meteorOnScreen,
  meteorPhase,
  meteorRadiant,
  meteorSchedule,
  meteorStreaksAt,
  meteorStrength,
  streakShape,
} from '../public/js/meteor-shower.js?v=2eb3c0ed';
import { meteorRun, meteorShowerFeature, resetMeteorRun, takeMeteorFrame } from '../public/js/features/meteor-shower-feature.js?v=100d8c5e';
import { buildStreetView } from '../public/js/street-render.js?v=e7e9dfda';
import { ownSkyReason, skyFollowsClock, skyLook } from '../public/js/sky-clock.js?v=dbd21266';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const MEADOW = 'GCR10K0NLRK1GKE'; // Balliure Heath, Groddle Meadow (the preview link's street)
const T0 = Date.UTC(2026, 10, 27, 20, 0, 0);
const shower = (over = {}) => ({ id: 'mt-00000000000000a1', kind: 'shower', seed: 424242, start: T0, dur: 200000, hint: false, ...over });
const night = (s) => skyLook(s.gradient.top, s.gradient.bottom, 23.5);

describe('the schedule comes from the seed', () => {
  it('the same event gives the same streaks on two pages; another seed gives others', () => {
    const a = meteorSchedule(shower());
    const b = meteorSchedule(JSON.parse(JSON.stringify(shower())));
    assert.deepEqual(a, b);
    assert.notDeepEqual(meteorSchedule(shower({ seed: 424243 })), a);
    assert.ok(a.length > 5);
  });

  it('a shower: busy, every 2.5 to 5 s with bursts of two or three, 1.5 to 2 s each, 50 to 90 in all, inside the shower', () => {
    let bursts = 0;
    let mains = 0;
    let total = 0;
    let events = 0;
    for (let seed = 1; seed < 400; seed += 7) {
      for (const dur of [METEOR.showerMinMs, 210000, METEOR.showerMaxMs]) {
        const list = meteorSchedule(shower({ seed, dur }));
        assert.equal(list[0].at, METEOR.firstMs);
        let lastMain = list[0].at;
        for (let i = 1; i < list.length; i++) {
          const gap = list[i].at - list[i - 1].at;
          if (gap <= 700) {
            assert.ok(gap >= 250, `burst gap ${gap}`);
            bursts += 1;
          } else {
            const fromMain = list[i].at - lastMain;
            assert.ok(fromMain >= 2500 && fromMain <= 5000, `gap ${fromMain}`);
            lastMain = list[i].at;
            mains += 1;
          }
        }
        const last = list.at(-1);
        assert.ok(last.at + last.dur <= dur, 'the last ends inside the shower');
        assert.ok(dur - (last.at + last.dur) < 7000, 'and the shower is not left empty at its end');
        assert.ok(list.length >= 40 && list.length <= 105, `${list.length} streaks in ${dur}`);
        total += list.length;
        events += 1;
        for (const s of list) assert.ok(s.dur >= 1500 && s.dur <= 2000, `dur ${s.dur}`);
      }
    }
    assert.ok(total / events >= 55 && total / events <= 80, `${total / events} streaks on average`);
    const share = bursts / mains;
    assert.ok(share > 0.2 && share < 0.4, `burst streaks per main streak ${share}`);
  });

  it('a shower radiates from one radiant point near the top of the sky, picked from the seed', () => {
    const radiants = new Set();
    for (let seed = 1; seed < 400; seed += 13) {
      const ev = shower({ seed });
      const r = meteorRadiant(ev);
      assert.ok(r.x >= 0.2 && r.x <= 0.8 && r.y >= 0.02 && r.y <= 0.1, JSON.stringify(r));
      radiants.add(`${r.x},${r.y}`);
      for (const st of meteorSchedule(ev)) {
        assert.deepEqual([st.x, st.y], [r.x, r.y], 'every streak from the radiant');
        assert.ok(st.dy > 0.2 && st.from >= 0.04 && st.from <= 0.22, 'heading out and down from it');
        // Its trail, run back, points at the radiant.
        const sh = streakShape(st, 0.5, 1280, 800);
        const cross = (sh.hx - r.x * 1280) * (sh.ty - r.y * 800) - (sh.hy - r.y * 800) * (sh.tx - r.x * 1280);
        assert.ok(Math.abs(cross) < 2, `in line with the radiant (${cross})`);
      }
    }
    assert.ok(radiants.size > 20, 'each seed its own');
    assert.equal(meteorRadiant({ ...shower(), kind: 'star' }), null);
  });

  it('a shower is mostly faint with a few bright, short trails', () => {
    const b = meteorSchedule(shower()).map((st) => st.bright).sort((x, y) => x - y);
    const median = b[Math.floor(b.length / 2)];
    assert.ok(median < 0.5, `median ${median}`);
    assert.ok(b.filter((x) => x > 0.8).length >= 3, 'a few bright');
    assert.ok(b[0] >= 0.35 && b.at(-1) <= 1);
    for (const st of meteorSchedule(shower())) assert.ok(st.tail <= 0.08 && st.travel <= 0.2 && st.size === 1 && st.train === 0);
  });

  it('a lone star: one big moment, slower, a long trail, bigger and brighter than any shower streak, with a train', () => {
    const star = { ...shower(), kind: 'star', dur: METEOR.starDurMs };
    const list = meteorSchedule(star);
    assert.equal(list.length, 1);
    const [st] = list;
    assert.equal(st.at, METEOR.starAtMs);
    assert.equal(st.dur, 4000, '4 s across');
    assert.equal(st.train, 2500, 'its train lingers 2.5 s');
    let most = { tail: 0, travel: 0, r: 0, alpha: 0 };
    for (let seed = 1; seed < 200; seed += 9) {
      for (const sw of meteorSchedule(shower({ seed }))) {
        const sh = streakShape(sw, 0.5, 1280, 800);
        most = { tail: Math.max(most.tail, sw.tail), travel: Math.max(most.travel, sw.travel), r: Math.max(most.r, sh.r), alpha: Math.max(most.alpha, sh.alpha) };
      }
    }
    const sh = streakShape(st, 0.5, 1280, 800);
    assert.ok(st.tail > most.tail * 3, 'a trail three times any shower streak\'s');
    assert.ok(st.travel > most.travel * 2.5, 'crosses a good part of the sky');
    assert.ok(sh.r > most.r * 1.5, 'a bigger head');
    assert.ok(sh.alpha > most.alpha, 'brighter');
    assert.ok(sh.sparkle > 0 && sh.train > 0, 'it sparkles and leaves a train');
    // The sparkle flickers; under reduced motion it holds still.
    const flick = new Set([0.3, 0.31, 0.32, 0.33, 0.34].map((p) => streakShape(st, p, 1280, 800).sparkle.toFixed(3)));
    assert.ok(flick.size > 2, 'flickers');
    const still = new Set([0.3, 0.31, 0.32].map((p) => streakShape(st, p, 1280, 800, { reduced: true }).sparkle));
    assert.equal(still.size, 1, 'steady under reduced motion');
  });

  it('the lone star\'s train lingers after the head has gone, and only the head counts for a Snap', () => {
    const star = { ...shower(), kind: 'star', dur: METEOR.starDurMs };
    const [st] = meteorSchedule(star);
    const headEnd = star.start + st.at + st.dur;
    const after = meteorStreaksAt(star, headEnd + 1500);
    assert.equal(after.length, 1, 'still listed while the train glows');
    const sh = streakShape(st, after[0].p, 1280, 800);
    assert.equal(sh.alpha, 0, 'no head');
    assert.ok(sh.train > 0.03, 'a faint train');
    assert.equal(meteorOnScreen(star, headEnd + 1500, { strength: 1 }), false, 'a train alone is no shooting star');
    assert.equal(meteorOnScreen(star, star.start + st.at + st.dur * 0.4, { strength: 1 }), true, 'the head on screen is');
    assert.equal(meteorStreaksAt(star, headEnd + 2600).length, 0, 'gone after 2.5 s');
    assert.equal(meteorPhase(star, headEnd + 2600), 'on', 'the event outlasts the train');
    // Reduced motion: slower, the train too, still inside the event's time.
    const slowEnd = star.start + st.at + (st.dur + st.train) * METEOR.reducedSlow;
    assert.equal(meteorStreaksAt(star, slowEnd - 100, { reduced: true }).length, 1);
    assert.ok(slowEnd < star.start + star.dur + METEOR.tailMs);
    const { Graphics } = fakePixi();
    const g = new Graphics();
    assert.equal(drawMeteorStreaks(g, after, 1280, 800), true, 'the train is drawn');
    assert.equal(g.circles, 0, 'with no head');
  });

  it('two pages on the server\'s clock with different own clocks draw the same streaks at the same moment', () => {
    const frame = { t: 'meteor', ...shower(), now: T0 + 30000 };
    const pages = [-4000, 2500].map((skew) => {
      resetMeteorRun();
      takeMeteorFrame(frame, null, T0 + 30000 + skew);
      return { offset: meteorRun().offset, schedule: meteorRun().schedule };
    });
    for (const at of [T0 + 31000, T0 + 64000, T0 + 120000]) {
      const seen = pages.map((p) => meteorStreaksAt(shower(), (at + [-4000, 2500][pages.indexOf(p)]) + p.offset, { schedule: p.schedule }));
      assert.deepEqual(seen[0], seen[1]);
    }
  });
});

describe('the server\'s frame', () => {
  it('a good one becomes an event; anything off is refused', () => {
    const good = { t: 'meteor', id: 'mt-0123456789abcdef', kind: 'shower', seed: 77, start: T0, dur: 200000, hint: true, now: T0 };
    assert.deepEqual(meteorEventOf(good), { id: good.id, kind: 'shower', seed: 77, start: T0, dur: 200000, hint: true });
    assert.equal(meteorEventOf({ ...good, kind: 'star', dur: METEOR.starDurMs }).kind, 'star');
    for (const bad of [
      null, 'meteor', { ...good, id: 'mt-xyz' }, { ...good, id: '<b>' }, { ...good, kind: 'comet' }, { ...good, seed: 0 },
      { ...good, seed: 2 ** 31 }, { ...good, seed: 1.5 }, { ...good, start: 'soon' }, { ...good, dur: 1000 }, { ...good, dur: 600000 },
      { ...good, kind: 'star', dur: 200000 },
    ]) assert.equal(meteorEventOf(bad), null, JSON.stringify(bad));
  });

  it('phases: soon before its start, on through its last fade, then over', () => {
    const ev = shower();
    assert.equal(meteorPhase(null, T0), 'none');
    assert.equal(meteorPhase(ev, T0 - 1), 'soon');
    assert.equal(meteorPhase(ev, T0), 'on');
    assert.equal(meteorPhase(ev, T0 + ev.dur + 1000), 'on');
    assert.equal(meteorPhase(ev, T0 + ev.dur + METEOR.tailMs), 'over');
  });
});

describe('a late joiner gets the rest of a running shower', () => {
  afterEach(() => resetMeteorRun());
  it('joining 90 s in: the same streaks from there on, none of those already gone', () => {
    const ev = shower();
    const all = meteorSchedule(ev);
    resetMeteorRun();
    assert.equal(takeMeteorFrame({ t: 'meteor', ...ev, now: T0 + 90000 }, null, 5000), 'started');
    const run = meteorRun();
    assert.equal(run.offset, T0 + 90000 - 5000);
    assert.deepEqual(run.schedule, all);
    const later = [];
    for (let t = T0 + 90000; t < T0 + ev.dur; t += 250) {
      for (const { streak } of meteorStreaksAt(ev, t, { schedule: run.schedule })) if (!later.includes(streak)) later.push(streak);
    }
    assert.deepEqual(later, all.filter((s) => s.at + s.dur > 90000));
    assert.equal(takeMeteorFrame({ t: 'meteor', ...ev, now: T0 + 91000 }, null, 6000), 'same', 'the same event again changes nothing');
  });

  it('stop ends it; a stop for another event does not', () => {
    takeMeteorFrame({ t: 'meteor', ...shower(), now: T0 }, null, T0);
    assert.equal(takeMeteorFrame({ t: 'meteor', kind: 'stop', id: 'mt-ffffffffffffffff' }, null), 'stopped');
    assert.ok(meteorRun().event);
    takeMeteorFrame({ t: 'meteor', kind: 'stop', id: shower().id }, null);
    assert.equal(meteorRun().event, null);
  });

  it('a hinted shower puts the hint in the activity feed once, before it starts', () => {
    const said = [];
    const engine = { pushActivity: (t) => said.push(t) };
    const ev = shower({ hint: true, start: T0 + 120000 });
    takeMeteorFrame({ t: 'meteor', ...ev, now: T0 }, engine, T0);
    meteorRun().event = null;
    takeMeteorFrame({ t: 'meteor', ...ev, now: T0 + 1000 }, engine, T0 + 1000);
    assert.deepEqual(said, [METEOR_TEXT.hint]);
    assert.doesNotMatch(METEOR_TEXT.hint, /—|–/);
  });
});

/* ------------------------------------------------------------------ */
/* The sky it shows in                                                 */
/* ------------------------------------------------------------------ */

function fakePixi() {
  class Container {
    constructor() {
      Object.assign(this, { children: [], parent: null, destroyed: false, listeners: {}, x: 0, y: 0, width: 0, height: 0, visible: true, alpha: 1, tint: 0xffffff });
      this.scale = { x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } };
    }
    addChild(...kids) {
      for (const kid of kids) {
        kid.parent?.removeChild(kid);
        kid.parent = this;
        this.children.push(kid);
      }
      return kids[0];
    }
    addChildAt(kid, i) {
      kid.parent?.removeChild(kid);
      kid.parent = this;
      this.children.splice(i, 0, kid);
      return kid;
    }
    removeChild(kid) {
      const i = this.children.indexOf(kid);
      if (i >= 0) this.children.splice(i, 1);
      kid.parent = null;
      return kid;
    }
    once(name, fn) { (this.listeners[name] ||= []).push(fn); }
    destroy() { this.destroyed = true; }
  }
  class Graphics extends Container {
    constructor() { super(); this.circles = 0; this.strokes = []; this.fills = []; }
    circle() { this.circles += 1; return this; }
    stroke(o) { this.strokes.push(o); return this; }
    fill(o) { this.fills.push(o); return this; }
    clear() { this.circles = 0; this.strokes = []; this.fills = []; return this; }
  }
  for (const verb of ['rect', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'poly']) {
    Graphics.prototype[verb] = function chain() { return this; };
  }
  class Sprite extends Container {
    constructor(texture) { super(); this.texture = texture; }
  }
  const Texture = { WHITE: { white: true }, from: (canvas) => ({ canvas, source: { updates: 0, update() { this.updates += 1; } } }) };
  class ColorMatrixFilter {}
  class Filter { constructor(o) { Object.assign(this, o); } }
  class UniformGroup { constructor(u) { this.uniforms = {}; for (const k in u) this.uniforms[k] = u[k].value; } update() {} }
  const GlProgram = { from: (o) => o };
  const GpuProgram = { from: (o) => o };
  return { Container, Graphics, Sprite, Texture, ColorMatrixFilter, Filter, UniformGroup, GlProgram, GpuProgram };
}

function withDocument(fn) {
  const had = 'document' in globalThis;
  const was = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const canvas = {};
      canvas.getContext = () => ({ createLinearGradient: () => ({ addColorStop() {} }), fillRect() {} });
      return canvas;
    },
  };
  try {
    return fn();
  } finally {
    if (had) globalThis.document = was;
    else delete globalThis.document;
  }
}

function buildView(tsid) {
  const s = street(tsid);
  const PIXI = fakePixi();
  const root = withDocument(() => buildStreetView({ ...s, signposts: [] }, PIXI, { available: new Set() }));
  root.updateParallax(0, 0, 1000, 600, 732);
  return { s, root, PIXI };
}

describe('only in a clock-following sky at night (#749), NIGHT TINT off hides it', () => {
  it('as strong as the stars: whole at night, faint at dusk and dawn, none by day, none with the sky off', () => {
    const s = street(MEADOW);
    assert.ok(skyFollowsClock(s), ownSkyReason(s));
    assert.equal(meteorStrength(night(s)), 1);
    const dusk = meteorStrength(skyLook(s.gradient.top, s.gradient.bottom, 19.5));
    const dawn = meteorStrength(skyLook(s.gradient.top, s.gradient.bottom, 6.5));
    assert.ok(dusk > 0.1 && dusk < 0.3, `dusk ${dusk}`);
    assert.ok(dawn > 0.05 && dawn < 0.2, `dawn ${dawn}`);
    assert.equal(meteorStrength(skyLook(s.gradient.top, s.gradient.bottom, 12.5)), 0, 'day');
    assert.equal(meteorStrength(night(s), { on: false }), 0, 'NIGHT TINT off');
    assert.equal(meteorStrength(null), 0, 'a street keeping its own sky has no look');
  });

  it('the game gives the feature the look only where the clock\'s sky is drawn, never from the house\'s room', () => {
    const src = read('public/game.js');
    const apply = src.slice(src.indexOf('function applySkyClock('), src.indexOf('function homeSkyFields('));
    assert.match(apply, /nightTintOn\(\) && skyFollowsClock\(/, 'NIGHT TINT and indoor streets turn the look off');
    assert.match(apply, /look: place === 'room' \? null : look/);
    assert.match(src, /meteorSky: \(\) => \(\{ look: skyClock\.view === bgLayer && skyClock\.on \? skyClock\.look : null, layer: bgLayer\?\.meteorLayer\?\.\(\) \|\| null \}\)/);
  });

  it('the street view\'s meteor Graphics is pinned to the view, just in front of the furthest layer, behind the nearer ones', () => {
    const { s, root } = buildView(MEADOW);
    root.setSkyLook(night(s));
    const g = root.meteorLayer();
    assert.equal(root.meteorLayer(), g, 'made once');
    assert.equal(g.parent, root);
    const zs = root.parallaxLayers.filter((lc) => lc.zIndex < 0).map((lc) => lc.zIndex).sort((a, b) => a - b);
    assert.deepEqual(zs, [-30, -20, -10], 'Balliure Heath: sky, bg_2, bg_1');
    assert.ok(g.zIndex > zs[0] + 5 && g.zIndex < zs[1], `${g.zIndex}: over the sky layer and its edge strips, under bg_2`);
    assert.ok(g.zIndex > root.skyView.zIndex, 'over the gradient and the stars');
    root.updateParallax(340, 120, 1280, 800, 800);
    assert.deepEqual([g.x, g.viewW, g.viewH], [340, 1280, 800]);
    // The far layers' night tint leaves it white.
    assert.equal(root.setSkyLook(skyLook(s.gradient.top, s.gradient.bottom, 19.5)), true);
    assert.notEqual(root.parallaxLayers.find((lc) => lc.zIndex === -30).tint, 0xffffff, 'the sky layer is tinted');
    assert.equal(g.tint, 0xffffff);
  });

  it('the home street and back yard have one too', () => {
    const src = read('public/js/features/homes-feature.js');
    assert.equal((src.match(/root\.meteorLayer = land\.meteorLayer;/g) || []).length, 2);
    assert.match(src, /if \(skyMeteors\) Object\.assign\(skyMeteors, \{ x: camX, y: camY, viewW: vpW, viewH: skyH \}\);/);
  });
});

describe('drawing: a tapered trail and a glowing head', () => {
  const ev = shower();
  const first = meteorSchedule(ev)[0];
  const mid = ev.start + first.at + first.dur * 0.45;
  // The first streak alone (a burst may bring another close behind it).
  const firstAt = (t, o) => meteorStreaksAt(ev, t, o).filter((x) => x.streak.at === first.at);

  it('draws the trail thinner and fainter toward its end, and the head over it', () => {
    const { Graphics } = fakePixi();
    const g = new Graphics();
    const list = firstAt(mid);
    assert.equal(list.length, 1);
    assert.equal(drawMeteorStreaks(g, list, 1280, 800, { strength: 1 }), true);
    assert.equal(g.fills.length, 12 + 6, 'twelve trail quads, five glow rings and the core');
    const trail = g.fills.slice(0, 12);
    for (let i = 1; i < trail.length; i++) assert.ok(trail[i].alpha < trail[i - 1].alpha, 'fainter toward its end');
    assert.equal(trail[0].color, 0xffffff, 'white at the head');
    assert.notEqual(trail.at(-1).color, 0xffffff, 'bluer at the end');
    assert.equal(g.circles, 6);
    assert.equal(g.blendMode, 'add', 'light added to the sky');
  });

  it('dusk draws it fainter; day or NIGHT TINT off draws nothing', () => {
    const { Graphics } = fakePixi();
    const g = new Graphics();
    drawMeteorStreaks(g, firstAt(mid), 1280, 800, { strength: 1 });
    const full = g.fills[0].alpha;
    drawMeteorStreaks(g, firstAt(mid), 1280, 800, { strength: 0.2 });
    assert.ok(g.fills[0].alpha < full * 0.25);
    assert.equal(drawMeteorStreaks(g, firstAt(mid), 1280, 800, { strength: 0 }), false);
    assert.equal(g.fills.length, 0, 'cleared');
  });

  it('prefers-reduced-motion: slower and dimmer, never gone', () => {
    const at = ev.start + first.at + first.dur * 1.2;
    assert.equal(firstAt(at).length, 0, 'gone at normal speed');
    assert.equal(firstAt(at, { reduced: true }).length, 1, 'still crossing when slowed');
    const a = streakShape(first, 0.45, 1280, 800);
    const b = streakShape(first, 0.45, 1280, 800, { reduced: true });
    assert.ok(b.alpha < a.alpha && b.alpha > 0, 'dimmer');
  });
});

describe('on a phone: streaks big enough to see, below the top bar; a snap needs more than a speck', () => {
  // iPhone 15 Pro, WebKit (the review 2026-11-27): the view is 996 x 930 world px on a 393 css px canvas
  // upright, 1156 x 540 on a 734 css px canvas sideways, whose top 48 css px sit under the top bar.
  const PORTRAIT = { w: 996, h: 930, scale: 393 / 996, top: 0 };
  const LANDSCAPE = { w: 1156, h: 540, scale: 734 / 1156, top: 54 / (734 / 1156) };
  const showers = () => [1, 77, 4242, 98765].flatMap((seed) => meteorSchedule(shower({ seed })));

  it('every shower streak\'s trail reaches at least 60 css px, its head at least 1.2 css px across', () => {
    for (const view of [PORTRAIT, LANDSCAPE, { w: 1280, h: 800, scale: 1, top: 0 }]) {
      for (const st of showers()) {
        const sh = streakShape(st, 0.6, view.w, view.h, view);
        const css = Math.hypot(sh.hx - sh.tx, sh.hy - sh.ty) * view.scale;
        assert.ok(css >= 60, `trail ${css.toFixed(1)} css px at ${view.w}x${view.h}`);
        assert.ok(sh.r * view.scale >= 1.2, `head ${(sh.r * view.scale).toFixed(2)} css px`);
      }
    }
  });

  it('the radiant and every streak\'s path keep below the top bar', () => {
    for (const st of showers()) {
      for (const p of [0, 0.3, 0.6, 1]) {
        const sh = streakShape(st, p, LANDSCAPE.w, LANDSCAPE.h, LANDSCAPE);
        assert.ok(sh.hy >= LANDSCAPE.top && sh.ty >= LANDSCAPE.top, `head ${sh.hy.toFixed(0)}, trail end ${sh.ty.toFixed(0)}, bar ${LANDSCAPE.top.toFixed(0)}`);
      }
    }
    const star = meteorSchedule({ ...shower(), kind: 'star', dur: METEOR.starDurMs })[0];
    assert.ok(streakShape(star, 0, LANDSCAPE.w, LANDSCAPE.h, LANDSCAPE).hy >= LANDSCAPE.top, 'the star starts below it too');
  });

  it('a snap counts a streak only once its trail shows 24 css px and its head is bright, never a speck', () => {
    const ev = shower();
    let speck = 0;
    for (const st of meteorSchedule(ev)) {
      for (let p = 0.01; p < 0.5; p += 0.01) {
        const sh = streakShape(st, p, 1280, 800);
        const css = Math.hypot(sh.hx - sh.tx, sh.hy - sh.ty);
        assert.ok(Math.abs(sh.trailCss - css) < 0.1, 'trailCss is the trail on screen');
        const t = ev.start + st.at + st.dur * p;
        if (css < 23.9 && sh.alpha >= METEOR.snapAlpha && meteorStreaksAt(ev, t).length === 1) {
          speck += 1;
          assert.equal(meteorOnScreen(ev, t, { strength: 1, w: 1280, h: 800 }), false, `a ${css.toFixed(1)} px speck at p ${p.toFixed(2)}`);
        }
      }
    }
    assert.ok(speck > 5, 'specks were tried');
  });
});

describe('the feature on a page', () => {
  afterEach(() => resetMeteorRun());

  function page({ look, layer, mode = 'solo', params = {} } = {}) {
    const data = {};
    const engine = {
      started: true, mode, param: (k) => params[k] ?? null, setData: (k, v) => { data[k] = v; }, pushActivity() {},
      meteorSky: () => ({ look, layer }), query: () => null,
    };
    return { engine, data };
  }

  it('the solo preview runs a shower and draws its streaks at night', () => {
    const s = street(MEADOW);
    const { Graphics } = fakePixi();
    const layer = Object.assign(new Graphics(), { viewW: 1280, viewH: 800 });
    const { engine, data } = page({ look: night(s), layer, params: { meteordemo: 'shower' } });
    meteorShowerFeature.onTick(16, 0, engine);
    const ev = meteorRun().event;
    assert.equal(ev.kind, 'shower');
    assert.equal(data.meteorClock, 'demo');
    const first = meteorRun().schedule[0];
    meteorRun().offset = ev.start + first.at + first.dur * 0.4 - Date.now();
    meteorShowerFeature.onTick(16, 0, engine);
    assert.equal(data.meteor, 'on');
    assert.equal(data.meteorStreaks, '1');
    assert.ok(layer.fills.length > 0);
    assert.equal(meteorShowerFeature.meteorOnScreen(engine), true, 'a Snap now counts it');
  });

  it('NIGHT TINT off, a street keeping its own sky, or indoors: nothing drawn and a Snap does not count it', () => {
    const { Graphics } = fakePixi();
    const layer = Object.assign(new Graphics(), { viewW: 1280, viewH: 800 });
    const { engine, data } = page({ look: null, layer, params: { meteordemo: 'shower' } });
    meteorShowerFeature.onTick(16, 0, engine);
    const ev = meteorRun().event;
    const first = meteorRun().schedule[0];
    meteorRun().offset = ev.start + first.at + first.dur * 0.4 - Date.now();
    meteorShowerFeature.onTick(16, 0, engine);
    assert.equal(data.meteorStreaks, '0');
    assert.equal(layer.fills.length, 0);
    assert.equal(meteorShowerFeature.meteorOnScreen(engine), false);
  });

  it('the star preview: one lone star, then 20 s of empty sky after its train, then the next', () => {
    const s = street(MEADOW);
    const { engine } = page({ look: night(s), layer: null, params: { meteordemo: 'star' } });
    meteorShowerFeature.onTick(16, 0, engine);
    const first = meteorRun().event;
    assert.equal(first.kind, 'star');
    const trainEnd = first.start + METEOR.starAtMs + METEOR.starMs + METEOR.trainMs;
    meteorRun().offset = first.start + first.dur + METEOR.tailMs + 10 - Date.now();
    meteorShowerFeature.onTick(16, 0, engine);
    const next = meteorRun().event;
    assert.equal(next.kind, 'star');
    assert.notEqual(next.seed, first.seed);
    const quiet = next.start + METEOR.starAtMs - trainEnd;
    assert.ok(quiet >= 20000 && quiet <= 21500, `empty sky ${quiet} ms`);
  });

  it('on a page just loaded the hint waits 5 s, after the page\'s own first notices', () => {
    const said = [];
    const { engine } = page({ mode: 'multiplayer' });
    engine.pushActivity = (t) => said.push(t);
    meteorShowerFeature.onTick(16, 0, engine);
    const now = Date.now();
    takeMeteorFrame({ t: 'meteor', ...shower({ hint: true, start: now + 120000 }), now }, engine, now);
    assert.deepEqual(said, [], 'not at once');
    meteorRun().startedAt = Date.now() - 5001;
    meteorShowerFeature.onTick(16, 0, engine);
    assert.deepEqual(said, [METEOR_TEXT.hint]);
    meteorShowerFeature.onTick(16, 0, engine);
    assert.equal(said.length, 1, 'once');
  });

  it('online it asks for the running event as it connects', () => {
    const sent = [];
    const handlers = {};
    const client = { on: (k, f) => { handlers[k] = f; }, send: (t) => sent.push(t) };
    const { engine } = page({ mode: 'multiplayer' });
    engine.query = (hook) => (hook === 'realtimeClient' ? client : null);
    meteorShowerFeature.onTick(16, 0, engine);
    assert.deepEqual(sent, ['meteor_sync']);
    handlers.state({ state: 'online' });
    assert.deepEqual(sent, ['meteor_sync', 'meteor_sync']);
    handlers['msg:meteor']({ t: 'meteor', ...shower(), now: Date.now() });
    assert.equal(meteorRun().event.id, shower().id);
    assert.equal(meteorRun().clock, 'server');
  });

  it('meteorOnScreen needs the head in view, bright enough', () => {
    const ev = shower();
    const list = meteorSchedule(ev);
    // A streak with the sky to itself, its head in view at 40%.
    const s0 = list.find((st, i) => i > 0 && list[i - 1].at + list[i - 1].dur < st.at && list[i + 1]?.at > st.at + st.dur + 200
      && streakShape(st, 0.4, 1280, 800).hy > 0 && streakShape(st, 0.4, 1280, 800).hx > 0 && streakShape(st, 0.4, 1280, 800).hx < 1280);
    assert.ok(s0);
    const t = ev.start + s0.at + s0.dur * 0.4;
    assert.equal(meteorOnScreen(ev, t, { strength: 1 }), true);
    assert.equal(meteorOnScreen(ev, t, { strength: 0.04 }), false);
    assert.equal(meteorOnScreen(ev, ev.start + s0.at + 10, { strength: 1 }), false, 'just starting: too faint');
    assert.equal(meteorOnScreen(ev, ev.start + s0.at + s0.dur + 100, { strength: 1 }), false, 'between streaks');
  });

  it('the demo events are good events', () => {
    for (const kind of ['shower', 'star']) {
      const ev = demoMeteorEvent(kind, T0);
      assert.ok(meteorEventOf({ ...ev }), kind);
    }
  });
});

describe('the Snap keeps it', () => {
  it('Enter in Camera Mode asks whether a streak shows and sends meteor: true with the Snap', () => {
    const src = read('public/js/features/snaps-feature.js');
    assert.match(src, /spot\.meteor = engine\.query\?\.\('meteorOnScreen', engine\) === true;/);
    assert.match(src, /\.\.\.\(spot\.meteor \? \{ meteor: true \} : \{\}\)/);
    assert.match(src, /engine\.setData\?\.\('snapMeteor', s\.meteor \? '1' : '0'\);/);
  });

  it('is registered as a feature and an invention', () => {
    assert.match(read('public/js/features/index.js'), /FEATURES\.push\(meteorShowerFeature\)/);
    const inv = JSON.parse(read('tools/inventions/inventions.json')).entries.find((e) => e.id === 'meteor-shower');
    assert.ok(inv && inv.kind && inv.status === 'proposed', 'inventions.json meteor-shower');
  });
});
