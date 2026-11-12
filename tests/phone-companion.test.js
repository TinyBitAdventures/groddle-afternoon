/**
 * The phone companion (Austin 2026-10-31: /play/online/ on an iPhone crashed the tab; the game
 * on a street holds about 450 MB of textures and fetches about 125 MB). Phones and touch-only
 * tablets get play/phone/ instead: reports, mail and friends over the routes the game already
 * uses. Checked here:
 * - the #phone-gate script on /play/ and /play/online/ (the device rules, the override, the
 *   redirect that keeps the hash, and its place ahead of every stylesheet and script);
 * - the companion page never reaches the game bundle (its whole import graph, and its bytes);
 * - each panel's data and calls (js/phone/companion-data.js), the sign-in path, the copy;
 * - the site's tokens in play/phone/phone.css, and the site's new route
 *   (groddle-afternoon-site src/BuddiesOnline.php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { createMinnAccount } from '../public/js/minn-account.js?v=460de12b';
import { REPORT_PICTURE } from '../public/js/reports.js?v=d6df7b91';
import {
  DEVICE_KEY,
  PHONE_TEXT,
  createPresenceApi,
  fitPhoto,
  friendsView,
  fullGameHref,
  itemNamesFrom,
  itemWords,
  mailRows,
  mailboxFromSave,
  phoneContext,
  photoAttempts,
  snippetOf,
  unreadLetters,
  whereWords,
} from '../public/js/phone/companion-data.js?v=133c3949';

const pub = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');

// —— the device rules ——

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

const gateOf = (html) => html.match(/<script id="phone-gate">([\s\S]*?)<\/script>/)?.[1];

/** Runs a page's #phone-gate with a made-up device; answers where it went (or null) and what it called. */
function runGate(script, { ua, touch = 0, fine = true, coarse = false, screen = [1440, 900], stored = null, path = '/play/online/', hash = '', storageThrows = false, base = 'https://groddle.localhost/' } = {}) {
  const calls = [];
  const store = { getItem: (k) => { if (storageThrows) throw new Error('SecurityError'); return k === 'groddle-play-device' ? stored : null; } };
  const window = {
    navigator: { userAgent: ua, maxTouchPoints: touch },
    matchMedia: (q) => ({ matches: q === '(any-pointer: fine)' ? fine : q === '(any-pointer: coarse)' ? coarse : false }),
    screen: { width: screen[0], height: screen[1] },
    location: { pathname: path, hash, replace: (u) => calls.push(['replace', u]) },
    stop: () => calls.push(['stop']),
    get localStorage() { return store; },
  };
  vm.runInNewContext(script, { window, document: { baseURI: base }, URL });
  const replaced = calls.find((c) => c[0] === 'replace');
  return { to: replaced ? replaced[1] : null, calls, window };
}

describe('the phone gate on /play/ and /play/online/', () => {
  const solo = read('play/index.html');
  const online = read('play/online/index.html');
  const script = gateOf(solo);

  it('is the same script on both pages, and the online page keeps mode-entry first', () => {
    assert.ok(script, 'play/index.html has #phone-gate');
    assert.equal(gateOf(online), script, 'tools/play-online/build.mjs carries it over');
    const scripts = [...online.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    assert.deepEqual(scripts.slice(0, 2), ['<script id="mode-entry">', '<script id="phone-gate">']);
    assert.equal([...solo.matchAll(/<script\b[^>]*>/g)][0][0], '<script id="phone-gate">');
  });

  it('runs before any stylesheet, font, Pixi or game file, right after <base>', () => {
    for (const [name, html] of [['play/', solo], ['play/online/', online]]) {
      const at = html.indexOf('<script id="phone-gate">');
      assert.ok(at > html.indexOf('<base href='), `${name}: after <base>, so play/phone/ resolves from the site root`);
      for (const tag of ['<link', '<script src', '<script type="module"', '<img']) assert.ok(at < html.indexOf(tag), `${name}: ahead of ${tag}`);
    }
  });

  it('sends phones to the companion and keeps the hash (report, verify and reset links)', () => {
    const r = runGate(script, { ua: UA.iphone, touch: 5, fine: false, coarse: true, screen: [393, 852], hash: '#report=12' });
    assert.equal(r.to, 'https://groddle.localhost/play/phone/#report=12');
    assert.deepEqual(r.calls.map((c) => c[0]), ['stop', 'replace'], 'the page stops loading first');
    assert.equal(r.window.GRODDLE_PHONE, true);
    assert.equal(runGate(script, { ua: UA.android, touch: 5, fine: false, coarse: true, screen: [412, 915] }).to, 'https://groddle.localhost/play/phone/');
    assert.equal(runGate(script, { ua: UA.iphone, touch: 5, fine: false, path: '/play/', hash: '#verify=abc' }).to, 'https://groddle.localhost/play/phone/?from=solo#verify=abc');
  });

  it('sends touch-only tablets too, but a tablet with a trackpad or mouse plays', () => {
    // iPadOS says it is a Mac; the touch points give it away.
    assert.ok(runGate(script, { ua: UA.mac, touch: 5, fine: false, coarse: true, screen: [820, 1180] }).to);
    assert.ok(runGate(script, { ua: UA.ipadOld, touch: 5, fine: false, coarse: true, screen: [768, 1024] }).to);
    assert.ok(runGate(script, { ua: UA.androidTablet, touch: 10, fine: false, coarse: true, screen: [800, 1280] }).to);
    assert.equal(runGate(script, { ua: UA.mac, touch: 5, fine: true, coarse: true, screen: [1024, 1366] }).to, null, 'iPad with a Magic Keyboard');
    assert.equal(runGate(script, { ua: UA.androidTablet, touch: 10, fine: true, coarse: true, screen: [800, 1280] }).to, null, 'Android tablet with a mouse');
  });

  it('leaves computers alone: Mac, Windows with a touch screen, Linux, an Android phone asking for the desktop site still goes', () => {
    assert.equal(runGate(script, { ua: UA.mac }).to, null);
    assert.equal(runGate(script, { ua: UA.windows, touch: 10, fine: true, coarse: true, screen: [1920, 1080] }).to, null);
    assert.equal(runGate(script, { ua: UA.linux }).to, null);
    assert.equal(runGate(script, { ua: UA.mac, screen: [1280, 800] }).to, null, 'a narrow desktop window is still a computer');
    assert.ok(runGate(script, { ua: UA.linux, touch: 5, fine: false, coarse: true, screen: [412, 915] }).to, 'request desktop site on a phone');
  });

  it('follows the remembered choice: full plays anywhere, companion everywhere', () => {
    assert.equal(DEVICE_KEY, 'groddle-play-device');
    assert.match(script, new RegExp(`var KEY = '${DEVICE_KEY}';`));
    assert.equal(runGate(script, { ua: UA.iphone, touch: 5, fine: false, stored: 'full' }).to, null);
    assert.ok(runGate(script, { ua: UA.mac, stored: 'companion' }).to);
    assert.ok(runGate(script, { ua: UA.iphone, touch: 5, fine: false, storageThrows: true }).to, 'blocked storage still guesses');
  });

  it('says so in plain words, no em dashes', () => {
    assert.doesNotMatch(script, /—/);
  });
});

// —— the companion never loads the game ——

/** Every module a module imports, transitively (relative specifiers, the ?v= keys dropped). */
function importGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s*['"](\.{1,2}\/[^'"?]+)[^'"]*['"]|import\(\s*['"](\.{1,2}\/[^'"?]+)[^'"]*['"]\s*\)/g)) {
      walk(resolve(dirname(file), m[1] || m[2]));
    }
  };
  walk(entry);
  return [...seen].map((f) => relative(pub, f));
}

describe('play/phone/ (the companion page)', () => {
  const html = read('play/phone/index.html');
  const entry = html.match(/<script type="module" src="(js\/phone\/companion\.js)\?v=[^"]+"><\/script>/)?.[1];
  const graph = entry ? importGraph(join(pub, entry)) : [];

  it('loads its module, the site theme switch and its own stylesheet, nothing of the game', () => {
    assert.ok(entry);
    assert.match(html, /<base href="\.\.\/\.\.\/" \/>/);
    assert.match(html, /<script src="site\/theme\.js\?v=[0-9a-f]{8}"><\/script>/);
    assert.match(html, /<button class="site-nav-theme" type="button" aria-label="Colour theme"><\/button>/);
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /pixi|game\.js|href="style\.css|classic\.css|data-versions\.js|phone-gate/);
    assert.match(html, /<a href="credits\/">Credits<\/a> · <a href="privacy-policy\/">Privacy<\/a>/);
  });

  it('its import graph never reaches game.js, Pixi, the save store or a feature', () => {
    assert.ok(graph.includes('js/account-forms.js') && graph.includes('js/reports.js') && graph.includes('js/mailbox.js'), graph.join(' '));
    for (const f of graph) {
      assert.doesNotMatch(f, /^(game\.js|vendor\/|js\/features\/|js\/ui\/|js\/save-store\.js|js\/game-mode\.js|js\/player-save\.js)/, f);
    }
    for (const f of graph) assert.doesNotMatch(readFileSync(join(pub, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''), /\bPIXI\./, `${f} draws nothing with Pixi`);
  });

  it('loads the account\'s core only, and every call its pages make is in the core', async () => {
    assert.ok(graph.includes('js/minn-account-core.js'), graph.join(' '));
    assert.ok(!graph.includes('js/minn-account.js'), 'the game-only calls stay out of the phone');
    const { createMinnAccountCore } = await import('../public/js/minn-account-core.js?v=74c75177');
    const core = createMinnAccountCore({ baseUri: 'https://groddle.localhost/', fetch: async () => ({}) });
    const used = new Set();
    for (const f of ['js/phone/companion.js', 'js/account-forms.js', 'js/online-boot.js', 'js/phone/companion-data.js']) {
      const src = readFileSync(join(pub, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      for (const m of src.matchAll(/\baccount\.([a-zA-Z]+)/g)) used.add(m[1]);
    }
    assert.ok(used.size > 10, [...used].join(' '));
    for (const name of used) assert.ok(name in core, `account.${name} is not in js/minn-account-core.js`);
  });

  // 250 KB from 240 (2026-11-11): site/theme.js gained the Analytics pageview beacon (about 1 KB).
  it('stays small: everything it loads before a panel opens is under 250 KB', () => {
    const files = ['play/phone/index.html', 'play/phone/phone.css', 'site/theme.js', 'site/site-nav.css', 'favicon.svg', ...graph];
    const bytes = files.reduce((n, f) => n + statSync(join(pub, f)).size, 0);
    assert.ok(bytes < 250 * 1024, `${bytes} bytes`);
  });

  it('signs in with the game\'s own forms and the /play/online/ gate\'s session check', () => {
    const js = read('js/phone/companion.js');
    assert.match(js, /import \{ mountAccountForms, resetLinkFrom, verifyLinkFrom \} from '\.\.\/account-forms\.js\?v=/);
    // The gate's session check alone (js/online-session.js), not the gate's card (js/online-boot.js re-exports it).
    assert.match(js, /import \{ gateFor, quietSession, suspendedNow \} from '\.\.\/online-session\.js\?v=/);
    assert.ok(!graph.includes('js/online-boot.js'), 'the start card stays out of the phone');
    assert.match(js, /mountAccountForms\(host, \{\n\s*account,\n\s*start: location\.hash === '#new' \? 'signup' : 'signin',\n\s*reset: resetLinkFrom\(location\.hash\),\n\s*verify: verifyLinkFrom\(location\.hash\),/);
    assert.match(js, /reports = createReportsApi\(\{ baseUri: doc\.baseURI, nonce: account\.nonce \}\);/, 'the ticket calls carry the signed-in nonce');
    assert.match(js, /await account\.signOut\(\)/);
    // online-boot only boots on a page with #online-boot, which the companion never has.
    assert.match(read('js/online-boot.js'), /if \(typeof document !== 'undefined' && document\.getElementById\('online-boot'\)\) \{/);
    assert.doesNotMatch(html, /id="online-boot"/);
  });

  it('writes to the save never: Mail is read only', () => {
    const js = read('js/phone/companion.js');
    assert.doesNotMatch(js, /\.writeBackup|method: 'PUT'|['"]save['"], \{ method/);
    // A peek: the phone neither claims the save from a game window nor catches it up (ticket 21).
    assert.match(js, /account\.multiplayerSave\(\{ peek: true \}\)/);
  });

  it('the copy is plain: no em dashes, never the old game\'s name', () => {
    const words = JSON.stringify(PHONE_TEXT, (k, v) => (typeof v === 'function' ? v('Ada', 3) : v));
    for (const text of [words, html.replace(/<!--[\s\S]*?-->/g, ''), read('js/phone/companion.js').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')]) {
      assert.doesNotMatch(text, /—/);
      assert.doesNotMatch(text, /Glitch/);
    }
  });
});

// —— the panels' data ——

const NOW = Date.parse('2026-10-31T18:00:00Z');
const SAVE = {
  version: 4,
  data: {
    kind: 'groddle-multiplayer',
    format: 1,
    entries: {
      playerState: JSON.stringify({
        systems: {
          mailbox: {
            nextId: 6,
            messages: [
              { id: 'mail-1', sender: 'Tiny Speck Post', text: 'Welcome!', sentAt: NOW - 86400000, deliveryAt: NOW - 86400000, read: true },
              { id: 'mail-2', sender: 'Bo', text: 'Cherries   for\nyou', sentAt: NOW - 3600000, deliveryAt: NOW - 3600000, attachment: { classTsid: 'cherry', count: 3 }, currants: 25 },
              { id: 'mail-3', sender: 'Cy', text: 'Later', sentAt: NOW, deliveryAt: NOW + 60000 },
              { id: 'mail-4', sender: 'Di', text: 'Old', sentAt: NOW - 7200000, deliveryAt: NOW - 7200000, archived: true },
              { id: 'mail-5', sender: 'Frog', text: 'Express', sentAt: NOW - 60000, deliveryAt: NOW - 60000, express: true, inMailbox: false, attachment: { classTsid: 'all_spice', count: 1 } },
            ],
          },
        },
      }),
    },
  },
};

describe('Mail: the save\'s mailbox, read only', () => {
  it('reads the inbox from groddle/v1/save, newest first, as the game lists it', () => {
    const rows = mailRows(mailboxFromSave(SAVE), NOW);
    assert.deepEqual(rows.map((r) => r.id), ['mail-5', 'mail-2', 'mail-1'], 'not yet delivered and archived letters stay out');
    assert.equal(rows[2].sender, 'Groddle Afternoon Post', 'the old post office reads as the new one');
    assert.deepEqual(rows[1].item, { id: 'cherry', count: 3 });
    assert.equal(rows[1].currants, 25);
    assert.equal(rows[1].snippet, 'Cherries for you');
    assert.equal(rows[1].collected, false);
    assert.equal(rows[0].onItsWay, true, 'an express letter the Frog has not handed over');
    assert.equal(rows[2].collected, true);
    assert.equal(unreadLetters(rows), 2);
  });

  it('has nothing to show for a character with no save or no mailbox', () => {
    assert.equal(mailboxFromSave({ version: 0, data: null }), null);
    assert.equal(mailboxFromSave({ data: { entries: { playerState: '{nope' } } }), null);
    assert.deepEqual(mailRows(null), []);
  });

  it('names an attachment from the item catalog, or from its id', () => {
    const names = itemNamesFrom({ items: [{ id: 'cherry', name: 'Cherry' }, { id: 7 }] });
    assert.equal(names.get('cherry'), 'Cherry');
    assert.equal(names.size, 1);
    assert.equal(itemWords('all_spice'), 'All Spice');
    assert.equal(PHONE_TEXT.mailItem(3, 'Cherry'), '3 × Cherry');
    assert.equal(PHONE_TEXT.mailCurrants(1200), '1,200 currants');
  });

  it('cuts a long letter at a word', () => {
    assert.equal(snippetOf('short'), 'short');
    const s = snippetOf('word '.repeat(40));
    assert.ok(s.length <= 91 && s.endsWith('…') && !s.includes('  '));
  });
});

describe('Friends: the lists and who is playing', () => {
  const LIST = {
    limit: 1000,
    buddies: [{ id: 2, name: 'Bo', mutual: true }, { id: 4, name: 'Di', mutual: false }],
    reverse: [{ id: 2, name: 'Bo', new: false }, { id: 5, name: 'Ed', new: true }, { id: 6, name: 'Fi', new: false }],
    ignoring: [{ id: 3, name: 'Cy' }],
    watch: { token: 't', expiresIn: 3600 },
  };

  it('puts the playing ones first with where they are, then the rest, then who added you', () => {
    const v = friendsView(LIST, { live: true, online: [{ id: 2, name: 'Bo', street: 'Cebarkul', hub: 'Uralia' }, { id: 6, name: 'Fi', street: '', hub: '' }, { id: 9, name: 'Stranger', street: 'X' }] });
    assert.deepEqual(v.online, [{ id: 2, name: 'Bo', where: 'Cebarkul, Uralia' }, { id: 6, name: 'Fi', where: 'A secret place' }]);
    assert.deepEqual(v.offline.map((b) => b.id), [4]);
    assert.deepEqual(v.addedYou.map((b) => b.id), [5], 'Fi is playing, so listed once');
    assert.equal(v.live, true);
    assert.equal(v.empty, false);
  });

  it('shows the lists alone when presence did not answer', () => {
    const v = friendsView(LIST, null);
    assert.equal(v.live, false);
    assert.deepEqual(v.online, []);
    assert.deepEqual(v.offline.map((b) => b.id), [2, 4]);
    assert.equal(friendsView({}, { live: true, online: [] }).empty, true);
    assert.equal(whereWords({ street: 'Cebarkul', hub: '' }), 'Cebarkul');
  });

  it('asks groddle/v1/buddies/online with the session nonce, and once more with a fresh one', async () => {
    const calls = [];
    const answers = [
      { status: 403, body: { code: 'rest_cookie_invalid_nonce' } },
      { status: 200, text: 'abcdef0123' },
      { status: 200, body: { live: true, online: [{ id: 2 }] } },
    ];
    const fetch = async (url, init = {}) => {
      calls.push([url, init.headers?.['X-WP-Nonce'] || '']);
      const a = answers.shift();
      return { ok: a.status < 300, status: a.status, json: async () => a.body, text: async () => a.text, headers: { get: () => null } };
    };
    const account = { nonce: '0123456789', urls: { api: 'https://g.test/wp-json/groddle/v1/', nonce: 'https://g.test/wp-admin/admin-ajax.php?action=rest-nonce' } };
    const r = await createPresenceApi({ account, fetch }).online();
    assert.deepEqual(r, { live: true, online: [{ id: 2 }] });
    assert.deepEqual(calls, [
      ['https://g.test/wp-json/groddle/v1/buddies/online', '0123456789'],
      ['https://g.test/wp-admin/admin-ajax.php?action=rest-nonce', ''],
      ['https://g.test/wp-json/groddle/v1/buddies/online', 'abcdef0123'],
    ]);
    const down = createPresenceApi({ account, fetch: async () => { throw new Error('net'); } });
    await assert.rejects(down.online(), (e) => e.status === 0);
  });

  it('the lists come through the game\'s own buddy call (groddle/v1/buddies)', async () => {
    const urls = [];
    const fetch = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => LIST, headers: { get: () => null } }; };
    const account = createMinnAccount({ baseUri: 'https://g.test/play/phone/', fetch, nonce: '0123456789' });
    assert.equal((await account.buddies()).buddies.length, 2);
    assert.deepEqual(urls, ['https://g.test/play/phone/wp-json/groddle/v1/buddies']);
    assert.equal(createMinnAccount({ baseUri: new URL('../../', 'https://g.test/play/phone/').href }).urls.api, 'https://g.test/wp-json/groddle/v1/', 'the page\'s <base> is the site root');
  });
});

describe('Reports: a photo instead of a game picture', () => {
  it('tries the site\'s sizes largest first, the shape kept', () => {
    const a = photoAttempts(4032, 3024);
    assert.deepEqual(a[0], { width: 1280, height: 960, quality: 0.8 });
    assert.deepEqual(a.at(-1), { width: 800, height: 600, quality: 0.6 });
    assert.equal(a.length, REPORT_PICTURE.widths.length * REPORT_PICTURE.qualities.length);
    assert.deepEqual(photoAttempts(3024, 4032)[0], { width: 960, height: 1280, quality: 0.8 }, 'a portrait photo fits the 1280 box');
    assert.deepEqual(photoAttempts(0, 10), []);
  });

  it('keeps the first JPEG that fits 300 KiB, and gives up on anything that is not a JPEG', () => {
    const big = 'A'.repeat(420000);
    const small = 'A'.repeat(200000);
    const tried = [];
    const got = fitPhoto(4032, 3024, (w, h, q) => { tried.push([w, q]); return `data:image/jpeg;base64,${tried.length < 3 ? big : small}`; });
    assert.deepEqual(tried, [[1280, 0.8], [1280, 0.7], [1280, 0.6]]);
    assert.equal(got.width, 1280);
    assert.ok(got.bytes <= REPORT_PICTURE.maxBytes);
    assert.equal(fitPhoto(100, 100, () => 'data:image/png;base64,AAAA'), null);
    assert.equal(fitPhoto(100, 100, () => `data:image/jpeg;base64,${big}`), null);
  });

  it('sends the context keys the site keeps, marked as from the phone', () => {
    const c = phoneContext({ location: { pathname: '/play/phone/' }, navigator: { userAgent: 'x'.repeat(400) }, innerWidth: 393, innerHeight: 852 });
    assert.equal(c.build, 'phone');
    assert.equal(c.page, '/play/phone/');
    assert.equal(c.agent.length, 300);
    assert.equal(c.screen, '393x852');
    assert.deepEqual(Object.keys(c).sort(), ['agent', 'build', 'errors', 'page', 'screen', 'street', 'streetName', 'x', 'y']);
  });

  it('Load the full game anyway goes back where the player came from', () => {
    assert.equal(fullGameHref(''), 'play/online/');
    assert.equal(fullGameHref('?from=solo'), 'play/');
  });
});

describe('the site\'s look', () => {
  const tokens = (css, re) => Object.fromEntries([...(css.match(re)?.[1] || '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const phone = read('play/phone/phone.css');
  const site = read('restoration/restoration.css');

  it('uses restoration.css\'s colour tokens, light and dark, and the font is Nunito', () => {
    const light = /:root \{([^}]*)\}/;
    const dark = /:root\[data-theme="dark"\] \{([^}]*)\}/;
    const media = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/;
    for (const re of [light, dark, media]) {
      const mine = tokens(phone, re);
      const theirs = tokens(site, re);
      assert.ok(Object.keys(mine).length >= 15, String(re));
      for (const [k, v] of Object.entries(mine)) if (k in theirs) assert.equal(v, theirs[k], `${k} ${re}`);
      for (const k of ['--bg', '--surface', '--fg', '--muted', '--border', '--accent', '--moss']) assert.equal(mine[k], theirs[k], k);
    }
    assert.match(phone, /font-family: Nunito;/);
    assert.match(phone, /url\("\.\.\/\.\.\/assets\/fonts\/nunito\/nunito-roman-latin\.woff2"\)/);
    assert.ok(existsSync(join(pub, 'assets/fonts/nunito/nunito-roman-latin.woff2')));
  });
});

describe('groddle/v1/buddies/online (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const php = existsSync('/opt/homebrew/bin/php') ? '/opt/homebrew/bin/php' : 'php';
  const src = () => readFileSync(sitePath('src/BuddiesOnline.php'), 'utf8');
  const run = (code) => execFileSync(php, ['-r', `require ${JSON.stringify(sitePath('src/BuddiesOnline.php'))}; ${code}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

  it('is one signed-in, read-only route over the realtime server\'s own list', () => {
    const s = src();
    assert.match(s, /#\[Route\(Method::Get, '\/groddle\/v1\/buddies\/online', policy: new Policy\(Access::SignedIn\)\)\]/);
    assert.equal((s.match(/#\[Route/g) || []).length, 1);
    assert.doesNotMatch(s, /\$request->json\(\)|INSERT|UPDATE|DELETE/);
    assert.match(s, /\(new RealtimeCall\(\$this->minn\)\)->post\('online', \[\]\)/);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new Buddies\(\$minn\), new BuddiesOnline\(\$minn\)/);
  });

  it('tells only about players held either way and ignored neither way (buddies.go tellable)', () => {
    let out;
    try {
      out = run(`echo json_encode(Groddle\\Minn\\BuddiesOnline::shown([['id'=>2,'name'=>'bo','street'=>'GA1'],['id'=>3,'name'=>'Cy','street'=>'GA1'],['id'=>4,'name'=>'Al','street'=>''],['id'=>7,'name'=>'Me','street'=>'GA1'],['id'=>9,'name'=>'Zed','street'=>'GA1'],['id'=>2,'name'=>'bo','street'=>'GA2'],['id'=>'x']], 7, [2,3,4,7], [3]));`);
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    assert.deepEqual(JSON.parse(out), [{ id: 4, name: 'Al', street: '' }, { id: 2, name: 'bo', street: 'GA1' }]);
  });

  it('names a street from the game\'s index, its L tsid too; anything else is a secret place', () => {
    let out;
    try {
      out = run(`$i=['GIF1'=>['label'=>'Cebarkul','hubName'=>'Uralia']]; echo json_encode(array_map(fn($t) => Groddle\\Minn\\BuddiesOnline::where($t, $i), ['GIF1','LIF1','HOME_7','RACE_x','','GZZZ']));`);
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    const none = { street: '', hub: '' };
    assert.deepEqual(JSON.parse(out), [{ street: 'Cebarkul', hub: 'Uralia' }, { street: 'Cebarkul', hub: 'Uralia' }, none, none, none, none]);
  });
});
