/**
 * The PHP the site tests run on, found the same way on every machine (like
 * tests/python311.js for Python):
 *
 *   $GRODDLE_PHP when set (used as given), else the first `php` on PATH,
 *   Homebrew's, or /usr/bin/php that runs a script and has the extensions the
 *   suite needs (NEEDED), else the first that runs at all.
 *
 * Cove's FrankenPHP `php` is passed over when another is here: its `php -v`
 * fails, its `-l` runs the file, and PHP_BINARY is frankenphp itself, so a
 * fixture that starts a copy of itself (the proc_open races) cannot.
 *
 * An extension the PHP ships but leaves off (Arch's php has mysqli and gd in
 * /usr/lib/php/modules, commented out in php.ini) is switched on for this test
 * process and every php it starts: an ini in the temp folder, added through
 * PHP_INI_SCAN_DIR. Nothing outside the temp folder changes.
 *
 * Tests run PHP, never 'php', and skip with phpSkip('gd') (or phpSkip() for any
 * PHP), whose reason names what is missing. A missing extension is also said
 * once on stderr, so a skipped group is never silent. GRODDLE_PHP is set for
 * the php fixtures run, which start their children with it (PHP_BINARY alone
 * would drop the extensions an ini of their parent loaded).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { basename, delimiter, join } from 'node:path';

/** The extensions site tests use: mysqli (the throwaway-MariaDB fixtures) and gd with WebP (pictures). */
export const NEEDED = ['mysqli', 'gd'];

const PROBE = 'echo json_encode([PHP_BINARY, array_map("strtolower", get_loaded_extensions()), ini_get("extension_dir"), PHP_SHLIB_SUFFIX, function_exists("imagewebp")]);';

function probe(bin) {
  const r = spawnSync(bin, ['-r', PROBE], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) return null;
  try {
    const [binary, exts, extDir, suffix, webp] = JSON.parse(r.stdout.trim().split('\n').pop());
    return { bin, binary, exts: new Set(exts), extDir, suffix, webp };
  } catch {
    return null;
  }
}

/** Shipped-but-off extensions of `p` from `want`, switched on through an ini (returns the probe again, or p). */
function enableShipped(p, want) {
  const off = want.filter((e) => !p.exts.has(e) && p.extDir && existsSync(join(p.extDir, `${e}.${p.suffix}`)));
  if (!off.length) return p;
  let user = 'user';
  try { user = userInfo().username; } catch {}
  const dir = join(tmpdir(), `groddle-php-${user}`, off.join('-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'groddle-tests.ini'), off.map((e) => `extension=${e}\n`).join(''));
  const before = process.env.PHP_INI_SCAN_DIR;
  // A leading separator keeps the PHP's own scan folder (/etc/php/conf.d and the like).
  process.env.PHP_INI_SCAN_DIR = `${before ?? ''}${delimiter}${dir}`;
  const again = probe(p.bin);
  if (again && off.every((e) => again.exts.has(e))) return again;
  if (before === undefined) delete process.env.PHP_INI_SCAN_DIR;
  else process.env.PHP_INI_SCAN_DIR = before;
  return p;
}

function find() {
  if (process.env.GRODDLE_PHP) return probe(process.env.GRODDLE_PHP) || { bin: process.env.GRODDLE_PHP, exts: new Set(), broken: true };
  const seen = new Set();
  const found = [];
  for (const bin of [...(process.env.PATH || '').split(delimiter).filter(Boolean).map((d) => join(d, 'php')), '/opt/homebrew/bin/php', '/usr/bin/php']) {
    if (seen.has(bin) || !existsSync(bin)) continue;
    seen.add(bin);
    const p = probe(bin);
    if (p) found.push(p);
  }
  const plain = found.filter((p) => !basename(p.binary || '').startsWith('frankenphp'));
  const has = (p) => NEEDED.every((e) => p.exts.has(e));
  return plain.find(has)
    || plain.map((p) => enableShipped(p, NEEDED)).find(has)
    || found.find(has)
    || plain[0] || found[0] || null;
}

const found = find();

/** The php command: an absolute path (or $GRODDLE_PHP), or 'php' when none runs. */
export const PHP = found?.bin || 'php';
/** Whether a PHP that runs scripts is here. */
export const HAS_PHP = Boolean(found && !found.broken);
/** The extensions that PHP has loaded (lower case). */
export const PHP_EXTENSIONS = found?.exts || new Set();

if (HAS_PHP) process.env.GRODDLE_PHP = PHP;

const missing = (exts) => exts.filter((e) => !PHP_EXTENSIONS.has(e) || (e === 'gd' && !found.webp));
const install = (exts) => exts.map((e) => (e === 'gd' ? 'gd with WebP' : e)).join(', ');

/**
 * A test's `skip` option: false when PHP is here with every extension named,
 * else the reason, naming what is missing and how to point the suite at one.
 */
export function phpSkip(...exts) {
  if (!HAS_PHP) return found?.broken ? `GRODDLE_PHP=${PHP} does not run (php -r failed)` : 'no php: install PHP 8.3+ or set GRODDLE_PHP';
  const gone = missing(exts);
  return gone.length ? `php at ${PHP} has no ${install(gone)} (install it, or set GRODDLE_PHP to a php that has it)` : false;
}

const gone = HAS_PHP ? missing(NEEDED) : [];
if (!HAS_PHP || gone.length) {
  process.stderr.write(`tests/php.js: ${phpSkip(...NEEDED)}; the site tests that need it skip.\n`);
}
