// The online smoke check (tools/qa/online-smoke.mjs): its cleanup, which must never reach users 1
// or 54, and the --live guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { cleanupStatements, emailHash, leftoverQueries, parseColumns, pickThrowaways, PROTECTED_IDS, runCleanup, throwawayPattern } from '../tools/qa/smoke-cleanup.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const tmp = () => mkdtempSync(join(tmpdir(), 'groddle-smoke-'));

const COLS = [
  ['wp_groddle_buddies', 'buddy_id'], ['wp_groddle_buddies', 'user_id'], ['wp_groddle_mp_saves', 'user_id'],
  ['wp_groddle_signups', 'user_id'], ['wp_groddle_ticket_messages', 'author_user_id'], ['wp_groddle_tickets', 'player_user_id'],
  ['wp_groddle_trades', 'a_id'], ['wp_groddle_trades', 'b_id'],
];

/** Every integer that appears in an IN (...) list or an = comparison of a statement. */
function idsIn(sql) {
  const found = [];
  for (const m of sql.matchAll(/IN \(([0-9, ]+)\)/g)) found.push(...m[1].split(',').map((s) => Number(s.trim())));
  for (const m of sql.matchAll(/(?:ID|user_id|_id) = (\d+)/g)) found.push(Number(m[1]));
  return found;
}

test('cleanup: the address patterns are exact to a run', () => {
  const p = throwawayPattern('local', '123456');
  assert.equal(p.email('a'), 'zz-smoke-123456-a@groddle.localhost');
  assert.equal(p.like, 'zz-smoke-123456-%@groddle.localhost');
  assert.ok(p.re.test('zz-smoke-123456-admin@groddle.localhost'));
  for (const e of ['zz-smoke-123457-a@groddle.localhost', 'zz-smoke-123456-a@example.com', 'admin@groddle-minn.localhost', 'review@groddle.localhost', 'zz-smoke-123456-a@groddle.localhost.evil', 'x-zz-smoke-123456-a@groddle.localhost']) assert.equal(p.re.test(e), false, e);
  const live = throwawayPattern('live', '123456');
  assert.equal(live.email('b'), 'zz-smoke-123456-b@example.com');
  assert.equal(live.re.test('zz-smoke-123456-b@groddle.localhost'), false);
  const any = throwawayPattern('live', null);
  assert.ok(any.re.test('zz-smoke-999999-a@example.com'));
  assert.equal(any.re.test('zz-prod-a-1@example.com'), false);
  assert.throws(() => throwawayPattern('live', "1' OR 1=1"), /bad stamp/);
  assert.throws(() => throwawayPattern('prod', '123456'), /unknown mode/);
});

test('cleanup: pickThrowaways never picks 1, 54, old ids or other addresses', () => {
  const p = throwawayPattern('local', '123456');
  const rows = [
    ['1', 'zz-smoke-123456-a@groddle.localhost'],
    ['54', 'zz-smoke-123456-b@groddle.localhost'],
    ['40', 'zz-smoke-123456-a@groddle.localhost'],
    ['60', 'review@groddle.localhost'],
    ['61', 'zz-smoke-123456-a@groddle.localhost'],
    ['62', 'zz-smoke-123456-b@groddle.localhost'],
    ['62', 'zz-smoke-123456-b@groddle.localhost'],
    ['63x', 'zz-smoke-123456-admin@groddle.localhost'],
  ];
  const r = pickThrowaways(rows, { re: p.re, minId: 54 });
  assert.deepEqual(r.ids, [61, 62]);
  assert.deepEqual(r.emails, ['zz-smoke-123456-a@groddle.localhost', 'zz-smoke-123456-b@groddle.localhost']);
  assert.equal(r.skipped.length, 5);
  // A sweep (minId 1) still never picks 1 or 54.
  const sweep = pickThrowaways([['1', 'zz-smoke-1234-a@groddle.localhost'], ['54', 'zz-smoke-1234-a@groddle.localhost'], ['70', 'zz-smoke-1234-a@groddle.localhost']], { re: throwawayPattern('local', null).re, minId: 1 });
  assert.deepEqual(sweep.ids, [70]);
  assert.throws(() => pickThrowaways(rows, { re: p.re }), /minId/);
});

test('cleanup: the statements never name users 1 or 54 and guard the users DELETE in SQL', () => {
  const p = throwawayPattern('local', '123456');
  const sql = cleanupStatements({ ids: [61, 62], emails: [p.email('a'), p.email('b')], cols: COLS, like: p.like, minId: 54 });
  const unguarded = (s) => s.replace(' AND ID > 54 AND ID NOT IN (1,54)', '');
  for (const s of sql) for (const id of idsIn(unguarded(s))) assert.ok(id === 61 || id === 62, `${s} names ${id}`);
  // Ticket messages go before their tickets; every keyed table is covered; the users DELETE carries its guards.
  assert.match(sql[0], /^DELETE m FROM wp_groddle_ticket_messages m JOIN wp_groddle_tickets/);
  for (const [t, c] of COLS) assert.ok(sql.includes(`DELETE FROM ${t} WHERE ${c} IN (61,62);`), `${t}.${c}`);
  const users = sql.find((s) => s.startsWith('DELETE FROM wp_users'));
  assert.equal(users, "DELETE FROM wp_users WHERE ID IN (61,62) AND ID > 54 AND ID NOT IN (1,54) AND user_email LIKE 'zz-smoke-123456-%@groddle.localhost';");
  assert.ok(sql.includes(`DELETE FROM wp_groddle_mail_sends WHERE email_hash IN ('${emailHash(p.email('a'))}','${emailHash(p.email('b'))}');`));
  assert.ok(sql.some((s) => s.startsWith('DELETE FROM wp_usermeta WHERE user_id IN (61,62)')));
  assert.equal(sql[sql.length - 1], "DELETE FROM wp_groddle_signups WHERE email LIKE 'zz-smoke-123456-%@groddle.localhost';");
  // Nothing unscoped.
  for (const s of sql) assert.match(s, / WHERE /, s);
});

test('cleanup: refuses to build SQL for protected or odd ids', () => {
  const p = throwawayPattern('local', '123456');
  for (const ids of [[1], [54], [61, 54], [0], [-3], [61.5], [NaN]]) {
    assert.throws(() => cleanupStatements({ ids, emails: [], cols: COLS, like: p.like, minId: 54 }), /refusing/, String(ids));
    assert.throws(() => leftoverQueries({ ids, emails: [], cols: COLS, like: p.like }), /refusing/, String(ids));
  }
  assert.throws(() => cleanupStatements({ ids: [61], emails: [], cols: COLS, like: '%', minId: 54 }), /LIKE/);
  // With nobody found it only clears this run's held sign-ups.
  assert.deepEqual(cleanupStatements({ ids: [], emails: [], cols: COLS, like: p.like, minId: 54 }), ["DELETE FROM wp_groddle_signups WHERE email LIKE 'zz-smoke-123456-%@groddle.localhost';"]);
});

test('cleanup: parseColumns keeps only wp_groddle_* tables and plain names', () => {
  assert.deepEqual(parseColumns('wp_groddle_buddies\tbuddy_id\nwp_users\tID\nwp_groddle_x; DROP\tuser_id\n\nwp_groddle_trades\ta_id\n'), [['wp_groddle_buddies', 'buddy_id'], ['wp_groddle_trades', 'a_id']]);
});

test('cleanup: runCleanup against a fake database removes the run and reads zero, users 1 and 54 untouched', () => {
  const p = throwawayPattern('local', '123456');
  const db = {
    users: [[1, 'admin@groddle-minn.localhost'], [54, 'review@groddle.localhost'], [61, p.email('a')], [62, p.email('b')], [63, p.email('admin')], [64, 'zz-smoke-999999-a@groddle.localhost']],
    rows: { 'wp_groddle_mp_saves.user_id': [1, 54, 61, 62, 63], 'wp_groddle_trades.a_id': [61, 54], 'wp_groddle_trades.b_id': [62] },
  };
  const seen = [];
  const q = (sql) => {
    seen.push(sql);
    if (sql.startsWith('SELECT ID, user_email FROM wp_users')) {
      const like = /LIKE '([^']+)'/.exec(sql)[1].replace(/%/g, '.*');
      return db.users.filter(([, e]) => new RegExp(`^${like}$`).test(e)).map(([i, e]) => `${i}\t${e}`).join('\n');
    }
    if (sql.startsWith('SELECT table_name')) return 'wp_groddle_mp_saves\tuser_id\nwp_groddle_trades\ta_id\nwp_groddle_trades\tb_id';
    if (sql.startsWith('DELETE')) {
      for (const s of sql.split('\n')) {
        const m = /^DELETE FROM (wp_groddle_\w+) WHERE (\w+) IN \(([0-9,]+)\);$/.exec(s);
        if (m) { const ids = m[3].split(',').map(Number); db.rows[`${m[1]}.${m[2]}`] = (db.rows[`${m[1]}.${m[2]}`] || []).filter((x) => !ids.includes(x)); }
        const u = /^DELETE FROM wp_users WHERE ID IN \(([0-9,]+)\)/.exec(s);
        if (u) { const ids = u[1].split(',').map(Number); db.users = db.users.filter(([i]) => !ids.includes(i)); }
      }
      return '';
    }
    if (sql.startsWith('SELECT COUNT(*) FROM wp_users WHERE ID = ')) return String(db.users.filter(([i]) => i === Number(sql.split('= ')[1])).length);
    // The leftover counts: answer from the fake tables.
    return sql.split('\n').map((line) => {
      const name = /^SELECT '([^']+)'/.exec(line)[1];
      if (name === 'users') return `${name}\t${db.users.filter(([, e]) => p.re.test(e)).length}`;
      const ids = (/IN \(([0-9,]+)\)/.exec(line)?.[1] || '').split(',').map(Number);
      return `${name}\t${(db.rows[name] || []).filter((x) => ids.includes(x)).length}`;
    }).join('\n');
  };
  const r = runCleanup(q, { like: p.like, re: p.re, minId: 54, knownIds: [61, 62, 63, 1, 54] });
  assert.deepEqual(r.ids, [61, 62, 63]);
  assert.equal(r.left.total, 0);
  assert.deepEqual(db.users.map(([i]) => i), [1, 54, 64]);
  assert.deepEqual(db.rows['wp_groddle_mp_saves.user_id'], [1, 54]);
  assert.deepEqual(db.rows['wp_groddle_trades.a_id'], [54]);
  for (const sql of seen.filter((s) => s.startsWith('DELETE'))) for (const id of idsIn(sql.replaceAll(' AND ID > 54 AND ID NOT IN (1,54)', ''))) assert.ok([61, 62, 63].includes(id), `${sql} names ${id}`);
  // A second pass after the users are gone still finds rows that came in late for the known ids.
  db.rows['wp_groddle_mp_saves.user_id'].push(61);
  const r2 = runCleanup(q, { like: p.like, re: p.re, minId: 54, knownIds: [61, 62, 63] });
  assert.deepEqual(r2.ids, [61, 62, 63]);
  assert.deepEqual(db.rows['wp_groddle_mp_saves.user_id'], [1, 54]);
  assert.equal(r2.left.total, 0);
});

test('online-smoke: --live without --yes only prints its plan', () => {
  const home = tmp();
  try {
    // No deploy.env: it stops before anything.
    const bare = spawnSync(process.execPath, [join(ROOT, 'tools/qa/online-smoke.mjs'), '--live'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.notEqual(bare.status, 0);
    assert.doesNotMatch(bare.stdout, /CHECK|cleanup pass/);
    // A deploy.env naming a host that does not exist: the plan, exit 2, and no SSH (it would hang or fail).
    mkdirSync(join(home, '.config', 'groddle'), { recursive: true });
    writeFileSync(join(home, '.config', 'groddle', 'deploy.env'), 'GRODDLE_KINSTA_SSH=nobody@host.invalid\nGRODDLE_KINSTA_PORT=1\n');
    const plan = spawnSync(process.execPath, [join(ROOT, 'tools/qa/online-smoke.mjs'), '--live'], { encoding: 'utf8', env: { ...process.env, HOME: home }, timeout: 20000 });
    assert.equal(plan.status, 2);
    assert.match(plan.stdout, /"site": "https:\/\/groddleafternoon\.com"/);
    assert.match(plan.stdout, /zz-smoke-\d{6}-a@example\.com/);
    assert.match(plan.stdout, /never users 1 or 54/);
    assert.match(plan.stdout, /--live --yes/);
    assert.doesNotMatch(plan.stdout, /CHECK|cleanup pass/);
    const none = spawnSync(process.execPath, [join(ROOT, 'tools/qa/online-smoke.mjs')], { encoding: 'utf8' });
    assert.equal(none.status, 2);
    assert.match(none.stderr, /usage/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
