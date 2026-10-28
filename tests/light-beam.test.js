/**
 * G352 Light Beam: Shim Shiri's six Light Beams (items/light_beam.js) are
 * clicked, not walked into. Each is a target on its beam art with "Beam Up"
 * (tooltip "Travel to " + its tube), which broadcasts its beam_<colour>
 * event (features/puzzles-feature.js, assets/content/puzzle-triggers.json).
 * Run: node --test tests/light-beam.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { normalizePuzzleData, stepTriggers } from '../public/js/puzzle-triggers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const SHIM = 'GA9BT2I0ILD340S';
const raw = JSON.parse(readFileSync(join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'));
const def = normalizePuzzleData(raw)[SHIM];
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));

describe('Light Beam: source', () => {
  it('keeps light_beam.js: Beam Up, "Travel to " + dest, the event broadcast', () => {
    const file = join(GSJS, 'items/light_beam.js');
    if (!existsSync(file)) return;
    const src = readFileSync(file, 'utf8');
    assert.match(src, /"name"\s*:\s*"Beam Up"/);
    assert.match(src, /return "Travel to "\+this\.getInstanceProp\('dest'\);/);
    assert.match(src, /this\.container\.events_broadcast\(events\[i\],\{target_pc: pc\}\);/);
  });

  it('each beam names the tube its tp_<colour> teleport reaches', () => {
    const s = street(SHIM);
    const index = JSON.parse(readFileSync(join(root, 'public/assets/streets/index.json'), 'utf8')).streets;
    assert.equal(def.triggers.length, 6);
    for (const t of def.triggers) {
      assert.equal(t.verb, 'beam_up');
      const colour = t.id.replace('beam_', '');
      const tp = JSON.stringify(s.events[`tp_${colour}`]);
      const to = /teleportToLocation\('L([A-Z0-9]+)'/.exec(tp)?.[1] || /"street":"G([A-Z0-9]+)"/.exec(tp)?.[1];
      assert.ok(to, `${t.id} teleports`);
      assert.equal(index[`G${to}`].label, t.dest, `${t.id} -> ${t.dest}`);
    }
  });

  it('walking into a beam no longer fires it', () => {
    const walk = def.triggers.filter((t) => !t.verb);
    const inside = new Set();
    for (const t of def.triggers) assert.deepEqual(stepTriggers(walk, inside, new Set(), t.x, t.y - 2), []);
  });
});

describe('Light Beam in Shim Shiri (puzzles-feature)', () => {
  let feature;
  let api;
  before(async () => {
    class Display {
      constructor() {
        this.anchor = { set() {} };
        this.scale = { set() {} };
        this.children = [];
        this.x = 0;
        this.y = 0;
      }
      addChild(c) { this.children.push(c); return c; }
      destroy() { this.destroyed = true; }
    }
    class Texture { constructor(o) { Object.assign(this, o); } }
    class ImageSource { constructor(o) { Object.assign(this, o, { width: 1, height: 1 }); } on() { return this; } }
    class Sprite extends Display { constructor(texture) { super(); this.texture = texture; } }
    globalThis.PIXI = { Sprite, Container: Display, Graphics: Display, Texture, ImageSource, Rectangle: class {} };
    globalThis.Image = class { set src(v) { this._s = v; } decode() { return Promise.resolve(); } };
    globalThis.fetch = async () => ({ json: async () => raw });
    ({ puzzlesFeature: feature } = await import('../public/js/features/puzzles-feature.js'));
    ({ locationEventsApi: api } = await import('../public/js/features/location-events-feature.js?v=location-events-9'));
  });

  it('registers six Light Beam targets with Beam Up, and Beam Up fires the beam event', async () => {
    const registered = [];
    const fired = [];
    api.fire = (engine, name) => { fired.push(name); return true; };
    const engine = {
      PIXI: globalThis.PIXI,
      streetTsid: SHIM,
      player: { x: 0, y: 0, vx: 0 },
      entityLayer: { addChild() {} },
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      register: (t) => { registered.push(t); return t; },
      setData() {},
      param: () => null,
      toast() {},
    };
    feature.onStreetEnter({ tsid: SHIM }, engine);
    await new Promise((r) => setTimeout(r, 20));
    const beams = registered.filter((t) => t.classId === 'light_beam');
    assert.equal(beams.length, 6);
    const blue = beams.find((t) => t.state.trigger === 'beam_blue');
    assert.equal(blue.label, 'Light Beam');
    assert.equal(blue.subtitle, 'Travel to Bilicious Blues');
    const [verb] = feature.verbsFor(blue, engine);
    assert.deepEqual([verb.id, verb.label, verb.tooltip], ['beam_up', 'Beam Up', 'Travel to Bilicious Blues']);
    assert.equal(feature.runVerb(blue, 'beam_up', engine), true);
    assert.deepEqual(fired, ['beam_blue']);
  });
});
