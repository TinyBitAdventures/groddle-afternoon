/**
 * The interface switch (public/js/classic/ui-mode.js, classic-prefs.js;
 * classic-spec build-plan §2): ?ui= (solo only), localStorage['groddle.ui'] in
 * try/catch, Modern by default and under 960 x 540, the early apply from
 * game.js, the runtime change event, the Menu item and `,` for Preferences.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveUiMode, createUiMode, UI_STORAGE_KEY, UI_SIZE_KEY, UI_MODE_EVENT } from '../public/js/classic/ui-mode.js?v=587c014a';
import { interfaceMenuLabel, isPreferencesKey, PREFS_TITLE } from '../public/js/classic/classic-prefs.js?v=0694e27a';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
const brokenStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

function fakeWindow({ search = '', w = 1440, h = 900, online = false } = {}) {
  const handlers = new Map();
  const events = [];
  class Event { constructor(type) { this.type = type; } }
  class CustomEvent extends Event { constructor(type, o = {}) { super(type); this.detail = o.detail; } }
  return {
    innerWidth: w,
    innerHeight: h,
    location: { search },
    GRODDLE_MODE: online ? 'multiplayer' : undefined,
    Event,
    CustomEvent,
    events,
    addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
    dispatchEvent(ev) { events.push(ev); for (const fn of handlers.get(ev.type) || []) fn(ev); return true; },
  };
}
const fakeDoc = () => ({ documentElement: { dataset: {} } });

describe('Classic switch: which skin shows', () => {
  it('Modern by default', () => {
    assert.deepEqual(resolveUiMode({}), { mode: 'modern', pref: 'modern', source: 'default', forced: false });
  });

  it('?ui= wins over storage, solo only', () => {
    assert.equal(resolveUiMode({ search: '?ui=classic', stored: 'modern' }).mode, 'classic');
    assert.equal(resolveUiMode({ search: '?ui=classic', stored: 'modern' }).source, 'url');
    assert.equal(resolveUiMode({ search: '?autostart=1&ui=modern', stored: 'classic' }).mode, 'modern');
    assert.equal(resolveUiMode({ search: '?ui=classic', stored: null, online: true }).mode, 'modern', 'never online');
    assert.equal(resolveUiMode({ search: '?ui=classic', stored: 'classic', online: true }).source, 'storage');
  });

  it('storage, and junk falls through', () => {
    assert.equal(resolveUiMode({ stored: 'classic' }).mode, 'classic');
    assert.equal(resolveUiMode({ stored: 'Glossy' }).mode, 'modern');
    assert.equal(resolveUiMode({ search: '?ui=retro', stored: 'classic' }).source, 'storage');
  });

  it('desktop only: Modern shows under 960 x 540, the choice is kept', () => {
    const r = resolveUiMode({ stored: 'classic', width: 959, height: 800 });
    assert.deepEqual([r.mode, r.pref, r.forced], ['modern', 'classic', true]);
    assert.equal(resolveUiMode({ stored: 'classic', width: 1280, height: 539 }).mode, 'modern');
    assert.equal(resolveUiMode({ stored: 'classic', width: 960, height: 540 }).mode, 'classic');
  });
});

describe('Classic switch: the controller', () => {
  it('applies data-ui, data-ui-pref and data-ui-size at once (the early apply)', () => {
    const doc = fakeDoc();
    createUiMode({ win: fakeWindow({ search: '?ui=classic' }), doc, storage: memoryStorage() });
    assert.equal(doc.documentElement.dataset.ui, 'classic');
    assert.equal(doc.documentElement.dataset.uiPref, 'classic');
    assert.equal(doc.documentElement.dataset.uiSize, 'fill');
    const plain = fakeDoc();
    createUiMode({ win: fakeWindow(), doc: plain, storage: memoryStorage() });
    assert.equal(plain.documentElement.dataset.ui, 'modern', 'modern is written, so [data-ui="modern"] rules hold');
  });

  it('the URL flag never touches the saved choice; a pick saves and drops the flag', () => {
    const storage = memoryStorage();
    const doc = fakeDoc();
    const ui = createUiMode({ win: fakeWindow({ search: '?ui=classic' }), doc, storage });
    assert.equal(storage.getItem(UI_STORAGE_KEY), null);
    ui.setMode('modern');
    assert.equal(storage.getItem(UI_STORAGE_KEY), 'modern');
    assert.equal(ui.mode(), 'modern');
    assert.equal(doc.documentElement.dataset.ui, 'modern');
    ui.setMode('nonsense');
    assert.equal(ui.mode(), 'modern');
  });

  it('a change tells listeners, fires the window event and a resize', () => {
    const win = fakeWindow();
    const ui = createUiMode({ win, doc: fakeDoc(), storage: memoryStorage() });
    const seen = [];
    const off = ui.onChange((now, before) => seen.push(`${before.mode}->${now.mode}`));
    ui.setMode('classic');
    assert.deepEqual(seen, ['modern->classic']);
    assert.deepEqual(win.events.map((e) => e.type), [UI_MODE_EVENT, 'resize']);
    assert.equal(win.events[0].detail.mode, 'classic');
    ui.setMode('classic');
    assert.equal(seen.length, 1, 'no event without a change');
    off();
    ui.setMode('modern');
    assert.equal(seen.length, 1);
  });

  it('Original window size is saved and shown as data-ui-size', () => {
    const storage = memoryStorage({ [UI_STORAGE_KEY]: 'classic' });
    const doc = fakeDoc();
    const ui = createUiMode({ win: fakeWindow(), doc, storage });
    ui.setSize('original');
    assert.equal(storage.getItem(UI_SIZE_KEY), 'original');
    assert.equal(doc.documentElement.dataset.uiSize, 'original');
    assert.equal(ui.state().size, 'original');
    ui.setSize('huge');
    assert.equal(ui.state().size, 'original');
  });

  it('storage that throws (private windows) still works for the page', () => {
    const doc = fakeDoc();
    const ui = createUiMode({ win: fakeWindow(), doc, storage: brokenStorage });
    assert.equal(ui.mode(), 'modern');
    assert.doesNotThrow(() => ui.setMode('classic'));
    assert.equal(ui.mode(), 'modern', 'nothing saved, so the default holds');
  });

  it('a window shrinking under the floor shows Modern and growing back brings Classic', async () => {
    const win = fakeWindow({ w: 1440, h: 900 });
    const doc = fakeDoc();
    const ui = createUiMode({ win, doc, storage: memoryStorage({ [UI_STORAGE_KEY]: 'classic' }) });
    assert.equal(doc.documentElement.dataset.ui, 'classic');
    win.innerWidth = 800;
    win.dispatchEvent(new win.Event('resize'));
    assert.equal(doc.documentElement.dataset.ui, 'modern');
    assert.equal(doc.documentElement.dataset.uiForced, 'small-window');
    await new Promise((r) => queueMicrotask(r));
    assert.ok(win.events.some((e) => e.type === UI_MODE_EVENT), 'listeners hear the flip');
    win.innerWidth = 1440;
    win.dispatchEvent(new win.Event('resize'));
    assert.equal(doc.documentElement.dataset.ui, 'classic');
    assert.equal(doc.documentElement.dataset.uiForced, undefined);
    assert.equal(ui.state().pref, 'classic');
  });
});

describe('Classic switch: Menu item and Preferences', () => {
  it('the Menu offers the other skin, by its plain name', () => {
    assert.equal(interfaceMenuLabel('modern').label, 'Interface: Classic');
    assert.equal(interfaceMenuLabel('classic').label, 'Interface: Modern');
    assert.equal(PREFS_TITLE, 'Preferences');
  });

  it('`,` opens Preferences; Cmd+, and Ctrl+, stay the browser\'s', () => {
    assert.equal(isPreferencesKey({ key: ',' }), true);
    assert.equal(isPreferencesKey({ key: ',', metaKey: true }), false);
    assert.equal(isPreferencesKey({ key: ',', ctrlKey: true }), false);
    assert.equal(isPreferencesKey({ key: '<', code: 'Comma', shiftKey: true }), false);
    assert.equal(isPreferencesKey({ key: '.' }), false);
  });

  it('game.js imports the switch (it applies as it loads, before main) and installs it after the Menu', () => {
    const src = read('public/game.js');
    assert.match(src, /\nimport \{ installInterfaceSettings \} from '\.\/js\/classic\/classic-prefs\.js\?v=[0-9a-f]{8}';/);
    assert.ok(src.indexOf('classic-prefs.js') < src.indexOf('async function main('), 'a static import, evaluated before the body');
    assert.match(read('public/js/classic/classic-prefs.js'), /from '\.\/ui-mode\.js\?v=[0-9a-f]{8}'/);
    const more = src.indexOf('  installMoreMenu();');
    const mine = src.indexOf('  installInterfaceSettings(');
    const boot = src.indexOf('const endBoot = ');
    assert.ok(more > 0 && mine > more && boot > mine, 'after the Menu, before the boot cover lifts');
  });

  it('player copy: no brand name, no em-dashes', () => {
    for (const f of ['public/js/classic/ui-mode.js', 'public/js/classic/classic-prefs.js', 'public/js/classic/classic-layout.js']) {
      const src = read(f);
      assert.doesNotMatch(src, /glitch/i, f);
      assert.doesNotMatch(src, /—/, f);
    }
  });

  it('every importer of ui-mode.js uses one cache key (two keys would be two switches)', async () => {
    const { readdirSync } = await import('node:fs');
    const files = ['public/game.js', ...readdirSync(join(root, 'public/js'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`)];
    const keys = new Set();
    for (const f of files) for (const m of read(f).matchAll(/ui-mode\.js\?v=([\w-]+)'/g)) keys.add(m[1]);
    assert.equal(keys.size, 1, [...keys].join(', '));
  });
});
