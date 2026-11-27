/**
 * Furniture sales with no limits (Austin 2026-11-25, found by lane roomk). The site capped a house at
 * 60 pieces on sale at once ("You have a lot on sale already.", LedgerFurniture::LISTED_MAX) and sent
 * the owner only the first 100 piles of currants waiting to be collected, so the rest could never be
 * collected. Glitch had neither: furniture_base set_sale_price (furniture_bed.js 92-191) checks only
 * canSell, an emptied bag, soulbound and uncollected currants, and every sale left its own
 * pile_of_currants (sellItem 609). tests/fixtures/furniture-sales/sales-unlimited.php runs
 * groddle-afternoon-site src/LedgerFurniture.php on a MariaDB database it makes for the run
 * (test_groddle_sales_<hex>) and drops: 150 pieces on sale at once, a visitor buys 250, the owner
 * is sent all 250 piles and collects each. The database is the local Cove one by default
 * (GRODDLE_TEST_MYSQL="host user password" overrides); without the site, the engine, a php with
 * mysqli or a database that part skips.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/furniture-sales-unlimited.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { normalizeListings, normalizePiles } from '../public/js/home-street-mp.js?v=379ceedb';
import { PHP } from './php.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
// A php that runs scripts and has mysqli (php -v alone fails on some wrappers that run scripts fine).
const hasPhp = spawnSync(PHP, ['-r', 'exit(function_exists("mysqli_report") ? 0 : 1);']).status === 0;

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
const reachable = db && hasPhp && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!hasPhp && 'no php with mysqli')
  || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the site: no limit on pieces for sale or on piles (src/LedgerFurniture.php)', { skip: skipWithoutSite }, () => {
  const src = () => readFileSync(sitePath('src/LedgerFurniture.php'), 'utf8');

  it('no cap on pieces on sale, and no "You have a lot on sale already."', () => {
    const php = src();
    assert.doesNotMatch(php, /LISTED_MAX|TEXT_TOO_MANY|groddle_sale_many|'You have a lot on sale already\.'/);
    assert.match(php, /WHERE owner_id = \? AND status = 'listed' ORDER BY uid", \[\$owner\]\)/, 'every listing read');
  });

  it('every pile is read, a page at a time', () => {
    const php = src();
    assert.doesNotMatch(php, /LIMIT 100\b/);
    assert.match(php, /public const PILES_PAGE = 200;/);
    assert.match(php, /if \(count\(\$page\) < self::PILES_PAGE\) \{\s*break;/);
  });

  it('says what Glitch had: no limit (furniture_bed.js set_sale_price, sellItem 609)', () => {
    assert.match(src(), /Glitch had\s+\*\s+none: furniture_base set_sale_price \(furniture_bed\.js 92-191\)/);
  });
});

describe('the game keeps every listing and pile the site sends (js/home-street-mp.js)', () => {
  const op = (i) => `furn-${i.toString(16).padStart(16, '0')}`;
  it('150 listings and 250 piles, none dropped', () => {
    const listed = normalizeListings(Array.from({ length: 150 }, (_, i) => ({ op: op(i + 1), uid: i + 1, class: 'furniture_chair', price: 5 })));
    assert.equal(listed.size, 150);
    const piles = normalizePiles(Array.from({ length: 250 }, (_, i) => ({ op: op(i + 1), uid: i + 1, class: 'furniture_chair', price: 5, x: i, buyer: { id: 9, name: 'Visitor' } })));
    assert.equal(piles.length, 250);
  });

  it('the house draws and collects each pile it holds (features/home-street-mp-feature.js)', () => {
    const feat = readFileSync(join(root, 'public/js/features/home-street-mp-feature.js'), 'utf8');
    assert.match(feat, /own\.piles = normalizePiles\(sales\?\.piles\);/);
    assert.match(feat, /for \(const pile of own\.piles\) \{/);
    assert.match(feat, /const a = await site\.collect\(op\);/);
  });
});

describe('150 on sale, 250 bought, 250 piles collected, on a real database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/furniture-sales/sales-unlimited.php'), engine, SITE_DIR, db.host, db.user, db.pass], { timeout: 180000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_sales_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('150 pieces go on sale at once, and the owner is told of all 150', () => {
    assert.deepEqual(r.priceRefused, [], 'no price refused (the old cap refused the 61st)');
    assert.equal(r.listed150, 150);
  });

  it('250 piles, every one sent to the owner and collected, every currant paid', () => {
    assert.equal(r.bought, 250);
    assert.deepEqual(r.buyFails, []);
    assert.equal(r.piles, 250, 'not the first 100');
    assert.equal(r.pilesDistinct, 250);
    assert.equal(r.pileBuyer, 'Visitor');
    assert.equal(r.collected, 250);
    assert.equal(r.paid, r.pilesSum);
    assert.equal(r.ownerGained, r.pilesSum);
    assert.equal(r.pilesAfter, 0, 'none left behind');
  });
});
