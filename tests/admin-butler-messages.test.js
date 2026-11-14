/**
 * Messages players leave with the team's Butlers, for /groddle-check (Austin 2026-11-13; groddle-afternoon-site
 * src/AdminButler.php). Only parcels owned by the team are listed: the route takes no owner, so what players leave
 * for each other stays private, like IMs. The PHP runs through the php CLI.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || (!hasPhp && 'needs the php CLI');

function php(body, input = {}) {
  const code = `
    require ${JSON.stringify(SITE_DIR)} . '/src/AdminButler.php';
    use Groddle\\Minn\\AdminButler;
    $in = json_decode(stream_get_contents(STDIN), true);
    ${body}`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify(input) })));
}

describe('admin butler messages (the team\'s Butlers only)', { skip }, () => {
  const rows = [
    { id: 'butler-01', owner_id: 1, from_id: 500, class_tsid: 'hooch', count: 1, message: 'does it matter what I break it with?', created_at: '2026-11-11 20:00:00', taken_at: '2026-11-13 22:00:00' },
    { id: 'butler-02', owner_id: 77, from_id: 500, class_tsid: '', count: 0, message: 'a private note to a friend', created_at: '2026-11-12 10:00:00', taken_at: null },
    { id: 'butler-03', owner_id: 54, from_id: 520, class_tsid: '', count: 0, message: 'thanks for the fix', created_at: '2026-11-13 09:00:00', taken_at: null },
    { id: 'butler-04', owner_id: 1, from_id: 520, class_tsid: 'apple', count: 3, message: '', created_at: '2026-11-13 09:30:00', taken_at: null },
    { id: 'butler-05', owner_id: 1, from_id: 520, class_tsid: '', count: 0, message: '', created_at: '2026-11-13 09:40:00', taken_at: null },
  ];
  const names = { 1: 'Aeghor', 54: 'Review', 500: 'mr granberry', 520: 'Dr Flavius' };

  it('lists only parcels owned by the team, never one a player left for another player', () => {
    const out = php(`echo json_encode(AdminButler::rowsOut($in['rows'], [1, 54], array_combine(array_map('intval', array_keys($in['names'])), array_values($in['names']))));`, { rows, names });
    assert.deepEqual(out.map((r) => r.id), ['butler-01', 'butler-03', 'butler-04']);
    assert.ok(!JSON.stringify(out).includes('a private note'));
  });

  it('carries who, what, the words, when (UTC) and whether it was taken', () => {
    const [first, , apples] = php(`echo json_encode(AdminButler::rowsOut($in['rows'], [1, 54], array_combine(array_map('intval', array_keys($in['names'])), array_values($in['names']))));`, { rows, names });
    assert.deepEqual(first, {
      id: 'butler-01', to: { id: 1, name: 'Aeghor' }, from: { id: 500, name: 'mr granberry' },
      text: 'does it matter what I break it with?', item: { class: 'hooch', count: 1 }, at: '2026-11-11T20:00:00Z', taken: true,
    });
    assert.equal(apples.text, '');
    assert.deepEqual(apples.item, { class: 'apple', count: 3 });
    assert.equal(apples.taken, false);
  });

  it('works out the team from capabilities, sorted, without zero or repeats', () => {
    const staff = php(`echo json_encode(AdminButler::staffOf($in['owners'], fn (int $id): bool => in_array($id, [1, 54], true)));`, { owners: [77, 54, 1, 0, 1, 500] });
    assert.deepEqual(staff, [1, 54]);
  });

  it('reads since as an ISO time, else the last 30 days', () => {
    const now = Date.UTC(2026, 10, 13, 23, 0, 0) / 1000;
    assert.equal(php(`echo json_encode(AdminButler::sinceOf($in['s'], $in['now']));`, { s: '2026-11-13T19:48:07.928Z', now }), '2026-11-13 19:48:07');
    assert.equal(php(`echo json_encode(AdminButler::sinceOf($in['s'], $in['now']));`, { s: 'nonsense', now }), '2026-10-14 23:00:00');
    assert.equal(php(`echo json_encode(AdminButler::sinceOf($in['s'], $in['now']));`, { s: '', now }), '2026-10-14 23:00:00');
  });

  it('is an administrators-only GET that takes no owner and is registered', () => {
    const src = readFileSync(sitePath('src/AdminButler.php'), 'utf8');
    assert.match(src, /#\[Route\(Method::Get, '\/groddle\/v1\/admin\/butler_messages', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    assert.match(src, /private const ADMIN = 'manage_options';/);
    assert.doesNotMatch(src, /query\('(owner|user|to)'\)/);
    assert.match(src, /WHERE owner_id IN \(\?\)/);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new AdminButler\(\$minn\)/);
  });
});
