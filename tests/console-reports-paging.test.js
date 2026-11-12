/**
 * The console's Reports list pages (2026-11-11): GET admin/tickets carried at
 * most TicketStore::LIST_MAX (200) rows and the header counted the rows
 * loaded ("Reports 200" with 218 tickets), so old closed reports vanished.
 * Now the route takes an offset and gives more + total, the header shows the
 * total for the filter, and Show older appends the next page. The player's
 * own list (listFor) stays one capped page. Site repo only
 * (groddle-afternoon-site src/TicketStore.php, src/AdminTickets.php,
 * src/AdminConsolePage.php, console/console.js); skipped without it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HAS_SITE, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const src = (p) => readFileSync(sitePath(p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';

describe('the Reports list pages (groddle-afternoon-site)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('the header counts every report the filter holds, not the rows loaded', () => {
    assert.equal(mod.reportsCount({ total: 218, list: new Array(200).fill({}) }), '218');
    assert.equal(mod.reportsCount({ total: 0, list: [] }), '');
    // A site without paging gives no total: the rows loaded, as before.
    assert.equal(mod.reportsCount({ total: null, list: new Array(200).fill({}) }), '200');
    assert.equal(mod.reportsCount({ list: [] }), '');
    assert.equal(mod.reportsCount(), '');
  });

  it('TicketStore::listAll pages by offset in the same order; listFor stays one page', () => {
    const store = src('src/TicketStore.php');
    assert.match(store, /public const LIST_MAX = 200;/);
    assert.match(store, /public function listAll\(\?string \$status, int \$offset = 0\): array/);
    assert.match(store, /\$offset = max\(0, \$offset\);/);
    assert.match(store, /ORDER BY admin_unread DESC, FIELD\(status, 'open', 'working', 'answered', 'closed'\), last_message_at DESC, id DESC LIMIT " \. \(self::LIST_MAX \+ 1\) \. ' OFFSET ' \. \$offset/);
    assert.match(store, /'more' => count\(\$rows\) > self::LIST_MAX,/);
    assert.match(store, /'total' => \(int\) \$this->db->value\("SELECT COUNT\(\*\) FROM \{\$t\} \{\$where\}", \$args\),/);
    const mine = store.slice(store.indexOf('public function listFor('), store.indexOf('public function unreadCount('));
    assert.match(mine, /LIMIT " \. self::LIST_MAX, \[\$player\]\);/);
    assert.doesNotMatch(mine, /OFFSET/i);
  });

  it('GET admin/tickets takes a digits-only offset and gives more and total', () => {
    const php = src('src/AdminTickets.php');
    const index = php.slice(php.indexOf('public function index('), php.indexOf('public function show('));
    assert.match(index, /\$offset = \(string\) \(\$request->query\('offset'\) \?\? '0'\);/);
    assert.match(index, /if \(!ctype_digit\(\$offset\) \|\| strlen\(\$offset\) > 9\) \{\s*throw new RestError\('groddle_ticket_offset', '[^']+', 400\);/);
    assert.match(index, /->listAll\(in_array\(\$status, TicketStore::STATUSES, true\) \? \$status : null, \(int\) \$offset\)/);
    assert.match(index, /'more' => \$list\['more'\],\s*'total' => \$list\['total'\],/);
    assert.match(php, /admin\/tickets\?status=open\|answered\|working\|closed\|all&offset=n .*"more":bool,"total":n/);
  });

  it('a bad offset is refused before the store is asked (php)', { skip: (!hasPhp && 'no php') || noEngine }, () => {
    const script = `<?php
[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\\Autoloader::register();
spl_autoload_register(static function (string $class) use ($extension): void {
    $prefix = 'Groddle\\\\Minn\\\\';
    if (str_starts_with($class, $prefix) && is_file($file = $extension . '/src/' . substr($class, strlen($prefix)) . '.php')) {
        require $file;
    }
});
$blank = static fn (string $c): object => (new ReflectionClass($c))->newInstanceWithoutConstructor();
$out = [];
foreach (['-1', 'abc', '1.5', '1e3', '9999999999', ''] as $offset) {
    $req = new Minn\\Http\\Request(Minn\\Http\\Method::Get, '/groddle/v1/admin/tickets', ['status' => 'all', 'offset' => $offset], [], [], '', true, 'groddle.test');
    $seams = new Minn\\Extension\\Seams($blank(Minn\\Db::class), $blank(Minn\\Content\\Site::class), $req, $blank(Minn\\Content\\Reader::class));
    try {
        (new Groddle\\Minn\\AdminTickets($seams))->index($req);
        $out[$offset] = 'answered';
    } catch (Minn\\RestError $e) {
        $out[$offset] = $e->errorCode . ' ' . $e->status;
    } catch (Throwable $e) {
        $out[$offset] = 'reached the store';
    }
}
echo json_encode($out);
`;
    const out = JSON.parse(execFileSync('php', ['--', engine, SITE_DIR], { input: script, encoding: 'utf8' }));
    for (const bad of ['-1', 'abc', '1.5', '1e3', '9999999999', '']) assert.equal(out[bad], 'groddle_ticket_offset 400', bad);
  });

  it('the console: Show older after the list, the next page appended, a filter switch starts over', () => {
    const page = src('src/AdminConsolePage.php');
    assert.match(page, /<ul class="console-list console-ticketlist" data-console-tickets aria-label="Reports"><\/ul>\s*<button type="button" class="console-more" data-console-tickets-more hidden>Show older<\/button>/);
    const js = src('console/console.js');
    assert.match(js, /\$\('\[data-console-tickets-count\]'\)\.textContent = reportsCount\(tickets\);/);
    assert.match(js, /\$\('\[data-console-tickets-more\]'\)\.hidden = !tickets\.more;/);
    assert.match(js, /admin\/tickets\?status=\$\{status\}\$\{rows\.length \? `&offset=\$\{rows\.length\}` : ''\}/);
    assert.match(js, /const rows = older \? tickets\.list\.slice\(\) : \[\];/);
    // The poll and actions refresh as many rows as are shown, so Show older's rows stay.
    assert.match(js, /\} while \(r\.more && rows\.length < keep\);/);
    assert.match(js, /if \(ask !== ticketsAsked \|\| status !== tickets\.status\) return;/);
    assert.match(js, /tickets\.status = b\.dataset\.status;[\s\S]{0,200}Object\.assign\(tickets, \{ list: \[\], more: false, total: null \}\);\s*loadTickets\(\);/);
    assert.match(js, /\$\('\[data-console-tickets-more\]'\)\.addEventListener\('click', async \(e\) => \{[\s\S]{0,200}await loadTickets\(true\);[\s\S]{0,300}\.children\[had\]\?\.querySelector\('button'\)\?\.focus\(\);/);
    // The look: the console's own Older button style, with its focus ring.
    const css = src('console/console.css');
    assert.match(css, /\.console \.console-more \{/);
    assert.match(css, /\.console button:focus-visible/);
    for (const words of ['Show older', mod.reportsCount({ total: 3 })]) assert.ok(!/[—–]/.test(words), words);
  });
});
