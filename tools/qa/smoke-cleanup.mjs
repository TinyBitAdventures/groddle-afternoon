/**
 * Removing the online smoke check's throwaway players, and proving nothing is left.
 *
 * Everything here takes a `q(sql)` function (the local site's `wp db query`, or the live one's
 * over SSH) and builds its SQL from data, so the tests can run it against a fake database and
 * read every statement.
 *
 * What goes, for each throwaway: every message in their report tickets (the administrators'
 * replies too) and the tickets, every wp_groddle_* row keyed to them (any column ending in
 * user_id, a_id/b_id, from_id/to_id, owner_id, holder_id, visitor_id, dropper_id/taker_id,
 * buyer_id/seller_id, buddy_id/ignored_id, neighbor_id, claimer_id: saves, characters,
 * profiles, buddies, the ledger tables, signups, ...), their mail_sends rows (by email hash),
 * their posts and postmeta, usermeta, the users, and the sign-ups held for their addresses.
 *
 * Guards: a user is only ever removed when its id is above the run's starting MAX(ID), its
 * email matches the run's exact throwaway pattern, and it is not a protected id (1, the site's
 * administrator, and 54, the review account). cleanupStatements() refuses to build SQL for a
 * protected or non-integer id, and the users DELETE repeats the id and email guards in SQL.
 */
import { createHash } from 'node:crypto';

/** Never touched: 1 (anchorhost, the administrator) and 54 (the review account). */
export const PROTECTED_IDS = Object.freeze([1, 54]);

/** Columns that key a wp_groddle_* row to a user. */
export const ID_COLUMN_REGEXP = '(user_id|^a_id|^b_id|from_id|to_id|owner_id|holder_id|visitor_id|dropper_id|taker_id|buyer_id|seller_id|buddy_id|ignored_id|neighbor_id|claimer_id)$';

/** The domain each mode's throwaways use (local: Mailpit shows them; live: never delivered). */
export const DOMAINS = { local: 'groddle.localhost', live: 'example.com' };

/** Throwaway keys a run makes: two players and (local) a console administrator. */
export const KEYS = ['a', 'b', 'admin'];

export const emailHash = (email) => createHash('sha256').update(String(email).toLowerCase()).digest('hex');

/**
 * The address pattern for one run (stamp: digits) or, with stamp null, any run (a sweep).
 * { like, re, email(key) }.
 */
export function throwawayPattern(mode, stamp = null) {
  const domain = DOMAINS[mode];
  if (!domain) throw new Error(`unknown mode ${mode}`);
  if (stamp !== null && !/^\d{4,12}$/.test(String(stamp))) throw new Error(`bad stamp ${stamp}`);
  const d = domain.replace(/\./g, '\\.');
  const keys = KEYS.join('|');
  return {
    like: stamp === null ? `zz-smoke-%@${domain}` : `zz-smoke-${stamp}-%@${domain}`,
    re: new RegExp(stamp === null ? `^zz-smoke-\\d{4,12}-(${keys})@${d}$` : `^zz-smoke-${stamp}-(${keys})@${d}$`),
    email: (key) => {
      if (stamp === null || !KEYS.includes(key)) throw new Error(`no address for ${key} without a stamp`);
      return `zz-smoke-${stamp}-${key}@${domain}`;
    },
  };
}

const isProtected = (id) => PROTECTED_IDS.includes(id);

/**
 * Which wp_users rows are this run's throwaways. rows: [[idText, email], ...].
 * Returns { ids, emails, skipped: [{ row, why }] }.
 */
export function pickThrowaways(rows, { re, minId }) {
  if (!Number.isInteger(minId) || minId < 1) throw new Error('pickThrowaways needs the starting MAX(ID) as minId (at least 1)');
  const ids = [];
  const emails = [];
  const skipped = [];
  for (const row of rows) {
    const [idText, email] = row;
    const id = Number(idText);
    if (!Number.isInteger(id) || String(id) !== String(idText).trim()) { skipped.push({ row, why: 'not an id' }); continue; }
    if (isProtected(id)) { skipped.push({ row, why: 'protected id' }); continue; }
    if (id <= minId) { skipped.push({ row, why: `id not above ${minId}` }); continue; }
    if (!re.test(String(email))) { skipped.push({ row, why: 'email is not a throwaway' }); continue; }
    if (!ids.includes(id)) { ids.push(id); emails.push(String(email)); }
  }
  return { ids, emails, skipped };
}

function assertIds(ids) {
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 1) throw new Error(`refusing id ${id}`);
    if (isProtected(id)) throw new Error(`refusing protected id ${id}`);
  }
}

const sqlString = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

/** Parses the information_schema answer ("table<TAB>column" lines) into [table, column] pairs. */
export function parseColumns(text) {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/)).filter(([t, c]) => /^wp_groddle_[a-z0-9_]+$/.test(t) && /^[a-z0-9_]+$/.test(c));
}

export const COLUMNS_SQL = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name LIKE 'wp\\_groddle\\_%' AND column_name REGEXP '${ID_COLUMN_REGEXP}' ORDER BY table_name, column_name`;

/** The DELETEs for these throwaways, in order (ticket messages before their tickets). */
export function cleanupStatements({ ids, emails, cols, like, minId }) {
  if (!like || !/^zz-smoke-/.test(like)) throw new Error('cleanupStatements needs the throwaway LIKE pattern');
  const out = [];
  if (ids.length) {
    assertIds(ids);
    if (!Number.isInteger(minId) || minId < 1) throw new Error('cleanupStatements needs minId');
    const list = ids.join(',');
    out.push(`DELETE m FROM wp_groddle_ticket_messages m JOIN wp_groddle_tickets t ON t.id = m.ticket_id WHERE t.player_user_id IN (${list});`);
    for (const [t, c] of cols) out.push(`DELETE FROM ${t} WHERE ${c} IN (${list});`);
    if (emails.length) out.push(`DELETE FROM wp_groddle_mail_sends WHERE email_hash IN (${emails.map((e) => sqlString(emailHash(e))).join(',')});`);
    out.push(`DELETE FROM wp_postmeta WHERE post_id IN (SELECT ID FROM (SELECT ID FROM wp_posts WHERE post_author IN (${list})) p);`);
    out.push(`DELETE FROM wp_posts WHERE post_author IN (${list});`);
    out.push(`DELETE FROM wp_usermeta WHERE user_id IN (${list});`);
    out.push(`DELETE FROM wp_users WHERE ID IN (${list}) AND ID > ${minId} AND ID NOT IN (${PROTECTED_IDS.join(',')}) AND user_email LIKE ${sqlString(like)};`);
  }
  out.push(`DELETE FROM wp_groddle_signups WHERE email LIKE ${sqlString(like)};`);
  return out;
}

/** The counts that must all read zero afterwards: [[name, sql], ...]. */
export function leftoverQueries({ ids, emails, cols, like }) {
  const out = [
    ['users', `SELECT COUNT(*) FROM wp_users WHERE user_email LIKE ${sqlString(like)}`],
    ['signups', `SELECT COUNT(*) FROM wp_groddle_signups WHERE email LIKE ${sqlString(like)}`],
  ];
  if (ids.length) {
    assertIds(ids);
    const list = ids.join(',');
    for (const [t, c] of cols) out.push([`${t}.${c}`, `SELECT COUNT(*) FROM ${t} WHERE ${c} IN (${list})`]);
    out.push(['usersById', `SELECT COUNT(*) FROM wp_users WHERE ID IN (${list})`]);
    out.push(['usermeta', `SELECT COUNT(*) FROM wp_usermeta WHERE user_id IN (${list})`]);
    out.push(['posts', `SELECT COUNT(*) FROM wp_posts WHERE post_author IN (${list})`]);
    if (emails.length) out.push(['mailSends', `SELECT COUNT(*) FROM wp_groddle_mail_sends WHERE email_hash IN (${emails.map((e) => sqlString(emailHash(e))).join(',')})`]);
  }
  return out;
}

/**
 * Finds this run's throwaways, deletes everything above, then counts what is left.
 *   q          (sql) => string (tab-separated, no column names)
 *   like, re   from throwawayPattern
 *   minId      wp_users MAX(ID) before the run made anyone
 *   knownIds   ids the run saw made (still guarded; they must match by email too, unless
 *              the user row is already gone, when they are only used to find leftover rows)
 *   dryRun     count only
 * Returns { ids, emails, skipped, statements, left: { total, ...counts } }.
 */
export function runCleanup(q, { like, re, minId, knownIds = [], dryRun = false }) {
  const rows = q(`SELECT ID, user_email FROM wp_users WHERE user_email LIKE ${sqlString(like)}`).split('\n').filter(Boolean).map((l) => l.split('\t'));
  const picked = pickThrowaways(rows, { re, minId });
  const ids = [...picked.ids];
  const emails = [...picked.emails];
  const present = new Set(rows.map(([id]) => Number(id)));
  for (const id of knownIds) {
    if (Number.isInteger(id) && id > minId && !isProtected(id) && !ids.includes(id) && !present.has(id)) {
      // The user row is gone (an earlier pass) but rows keyed to it may have come in since.
      const still = q(`SELECT COUNT(*) FROM wp_users WHERE ID = ${id}`).trim();
      if (still === '0') ids.push(id);
    }
  }
  const cols = parseColumns(q(COLUMNS_SQL));
  const statements = cleanupStatements({ ids, emails, cols, like, minId });
  if (!dryRun) q(statements.join('\n'));
  const left = { total: 0 };
  const queries = leftoverQueries({ ids, emails, cols, like });
  const answer = q(queries.map(([name, sql]) => `SELECT ${sqlString(name)}, (${sql});`).join('\n')).split('\n').filter(Boolean);
  for (const line of answer) {
    const [name, n] = line.split('\t');
    const count = Number(n) || 0;
    if (count) left[name] = count;
    left.total += count;
  }
  return { ids, emails, skipped: picked.skipped, statements, left };
}
