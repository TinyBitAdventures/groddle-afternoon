/**
 * Solo polish from Austin's play of 2026-10-28 (lane UIPOLISH, keys g396-1).
 *
 * - A signed-out solo /play/ page logged admin-ajax rest-nonce's 400 ("0"). The
 *   multiplayer features that know that URL (home-street-mp, yard-verbs-mp,
 *   home-pool-mp) run only when engine.mode is 'multiplayer'; the one solo caller
 *   was account-backup-feature's session check at boot, which now asks the quiet
 *   way (online-boot.js quietSession: heartbeat, then groddle/v1/me).
 * - The Map's subtitle loses its developer note (painted bg / geometry only).
 * - The Quests header counts offer cards on their own.
 * - The Qurazy banner waits for the solo start card to close.
 * - The word progress bar's soft outline; the tutorial Upgrade hand's dimmed
 *   cards stay solid; a bag's icon is centred in its slot; the pack rows no
 *   longer clip a selected or open slot (style.css).
 * Run: node --test tests/solo-polish.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountBackupFeature } from '../public/js/features/account-backup-feature.js?v=g436-3';
import { homeStreetMpFeature } from '../public/js/features/home-street-mp-feature.js?v=g449-1';
import { yardVerbsMpFeature } from '../public/js/features/yard-verbs-mp-feature.js?v=g449-1';
import { homePoolMpFeature } from '../public/js/features/home-pool-mp-feature.js?v=g375-1';
import { qurazyFeature, resetQurazyFeatureForTests } from '../public/js/features/qurazy-feature.js?v=g449-1';
import { QURAZY_SPAWN_LINE } from '../public/js/qurazy.js';
import { QURAZY_PLACEMENT_GROUP } from '../public/js/features/qurazy-feature.js?v=g449-1';
import { hubMapArtNote, hubMapSubtitle, questLogSummary } from '../public/js/panel-copy.js?v=g396-1';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
// play pages set <base href="../">: document.baseURI is the site root.
const BASE = 'https://groddle.localhost/';
const SITE = 'https://groddle.localhost/';
const BEAT = 'wp-admin/admin-ajax.php?action=heartbeat';
const NONCE = 'wp-admin/admin-ajax.php?action=rest-nonce';
const ME = 'wp-json/groddle/v1/me';

/** A fetch answering by URL suffix; unknown URLs 404. Records every URL asked. */
function routedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), ...init });
    const key = Object.keys(routes).find((k) => String(url).endsWith(k));
    const answer = key ? routes[key] : { status: 404, body: '<!doctype html>Not found' };
    return {
      status: answer.status,
      ok: answer.status >= 200 && answer.status < 300,
      headers: { get: () => null },
      json: async () => (typeof answer.body === 'string' ? JSON.parse(answer.body) : answer.body),
      text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)),
    };
  };
  return { fn, calls };
}

/** Runs fn with a stand-in document and fetch, then puts the globals back. */
async function withGlobals({ fetch, document }, fn) {
  const had = { fetch: globalThis.fetch, document: globalThis.document };
  globalThis.fetch = fetch;
  globalThis.document = document;
  try {
    return await fn();
  } finally {
    globalThis.fetch = had.fetch;
    if (had.document === undefined) delete globalThis.document;
    else globalThis.document = had.document;
  }
}

/** The solo account check: init, then wait for its accountSession answer. */
async function soloAccountCheck(routes) {
  const f = routedFetch(routes);
  const data = {};
  // No #more-list: install stops after it has published the session (no DOM needed).
  const document = { baseURI: BASE, getElementById: () => null };
  await withGlobals({ fetch: f.fn, document }, async () => {
    accountBackupFeature.init({ mode: 'solo', setData: (k, v) => { data[k] = v; } });
    for (let i = 0; i < 50 && !data.accountSession; i += 1) await new Promise((r) => setTimeout(r, 5));
  });
  return { urls: f.calls.map((c) => c.url), data };
}

describe('solo asks no rest-nonce (the console 400)', () => {
  it('signed out on the Groddle site: heartbeat, then me; never rest-nonce', async () => {
    const { urls, data } = await soloAccountCheck({
      [BEAT]: { status: 200, body: { 'wp-auth-check': false, server_time: 1793188491 } },
      [NONCE]: { status: 400, body: '0' },
      [ME]: { status: 200, body: { signedIn: false, player: null } },
    });
    assert.equal(data.accountSession, 'signed-out');
    assert.deepEqual(urls, [`${SITE}${BEAT}`, `${SITE}${ME}`]);
    assert.ok(!urls.some((u) => u.includes('rest-nonce')));
  });

  it('signed in: only then is the nonce asked (it answers 200)', async () => {
    const { urls, data } = await soloAccountCheck({
      [BEAT]: { status: 200, body: { success: false } },
      [NONCE]: { status: 200, body: '0123456789' },
      [ME]: { status: 200, body: { signedIn: true, player: { id: 7, name: 'Bo' } } },
    });
    assert.equal(data.accountSession, 'signed-in');
    assert.deepEqual(urls, [`${SITE}${BEAT}`, `${SITE}${NONCE}`, `${SITE}${ME}`]);
  });

  it('a static server (no account routes): nothing found, no rest-nonce', async () => {
    const { urls, data } = await soloAccountCheck({});
    assert.equal(data.accountSession, 'none');
    assert.deepEqual(urls, [`${SITE}${BEAT}`]);
  });

  it('the multiplayer-only features fetch nothing in solo, even with a client and an owned home street', async () => {
    const f = routedFetch({});
    const client = { state: 'online', me: { id: 7 }, on() {}, off() {}, send: () => true };
    const engine = {
      mode: 'solo',
      started: true,
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      homeContext: () => ({ inHome: true, owned: true, room: 'street' }),
      setData() {},
      save() {},
      inv: [],
    };
    const document = { baseURI: BASE, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, append() {} }), head: { append() {} }, body: { append() {} } };
    await withGlobals({ fetch: f.fn, document }, async () => {
      for (let i = 0; i < 5; i += 1) {
        const now = Date.now() + i * 61_000;
        homeStreetMpFeature.onTick(16, now, engine);
        yardVerbsMpFeature.onTick(16, now, engine);
        homePoolMpFeature.onTick(16, now, engine);
      }
      assert.equal(homePoolMpFeature.homeImgPool(engine), null);
      assert.equal(homePoolMpFeature.homeImgCollect(engine), null);
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.deepEqual(f.calls, []);
  });

  it('each of the three multiplayer modules gates on engine.mode', () => {
    for (const rel of ['public/js/features/home-street-mp-feature.js', 'public/js/features/yard-verbs-mp-feature.js', 'public/js/features/home-pool-mp-feature.js']) {
      assert.match(read(rel), /engine\?\.mode !== 'multiplayer'|engine\?\.mode === 'multiplayer'/, rel);
    }
    assert.match(read('public/js/features/account-backup-feature.js'), /const session = await quietSession\(account\);/);
    assert.match(read('public/js/features/account-backup-feature.js'), /import \{ quietSession \} from '\.\.\/online-boot\.js\?v=g436-2';/);
    assert.match(read('public/js/features/index.js'), /account-backup-feature\.js\?v=g436-3'/);
  });
});

describe('Map subtitle', () => {
  const view = { bgLocal: false, streets: [{ loaded: true }, { loaded: false }, { loaded: true }] };

  it('says what a player needs, without the art note', () => {
    const text = hubMapSubtitle(view);
    assert.equal(text, '3 streets · 2 playable here · click a street to set a destination or teleport · red star = you');
    assert.doesNotMatch(text, /geometry|painted/);
    assert.doesNotMatch(hubMapSubtitle({ ...view, bgLocal: true }), /geometry|painted/);
    assert.doesNotMatch(text, /—/, 'no em-dash');
  });

  it('keeps the art note for QA on data-map-art', () => {
    assert.equal(hubMapArtNote(view), 'geometry only');
    assert.equal(hubMapArtNote({ ...view, bgLocal: true }), 'painted bg');
    const game = read('public/game.js');
    assert.match(game, /sub\.textContent = hubMapSubtitle\(view\);\n\s+sub\.dataset\.mapArt = hubMapArtNote\(view\);/);
    assert.doesNotMatch(game, /'geometry only'/);
    assert.match(game, /from '\.\/js\/panel-copy\.js\?v=g396-1';/);
  });
});

describe('Quests header counts', () => {
  it('counts offers on their own, and leaves them out when there are none', () => {
    assert.equal(questLogSummary({ active: 2, offered: 1, done: 0, catalog: 445 }), '2 active · 1 offered · 0 done · 445 in catalog');
    assert.equal(questLogSummary({ active: 2, offered: 0, done: 3, catalog: 445 }), '2 active · 3 done · 445 in catalog');
  });

  it('game.js counts the offer cards it drew (put off and story offers) after drawing them', () => {
    const game = read('public/game.js');
    const at = game.indexOf('appendStoryQuestOffers(qBox);');
    const meta = game.indexOf("offered: qBox.querySelectorAll('.q-put-off, .story-offer').length,");
    assert.ok(at > 0 && meta > at, 'the header is written after every card is in the box');
    assert.doesNotMatch(game, /active · \$\{questState\.completed\.length\} done/);
    // The classes counted are the ones the two offer card builders use.
    assert.match(game, /card\.className = 'q-card story-offer';/);
    assert.match(read('public/js/features/quest-offers-feature.js'), /card\.className = 'q-card q-put-off';/);
  });
});

describe('Qurazy banner and the solo start card', () => {
  function engine(started) {
    const data = {};
    const e = {
      mode: 'solo',
      started,
      streetTsid: 'GLI2V0UN7RD1T2J',
      quoins: [],
      player: { x: 0, y: 0 },
      toasts: [],
      activity: [],
      placement: (key) => (key === QURAZY_PLACEMENT_GROUP ? [{ x: 900, y: 600 }] : [{ x: 100, y: 700 }]),
      spawnQuoin(spot, typeId) { const q = { x: spot.x, y: spot.y, baseY: spot.y - 58, typeId }; e.quoins.push(q); return q; },
      streetVisitsBefore: () => 0,
      streetLastVisits: () => ({}),
      transientInstance: () => false,
      hasBuff: () => false,
      pushActivity: (line) => e.activity.push(line),
      toast: (line) => e.toasts.push(line),
      save() {},
      setData: (k, v) => { data[k] = String(v); },
      data,
    };
    return e;
  }

  it('holds the banner while the card is up, and shows it once the card closes', async () => {
    resetQurazyFeatureForTests();
    const e = engine(false);
    qurazyFeature.onStreetEnter({ tsid: e.streetTsid }, e, {});
    assert.equal(e.quoins.length, 1, 'the Qurazy is placed under the card');
    assert.equal(e.data.qurazyOverlay, 'held');
    await new Promise((r) => setTimeout(r, 450));
    assert.deepEqual(e.toasts, [], 'nothing shown while the card is open');
    e.started = true; // beginGame: the card closes
    await new Promise((r) => setTimeout(r, 450));
    // No document in node, so the banner falls back to its line as a toast.
    assert.deepEqual(e.toasts, [QURAZY_SPAWN_LINE]);
  });

  it('a game already under way plays it at once', async () => {
    resetQurazyFeatureForTests();
    const e = engine(true);
    qurazyFeature.onStreetEnter({ tsid: e.streetTsid }, e, {});
    await new Promise((r) => setTimeout(r, 20));
    assert.notEqual(e.data.qurazyOverlay, 'held');
    assert.deepEqual(e.toasts, [QURAZY_SPAWN_LINE]);
    resetQurazyFeatureForTests();
  });
});

describe('style.css: word outline and solid dimmed upgrade cards', () => {
  const css = read('public/style.css');

  it('the running word gets a soft CSS outline, not new pixels', () => {
    assert.match(css, /\.word-progress-word \{[^}]*filter: drop-shadow\(0 0 1px rgba\(0, 0, 0, 0\.55\)\) drop-shadow\(0 1px 1\.5px rgba\(0, 0, 0, 0\.3\)\);/);
  });

  it('a tutorial card you cannot buy stays opaque; only its suit, art, title and cost fade', () => {
    assert.match(css, /\.nx-hand \.nx-up\.dim \{ opacity: 1;/);
    assert.match(css, /\.nx-hand \.nx-up\.dim > img:is\(\[src\*="\/suit_"\], \[src\*="\/art_"\], \[src\*="\/icon_"\]\),/);
  });

  it('a bag\'s icon is centred above its 13px opener strip', () => {
    assert.match(css, /\.pack-slots \.pack-slot\.pack-bag \{\n\s+flex-direction: column;\n[^}]*justify-content: center;\n\s+padding: 0 0 13px;/);
    assert.match(css, /\.pack-bag-opener \{[^}]*height: 13px;/);
  });

  it('the pack rows leave room for a selected slot\'s lift and ring without growing the pack', () => {
    const row = css.match(/\n\.pack-slots \{[^}]*\}/)[0];
    assert.match(row, /overflow-x: auto;/);
    assert.match(row, /padding: 5px 0;/);
    assert.match(row, /margin-block: calc\(0\.08rem - 5px\);/);
    assert.match(row, /min-height: calc\(44px \+ 10px - 0\.16rem\);/);
    assert.match(css, /\.pack-slots\.pack-tools \{\n\s+min-height: calc\(42px \+ 10px - 0\.16rem\);/);
    assert.match(css, /\.pack-slots \{\n\s+gap: 0\.34rem;\n\s+min-height: calc\(52px \+ 10px - 0\.16rem\);/);
    // What needs the room: the lift (2px) and the ring (2px) of .active.
    assert.match(css, /\.pack-slots \.pack-slot\.active \{[^}]*box-shadow: 0 0 0 2px [^}]*transform: translateY\(-2px\);/);
  });

  it('the solo page links style.css with the polish key', () => {
    assert.match(read('public/play/index.html'), /style\.css\?v=[^"]*&amp;polish=g396-1[&"]/);
  });
});
