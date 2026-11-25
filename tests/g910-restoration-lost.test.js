// G910: the restoration report's Gone for good list (the What can't come back band) drew empty. It
// listed the checklist's items marked lost, and the last of them (Snapshots) came back with the Snaps.
// What can't come back now lives on the Known gaps page as Not possible (public/restoration/gaps.json),
// so build-restoration.mjs writes data.lost from both, and the site (src/Restoration.php lost) and the
// page's script (public/restoration/restoration.js) draw that.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lostList } from '../tools/build-restoration.mjs';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const data = json('public/restoration/data.json');
const gaps = json('public/restoration/gaps.json');
const hasPhp = HAS_PHP;

describe('G910: Gone for good', () => {
  it('lostList takes the lost checklist items first, then each Not possible gap under its area', () => {
    const items = [{ name: 'A', status: 'source', blurb: 'back' }, { name: 'B', status: 'lost', blurb: 'gone' }];
    const g = { areas: [{ name: 'Sounds', items: [{ id: 'G1', text: 'never archived', state: 'lost' }, { id: 'G2', text: 'fixed', state: 'fixed' }] }] };
    assert.deepEqual(lostList(items, g), [{ name: 'B', blurb: 'gone' }, { name: 'Sounds', blurb: 'never archived' }]);
    assert.deepEqual(lostList(items, null), [{ name: 'B', blurb: 'gone' }]);
  });

  it('data.json carries every Not possible gap, so the list is never empty while one is listed', () => {
    const want = gaps.areas.flatMap((a) => a.items.filter((g) => g.state === 'lost').map((g) => ({ name: a.name, blurb: g.text })));
    assert.ok(want.length > 0, 'gaps.json lists something that cannot come back');
    assert.ok(Array.isArray(data.lost) && data.lost.length >= want.length);
    for (const row of want) assert.ok(data.lost.some((r) => r.name === row.name && r.blurb === row.blurb), row.blurb);
  });

  it('the page script draws data.lost', () => {
    const js = readFileSync(join(root, 'public/restoration/restoration.js'), 'utf8');
    assert.match(js, /const lost = Array\.isArray\(data\.lost\) \? data\.lost : data\.items\.filter\(\(i\) => i\.status === 'lost'\);/);
    assert.match(js, /\$\('#lost-list'\)\?\.replaceChildren\(\.\.\.lost\.map\(/);
  });

  it('the site draws the same list (src/Restoration.php lost)', { skip: skipWithoutSite || (!hasPhp && 'no php on PATH') }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'g910-'));
    const file = join(dir, 'data.json');
    writeFileSync(file, JSON.stringify({ items: data.items, lost: data.lost }));
    const code = `namespace Minn { final class Html { public static function esc(string $s): string { return htmlspecialchars($s, ENT_QUOTES); } } }
      namespace { require ${JSON.stringify(join(SITE_DIR, 'src/Restoration.php'))};
      $m = new ReflectionMethod(Groddle\\Minn\\Restoration::class, 'lost'); $m->setAccessible(true);
      $d = json_decode(file_get_contents(${JSON.stringify(file)}), true);
      echo $m->invoke(null, $d), "\\n---\\n", $m->invoke(null, ['items' => $d['items']]); }`;
    const [withList, oldData] = execFileSync(PHP, ['-r', code], { encoding: 'utf8' }).split('\n---\n');
    const rows = withList.match(/<li>/g) || [];
    assert.equal(rows.length, data.lost.length);
    assert.match(withList, /<b>Sounds<\/b>: /);
    // Data from before the lost list falls back to the checklist's lost items (none now).
    assert.equal(oldData, '<ul class="honest-list" id="lost-list"></ul>');
  });
});
