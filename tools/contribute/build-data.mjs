#!/usr/bin/env node
/**
 * Writes public/contribute/data.json for the Contribute page (/contribute/,
 * drawn by groddle-afternoon-site/src/Contribute.php): the open ledger and the
 * Giant's shrine on the page's little street.
 *
 * The ledger is tools/contribute/ledger.json, kept by hand: the day it starts,
 * the recurring costs (each an amount charged every month or every year) and
 * the money that came in (one entry per gift, added when it arrives). Nothing
 * here adds the costs up: the site works out what has been charged when the
 * page is drawn, from today's date (ledgerTotals below is the same arithmetic,
 * which the tests hold the PHP to), so the page stays current without a build.
 * A monthly cost is charged on the start date's day of each month (the 1st), a
 * yearly one on the start date and each anniversary; a day past a short month's
 * end is its last day.
 *
 * The shrine is Pot's (Tiny Speck's own shrine art and the Giant's words from
 * the game, public/js/shrines.js GIANTS, CC0).
 *
 *   node tools/contribute/build-data.mjs          write data.json
 *   node tools/contribute/build-data.mjs --check  exit 1 if data.json is stale
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIANTS } from '../../public/js/shrines.js?v=164b1234';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = join(root, 'public');
const SOURCE = join(root, 'tools', 'contribute', 'ledger.json');
const out = join(pub, 'contribute', 'data.json');

/** The Giant whose shrine takes the donations: Pot, the giant of prosperity. */
export const SHRINE_GIANT = 'pot';
export const EVERY = ['month', 'year'];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date as written in the ledger (YYYY-MM-DD), or null. */
export function parseDate(s) {
  const m = ISO.exec(String(s));
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
}

/** Dollars as written (at most two decimals, more than zero) to whole cents. */
export function toCents(amount, what) {
  const n = Number(amount);
  if (typeof amount !== 'number' || !Number.isFinite(n) || n <= 0 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    throw new Error(`${what}: the amount must be dollars above zero with at most two decimals, not ${JSON.stringify(amount)}`);
  }
  return Math.round(n * 100);
}

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const before = (a, b) => a.y !== b.y ? a.y < b.y : a.m !== b.m ? a.m < b.m : a.d < b.d;

/** How many times a cost charged every `every` from `start` has been charged by `today` (both {y, m, d}). */
export function charges(start, every, today) {
  if (before(today, start)) return 0;
  if (every === 'month') {
    const months = (today.y - start.y) * 12 + (today.m - start.m);
    return months + (today.d >= Math.min(start.d, daysIn(today.y, today.m)) ? 1 : 0);
  }
  const years = today.y - start.y;
  const day = Math.min(start.d, daysIn(today.y, start.m));
  return years + (today.m > start.m || (today.m === start.m && today.d >= day) ? 1 : 0);
}

/**
 * The ledger's totals on a day (YYYY-MM-DD), from data.json: what each cost has
 * come to, all money out and in (in cents), the difference, and the months
 * counted. The site's Contribute::totals does the same per request.
 */
export function ledgerTotals(d, iso) {
  const start = parseDate(d.start);
  const today = parseDate(iso);
  if (!start || !today) throw new Error(`not a date: ${!start ? d.start : iso}`);
  const costs = d.costs.map((c) => {
    const times = charges(start, c.every, today);
    return { id: c.id, times, cents: times * c.cents };
  });
  const out = costs.reduce((n, c) => n + c.cents, 0);
  const gifts = d.in.filter((e) => !before(today, parseDate(e.date)));
  const inCents = gifts.reduce((n, e) => n + e.cents, 0);
  return { months: charges(start, 'month', today), costs, out, in: inCents, gifts: gifts.length, difference: inCents - out };
}

/** The ledger from ledger.json, checked, in cents; with the shrine. */
export function contributeData(source = JSON.parse(readFileSync(SOURCE, 'utf8'))) {
  const start = parseDate(source.start);
  if (!start) throw new Error(`ledger.json start: ${JSON.stringify(source.start)} is not a YYYY-MM-DD date`);
  if (source.currency !== 'USD') throw new Error('ledger.json currency: only USD is drawn');
  if (!/^https:\/\/github\.com\/sponsors\/[A-Za-z0-9-]+$/.test(String(source.sponsors))) throw new Error('ledger.json sponsors: a GitHub Sponsors address');
  const ids = new Set();
  const costs = (source.costs || []).map((c, i) => {
    const what = `ledger.json costs[${i}]`;
    if (!/^[a-z][a-z0-9-]*$/.test(String(c.id)) || ids.has(c.id)) throw new Error(`${what}: a new lowercase id`);
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim()) throw new Error(`${what}: a name`);
    if (!EVERY.includes(c.every)) throw new Error(`${what}: every is month or year`);
    return { id: c.id, name: c.name.trim(), every: c.every, cents: toCents(c.amount, what) };
  });
  if (!costs.length) throw new Error('ledger.json costs: at least one');
  const gifts = (source.in || []).map((e, i) => {
    const what = `ledger.json in[${i}]`;
    const date = parseDate(e.date);
    if (!date || before(date, start)) throw new Error(`${what}: a YYYY-MM-DD date on or after ${source.start}`);
    if (typeof e.source !== 'string' || !e.source.trim()) throw new Error(`${what}: a source (GitHub Sponsors, say)`);
    return { date: e.date, source: e.source.trim(), cents: toCents(e.amount, what) };
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const giant = GIANTS[SHRINE_GIANT];
  const art = {
    sheet: `/assets/sprites/shrines/${SHRINE_GIANT}_open.webp`,
    sheet3x: `/assets/sprites/shrines/${SHRINE_GIANT}_open@3x.webp`,
  };
  for (const path of Object.values(art)) if (!existsSync(join(pub, path))) throw new Error(`no shrine art at public${path}`);
  return {
    start: source.start,
    currency: source.currency,
    sponsors: source.sponsors,
    costs,
    in: gifts,
    shrine: { giant: giant.id, name: giant.name, description: giant.description, ...art },
  };
}

function main() {
  const body = JSON.stringify(contributeData(), null, 1) + '\n';
  const now = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (now !== body) {
      console.log('public/contribute/data.json is stale (node tools/contribute/build-data.mjs)');
      process.exit(1);
    }
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  const d = JSON.parse(body);
  const today = new Date().toISOString().slice(0, 10);
  const t = ledgerTotals(d, today);
  console.log(`${d.costs.length} costs, ${d.in.length} gifts; on ${today}: $${t.out / 100} out, $${t.in / 100} in over ${t.months} months`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
