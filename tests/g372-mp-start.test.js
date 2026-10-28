/**
 * G322 and G320, multiplayer polish (lane MPCHECK, 2026-10-27).
 *
 * G322: a signed-out visit to /play/online/ asked admin-ajax rest-nonce first and the console showed
 * its 400 ("0", WordPress's wp_ajax_rest_nonce for nobody). js/online-boot.js quietSession asks
 * admin-ajax's heartbeat first, which answers 200 to anyone (wp_ajax_nopriv_heartbeat signed out,
 * wp_ajax_heartbeat's empty _nonce error signed in), so only a signed-in page asks rest-nonce.
 *
 * G320: on the multiplayer start card the street's "Arrived:" toast and the Qurazy banner played over
 * the card, and at 390 px the chat dock and pack covered its bottom. The online page's style lifts the
 * card over them and lets it scroll inside the game frame; game.js holds the toast's clock and
 * qurazy-feature holds the banner until the card closes (engine.started). Solo is unchanged
 * (since 2026-10-28 solo waits for its start card too: tests/solo-polish.test.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quietSession } from '../public/js/online-boot.js?v=g399-1';
import { createMinnAccount } from '../public/js/minn-account.js?v=nbhome-10';
import { buildOnlinePage, ONLINE_BOOT_SRC } from '../tools/play-online/build.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const BASE = 'https://groddle.localhost/';
const BEAT = 'wp-admin/admin-ajax.php?action=heartbeat';
const NONCE = 'wp-admin/admin-ajax.php?action=rest-nonce';
const ME = 'wp-json/groddle/v1/me';

/** A fetch answering by URL suffix: { status, body, nonce } or 'network'; unknown URLs 404. */
function routedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    const answer = key ? routes[key] : { status: 404, body: '<!doctype html>Not found' };
    if (answer === 'network') throw new TypeError('Failed to fetch');
    const headers = new Map(answer.nonce ? [['x-wp-nonce', answer.nonce]] : []);
    return {
      status: answer.status,
      ok: answer.status >= 200 && answer.status < 300,
      headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
      json: async () => (typeof answer.body === 'string' ? JSON.parse(answer.body) : answer.body),
      text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)),
    };
  };
  return { fn, calls };
}
// What Minn answered on groddle.localhost (curl, 2026-10-27): the same shapes as WordPress.
const BEAT_OUT = { status: 200, body: { 'wp-auth-check': false, server_time: 1793138579 } };
const BEAT_IN = { status: 200, body: { success: false } };
const quiet = (f) => quietSession(createMinnAccount({ baseUri: BASE, fetch: f.fn }), { fetch: f.fn, baseUri: BASE });

describe('G322: /play/online/ signed out asks no rest-nonce', () => {
  it('signed out: the heartbeat, then me without a nonce; rest-nonce (the 400) is never asked', async () => {
    const f = routedFetch({ [BEAT]: BEAT_OUT, [NONCE]: { status: 400, body: '0' }, [ME]: { status: 200, body: { signedIn: false, player: null } } });
    assert.deepEqual(await quiet(f), { minn: true, signedIn: false, player: null, backups: null, account: null });
    assert.deepEqual(f.calls.map((c) => c.url), [`${BASE}${BEAT}`, `${BASE}${ME}`]);
    assert.equal(f.calls[0].method, 'POST', 'a POST, as heartbeat.js sends it');
    assert.equal(f.calls[0].credentials, 'same-origin');
    assert.equal(f.calls[1].headers, undefined, 'no nonce header');
  });

  it('signed in: the heartbeat\'s {"success":false} hands over to account.session() (rest-nonce, then me with it)', async () => {
    const f = routedFetch({
      [BEAT]: BEAT_IN,
      [NONCE]: { status: 200, body: 'abcdef0123' },
      [ME]: { status: 200, body: { signedIn: true, player: { id: 3, name: 'Tess' }, backups: { slots: 3, maxBytes: 4194304 } } },
    });
    const s = await quiet(f);
    assert.equal(s.signedIn, true);
    assert.equal(s.player.name, 'Tess');
    assert.deepEqual(f.calls.map((c) => c.url.replace(BASE, '')), [BEAT, NONCE, ME]);
    assert.equal(f.calls[2].headers['X-WP-Nonce'], 'abcdef0123');
  });

  it('a static server (no admin-ajax) is no Minn; an unreachable site is offline', async () => {
    const none = routedFetch({});
    assert.deepEqual(await quiet(none), { minn: false, signedIn: false, player: null });
    assert.equal(none.calls.length, 1);
    const html = routedFetch({ [BEAT]: { status: 200, body: '<!doctype html>a page' } });
    assert.deepEqual(await quiet(html), { minn: false, signedIn: false, player: null });
    const gone = routedFetch({ [BEAT]: 'network' });
    assert.equal((await quiet(gone)).offline, true);
    const meGone = routedFetch({ [BEAT]: BEAT_OUT, [ME]: 'network' });
    assert.equal((await quiet(meGone)).offline, true);
  });

  it('a site without the groddle routes (heartbeat but no me) is no Minn', async () => {
    const f = routedFetch({ [BEAT]: BEAT_OUT });
    assert.deepEqual(await quiet(f), { minn: false, signedIn: false, player: null });
  });

  it('boot() asks quietSession, and the page loads online-boot under its new key', () => {
    const boot = read('public/js/online-boot.js');
    const body = boot.slice(boot.indexOf('async function boot()'), boot.indexOf('async function enter('));
    assert.match(body, /const session = await quietSession\(account\);/);
    assert.doesNotMatch(body, /account\.session\(\)/);
    assert.equal(ONLINE_BOOT_SRC, 'js/online-boot.js?v=g399-1');
    assert.match(read('public/play/online/index.html'), /src="js\/online-boot\.js\?v=g\d+-\d+"/);
    assert.ok(read('public/play/online/index.html').includes(`src="${ONLINE_BOOT_SRC}"`));
  });
});

describe('G320: the multiplayer start card', () => {
  const page = buildOnlinePage(read('public/play/index.html'));

  it('the online page lifts the card over the chat dock and pack and lets it scroll inside the game frame', () => {
    assert.match(page, /#overlay:not\(\.hidden\) \{ z-index: 80;/);
    assert.match(page, /#overlay:not\(\.hidden\) > \.card \{ max-height: 100%; overflow-y: auto;/);
    assert.match(page, /@media \(max-width: 560px\) \{\n\s+#overlay:not\(\.hidden\) > \.card \{ width: 100%;/);
    // Above the chat dock (26) and the toast (50): style.css.
    const css = read('public/style.css');
    assert.match(css, /\.local-chat-dock \{[^}]*z-index: 26;/);
    assert.match(css, /\.overlay \{[^}]*z-index: 5;/);
  });

  it('the street\'s toasts, activity lines and Qurazy banner are hidden while the card is up (multiplayer page only)', () => {
    assert.match(page, /#game-root:has\(> #overlay:not\(\.hidden\)\) :is\(\.toast, \.activity-feed, \.qurazy-overlay\) \{ visibility: hidden; \}/);
    assert.doesNotMatch(read('public/play/index.html'), /#overlay:not\(\.hidden\)/, 'solo /play/ is unchanged');
    assert.equal(read('public/play/online/index.html'), page, 'the generated page is current');
  });

  it('game.js holds a toast\'s clock behind the start card in multiplayer only (solo still holds only for a street card)', () => {
    const src = read('public/game.js');
    assert.match(src, /function toastHeld\(\) \{\n\s+return streetCardUp\(\) \|\| \(GAME_MODE === 'multiplayer' && !state\.started\);\n\}/);
    assert.match(src, /state\.toastHeldAt = toastHeld\(\) \? state\.toastTimer - ms : 0;/);
    assert.match(src, /if \(toastHeld\(\)\) state\.toastHeldAt \|\|= t;/);
    // The card closes in beginGame: overlay hidden, then state.started.
    assert.match(src, /document\.getElementById\('overlay'\)\.classList\.add\('hidden'\);\n\s+state\.started = true;/);
  });

  it('qurazy-feature waits for the start card before it plays the banner (multiplayer, and solo since 2026-10-28)', () => {
    const src = read('public/js/features/qurazy-feature.js');
    assert.match(src, /function afterStartCard\(engine, run\) \{\n\s+if \(engine\.started !== false\) return Promise\.resolve\(true\);/);
    assert.match(src, /const run = \+\+bannerRun;\n\s+if \(!\(await afterStartCard\(engine, run\)\) \|\| run !== bannerRun\) return;/);
    assert.match(read('public/js/features/index.js'), /qurazy-feature\.js\?v=g\d+-\d+'/);
  });
});
