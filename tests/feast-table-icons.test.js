/**
 * The Harvest Table's dishes stay drawn as they are laid (G982). The table redrew its dishes on
 * every lay, and each dish sprite left a once('update') listener on the shared cached icon
 * texture: when an icon arrived after its sprite was rebuilt, the dead sprite's listener threw and
 * stopped the texture's other listeners, so newly laid dishes stayed invisible until a reload
 * (20, 100 and 400 dishes laid showed 0 or 1 dish). Here the vendored Pixi runs in a vm with
 * js/pixi-fixes.js and js/textures.js, icons arrive only when the test says so, and the real
 * feature lays dish after dish.
 * Run: node --test tests/feast-table-icons.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPixi() {
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(readFileSync(join(ROOT, 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8'), g);
  return g.PIXI;
}

// Icons decode only when arrive() says so (an icon is 40 x 40, as the pack icons are).
const waiting = [];
class FakeImage {
  constructor() {
    this.naturalWidth = 40;
    this.naturalHeight = 40;
    this.width = 40;
    this.height = 40;
    waiting.push(this);
  }
}
const settle = () => new Promise((r) => setTimeout(r, 0));
async function arrive() {
  while (waiting.length) waiting.shift().onload?.();
  await settle();
  await settle();
}

const PIXI = loadPixi();
globalThis.PIXI = PIXI;
globalThis.Image = FakeImage;

const { installPixiFixes } = await import('../public/js/pixi-fixes.js?v=0f42b75e');
installPixiFixes(PIXI);
const { isLoaded } = await import('../public/js/textures.js?v=b8e38103');
const { addItem } = await import('../public/js/inventory.js?v=3be7988a');
const { TABLE_RULES, TABLE_STREET, HARVEST_DISHES, STUFFING } = await import('../public/js/pot-luck-feast.js?v=971888be');
const { potLuckFeastFeature } = await import('../public/js/features/pot-luck-feast-feature.js?v=ae0e878f');

// The first four dishes go on first; the last two arrive later, with icons not yet loaded.
const DISHES = HARVEST_DISHES.slice(0, 4);
const LATE = [HARVEST_DISHES[4], STUFFING];
let target = null;
const engine = {
  PIXI,
  mode: 'solo',
  streetTsid: TABLE_STREET,
  street: { bounds: { l: -3000, t: -1000, r: 3000, b: 0 } },
  platforms: [],
  groundY: 0,
  started: true,
  inv: {},
  entityLayer: new PIXI.Container(),
  param: (k) => (k === 'seasondate' ? '2026-11-26' : ''),
  register(t) {
    target = { ...t };
    return target;
  },
  unregister() {},
  setData() {},
  pushActivity() {},
  toast() {},
  playSound() {},
  save() {},
  refreshPack() {},
  updateHud() {},
  achievement() {},
  query: () => null,
  inScene: () => false,
};

/** The dish sprites on the table now. */
const icons = () => target.sprite.children.find((c) => !(c instanceof PIXI.Sprite) && !(c instanceof PIXI.Text)).children; // after the boards, before the count

function lay(n, from = 0) {
  for (let i = 0; i < n; i += 1) {
    const c = DISHES[(from + i) % DISHES.length];
    addItem(engine.inv, c, 1);
    assert.equal(potLuckFeastFeature.runVerb(target, `lay:${c}`, engine), true, `lay ${c}`);
  }
}

/** Every drawn dish: a live sprite on a live, loaded icon, fitted to the table's 34 px box. */
function assertDrawn(want) {
  const kids = icons();
  assert.equal(kids.length, want, 'dishes drawn');
  for (const s of kids) {
    assert.equal(s.destroyed, false);
    assert.ok(s.texture && !s.texture.destroyed, 'a live texture');
    assert.equal(isLoaded(s.texture), true, `${s.texture.label} loaded`);
    assert.equal(s.texture.width, 40, `${s.texture.label} sized`);
    assert.ok(Math.abs(s.scale.x - 34 / 40) < 1e-6, `${s.texture.label} fitted (${s.scale.x})`);
    assert.ok(s.width > 30 && s.height > 30, 'drawn at its size');
  }
}

describe('the Harvest Table keeps every laid dish drawn (G982)', () => {
  before(() => {
    potLuckFeastFeature.init(engine);
    potLuckFeastFeature.onStreetEnter({}, engine);
    assert.ok(target, 'the table stands');
  });

  it('lays before the icons arrive: every drawn dish shows once they do', async () => {
    lay(25);
    await arrive();
    assertDrawn(Math.min(25, TABLE_RULES.shown));
  });

  it('more lays after the icons arrived keep them drawn and fitted', async () => {
    lay(60, 3);
    await arrive();
    assertDrawn(TABLE_RULES.shown);
  });

  it('a dish whose icon has not come yet does not hide the others', async () => {
    for (const c of [...LATE, ...LATE]) {
      addItem(engine.inv, c, 1);
      potLuckFeastFeature.runVerb(target, `lay:${c}`, engine);
      lay(2);
    }
    assert.ok(waiting.length > 0, 'the late icons are still on their way');
    await arrive();
    assertDrawn(TABLE_RULES.shown);
  });
});
