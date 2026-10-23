/**
 * The Hall of Rejected Concepts (G73): js/hall-rejected-concepts.js (layout
 * and room), its street JSON (tools/build-tower-rooms.mjs), the exhibit art
 * (tools/hall-concepts-art/build.py -> js/hall-concepts-art.js) and the Wall
 * Buttons in features/mid-tower-feature.js.
 * Run: node --test tests/hall-rejected-concepts.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js';
import {
  CLICK_ANYWHERE,
  HALL,
  HALL_ART,
  HALL_ART_ROOT,
  HALL_BUTTON_CLASS,
  HALL_EXHIBITS,
  HALL_TSID,
  STAND,
  WALL_BUTTON,
  hallLayout,
} from '../public/js/hall-rejected-concepts.js';
import { MEZZ, MEZZANINE_TSID, midTowerRoomByTsid } from '../public/js/tower-mid-rooms.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(spike, '../glitch-GameServerJS');
const streets = join(spike, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
const hall = midTowerRoomByTsid(HALL_TSID);

/** WebP canvas size from its RIFF header (VP8 / VP8L / VP8X). */
function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe('Hall of Rejected Concepts: the room', () => {
  it('is written and indexed under hub 96 with the source name', () => {
    const json = street(HALL_TSID);
    assert.equal(json.label, 'Hall of Rejected Concepts');
    assert.equal(json.reconstructed, true);
    assertStreetGeometry(json);
    assert.equal(index[HALL_TSID].hubId, '96');
    assert.equal(index[HALL_TSID].hubName, 'Jethimadh Tower: Mid');
    assert.equal(hall.sourceTsid, 'LA9L33D5CNE3I0J');
  });

  it('keeps the maps name (inc_data_maps_prod.js hub 96)', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LA9L33D5CNE3I0J"\s*:\s*"Hall of Rejected Concepts"/);
  });

  it('joins the Mezzanine both ways: the lobby\'s Hall door to the arrival door, and back', () => {
    const mz = street(MEZZANINE_TSID);
    const h = street(HALL_TSID);
    const into = mz.doors.find((d) => d.id === 'door_mz_hall');
    const back = h.doors.find((d) => d.id === 'door_hall_mezzanine');
    assert.equal(into.connect.street, HALL_TSID);
    assert.equal(back.connect.street, MEZZANINE_TSID);
    assert.deepEqual(into.connect.arrive, { x: back.x, y: back.y });
    assert.deepEqual(back.connect.arrive, { x: into.x, y: into.y });
    assert.equal(into.connect.arrive.x, HALL.doorX - HALL.bounds.l);
    assert.equal(back.connect.arrive.x, MEZZ.hallDoorX - midTowerRoomByTsid(MEZZANINE_TSID).bounds.l);
  });

  it('labels the doors with plaques (V: "Mezzanine" over the arrival door, "Hall of Rejected Concepts" in the lobby)', () => {
    const signs = (room) => room.decos.filter((d) => d.signText).map((d) => d.signText);
    assert.ok(signs(hall).includes('Mezzanine'));
    assert.ok(signs(hall).includes('Exhibits'));
    assert.ok(signs(midTowerRoomByTsid(MEZZANINE_TSID)).includes('Hall of Rejected\nConcepts'));
  });

  it('uses only decos on disk and keeps 300 px of world under its floor', () => {
    const decos = join(spike, 'public/assets/decos/groddle');
    for (const d of [...hall.decos, ...hall.doors]) assert.ok(existsSync(join(decos, `${d.sprite}.webp`)), d.sprite);
    assert.ok(hall.bounds.b - HALL.floor >= 300);
  });
});

describe('Hall of Rejected Concepts: the exhibits', () => {
  it('stand in the recorded order, left to right, inside the walls', () => {
    assert.deepEqual(HALL_EXHIBITS.map((e) => e.id), [
      'rube', 'fox', 'craftybot', 'butler', 'deimaginators', 'street_spirits', 'bunny', 'dragons',
      'vendors', 'wish_dolly', 'playerator', 'tools', 'stactus', 'avatars',
    ]);
    const xs = HALL_EXHIBITS.map((e) => e.x);
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
    assert.ok(xs[0] > HALL.arrowX && xs.at(-1) < HALL.bounds.r - 200);
  });

  it('do not overlap their neighbours (pieces and plinths)', () => {
    const spans = hallLayout().map((ex) => {
      const parts = [...ex.pieces.map((p) => [p.x - p.w / 2, p.x + p.w / 2])];
      if (ex.plinth) parts.push([ex.x - ex.plinth.box / 2, ex.x + ex.plinth.box / 2]);
      return [Math.min(...parts.map((p) => p[0])), Math.max(...parts.map((p) => p[1]))];
    });
    for (let i = 1; i < spans.length; i += 1) assert.ok(spans[i][0] > spans[i - 1][1], `${HALL_EXHIBITS[i].id} overlaps ${HALL_EXHIBITS[i - 1].id}`);
  });

  it('use only the CC0 museum_* renders, at their SWF stage size (@3x files)', () => {
    const used = new Set(['museum_stand_1', ...HALL_EXHIBITS.flatMap((e) => e.pieces.map(([art]) => art))]);
    assert.deepEqual([...used].sort(), Object.keys(HALL_ART).sort());
    for (const [name, art] of Object.entries(HALL_ART)) {
      const file = join(spike, 'public', HALL_ART_ROOT, art.file);
      assert.ok(existsSync(file), name);
      assert.match(art.file, /^museum_\w+@3x\.webp$/);
      assert.deepEqual(webpSize(file), [art.w * 3, art.h * 3], name);
      assert.ok(art.w <= art.stage[0] && art.h <= art.stage[1], name);
    }
  });

  it('rest on their plinths, or on the floor at the back line', () => {
    for (const ex of hallLayout()) {
      for (const p of ex.pieces) {
        if (ex.plinth) assert.equal(p.y, HALL.back - STAND.h + STAND.rest, ex.id);
        else assert.ok(p.y <= HALL.back, ex.id);
      }
      assert.ok(ex.button.y < HALL.floor && ex.button.y > HALL.floor - 200, `${ex.id} button within reach`);
    }
  });

  it('raise the recorded captions (V, approved 2026-10-23), one per exhibit, and keep short names', () => {
    for (const ex of HALL_EXHIBITS) {
      assert.ok(ex.label.length < 40, ex.id);
      assert.ok(ex.caption && ex.caption.length > 20, ex.id);
    }
    const byId = Object.fromEntries(HALL_EXHIBITS.map((ex) => [ex.id, ex.caption]));
    assert.equal(byId.bunny, 'A bunny. Why? Because bunny.');
    assert.match(byId.stactus, /^The Stactus was a jenga-like building game/);
    assert.equal(new Set(Object.values(byId)).size, HALL_EXHIBITS.length);
  });
});

describe('Hall of Rejected Concepts: the Wall Buttons', () => {
  it('follow items/wall_button.js', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const js = readFileSync(join(gsjs, 'items/wall_button.js'), 'utf8');
    assert.match(js, /var label = "Wall Button";/);
    assert.match(js, /this\.instanceProps\.reset_timer = "1000";/);
    assert.match(js, /this\.instanceProps\.distance = "1000";/);
    assert.match(js, /this\.instanceProps\.switch_mode = "resetting";/);
    assert.match(js, /"id"\s*:\s*"press"/);
    assert.match(js, /return "Press";/);
    assert.match(js, /apiSetTimer\('setAndBroadcastState', 500/);
    assert.deepEqual([WALL_BUTTON.label, WALL_BUTTON.verb, WALL_BUTTON.tooltip, WALL_BUTTON.resetMs, WALL_BUTTON.distance, WALL_BUTTON.lockMs], ['Wall Button', 'press', 'Press', 1000, 1000, 500]);
    for (const f of [WALL_BUTTON.artOut, WALL_BUTTON.artIn]) assert.ok(existsSync(join(spike, 'public', f)), f);
  });

  it('raise the client\'s in-window announcement label', { skip: !existsSync(join(spike, '../glitch-client')) && 'glitch-client not beside this worktree' }, () => {
    const as = readFileSync(join(spike, '../glitch-client/com/tinyspeck/engine/view/gameoverlay/InWindowAnnouncementOverlay.as'), 'utf8');
    assert.ok(as.includes(`'${CLICK_ANYWHERE}'`));
  });

  describe('in the feature', () => {
    const saved = {};
    let feature;
    before(async () => {
      for (const k of ['PIXI', 'Image', 'document']) saved[k] = globalThis[k];
      class Obj {
        constructor() {
          this.anchor = { set() {} };
          this.children = [];
          this.visible = true;
          this.destroyed = false;
        }
        addChild(c) { this.children.push(c); return c; }
        removeChild() {}
        destroy() { this.destroyed = true; }
      }
      class Source { constructor() { this.width = 1; this.height = 1; } on() {} emit() {} resize() { return true; } update() {} }
      globalThis.PIXI = { Sprite: Obj, Container: Obj, ImageSource: Source, Texture: class { constructor(o) { Object.assign(this, o); } } };
      globalThis.Image = class { set src(_u) {} decode() { return new Promise(() => {}); } };
      globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
      ({ midTowerFeature: feature } = await import('../public/js/features/mid-tower-feature.js'));
    });
    after(() => {
      for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
    });

    function engineAt(x) {
      const layer = new globalThis.PIXI.Container();
      const calls = { data: {}, activity: [], registered: [] };
      const s = street(HALL_TSID);
      return {
        calls,
        street: s,
        PIXI: globalThis.PIXI,
        entityLayer: layer,
        player: { x: x - s.bounds.l, y: HALL.floor - s.bounds.t },
        questState: { active: {}, completed: [] },
        setData: (k, v) => { calls.data[k] = v; },
        param: () => null,
        pushActivity: (t) => calls.activity.push(t),
        register: (t) => { calls.registered.push(t); return t; },
        unregister() {},
      };
    }

    it('registers one Wall Button per exhibit, verb Press', () => {
      const engine = engineAt(1000);
      feature.onStreetEnter(engine.street, engine);
      const buttons = engine.calls.registered.filter((t) => t.classId === HALL_BUTTON_CLASS);
      assert.equal(buttons.length, HALL_EXHIBITS.length);
      assert.equal(engine.calls.data.hallExhibits, HALL_EXHIBITS.length);
      assert.deepEqual(feature.verbsFor(buttons[0]).map((v) => [v.id, v.label, v.tooltip]), [['press', 'Press', 'Press']]);
      feature.onStreetClear(engine);
    });

    it('a press goes in, raises its caption, and pops out after reset_timer', async () => {
      const engine = engineAt(4560);
      feature.onStreetEnter(engine.street, engine);
      const doc = globalThis.document;
      delete globalThis.document; // no DOM: the announcement goes to the activity log only
      try {
        const stactus = engine.calls.registered.find((t) => t.hallExhibit === 'stactus');
        assert.equal(feature.runVerb(stactus, 'press', engine), true);
        assert.equal(engine.calls.data.hallButton, 'stactus');
        assert.deepEqual(engine.calls.activity, [HALL_EXHIBITS.find((ex) => ex.id === 'stactus').caption]);
        assert.equal(feature._state().hall.find((b) => b.id === 'stactus').pressed, true);
        await new Promise((r) => setTimeout(r, WALL_BUTTON.resetMs + 50));
        assert.equal(feature._state().hall.find((b) => b.id === 'stactus').pressed, false);
        // Out of range (distance 1000): nothing happens, as wall_switch's handler.
        const rube = engine.calls.registered.find((t) => t.hallExhibit === 'rube');
        feature.runVerb(rube, 'press', engine);
        assert.equal(engine.calls.data.midTowerLast, 'hall_far:rube');
        assert.deepEqual(engine.calls.activity, [HALL_EXHIBITS.find((ex) => ex.id === 'stactus').caption]);
      } finally {
        globalThis.document = doc;
        feature.onStreetClear(engine);
      }
    });
  });
});
