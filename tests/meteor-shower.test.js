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
  meteorSchedule,
  meteorStreaksAt,
  meteorStrength,
  streakShape,
} from '../public/js/meteor-shower.js?v=833f0d52';
import { meteorRun, meteorShowerFeature, resetMeteorRun, takeMeteorFrame } from '../public/js/features/meteor-shower-feature.js?v=d3775541';
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

  it('a shower: the first at 1.5 s, one every 6 to 12 s, each 2.5 s and inside the shower, mostly across the top of the sky', () => {
    for (let seed = 1; seed < 400; seed += 7) {
      for (const dur of [METEOR.showerMinMs, 210000, METEOR.showerMaxMs]) {
        const list = meteorSchedule(shower({ seed, dur }));
        assert.equal(list[0].at, METEOR.firstMs);
        for (let i = 1; i < list.length; i++) {
          const gap = list[i].at - list[i - 1].at;
          assert.ok(gap >= 6000 && gap <= 12000, `gap ${gap}`);
        }
        const last = list.at(-1);
        assert.ok(last.at + last.dur <= dur, 'the last ends inside the shower');
        assert.ok(dur - (last.at + last.dur) < 12000, 'and the shower is not left empty at its end');
        assert.ok(list.length >= 14 && list.length <= 40, `${list.length} streaks in ${dur}`);
        for (const s of list) {
          assert.equal(s.dur, 2500);
          assert.ok(s.x >= 0.1 && s.x <= 0.9 && s.y >= 0.02 && s.y <= 0.16, 'starts in the top band of the sky');
          assert.ok(s.dy > 0.1 && s.dy < 0.41, 'slants down 6 to 24 degrees');
          assert.ok(s.bright >= 0.62 && s.bright <= 1, 'varied brightness');
        }
      }
    }
  });

  it('a lone star: one streak, a little brighter than a shower\'s brightest', () => {
    const list = meteorSchedule({ ...shower(), kind: 'star', dur: METEOR.starDurMs });
    assert.equal(list.length, 1);
    assert.equal(list[0].at, METEOR.starAtMs);
    assert.ok(list[0].at + list[0].dur * METEOR.reducedSlow <= METEOR.starDurMs, 'its event outlasts even the slow streak');
    assert.ok(list[0].bright > 0.7 && list[0].bright <= 1.15, 'bright');
    assert.ok(Math.max(...meteorSchedule(shower()).map((s) => s.bright)) <= 1, 'a shower\'s are 1 at most');
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
    assert.equal(meteorPhase(ev, T0 + ev.dur + 4001), 'over');
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

  it('draws the trail thinner and fainter toward its end, and the head over it', () => {
    const { Graphics } = fakePixi();
    const g = new Graphics();
    const list = meteorStreaksAt(ev, mid);
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
    drawMeteorStreaks(g, meteorStreaksAt(ev, mid), 1280, 800, { strength: 1 });
    const full = g.fills[0].alpha;
    drawMeteorStreaks(g, meteorStreaksAt(ev, mid), 1280, 800, { strength: 0.2 });
    assert.ok(g.fills[0].alpha < full * 0.25);
    assert.equal(drawMeteorStreaks(g, meteorStreaksAt(ev, mid), 1280, 800, { strength: 0 }), false);
    assert.equal(g.fills.length, 0, 'cleared');
  });

  it('prefers-reduced-motion: slower and dimmer, never gone', () => {
    const at = ev.start + first.at + first.dur * 1.2;
    assert.equal(meteorStreaksAt(ev, at).length, 0, 'gone at normal speed');
    assert.equal(meteorStreaksAt(ev, at, { reduced: true }).length, 1, 'still crossing when slowed');
    const a = streakShape(first, 0.45, 1280, 800);
    const b = streakShape(first, 0.45, 1280, 800, { reduced: true });
    assert.ok(b.alpha < a.alpha && b.alpha > 0, 'dimmer');
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

  it('the star preview runs one lone star after another', () => {
    const s = street(MEADOW);
    const { engine } = page({ look: night(s), layer: null, params: { meteordemo: 'star' } });
    meteorShowerFeature.onTick(16, 0, engine);
    const first = meteorRun().event;
    assert.equal(first.kind, 'star');
    meteorRun().offset = first.start + first.dur + 5000 - Date.now();
    meteorShowerFeature.onTick(16, 0, engine);
    assert.equal(meteorRun().event.kind, 'star');
    assert.notEqual(meteorRun().event.seed, first.seed);
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
    const s0 = meteorSchedule(ev)[0];
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
