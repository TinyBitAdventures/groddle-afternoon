/**
 * Play links on /restoration/ and the practice mode they open
 * (public/js/practice-mode.js): every playable system, built quest room and
 * designer level has a link, each link opens /play/ in practice mode with no
 * screenshot-only parameters, and practice mode never writes the real save.
 * Run: node --test tests/restoration-play.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { CHECKLIST } from '../tools/restoration/checklist.mjs';
import { NO_PLAY, PLAY_ROUTES, playFor, playRoute } from '../tools/restoration/play-links.mjs';
import { DESIGNER_LEVELS, TEXT_LEVELS, DESIGNERS } from '../tools/restoration/designer-levels.mjs';
import { SHOTS } from '../tools/restoration/shots.mjs';
import { BUILT_ROOMS } from '../public/js/quest-rooms/catalog.js';
import { PARADISE_COURSES } from '../public/js/paradise-flight.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));

const params = (href) => new URLSearchParams(href.split('?')[1]);
function assertPlayHref(href, label) {
  assert.ok(href.startsWith('../play/?'), `${label}: ${href}`);
  const p = params(href);
  assert.equal(p.get('practice'), '1', `${label} must open in practice mode`);
  assert.equal(p.get('autostart'), '1', label);
  for (const key of p.keys()) assert.ok(!/autoplay$|preview$|hold$|fx$/.test(key), `${label}: camera-only ${key}`);
}

describe('restoration play links', () => {
  it('give every playable system a practice link, and lost ones none', () => {
    for (const item of CHECKLIST) {
      const href = item.status === 'lost' ? null : playFor(item.id);
      if (item.status === 'lost' || NO_PLAY.has(item.id)) {
        assert.equal(href, null, item.id);
        continue;
      }
      assert.ok(href, `${item.id} has no play link: add a SHOTS route or PLAY_ROUTES entry`);
      assertPlayHref(href, item.id);
    }
    for (const id of Object.keys(PLAY_ROUTES)) assert.ok(CHECKLIST.some((it) => it.id === id), `PLAY_ROUTES ${id} is not a checklist item`);
  });

  it('give every built quest room a practice link', () => {
    for (const room of BUILT_ROOMS) assertPlayHref(playFor(`room:${room}`) || '', `room:${room}`);
  });

  it('strip screenshot-only parameters from capture routes', () => {
    const route = playRoute('?autostart=1&questdemo=x&questautoplay=solve1&rookfx=hold&paradisepreview=moon&questfx=0&cameralook=1,2&keep=hold');
    assert.equal(route, '?autostart=1&questdemo=x');
  });

  it('point designer levels at real courses, quests and screenshot routes', () => {
    const designerIds = new Set(DESIGNERS.map((d) => d.id));
    for (const level of [...DESIGNER_LEVELS, ...TEXT_LEVELS]) {
      if (level.designer) assert.ok(designerIds.has(level.designer), level.id);
      assert.ok(SHOTS[level.shot], `${level.id}: no screenshot route ${level.shot}`);
      const p = params(level.route);
      if (p.get('paradise')) assert.ok(PARADISE_COURSES[p.get('paradise')] || p.get('paradise'), level.id);
      const quest = p.get('questdemo');
      if (quest && !['winter', 'greedy'].includes(quest)) assert.ok(quests[quest], `${level.id}: unknown quest ${quest}`);
      if (level.designer) assert.match(level.video, /^[\w-]{11}$/, level.id);
    }
  });
});

describe('practice mode', () => {
  const html = readFileSync(join(root, 'public/play/index.html'), 'utf8');
  const source = readFileSync(join(root, 'public/js/practice-mode.js'), 'utf8');

  it('loads before any game module', () => {
    const practice = html.indexOf('js/practice-mode.js');
    const firstModule = html.indexOf('type="module"');
    assert.ok(practice > 0 && practice < firstModule, 'practice-mode.js must come before the module scripts');
  });

  const memoryStorage = (seed = {}) => {
    const map = new Map(Object.entries(seed));
    return {
      map,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      key: (i) => [...map.keys()][i] ?? null,
      get length() { return map.size; },
    };
  };
  const run = (search, real, tab) => {
    const window = { location: { search }, localStorage: real, sessionStorage: tab };
    const document = { documentElement: { dataset: {} }, body: null, getElementById: () => null, addEventListener() {} };
    vm.runInNewContext(source, { window, document, URLSearchParams });
    return window;
  };

  it('routes every write away from the real save and reads the look through', () => {
    const real = memoryStorage({ groddle_player_state_v1: 'REAL', 'groddle.avatar.appearance.v1': 'LOOK' });
    const tab = memoryStorage();
    const w = run('?practice=1&resetgame=1', real, tab);
    assert.notEqual(w.localStorage, real);
    assert.equal(w.localStorage.getItem('groddle_player_state_v1'), null, 'practice starts without the real save');
    assert.equal(w.localStorage.getItem('groddle.avatar.appearance.v1'), 'LOOK', 'the avatar look reads through');
    w.localStorage.setItem('groddle_player_state_v1', 'PRACTICE');
    w.localStorage.removeItem('groddle.avatar.appearance.v1');
    w.localStorage.clear();
    assert.equal(real.getItem('groddle_player_state_v1'), 'REAL');
    assert.equal(real.getItem('groddle.avatar.appearance.v1'), 'LOOK');
  });

  it('leaves storage alone without practice=1', () => {
    const real = memoryStorage();
    const w = run('?autostart=1', real, memoryStorage());
    assert.equal(w.localStorage, real);
  });
});
