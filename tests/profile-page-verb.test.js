/**
 * Open Profile Page (Austin 2026-11-03, right-click audit decision 2): another player's menu, by a
 * left or a right click on their Glitch, starts with the client's "Open Profile Page ..." row
 * (glitch-client InteractionMenuController.as 573-578, sort_on -10). It opens their page on the
 * site in a new tab: /players/<slug>.<id>/, which the site sends on to the page's own address
 * (PlayerPages.php find), and says why when they have no public page (below level 5:
 * Profiles::LISTED_LEVEL). Multiplayer only.
 *
 * G1326 (Austin 2026-11-26): the game asks the site groddle/v1/players/<id>/page (PlayerPageListing.php
 * listing(): 200 { listed, url }) instead of fetching each street player's page, which logged a
 * console 404 for every player below level 5. The route and the page read one rule (shown()); on a
 * throwaway database (tests/fixtures/profiles/page-listing.php) the two agree for every reader. A
 * site without the route (its own 404) gets today's lookup: the page itself.
 */
import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PROFILE_LISTED_LEVEL, PROFILE_PAGE_COPY, PROFILE_PAGE_VERB, profilePagePath, profilePageVerb, profileSlug } from '../public/js/profiles.js?v=7e94c96f';
import { lookUpPlayersHere, profilesFeature } from '../public/js/features/profiles-feature.js?v=3eecefb8';
import { GAME_DIR, HAS_SITE, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const realFetch = globalThis.fetch;
const ROUTE = (id) => `https://groddle.localhost/wp-json/groddle/v1/players/${id}/page`;
/** The site's answer to the route (PlayerPageListing.php listing()). */
const listed = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, url: '', json: async () => body });
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
  delete globalThis.document;
});

describe('the row (js/profiles.js)', () => {
  it('names the character exactly: slug and id, as the site\'s find() takes it', () => {
    assert.equal(profilePagePath('Bo Peep', 57), '/players/bo-peep.57/');
    assert.equal(profilePagePath('Zz Rc_Bob', 103), '/players/zz-rc-bob.103/');
    assert.equal(profilePagePath('Ada'), '/players/ada/');
    assert.equal(profilePagePath('', 5), '');
    assert.equal(profileSlug('Bo  Peep__x'), 'bo-peep-x');
  });

  it('is the client\'s label and tip; disabled with the reason when there is no public page', () => {
    assert.equal(PROFILE_PAGE_COPY.label, 'Open Profile Page');
    const open = profilePageVerb('Bo', 'public');
    assert.deepEqual([open.id, open.enabled, open.reason, open.durationMs], [PROFILE_PAGE_VERB, true, '', 0]);
    assert.match(open.tooltip, /^View more information about this person/);
    const none = profilePageVerb('Bo', 'none');
    assert.equal(none.enabled, false);
    assert.equal(none.reason, `Bo has no public page yet. Pages show from level ${PROFILE_LISTED_LEVEL}.`);
    // Not known yet, or the lookup failed: off, never a link to the site's not-found page.
    const looking = profilePageVerb('Bo', '');
    assert.deepEqual([looking.enabled, looking.reason], [false, "Looking for Bo's page on the Groddle site."]);
    const failed = profilePageVerb('Bo', 'failed');
    assert.deepEqual([failed.enabled, failed.reason], [false, 'The Groddle site did not answer just now. Open the menu again in a moment.']);
    assert.doesNotMatch(none.reason + open.tooltip + looking.reason + failed.reason, /—/, 'no em-dashes in player words');
  });
});

describe('the player menu (features/profiles-feature.js)', () => {
  const engine = (base, players = []) => ({
    mode: 'multiplayer',
    data: {},
    setData(k, v) { this.data[k] = v; },
    targetVerbs: () => profilesFeature.verbOverride(target, engine) ?? base,
    query: (k) => (k === 'realtimeClient' ? { players } : null),
  });
  const target = { classId: 'pc_remote', playerId: 57, label: 'Bo Peep' };

  it('puts Open Profile Page first, on another player\'s Glitch only, in multiplayer only', () => {
    const base = [{ id: 'buddy_add', label: 'Add to Friends' }, { id: 'im', label: 'IM' }];
    const e = { mode: 'multiplayer', targetVerbs: () => base };
    const rows = profilesFeature.verbOverride(target, e);
    assert.deepEqual(rows.map((r) => r.id), [PROFILE_PAGE_VERB, 'buddy_add', 'im']);
    assert.equal(profilesFeature.verbOverride({ classId: 'npc_piggy' }, e), null);
    assert.equal(profilesFeature.verbOverride({ classId: 'pc_remote' }, e), null, 'no player id');
    assert.equal(profilesFeature.verbOverride(target, { ...e, mode: 'solo' }), null);
  });

  it('opens the page in a new tab, once it is known to be there', async () => {
    const opened = [];
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    globalThis.window = { open: (...a) => opened.push(a) };
    globalThis.fetch = async (url) => (url === ROUTE(91) ? listed({ listed: true, url: '/players/cy-zed/' }) : { ok: false, status: 500, url });
    const e = engine([], [{ id: 91, name: 'Cy Zed' }]);
    assert.equal(profilesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 91, label: 'Cy Zed' }, PROFILE_PAGE_VERB, e), true);
    assert.deepEqual(opened, [], 'not looked up yet: nothing opens');
    await lookUpPlayersHere(e);
    assert.equal(profilesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 91, label: 'Cy Zed' }, PROFILE_PAGE_VERB, e), true);
    assert.deepEqual(opened, [['https://groddle.localhost/players/cy-zed/', '_blank', 'noopener']], 'the page\'s own address, as the site gave it');
    assert.equal(e.data.profilePage, '/players/cy-zed/');
    assert.equal(profilesFeature.runVerbOverride(target, 'buddy_add', e), null, 'other rows are theirs');
  });

  it('asks the site about each player on the street once, never the page: not listed disables the row, listed gives its own address', async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    const asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push([url, init.credentials]);
      if (url === ROUTE(58)) return listed({ listed: false });
      if (url === ROUTE(59)) return listed({ listed: true, url: '/players/al/' });
      return { ok: false, status: 404, url };
    };
    const players = [{ id: 58, name: 'Lo' }, { id: 59, name: 'Al' }];
    const e = engine([], players);
    // One at a time (onTick calls it once a second).
    await lookUpPlayersHere(e);
    await lookUpPlayersHere(e);
    assert.equal(lookUpPlayersHere(e), null, 'both looked up: nothing more until the lookups are stale');
    assert.deepEqual(asked.map((a) => a[0]), [ROUTE(58), ROUTE(59)], 'no page fetched, so no 404 for a player below level 5');
    assert.deepEqual(asked[0].slice(1), ['same-origin']);
    const lo = profilesFeature.verbOverride({ classId: 'pc_remote', playerId: 58, label: 'Lo' }, { mode: 'multiplayer', targetVerbs: () => [] })[0];
    assert.equal(lo.enabled, false);
    assert.match(lo.reason, /Lo has no public page yet/);
    assert.match(e.data.profilePages, /(^|,)58:none,59:public$/, 'the players looked up, the earlier test\'s too');
    // Al's row opens the page's own address.
    const opened = [];
    globalThis.window = { open: (...a) => opened.push(a[0]) };
    profilesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 59, label: 'Al' }, PROFILE_PAGE_VERB, e);
    assert.deepEqual(opened, ['https://groddle.localhost/players/al/']);
  });
});

describe('the menu from a list (a chat name, a buddy row, a Chats row)', () => {
  it('looks the player up when it opens: off while looking, drawn again when the answer lands', async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    const asked = [];
    let answer;
    globalThis.fetch = (url) => { asked.push(url); return new Promise((r) => { answer = r; }); };
    const refreshed = [];
    const e = { mode: 'multiplayer', targetVerbs: () => [], setData() {}, refreshPlayerMenu: (id) => refreshed.push(id) };
    const low = { classId: 'pc_remote', playerId: 70, label: 'Lowbie', fromList: true };
    let row = profilesFeature.verbOverride(low, e)[0];
    assert.deepEqual([row.id, row.enabled, row.reason], [PROFILE_PAGE_VERB, false, "Looking for Lowbie's page on the Groddle site."]);
    profilesFeature.verbOverride(low, e);
    assert.equal(asked.length, 1, 'one lookup, however often the menu is drawn');
    assert.deepEqual(asked, [ROUTE(70)]);
    answer(listed({ listed: false }));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(refreshed, [70], 'the open menu is told');
    row = profilesFeature.verbOverride(low, e)[0];
    assert.deepEqual([row.enabled, row.reason], [false, `Lowbie has no public page yet. Pages show from level ${PROFILE_LISTED_LEVEL}.`]);
    assert.equal(asked.length, 1, 'kept: no second lookup');
    // A level-5 player's page opens.
    globalThis.fetch = async (url) => (url === ROUTE(71) ? listed({ listed: true, url: '/players/high/' }) : { ok: false, status: 500, url });
    const high = { classId: 'pc_remote', playerId: 71, label: 'High', fromList: true };
    profilesFeature.verbOverride(high, e);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(profilesFeature.verbOverride(high, e)[0].enabled, true);
    const opened = [];
    globalThis.window = { open: (u) => opened.push(u) };
    profilesFeature.runVerbOverride(high, PROFILE_PAGE_VERB, { setData() {} });
    assert.deepEqual(opened, ['https://groddle.localhost/players/high/']);
  });

  it('a lookup that fails says so and is tried again', async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error('offline'); };
    const e = { mode: 'multiplayer', targetVerbs: () => [], setData() {} };
    const t = { classId: 'pc_remote', playerId: 72, label: 'Flaky', fromList: true };
    profilesFeature.verbOverride(t, e);
    await new Promise((r) => setTimeout(r, 0));
    const row = profilesFeature.verbOverride(t, e)[0];
    assert.deepEqual([row.enabled, row.reason], [false, 'The Groddle site did not answer just now. Open the menu again in a moment.']);
    assert.equal(calls, 1, 'not again at once');
  });

  it('an error from the route (not its 404) says the site did not answer; an answer without listed is not trusted', async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    const asked = [];
    globalThis.fetch = async (url) => {
      asked.push(url);
      return url === ROUTE(73) ? listed({ code: 'oops' }, 500) : listed({ listed: 'yes', url: 'https://elsewhere.test/' });
    };
    const e = { mode: 'multiplayer', targetVerbs: () => [], setData() {} };
    for (const [id, label] of [[73, 'Erra'], [74, 'Odd']]) {
      profilesFeature.verbOverride({ classId: 'pc_remote', playerId: id, label, fromList: true }, e);
      await new Promise((r) => setTimeout(r, 0));
      const row = profilesFeature.verbOverride({ classId: 'pc_remote', playerId: id, label, fromList: true }, e)[0];
      assert.deepEqual([row.enabled, row.reason], [false, PROFILE_PAGE_COPY.failed()], label);
    }
    assert.deepEqual(asked, [ROUTE(73), ROUTE(74)], 'the page is not fetched instead');
  });

  it('a site without the route (its own 404) gets the lookup as before: the page itself, and the route is not asked again', async () => {
    // Its own copy of the module, so the other tests keep a site with the route.
    const old = await import('../public/js/features/profiles-feature.js?fresh=g1326-old');
    globalThis.document = { baseURI: 'https://groddle.localhost/play/online/' };
    const asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push([url, init.credentials, init.redirect]);
      if (url.includes('/wp-json/')) return listed({ code: 'rest_no_route' }, 404);
      if (url.includes('.80/')) return { ok: false, status: 404, url };
      return { ok: true, status: 200, url: 'https://groddle.localhost/players/al/' };
    };
    const players = [{ id: 80, name: 'Lo' }, { id: 81, name: 'Al' }];
    const e = { mode: 'multiplayer', setData() {}, query: (k) => (k === 'realtimeClient' ? { players } : null) };
    await old.lookUpPlayersHere(e);
    await old.lookUpPlayersHere(e);
    assert.deepEqual(asked.map((a) => a[0]), [ROUTE(80), 'https://groddle.localhost/players/lo.80/', 'https://groddle.localhost/players/al.81/']);
    assert.deepEqual(asked[1].slice(1), ['same-origin', 'follow']);
    const lo = old.profilesFeature.verbOverride({ classId: 'pc_remote', playerId: 80, label: 'Lo' }, { mode: 'multiplayer', targetVerbs: () => [] })[0];
    assert.deepEqual([lo.enabled, lo.reason], [false, PROFILE_PAGE_COPY.none('Lo')]);
    const opened = [];
    globalThis.window = { open: (...a) => opened.push(a[0]) };
    old.profilesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 81, label: 'Al' }, PROFILE_PAGE_VERB, e);
    assert.deepEqual(opened, ['https://groddle.localhost/players/al/']);
  });

  it('game.js draws an open player menu again from the verbs as they are now', () => {
    const game = readFileSync(join(import.meta.dirname, '../public/game.js'), 'utf8');
    assert.match(game, /refreshPlayerMenu: \(id\) => refreshPlayerMenus\(id\),/);
    const fn = game.slice(game.indexOf('function refreshPlayerMenus('), game.indexOf('function minimapSignViews('));
    assert.match(fn, /playerCtxMenu\.update\(playerMenuRows\(menuVerbsFor\(target\) \|\| \[\], \{ here: Boolean\(here\) \}\)\);/);
    assert.match(fn, /listPlayerTarget\(\{ id: pid, name: playerListMenuName \}\)/);
    assert.match(fn, /menuTarget\?\.classId === 'pc_remote' && Number\(menuTarget\.playerId\) === pid && menu && !menu\.hidden && !menu\.dataset\.vmLevel/);
  });
});

describe('the game wiring and the site', () => {
  const pub = join(import.meta.dirname, '../public');
  it('the feature is registered after the other player-menu features (so its row stays first)', () => {
    const index = readFileSync(join(pub, 'js/features/index.js'), 'utf8');
    const at = (name) => index.indexOf(`FEATURES.push(${name})`);
    for (const other of ['partyFeature', 'tradeFeature', 'buddiesFeature']) assert.ok(at(other) < at('profilesFeature'), other);
    assert.match(readFileSync(join(pub, 'js/features/profiles-feature.js'), 'utf8'), /window\.open\(url, '_blank', 'noopener'\);/);
  });

  it('the site takes /players/<slug>.<id>/ and hides pages below the listed level', { skip: skipWithoutSite }, () => {
    const pages = readFileSync(join(SITE_DIR, 'src/PlayerPages.php'), 'utf8');
    assert.match(pages, /preg_match\('\/\^\(\.\+\)\\\.\(\\d\+\)\$\/', \$slug, \$m\)/);
    assert.match(pages, /if \(\$canonical !== \$slug\) \{\n\s+return Response::redirect\(\$here, 301\);/);
    const profiles = readFileSync(join(SITE_DIR, 'src/Profiles.php'), 'utf8');
    assert.match(profiles, new RegExp(`public const LISTED_LEVEL = ${PROFILE_LISTED_LEVEL};`));
  });

  it('the site answers groddle/v1/players/<id>/page as a REST route, and the page and the route read one rule (shown())', { skip: skipWithoutSite }, () => {
    const pages = readFileSync(join(SITE_DIR, 'src/PlayerPages.php'), 'utf8');
    const listingSrc = readFileSync(join(SITE_DIR, 'src/PlayerPageListing.php'), 'utf8');
    assert.match(listingSrc, /#\[Route\(Method::Get, '\/groddle\/v1\/players\/\{id:\[1-9\]\[0-9\]\{0,18\}\}\/page', policy: new Policy\(Access::Public\)\)\]\n\s+public function listing\(/);
    // v0.54.0 had it among PlayerPages' page routes, so it answered at /groddle/v1/... and the game's /wp-json/ call got a 404:
    // it must be a REST controller (Seams::rest) and never a page route.
    const ext = readFileSync(join(SITE_DIR, 'src/Extension.php'), 'utf8');
    assert.match(ext, /\$minn->rest\([^;]*new PlayerPageListing\(\$minn\)/);
    assert.doesNotMatch(pages, /\/groddle\/v1\//, 'no REST path among the page routes');
    const who = pages.slice(pages.indexOf('private function who('), pages.indexOf("'buddyCount' =>"));
    assert.match(who, /self::shown\(\$db, \$id, \$this->minn->reader->userId\) \?\? throw new RouteMiss\(\)/);
    assert.doesNotMatch(who, /LISTED_LEVEL|banned\(/, 'the rule lives in shown() alone');
    const listing = listingSrc.slice(listingSrc.indexOf('public function listing('));
    assert.match(listing.slice(0, listing.indexOf('\n    }\n')), /PlayerPages::shown\(/);
  });

  it('PHP lint', { skip: phpSkip() || skipWithoutSite }, () => {
    for (const f of [join(SITE_DIR, 'src/PlayerPages.php'), join(GAME_DIR, 'tests/fixtures/profiles/page-listing.php')]) {
      const r = spawnSync(PHP, ['-l', f], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
  });
});

function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const db = mysql();
const reachable = db && HAS_PHP && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!HAS_SITE && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('G1326: groddle/v1/players/<id>/page on a throwaway database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [join(GAME_DIR, 'tests/fixtures/profiles/page-listing.php'), engineDir, SITE_DIR, join(GAME_DIR, 'public'), db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
  });

  it('is a public GET under groddle/v1', () => {
    assert.deepEqual(r.route, ['Get', '/groddle/v1/players/{id:[1-9][0-9]{0,18}}/page', 'Public']);
  });

  it('answers 200 for everyone, listed or not, never a 404, JSON kept by nobody but the reader', () => {
    for (const [reader, cases] of Object.entries(r.cases)) {
      for (const [k, c] of Object.entries(cases)) {
        assert.equal(c.status, 200, `${reader} asks about ${k}`);
        assert.match(String(c.type), /^application\/json/, `${reader}/${k}`);
        assert.equal(c.cache, 'private, no-store', `${reader}/${k}`);
        assert.equal(typeof c.body.listed, 'boolean', `${reader}/${k}`);
        assert.deepEqual(Object.keys(c.body).sort(), c.body.listed ? ['listed', 'url'] : ['listed'], 'nothing but listed and the address');
      }
    }
  });

  it('listed from level 5, at the page\'s own address; below it only for its owner; never a suspended, retired or missing player', () => {
    const out = r.cases['signed out'];
    assert.deepEqual(out.ada.body, { listed: true, url: '/players/zz-ada/' });
    assert.deepEqual(out.ada2.body, { listed: true, url: '/players/zz-ada.931/' }, 'a second owner of a slug keeps its id path');
    assert.deepEqual(out.eve.body, { listed: true, url: '/players/zz-eve/' }, 'level 5 exactly');
    for (const k of ['cy', 'dee', 'ret', 'nobody']) assert.deepEqual(out[k].body, { listed: false }, k);
    assert.deepEqual(r.cases.eve.cy.body, { listed: false }, 'another player');
    assert.deepEqual(r.cases.cy.cy.body, { listed: true, url: '/players/zz-cy/' }, 'its owner, as the page shows it to them');
    assert.deepEqual(r.cases.dee.dee.body, { listed: false }, 'a suspended player, even to themselves');
  });

  it('agrees with the page itself for every reader and player (one rule)', () => {
    for (const [reader, cases] of Object.entries(r.cases)) {
      for (const [k, c] of Object.entries(cases)) {
        assert.equal(c.body.listed, c.page === 200, `${reader}/${k}: listed ${c.body.listed}, the page ${c.page}`);
        assert.ok([200, 404].includes(c.page), `${reader}/${k}: ${c.page}`);
        if (c.body.listed) assert.equal(c.body.url, `/players/${c.canonical}/`, `${reader}/${k}`);
        // The path the game opens (/players/<slug>.<id>/) goes on to that address, as before.
        assert.equal(c['by id'], c.canonical === null ? 404 : c.canonical === c.path ? c.page : 301, `${reader}/${k}`);
      }
    }
  });
});
