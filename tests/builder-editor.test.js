/**
 * LEVEL BUILDER P1 (spec 6, section 14): the editor's pure parts. Addresses, keys and zoom
 * (js/builder/editor.js), deco geometry and handles (js/builder/handles.js), the draft session:
 * undo, redo, autosave, the 409 rebase and the stash, polling (js/builder/session.js), the REST
 * client (js/builder/api.js), and the play-test (js/builder/draft-play.js, game.js).
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashFor, layersFrontFirst, nudgeStep, parseHash, playTestUrl, searchStreets, zFor, zoomAfter, ZOOM_MAX, ZOOM_MIN } from '../public/js/builder/editor.js?v=c9a97b93';
import { contains, corners, decoBox, handlePoints, meetsRect, resizeBy, rotationTo, toLocal } from '../public/js/builder/handles.js?v=e215d17d';
import { DraftSession, statusWords } from '../public/js/builder/session.js?v=e64474a6';
import { createBuilderApi } from '../public/js/builder/api.js?v=3f83c00b';
import { DRAFT_REFUSED, bannerWords, builderUrl, draftParams, startDraftPlay } from '../public/js/builder/draft-play.js?v=bc6e94f2';
import { applyOps } from '../public/js/builder/ops.js?v=044258c8';
import { floorUnder, withDecoIds } from '../public/js/builder/zone.js?v=9608addf';
import { clearStreetCache, clearStreetIndex, isDraftStreet, loadStreetData } from '../public/js/street-loader.js?v=d6cbbd5c';
import { getStreetEcologyCatalog, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=7e30da8f';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const fixture = () => JSON.parse(read('tests/fixtures/builder/mossy-hollow.zone.json'));

describe('the editor (js/builder/editor.js)', () => {
  it('reads and writes its addresses', () => {
    assert.deepEqual(parseHash('#draft=mossy-hollow&street=lane'), { draft: 'mossy-hollow', street: 'lane', view: '' });
    assert.deepEqual(parseHash('#view=GLI2V0UN7RD1T2J'), { draft: '', street: '', view: 'GLI2V0UN7RD1T2J' });
    assert.deepEqual(parseHash('#draft=Bad Id&view=nope'), { draft: '', street: '', view: '' });
    assert.equal(hashFor({ draft: 'mossy-hollow', street: 'lane' }), '#draft=mossy-hollow&street=lane');
    assert.equal(hashFor({ view: 'GLI2V0UN7RD1T2J' }), '#view=GLI2V0UN7RD1T2J');
  });

  it('play-tests a draft street as a practice copy, from a spot', () => {
    assert.equal(playTestUrl({ draft: 'mossy-hollow', street: 'lane', x: 150.4, y: 940 }), '/play/?practice=1&autostart=1&draft=mossy-hollow&street=lane&streetx=150&streety=940');
    assert.equal(playTestUrl({ draft: 'mossy-hollow', street: 'lane' }), '/play/?practice=1&autostart=1&draft=mossy-hollow&street=lane');
  });

  it('nudges 5, 20 with Shift, 1 with Alt; zooms within 5% to 400%', () => {
    assert.equal(nudgeStep({}), 5);
    assert.equal(nudgeStep({ shiftKey: true }), 20);
    assert.equal(nudgeStep({ altKey: true }), 1);
    assert.ok(zoomAfter(1, -100) > 1 && zoomAfter(1, 100) < 1);
    assert.equal(zoomAfter(ZOOM_MAX, -10000), ZOOM_MAX);
    assert.equal(zoomAfter(ZOOM_MIN, 10000), ZOOM_MIN);
  });

  it('z order: one step, or to the front and back of the layer', () => {
    const a = { z: 1 };
    const layer = { decos: [a, { z: 4 }, { z: -2 }] };
    assert.equal(zFor(layer, a, 1), 2);
    assert.equal(zFor(layer, a, -1), 0);
    assert.equal(zFor(layer, a, 1, true), 5);
    assert.equal(zFor(layer, a, -1, true), -3);
  });

  it('searches streets by name, hub and tsid; lists layers front first', () => {
    const list = [{ tsid: 'GLI2V0UN7RD1T2J', label: 'Hechey Track', hub: 'Groddle Forest' }, { tsid: 'GA1', label: 'Track Side', hub: 'Jal' }, { tsid: 'GA2', label: 'Moss', hub: 'Groddle Forest' }];
    assert.deepEqual(searchStreets(list, 'track').map((s) => s.tsid), ['GA1', 'GLI2V0UN7RD1T2J']);
    assert.deepEqual(searchStreets(list, 'gli2v0un7rd1t2j').map((s) => s.tsid), ['GLI2V0UN7RD1T2J']);
    assert.deepEqual(searchStreets(list, 'groddle').map((s) => s.tsid), ['GLI2V0UN7RD1T2J', 'GA2']);
    assert.deepEqual(layersFrontFirst([{ id: 'sky', z: -3 }, { id: 'middleground', z: 0 }, { id: 'fg', z: 2 }]).map((l) => l.id), ['fg', 'middleground', 'sky']);
  });

  it('draws with the game\'s own renderer, set up as game.js sets it up (spec 6.1)', () => {
    const src = read('public/js/builder/editor.js');
    assert.match(src, /import \{ buildStreetView[^}]*\} from '\.\.\/street-render\.js\?v=[0-9a-f]{8}';/);
    assert.match(src, /installHiresDecos\(textureUrls, \{ renderer: \(\) => app\?\.renderer \}\)/);
    assert.match(src, /PIXI\.Filter\.defaultOptions\.resolution = 'inherit';/);
    assert.match(src, /installPixiFixes\(PIXI\)/);
    assert.match(src, /navigableSignposts\(s\.signposts\)/, 'hidden connects dropped, as loadStreetData does');
    assert.doesNotMatch(src, /innerHTML/, 'everything is set as text');
    // House copy: no em dashes and never "Glitch" in anything the page shows (comments aside).
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bGlitch\b|—/, 'house copy');
  });

  it('its stylesheet uses the site\'s light and dark tokens', () => {
    const css = read('public/css/builder.css');
    for (const t of ['--bg', '--surface', '--fg', '--muted', '--border', '--accent', '--row-line', '--track']) assert.match(css, new RegExp(`var\\(${t}\\)`), t);
    assert.match(css, /:focus-visible/);
  });
});

describe('deco geometry and handles (js/builder/handles.js)', () => {
  const street = { bounds: { l: -1000, r: 1000, t: -1000, b: 0 } };
  const mg = { id: 'middleground' };
  const deco = { x: 0, y: -60, w: 200, h: 100, r: 0 };
  const box = decoBox(street, mg, deco);

  it('anchors bottom centre, in screen space', () => {
    assert.deepEqual([box.ax, box.ay, box.w, box.h], [1000, 940, 200, 100]);
    assert.equal(contains(box, { x: 1000, y: 900 }), true);
    assert.equal(contains(box, { x: 1101, y: 900 }), false);
    assert.equal(contains(box, { x: 1000, y: 941 }), false);
    assert.deepEqual(corners(box).map((p) => [Math.round(p.x), Math.round(p.y)]), [[900, 840], [1100, 840], [1100, 940], [900, 940]]);
  });

  it('rotates about the anchor', () => {
    const b = { ...box, r: 90 };
    const l = toLocal(b, { x: 1050, y: 940 });
    assert.ok(Math.abs(l.x) < 1e-9 && Math.abs(l.y + 50) < 1e-9);
    assert.equal(contains(b, { x: 1050, y: 940 }), true);
    assert.equal(rotationTo(box, { x: 1100, y: 940 }), 90);
    assert.equal(rotationTo(box, { x: 1000, y: 800 }), 0);
    assert.equal(rotationTo(box, { x: 1100, y: 930 }, 15), 90);
  });

  it('resizes from a handle with the far edge fixed; Shift keeps proportions', () => {
    const e = handlePoints(box).find((h) => h.id === 'e');
    assert.deepEqual(resizeBy(street, mg, deco, box, e, { x: 1100, y: 890 }, { x: 1160, y: 890 }), { x: 30, y: -60, w: 260, h: 100 });
    const n = handlePoints(box).find((h) => h.id === 'n');
    assert.deepEqual(resizeBy(street, mg, deco, box, n, { x: 1000, y: 840 }, { x: 1000, y: 820 }), { x: 0, y: -60, w: 200, h: 120 });
    const s = handlePoints(box).find((h) => h.id === 's');
    assert.deepEqual(resizeBy(street, mg, deco, box, s, { x: 1000, y: 940 }, { x: 1000, y: 960 }), { x: 0, y: -40, w: 200, h: 120 });
    const se = handlePoints(box).find((h) => h.id === 'se');
    assert.deepEqual(resizeBy(street, mg, deco, box, se, { x: 1100, y: 940 }, { x: 1300, y: 950 }, { keepAspect: true }), { x: 100, y: 40, w: 400, h: 200 });
    assert.equal(handlePoints(box).length, 9, 'eight handles and the rotation knob');
  });

  it('a layer-local deco moves with its layer\'s parallax offset', () => {
    const sky = { id: 'sky', w: 1500, h: 1000 };
    const b = decoBox(street, sky, { x: 100, y: 500, w: 50, h: 50 }, { x: 30, y: -10 });
    assert.deepEqual([b.ax, b.ay], [130, 490]);
  });

  it('a marquee meets what its box touches', () => {
    assert.equal(meetsRect(box, { x1: 1090, y1: 800, x2: 1200, y2: 850 }), true);
    assert.equal(meetsRect(box, { x1: 1101, y1: 800, x2: 1200, y2: 850 }), false);
  });

  it('helpers for viewing and play-testing: numbered decos and the floor under a point', () => {
    const z = fixture();
    const view = withDecoIds({ layers: [{ decos: [{ id: 'x' }, {}] }, { decos: [{}] }] });
    assert.deepEqual(view.layers.flatMap((l) => l.decos.map((d) => d.id)), ['d_1', 'd_2', 'd_3']);
    const plats = [{ x1: 0, y1: 900, x2: 1000, y2: 900 }, { x1: 400, y1: 700, x2: 600, y2: 700 }, { x1: 400, y1: 650, x2: 600, y2: 650, pc_perm: 0 }];
    assert.deepEqual(floorUnder(plats, 500, 600, (p) => p.pc_perm !== 0), { x: 500, y: 700 });
    assert.deepEqual(floorUnder(plats, 500, 800, (p) => p.pc_perm !== 0), { x: 500, y: 900 });
    assert.equal(z.streets.length, 2);
  });
});

/** A fake store with the site's If-Match behaviour (src/BuilderStore.php write). */
function fakeStore(zone) {
  const s = { zone: structuredClone(zone), rev: zone.rev, calls: [] };
  s.api = {
    async ops(id, rev, ops) {
      s.calls.push({ rev, n: ops.length });
      if (rev !== s.rev) throw Object.assign(new Error('moved on'), { code: 'builder_rev_conflict', status: 409, data: { rev: s.rev } });
      applyOps(s.zone, ops);
      s.rev += 1;
      s.zone.rev = s.rev;
      return { rev: s.rev };
    },
    async draft(id, { etag } = {}) {
      if (etag === s.rev) return null;
      return { zone: structuredClone(s.zone), rev: s.rev };
    },
  };
  s.other = (ops) => { applyOps(s.zone, ops); s.rev += 1; s.zone.rev = s.rev; };
  return s;
}

describe('the draft session (js/builder/session.js)', () => {
  const set = (id, x) => ({ op: 'deco.set', street: 'lane', id, set: { x } });
  const x = (z, id) => z.streets[0].street.layers.flatMap((l) => l.decos).find((d) => d.id === id)?.x;

  it('a drag is one undo step; undo and redo are saved as ops', async () => {
    const store = fakeStore(fixture());
    const session = new DraftSession(structuredClone(store.zone), { api: store.api });
    session.apply([set('d_9', 10), set('d_14', 20)], { label: 'move' });
    assert.equal(session.status, 'unsaved');
    session.undo();
    assert.equal(x(session.zone, 'd_9'), 0);
    assert.equal(x(session.zone, 'd_14'), 1350);
    session.redo();
    assert.equal(x(session.zone, 'd_14'), 20);
    await session.flush();
    assert.equal(session.status, 'saved');
    assert.equal(session.rev, 8);
    assert.deepEqual(store.calls, [{ rev: 7, n: 6 }], 'one batch with If-Match');
    assert.equal(JSON.stringify(store.zone), JSON.stringify(session.zone), 'the store and the editor agree');
  });

  it('409: re-applies the unsent ops over the new rev and saves them', async () => {
    const store = fakeStore(fixture());
    const session = new DraftSession(structuredClone(store.zone), { api: store.api });
    store.other([set('d_1', 99)]);
    session.apply([set('d_9', 10)]);
    await session.flush();
    assert.equal(session.status, 'saved');
    assert.equal(x(store.zone, 'd_1'), 99, 'their edit kept');
    assert.equal(x(store.zone, 'd_9'), 10, 'ours on top');
    assert.equal(session.rev, 9);
    assert.equal(session.canUndo, false, 'history cleared: its inverses were made against the old rev');
  });

  it('409 where our ops no longer fit: they go to the stash and the draft shows as it is', async () => {
    const store = fakeStore(fixture());
    const events = [];
    const session = new DraftSession(structuredClone(store.zone), { api: store.api, onChange: (e) => events.push(e.kind) });
    store.other([{ op: 'deco.remove', street: 'lane', id: 'd_9' }]);
    session.apply([set('d_9', 10)]);
    await session.flush();
    assert.equal(session.status, 'conflict');
    assert.equal(session.stash.length, 1);
    assert.equal(x(session.zone, 'd_9'), undefined);
    assert.equal(session.rev, 8);
    assert.ok(events.includes('conflict'));
    assert.match(statusWords(session), /kept aside/);
    assert.throws(() => session.applyStash());
  });

  it('a network failure keeps the ops for the next try', async () => {
    const store = fakeStore(fixture());
    const session = new DraftSession(structuredClone(store.zone), { api: { ...store.api, ops: async () => { throw Object.assign(new Error('offline'), { status: 0 }); } } });
    session.apply([set('d_9', 10)]);
    await session.flush();
    assert.equal(session.status, 'offline');
    assert.equal(session.pending.length, 1);
  });

  it('poll: an agent\'s newer rev replaces the zone when nothing is pending', async () => {
    const store = fakeStore(fixture());
    const session = new DraftSession(structuredClone(store.zone), { api: store.api });
    assert.equal(await session.poll(), false, 'same rev: 304');
    store.other([set('d_9', 77)]);
    session.apply([set('d_14', 5)]);
    assert.equal(await session.poll(), false, 'not while ours are pending');
    await session.flush();
    assert.equal(x(session.zone, 'd_9'), 77);
    store.other([set('d_9', 78)]);
    assert.equal(await session.poll(), true);
    assert.equal(x(session.zone, 'd_9'), 78);
  });
});

describe('the REST client (js/builder/api.js)', () => {
  it('sends the nonce, If-Match on writes, If-None-Match on reads; a 304 is null', async () => {
    const seen = [];
    const fetchImpl = async (url, init = {}) => {
      seen.push({ url: String(url), init });
      if (String(url).includes('rest-nonce')) return { ok: true, status: 200, text: async () => '0123456789', headers: new Map() };
      if (init.headers?.['If-None-Match'] === '"7"') return { ok: false, status: 304, headers: new Map([['ETag', '"7"']]) };
      if (init.method === 'POST') return { ok: false, status: 409, json: async () => ({ code: 'builder_rev_conflict', message: 'moved', data: { status: 409, rev: 8 } }), headers: new Map() };
      return { ok: true, status: 200, json: async () => ({ format: 'groddle-zone/1', id: 'x', rev: 7 }), headers: new Map([['ETag', '"7"']]) };
    };
    const api = createBuilderApi({ fetchImpl });
    assert.deepEqual(await api.draft('mossy-hollow'), { zone: { format: 'groddle-zone/1', id: 'x', rev: 7 }, rev: 7 });
    assert.equal(await api.draft('mossy-hollow', { etag: 7 }), null);
    await assert.rejects(api.ops('mossy-hollow', 7, [{ op: 'zone.set', set: { notes: 'x' } }]), (e) => e.code === 'builder_rev_conflict' && e.status === 409 && e.data.rev === 8);
    const post = seen.find((s) => s.init.method === 'POST');
    assert.equal(post.init.headers['If-Match'], '"7"');
    assert.equal(post.init.headers['X-WP-Nonce'], '0123456789');
    assert.match(post.url, /\/wp-json\/groddle\/v1\/admin\/builder\/drafts\/mossy-hollow\/ops$/);
  });
});

describe('the play-test (js/builder/draft-play.js, game.js)', () => {
  afterEach(() => { clearStreetIndex(); clearStreetCache(); });
  const bundle = () => {
    const z = fixture();
    const streets = Object.fromEntries(z.streets.map((s) => [s.street.tsid, s.street]));
    return {
      draft: { id: 'mossy-hollow', title: 'Mossy Hollow', rev: 7 },
      keys: { lane: 'GZ0000000000001', end: 'GZ0000000000002' },
      streets,
      index: { GZ0000000000001: { label: 'Mossy Lane', hubId: '900', hubName: 'Mossy Hollow', draft: true }, GZ0000000000002: { label: 'Hollow End', hubId: '900', hubName: 'Mossy Hollow', draft: true } },
      ecology: { GZ0000000000001: { label: 'Mossy Lane', counts: { npc_piggy: 2 }, quoins: 6 } },
      hub: z.hub,
    };
  };

  it('reads the address; words for the banner and the way back', () => {
    assert.equal(draftParams('?autostart=1'), null);
    assert.deepEqual(draftParams('?draft=mossy-hollow&street=end'), { draft: 'mossy-hollow', street: 'end' });
    assert.deepEqual(draftParams('?draft=Nope'), { draft: '', street: '' });
    assert.equal(bannerWords({ label: 'Mossy Lane', rev: 12 }), 'Draft: Mossy Lane (rev 12)');
    assert.equal(builderUrl('mossy-hollow', 'lane'), '/console/builder/#draft=mossy-hollow&street=lane');
  });

  it('registers the draft\'s streets and population, and starts on the named street', async () => {
    const before = getStreetEcologyCatalog();
    const r = await startDraftPlay('?draft=mossy-hollow&street=end', { api: { play: async () => bundle() } });
    assert.deepEqual({ ...r }, { id: 'mossy-hollow', rev: 7, tsid: 'GZ0000000000002', key: 'end', label: 'Hollow End', title: 'Mossy Hollow' });
    assert.equal(isDraftStreet('GZ0000000000001'), true);
    globalThis.fetch = async () => { throw new Error('a draft street is never fetched'); };
    assert.equal((await loadStreetData('GZ0000000000001')).label, 'Mossy Lane');
    assert.deepEqual(getStreetEcologyCatalog().streets.GZ0000000000001.counts, { npc_piggy: 2 });
    setStreetEcologyCatalog(before);
  });

  it('refuses plainly: a multiplayer page, a bad id, a refused route', async () => {
    const api = { play: async () => { throw Object.assign(new Error('no'), { status: 403 }); } };
    assert.deepEqual(await startDraftPlay('?draft=mossy-hollow', { mode: 'multiplayer', api }), { refused: DRAFT_REFUSED });
    assert.deepEqual(await startDraftPlay('?draft=Nope', { api }), { refused: DRAFT_REFUSED });
    assert.deepEqual(await startDraftPlay('?draft=mossy-hollow', { api }), { refused: DRAFT_REFUSED });
    assert.equal(DRAFT_REFUSED, 'That draft is not available.');
  });

  it('game.js asks for the draft before it picks the start street, as ?streetdemo= would', () => {
    const game = read('public/game.js');
    const ask = game.indexOf('const draftStart = bootParams.has(\'draft\') ? await startDraftPlay(bootParams, { mode: GAME_MODE }) : null;');
    const pick = game.indexOf('const streetDemoTsid = draftStart?.tsid');
    assert.ok(ask > 0 && pick > ask);
    assert.ok(ask > game.indexOf('await Promise.all([ensureStreetIndex(), loadStreetEcologyCatalog()]);'), 'after the index and ecology load');
  });
});
