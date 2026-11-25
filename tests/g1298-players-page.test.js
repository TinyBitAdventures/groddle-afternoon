/**
 * G1298: the Players page (/players/), Austin 2026-11-25. Beside Newest: Level (highest first,
 * the level under the name), Age (oldest first, "Joined ... ago", as Glitch's profiles showed a
 * join date), Recently played (PlayTime's last time, in days) and Name; filters Has public snaps
 * (a camera chip with the count), Has a Tower, Has a home (a home street picture; ?street=1 still read); a green dot on players online; a
 * Cards / Neighbourhood view (every listed home street picture side by side as one street); and
 * "Visit a neighbour" (a random player with a home street picture, picked on the server). The
 * houses and Visit open the profile, which draws the home street (Austin 2026-11-25). All query parameters,
 * so it works without JavaScript; players/players.js swaps the list in place. "Appear offline"
 * (PresenceSetting) players are never online and sort as never seen. Who is online and when
 * anyone played are for signed-in players only (Austin 2026-11-25: "Remove the online now
 * filter. I don't want non players to see that."): no Online now filter at all, and a
 * signed-out page has no dot, no "Played ..." and no Recently played sort.
 *
 * - the site (groddle-afternoon-site): src/PlayerPages.php index(), visit(), onlineNow();
 *   src/PlayerList.php; style.css; players/players.js
 * - on a throwaway database (tests/fixtures/profiles/players-list.php): each sort's order, the
 *   filters alone and together, the neighbourhood listing the same players, Visit a neighbour,
 *   appear-offline privacy
 *
 * Run: GRODDLE_SITE_DIR=<site checkout> node --test tests/g1298-players-page.test.js
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { GAME_DIR, HAS_SITE, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { PHP, phpSkip } from './php.js';

const site = (rel) => readFileSync(join(SITE_DIR, rel), 'utf8');

describe('the Players page\'s code (site repo)', { skip: skipWithoutSite }, () => {
  it('every option is a query parameter the server reads; no new route (a player named "visit" keeps their page)', () => {
    const list = site('src/PlayerList.php');
    assert.match(list, /public const SORTS = \['newest' => 'Newest', 'level' => 'Level', 'age' => 'Age', 'played' => 'Recently played', 'name' => 'Name'\];/);
    assert.match(list, /public const FILTERS = \['snaps' => 'Has public snaps', 'tower' => 'Has a Tower', 'home' => 'Has a home'\];/);
    assert.match(list, /public const PLAYER_SORTS = \['played'\];/);
    assert.match(list, /public const FILTER_ALIASES = \['street' => 'home'\];/, 'links made with ?street=1 still filter');
    assert.match(list, /public const VIEWS = \['cards' => 'Cards', 'street' => 'Neighbourhood'\];/);
    const pages = site('src/PlayerPages.php');
    assert.doesNotMatch(pages, /'\/players\/visit/);
    assert.match(pages, /if \(\$request->query\('visit'\) !== null\) \{\s+return \$this->visit\(\$from, \$reader\);/);
  });

  it('Appear offline: never online, and the last-played time is never read for them (NULL in SQL)', () => {
    const pages = site('src/PlayerPages.php');
    const index = pages.slice(pages.indexOf('public function index('), pages.indexOf('private function visit('));
    assert.match(index, /\$hidden = "EXISTS \(SELECT 1 FROM \{\$meta\} ho WHERE ho\.user_id = c\.user_id AND ho\.meta_key = '" \. PresenceSetting::META \. "' AND ho\.meta_value = '1'\)";/);
    assert.match(index, /\$played = \$player \? "CASE WHEN \{\$hidden\} THEN NULL ELSE/);
    assert.match(index, /'online' => isset\(\$isOnline\[\$id\]\) && !\(int\) \$row\['hidden'\]/);
    assert.match(site('src/PlayerList.php'), /empty\(\$p\['off'\]\)/, 'the realtime server\'s own "off" is honoured too');
  });

  it('only a signed-in player (an account with a character) gets play times and the online list, on the server', () => {
    const pages = site('src/PlayerPages.php');
    const index = pages.slice(pages.indexOf('public function index('), pages.indexOf('private function visit('));
    assert.match(index, /\$player = \$reader > 0 && \$this->isPlayer\(\$reader\);/);
    assert.match(index, /\$o = PlayerList::options\(\$request->query, \$player\);/);
    assert.match(index, /: 'NULL';/, 'no last-played time is even read for anyone else');
    assert.match(index, /\$online = \$player \? \$this->onlineNow\(\$now\) : \[\];/, 'nor the realtime server asked');
    assert.match(index, /foreach \(PlayerList::sorts\(\$player\) as \$sort => \$label\)/);
    assert.doesNotMatch(index, /filters'\]\['online'\]/, 'no Online now filter');
  });

  it('a public page never waits long on the realtime server, and never shows a stale list', () => {
    const list = site('src/PlayerList.php');
    assert.match(list, /public const ONLINE_TIMEOUT = 1\.0;/);
    assert.match(list, /public const ONLINE_REFRESH = 30;/);
    assert.match(list, /public const ONLINE_KEEP = 120;/);
  });

  it('avatars hop on hover and focus, only without reduced motion; the neighbourhood scrolls in its own box', () => {
    const css = site('style.css');
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\n\s+\.player-tile-art \{ transition: transform 0\.2s ease-out; \}\n\s+\.player-tile:hover \.player-tile-art, \.player-tile:focus-visible \.player-tile-art \{[^}]*animation: player-hop/);
    assert.doesNotMatch(css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, ''), /animation: player-hop/, 'no hop outside the motion guard');
    assert.match(css, /\.hood \{ position: relative; overflow-x: auto;/, 'its own scroll box, which also holds the lots\' screen-reader text');
    assert.match(css, /\.players-js \.players-apply \{ display: none; \}/, 'the Show button is for pages without the script');
    for (const token of ['--moss', '--surface', '--border', '--fg', '--muted', '--play-bg']) assert.ok(css.includes(`var(${token})`), token);
  });

  it('the script only enhances: it swaps the same server-drawn list, and goes to the address when it cannot', () => {
    const js = site('players/players.js');
    assert.match(js, /querySelector\(SEL\)/);
    assert.match(js, /location\.href = url;/);
    assert.match(js, /history\.pushState/);
    assert.doesNotMatch(js, /visit=1/, 'Visit a neighbour stays a plain link');
    const pages = site('src/PlayerPages.php');
    assert.match(pages, /AssetKeys::url\(self::PLAYERS_JS, dirname\(__DIR__\), 'players\/players\.js'\)/);
  });

  it('runs no WordPress function and shows no account detail', () => {
    for (const f of ['src/PlayerList.php', 'src/PlayerPages.php']) {
      const src = site(f);
      assert.doesNotMatch(src, /\b(?:get_option|wp_[a-z_]+|current_user_can|get_current_user_id|esc_[a-z]+|\$wpdb)\s*\(/, f);
      assert.doesNotMatch(src, /user_email|user_login|display_name/, f);
    }
  });

  it('PHP lint', { skip: phpSkip() }, () => {
    for (const f of [join(SITE_DIR, 'src/PlayerList.php'), join(SITE_DIR, 'src/PlayerPages.php'), join(GAME_DIR, 'tests/fixtures/profiles/players-list.php')]) {
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
// A PHP with mysqli: `php` (Cove's FrankenPHP has it built in, though its `php -v` fails), else with the extension loaded.
const phpArgs = (() => {
  const has = (args) => spawnSync(PHP, [...args, '-r', 'exit(function_exists("mysqli_report") ? 0 : 1);']).status === 0;
  if (has([])) return [];
  if (has(['-d', 'extension=mysqli'])) return ['-d', 'extension=mysqli'];
  return null;
})();
const db = mysql();
const reachable = db && phpArgs && spawnSync(PHP, [...phpArgs, '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!HAS_SITE && 'no site repo')
  || (!phpArgs && 'no php with mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the Players page on a throwaway database', { skip: skipDb }, () => {
  let r;
  const who = (cards) => cards.map((c) => c.who);
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...phpArgs, join(GAME_DIR, 'tests/fixtures/profiles/players-list.php'), engineDir, SITE_DIR, join(GAME_DIR, 'public'), db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
  });

  it('lists only level 5 and up, never a suspended player; every sort answers', () => {
    for (const [sort, cards] of Object.entries(r.sorts)) {
      assert.equal(r.status[sort], 200, sort);
      assert.deepEqual(who(cards).sort(), ['zz-ada', 'zz-bea', 'zz-cy', 'zz-dee', 'zz-gus'], sort);
    }
    assert.equal(r.count, '5 characters');
    assert.equal(r.leaks, false, 'no email, login, id or meta key');
  });

  it('each sort orders correctly, with its fact under the name', () => {
    assert.deepEqual(who(r.sorts.newest), ['zz-cy', 'zz-gus', 'zz-ada', 'zz-bea', 'zz-dee'], 'newest first');
    assert.deepEqual(who(r.sorts.age), ['zz-dee', 'zz-bea', 'zz-ada', 'zz-gus', 'zz-cy'], 'oldest character first');
    assert.deepEqual(who(r.sorts.level), ['zz-bea', 'zz-ada', 'zz-dee', 'zz-gus', 'zz-cy'], 'highest level first');
    assert.deepEqual(who(r.sorts.name), ['zz-ada', 'zz-bea', 'zz-cy', 'zz-dee', 'zz-gus']);
    assert.deepEqual(who(r.sorts.played), ['zz-ada', 'zz-bea', 'zz-gus', 'zz-cy', 'zz-dee'], 'most recent first; never seen and appear offline last, by name');
    assert.deepEqual(r.sorts.level.map((c) => c.fact), ['Level 12', 'Level 9', 'Level 7', 'Level 6', 'Level 5']);
    assert.deepEqual(r.sorts.age.map((c) => c.fact), ['Joined 2 months ago', 'Joined 4 weeks ago', 'Joined 10 days ago', 'Joined 5 days ago', 'Joined 2 days ago']);
    assert.deepEqual(r.sorts.played.map((c) => c.fact), ['Online now', 'Played 3 days ago', 'Played 2 weeks ago', null, null]);
    for (const c of [...r.sorts.newest, ...r.sorts.name]) assert.equal(c.fact, null, 'Newest and Name add nothing under the name');
  });

  it('an appear-offline player never shows online and never leaks when they played', () => {
    for (const cards of Object.values(r.sorts)) {
      const dee = cards.find((c) => c.who === 'zz-dee');
      assert.equal(dee.online, false);
      assert.ok(dee.fact === null || !/Played|Online/.test(dee.fact), dee.fact);
    }
    for (const v of Object.values(r.hood)) assert.equal(v.lots.find((l) => l.who === 'zz-dee')?.online ?? false, false);
  });

  it('the green dot and the Snaps chip: online players (a list no older than two minutes), public Snaps only', () => {
    assert.deepEqual(r.sorts.name.map((c) => [c.who, c.online, c.snaps]), [['zz-ada', true, 2], ['zz-bea', false, 0], ['zz-cy', false, 1], ['zz-dee', false, 0], ['zz-gus', false, 0]], 'Bea\'s private Snap is not counted');
    assert.deepEqual(r['stale online'], { dots: 0 }, 'an old list shows nobody online');
    assert.deepEqual(r.blocked, { snaps: ['zz-cy'], chip: { 'zz-ada': 0, 'zz-bea': 0, 'zz-cy': 1, 'zz-dee': 0, 'zz-gus': 0 } }, 'to a reader she blocks or who blocks her, as the profile');
  });

  it('signed out, or signed in without a character: no green dot, no "Played ...", no Recently played, nothing asked', () => {
    for (const k of ['signed out', 'no character']) {
      const p = r.public[k];
      assert.equal(p.tabs, 'Newest · Level · Age · Name', `${k}: no Recently played tab`);
      assert.deepEqual(p['played sort'], ['zz-cy', 'zz-gus', 'zz-ada', 'zz-bea', 'zz-dee'], `${k}: an old ?sort=played is Newest`);
      assert.equal(p['online param'].length, 5, `${k}: ?online=1 ignored`);
      assert.equal(p.dots, 0, `${k}: no green dot, cards or neighbourhood (Ada is online)`);
      assert.equal(p.words, null, `${k}: nothing about online or play times in the page`);
      assert.equal(p.lots, 5);
    }
    assert.deepEqual(r['public asks'], [null, null], 'a signed-out view never asks the realtime server');
    assert.equal(r['player asks'], true, 'a player\'s view does');
  });

  it('filters work alone and together, with any sort; only "1" turns one on', () => {
    assert.deepEqual(r.filters.snaps, ['zz-cy', 'zz-ada']);
    assert.deepEqual(r.filters.tower, ['zz-ada', 'zz-dee']);
    assert.deepEqual(r.filters.home, ['zz-ada', 'zz-bea', 'zz-dee']);
    assert.deepEqual(r.filters['street (the old name)'], ['zz-ada', 'zz-bea', 'zz-dee']);
    assert.deepEqual(r.filters['snaps+tower'], ['zz-ada']);
    assert.deepEqual(r.filters['home+tower age'], ['zz-dee', 'zz-ada']);
    assert.deepEqual(r.filters['home level'], ['zz-bea', 'zz-ada', 'zz-dee']);
    assert.deepEqual(r.filters['snaps+home+tower'], ['zz-ada']);
    assert.equal(r.filters['online (gone)'].length, 5, 'an old ?online=1 is ignored');
    assert.equal(r.filters['not 1'].length, 5);
    assert.equal(r['filtered count'], '2 of 5 characters');
    assert.equal(r.none, '/players/?sort=name&view=street', 'nobody matches: "Show everyone" keeps the sort and view');
  });

  it('works without JavaScript: a GET form of checkboxes with Show, sort links that keep the filters', () => {
    assert.deepEqual(r.form, { get: true, boxes: 3, 'online box': false, show: true });
    assert.deepEqual(r.checked, ['snaps']);
    assert.equal(r['hidden sort'], true, 'the form carries the sort');
    assert.deepEqual(r['tabs keep filters'], [['/players/?snaps=1', 'Newest'], ['/players/?sort=age&snaps=1', 'Age'], ['/players/?sort=played&snaps=1', 'Recently played'], ['/players/?sort=name&snaps=1', 'Name']]);
    assert.equal(r.script, 'keyed', 'the enhancement script, keyed by its content');
  });

  it('the neighbourhood lists the same players in the same order: home street pictures (lazy) or an empty lot', () => {
    for (const [k, v] of Object.entries(r.hood)) {
      assert.deepEqual(who(v.lots), v.cards, k);
      assert.equal(v.region, true, `${k}: one scrolling street`);
      for (const lot of v.lots) {
        if (lot.empty) {
          assert.equal(lot.img, null);
          assert.equal(lot.href, `/players/${lot.who}/`, 'no picture: the profile');
        } else {
          assert.equal(lot.href, `/players/${lot.who}/`, 'opens their profile, which draws the home street');
          assert.equal(lot.lazy, true);
        }
      }
    }
    const lots = Object.fromEntries(r.hood.newest.lots.map((l) => [l.who, l]));
    assert.equal(lots['zz-ada'].img, '/players/930/home-small?v=T', 'the phone copy when there is one');
    assert.equal(lots['zz-bea'].img, '/players/931/home?v=T');
    assert.equal(lots['zz-ada'].name, 'Zz Ada');
    assert.equal(lots['zz-cy'].empty, true);
    assert.deepEqual(r['hood tabs'], ['/players/?view=street', '/players/?sort=age&view=street', '/players/?sort=played&view=street', '/players/?sort=name&view=street'], 'the sorts keep the view');
    assert.equal(r['hood view nav'], 'Cards / Neighbourhood');
    assert.equal(r['hood cards link'], '/players/?sort=level');
  });

  it('Visit a neighbour picks only listed players with a home street picture, on the server, opens the profile, never the reader\'s own', () => {
    assert.equal(r['visit button'], '/players/?visit=1');
    assert.deepEqual(r['visit status'], [302, 'no-store']);
    assert.deepEqual(r.visit, ['/players/zz-ada/', '/players/zz-bea/', '/players/zz-dee/'], 'every one with a picture, in 60 tries; never Cy or Gus (no picture), Eve (below level 5) or Fin (suspended)');
    assert.deepEqual(r['visit as ada'], ['/players/zz-bea/', '/players/zz-dee/']);
  });

  it('the helpers: days at the finest, the server\'s list cleaned, unknown options are the defaults', () => {
    assert.deepEqual(r.ago, ['today', 'today', 'yesterday', '3 days ago', '13 days ago', '2 weeks ago', '8 weeks ago', '2 months ago', '13 months ago', '2 years ago']);
    assert.deepEqual(r.snapshot, { checked: 100, ids: [5, 7] }, 'once each, never one marked off');
    assert.deepEqual(r['snapshot bad'], [null, null, null]);
    assert.deepEqual(r.options, { sort: 'newest', filters: { snaps: true, tower: false, home: false }, view: 'cards', page: 1 });
  });
});
