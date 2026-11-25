/**
 * G353: Report a bug from the game's header, in multiplayer (the original's
 * bug icon, GameHeaderUI.as 47-69, and form, BootError.as 280-290). Reports go
 * to the site's groddle/v1/feedback (groddle-afternoon-site src/BugReports.php)
 * as private Bug reports (minn.json "types": groddle_feedback).
 */
import { describe, it } from 'node:test';
import { pngBufferToWebp } from '../tools/webp-lossless.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUGS_BOARD_URL, BUG_TEXT, MAX_MESSAGE, SOLO_BUGS_TIP, benignError, bugReportFeature, bugsBoardHref, buildKey, pageErrorLine, realtimeLine, rememberError, reportContext } from '../public/js/features/bug-report-feature.js?v=46b6b9fb';
import { createMinnAccount } from '../public/js/minn-account.js?v=7c3bdd51';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = process.env.GRODDLE_SITE_DIR || join(root, '..', 'groddle-afternoon-site');
const client = readFileSync(join(root, '../glitch-client/com/tinyspeck/engine/view/ui/chrome/GameHeaderUI.as'), 'utf8');
const bootError = readFileSync(join(root, '../glitch-client/com/tinyspeck/debug/BootError.as'), 'utf8');

describe('Report a bug (G353)', () => {
  it('welcomes feedback, suggestions and bugs, with the original client\'s icon', () => {
    // The original asked only for bugs (tip_txt 'Report a bug', BootError.as "Thanks for reporting a bug!");
    // Austin widened it to any feedback, suggestions or bugs (2026-10-30).
    assert.match(client, /tip_txt = 'Report a bug'/);
    assert.ok(bootError.includes('<h1>Thanks for reporting a bug!</h1>'));
    assert.equal(BUG_TEXT.tip, 'Feedback, ideas and bugs');
    assert.match(BUG_TEXT.label, /feedback.*suggestion.*bug/);
    assert.ok(bootError.includes(`<p>${BUG_TEXT.send}</p>`));
    const icon = readFileSync(join(root, 'public/assets/ui/bug_icon.webp'));
    const original = readFileSync(join(root, '../glitch-client/TSEngineAssets/src/assets/graphics/bug_icon.png'));
    assert.ok(icon.equals(pngBufferToWebp(original)), 'the icon is the client\'s own bug_icon.png, as lossless WebP');
    for (const line of Object.values(BUG_TEXT)) assert.ok(!line.includes('—'), `no em dash: ${line}`);
  });

  it('keeps the last ten page errors, each short', () => {
    const list = [];
    for (let i = 0; i < 14; i++) rememberError(list, `Error ${i}\n  at game.js:${i}`);
    rememberError(list, '   ');
    rememberError(list, 'x'.repeat(900));
    assert.equal(list.length, 10);
    assert.equal(list[0], 'Error 5 at game.js:5');
    assert.equal(list.at(-1).length, 600);
  });

  it('keeps a page error\'s message and five stack frames, so the calling line shows (report #246)', () => {
    const frames = Array.from({ length: 9 }, (_, i) => `    at f${i} (https://groddleafternoon.com/js/features/a-feature.js?v=0123abcd:${100 + i}:7)`);
    const err = { stack: ["TypeError: Cannot read properties of null (reading 'x')", ...frames].join('\n') };
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'location', { value: { origin: 'https://groddleafternoon.com' }, configurable: true });
    try {
      const line = rememberError([], pageErrorLine({ error: err }))[0];
      assert.match(line, /^TypeError: Cannot read properties of null \(reading 'x'\) at f0 \(\/js\/features\/a-feature\.js\?v=0123abcd:100:7\)/);
      assert.match(line, /at f4 \(\/js\/features\/a-feature\.js\?v=0123abcd:104:7\)$/, 'five frames, the page origin left out');
      assert.doesNotMatch(line, /f5/);
      assert.ok(line.length <= 600);
    } finally {
      if (saved) Object.defineProperty(globalThis, 'location', saved);
      else delete globalThis.location;
    }
  });

  it('leaves the browser\'s ResizeObserver notice out of the errors (ticket 98)', () => {
    const list = [];
    // Chrome, Firefox and Safari (the spec's words), Chrome before 2023, and wrapped forms.
    for (const notice of [
      'ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      'Uncaught ResizeObserver loop completed with undelivered notifications.',
      'Error: ResizeObserver loop limit exceeded',
      '  ResizeObserver loop completed\n with undelivered notifications. ',
    ]) {
      assert.equal(benignError(notice), true, notice);
      rememberError(list, notice);
    }
    assert.deepEqual(list, []);
    // Only exactly that notice: a real error that mentions it, or another ResizeObserver fault, stays.
    for (const real of [
      'TypeError: ResizeObserver loop completed with undelivered notifications is not a function',
      'ResizeObserver is not defined',
      'Unhandled: ResizeObserver loop limit exceeded in panel.js',
      'Error 1 at game.js:1',
    ]) {
      assert.equal(benignError(real), false, real);
      rememberError(list, real);
    }
    assert.equal(list.length, 4);
    // The page listener feeds rememberError, so the filter covers every caught error.
    const src = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    assert.match(src, /addEventListener\('error', \(e\) => rememberError\(pageErrors,/);
  });

  it('names the build from the online page and the street and place from the engine', () => {
    const doc = { getElementById: (id) => (id === 'online-boot' ? { dataset: { game: 'game.js?v=1a2b3c4d' } } : null) };
    assert.equal(buildKey(doc), '1a2b3c4d');
    assert.equal(buildKey({ getElementById: () => null, querySelector: () => null }), '');
    const ctx = reportContext(
      { streetTsid: 'GA5101HF7F429V5', street: { label: 'Hechey Track' }, player: { x: 120.6, y: -30.2 } },
      ['TypeError: boom'],
      { document: doc, location: { pathname: '/play/online/' }, navigator: { userAgent: 'Test/1.0' }, innerWidth: 1280, innerHeight: 800 },
    );
    assert.deepEqual(ctx, { street: 'GA5101HF7F429V5', streetName: 'Hechey Track', x: '121', y: '-30', build: '1a2b3c4d', page: '/play/online/', agent: 'Test/1.0', screen: '1280x800', panels: '', gpu: '', adblock: '', marks: '', errors: ['TypeError: boom'] });
  });

  it('online, says which realtime street the client stands on and asked for (#465)', () => {
    const env = { document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, location: { pathname: '/play/online/' }, navigator: { userAgent: 'T' }, innerWidth: 1, innerHeight: 1 };
    const online = (client) => ({ mode: 'multiplayer', streetTsid: 'RH_HOME_EXT', query: (k) => (k === 'realtimeClient' ? client : null) });
    assert.equal(realtimeLine({ mode: 'solo' }), '');
    assert.equal(realtimeLine(online({ street: 'HOME_520', wanted: 'HOME_520' })), 'rt HOME_520');
    assert.equal(realtimeLine(online({ street: '', wanted: '' })), 'rt none');
    assert.equal(realtimeLine(online({ street: '', wanted: 'HOME_520' })), 'rt none (asked HOME_520)');
    assert.equal(reportContext(online({ street: 'HOME_520', wanted: 'HOME_520' }), [], env).panels, 'rt HOME_520');
  });

  it('carries the update state: this build, a newer one, what holds the pill back (2026-11-19)', () => {
    const env = { document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, location: { pathname: '/play/' }, navigator: { userAgent: 'T' }, innerWidth: 1, innerHeight: 1 };
    const line = 'upd d35e7518>f0e1d2c3 hidden 63m modal #craftybot-label';
    const asked = [];
    const engine = { query: (k, ...rest) => { asked.push([k, rest.length]); return k === 'updateState' ? line : null; } };
    assert.equal(reportContext(engine, [], env).panels, line);
    assert.deepEqual(asked.find(([k]) => k === 'updateState'), ['updateState', 1]);
    assert.equal(reportContext({ query: () => null }, [], env).panels, '', 'an unstamped page says nothing');
    const src = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    assert.match(src, /panels = \[rt, upd, panels\]\.filter\(Boolean\)\.join\(', '\)\.slice\(0, 300\);/);
  });

  it('sends the report to groddle/v1/feedback with the session nonce', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, init });
      return { status: 201, ok: true, headers: { get: () => null }, json: async () => ({ status: 'sent', id: 7 }) };
    };
    const account = createMinnAccount({ baseUri: 'https://groddle.localhost/play/online/', fetch, nonce: 'abcdef1234' });
    const r = await account.reportBug('It broke', { street: 'GA5101HF7F429V5' });
    assert.deepEqual(r, { status: 'sent', id: 7 });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/wp-json\/groddle\/v1\/feedback$/);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['X-WP-Nonce'], 'abcdef1234');
    assert.deepEqual(JSON.parse(calls[0].init.body), { message: 'It broke', context: { street: 'GA5101HF7F429V5' } });
  });

  it('draws nothing in solo', () => {
    const engine = { mode: 'solo', started: true };
    bugReportFeature.init(engine);
    bugReportFeature.onTick(16, 0, engine);
    assert.equal(globalThis.groddleBugReport, undefined);
  });

  it('G879 (#425): solo shows a plain link to the Bugs board where the icon sits, and stays offline', () => {
    assert.equal(BUGS_BOARD_URL, 'https://groddleafternoon.com/chat/bugs/');
    assert.equal(bugsBoardHref('groddleafternoon.com'), '/chat/bugs/');
    assert.equal(bugsBoardHref('groddle.localhost'), '/chat/bugs/');
    assert.equal(bugsBoardHref('127.0.0.1'), BUGS_BOARD_URL, 'a page the site does not serve links to the live board');
    assert.equal(bugsBoardHref(''), BUGS_BOARD_URL);
    // A small page: the sound button in the bar's right pill.
    const made = [];
    const node = (tag) => {
      const n = { tag, attrs: {}, children: [], parentElement: null };
      n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
      n.append = (...c) => { for (const x of c) { x.parentElement = n; n.children.push(x); } };
      n.insertBefore = (x, ref) => { x.parentElement = n; n.children.splice(n.children.indexOf(ref), 0, x); };
      made.push(n);
      return n;
    };
    const pill = node('div');
    const sound = node('button');
    pill.append(sound);
    const byId = () => made.find((n) => n.attrs.id === 'bug-btn') || null;
    const fetchBefore = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = async () => { fetched += 1; return { ok: false }; };
    globalThis.document = { createElement: node, getElementById: (id) => (id === 'sound-btn' ? sound : id === 'bug-btn' ? byId() : null), querySelector: () => null };
    try {
      const engine = { mode: 'solo', started: true };
      bugReportFeature.onTick(16, 0, engine);
      bugReportFeature.onTick(16, 0, engine);
      const link = byId();
      assert.ok(link, 'the link is drawn once the game starts');
      assert.equal(link.tag, 'a');
      assert.equal(link.attrs.href, BUGS_BOARD_URL);
      assert.equal(link.attrs.target, '_blank');
      assert.equal(link.attrs.rel, 'noopener');
      assert.equal(link.attrs.title, SOLO_BUGS_TIP);
      assert.deepEqual(pill.children.map((n) => n.attrs.id || n.tag), ['bug-btn', 'button'], 'before Sound, where the icon sits');
      assert.equal(made.filter((n) => n.attrs.id === 'bug-btn').length, 1, 'once');
      assert.equal(globalThis.groddleBugReport, undefined, 'no Reports sheet in solo');
      assert.equal(fetched, 0, 'solo sends nothing');
    } finally {
      delete globalThis.document;
      globalThis.fetch = fetchBefore;
    }
  });

  it('the site files each report as a ticket (TICKETS), keeping the old route and its limits', { skip: !existsSync(join(siteDir, 'src/BugReports.php')) }, () => {
    const php = readFileSync(join(siteDir, 'src/BugReports.php'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(siteDir, 'minn.json'), 'utf8'));
    const ext = readFileSync(join(siteDir, 'src/Extension.php'), 'utf8');
    assert.ok(ext.includes('new BugReports($minn)'), 'the route is registered');
    const type = (manifest.types || []).find((t) => t.slug === 'groddle_feedback');
    assert.ok(type, 'minn.json still declares groddle_feedback (the posts from before tickets stay)');
    assert.equal(type.name, 'Bug reports');
    assert.ok(manifest.tables.groddle_tickets && manifest.tables.groddle_ticket_messages, 'the ticket tables');
    assert.match(php, /#\[Route\(Method::Post, '\/groddle\/v1\/feedback', policy: new Policy\(Access::SignedIn\)\)\]/);
    assert.match(php, /return \(new Tickets\(\$this->minn\)\)->create\(\$request\);/);
    assert.match(php, /MAX_MESSAGE = 4000;/);
    assert.equal(MAX_MESSAGE, 4000);
    // The player's words are plain text: control characters out, invalid UTF-8 scrubbed; every reader sets them as text.
    assert.match(php, /mb_scrub\(\$text, 'UTF-8'\)/);
  });
});

// #662: a street deco stayed blank and the report said nothing of it; the failed image loads
// (path and count, js/textures.js imageFailureLine) now ride in the errors, which the site keeps.
describe('#662: failed image loads in the report', () => {
  const env = { document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, location: { pathname: '/play/' }, navigator: { userAgent: 'T' }, innerWidth: 1, innerHeight: 1 };
  it('adds the images line after the page errors, keeping ten in all', () => {
    const line = 'images failed: assets/decos/groddle/flying_platform_6.png x1 (loaded later)';
    assert.deepEqual(reportContext({}, ['TypeError: boom'], env, null, line).errors, ['TypeError: boom', line]);
    const ten = Array.from({ length: 10 }, (_, i) => `e${i}`);
    assert.deepEqual(reportContext({}, ten, env, null, line).errors, [...ten.slice(1), line]);
    assert.deepEqual(reportContext({}, ten, env, null, '').errors, ten);
    const probe = { renderProbeLine: () => 'gpu x', renderProbe: { ok: false } };
    assert.deepEqual(reportContext(probe, ten, env, null, line).errors, [...ten.slice(2), 'render probe: gpu x', line]);
  });
  it("reads the textures module's count by default", () => {
    const src = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');
    assert.match(src, /import \{ imageFailureLine \} from '\.\.\/textures\.js/);
    assert.match(src, /images = imageFailureLine\(MAX_ERROR\)\) \{/);
  });
});
