/**
 * #697 (Austin 2026-11-25: "match Glitch's shared use of icons"): the site keeps one action count
 * and one last tither for each Giant Icon placed in a home, as items/include/icon.js kept them on
 * the Icon item for everyone (use 360-376, icon_tithe 297-328, the tither's double 87-94).
 * tests/fixtures/home-icons/shared-icons.php runs groddle-afternoon-site src/HomeIcons.php on a
 * MariaDB database it makes for the run (test_groddle_icons_<hex>) and drops: visitors and the owner
 * ruminate, tithe, are bestowed upon; who may (a block, the house without and with a key); two PHP
 * processes ask for an Icon's last action at the same moment and only one gets it; the owner's
 * catch-up read lets a picked-up Icon's row go. The database is the local Cove one by default
 * (GRODDLE_TEST_MYSQL="host user password" overrides); without the site, the engine, php with
 * mysqli or a database it skips.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/giant-icons-shared-db.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = spawnSync('php', ['-v']).status === 0;

/** The database to make the throwaway one on: GRODDLE_TEST_MYSQL, else the local groddle.localhost's wp-config. */
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
const hasPcntl = hasPhp && spawnSync('php', ['-r', 'exit(function_exists("proc_open") ? 0 : 1);']).status === 0;
const skip = skipWithoutSite
  || (!hasPhp && 'no php')
  || (!hasPcntl && 'no proc_open in this php')
  || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

const proof = (token) => JSON.parse(Buffer.from(String(token).split('.')[0], 'base64url').toString());

describe('#697: one shared count per Icon placed in a home (HomeIcons)', { skip }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/home-icons/shared-icons.php'), engine, SITE_DIR, db.host, db.user, db.pass], { timeout: 120000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_icons_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('a visitor\'s use spends one of the Icon\'s actions, and the proof tells everyone there', () => {
    assert.deepEqual([r.boRuminate.ok, r.boRuminate.icon.actions, r.boRuminate.tither], [true, 10, false]);
    const p = proof(r.boRuminate.tell);
    assert.deepEqual([p.k, p.sub, p.o, p.act.i, p.act.pl, p.act.a, p.act.n, p.act.t], ['home_icon', 9, 7, 'icon3', 'street', 'ruminate', 10, null]);
  });

  it('tithes as icon_tithe: +5 at 10 or fewer and the payer is the last tither; above 10 none is needed', () => {
    assert.deepEqual([r.cyTithe.ok, r.cyTithe.icon.actions, r.cyTithe.icon.tither], [true, 15, 11]);
    assert.deepEqual([r.boTitheTooMany.ok, r.boTitheTooMany.code, r.boTitheTooMany.text], [false, 'no_tithe', 'This Icon does not require a tithe.']);
  });

  it('only the last tither\'s next use or bestowment is doubled, and it spends the double for everyone', () => {
    assert.deepEqual([r.boBestow.ok, r.boBestow.code], [false, 'not_tither']);
    assert.deepEqual([r.cyRevere.ok, r.cyRevere.tither, r.cyRevere.icon.actions, r.cyRevere.icon.tither], [true, true, 14, null]);
    assert.deepEqual([r.cyBestowAfter.ok, r.cyBestowAfter.code], [false, 'not_tither']);
  });

  it('the owner\'s own use counts on the same Icon, and a visit shows the kept count', () => {
    assert.deepEqual([r.ownerReflect.ok, r.ownerReflect.icon.actions], [true, 13]);
    assert.deepEqual(r.visitRows.map((x) => [x.id, x.actions, x.tither]), [['icon3', 13, null], ['icon4', 20, null]]);
  });

  it('who may: not a blocked player; the house\'s Icon only with a key; the place must be the Icon\'s', () => {
    assert.deepEqual([r.deeBlocked.http, r.deeBlocked.code], [403, 'groddle_icon_blocked']);
    assert.deepEqual([r.boHouseNoKey.http, r.boHouseNoKey.code], [403, 'groddle_icon_house']);
    assert.deepEqual([r.boHouseKey.ok, r.boHouseKey.icon.actions], [true, 19]);
    assert.deepEqual([r.wrongPlace.http, r.wrongPlace.code], [404, 'groddle_icon_gone']);
    assert.deepEqual([r.bad.http, r.bad.code], [400, 'groddle_icon_invalid']);
  });

  it('two players asking for the last action at the same moment: one gets it, never both', () => {
    assert.equal(r.race.length, 2);
    const ok = r.race.filter((x) => x.ok === true);
    const no = r.race.filter((x) => x.ok === false);
    assert.equal(ok.length, 1, JSON.stringify(r.race));
    assert.equal(no.length, 1);
    assert.equal(no[0].code, 'tithe_due');
    assert.deepEqual(r.afterRace, { actions: 0, tither: null });
    assert.equal(r.emptyUse.code, 'tithe_due');
  });

  it('the owner\'s game reads what was spent while away; a picked-up Icon\'s row goes', () => {
    assert.deepEqual(r.mine.icons, [{ id: 'icon3', place: 'street', actions: 0, tither: null }, { id: 'icon4', place: 'house', actions: 19, tither: null }]);
    assert.deepEqual(r.minePickedUp.icons.map((x) => x.id), ['icon3']);
    assert.equal(r.rowsLeft, 1);
    assert.deepEqual([r.gone.http, r.gone.code], [404, 'groddle_icon_gone']);
  });
});
