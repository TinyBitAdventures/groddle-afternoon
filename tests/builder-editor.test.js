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
import { hashFor, layersFrontFirst, nudgeStep, parseHash, playTestUrl, searchStreets, zFor, zoomAfter, ZOOM_MAX, ZOOM_MIN, readOverlays, OVERLAY_DEFAULTS, layoutCamera, edgePan, findingCounts, validateWords, groupFindings, parseAt, findingPoint, filtersWith, colourInput, colourHex, tintInput, tintNumber, VIEW_FRAMES } from '../public/js/builder/editor.js?v=fd5ba1e7';
import { geoKey, parseGeoKey, geoShape, geoHits, geoInRect, geoHandles, handleWorld, dragHandle, moveBy, changedFields, drawnItem, postOnFloor, defaultItem, permKey, permValue, permName, wallSides, dashes, arriveFor, newConnect, distToSegment, geoKindOf, PERMS } from '../public/js/builder/geometry-handles.js?v=54aaffb7';
import { gridSnap, endPoints, nearestEnd, joinedEnds, snapPlatform, snapDrawnPlatform, bestPull, guideSnap, snapPoint, floorSnapY, rulerTicks } from '../public/js/builder/snap.js?v=c1cb84a7';
import { contains, corners, decoBox, handlePoints, meetsRect, resizeBy, rotationTo, toLocal } from '../public/js/builder/handles.js?v=e215d17d';
import { DraftSession, statusWords } from '../public/js/builder/session.js?v=28b56d66';
import { createBuilderApi } from '../public/js/builder/api.js?v=3f83c00b';
import { DRAFT_REFUSED, bannerWords, builderUrl, draftParams, startDraftPlay } from '../public/js/builder/draft-play.js?v=bc6e94f2';
import { applyOps } from '../public/js/builder/ops.js?v=28c0d569';
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

describe('geometry: picking, handles, drags and drawing (js/builder/geometry-handles.js)', () => {
  // World: bounds l -1000, t -1000, so screen = world + 1000.
  const street = () => ({
    bounds: { l: -1000, r: 1000, t: -1000, b: 0 },
    platforms: [
      { id: 'plat_1', x1: -980, y1: -60, x2: 980, y2: -60, pc_perm: -1, item_perm: -1 },
      { id: 'plat_2', x1: 0, y1: -300, x2: 200, y2: -300, pc_perm: 1 },
      { id: 'plat_3', x1: 200, y1: -300, x2: 400, y2: -250, pc_perm: 0 },
    ],
    barriers: [{ id: 'wall_1', x: 400, y: -400, h: 340, pc_perm: null }],
    ladders: [{ id: 'ladder_1', x: -500, y: -60, w: 50, h: 300 }],
    signposts: [{ id: 'signpost_1', x: 800, y: -60, w: 150, h: 200, connects: [] }],
  });

  it('keys name a kind and an id', () => {
    assert.equal(geoKey('platform', 'plat_1'), 'platform:plat_1');
    assert.deepEqual(parseGeoKey('barrier:wall_1'), { kind: 'barrier', id: 'wall_1' });
    assert.deepEqual(parseGeoKey('ladder:_pl:odd'), { kind: 'ladder', id: '_pl:odd' });
    assert.equal(parseGeoKey('d_12'), null);
    assert.equal(parseGeoKey('deco:d_1'), null);
    assert.equal(geoKindOf(street(), 'ladder_1'), 'ladder');
    assert.equal(geoKindOf(street(), 'd_1'), null);
  });

  it('shapes are in screen space with each kind\'s anchor (spec 2.1)', () => {
    const s = street();
    assert.deepEqual(geoShape(s, 'platform', s.platforms[0]), { kind: 'platform', x1: 20, y1: 940, x2: 1980, y2: 940 });
    assert.deepEqual(geoShape(s, 'barrier', s.barriers[0]), { kind: 'barrier', x: 1400, y1: 600, y2: 940 });
    assert.deepEqual(geoShape(s, 'ladder', s.ladders[0]), { kind: 'ladder', x: 500, y1: 640, y2: 940, w: 50 });
    const post = geoShape(s, 'signpost', s.signposts[0]);
    assert.deepEqual([post.x, post.y1, post.y2, post.w], [1800, 740, 940, 150]);
  });

  it('picks geometry: platforms first, then the nearest; a box counts inside', () => {
    const s = street();
    assert.equal(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
    // The ladder's foot sits on the floor: the floor wins there, the ladder above it.
    assert.deepEqual(geoHits(s, { x: 500, y: 942 }, 6).map((h) => h.id), ['plat_1', 'ladder_1']);
    assert.deepEqual(geoHits(s, { x: 500, y: 800 }, 6).map((h) => h.id), ['ladder_1']);
    assert.deepEqual(geoHits(s, { x: 1402, y: 700 }, 6).map((h) => h.id), ['wall_1']);
    assert.deepEqual(geoHits(s, { x: 1400, y: 700 }, 6, ['signpost']), []);
    assert.deepEqual(geoHits(s, { x: 1800, y: 800 }, 6).map((h) => h.id), ['signpost_1']);
    assert.deepEqual(geoHits(s, { x: 1100, y: 500 }, 6), []);
    assert.deepEqual(geoInRect(s, { x1: 950, y1: 650, x2: 1250, y2: 720 }).sort(), ['platform:plat_2', 'platform:plat_3']);
  });

  it('has LocoDeco\'s handles: two line ends, wall top and bottom, ladder foot and height, a post\'s eight', () => {
    const s = street();
    assert.deepEqual(geoHandles(s, 'platform', s.platforms[1]).map((h) => [h.id, h.x, h.y]), [['p1', 1000, 700], ['p2', 1200, 700]]);
    assert.deepEqual(geoHandles(s, 'barrier', s.barriers[0]).map((h) => [h.id, h.x, h.y]), [['top', 1400, 600], ['bottom', 1400, 940]]);
    assert.deepEqual(geoHandles(s, 'ladder', s.ladders[0]).map((h) => [h.id, h.x, h.y]), [['bottom', 500, 940], ['height', 500, 640]]);
    const post = geoHandles(s, 'signpost', s.signposts[0]);
    assert.equal(post.length, 8, 'eight handles, no rotation knob');
    assert.ok(!post.some((h) => h.id === 'rotate'));
    assert.deepEqual(handleWorld('barrier', s.barriers[0], 'bottom'), { x: 400, y: -60 });
    assert.deepEqual(handleWorld('ladder', s.ladders[0], 'height'), { x: -500, y: -360 });
  });

  it('drags a handle: a line end (Shift levels it), a wall end vertically, a ladder, a post from its foot', () => {
    const s = street();
    const p2 = s.platforms[1];
    assert.deepEqual(dragHandle(s, 'platform', p2, 'p2', { x: 1200, y: 700 }, { x: 1250, y: 680 }), { x2: 250, y2: -320 });
    assert.deepEqual(dragHandle(s, 'platform', p2, 'p2', { x: 1200, y: 700 }, { x: 1250, y: 680 }, { level: true }), { x2: 250, y2: -300 });
    assert.deepEqual(dragHandle(s, 'platform', p2, 'p1', { x: 1000, y: 700 }, { x: 990, y: 705 }), { x1: -10, y1: -295 });
    const w = s.barriers[0];
    assert.deepEqual(dragHandle(s, 'barrier', w, 'top', { x: 1400, y: 600 }, { x: 1450, y: 550 }), { y: -450, h: 390 }, 'the bottom stays; x never moves');
    assert.deepEqual(dragHandle(s, 'barrier', w, 'bottom', { x: 1400, y: 940 }, { x: 1400, y: 960 }), { h: 360 });
    assert.deepEqual(dragHandle(s, 'barrier', w, 'top', { x: 1400, y: 600 }, { x: 1400, y: 2000 }), { y: -68, h: 8 }, 'never shorter than 8');
    const l = s.ladders[0];
    assert.deepEqual(dragHandle(s, 'ladder', l, 'bottom', { x: 500, y: 940 }, { x: 520, y: 930 }), { x: -480, y: -70 });
    assert.deepEqual(dragHandle(s, 'ladder', l, 'height', { x: 500, y: 640 }, { x: 500, y: 600 }), { h: 340 });
    const post = s.signposts[0];
    assert.deepEqual(dragHandle(s, 'signpost', post, 'e', { x: 1875, y: 840 }, { x: 1895, y: 840 }), { x: 810, y: -60, w: 170, h: 200 });
    assert.deepEqual(dragHandle(s, 'signpost', post, 'n', { x: 1800, y: 740 }, { x: 1800, y: 720 }), { x: 800, y: -60, w: 150, h: 220 });
  });

  it('moves, and keeps only what changed', () => {
    const s = street();
    assert.deepEqual(moveBy('platform', s.platforms[1], 5, -5), { x1: 5, y1: -305, x2: 205, y2: -305 });
    assert.deepEqual(moveBy('signpost', s.signposts[0], -20, 0), { x: 780, y: -60 });
    assert.deepEqual(changedFields(s.platforms[1], { x1: 0, y1: -305, pc_perm: null }), { y1: -305, pc_perm: null });
  });

  it('draws new geometry from a drag: floors left to right, hard walls, ladders from the foot; too short is nothing', () => {
    const s = street();
    assert.deepEqual(drawnItem(s, 'platform', { x: 1300, y: 500 }, { x: 1100, y: 520 }), { x1: 100, y1: -480, x2: 300, y2: -500, pc_perm: -1, item_perm: -1 });
    assert.deepEqual(drawnItem(s, 'platform', { x: 1100, y: 500 }, { x: 1300, y: 520 }, { level: true }), { x1: 100, y1: -500, x2: 300, y2: -500, pc_perm: -1, item_perm: -1 });
    assert.equal(drawnItem(s, 'platform', { x: 1100, y: 500 }, { x: 1104, y: 503 }), null);
    assert.deepEqual(drawnItem(s, 'barrier', { x: 1100, y: 900 }, { x: 1130, y: 700 }), { x: 100, y: -300, h: 200, pc_perm: null });
    assert.deepEqual(drawnItem(s, 'ladder', { x: 1100, y: 940 }, { x: 1100, y: 640 }), { x: 100, y: -60, w: 50, h: 300 });
    assert.deepEqual(drawnItem(s, 'signpost', { x: 1100, y: 940 }, { x: 1200, y: 800 }), { x: 150, y: -60, w: 100, h: 140, connects: [] });
    assert.equal(drawnItem(s, 'signpost', { x: 1100, y: 940 }, { x: 1102, y: 941 }), null);
    // A click stands a post on the floor under it (Hechey Track's size).
    assert.deepEqual(postOnFloor(s, { x: 1100, y: 400 }), { x: 100, y: -60, w: 150, h: 200, connects: [] }, 'through the roof over it, onto the floor');
    assert.deepEqual(postOnFloor(s, { x: 1100, y: 800 }), { x: 100, y: -60, w: 150, h: 200, connects: [] });
    assert.deepEqual(defaultItem(s, 'platform', { x: 300, y: 800 }), { x1: -800, y1: -180, x2: -600, y2: -180, pc_perm: -1, item_perm: -1 });
    assert.deepEqual(defaultItem(s, 'ladder', { x: 300, y: 800 }), { x: -700, y: -60, w: 50, h: 300 });
  });

  it('names perms as LocoDeco did, for lines and for walls', () => {
    assert.deepEqual(PERMS.map((p) => p.label), ['Floor', 'Roof', 'Soft', 'Hard']);
    for (const v of [-1, 1, 0, null]) assert.equal(permValue(permKey(v)), v);
    assert.equal(permKey(undefined), '');
    assert.equal(permValue(''), undefined);
    assert.equal(permName(undefined), 'Floor', 'a line without a perm stands');
    assert.equal(permName(null), 'Hard');
    assert.deepEqual(wallSides(null), { left: true, right: true });
    assert.deepEqual(wallSides(-1), { left: true, right: false });
    assert.deepEqual(wallSides(1), { left: false, right: true });
    assert.deepEqual(wallSides(0), { left: false, right: false });
  });

  it('dashes a line for the Soft overlay', () => {
    assert.deepEqual(dashes(0, 0, 30, 0, 8, 6), [[0, 0, 8, 0], [14, 0, 22, 0], [28, 0, 30, 0]]);
    assert.deepEqual(dashes(0, 0, 0, 0), []);
  });

  it('works out an arm\'s arrival as build-street-navigation.mjs does: the post that links back, on its floor', () => {
    const z = fixture();
    const [lane, end] = z.streets.map((r) => r.street);
    // The fixture's own arrive values are what the navigation build writes.
    assert.deepEqual(arriveFor(end, lane.tsid), lane.signposts[0].connects[0].arrive);
    assert.deepEqual(arriveFor(lane, end.tsid), end.signposts[0].connects[0].arrive);
    assert.equal(arriveFor(end, 'GZ9999999999999'), null, 'no post links back: no arrival');
    // An L form names the same street as its G form.
    const shipped = { bounds: { l: 0, r: 1000, t: -1000, b: 0 }, platforms: [{ x1: 0, y1: -40, x2: 1000, y2: -40 }], signposts: [{ x: 500, y: -100, connects: [{ tsid: 'LABCDEF123456', label: 'Back' }] }] };
    assert.deepEqual(arriveFor(shipped, 'GABCDEF123456'), { x: 500, y: 960 });
    // No floor within 80 px of the post: left out.
    shipped.platforms[0].y1 = shipped.platforms[0].y2 = -300;
    assert.equal(arriveFor(shipped, 'GABCDEF123456'), null);
    assert.deepEqual(newConnect({ tsid: 'GZ0000000000002', label: 'Hollow End', hubId: '900', arrive: { x: 150.4, y: 940 } }), { tsid: 'GZ0000000000002', label: 'Hollow End', hub_id: '900', arrive: { x: 150, y: 940 } });
    assert.deepEqual(newConnect({ tsid: 'GA1', label: 'x'.repeat(60), hubId: undefined }), { tsid: 'GA1', label: 'x'.repeat(48) });
  });
});

describe('snapping (js/builder/snap.js)', () => {
  const street = () => ({
    bounds: { l: -1000, r: 1000, t: -1000, b: 0 },
    platforms: [
      { id: 'a', x1: -500, y1: -100, x2: 0, y2: -100 },
      { id: 'b', x1: 0, y1: -100, x2: 300, y2: -200, pc_perm: -1 },
      { id: 'roof', x1: -500, y1: -400, x2: 500, y2: -400, pc_perm: 1 },
    ],
    barriers: [{ id: 'w', x: 300, y: -500, h: 300, pc_perm: null }],
  });

  it('a grid of 10 px', () => {
    assert.equal(gridSnap(14), 10);
    assert.equal(gridSnap(-16), -20);
    assert.deepEqual(snapPoint({ x: 14, y: 26 }, { grid: true }), { x: 10, y: 30 });
  });

  it('ends: platform ends and wall tops and bottoms, the dragged ones left out', () => {
    const ends = endPoints(street(), new Set(['platform:b']));
    assert.deepEqual(ends.map((e) => `${e.id}.${e.end}`), ['a.p1', 'a.p2', 'roof.p1', 'roof.p2', 'w.top', 'w.bottom']);
    assert.deepEqual(nearestEnd({ x: 290, y: -190 }, endPoints(street()), 30), { kind: 'platform', id: 'b', end: 'p2', x: 300, y: -200 });
    assert.equal(nearestEnd({ x: 400, y: -100 }, endPoints(street()), 30), null);
    assert.deepEqual(joinedEnds(street(), { x: 0, y: -100 }).map((e) => `${e.id}.${e.end}`), ['a.p2', 'b.p1']);
    assert.deepEqual(joinedEnds(street(), { x: 0, y: -100 }, new Set(['platform:a'])).map((e) => `${e.id}.${e.end}`), ['b.p1']);
  });

  it('on release a line end snaps within 30 px; a moved line shifts by its nearest end', () => {
    const s = street();
    const ends = endPoints(s, new Set(['platform:b']));
    // b's far end dragged near the wall's bottom (300, -200).
    assert.deepEqual(snapPlatform({ ...s.platforms[1], x2: 320, y2: -210 }, ends, ['p2']), { x2: 300, y2: -200 });
    assert.deepEqual(snapPlatform({ ...s.platforms[1], x2: 360, y2: -210 }, ends, ['p2']), {}, 'too far');
    // A whole line moved: the nearer of its two pulls wins.
    assert.deepEqual(snapPlatform({ x1: 10, y1: -95, x2: 310, y2: -195 }, ends), { x1: 0, y1: -100, x2: 300, y2: -200 });
    assert.deepEqual(bestPull([{ x: 5, y: 0 }], [{ x: 0, y: 0 }, { x: 9, y: 0 }]), { dx: 4, dy: 0 });
    assert.deepEqual(snapDrawnPlatform({ x1: -520, y1: -110, x2: -300, y2: -300 }, endPoints(s)), { x1: -500, y1: -100, x2: -300, y2: -300 });
  });

  it('guides pull a value within their radius, on their axis only', () => {
    const guides = [{ axis: 'x', at: 100 }, { axis: 'y', at: -50 }];
    assert.equal(guideSnap(104, guides, 'x', 8), 100);
    assert.equal(guideSnap(110, guides, 'x', 8), 110);
    assert.equal(guideSnap(104, guides, 'y', 8), 104);
    assert.deepEqual(snapPoint({ x: 97, y: -55 }, { guides, radius: 8 }), { x: 100, y: -50 });
  });

  it('a middleground deco sits on the floor under it, never on a roof', () => {
    const s = street();
    assert.equal(floorSnapY(s, -200, -90), -100);
    assert.equal(floorSnapY(s, 150, -140), -150, 'a sloped line at x');
    assert.equal(floorSnapY(s, -200, -390), null, 'the roof is no floor');
    assert.equal(floorSnapY(s, -200, -200), null, 'too far');
  });

  it('ruler ticks: round steps at least 64 canvas px apart', () => {
    assert.deepEqual(rulerTicks(-1000, 400, 1), { step: 100, ticks: [-1000, -900, -800, -700, -600] });
    assert.equal(rulerTicks(0, 5000, 0.1).step, 1000);
    assert.equal(rulerTicks(0, 100, 4).step, 20);
  });
});

describe('the editor\'s P2 helpers (js/builder/editor.js)', () => {
  it('overlay switches: stored values over the defaults, nothing odd', () => {
    assert.deepEqual(readOverlays(null), { ...OVERLAY_DEFAULTS });
    assert.deepEqual(readOverlays({ reach: true, geometry: 'yes', extra: true }), { ...OVERLAY_DEFAULTS, reach: true });
    assert.deepEqual(VIEW_FRAMES.map((f) => [f.w, f.h]), [[960, 408], [1000, 600]]);
  });

  it('the layout preview\'s camera: a Wide view at the centre, kept inside the street', () => {
    const wide = VIEW_FRAMES[0];
    assert.deepEqual(layoutCamera({ x: 3000, y: 500 }, wide, 6000, 1000), { x: 2520, y: 296 });
    assert.deepEqual(layoutCamera({ x: 100, y: 990 }, wide, 6000, 1000), { x: 0, y: 592 });
    assert.deepEqual(layoutCamera({ x: 500, y: 500 }, wide, 800, 300), { x: 0, y: 0 });
  });

  it('pans at the view edge while dragging, faster nearer it', () => {
    assert.deepEqual(edgePan(500, 400, 1000, 800), { dx: 0, dy: 0 });
    assert.deepEqual(edgePan(0, 400, 1000, 800), { dx: -14, dy: 0 });
    assert.deepEqual(edgePan(984, 800, 1000, 800), { dx: 7, dy: 14 });
  });

  it('the Validate button and the findings panel', () => {
    const report = { ok: false, counts: { fatal: 1, error: 1, warn: 2, info: 3 }, findings: [
      { rule: 'NAV-001', severity: 'warn', at: 'lane/signpost_1', message: 'a' },
      { rule: 'PHY-001', severity: 'error', at: 'lane', message: 'b' },
      { rule: 'X', severity: 'fatal', message: 'c' },
    ] };
    assert.deepEqual(findingCounts(report), { errors: 2, warnings: 2, notes: 3 });
    assert.equal(validateWords('done', report), 'Validate: 2 errors, 2 warnings');
    assert.equal(validateWords('done', { counts: { warn: 1 } }), 'Validate: 0 errors, 1 warning');
    assert.equal(validateWords('idle', null), 'Validate');
    assert.equal(validateWords('off', null), 'Validate: not available');
    assert.equal(validateWords('running', report), 'Validate: checking');
    assert.deepEqual(groupFindings(report.findings).map((g) => [g.id, g.items.length]), [['fatal', 1], ['error', 1], ['warn', 1]]);
    assert.deepEqual(parseAt('lane/signpost_1'), { street: 'lane', id: 'signpost_1' });
    assert.deepEqual(parseAt('lane'), { street: 'lane', id: '' });
    const s = { bounds: { l: -1500, t: -1000 } };
    assert.deepEqual(findingPoint({ where: { x: 0, y: -60, space: 'world' } }, s), { x: 1500, y: 940 });
    assert.deepEqual(findingPoint({ where: { x: 10, y: 20, space: 'screen' } }, s), { x: 10, y: 20 });
    assert.equal(findingPoint({}, s), null);
  });

  it('layer filters: a zero drops the key, an empty set is no filters, the file\'s order kept', () => {
    assert.deepEqual(filtersWith({ brightness: -20, saturation: -19, contrast: -23 }, 'saturation', 0), { brightness: -20, contrast: -23 });
    assert.deepEqual(filtersWith({ contrast: 5 }, 'brightness', 10), { contrast: 5, brightness: 10 });
    assert.equal(filtersWith({ brightness: -10 }, 'brightness', 0), null);
    assert.equal(filtersWith(null, 'blur', 0), null);
    assert.deepEqual(filtersWith({ tintAmount: 40 }, 'tintColor', 0), { tintAmount: 40, tintColor: 0 }, 'black is a tint colour');
    assert.equal(colourInput('D1F4FF'), '#d1f4ff');
    assert.equal(colourHex('#d1f4ff'), 'D1F4FF');
    assert.equal(tintInput(0x9f3dd4), '#9f3dd4');
    assert.equal(tintNumber('#33cccc'), 0x33cccc);
  });

  it('the editor loads the reach module and the validator worker only when asked (spec 6.7, 7.1)', () => {
    const src = read('public/js/builder/editor.js');
    assert.match(src, /import\('\.\/reach-graph\.js\?v=[0-9a-f]{8}'\)/);
    // The worker's URL comes from the keyed module itself (validate-worker.js WORKER_URL).
    assert.match(src, /import\('\.\/validate-worker\.js\?v=[0-9a-f]{8}'\)\.then\(\(m\) => \{ V\.workerUrl = m\.WORKER_URL;/);
    assert.match(src, /new Worker\(V\.workerUrl, \{ type: 'module' \}\)/);
    assert.doesNotMatch(src, /^import [^;]*reach-graph/m, 'never a static import: the editor works without it');
  });
});
