/**
 * Picture tiles in the character builder (Austin 2026-11-12, js/avatar-tiles.js), after the 2012
 * Vanity page's features pane (FeaturesVanityTabPane.as, AbstractVanityTabPane.as):
 *  - each part option is a square tile drawn from the vector avatar, the worn one marked, the name
 *    its tooltip, "none" in words; the old chips' hooks (avatar-style-chip, data-type, data-name) stay;
 *  - TILE_PAGE a page with Previous / Next, search and keys still work;
 *  - tiles paint lazily (only the page shown, a few ms a frame) and are kept;
 *  - Reset goes back to the last saved look (Vanity.as doReset), not the default.
 * Run: node --test tests/avatar-picture-tiles.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl } from './social-fake-dom.js';
import { drawListBounds, expandRig, frameDrawList, lookMatrices, slotAssignments } from '../public/js/avatar-rig.js?v=b67f0da8';
import { expandCatalog, resolveLook } from '../public/js/avatar-looks.js?v=76eb9653';
import { CORE_FRAMES } from '../public/js/avatar-anims.js?v=fb921bf4';
import {
  NONE_TYPES, TILE_FRAME, TILE_MIN_SPAN, TILE_PAGE, createTileArt, filterOptions, focusIn, itemsOf, pageCount, pageFor,
  pickPart, refocus, renderPartSwitch, renderPartTiles, tileFields, tileFrame, tileJob,
} from '../public/js/avatar-tiles.js?v=a05b7d4f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const catalog = expandCatalog(json('public/assets/avatar/catalog.json'));
const game = read('public/game.js');
const style = read('public/style.css');
const classic = read('public/css/classic.css');

class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  appendChild(k) { this.append(k); return k; }
}
let doc;
beforeEach(() => {
  doc = { activeElement: null, createElement: (t) => new El(t) };
  globalThis.document = doc;
});
const box = () => { const b = new El('div'); b.ownerDocument = doc; return b; };
const opts = (n) => Array.from({ length: n }, (_, i) => ({ name: `p${i}`, label: `Part ${i}` }));
const tilesOf = (b) => b.querySelectorAll('.avatar-tile');

describe('paging', () => {
  it('pages TILE_PAGE at a time and opens on the page holding the worn part', () => {
    assert.equal(TILE_PAGE, 12);
    assert.equal(pageCount(0), 1);
    assert.equal(pageCount(12), 1);
    assert.equal(pageCount(46), 4);
    const list = opts(46);
    const state = {};
    assert.equal(pageFor(state, list, 'p30'), 2);
    // The player's own paging is kept while the worn part stays...
    state.page = 0;
    assert.equal(pageFor(state, list, 'p30'), 0);
    // ...and Random, Reset or a preset (a new worn part) brings its page back.
    assert.equal(pageFor(state, list, 'p13'), 1);
    state.page = 99;
    assert.equal(pageFor(state, list, 'p13'), 3);
  });

  it('search matches labels and names, and leaves None out', () => {
    const list = [{ name: 'none', label: 'None' }, { name: 'Buzzcut', label: 'Buzzcut' }, { name: 'eightiesBandana', label: 'Eighties bandana' }];
    assert.equal(filterOptions(list, '').length, 3);
    assert.deepEqual(filterOptions(list, 'BAND').map((o) => o.name), ['eightiesBandana']);
    assert.deepEqual(filterOptions(list, 'none'), []);
  });
});

describe('what a tile wears', () => {
  it('pickPart keeps the old chips\' rules: a dress replaces top and trousers, a skirt the trousers', () => {
    assert.deepEqual(pickPart({ outfit: { shirt: 'a', pants: 'b' }, variant: { dress: 2 } }, 'dress', 'd').outfit, { shirt: 'none', pants: 'none', skirt: 'none', dress: 'd' });
    assert.deepEqual(pickPart({ outfit: { pants: 'b', dress: 'd' } }, 'skirt', 's').outfit, { pants: 'none', dress: 'none', skirt: 's' });
    assert.deepEqual(pickPart({ outfit: { dress: 'd', skirt: 's' } }, 'pants', 'p').outfit, { dress: 'none', skirt: 'none', pants: 'p' });
    const v = pickPart({ outfit: { hat: 'cap' }, variant: { hat: 3 }, tint: { hat: 'ff0000' } }, 'hat', 'none');
    assert.equal(v.outfit.hat, 'none');
    assert.equal(v.variant.hat, undefined);
    assert.equal(v.tint.hat, undefined);
    assert.deepEqual(NONE_TYPES, ['hat', 'coat', 'dress', 'skirt', 'nose', 'ears']);
  });

  it('draws the part on the player\'s look: bare-headed for hair and face, no coat over a top', () => {
    const vector = { outfit: { hat: 'cap', coat: 'navy_coat', hair: 'Buzzcut', shirt: 'classic_undershirt' }, variant: { shirt: 2 }, hairColor: catalog.palettes.hair[3].id };
    const hair = tileFields(vector, 'hair', 'pigtails', 'Buzzcut');
    assert.equal(hair.outfit.hair, 'pigtails');
    assert.equal(hair.outfit.hat, 'none');
    assert.equal(hair.hairColor, vector.hairColor);
    assert.equal(tileFields(vector, 'eyes', 'eyes_01', 'x').outfit.hat, 'none');
    assert.equal(tileFields(vector, 'hat', 'cap', 'cap').outfit.hair, 'Buzzcut', 'a hat tile keeps the hair (it may hide it)');
    // The worn top keeps its colourway; another starts in its first.
    assert.equal(tileFields(vector, 'shirt', 'classic_undershirt', 'classic_undershirt').variant.shirt, 2);
    assert.equal(tileFields(vector, 'shirt', 'mushroom_shirt', 'classic_undershirt').variant.shirt, undefined);
    assert.equal(tileFields(vector, 'shirt', 'mushroom_shirt', 'classic_undershirt').outfit.coat, 'none');
    assert.equal(vector.outfit.hat, 'cap', 'the player\'s fields are not touched');
  });

  it('keys a tile by its whole look, so a new hair colour redraws it but keeps the family', () => {
    const v1 = { outfit: { hair: 'Buzzcut' }, hairColor: catalog.palettes.hair[3].id };
    const v2 = { ...v1, hairColor: catalog.palettes.hair[4].id };
    const a = tileJob(v1, 'hair', 'pigtails', 'Buzzcut', catalog, 112);
    const b = tileJob(v2, 'hair', 'pigtails', 'Buzzcut', catalog, 112);
    assert.notEqual(a.key, b.key);
    assert.equal(a.family, b.family);
    assert.equal(a.key, tileJob(v1, 'hair', 'pigtails', 'Buzzcut', catalog, 112).key);
    // Picking within the page (the worn part changes) leaves the other tiles' looks alone.
    assert.equal(tileJob({ ...v1, outfit: { hair: 'Mohawk' } }, 'hair', 'pigtails', 'Mohawk', catalog, 112).key, a.key);
    assert.notEqual(tileJob(v1, 'hair', 'pigtails', 'Buzzcut', catalog, 56).family, a.family);
  });
});

describe('framing on the real rig', () => {
  const rig = expandRig(json('public/assets/avatar/base.json'));
  const frame = CORE_FRAMES.indexOf(TILE_FRAME);
  const tileOf = (vector, type, name) => {
    const look = resolveLook(tileFields(vector, type, name, null), catalog);
    const articles = new Map(Object.entries(look.outfit).map(([t, a]) => [a.name, json(`public/assets/avatar/articles/${t}/${a.name}.json`)]));
    const ctx = { assign: slotAssignments(look.outfit, { hatAllowsHair: (h, r) => Boolean(catalog.hatHair[h.name]?.includes(r.name)) }), articles, matrices: lookMatrices(look), face: look.face };
    const shapeOf = (src, id) => (src === 'base' ? rig.shapes[id] : articles.get(src)?.shapes[id]);
    const items = frameDrawList(rig, ctx, frame);
    const part = drawListBounds(itemsOf(items, name), shapeOf);
    return { whole: drawListBounds(items, shapeOf), part, frame: tileFrame(part, null, type) };
  };

  it('zooms each part: eyes high and small, shoes low, a top in between', () => {
    assert.ok(frame >= 0);
    const eyes = tileOf({}, 'eyes', 'eyes_01');
    const shoes = tileOf({}, 'shoes', 'converse');
    const shirt = tileOf({}, 'shirt', 'classic_undershirt');
    const h = eyes.whole[3] - eyes.whole[1];
    const centreY = (t) => t.frame[1] + t.frame[2] / 2;
    assert.ok(eyes.frame[2] >= TILE_MIN_SPAN.eyes && eyes.frame[2] < h / 2, `eyes span ${eyes.frame[2]}`);
    assert.ok(centreY(eyes) < centreY(shirt) && centreY(shirt) < centreY(shoes));
    assert.ok(centreY(eyes) < eyes.whole[1] + h * 0.45, 'eyes sit in the head');
    assert.ok(centreY(shoes) > shoes.whole[1] + h * 0.8, 'shoes at the feet');
  });

  it('a part that draws nothing shows the whole look', () => {
    const [x, y, span] = tileFrame(null, [-40, -120, 40, 0], 'hat');
    assert.ok(span > 120 && x < -40 && y < -120);
  });
});

describe('the tile painter', () => {
  const canvasStub = (px = 2) => {
    const c = { width: px, height: px, dataset: {}, isConnected: true, drawn: [] };
    c.getContext = () => ({ setTransform() {}, clearRect() {}, drawImage: (src) => c.drawn.push(src) });
    return c;
  };
  const job = (name, look = 'L1', px = 64) => ({ type: 'hair', name, px, look, key: `${name}@${px}|${look}`, family: `${name}@${px}` });
  const rig = () => {
    const frames = [];
    let t = 0;
    const painted = [];
    const art = createTileArt({
      prepare: async (look) => ({ look }),
      paint: (prep, canvas, type, name) => { t += 4; painted.push(name); canvas.pic = `${name}|${prep.look}`; return canvas; },
      frame: (fn) => frames.push(fn),
      now: () => t,
      makeCanvas: (px) => canvasStub(px),
      budgetMs: 6,
      concurrency: 3,
      max: 4,
    });
    const flush = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
    const runFrame = () => { const fn = frames.shift(); fn?.(); };
    return { art, frames, painted, flush, runFrame };
  };

  it('paints on animation frames within the budget, a few at a time, and keeps the pictures', async () => {
    const { art, frames, painted, flush, runFrame } = rig();
    const cs = ['a', 'b', 'c'].map(() => canvasStub());
    ['a', 'b', 'c'].forEach((n, i) => assert.equal(art.request(cs[i], job(n)), 'queued'));
    assert.equal(painted.length, 0, 'nothing paints in the call');
    await flush();
    assert.equal(frames.length, 1, 'one frame asked for');
    runFrame();
    // 4 ms a paint against a 6 ms budget: two this frame, the third on the next.
    assert.deepEqual(painted, ['a', 'b']);
    assert.equal(frames.length, 1);
    runFrame();
    assert.deepEqual(painted, ['a', 'b', 'c']);
    assert.equal(cs[2].dataset.art, 'ready');
    assert.equal(cs[2].drawn[0].pic, 'c|L1');
    // Asked again (paging back, a pick within the page): drawn from memory at once.
    const again = canvasStub();
    assert.equal(art.request(again, job('a')), 'ready');
    assert.equal(again.drawn[0].pic, 'a|L1');
    assert.equal(painted.length, 3);
  });

  it('keeps the last picture up while a changed look repaints, and skips tiles paged away', async () => {
    const { art, painted, flush, runFrame } = rig();
    const c = canvasStub();
    art.request(c, job('a'));
    await flush();
    runFrame();
    const c2 = canvasStub();
    assert.equal(art.request(c2, job('a', 'L2')), 'stale');
    assert.equal(c2.drawn[0].pic, 'a|L1');
    assert.equal(c2.dataset.art, 'stale');
    // A page turned before its tiles were painted: their canvases left the page, nothing paints.
    const gone = canvasStub();
    art.request(gone, job('z'));
    gone.isConnected = false;
    await flush();
    runFrame();
    assert.deepEqual(painted, ['a', 'a']);
    assert.equal(c2.drawn[1].pic, 'a|L2');
  });

  it('forgets the oldest pictures past its limit', async () => {
    const { art, flush, runFrame } = rig();
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) art.request(canvasStub(), job(n));
    await flush();
    for (let i = 0; i < 6; i += 1) runFrame();
    await flush();
    for (let i = 0; i < 6; i += 1) runFrame();
    assert.equal(art.size, 4);
    assert.ok(!art.has(job('a').key) && art.has(job('f').key));
  });
});

describe('the tile grid', () => {
  const render = (n = 30, worn = 'p14', extra = {}) => {
    const b = box();
    const drawn = [];
    const picked = [];
    const state = extra.state || {};
    const row = renderPartTiles(b, {
      type: 'hair', title: 'Hair style', options: opts(n), worn, state,
      onPick: (name) => picked.push(name),
      draw: (canvas, name, px) => drawn.push([name, px]),
      ...extra,
    });
    return { b, row, drawn, picked, state };
  };

  it('a page of picture tiles with the old hooks, the worn one marked, names as tooltips', () => {
    const { b, row, drawn } = render();
    const tiles = tilesOf(b);
    assert.equal(tiles.length, TILE_PAGE);
    assert.equal(row.dataset.page, '1', 'opened on the worn part\'s page');
    assert.equal(row.dataset.pages, '3');
    for (const t of tiles) {
      assert.ok(t.classList.contains('avatar-style-chip'));
      assert.equal(t.dataset.type, 'hair');
      assert.ok(t.dataset.name);
      assert.equal(t.title, t.getAttribute('aria-label'));
      assert.ok(t.querySelector('canvas.avatar-tile-art'));
    }
    const worn = b.querySelector('.avatar-tile[data-name="p14"]');
    assert.ok(worn.classList.contains('active'));
    assert.equal(worn.getAttribute('aria-pressed'), 'true');
    assert.equal(worn.tabIndex, 0, 'the worn tile is the one in the tab order');
    assert.equal(b.querySelector('.avatar-tile-caption').textContent, 'Part 14');
    // Lazy: only the shown page asked for pictures.
    assert.deepEqual(drawn.map(([n]) => n), opts(30).slice(12, 24).map((o) => o.name));
    assert.ok(drawn.every(([, px]) => px > 0));
    assert.ok(b.querySelector('.avatar-search'), 'a long list keeps its search');
  });

  it('Previous / Next turn pages, and only the new page paints', () => {
    const { b, drawn } = render();
    drawn.length = 0;
    const next = b.querySelector('.avatar-page-next');
    next.click();
    assert.equal(b.querySelector('.avatar-page-label').textContent, '3 / 3');
    assert.equal(tilesOf(b).length, 6);
    assert.equal(next.disabled, true);
    assert.deepEqual(drawn.map(([n]) => n), opts(30).slice(24).map((o) => o.name));
    b.querySelector('.avatar-page-prev').click();
    b.querySelector('.avatar-page-prev').click();
    assert.equal(b.querySelector('.avatar-page-label').textContent, '1 / 3');
    assert.equal(b.querySelector('.avatar-page-prev').disabled, true);
  });

  it('clicking a tile wears it; None is a word, not a picture', () => {
    const options = [{ name: 'none', label: 'None' }, ...opts(5)];
    const b = box();
    const picked = [];
    renderPartTiles(b, { type: 'hat', title: 'Hat', options, worn: 'none', state: {}, onPick: (n) => picked.push(n), draw: () => {} });
    const none = b.querySelector('.avatar-tile[data-name="none"]');
    assert.ok(none.classList.contains('avatar-tile-none') && !none.querySelector('canvas'));
    assert.equal(none.textContent, 'none');
    b.querySelector('.avatar-tile[data-name="p3"]').click();
    assert.deepEqual(picked, ['p3']);
    assert.ok(b.querySelector('.avatar-pager').hidden, 'one page: no pager');
    assert.equal(b.querySelector('.avatar-search'), null, 'a short list has no search');
  });

  it('search filters into pages of its own', () => {
    const { b } = render(30, 'p0');
    const search = b.querySelector('.avatar-search');
    search.value = 'Part 2';
    search.dispatch('input');
    const names = tilesOf(b).map((t) => t.dataset.name);
    assert.deepEqual(names, ['p2', 'p20', 'p21', 'p22', 'p23', 'p24', 'p25', 'p26', 'p27', 'p28', 'p29']);
    search.value = 'zzz';
    search.dispatch('input');
    assert.equal(tilesOf(b).length, 0);
    assert.equal(b.querySelector('.avatar-note').hidden, false);
  });

  it('keys: arrows move along and over the page edge, Page Down turns, Home and End', () => {
    const { b, row } = render(30, 'p11');
    const at = () => doc.activeElement?.dataset?.name;
    b.querySelector('.avatar-tile[data-name="p11"]').focus();
    doc.activeElement.dispatch('keydown', { key: 'ArrowLeft' });
    assert.equal(at(), 'p10');
    doc.activeElement.dispatch('keydown', { key: 'ArrowRight' });
    doc.activeElement.dispatch('keydown', { key: 'ArrowRight' });
    assert.equal(at(), 'p12', 'past the last tile: the next page\'s first');
    assert.equal(row.dataset.page, '1');
    doc.activeElement.dispatch('keydown', { key: 'ArrowLeft' });
    assert.equal(at(), 'p11', 'and back');
    doc.activeElement.dispatch('keydown', { key: 'PageDown' });
    assert.equal(at(), 'p12');
    doc.activeElement.dispatch('keydown', { key: 'End' });
    assert.equal(at(), 'p23');
    doc.activeElement.dispatch('keydown', { key: 'Home' });
    assert.equal(at(), 'p12');
    assert.equal(tilesOf(b).filter((t) => t.tabIndex === 0).length, 1);
  });

  it('focus comes back to the same tile after the builder redraws', () => {
    const { b } = render(30, 'p3');
    b.querySelector('.avatar-tile[data-name="p5"]').focus();
    const saved = focusIn(b);
    const b2 = box();
    renderPartTiles(b2, { type: 'hair', title: 'Hair style', options: opts(30), worn: 'p5', state: {}, onPick() {}, draw() {} });
    refocus(b2, saved);
    assert.equal(doc.activeElement.dataset.name, 'p5');
    assert.equal(doc.activeElement.tabIndex, 0);
  });

  it('a tab of several parts shows a switch, Vanity\'s order on the Face tab', () => {
    const b = box();
    let picked = null;
    renderPartSwitch(b, { parts: [['eyes', 'Eyes'], ['nose', 'Nose'], ['mouth', 'Mouth'], ['ears', 'Ears']], active: 'nose', onPick: (t) => { picked = t; } });
    const subs = b.querySelectorAll('.avatar-subtab');
    assert.deepEqual(subs.map((s) => s.textContent), ['Eyes', 'Nose', 'Mouth', 'Ears']);
    assert.equal(subs[1].getAttribute('aria-selected'), 'true');
    subs[3].click();
    assert.equal(picked, 'ears');
    assert.match(game, /face: \[\['eyes', 'Eyes'\], \['nose', 'Nose'\], \['mouth', 'Mouth'\], \['ears', 'Ears'\]\]/);
  });
});

describe('wiring', () => {
  it('the builder draws its parts as tiles from the vector pipeline', () => {
    assert.match(game, /import \{[^}]*renderPartTiles[^}]*\} from '\.\/js\/avatar-tiles\.js\?v=/);
    assert.match(game, /renderPartTiles\(box, \{/);
    assert.match(game, /avatarTileArt\.request\(canvas, tileJob\(/);
    assert.match(game, /setVectorFields\(\(v\) => pickPart\(v, type, name\)\)/);
    const mod = read('public/js/avatar-tiles.js');
    assert.match(mod, /import \{ drawListFor, paintItems, prepareLook \} from '\.\/avatar-compositor\.js\?v=8b20791a'/, 'the same compositor module (and caches) the game loads');
  });

  it('Reset goes back to the look last saved (Vanity.as doReset), not the default', () => {
    const i = game.indexOf("getElementById('avatar-reset')");
    const handler = game.slice(i, game.indexOf('});', i));
    assert.match(handler, /playerAppearance = wornAppearance;/);
    assert.doesNotMatch(handler, /createDefaultAppearance/);
  });

  it('Modern and Classic both lay the tiles out; Classic in its lane block above the tickets', () => {
    assert.match(style, /\.avatar-tile-row \{[^}]*grid-template-columns: repeat\(4,/);
    assert.match(style, /\.avatar-style-chip\.avatar-tile \{[^}]*aspect-ratio: 1;/);
    const start = classic.indexOf('/* === Classic vanity (lane) === */');
    const end = classic.indexOf('/* === end Classic vanity === */');
    const tickets = classic.indexOf('/* == TICKETS ==');
    assert.ok(start > 0 && start < end && end < tickets);
    const block = classic.slice(start, end);
    assert.match(block, /#avatar-panel \.avatar-tile-row \{ grid-template-columns: repeat\(6,/);
    assert.match(block, /\.avatar-pager/);
    for (const rule of block.split('\n').filter((l) => /\.avatar-(tile|page|subtab|pager)/.test(l) && l.includes('{'))) {
      assert.ok(rule.startsWith(':root[data-ui="classic"] #avatar-panel'), rule);
    }
  });
});
