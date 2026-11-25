/**
 * #698: a group's administrator renames it and changes its description
 * (GameServerJS groups/group.js:494-499 admin_edit set label and desc, which
 * the website's group pages called; level 1, Administrator, held every
 * permission, group.js:46-50, 310; renaming is Austin's ruling, G1300). The
 * site's route (groddle-afternoon-site src/Groups.php edit, PUT
 * groddle/v1/groups/{id}) is run on a throwaway MariaDB database by
 * tests/fixtures/groups/group-edit.php; the game's Edit button and form are
 * in tests/groups.test.js, the realtime server's note in the server repo's
 * group_rename_test.go.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { GAME_DIR, HAS_SITE, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

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
const hasPhp = HAS_PHP;
// A PHP that has mysqli as a module only (Arch's) gets it loaded.
const phpArgs = hasPhp && spawnSync(PHP, ['-r', 'exit(class_exists("mysqli") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=mysqli'] : [];
const db = mysql();
const reachable = db && hasPhp && spawnSync(PHP, [...phpArgs, '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!HAS_SITE && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

const WORDS = 'Come work on quests that you need multiple people around for!';

describe('#698: editing a group on a throwaway database (Groups::edit)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...phpArgs, join(GAME_DIR, 'tests/fixtures/groups/group-edit.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 60000 }).toString());
  });

  it('is PUT groddle/v1/groups/{id}, signed in, beside show', () => {
    assert.deepEqual(r.route, { method: 'PUT', path: '/groddle/v1/groups/{id:\\d+}', access: 'SignedIn' });
  });

  it('the administrator changes the description, and the answer is show()\'s', () => {
    assert.equal(r.admin.status, 200);
    assert.equal(r.admin.row.description, WORDS);
    assert.equal(r.admin.body.description, WORDS);
    assert.equal(r.admin.body.member, true);
    assert.deepEqual(r.admin.body.people.map((p) => [p.name, p.role]), [['Zz Ada', 'admin'], ['Zz Bea', 'member'], ['Zz Di', 'member']]);
    assert.deepEqual(r.admin.body, r.admin.show, 'what a member reads after');
  });

  it('refuses everyone else, and changes nothing', () => {
    for (const k of ['member', 'outsider', 'privateMember']) {
      assert.equal(r[k].status, 403, k);
      assert.equal(r[k].code, 'groddle_group_not_admin', k);
      assert.equal(r[k].message, 'Only the group\'s administrator can change it.', k);
    }
    assert.deepEqual([r.privateOutsider.status, r.privateOutsider.code], [404, 'groddle_group_missing'], 'a private group is missing to an outsider, as show() says');
    assert.deepEqual([r.missing.status, r.missing.code], [404, 'groddle_group_missing']);
    assert.equal(r.afterRefusals.pub.description, WORDS);
    assert.equal(r.afterRefusals.priv.description, 'The first words.');
  });

  it('checks the description as Make a group does: 300 characters, bad words a grawlix, empty allowed', () => {
    assert.deepEqual([r.tooLong.status, r.tooLong.code, r.tooLong.message], [400, 'groddle_group_invalid', 'Descriptions are up to 300 characters.']);
    assert.deepEqual(r.tooLong.data, { fields: { description: 'Descriptions are up to 300 characters.' } });
    assert.equal(r.tooLongRow.description, WORDS, 'unchanged');
    assert.equal(r.atMax, 200);
    assert.equal(r.atMaxLength, 300);
    assert.equal(r.grawlix, 'Quests and #!@$ all night', 'one paragraph, the word a grawlix (WordFilter)');
    assert.deepEqual(r.empty, [200, '']);
  });

  it('refuses a body with nothing to change, or the name it has now', () => {
    assert.deepEqual([r.nothing.status, r.nothing.code], [400, 'groddle_group_unchanged']);
    assert.deepEqual([r.sameName.status, r.sameName.code], [400, 'groddle_group_unchanged']);
    assert.equal(r.callsBefore, 0, 'no rename, no call to the realtime server');
  });

  it('G1300: the administrator renames the group; the server is told who and what, signed', () => {
    assert.equal(r.renamed.status, 200);
    assert.equal(r.renamed.row.name, 'Sunday Questers', 'spaces as Make a group trims them');
    assert.equal(r.renamed.key, 'sunday questers');
    assert.equal(r.renamed.row.description, WORDS);
    assert.equal(r.renamed.body.name, 'Sunday Questers');
    assert.deepEqual(r.renamed.body, r.renamed.show, 'the answer is show()\'s, as a member reads it after');
    assert.equal(r.renamed.calls.length, 1);
    assert.match(r.renamed.calls[0].url, /\/ws\?call=group_rename$/);
    assert.deepEqual(r.renamed.calls[0].body, { group: r.renamed.body.id, name: 'Sunday Questers', by: 'Zz Ada' });
    assert.equal(r.renamed.calls[0].signed, true, 'X-Groddle-Service, as every site call to the server');
  });

  it('a change of case only is the group\'s own name, not taken', () => {
    assert.equal(r.caseOnly.status, 200);
    assert.equal(r.caseOnlyRow, 'Sunday questers');
  });

  it('a name another group has is 409 with Make a group\'s words, and nothing changes', () => {
    const TAKEN = 'There is already a group with that name. Try another.';
    assert.deepEqual([r.taken.status, r.taken.code, r.taken.message], [409, 'groddle_group_taken', TAKEN]);
    assert.deepEqual(r.taken.data, { fields: { name: TAKEN } });
    assert.equal(r.afterNameRefusals.row.description, WORDS, 'the description sent with it was not kept');
  });

  it('a name Make a group would refuse is refused with its words; a member may not rename', () => {
    const RULE = 'Group names are 3 to 32 letters, numbers, spaces, - or _, starting and ending with a letter or number.';
    assert.deepEqual(r.bad.slice(0, 5).map((b) => [b.status, b.code, b.message]), Array(5).fill([400, 'groddle_group_invalid', RULE]));
    assert.deepEqual(r.bad[0].data, { fields: { name: RULE } });
    assert.deepEqual([r.bad[5].status, r.bad[5].code], [400, 'groddle_group_invalid'], 'the word filter');
    assert.notEqual(r.bad[5].message, RULE);
    assert.deepEqual([r.memberRename.status, r.memberRename.code], [403, 'groddle_group_not_admin']);
    assert.equal(r.afterNameRefusals.row.name, 'Sunday questers', 'unchanged');
    assert.equal(r.afterNameRefusals.calls, 2, 'the two renames only');
  });

  it('keeps the name when the realtime server does not answer', () => {
    assert.deepEqual(r.offline, { status: 200, row: 'Sunday Club', tried: 1 });
  });

  it('the administrator worked out after the first leaves (group.js:826-884) may edit, nobody else', () => {
    assert.deepEqual(r.succession, { bea: 200, di: 403, ada: 403, row: 'Bea runs it now' });
  });
});
