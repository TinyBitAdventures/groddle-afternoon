/**
 * v0.2.2: the administrators' teleport. /tp in Local chat (js/admin-teleport.js,
 * js/features/slash-commands-feature.js), the site's admin/teleport route
 * (groddle-afternoon-site src/AdminTeleport.php, src/TeleportPlace.php, run
 * through the php CLI), the server's signed call and its {"t":"teleport"}
 * message (groddle-afternoon-server teleport.go) and the realtime feature
 * entering the street it names.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, sitePath, serverPath, skipWithoutSite, skipWithoutServer } from '../tools/repos.mjs';
import { TP_TEXT, matchStreet, movedLine, parseTp, planTp, runTeleportCommand, streetKey } from '../public/js/admin-teleport.js?v=g406-1';
import { slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=g418-1';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;

const STREETS = {
  GA1HECHEY: { label: 'Hechey Track' },
  GA2HECHEY: { label: 'Hechey Pass' },
  GA3EMPTY: { label: 'Empty Via 5' },
  GA4EMPTY: { label: 'Empty Via 5' },
  LLI9WEALD: { label: "Scribe's Weald" },
  GA5BOB: { label: 'Bobbin Lane' },
};

describe('/tp lines (js/admin-teleport.js)', () => {
  it('reads /tp and its arguments, and nothing else', () => {
    assert.equal(parseTp('/tp'), '');
    assert.equal(parseTp('  /TP   Hechey    Track '), 'Hechey Track');
    assert.equal(parseTp('/tpx'), null);
    assert.equal(parseTp('/tower'), null);
    assert.equal(parseTp('tp Hechey'), null);
  });

  it('matches a street by tsid (G or L form), whole name or part of one', () => {
    assert.equal(streetKey(STREETS, 'ga1hechey'), 'GA1HECHEY');
    assert.equal(streetKey(STREETS, 'GLI9WEALD'), 'LLI9WEALD');
    assert.deepEqual(matchStreet('hechey track', STREETS), { street: { tsid: 'GA1HECHEY', label: 'Hechey Track' } });
    assert.deepEqual(matchStreet('scribes', STREETS), { street: { tsid: 'LLI9WEALD', label: "Scribe's Weald" } });
    assert.equal(matchStreet('nowhere', STREETS), null);
    assert.deepEqual(matchStreet('track', STREETS), { street: { tsid: 'GA1HECHEY', label: 'Hechey Track' } });
    assert.equal(matchStreet('ack', STREETS), null, 'part of a name counts from the start of a word');
    assert.equal(matchStreet('hechey', STREETS, { exact: true }), null);
    const two = matchStreet('hechey', STREETS);
    assert.deepEqual(two.candidates.map((c) => c.name), ['Hechey Pass', 'Hechey Track']);
    // Streets that share a name are told apart by tsid.
    assert.deepEqual(matchStreet('Empty Via 5', STREETS).candidates.map((c) => c.name), ['Empty Via 5 (GA3EMPTY)', 'Empty Via 5 (GA4EMPTY)']);
  });

  it('plans yourself, another player, or bringing one here', () => {
    assert.deepEqual(planTp('Hechey Track', STREETS), { kind: 'self', street: { tsid: 'GA1HECHEY', label: 'Hechey Track' } });
    assert.deepEqual(planTp('ga3empty', STREETS), { kind: 'self', street: { tsid: 'GA3EMPTY', label: 'Empty Via 5' } });
    assert.deepEqual(planTp('Ada Hechey Track', STREETS), { kind: 'player', player: 'Ada', street: { tsid: 'GA1HECHEY', label: 'Hechey Track' } });
    assert.deepEqual(planTp('Mary Jo scribes', STREETS), { kind: 'player', player: 'Mary Jo', street: { tsid: 'LLI9WEALD', label: "Scribe's Weald" } });
    assert.deepEqual(planTp('Ada here', STREETS), { kind: 'bring', player: 'Ada', fallback: false });
    assert.deepEqual(planTp('Zed', STREETS), { kind: 'bring', player: 'Zed', fallback: true });
    assert.deepEqual(planTp('', STREETS), { kind: 'error', line: TP_TEXT.usage });
    const which = planTp('Ada hechey', STREETS);
    assert.equal(which.kind, 'error');
    assert.equal(which.line, 'Which street? Hechey Pass, Hechey Track.');
    assert.equal(movedLine(STREETS, 'GLI9WEALD'), "An administrator moved you to Scribe's Weald.");
  });

  it('copy is plain, with no em-dashes', () => {
    const text = read('public/js/admin-teleport.js');
    assert.doesNotMatch(text, /—/);
  });
});

/** A fake site: answers in order, records each request. */
function fakeSite(answers) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined });
    const a = answers.shift() || { status: 500, data: {} };
    if (typeof a === 'string') return { ok: true, status: 200, text: async () => a, headers: { get: () => null } };
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.data, headers: { get: (h) => (h === 'X-WP-Nonce' ? a.nonce || null : null) } };
  };
  return { fetch, calls };
}

function fakeEngine(extra = {}) {
  const seen = { entered: [], saves: 0 };
  return {
    seen,
    mode: 'multiplayer',
    streetTsid: 'GA5BOB',
    player: { x: 812.4, y: 530.6 },
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    enter: async (tsid, opts) => { seen.entered.push({ tsid, opts }); },
    save: () => { seen.saves += 1; },
    ...extra,
  };
}

function deps(site, engine, lines) {
  let flushed = 0;
  return {
    engine,
    streets: STREETS,
    fetch: site.fetch,
    baseUri: 'https://groddle.localhost/',
    nonce: '0123456789',
    nonceUrl: 'https://groddle.localhost/wp-admin/admin-ajax.php?action=rest-nonce',
    say: (l) => lines.push(l),
    unknown: () => lines.push('UNKNOWN'),
    flush: async () => { flushed += 1; },
    get flushed() { return flushed; },
  };
}

describe('/tp against the site (runTeleportCommand)', () => {
  it('a player who is not an administrator sees Unknown command and nothing is asked for', async () => {
    const site = fakeSite([{ status: 403, data: { code: 'rest_forbidden' } }]);
    const lines = [];
    assert.equal(await runTeleportCommand('Hechey Track', deps(site, fakeEngine(), lines)), 'refused');
    assert.deepEqual(lines, ['UNKNOWN']);
    assert.equal(site.calls.length, 1);
    assert.equal(site.calls[0].method, 'GET');
    assert.equal(site.calls[0].url, 'https://groddle.localhost/wp-json/groddle/v1/admin/teleport');
    assert.equal(site.calls[0].headers['X-WP-Nonce'], '0123456789');
    // Even an ambiguous street name gives nothing away.
    const again = fakeSite([{ status: 401, data: { code: 'rest_not_logged_in' } }]);
    const more = [];
    await runTeleportCommand('hechey', deps(again, fakeEngine(), more));
    assert.deepEqual(more, ['UNKNOWN']);
  });

  it('/tp <street> moves the administrator: the site first, then the street is entered and saved', async () => {
    const site = fakeSite([
      { status: 200, data: { recent: [] } },
      { status: 200, data: { delivery: 'self', street: { tsid: 'GA1HECHEY', label: 'Hechey Track' }, spot: false, at: { x: 10, y: 20 }, text: 'Moving you to Hechey Track.' } },
    ]);
    const engine = fakeEngine();
    const lines = [];
    const d = deps(site, engine, lines);
    assert.equal(await runTeleportCommand('hechey track', d), 'self:self');
    assert.deepEqual(site.calls[1].body, { tsid: 'GA1HECHEY' });
    assert.equal(site.calls[1].method, 'POST');
    assert.deepEqual(engine.seen.entered, [{ tsid: 'GA1HECHEY', opts: {} }]);
    assert.equal(engine.seen.saves, 1);
    assert.equal(d.flushed, 1);
    assert.deepEqual(lines, ['Moving you to Hechey Track.']);
  });

  it('/tp <player> <street> asks the site to move them; the administrator stays put', async () => {
    const site = fakeSite([
      { status: 200, data: { recent: [] } },
      { status: 200, data: { delivery: 'live', text: 'Moved Ada to Hechey Track.' } },
    ]);
    const engine = fakeEngine();
    const lines = [];
    assert.equal(await runTeleportCommand('Ada Hechey Track', deps(site, engine, lines)), 'player:live');
    assert.deepEqual(site.calls[1].body, { player: 'Ada', tsid: 'GA1HECHEY' });
    assert.deepEqual(engine.seen.entered, []);
    assert.deepEqual(lines, ['Moved Ada to Hechey Track.']);
  });

  it('/tp <player> here brings them to where you stand, and not from a private place', async () => {
    const site = fakeSite([{ status: 200, data: {} }, { status: 200, data: { delivery: 'saved', text: 'Ada is not online. They will start on Bobbin Lane next time.' } }]);
    const lines = [];
    await runTeleportCommand('Ada here', deps(site, fakeEngine(), lines));
    assert.deepEqual(site.calls[1].body, { player: 'Ada', tsid: 'GA5BOB', x: 812, y: 531 });
    const home = fakeSite([{ status: 200, data: {} }]);
    const at = [];
    assert.equal(await runTeleportCommand('Ada here', deps(home, fakeEngine({ homeContext: () => ({ inHome: true }) }), at)), 'bring:no-spot');
    assert.deepEqual(at, [TP_TEXT.noSpot]);
  });

  it('a name that is neither a street nor a player says so; the site\'s refusals are shown as they come', async () => {
    const site = fakeSite([{ status: 200, data: {} }, { status: 404, data: { code: 'groddle_tp_no_player', message: 'No player is called Zed.' } }]);
    const lines = [];
    await runTeleportCommand('Zed', deps(site, fakeEngine(), lines));
    assert.deepEqual(lines, ['No street or player is called Zed.']);
    const which = fakeSite([{ status: 200, data: {} }, { status: 409, data: { code: 'groddle_tp_which_player', message: 'Which player? Ada, Adam.' } }]);
    const w = [];
    await runTeleportCommand('Ad Hechey Track', deps(which, fakeEngine(), w));
    assert.deepEqual(w, ['Which player? Ada, Adam.']);
    const amb = fakeSite([{ status: 200, data: {} }]);
    const a = [];
    await runTeleportCommand('hechey', deps(amb, fakeEngine(), a));
    assert.deepEqual(a, ['Which street? Hechey Pass, Hechey Track.']);
    assert.equal(amb.calls.length, 1, 'no teleport asked for an ambiguous street');
  });

  it('a stale nonce is fetched again once', async () => {
    const site = fakeSite([{ status: 403, data: { code: 'rest_cookie_invalid_nonce' } }, 'abcdef0123', { status: 200, data: {} }, { status: 200, data: { delivery: 'live', text: 'ok' } }]);
    await runTeleportCommand('Ada Hechey Track', deps(site, fakeEngine(), []));
    assert.equal(site.calls[1].url, 'https://groddle.localhost/wp-admin/admin-ajax.php?action=rest-nonce');
    assert.equal(site.calls[2].headers['X-WP-Nonce'], 'abcdef0123');
    assert.equal(site.calls[3].method, 'POST');
  });
});

describe('/tp in the slash commands feature', () => {
  it('solo has no /tp and says so', () => {
    slashCommandsFeature._reset();
    const shown = [];
    const engine = { mode: 'solo', pushActivity: (l) => shown.push(l), toast() {}, setData() {} };
    assert.equal(slashCommandsFeature.chatCommand('/tp Hechey Track', engine), true);
    assert.deepEqual(shown, [TP_TEXT.solo]);
    assert.equal(slashCommandsFeature._state().last, '/tp:solo');
  });

  it('multiplayer: a refused /tp shows the ordinary Unknown command line', async () => {
    slashCommandsFeature._reset();
    const site = fakeSite([{ status: 403, data: { code: 'rest_forbidden' } }]);
    slashCommandsFeature._setTeleportDeps(() => ({ fetch: site.fetch, baseUri: 'https://groddle.localhost/', nonce: '0123456789', nonceUrl: '', streets: STREETS, flush: async () => {} }));
    const shown = [];
    const engine = { ...fakeEngine(), pushActivity: (l) => shown.push(l), toast() {}, setData() {} };
    assert.equal(slashCommandsFeature.chatCommand('/tp Hechey Track', engine), true);
    for (let i = 0; i < 20 && slashCommandsFeature._state().last === '/tp:asking'; i += 1) await new Promise((r) => setTimeout(r, 5));
    assert.equal(slashCommandsFeature._state().last, '/tp:refused');
    assert.deepEqual(shown, ['Unknown command: /tp Hechey Track']);
  });

  it('the realtime feature enters the street a teleport names, quietly, then says so and saves', () => {
    const src = read('public/js/features/realtime-feature.js');
    assert.match(src, /client\.on\('msg:teleport'/);
    assert.match(src, /client\.leave\(\);/);
    assert.match(src, /engine\.enter\?\.\(street, \{ \.\.\.spot, quiet: true \}\)/);
    assert.match(src, /movedLine\(STREET_INDEX\.streets, street\)/);
    assert.match(src, /saveStore\.flush/);
    assert.match(src, /if \(teleporting\) \{\s*drawRemotes\(t\);\s*return;/);
  });
});

describe('the site route (groddle-afternoon-site AdminTeleport, TeleportPlace)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
  function php(code) {
    const out = execFileSync('php', ['-r', `foreach (['TeleportPlace', 'ServiceCall'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\{TeleportPlace, ServiceCall}; echo json_encode(${code});`]);
    return JSON.parse(String(out));
  }

  it('finds streets in the index as the game does', () => {
    assert.equal(php(`TeleportPlace::streetKey(['GA1' => ['label' => 'A'], 'LLI9' => ['label' => 'B']], 'GLI9')`), 'LLI9');
    assert.equal(php(`TeleportPlace::streetKey(['GA1' => ['label' => 'A']], 'GA1 OR 1')`), null);
  });

  it('puts a moved player at the signpost nearest the middle, on the floor under a named x, or as named', () => {
    const street = `['bounds' => ['l' => -3000, 'r' => 3000, 't' => -1000, 'b' => 0], 'signposts' => [['x' => 2600, 'y' => -125], ['x' => 300, 'y' => -80]], 'platforms' => [['x1' => -3000, 'y1' => -60, 'x2' => 3000, 'y2' => -60], ['x1' => -500, 'y1' => -400, 'x2' => 500, 'y2' => -400]]]`;
    assert.deepEqual(php(`TeleportPlace::spot(${street})`), { x: 3300, y: 920 });
    assert.deepEqual(php(`TeleportPlace::spot(${street}, 3000.0)`), { x: 3000, y: 940 }, 'the lowest floor under x');
    assert.deepEqual(php(`TeleportPlace::spot(${street}, 120.4, 540.6)`), { x: 120, y: 541 });
    assert.deepEqual(php(`TeleportPlace::spot(['bounds' => ['l' => 0, 'r' => 1000, 't' => -500, 'b' => 0], 'platforms' => [['x1' => 0, 'y1' => -50, 'x2' => 1000, 'y2' => -150]]])`), { x: 500, y: 400 });
    assert.deepEqual(php(`TeleportPlace::spot(${street}, 99999.0, 99999.0)`), { x: 5960, y: 980 }, 'kept inside the street');
  });

  it('writes the location entry the game reads', () => {
    assert.equal(php(`TeleportPlace::locationEntry('GA1', 120, 540, 1730000000000)`), '{"tsid":"GA1","x":120,"y":540,"savedAt":1730000000000}');
  });

  it('posts to the realtime server the site names, else the socket\'s host, else this host', () => {
    assert.equal(php(`TeleportPlace::serviceUrl('http://127.0.0.1:8795/ws', 'wss://play.example.com/ws')`), 'http://127.0.0.1:8795/ws');
    assert.equal(php(`TeleportPlace::serviceUrl('', 'wss://play.example.com/ws')`), 'https://play.example.com/ws');
    assert.equal(php(`TeleportPlace::serviceUrl('javascript:x', 'ws://10.0.0.2:8793')`), 'http://10.0.0.2:8793/ws');
    assert.equal(php(`TeleportPlace::serviceUrl(null, null)`), 'http://127.0.0.1:8793/ws');
    assert.equal(php(`TeleportPlace::loopbackHost('http://127.0.0.1:8793/ws')`), '127.0.0.1');
    assert.equal(php(`TeleportPlace::loopbackHost('https://play.example.com/ws')`), null);
  });

  it('signs the server call as the server checks it (the vector in teleport_test.go)', () => {
    const sig = php(`ServiceCall::sign('POST', '/realtime/v1/teleport', 1700000000, '0123456789abcdef', json_encode(['player' => 7, 'street' => 'GA5FREE']), str_repeat('x', 40))`);
    assert.equal(sig, '1700000000.0123456789abcdef.1vZgXq97IkOr-sNZUsK_sS2XVlbKbSpwYfU7tJapfhk');
  });

  it('is for administrators only, writes an audit line, and bumps the save version when it rewrites one', () => {
    const src = readFileSync(sitePath('src/AdminTeleport.php'), 'utf8');
    const routes = [...src.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(([^)]*)\)\)\]/g)].map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(routes, [
      ['Get', '/groddle/v1/admin/teleport', "Access::Cap, 'manage_options'"],
      ['Post', '/groddle/v1/admin/teleport', "Access::Cap, 'manage_options'"],
    ]);
    assert.match(src, /ServiceCall::sign\('POST', '\/realtime\/v1\/teleport'/);
    assert.match(src, /version = version \+ 1/);
    assert.match(src, /INSERT INTO ' \. \$db->table\(self::TABLE\)/);
    assert.doesNotMatch(src, /—/);
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(manifest.tables.groddle_admin_teleports.some((l) => l.startsWith('player_user_id')));
    assert.ok(manifest.needs.http.includes('https://play.groddleafternoon.com/ws'));
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new AdminTeleport\(\$minn\)/);
  });
});

describe('the realtime server (groddle-afternoon-server teleport.go)', { skip: skipWithoutServer }, () => {
  it('takes a teleport only on the site\'s signed POST, never from a socket', () => {
    const file = serverPath('teleport.go');
    assert.ok(existsSync(file), 'teleport.go');
    const go = readFileSync(file, 'utf8');
    assert.match(go, /serviceRouteTeleport = (?:"\/realtime\/v1\/teleport"|serviceRoutePrefix \+ "teleport")/);
    assert.match(go, /serviceRoutePrefix   = "\/realtime\/v1\/"/);
    assert.doesNotMatch(go, /Handle\("teleport"/);
    assert.match(readFileSync(serverPath('main.go'), 'utf8'), /r\.Method == http\.MethodPost \{\s*s\.service\(w, r\)/);
  });
});
