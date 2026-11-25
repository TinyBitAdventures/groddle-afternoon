/**
 * #698: a group's administrator changes its description (GameServerJS
 * groups/group.js:494-499 admin_edit, which the website's group pages
 * called; level 1, Administrator, held every permission, group.js:46-50,
 * 310). The site's route (groddle-afternoon-site src/Groups.php edit, PUT
 * groddle/v1/groups/{id}) is run on a throwaway MariaDB database by
 * tests/fixtures/groups/group-edit.php; the game's Edit button and form are
 * in tests/groups.test.js. Renaming (admin_edit's name) waits on a ruling:
 * a name sent is not read.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { GAME_DIR, HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

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
const hasPhp = spawnSync('php', ['-v']).status === 0;
// A PHP that has mysqli as a module only (Arch's) gets it loaded.
const phpArgs = hasPhp && spawnSync('php', ['-r', 'exit(class_exists("mysqli") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=mysqli'] : [];
const db = mysql();
const reachable = db && hasPhp && spawnSync('php', [...phpArgs, '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!HAS_SITE && 'no site repo')
  || (!hasPhp && 'no php')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

const WORDS = 'Come work on quests that you need multiple people around for!';

describe('#698: editing a group on a throwaway database (Groups::edit)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync('php', [...phpArgs, join(GAME_DIR, 'tests/fixtures/groups/group-edit.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 60000 }).toString());
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

  it('does not read a name (renaming waits on a ruling)', () => {
    assert.equal(r.nameIgnored.status, 200);
    assert.equal(r.nameIgnored.name, 'Sunday Club');
    assert.equal(r.nameIgnored.row.name, 'Sunday Club');
    assert.deepEqual([r.onlyName.status, r.onlyName.code], [400, 'groddle_group_unchanged']);
    assert.deepEqual([r.nothing.status, r.nothing.code], [400, 'groddle_group_unchanged']);
  });

  it('the administrator worked out after the first leaves (group.js:826-884) may edit, nobody else', () => {
    assert.deepEqual(r.succession, { bea: 200, di: 403, ada: 403, row: 'Bea runs it now' });
  });
});
