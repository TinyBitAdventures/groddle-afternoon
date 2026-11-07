/**
 * The restoration walkthrough (/restoration/) stays in sync with the code:
 * checklist evidence exists, every diorama spot has an item, and
 * public/restoration/data.json matches what tools/build-restoration.mjs
 * computes now. When this fails after landing work, update
 * tools/restoration/checklist.mjs and run node tools/build-restoration.mjs.
 * Run: node --test tests/restoration.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKLIST, GROUPS, STATUS } from '../tools/restoration/checklist.mjs';
import { SHOTS } from '../tools/restoration/shots.mjs';
import { buildRestorationData, comparable, commitKind, dayActivity, historyLog, releaseInfo, soundStats } from '../tools/build-restoration.mjs';
import * as heat from '../public/restoration/history/heatmap.js?v=bb1775c2';
import { execFileSync } from 'node:child_process';
import { QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js?v=f9091020';
import { ROOM_NOTES } from '../tools/restoration/rooms.mjs';
import { DESIGNER_LEVELS, TEXT_LEVELS } from '../tools/restoration/designer-levels.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYABLE = new Set(['source', 'rebuilt', 'reimagined', 'solo']);

describe('restoration checklist', () => {
  it('uses known statuses and groups, and unique ids', () => {
    const ids = new Set();
    for (const item of CHECKLIST) {
      assert.ok(STATUS[item.status], `${item.id}: ${item.status}`);
      assert.ok(GROUPS.some((g) => g.id === item.group), `${item.id}: ${item.group}`);
      assert.ok(!ids.has(item.id), `duplicate ${item.id}`);
      ids.add(item.id);
      assert.ok(item.blurb && item.name, item.id);
    }
  });

  it('every playable item points at files that exist', () => {
    for (const item of CHECKLIST.filter((i) => PLAYABLE.has(i.status))) {
      assert.ok(item.evidence.length, `${item.id} needs evidence`);
      for (const p of item.evidence) assert.ok(existsSync(join(root, p)), `${item.id}: ${p}`);
    }
  });

  it('says in one sentence what works between real players, only on systems that are back (G324)', async () => {
    const mp = CHECKLIST.filter((i) => i.multiplayer != null);
    assert.ok(mp.length >= 10, `${mp.length} multiplayer items`);
    for (const item of mp) {
      assert.equal(typeof item.multiplayer, 'string', item.id);
      assert.ok(item.multiplayer.length > 20 && /\.$/.test(item.multiplayer), `${item.id}: one sentence`);
      assert.ok(!/—/.test(item.multiplayer), `${item.id}: no em-dashes`);
      assert.ok(PLAYABLE.has(item.status), `${item.id} is ${item.status}`);
    }
    const data = await buildRestorationData();
    assert.equal(data.multiplayer, mp.length);
    assert.deepEqual(data.items.filter((i) => i.multiplayer).map((i) => i.id), mp.map((i) => i.id));
  });

  it('every diorama spot on the page opens a checklist item', () => {
    const html = readFileSync(join(root, 'public/restoration/index.html'), 'utf8');
    const spots = new Set([...html.matchAll(/data-spot="([^"]+)"/g)].map((m) => m[1]));
    assert.ok(spots.size >= 12);
    for (const spot of spots) assert.ok(CHECKLIST.some((i) => i.spot === spot), spot);
  });

  it('screenshot keys name checklist items, quest rooms or designer levels', () => {
    const rooms = new Set(Object.values(QUEST_ROOMS));
    const levels = new Set([...DESIGNER_LEVELS, ...TEXT_LEVELS].map((l) => l.shot));
    for (const key of Object.keys(SHOTS)) {
      if (key.startsWith('room:')) assert.ok(rooms.has(key.slice(5)), key);
      else if (key.startsWith('level:')) assert.ok(levels.has(key), key);
      else assert.ok(CHECKLIST.some((i) => i.id === key), key);
    }
  });
});

describe('quest room explainers', () => {
  it('every room has a complete explainer', () => {
    for (const room of new Set(Object.values(QUEST_ROOMS))) {
      const note = ROOM_NOTES[room];
      assert.ok(note, `${room} needs an entry in tools/restoration/rooms.mjs`);
      for (const field of ['tagline', 'about', 'play', 'source', 'rebuilt']) assert.ok(note[field], `${room}.${field}`);
      for (const f of note.footage) assert.match(f.id, /^[\w-]{11}$/, `${room} footage id`);
    }
    for (const id of Object.keys(ROOM_NOTES)) assert.ok(Object.values(QUEST_ROOMS).includes(id), `stale note ${id}`);
  });
});

describe('restoration data', () => {
  it('public/restoration/data.json is current (run node tools/build-restoration.mjs)', async () => {
    const file = JSON.parse(readFileSync(join(root, 'public/restoration/data.json'), 'utf8'));
    const now = await buildRestorationData();
    assert.equal(comparable(file), comparable(now));
  });

  it('lists every quest room', async () => {
    const data = await buildRestorationData();
    assert.equal(data.rooms.total, new Set(Object.values(QUEST_ROOMS)).size);
    assert.ok(data.quests.playable > 100);
  });

  it('every room card shows a name, never its code id (firefly_whistle, 2026-10-29)', async () => {
    const data = await buildRestorationData();
    for (const room of data.rooms.rooms) {
      assert.notEqual(room.title, room.id, `${room.id} shows its code name`);
      assert.doesNotMatch(room.title, /^[a-z0-9]+(?:_[a-z0-9]+)+$/, `${room.id}: ${room.title}`);
    }
    const firefly = data.rooms.rooms.find((r) => r.id === 'firefly_whistle');
    assert.equal(firefly?.title, 'Firefly Whistle', "GSJS quests/firefly_whistle.js title");
  });
});

describe('sound and release numbers', () => {
  it('the Music tracks tile names a source for every playable sound key (Sounds.zip included)', () => {
    const s = soundStats();
    const keys = JSON.parse(readFileSync(join(root, 'public/assets/content/sound-keys.json'), 'utf8')).keys;
    assert.equal(s.soundsZip, Object.values(keys).filter((r) => r.file && r.origin === 'sounds-zip').length);
    assert.ok(s.soundsZip > 100, 'the Sounds.zip keys are counted');
    assert.equal(s.soundsZip + s.archiveorgSfx + s.recoveredWayback + s.downloadsBestFit + s.otherFiles + s.aliases, s.playable);
    assert.ok(s.playable <= s.keys);
    // Each distinct music recording once: three files of the Groddle Forest theme are one.
    assert.ok(s.musicTracks > s.ambientTracks && s.musicTracks < s.ambientTracks + Object.values(keys).filter((r) => r.category === 'music' && r.file).length);
    const js = readFileSync(join(root, 'public/restoration/restoration.js'), 'utf8');
    for (const field of ['soundsZip', 'archiveorgSfx', 'recoveredWayback', 'downloadsBestFit', 'otherFiles', 'aliases']) assert.ok(js.includes(`s.${field}`), `the tile says ${field}`);
  });

  it('names the release production runs from tools/deploy/live.json, or a deploy\'s own copy', () => {
    const live = JSON.parse(readFileSync(join(root, 'tools/deploy/live.json'), 'utf8'));
    assert.deepEqual(releaseInfo(), { game: live.game.replace(/^v/, ''), deployed: live.deployed });
    const dir = mkdtempSync(join(tmpdir(), 'release-'));
    writeFileSync(join(dir, 'live.json'), JSON.stringify({ game: 'v9.8.7', deployed: '2027-01-02' }));
    assert.deepEqual(releaseInfo(join(dir, 'live.json')), { game: '9.8.7', deployed: '2027-01-02' });
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ game: 'main', deployed: 'today' }));
    assert.equal(releaseInfo(join(dir, 'bad.json')), null);
    assert.equal(releaseInfo(join(dir, 'missing.json')), null);
    assert.match(readFileSync(join(root, 'tools/deploy/kinsta.sh'), 'utf8'), /build-restoration\.mjs --release="\$RELEASE"/);
  });
});

describe('every-change history', () => {
  it('lists player-visible commits newest first, with their bullets', () => {
    const { changes, since } = historyLog();
    assert.ok(changes.length > 100, `only ${changes.length} changes`);
    for (const c of changes) {
      assert.ok(['new', 'improve', 'fix'].includes(c.kind), c.hash);
      assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(c.text.length > 0 && Array.isArray(c.details), c.hash);
    }
    assert.ok(changes[0].date >= changes[changes.length - 1].date);
    assert.equal(since, changes[changes.length - 1].date);
  });

  it('has a page that reads history.json and is linked from the report', () => {
    const page = readFileSync(join(root, 'public/restoration/history/index.html'), 'utf8');
    assert.match(page, /history\.js/);
    assert.match(readFileSync(join(root, 'public/restoration/history/history.js'), 'utf8'), /\.\.\/history\.json/);
    assert.match(readFileSync(join(root, 'public/restoration/index.html'), 'utf8'), /href="history\/"/);
  });
});

describe('every-change heatmap', () => {
  // The day's player-visible changes, counted from the list itself.
  const listed = (changes) => {
    const by = {};
    for (const c of changes) by[c.date] = (by[c.date] || 0) + 1;
    return by;
  };

  it('counts every game commit by day, and the game NEW/IMPROVE/FIX counts are the listed changes', () => {
    const { changes, activity } = historyLog();
    assert.ok(activity && activity.repos[0] === 'game', 'activity has the game first');
    const games = Object.values(activity.days).reduce((n, d) => n + Object.values(d.game || {}).reduce((a, b) => a + b, 0), 0);
    assert.equal(games, Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()));
    const byDay = listed(changes);
    for (const date of new Set([...Object.keys(byDay), ...Object.keys(activity.days)])) {
      assert.equal(heat.listedCount(activity, date), byDay[date] || 0, date);
    }
    for (const [date, tags] of Object.entries(activity.releases)) {
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
      for (const t of tags) assert.match(t, /^(game|site|server) v\d+\.\d+\.\d+$/);
    }
  });

  it('the committed history.json carries activity that matches its own changes', () => {
    const log = JSON.parse(readFileSync(join(root, 'public/restoration/history.json'), 'utf8'));
    assert.ok(log.activity && log.activity.days, 'history.json has no activity: run node tools/build-restoration.mjs');
    const byDay = listed(log.changes);
    for (const date of new Set([...Object.keys(byDay), ...Object.keys(log.activity.days)])) {
      assert.equal(heat.listedCount(log.activity, date), byDay[date] || 0, date);
    }
  });

  it('classifies Emoji-Log subjects and counts a split-out commit once', () => {
    assert.equal(commitKind('📦 NEW: x'), 'new');
    assert.equal(commitKind('👌 IMPROVE: x'), 'improve');
    assert.equal(commitKind('🐛 FIX: x'), 'fix');
    assert.equal(commitKind('📖 DOC: x'), 'doc');
    assert.equal(commitKind('📖 DOCS: x'), 'doc');
    assert.equal(commitKind('🤖 TEST: x'), 'test');
    assert.equal(commitKind('🚀 RELEASE: game v1.0.0'), 'other');
    assert.equal(commitKind('no prefix'), 'other');
    const a = dayActivity([
      { name: 'game', commits: [{ date: '2026-11-04', key: 'k1', subject: '📦 NEW: a' }, { date: '2026-11-04', key: 'k2', subject: '🐛 FIX: b' }, { date: '2026-11-02', key: 'k3', subject: '📖 DOC: c' }], tags: [{ date: '2026-11-04', tag: 'v0.2.0' }] },
      { name: 'server', commits: [{ date: '2026-11-04', key: 'k1', subject: '📦 NEW: a' }, { date: '2026-11-04', key: 'k4', subject: '🤖 TEST: d' }], tags: [{ date: '2026-11-04', tag: 'v0.1.0' }] },
    ]);
    assert.deepEqual(a.repos, ['game', 'server']);
    assert.deepEqual(Object.keys(a.days), ['2026-11-02', '2026-11-04']);
    assert.deepEqual(a.days['2026-11-04'], { game: { new: 1, fix: 1 }, server: { test: 1 } });
    assert.deepEqual(a.releases, { '2026-11-04': ['game v0.2.0', 'server v0.1.0'] });
    const t = heat.dayTotals(a, '2026-11-04');
    assert.deepEqual(t, { date: '2026-11-04', total: 3, repos: { game: 2, server: 1 }, kinds: { new: 1, fix: 1, test: 1 }, releases: ['game v0.2.0', 'server v0.1.0'] });
    const lines = heat.describeDay(t);
    assert.equal(lines[0], heat.dayName('2026-11-04'));
    assert.equal(lines[1], '3 commits: game 2, server 1');
    assert.equal(lines[2], 'New 1, Fixed 1, Tests 1');
    assert.equal(lines[3], 'Released game v0.2.0, server v0.1.0');
    assert.deepEqual(heat.describeDay(heat.dayTotals(a, '2026-11-03')).slice(1), ['No commits']);
    assert.equal(heat.releaseText(['game v0.4.0', 'game v0.4.1', 'game v0.5.0', 'site v0.4.5']), 'game v0.4.0 to v0.5.0 (3 releases), site v0.4.5');
  });

  it('lays days out in Monday-first week columns with month labels', () => {
    // 2026-10-19 is a Monday; 2026-11-04 a Wednesday.
    const cols = heat.weekColumns('2026-10-21', '2026-11-04');
    assert.equal(cols.length, 3);
    assert.deepEqual(cols[0], [null, null, '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    assert.deepEqual(cols[2], ['2026-11-02', '2026-11-03', '2026-11-04', null, null, null, null]);
    assert.deepEqual(heat.monthLabels(cols), ['Oct', '', 'Nov']);
    // Two labels in neighbouring columns: the first (a sliver of a month) gives way.
    assert.deepEqual(heat.monthLabels(heat.weekColumns('2026-10-26', '2026-11-10')), ['', 'Nov', '']);
    assert.deepEqual(heat.daySpan({ days: { '2026-10-20': {}, '2026-10-19': {} } }, '2026-11-04'), { from: '2026-10-19', to: '2026-11-04' });
    assert.equal(heat.daySpan({ days: {} }), null);
  });

  it('shades by the quartiles of the days with commits', () => {
    const steps = heat.levelSteps([0, 10, 20, 30, 40, 50]);
    assert.deepEqual(steps, [20, 30, 40]);
    assert.deepEqual([0, 5, 20, 21, 30, 40, 41, 500].map((n) => heat.levelOf(n, steps)), [0, 1, 1, 2, 2, 3, 4, 4]);
    assert.deepEqual(heat.levelRanges(steps), ['No commits', '1 to 20 commits', '21 to 30 commits', '31 to 40 commits', '41 or more commits']);
  });

  it('filters the list to a picked day, keeps it in the address, and moves by arrow keys', () => {
    assert.deepEqual(heat.parseHash('#day=2026-11-04'), { kind: 'all', day: '2026-11-04' });
    assert.deepEqual(heat.parseHash('#fix&day=2026-11-04'), { kind: 'fix', day: '2026-11-04' });
    assert.deepEqual(heat.parseHash('#improve'), { kind: 'improve', day: '' });
    assert.deepEqual(heat.parseHash('#day=tomorrow'), { kind: 'all', day: '' });
    assert.deepEqual(heat.parseHash('#d-2026-10-19'), { kind: 'all', day: '' });
    assert.equal(heat.formatHash({ kind: 'fix', day: '2026-11-04' }), '#fix&day=2026-11-04');
    assert.equal(heat.formatHash({ kind: 'all', day: '' }), '');
    const changes = [
      { date: '2026-11-04', kind: 'fix', text: 'Piggy fix', details: [] },
      { date: '2026-11-04', kind: 'new', text: 'Tower', details: ['piggy inside'] },
      { date: '2026-11-03', kind: 'fix', text: 'Other', details: [] },
    ];
    assert.deepEqual([...heat.groupChanges(changes, { day: '2026-11-04' })].map(([d, l]) => [d, l.length]), [['2026-11-04', 2]]);
    assert.deepEqual([...heat.groupChanges(changes, { day: '2026-11-04', kind: 'fix' }).values()].flat().map((c) => c.text), ['Piggy fix']);
    assert.deepEqual([...heat.groupChanges(changes, { query: 'piggy' }).values()].flat().length, 2);
    assert.equal(heat.groupChanges(changes, { day: '2026-11-01' }).size, 0);
    const activity = { repos: ['game'], days: { '2026-11-04': { game: { fix: 1 } } } };
    assert.equal(heat.selectableDay('2026-11-04', activity), true);
    assert.equal(heat.selectableDay('2026-11-03', activity), false, 'a day with no commits is not pickable');
    assert.equal(heat.selectableDay('2026-11-03', null, changes), true, 'without activity a listed day still is');
    const span = { from: '2026-10-19', to: '2026-11-04' };
    assert.equal(heat.stepDay('2026-11-04', 'ArrowLeft', span), '2026-10-28');
    assert.equal(heat.stepDay('2026-11-04', 'ArrowUp', span), '2026-11-03');
    assert.equal(heat.stepDay('2026-11-04', 'ArrowRight', span), '2026-11-04', 'no day past the last');
    assert.equal(heat.stepDay('2026-10-19', 'ArrowUp', span), '2026-10-19');
    assert.equal(heat.stepDay('2026-10-28', 'Home', span), '2026-10-19');
    assert.equal(heat.stepDay('2026-10-28', 'End', span), '2026-11-04');
  });

  it('is a labelled grid drawn from the theme tokens, hidden until the script draws it', () => {
    const page = readFileSync(join(root, 'public/restoration/history/index.html'), 'utf8');
    assert.match(page, /<section class="heat" id="heat" aria-labelledby="heat-title" hidden>/);
    assert.match(page, /role="grid" aria-labelledby="heat-title" aria-describedby="heat-help"/);
    assert.match(page, /id="day-clear"[^>]*>Show all</);
    assert.doesNotMatch(page, /—/);
    const script = readFileSync(join(root, 'public/restoration/history/history.js'), 'utf8');
    assert.match(script, /from '\.\/heatmap\.js/);
    assert.match(script, /'aria-label': describeDayLabel\(t\)/);
    assert.match(script, /role: 'gridcell'/);
    const css = readFileSync(join(root, 'public/restoration/restoration.css'), 'utf8');
    const block = css.slice(css.indexOf('/* —— Every change: commits by day'));
    assert.ok(block.length > 200);
    assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'heatmap colours come from the tokens');
    for (const token of block.matchAll(/var\((--[\w-]+)\)/g)) {
      if (['--cell', '--radius', '--radius-lg'].includes(token[1])) continue;
      for (const theme of [':root {', ':root[data-theme="dark"] {']) {
        const rules = css.slice(css.indexOf(theme), css.indexOf('}', css.indexOf(theme)));
        assert.ok(rules.includes(`${token[1]}:`), `${token[1]} is defined for ${theme}`);
      }
    }
    assert.match(block, /prefers-reduced-motion: reduce[^}]*\.heat-tip \{ animation: none/);
    // A deploy counts the site and server at their tags, from the real clones.
    assert.match(readFileSync(join(root, 'tools/deploy/kinsta.sh'), 'utf8'), /GRODDLE_SITE_DIR="\$SITE_REPO" \\\n\s+node tools\/build-restoration\.mjs --release=/);
  });
});
