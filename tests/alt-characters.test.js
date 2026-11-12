/**
 * Alternate characters, the site side (Austin 2026-11-12): one login (an email and a password)
 * with up to 3 characters, each its own account tied to the login in groddle_character_logins
 * (groddle-afternoon-site src/Logins.php), the player's routes (src/CharacterRoutes.php), the
 * X-Groddle-Character guard on save writes, the realtime ticket and value-moving routes, the
 * account fixes (email, password, report replies, backups on the login), distinct-login counting,
 * login-wide bans and restrictions, the console's Characters on this login and rename, and the
 * privacy rule (players never see who shares a login).
 *
 * The rules run on a throwaway MariaDB database (tests/fixtures/alt-characters/alt-characters.php);
 * the rest reads the site's source. Skipped without the site repo, PHP, the engine or MariaDB.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const src = (f) => readFileSync(sitePath(f), 'utf8');
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = spawnSync('php', ['-v']).status === 0;
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
const db = mysql();
const reachable = db && hasPhp && spawnSync('php', ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!hasPhp && 'no php')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('alternate characters on a throwaway database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync('php', [join(import.meta.dirname, 'fixtures/alt-characters/alt-characters.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_alts_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('declares the two additive tables: a row only for an extra character, keyed by login; renames by old address', () => {
    assert.deepEqual(r.tables.logins, ['user_id bigint(20) unsigned NOT NULL', 'login_id bigint(20) unsigned NOT NULL', 'created_at datetime NOT NULL', 'retired_at datetime NULL DEFAULT NULL', 'PRIMARY KEY  (user_id)', 'KEY login_id (login_id)']);
    assert.ok(r.tables.renames.includes('KEY old_slug (old_slug)'));
  });

  it('a character with no row is its own login; siblings are the whole login, retired ones too', () => {
    assert.deepEqual(r.loginOf, { 10: 10, 11: 10, 12: 10, 21: 20, 40: 40 });
    assert.deepEqual(r.siblings[11], [10, 12, 11]);
    assert.deepEqual(r.siblings[40], [40]);
    assert.equal(r.distinct, 2);
  });

  it('a user outside the login can never be switched into: 404 as for nobody; retired 409; banned 403', () => {
    assert.equal(r.playRefusal.ownExtra, null);
    assert.equal(r.playRefusal.backToFirst, null);
    for (const k of ['otherLogin', 'otherLoginsFirst', 'stranger', 'nobody', 'signedOut']) assert.deepEqual(r.playRefusal[k], { code: 'groddle_character_missing', status: 404 }, k);
    assert.deepEqual(r.playRefusal.retired, { code: 'groddle_character_retired', status: 409 });
    assert.deepEqual(r.playBanned, { code: 'groddle_suspended', status: 403 });
    assert.equal(r.playRoute.otherLogin.status, 404);
    assert.equal(r.playRoute.otherLogin.body.code, 'groddle_character_missing');
    assert.equal(r.playRoute.stranger.body.message, r.playRoute.otherLogin.body.message, 'another login reads exactly as a stranger');
    assert.equal(r.playRoute.retired.status, 409);
  });

  it('GET characters: the caller\'s login only, with the contract\'s keys', () => {
    assert.equal(r.list.status, 200);
    const b = r.list.body;
    assert.deepEqual(Object.keys(b), ['login', 'current', 'limit', 'canCreate', 'nextCreateAt', 'characters']);
    assert.equal(b.login, 10);
    assert.equal(b.current, 11);
    assert.equal(b.limit, 3);
    assert.deepEqual(b.characters.map((c) => c.id), [10, 12, 11]);
    assert.deepEqual(Object.keys(b.characters[0]), ['id', 'name', 'level', 'lastPlayedAt', 'retired', 'first']);
    assert.deepEqual(b.characters.map((c) => [c.first, c.retired]), [[true, false], [false, true], [false, false]]);
  });

  it('up to 3 characters a login (a retired one counting until its name hold ends) and one new character a day', () => {
    assert.equal(r.create.login10, null);
    assert.deepEqual(r.create.login10Full, { code: 'character_limit', status: 409, nextCreateAt: null });
    assert.equal(r.create.login20.code, 'character_daily');
    assert.equal(r.create.login20.status, 429);
    assert.equal(r.create.next20, true, 'nextCreateAt is a day after the last one');
    assert.equal(r.create.login20Tomorrow, null);
    assert.equal(r.create.login10AfterRetire?.code, 'character_limit', 'a retired character keeps its place during the hold');
    assert.deepEqual(r.counted, { now: 3, afterHold: 2 });
    assert.equal(r.create.login10AfterHold, null, 'after the hold it stops counting');
    assert.equal(r.createRoute.full.status, 409);
    assert.equal(r.createRoute.daily.status, 429);
    assert.equal(typeof r.createRoute.daily.body.nextCreateAt, 'number');
    assert.equal(r.createRoute.badName.status, 422);
    assert.ok(r.createRoute.badName.body.fields.name);
    assert.equal(r.createRoute.takenName.body.code, 'name_taken');
  });

  it('only an extra character retires, never the first or the one playing; another login\'s is 404', () => {
    assert.equal(r.retireRoute.first.body.code, 'groddle_character_first');
    assert.equal(r.retireRoute.current.body.code, 'groddle_character_current');
    assert.equal(r.retireRoute.otherLogin.status, 404);
  });

  it('a restore needs a free place, and after the hold a new name when the old one was taken', () => {
    assert.equal(r.restoreWhileHeld.status, 409);
    assert.equal(r.restoreWhileHeld.body.code, 'character_limit');
    assert.equal(r.restore.noName.status, 409);
    assert.equal(r.restore.noName.body.code, 'name_needed');
    assert.equal(r.restore.takenName.body.code, 'name_taken');
    assert.equal(r.restore.newName.status, 200);
    assert.deepEqual(r.restore.newName.body.character, { id: 12, name: 'Cyd Again', level: 1, lastPlayedAt: null, retired: false, first: false });
    assert.deepEqual(r.restored, { retired: null, name: 'Cyd Again', counted: 3, full: 'character_limit' });
  });

  it('X-Groddle-Character: another character answers 409 character_changed and the save is untouched; absent is accepted', () => {
    assert.deepEqual(r.guard, { absent: 'ok', same: 'ok', other: 'character_changed 409', blank: 'ok' });
    assert.deepEqual(r.saveRoute, { status: 409, code: 'character_changed' });
    assert.equal(r.saveKept, 4);
  });

  it('a ban covers the login: an alt banned from its own page is stored on the login; old rows on an alt still count', () => {
    assert.equal(r.banAlt.status, 200);
    assert.deepEqual(r.banRows, [20], 'stored on the login\'s id, not the alt\'s');
    assert.deepEqual(r.banned, { 20: true, 21: true, 10: false });
    assert.deepEqual(r.legacy, { first: true, retired: true, list: [10, 20] }, 'the server\'s bans list names logins');
    assert.equal(r.unbanLogin, 10);
    assert.equal(r.afterUnban, false);
    assert.equal(r.unbanAlt.status, 200);
    assert.equal(r.bansLeft, 0);
    assert.deepEqual(r.banOwnAlt, { status: 409, code: 'groddle_admin_self' });
    assert.equal(r.banLoginOfAlt, 50);
    assert.equal(r.banLoginRow, 50);
  });

  it('a silence or a community stop on one character holds for the login', () => {
    assert.deepEqual(r.silence, { 10: ['chat'], 12: ['chat'], 20: [] });
    assert.equal(r.claim10, true);
    assert.deepEqual(r.communityStopped, { 20: 0, 10: null });
  });

  it('moderators see the login: its age and every character', () => {
    assert.equal(r.loginOut.id, 10);
    assert.equal(r.loginOut.accountDays, 90);
    assert.deepEqual(r.loginOut.characters.map((c) => [c.id, c.first, c.retired]), [[10, true, false], [12, false, true], [11, false, false], [13, false, true]]);
  });

  it('blocks count logins: three characters of one login are one blocker', () => {
    assert.equal(r.flagOneLogin, 0);
    assert.equal(r.flagThreeLogins, 1);
  });

  it('a retired character\'s name is held 30 days, then someone else may take it', () => {
    assert.deepEqual(r.taken, { cydHeldOver: false, kitJustRetired: true, bea: true });
    assert.equal(r.claimCydNew, true);
    assert.equal(r.cydHolds, false, 'the retired one lets go, and a restore asks for a new name');
    assert.equal(r.slugs[60], 'cyd');
    assert.equal(r.slugs[12], undefined, 'a retired character has no page');
  });

  it('an administrator\'s rename: the row, the display name, a log line, and the old address 301s', () => {
    assert.equal(r.rename.status, 200);
    assert.equal(r.rename.body.text, 'Renamed Ada to Ada Two.');
    assert.deepEqual(r.renamed, { name: 'Ada Two', display: 'Ada Two', nickname: 'Ada Two', oldFree: true, row: { user_id: 10, old_name: 'Ada', old_slug: 'ada', new_name: 'Ada Two', admin_user_id: 1 }, log: 'rename' });
    assert.deepEqual(r.redirect, { old: [10, 'ada-two'], unknown: null });
    assert.equal(r.renameTaken.code, 'groddle_admin_name_taken');
    assert.equal(r.renameBad.code, 'groddle_admin_name');
  });

  it('analytics: QA by the login\'s email, and logins counted apart from characters', () => {
    assert.deepEqual(r.analyticsPlayers, [10, 11, 20], 'Gus is a QA login\'s character');
    assert.ok(r.loginSignups < r.characterSignups);
  });
});

describe('alternate characters in the site\'s source (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('the characters routes are the contract\'s, signed in, and registered', () => {
    const php = src('src/CharacterRoutes.php');
    const routes = [...php.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(Access::(\w+)\)\)\]/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
    assert.deepEqual(routes, [
      'Get /groddle/v1/characters SignedIn',
      'Post /groddle/v1/characters SignedIn',
      'Post /groddle/v1/characters/{id:\\d+}/play SignedIn',
      'Post /groddle/v1/characters/{id:\\d+}/retire SignedIn',
      'Post /groddle/v1/characters/{id:\\d+}/restore SignedIn',
    ]);
    assert.match(src('src/Extension.php'), /new CharacterRoutes\(\$minn\)/);
  });

  it('play checks the login first, ends the session, signs in as the target, and answers its nonce', () => {
    const php = src('src/CharacterRoutes.php');
    const play = php.slice(php.indexOf('public function play('), php.indexOf('public function retire('));
    assert.ok(play.indexOf('playRefusal(') < play.indexOf('signInVerified('), 'refused before anyone is signed in');
    assert.match(play, /\$accounts->signInVerified\(\$accounts->signOut\(Response::json\(\[\]\)\), \$user\)/);
    assert.match(play, /'nonce' => \$token === '' \? '' : Nonce::create\(\$user->id, \$token\)/);
    assert.match(play, /'ok' => true/);
  });

  it('a new character is a subscriber with a password nobody knows and an address that is never delivered', () => {
    assert.match(src('src/CharacterRoutes.php'), /registerQuietly\('player-' \. bin2hex\(random_bytes\(5\)\), Logins::email\(\), bin2hex\(random_bytes\(24\)\), \$name, PlayerAccount::ROLE\)/);
    assert.match(src('src/Logins.php'), /EMAIL_DOMAIN = 'characters\.invalid'/);
  });

  it('the guard sits first in every save write, the ticket and each value-moving signed-in route', () => {
    const guard = /Logins::guard\(\$request, \(int\) \$this->minn->reader->userId\);/;
    const routes = {
      'src/MultiplayerSave.php': ['write'],
      'src/RealtimeTicket.php': ['ticket'],
      'src/LedgerMail.php': ['send', 'collect'],
      'src/LedgerAuction.php': ['create', 'buy', 'cancel', 'collect'],
      'src/ButlerParcels.php': ['take'],
      'src/ButlerGifts.php': ['give', 'adopt'],
      'src/LedgerBoxes.php': ['put', 'remove', 'collect'],
      'src/LedgerFurniture.php': ['put', 'remove', 'collect'],
      'src/HomePool.php': ['collect'],
      'src/LedgerStarter.php': ['ask'],
    };
    for (const [file, names] of Object.entries(routes)) {
      const php = src(file);
      const guarded = [...php.matchAll(/public function (\w+)\(Request \$request[^)]*\): Response\n    \{\n        Logins::guard/g)].map((m) => m[1]);
      assert.equal(guarded.length, names.length, `${file}: ${guarded.join(', ')}`);
      assert.match(php, guard, file);
    }
  });

  it('the ticket carries acct, the login', () => {
    assert.match(src('src/RealtimeTicket.php'), /'acct' => \(new Logins\(\$this->minn->db\)\)->loginOf\(\$user->id\)/);
  });

  it('bans go to the realtime server as the login, sync included', () => {
    const console = src('src/AdminConsole.php');
    const ban = console.slice(console.indexOf('public function ban('), console.indexOf('public function unban('));
    assert.match(ban, /\$login = \$logins->loginOf\(\$player\['id'\]\);/);
    assert.match(ban, /->post\('ban', \['player' => \$login, 'reason' => \$reason\]\)/);
    assert.match(console, /->post\('unban', \['player' => \$login\]\)/);
    assert.match(console, /->post\('bans', \['players' => self::bannedLogins\(\$this->minn->db\)\]\)/);
    const mod = src('src/Moderation.php');
    assert.match(mod, /\$login = AdminConsole::banLogin\(\$db, \$player\['id'\]/);
    assert.match(mod, /->post\('ban', \['player' => \$login, 'reason' => \$reason\]\)/);
    assert.match(mod, /->post\('unban', \['player' => \$login\]\)/);
  });

  it('the email and password are the login\'s: account routes, reset, /me and report replies', () => {
    const acct = src('src/PlayerAccount.php');
    assert.match(acct, /changePassword\(Response::json\(\[\]\), \$login,/);
    assert.match(acct, /changeEmail\(\$this->loginUser\(\$this->minn->user\(\)\)/);
    assert.match(acct, /\$this->endSessions\(\(new Logins\(\$this->minn->db\)\)->siblings\(\$user->id\)\);/, 'a reset signs every character out');
    assert.match(acct, /\$this->endSessions\(\$siblings\);/);
    assert.match(src('src/Player.php'), /'account' => \['email' => self::loginEmail\(\$this->minn->db, \$user\)\]/);
    assert.match(src('src/AdminTickets.php'), /WHERE ID = \?', \[\(new Logins\(\$db\)\)->loginOf\(\$player\)\]/);
    assert.equal((src('src/SoloBackups.php').match(/\$this->owner\(\)/g) || []).length, 4, 'every backup route keys by the login');
  });

  it('reacts and reports count once a login', () => {
    const c = src('src/Community.php');
    assert.match(c, /throw self::refuse\('groddle_community_react_login', 409\)/);
    assert.match(c, /reporter_id IN \(\?\) LIMIT 1", \[\$id, \(new Logins\(\$db\)\)->siblings/);
    assert.match(src('src/LedgerBoard.php'), /reporter_id IN \(\?\) LIMIT 1", \[\$id, \(new Logins\(\$db\)\)->siblings\(\$user->id\)\]/);
    assert.match(src('src/CommunityText.php'), /'groddle_community_react_login' =>/);
  });

  it('the console: a player\'s login (administrators only) and rename', () => {
    const console = src('src/AdminConsole.php');
    assert.match(console, /#\[Route\(Method::Get, '\/groddle\/v1\/admin\/players\/\{id:\\d\+\}', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    assert.match(console, /#\[Route\(Method::Post, '\/groddle\/v1\/admin\/players\/\{id:\\d\+\}\/rename', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    const js = src('console/console.js');
    assert.match(js, /export function accountMenuFor\(\)/);
    assert.match(js, /api\.call\(`admin\/players\/\$\{p\.id\}`\)/);
    assert.match(js, /case 'rename': return `renamed/);
  });

  it('privacy: no route a player reads names another character of the login', () => {
    // The only routes that list a login's characters: the caller's own (CharacterRoutes), the console's and the mod API's.
    const readers = [];
    for (const f of ['Player.php', 'Profiles.php', 'PlayerPages.php', 'Buddies.php', 'BuddiesOnline.php', 'ChatPeople.php', 'Community.php', 'CommunityPages.php']) {
      if (/charactersOf\(|loginOut\(|siblings\(/.test(src(`src/${f}`)) && !/Community\.php/.test(f)) readers.push(f);
    }
    assert.deepEqual(readers, []);
    // Community uses siblings only to count and refuse, never in an answer.
    const c = src('src/Community.php');
    for (const m of c.matchAll(/siblings\(/g)) {
      const line = c.slice(c.lastIndexOf('\n', m.index), c.indexOf('\n', m.index));
      assert.doesNotMatch(line, /Response::json|return \[/, line);
    }
    assert.match(src('src/Moderation.php'), /'login' => self::loginOut\(\$db, \$pid\)/);
    assert.match(src('src/ModReports.php'), /'login' => \$reported > 0 \? Moderation::loginOut\(\$db, \$reported\) : null/);
  });
});
