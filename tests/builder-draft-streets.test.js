/**
 * LEVEL BUILDER P0 (spec 6.8, section 14): the play-test seam in js/street-loader.js
 * (registerDraftStreets: a primed draft street loads without a fetch, and survives an index load)
 * and practice mode taking ?draft= as a practice copy.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  STREET_INDEX, applyStreetIndex, availableStreetTsids, clearStreetCache, clearStreetIndex, isDraftStreet,
  loadStreetData, registerDraftStreets, resolveIndexTsid,
} from '../public/js/street-loader.js?v=d6cbbd5c';

const root = join(import.meta.dirname, '..');
const zone = JSON.parse(readFileSync(join(root, 'tests/fixtures/builder/mossy-hollow.zone.json'), 'utf8'));
const lane = zone.streets[0].street;

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

describe('registerDraftStreets (js/street-loader.js)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    clearStreetIndex();
    clearStreetCache();
  });

  it('a primed draft street loads without a fetch, joins the index and resolves', async () => {
    applyStreetIndex({ default: 'GLI2V0UN7RD1T2J', streets: { GLI2V0UN7RD1T2J: { label: 'Hechey Track', file: 'assets/streets/GLI2V0UN7RD1T2J.json' }, A: {}, B: {} } });
    const fetched = [];
    globalThis.fetch = async (url) => { fetched.push(String(url)); throw new Error('no fetch for a draft'); };
    assert.deepEqual(registerDraftStreets({ [lane.tsid]: { label: 'Mossy Lane', hubId: '900', hubName: 'Mossy Hollow', file: 'x.json' } }, { [lane.tsid]: lane }), [lane.tsid]);
    assert.equal(isDraftStreet(lane.tsid), true);
    assert.equal(resolveIndexTsid(lane.tsid), lane.tsid);
    assert.ok(availableStreetTsids().includes(lane.tsid), 'signposts to it are live (pickConnection)');
    assert.equal(STREET_INDEX.streets[lane.tsid].file, undefined, 'a draft row never names a file');
    const data = await loadStreetData(lane.tsid);
    assert.deepEqual(fetched, []);
    assert.equal(data.label, 'Mossy Lane');
    assert.equal(data.hubName, 'Mossy Hollow');
    assert.notEqual(data, lane, 'a copy: the caller\'s zone is never changed');
    data.label = 'changed';
    assert.equal(lane.label, 'Mossy Lane');
  });

  it('survives a later index load and a cleared cache', async () => {
    registerDraftStreets({}, { [lane.tsid]: lane });
    applyStreetIndex({ default: 'GLI2V0UN7RD1T2J', streets: { GLI2V0UN7RD1T2J: { label: 'Hechey Track', file: 'f' } } });
    assert.ok(lane.tsid in STREET_INDEX.streets);
    clearStreetCache();
    globalThis.fetch = async () => { throw new Error('no fetch for a draft'); };
    const data = await loadStreetData(lane.tsid);
    assert.equal(data.tsid, lane.tsid);
  });

  it('checks the geometry as a loaded file is checked', () => {
    assert.throws(() => registerDraftStreets({}, { GZBROKEN000000X: { ...lane, platforms: [] } }));
  });

  it('drops hidden connects as a loaded file does', () => {
    const street = structuredClone(lane);
    street.signposts.push({ id: 'signpost_9', x: 0, y: -60, w: 100, h: 200, connects: [{ tsid: 'GLI2V0UN7RD1T2J', label: 'Hechey Track', hidden: true }] });
    registerDraftStreets({}, { [street.tsid]: street });
    return loadStreetData(street.tsid).then((d) => assert.equal(d.signposts.length, lane.signposts.length));
  });
});

describe('practice mode takes ?draft= as a practice copy (js/practice-mode.js)', () => {
  const source = readFileSync(join(root, 'public/js/practice-mode.js'), 'utf8');
  const run = (search, extra = {}) => {
    const real = memoryStorage();
    const window = { location: { search }, localStorage: real, sessionStorage: memoryStorage(), ...extra };
    const document = { documentElement: { dataset: {} }, body: null, getElementById: () => null, addEventListener() {} };
    vm.runInNewContext(source, { window, document, URLSearchParams });
    return { window, real, document };
  };

  it('draft implies practice: writes go to the per-tab copy', () => {
    const { window, real, document } = run('?autostart=1&draft=mossy-hollow&street=lane');
    assert.equal(window.groddlePractice, true);
    assert.equal(document.documentElement.dataset.practice, '1');
    window.localStorage.setItem('groddle.location', 'GZ0000000000001');
    assert.equal(real.getItem('groddle.location'), null, 'the real save never records a draft street');
  });

  it('never on a multiplayer page, and plain links are left alone', () => {
    assert.equal(run('?draft=mossy-hollow', { GRODDLE_MODE: 'multiplayer' }).window.groddlePractice, undefined);
    assert.equal(run('?autostart=1').window.groddlePractice, undefined);
  });
});
