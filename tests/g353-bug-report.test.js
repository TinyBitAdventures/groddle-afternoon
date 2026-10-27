/**
 * G353: Report a bug from the game's header, in multiplayer (the original's
 * bug icon, GameHeaderUI.as 47-69, and form, BootError.as 280-290). Reports go
 * to the site's groddle/v1/feedback (groddle-afternoon-site src/BugReports.php)
 * as private Bug reports (minn.json "types": groddle_feedback).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUG_TEXT, MAX_MESSAGE, bugReportFeature, buildKey, rememberError, reportContext } from '../public/js/features/bug-report-feature.js?v=g359-1';
import { createMinnAccount } from '../public/js/minn-account.js?v=nbhome-10';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = process.env.GRODDLE_SITE_DIR || join(root, '..', 'groddle-afternoon-site');
const client = readFileSync(join(root, '../glitch-client/com/tinyspeck/engine/view/ui/chrome/GameHeaderUI.as'), 'utf8');
const bootError = readFileSync(join(root, '../glitch-client/com/tinyspeck/debug/BootError.as'), 'utf8');

describe('Report a bug (G353)', () => {
  it('uses the original client\'s words and icon', () => {
    assert.match(client, new RegExp(`tip_txt = '${BUG_TEXT.tip}'`));
    assert.ok(bootError.includes(`<h1>${BUG_TEXT.title}</h1>`));
    assert.ok(bootError.includes(`<p>${BUG_TEXT.label}`));
    assert.ok(bootError.includes(`<p>${BUG_TEXT.send}</p>`));
    const icon = readFileSync(join(root, 'public/assets/ui/bug_icon.png'));
    const original = readFileSync(join(root, '../glitch-client/TSEngineAssets/src/assets/graphics/bug_icon.png'));
    assert.ok(icon.equals(original), 'the icon is the client\'s own bug_icon.png');
    for (const line of Object.values(BUG_TEXT)) assert.ok(!line.includes('—'), `no em dash: ${line}`);
  });

  it('keeps the last ten page errors, each short', () => {
    const list = [];
    for (let i = 0; i < 14; i++) rememberError(list, `Error ${i}\n  at game.js:${i}`);
    rememberError(list, '   ');
    rememberError(list, 'x'.repeat(900));
    assert.equal(list.length, 10);
    assert.equal(list[0], 'Error 5 at game.js:5');
    assert.equal(list.at(-1).length, 300);
  });

  it('names the build from the online page and the street and place from the engine', () => {
    const doc = { getElementById: (id) => (id === 'online-boot' ? { dataset: { game: 'game.js?round16=g353-1&mp=1' } } : null) };
    assert.equal(buildKey(doc), 'g353-1');
    assert.equal(buildKey({ getElementById: () => null, querySelector: () => null }), '');
    const ctx = reportContext(
      { streetTsid: 'GA5101HF7F429V5', street: { label: 'Hechey Track' }, player: { x: 120.6, y: -30.2 } },
      ['TypeError: boom'],
      { document: doc, location: { pathname: '/play/online/' }, navigator: { userAgent: 'Test/1.0' }, innerWidth: 1280, innerHeight: 800 },
    );
    assert.deepEqual(ctx, { street: 'GA5101HF7F429V5', streetName: 'Hechey Track', x: '121', y: '-30', build: 'g353-1', page: '/play/online/', agent: 'Test/1.0', screen: '1280x800', errors: ['TypeError: boom'] });
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

  it('the site files each report as a private Bug report and escapes what the player wrote', { skip: !existsSync(join(siteDir, 'src/BugReports.php')) }, () => {
    const php = readFileSync(join(siteDir, 'src/BugReports.php'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(siteDir, 'minn.json'), 'utf8'));
    const ext = readFileSync(join(siteDir, 'src/Extension.php'), 'utf8');
    assert.ok(ext.includes('new BugReports($minn)'), 'the route is registered');
    const type = (manifest.types || []).find((t) => t.slug === 'groddle_feedback');
    assert.ok(type, 'minn.json declares groddle_feedback');
    assert.equal(type.name, 'Bug reports');
    assert.match(php, /#\[Route\(Method::Post, '\/groddle\/v1\/feedback', policy: new Policy\(Access::SignedIn\)\)\]/);
    assert.match(php, /'post_status' => 'private'/);
    assert.match(php, /MAX_MESSAGE = 2000;/);
    assert.equal(MAX_MESSAGE, 2000);
    // The title keeps no markup; every line of the body goes through htmlspecialchars before it is stored.
    assert.match(php, /\$title = self::clean\(str_replace\(\['<', '>'\], '', strip_tags\(/);
    assert.match(php, /nl2br\(\$esc\(\$para\), false\)/);
    assert.match(php, /\$esc\(implode\("\\n", \$lines\)\)/);
  });
});
