/**
 * TODAYCARD (Austin 2026-11-20, "Let's go with the Today in Ur direction"; report #568): a
 * returning player's start card shows a Today panel (the skill, the Feat, a tip) in place of the keys,
 * and one personal nudge in place of "Today's goals". A new save keeps the first-steps goal and keys.
 * Browser check (1440 x 900 and 400 x 860): a new save shows the tutorial choice and the keys; the save
 * reloaded shows the nudge, the tiles and Hold ?; Start learning opens Skills, See Feats the Feat panel.
 * Run: node --test tests/start-today.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { androidBrowser, badgeCandidates, featTile, pickNudge, pickTip, projectTile, skillTile, START_TIPS, studyLeft, tipText } from '../public/js/start-today.js?v=e73894d1';
import { FEATURED_MEMO_KEY, FEATURED_MEMO_MAX_MS, featuredFromServer, readFeaturedMemo, writeFeaturedMemo } from '../public/js/featured-project.js?v=5b2ee7c1';
import { runAt } from '../public/js/feats-mp.js?v=17e84113';
import { FEAT_BY_ID } from '../public/js/solo-feats.js?v=d5445d67';

const read = (rel) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8');

const badge = (classTsid, current, num, extra = {}) => ({
  def: { classTsid, name: classTsid.replace(/_/g, ' '), desc: `Did ${num} things.`, isSecret: false, ...extra.def },
  unlocked: false,
  conditions: [{ type: 'counter', name: 'x', num, current }],
  ...extra.row,
});

describe('the nudge', () => {
  it('keeps started, unfinished, visible one-counter badges', () => {
    const rows = [
      badge('half_way', 5, 10),
      badge('not_started', 0, 10),
      badge('done', 10, 10),
      badge('secret', 5, 10, { def: { isSecret: true } }),
      badge('unlocked', 5, 10, { row: { unlocked: true } }),
      { ...badge('two_parts', 5, 10), conditions: [{ type: 'counter', num: 10, current: 5 }, { type: 'counter', num: 3, current: 1 }] },
      { ...badge('group', 5, 10), conditions: [{ type: 'group_count', num: 10, current: 5 }] },
      badge('one_step', 0, 1),
    ];
    assert.deepEqual(badgeCandidates(rows).map((b) => b.classTsid), ['half_way']);
  });

  it('picks the badge most of its way done, with what is left and the badge in bold', () => {
    const badges = badgeCandidates([badge('far', 4, 10), badge('near', 7, 10), badge('nearer_same', 70, 100)]);
    const n = pickNudge({ badges });
    assert.equal(n.kind, 'badge');
    assert.equal(n.id, 'near', 'ties on the share go to fewer left');
    assert.equal(n.kicker, 'An idea pops into your head');
    assert.equal(`${n.lead}${n.name}${n.after}`, '3 more for near (did 10 things, 7 so far).');
  });

  it('skips a badge under a third done, then takes the newest quest\'s next step', () => {
    const quests = [{ classTsid: 'q1', title: 'Porcine Pleaser', requirements: [{ desc: 'Pet Piggies', current: 6, total: 6 }, { desc: 'Pet more', current: 2, total: 6 }] }];
    const n = pickNudge({ badges: badgeCandidates([badge('barely', 1, 10)]), quests });
    assert.equal(n.kind, 'quest');
    assert.equal(n.kicker, 'A Giant whispers to you');
    assert.equal(`${n.lead}${n.name}${n.after}`, 'Porcine Pleaser: Pet more, 2 of 6.');
    assert.equal(pickNudge({ badges: [], quests: [] }), null, 'nothing started: the first-steps goal stays');
  });
});

describe('the tiles', () => {
  it('the skill tile: what you are learning and the time left, or a Start learning button', () => {
    const learning = skillTile({ name: 'Animal Kinship II', classTsid: 'animalkinship_2', remainingSeconds: 7440, progress: 0.25 }, 0);
    assert.deepEqual(learning, { state: 'learning', title: 'Learning Animal Kinship II', sub: '2h 04m left', progress: 0.25, classTsid: 'animalkinship_2', action: '' });
    const idle = skillTile(null, 16);
    assert.equal(idle.title, 'Not learning a skill');
    assert.equal(idle.action, 'Start learning');
    assert.match(idle.sub, /16 ready to start\.$/);
    assert.equal(skillTile(null, 0).action, '', 'none ready: no button');
    assert.equal(studyLeft(45), '45s');
    assert.equal(studyLeft(61), '2m');
    assert.equal(studyLeft(3600), '1h 00m');
  });

  it('the Feat tile: the shared Feat online, your nearest Feat solo', () => {
    const now = 1_000_000;
    const world = featTile({ mode: 'world', title: "Tottly's Toys", what: 'Play with toys.', total: 33, goal: 420, end: now + 12 * 3600_000 }, now);
    assert.deepEqual(world, { title: 'Today’s Feat: Tottly\'s Toys', sub: 'Play with toys. 33 of 420 · ends in 12 hours.', progress: 33 / 420, action: 'How to help' });
    const scheduled = featTile({ mode: 'world', title: 'Ramble', what: 'Walk.', end: now + 30 * 60_000 }, now);
    assert.equal(scheduled.sub, 'Walk. Ends in 30 minutes.', 'before the server counts: the name and the end');
    assert.equal(scheduled.progress, null);
    const solo = featTile({ mode: 'solo', title: 'Ramble', what: 'Walk.', value: 1, goal: 3 }, now);
    assert.deepEqual(solo, { title: 'Feat: Ramble', sub: 'Walk. 1 of 3.', progress: 1 / 3, action: 'See Feats' });
    assert.equal(featTile({ mode: 'solo', allDone: true }).action, 'See Feats');
    assert.equal(featTile(null), null);
  });

  it('G1206: the street project tile, from the featured project this browser last saw (online only)', () => {
    const store = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, String(v)); }, removeItem(k) { this.m.delete(k); } };
    const now = 1_800_000_000_000;
    const f = featuredFromServer({ job: '62', kind: 'street', label: 'Lowland Slough', hub: 'Groddle Meadow', boardLabel: 'Hechey Track', phases: 2, percent: 40, row: { big: 1 } });
    writeFeaturedMemo(store, f, now);
    assert.ok(store.getItem(FEATURED_MEMO_KEY).length < 300, 'only what the card shows, not the row');
    const memo = readFeaturedMemo(store, now + 60_000);
    assert.deepEqual(memo, { jobId: '62', label: 'Lowland Slough', kind: 'street', hub: 'Groddle Meadow', boardLabel: 'Hechey Track', subway: false, percent: 40, at: now });
    assert.deepEqual(projectTile(memo), {
      title: 'Featured street project: Lowland Slough',
      sub: 'A new street in Groddle Meadow, from Hechey Track. 40% built when you last played.',
      progress: 0.4,
      action: 'See the project',
    });
    assert.equal(readFeaturedMemo(store, now + FEATURED_MEMO_MAX_MS), null, 'a week old is not shown');
    assert.equal(projectTile(null), null, 'nothing seen: no tile');
    writeFeaturedMemo(store, null, now);
    assert.equal(readFeaturedMemo(store, now), null, 'nothing featured any more: forgotten');
    store.setItem(FEATURED_MEMO_KEY, '{not json');
    assert.equal(readFeaturedMemo(store, now), null);
    assert.equal(readFeaturedMemo({ getItem() { throw new Error('denied'); } }, now), null);
    assert.doesNotThrow(() => writeFeaturedMemo({ setItem() { throw new Error('full'); } }, f, now));
  });

  it('G1150 (#618): the install, currants, favor and skill-time tips; Android only where it applies', () => {
    for (const t of [
      'On Android, pick Install app or Add to Home screen in your browser menu to play full screen.',
      'Click your currants to find the nearest vendor.',
      'Click your favor to find the nearest shrine.',
      'After 20 skills, each skill you know or have started (paused ones too) makes learning a little slower.',
      'Spend an emblem from your pack (its Spend verb) to unlock a skill or learn one faster. Shrines do not take emblems.',
    ]) assert.ok(START_TIPS.includes(t), t);
    // G1150 follow-up: learning does not slow with every skill (inc_skills.js 1792-1807: only past brain capacity, 20).
    assert.ok(!START_TIPS.some((t) => /longer to learn than the last/.test(t)), 'the old, wrong skill tip is gone');
    assert.ok(!START_TIPS.some((t) => /Upgrade|Rook/.test(t)), 'Upgrades and Rooks are left for players to teach');
    const seen = (o) => new Set(Array.from({ length: 400 }, (_, i) => pickTip(() => i / 400, o)));
    assert.ok(![...seen({})].some((t) => /^On Android/.test(t)), 'not on a desktop');
    assert.ok(![...seen({ touch: true })].some((t) => /^On Android/.test(t)), 'not on an iPhone');
    assert.ok([...seen({ touch: true, android: true })].some((t) => /^On Android/.test(t)), 'on an Android phone');
    assert.equal(tipText('Click your currants to find the nearest vendor.', { touch: true }), 'Tap your currants to find the nearest vendor.');
    assert.equal(tipText('Click your favor to find the nearest shrine.'), 'Click your favor to find the nearest shrine.');
    assert.equal(androidBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0 Mobile Safari/537.36'), true);
    assert.equal(androidBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0 Mobile Safari/537.36', true), false, 'already installed');
    assert.equal(androidBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'), false);
  });

  it('#618: the Calendar tip names the time in the top bar, true solo and online', () => {
    const tip = 'Click the time in the top bar to find the Calendar.';
    assert.ok(START_TIPS.includes(tip));
    assert.equal(tipText(tip, { touch: true }), 'Tap the time in the top bar to find the Calendar.');
    assert.ok([...new Set(Array.from({ length: 400 }, (_, i) => pickTip(() => i / 400, { touch: true })))].includes(tip), 'phones get it too');
    // Solo the clock opens the Calendar; online it opens the hi sign board, which has a Calendar button.
    const cal = read('public/js/features/calendar-feature.js');
    assert.match(cal, /engine\?\.mode === 'multiplayer'\) return;\n  const clock = document\.getElementById\('dametime-clock'\);/);
    assert.match(cal, /clock\.addEventListener\('click', toggle\);/);
    const hi = read('public/js/features/hi-signs-feature.js');
    assert.match(hi, /el\('button', 'hi-calendar', 'Calendar'\)/);
    assert.match(hi, /window\.dispatchEvent\(new CustomEvent\('groddle:calendar'\)\)/);
  });

  it('a tip each visit; a phone gets only the ones that name no key', () => {
    assert.equal(pickTip(() => 0), START_TIPS[0]);
    assert.equal(pickTip(() => 0.9999), START_TIPS.at(-1));
    for (let i = 0; i < 20; i += 1) assert.doesNotMatch(pickTip(() => i / 20, { touch: true }), /^(Press|Hold)\b/);
    for (const t of START_TIPS) {
      assert.doesNotMatch(t, /—|Glitch/, t);
      assert.match(t, /\.$/, t);
    }
  });
});

describe('the feature', () => {
  const feature = read('public/js/features/start-today-feature.js');
  const feats = read('public/js/features/solo-feats-feature.js');

  it('is registered, above the pinned multiplayer lines', () => {
    const index = read('public/js/features/index.js');
    const at = index.indexOf("import { startTodayFeature } from './start-today-feature.js");
    assert.ok(at > 0 && at < index.indexOf('import { chickenScareFeature }'));
  });

  it('a new save (the tutorial choice, a new character) keeps the keys; others get Today', () => {
    assert.match(feature, /const next = doc\.getElementById\('newxp-start'\) \|\| engine\.newPlayer \? 'new' : 'today';/);
    assert.match(feature, /if \(today\) today\.hidden = mode !== 'today';\s*if \(keys\) keys\.hidden = mode === 'today';\s*if \(hint\) hint\.hidden = mode !== 'today';/);
    // Features do not tick before Start, so the card keeps its own second, ended by the start.
    assert.match(feature, /timer = setInterval\(\(\) => \{\s*if \(engine\.started\) \{\s*clearInterval\(timer\);/);
  });

  it('the buttons start the game, then open Skills or the Feat panel', () => {
    assert.match(feature, /startThen\(engine, \(\) => engine\.openSkillTree\?\.\(\)\)/);
    assert.match(feature, /startThen\(engine, \(\) => document\.getElementById\('feat-btn'\)\?\.click\(\)\)/);
    assert.match(feature, /const btn = document\.getElementById\('start-btn'\);[\s\S]*?btn\.click\(\);/, 'through Start exploring, so beginGame runs');
  });

  it('online, the card names the Feat from the server\'s schedule (the session starts after Start)', () => {
    assert.match(feats, /const due = runAt\(Date\.now\(\)\);/);
    assert.match(read('public/js/features/realtime-feature.js'), /if \(!session \|\| !engine\.started\) return;\s*if \(session\.client\.state === 'idle'\) session\.start\(\);/);
    const due = runAt(Date.now());
    assert.ok(FEAT_BY_ID[due.feat], 'the schedule names a Feat the card can describe');
    assert.ok(due.end > Date.now());
  });

  it('G1206: online the card shows the featured project; See the project opens it once the server names it', () => {
    const jobs = read('public/js/features/street-jobs-feature.js');
    assert.match(feature, /const memo = engine\.query\?\.\('startCardProject', engine\) \|\| null;\s*const project = projectTile\(memo\);/);
    assert.match(feature, /startThen\(engine, \(\) => engine\.query\?\.\('openFeaturedProject', engine\)\)/);
    assert.doesNotMatch(feature, /Not on it yet/);
    assert.match(jobs, /startCardProject\(\) \{\s*return mpMode \? readFeaturedMemo\(featuredStore\(\)\) : null;/, 'solo has no featured project');
    assert.match(jobs, /writeFeaturedMemo\(featuredStore\(\), featured\);/, 'kept on every project_featured');
    assert.match(jobs, /if \(featured\) openFeatured\(engine\);\s*else featuredOpenAsked = true;/);
    assert.match(jobs, /if \(featuredOpenAsked\) \{\s*featuredOpenAsked = false;\s*if \(featured\) openFeatured\(engine\);/, 'the next project_featured answers; nothing is sent, so no request wait');
  });

  it('draws with textContent, never player or badge text as HTML', () => {
    assert.doesNotMatch(feature.replace(/el\.innerHTML = '<img[^']*';/, ''), /innerHTML/);
  });

  it('the card markup and styles', () => {
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(page);
      assert.match(html, /<section id="start-today" class="start-today" aria-labelledby="start-today-title" hidden>\s*<h3 id="start-today-title">Today<\/h3>\s*<div id="start-tiles" class="start-tiles"><\/div>\s*<p class="start-tip"><b>Tip:<\/b> <span id="start-tip-text"><\/span><\/p>\s*<\/section>/, page);
    }
    const css = read('public/style.css');
    assert.match(css, /\.start-tile-meter\[hidden\],\n\.start-tile-act\[hidden\],\n\.start-tile\[hidden\] \{ display: none; \}/, 'display: block must not show a hidden bar');
    assert.match(css, /:root\.touch-phone \.start-keyhint \{ display: none; \}/);
  });
});
