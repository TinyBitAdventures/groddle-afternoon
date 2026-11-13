/**
 * Update ready (Austin 2026-10-31): the deploy stamps a build id into the play pages and
 * play/build.json (tools/deploy/build-id.mjs); an open game checks the file (js/update-check.js) and
 * offers a pill that saves and reloads (js/features/update-ready-feature.js).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILD_FILE, PLAY_PAGES, buildIdOf, pageBuildId, stamp, stampBuild, unstamp } from '../tools/deploy/build-id.mjs';
import {
  BACKOFF_MAX_MS, CHECK_EVERY_MS, JITTER, MIN_GAP_MS, RECONNECT_SPREAD_MS, REMIND_GAP_MS, UPDATE_TEXT,
  blockingUi, buildUrl, createReachReminder, createUpdateCheck, nextDelay, ownBuild, saveThenReload,
} from '../public/js/update-check.js?v=2496f20a';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function builtCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'groddle-build-id-'));
  for (const p of PLAY_PAGES) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), read(`public/${p}`));
  }
  return dir;
}

/** Fake timers: run(ms) moves the clock and fires what is due, in order. */
function clock(start = 1_000_000) {
  let t = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: t + Math.max(0, ms) }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    pending: () => [...timers.values()].map((x) => x.at - t),
    async run(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await new Promise((r) => setImmediate(r));
      }
      t = end;
      await new Promise((r) => setImmediate(r));
    },
  };
}

function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const a = typeof answer === 'function' ? answer(calls.length) : answer;
    if (a instanceof Error) throw a;
    return { ok: a.status ? a.status < 400 : true, status: a.status || 200, json: async () => a.body };
  };
  fn.calls = calls;
  return fn;
}

describe('the build id written at deploy', () => {
  it('stamps both play pages and play/build.json with one id, and the page knows its own', () => {
    const dir = builtCopy();
    try {
      const out = stampBuild(dir, { version: 'v9.9.9' });
      assert.match(out.build, /^[0-9a-f]{12}$/);
      const file = JSON.parse(readFileSync(join(dir, BUILD_FILE), 'utf8'));
      assert.deepEqual(file, { build: out.build, version: 'v9.9.9' });
      assert.ok(readFileSync(join(dir, BUILD_FILE)).length < 200, 'a few dozen bytes');
      for (const p of PLAY_PAGES) {
        const html = readFileSync(join(dir, p), 'utf8');
        assert.equal(pageBuildId(html), out.build, p);
        assert.equal((html.match(/name="groddle-build"/g) || []).length, 1, `${p}: one stamp`);
        assert.ok(html.indexOf('groddle-build') < html.indexOf('</head>'), `${p}: in the head`);
        // What the browser reads: ownBuild on the stamped page.
        const doc = { querySelector: (sel) => (sel === 'meta[name="groddle-build"]' ? { getAttribute: () => pageBuildId(html) } : null) };
        assert.equal(ownBuild(doc), file.build);
      }
      // Idempotent: a second run reads the pages without their stamp and writes the same id.
      assert.equal(stampBuild(dir, { version: 'v9.9.9' }).build, out.build);
      for (const p of PLAY_PAGES) assert.equal(unstamp(readFileSync(join(dir, p), 'utf8')), read(`public/${p}`), `${p}: unstamp gives the page back`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('changes with any content key in the pages and only then', () => {
    const solo = read('public/play/index.html');
    const online = read('public/play/online/index.html');
    const id = buildIdOf([solo, online]);
    assert.equal(buildIdOf([solo, online]), id);
    assert.equal(buildIdOf([stamp(solo, 'abc'), stamp(online, 'def')]), id, 'the stamp is not part of the id');
    const m = /game\.js\?v=([0-9a-f]{8})/.exec(solo);
    assert.ok(m, 'the solo page loads game.js by its content key');
    assert.notEqual(buildIdOf([solo.replace(m[0], 'game.js?v=00000000'), online]), id, 'a module change');
    const d = /data-versions\.js\?v=([0-9a-f]{8})/.exec(online);
    assert.notEqual(buildIdOf([solo, online.replace(d[0], 'data-versions.js?v=00000000')]), id, 'a data change');
  });

  it('kinsta.sh stamps last, after the page edits and before the upload, with the release', () => {
    const deploy = read('tools/deploy/kinsta.sh');
    const at = deploy.indexOf('tools/deploy/build-id.mjs" "$GAME" --version="$GAME_REF"');
    assert.ok(at > 0);
    for (const before of ['tools/deploy/fathom.mjs" "$GAME"', 'tools/deploy/social.mjs" "$GAME"', 'site-nav/apply.mjs', 'module-keys/build.mjs)', 'data-versions/build.mjs --built']) {
      assert.ok(deploy.indexOf(before) > 0 && deploy.indexOf(before) < at, `after ${before}`);
    }
    assert.ok(at < deploy.indexOf('"$GAME/" "$HOST:web/game.next/"'), 'before the game rsync');
    assert.match(deploy, /for p in [^\n]*\/play\/build\.json/, 'the check step fetches it');
  });

  it('the repo\'s own pages carry no stamp and no build file', () => {
    for (const p of PLAY_PAGES) assert.equal(pageBuildId(read(`public/${p}`)), '', p);
    assert.throws(() => read(`public/${BUILD_FILE}`));
  });
});

describe('the check', () => {
  const baseUri = 'https://groddleafternoon.com/';

  it('asks for the file uncached, with a buster, from the site root', async () => {
    assert.equal(buildUrl(baseUri, 1234), 'https://groddleafternoon.com/play/build.json?t=1234');
    assert.equal(buildUrl('http://127.0.0.1:9/play/', 5), 'http://127.0.0.1:9/play/play/build.json?t=5');
    const c = clock();
    const fetch = fakeFetch({ body: { build: 'aaa', version: 'v1' } });
    const check = createUpdateCheck({ own: 'aaa', url: (at) => buildUrl(baseUri, at), fetch, ...c, random: () => 0.5 });
    await check.check();
    assert.equal(fetch.calls.length, 1);
    assert.equal(fetch.calls[0].init.cache, 'no-store');
    assert.match(fetch.calls[0].url, /\/play\/build\.json\?t=\d+$/);
  });

  it('a page with no stamp never checks', async () => {
    const c = clock();
    const fetch = fakeFetch({ body: { build: 'bbb' } });
    const check = createUpdateCheck({ own: '', url: () => 'x', fetch, ...c });
    assert.equal(check.start(), false);
    await check.check();
    assert.equal(check.shown(), false);
    await c.run(CHECK_EVERY_MS * 3);
    assert.equal(fetch.calls.length, 0);
  });

  it('the same build: nothing; a different build: announced once, then checking stops', async () => {
    const c = clock();
    let build = 'aaa';
    const fetch = fakeFetch(() => ({ body: { build, version: 'v0.7.1' } }));
    const seen = [];
    const check = createUpdateCheck({ own: 'aaa', url: (at) => `b?t=${at}`, fetch, ...c, random: () => 0.5, onUpdate: (u) => seen.push(u) });
    check.start();
    await c.run(CHECK_EVERY_MS);
    assert.equal(fetch.calls.length, 1);
    assert.deepEqual(seen, []);
    build = 'bbb';
    await c.run(CHECK_EVERY_MS);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].build, 'bbb');
    assert.equal(seen[0].version, 'v0.7.1');
    assert.equal(check.latest.build, 'bbb');
    assert.equal(check.scheduled, false, 'no more checks');
    await c.run(CHECK_EVERY_MS * 5);
    await check.check();
    check.shown();
    check.reconnected();
    await c.run(RECONNECT_SPREAD_MS * 2);
    assert.equal(fetch.calls.length, 2, 'nothing fetched after the new build');
    assert.equal(seen.length, 1, 'announced once');
  });

  it('failures are silent and back off, up to the cap; a success resets', async () => {
    const c = clock();
    let fail = true;
    const fetch = fakeFetch(() => (fail ? new Error('offline') : { body: { build: 'aaa' } }));
    const seen = [];
    const check = createUpdateCheck({ own: 'aaa', url: () => 'b', fetch, ...c, random: () => 0.5, onUpdate: (u) => seen.push(u) });
    check.start();
    await c.run(CHECK_EVERY_MS);
    assert.equal(check.failures, 1);
    assert.deepEqual(c.pending(), [CHECK_EVERY_MS * 2]);
    await c.run(CHECK_EVERY_MS * 2);
    assert.equal(check.failures, 2);
    assert.deepEqual(c.pending(), [CHECK_EVERY_MS * 4]);
    fail = true;
    for (let i = 0; i < 6; i++) await c.run(BACKOFF_MAX_MS);
    assert.ok(c.pending()[0] <= BACKOFF_MAX_MS);
    fail = false;
    await c.run(c.pending()[0]);
    assert.equal(check.failures, 0);
    assert.deepEqual(c.pending(), [CHECK_EVERY_MS]);
    assert.deepEqual(seen, []);
    // A 404 and a body with no build are failures too, never an update.
    const bad = createUpdateCheck({ own: 'aaa', url: () => 'b', fetch: fakeFetch({ status: 404, body: null }), ...clock(), onUpdate: (u) => seen.push(u) });
    await bad.check();
    const empty = createUpdateCheck({ own: 'aaa', url: () => 'b', fetch: fakeFetch({ body: { version: 'v1' } }), ...clock(), onUpdate: (u) => seen.push(u) });
    await empty.check();
    assert.equal(bad.failures + empty.failures, 2);
    assert.deepEqual(seen, []);
  });

  it('the interval is about five minutes, jittered either way, so a deploy does not bring everyone at once', () => {
    assert.equal(CHECK_EVERY_MS, 300_000);
    assert.equal(nextDelay({ random: () => 0 }), CHECK_EVERY_MS * (1 - JITTER));
    assert.equal(nextDelay({ random: () => 1 }), CHECK_EVERY_MS * (1 + JITTER));
    assert.equal(nextDelay({ random: () => 0.5 }), CHECK_EVERY_MS);
    assert.equal(nextDelay({ random: () => 0.5, failures: 1 }), CHECK_EVERY_MS * 2);
    assert.equal(nextDelay({ random: () => 1, failures: 20 }), BACKOFF_MAX_MS);
    const c = clock();
    const check = createUpdateCheck({ own: 'aaa', url: () => 'b', fetch: fakeFetch({ body: { build: 'aaa' } }), ...c, random: () => 0.1 });
    check.start();
    assert.deepEqual(c.pending(), [Math.round(CHECK_EVERY_MS * (1 - JITTER + 2 * JITTER * 0.1))], 'the first check waits a jittered interval');
  });

  it('shown again: checks, but not twice within a minute', async () => {
    const c = clock();
    const fetch = fakeFetch({ body: { build: 'aaa' } });
    const check = createUpdateCheck({ own: 'aaa', url: () => 'b', fetch, ...c, random: () => 0.5 });
    check.start();
    assert.equal(check.shown(), false, 'the page just loaded');
    await c.run(MIN_GAP_MS);
    assert.equal(check.shown(), true);
    await c.run(0);
    assert.equal(fetch.calls.length, 1);
    assert.equal(check.shown(), false);
    await c.run(MIN_GAP_MS - 1);
    assert.equal(check.shown(), false);
    await c.run(1);
    assert.equal(check.shown(), true);
    await c.run(0);
    assert.equal(fetch.calls.length, 2);
  });

  it('a reconnect checks after a random wait, once, so a server restart is spread out', async () => {
    const c = clock();
    const fetch = fakeFetch({ body: { build: 'ccc' } });
    const seen = [];
    const check = createUpdateCheck({ own: 'aaa', url: () => 'b', fetch, ...c, random: () => 0.25, onUpdate: (u) => seen.push(u) });
    check.start();
    await c.run(MIN_GAP_MS);
    assert.equal(check.reconnected(), true);
    assert.equal(check.reconnected(), false, 'one wait at a time');
    assert.ok(c.pending().includes(RECONNECT_SPREAD_MS * 0.25));
    await c.run(RECONNECT_SPREAD_MS * 0.25 - 1);
    assert.equal(fetch.calls.length, 0);
    await c.run(1);
    assert.equal(fetch.calls.length, 1);
    assert.equal(seen[0].reason, 'reconnect');
  });
});

describe('the pill', () => {
  const engine = (o = {}) => ({ inScene: () => false, questDialogueOpen: () => false, ...o });
  const doc = ({ trade = null, panel = false, modals = [] } = {}) => ({
    getElementById: (id) => (id === 'trade-window' ? trade : null),
    querySelector: (sel) => (sel.includes('glitch-modal') && panel ? {} : null),
    querySelectorAll: () => modals,
  });

  it('waits for a race, a trade, a modal or a dialogue to clear', () => {
    assert.equal(blockingUi(engine(), doc()), '');
    assert.equal(blockingUi(engine({ inScene: () => true }), doc()), 'scene');
    assert.equal(blockingUi(engine({ questDialogueOpen: () => true }), doc()), 'dialogue');
    assert.equal(blockingUi(engine(), doc({ trade: { hidden: false } })), 'trade');
    assert.equal(blockingUi(engine(), doc({ trade: { hidden: true } })), '');
    assert.equal(blockingUi(engine(), doc({ panel: true })), 'panel');
    assert.equal(blockingUi(engine(), doc({ modals: [{ hidden: false, getClientRects: () => [1] }] })), 'modal');
    assert.equal(blockingUi(engine(), doc({ modals: [{ hidden: false, getClientRects: () => [] }] })), '', 'a modal not on screen');
    assert.equal(blockingUi(null, null), '');
  });

  it('saves, then reloads: solo at once, online once the cloud save is written', async () => {
    const order = [];
    const eng = { save: () => order.push('save') };
    assert.equal(await saveThenReload({ engine: eng, reload: () => order.push('reload') }), true);
    assert.deepEqual(order, ['save', 'reload']);

    order.length = 0;
    let resolveFlush;
    const store = { flush: () => { order.push('flush'); return new Promise((r) => { resolveFlush = r; }); } };
    const going = saveThenReload({ engine: eng, store, reload: () => order.push('reload') });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(order, ['save', 'flush'], 'no reload before the write answers');
    resolveFlush('saved');
    assert.equal(await going, true);
    assert.deepEqual(order, ['save', 'flush', 'reload']);

    for (const state of ['pending']) {
      order.length = 0;
      assert.equal(await saveThenReload({ engine: eng, store: { flush: async () => state }, reload: () => order.push('reload') }), true, state);
    }
    for (const state of ['offline', 'error', 'signed-out', 'conflict']) {
      const said = [];
      order.length = 0;
      assert.equal(await saveThenReload({ engine: eng, store: { flush: async () => state }, reload: () => order.push('reload'), say: (t) => said.push(t) }), false, state);
      assert.deepEqual(order, ['save'], `${state}: never reloads`);
      assert.deepEqual(said, [UPDATE_TEXT.notSaved]);
    }
    const said = [];
    assert.equal(await saveThenReload({ engine: { save: () => { throw new Error('quota'); } }, reload: () => order.push('x'), say: (t) => said.push(t) }), false);
    assert.ok(!order.includes('x'));
    assert.deepEqual(said, [UPDATE_TEXT.notSaved]);
  });

  it('plain words, no em dashes, never the old game\'s name', () => {
    for (const t of Object.values(UPDATE_TEXT)) {
      assert.ok(!t.includes('—'), t);
      assert.ok(!/glitch/i.test(t), t);
    }
    assert.equal(UPDATE_TEXT.pill, 'Update ready');
  });

  it('the feature: registered (before street objects, realtime and the account backup, which keep their places at the end), a keyboard-reachable button in the top bar in both skins, the three triggers', () => {
    const index = read('public/js/features/index.js');
    assert.match(index, /import \{ updateReadyFeature \} from '\.\/update-ready-feature\.js\?v=[0-9a-f]{8}'; FEATURES\.push\(updateReadyFeature\);/);
    const src = read('public/js/features/update-ready-feature.js');
    assert.match(src, /document\.createElement\('button'\)/, 'a real button, in the tab order');
    assert.match(src, /btn\.type = 'button'/);
    assert.match(src, /btn\.hidden = true/, 'hidden until a new build');
    assert.match(src, /querySelector\('\.top-bar \.top-actions'\)/, 'in the top bar');
    assert.match(src, /\[data-ui="modern"\] \.top-bar \.update-ready-btn/, 'Modern');
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\] \.top-bar \.hud-actions > \.update-ready-btn \{/, 'Classic (its palette lives in classic.css)');
    assert.match(src, /addEventListener\('visibilitychange'[\s\S]{0,120}check\.shown\(\)/, 'shown again');
    assert.match(src, /query\?\.\('realtimeClient'\)[\s\S]{0,300}client\.on\('hello'[\s\S]{0,80}if \(seenOnline\) check\.reconnected\(\)/, 'a reconnect, not the first connect');
    assert.match(src, /check\.start\(\)/, 'the interval');
    assert.match(src, /saveThenReload\(\{[\s\S]{0,200}reload: \(\) => location\.reload\(\)/, 'save, then reload');
    assert.match(src, /saveStore\?\.kind === 'multiplayer' \? saveStore : null/, 'online flushes the cloud save');
    assert.match(src, /announced !== build[\s\S]{0,80}pushActivity\?\.\(UPDATE_TEXT\.activity\)/, 'one Activity line per build');
    assert.match(src, /blockingUi\(engine\)/, 'waits for blocking UI');
    assert.equal(src.split('location.reload(').length - 1, 1, 'reloads only from the click');
  });
});

// #307/#308 (G703): a tab left open across releases got "You need to be closer" beside shared rocks the
// server had moved; the server's line says a reload fixes it, and a page that already knows a newer
// build says its Update ready notice again. Never a reload by itself.
describe('the reach reminder', () => {
  it('says the notice again on a reach refusal once a newer build is known, at most once a minute', async () => {
    const c = clock();
    let build = 'aaa';
    const fetch = fakeFetch(() => ({ body: { build, version: 'v0.37.1' } }));
    const check = createUpdateCheck({ own: 'aaa', url: (at) => `b?t=${at}`, fetch, ...c, random: () => 0.5 });
    const said = [];
    const reminder = createReachReminder({ check, now: c.now, say: (t) => said.push(t) });
    check.start();
    await c.run(CHECK_EVERY_MS);
    assert.equal(reminder.reached(), false, 'the same build: nothing to say');
    assert.deepEqual(said, []);

    build = 'bbb';
    await c.run(CHECK_EVERY_MS);
    assert.equal(check.latest.build, 'bbb');
    assert.equal(reminder.reached(), true);
    assert.deepEqual(said, [UPDATE_TEXT.reach]);
    assert.equal(reminder.reached(), false, 'a second swing at once says nothing more');
    await c.run(REMIND_GAP_MS);
    assert.equal(reminder.reached(), true, 'a minute on, again');
    assert.equal(reminder.count, 2);
    assert.equal(said.length, 2);
  });

  it('with no newer build known yet, a reach refusal checks now (after the shown-again gap)', async () => {
    const c = clock();
    const fetch = fakeFetch({ body: { build: 'bbb' } });
    const seen = [];
    const check = createUpdateCheck({ own: 'aaa', url: (at) => `b?t=${at}`, fetch, ...c, random: () => 0.5, onUpdate: (u) => seen.push(u) });
    const reminder = createReachReminder({ check, now: c.now });
    check.start();
    assert.equal(reminder.reached(), false);
    assert.equal(fetch.calls.length, 0, 'the page just loaded: within the gap, no check');
    await c.run(MIN_GAP_MS);
    assert.equal(reminder.reached(), false, 'the check runs; the pill announces the build as ever');
    await c.run(0);
    assert.equal(fetch.calls.length, 1);
    assert.equal(seen.length, 1);
    assert.equal(fetch.calls[0].url.startsWith('b?t='), true);
  });

  it('plain words that point at the pill', () => {
    assert.match(UPDATE_TEXT.reach, /older version/);
    assert.match(UPDATE_TEXT.reach, /Update ready/);
    assert.ok(!UPDATE_TEXT.reach.includes('\u2014'));
  });

  it('the wiring: street objects ask on a far refusal of a rock, tree, node or dust; the feature says the notice, never reloads', () => {
    const objects = read('public/js/features/street-objects-feature.js');
    assert.match(objects, /if \(!ok && reachRefusal\(msg\)\) engine\.query\?\.\('updateReminder', 'far', engine\)/);
    assert.match(objects, /function reachRefusal\(msg\) \{\s*if \(msg\?\.code !== 'far'\) return false;\s*return msg\.verb === 'dust' \|\| \['rock', 'tree', 'node'\]\.includes\(idKind\(msg\.id\)\);/);
    const src = read('public/js/features/update-ready-feature.js');
    assert.match(src, /updateReminder\(reason, engine\) \{\s*return session\?\.remind\(\) \? true : null;/);
    assert.match(src, /createReachReminder\(\{\s*check,\s*say: \(text\) => \{\s*engine\.toast\?\.\(text, 6000\);\s*engine\.pushActivity\?\.\(text\);/);
    assert.equal(src.split('location.reload(').length - 1, 1, 'reloads only from the click');
  });
});
