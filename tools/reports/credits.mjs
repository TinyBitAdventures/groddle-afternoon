#!/usr/bin/env node
/**
 * Report credits: points for the players whose bug reports led to a change,
 * for the Contribute page's testers board (Austin 2026-11-03: "maybe an AI
 * agent could go through each bug record and give it a contribution scoring
 * after it's closed"). The site keeps one score per ticket
 * (groddle-afternoon-site src/ReportCredits.php, the console's Credit box);
 * this tool is the agent's side, in three steps, and never writes to a site
 * without being told to:
 *
 *   read   GETs the site's tickets (admin/tickets, then each closed or answered
 *          thread) and its scores (admin/credits, when the site has them) and
 *          writes <out>/tickets.json and a draft <out>/proposals.json: every
 *          closed or answered report nobody has scored yet, with the commits in
 *          the three repos that cite its number as candidates. A report with
 *          news nobody has read is left out, since opening it in the console
 *          marks it read.
 *   check  validates a proposals file (kinds, the points arithmetic, reasons,
 *          refs) and prints the board as it would stand; --md=<file> writes the
 *          table Austin reviews (proposalsMarkdown).
 *   apply  PUTs each proposal to admin/tickets/<id>/credit with "by": "agent".
 *          A dry run unless --yes; a site that is not *.localhost also needs
 *          --live (only with Austin's OK). A proposal whose ticket on that site
 *          has another subject or player is skipped, so a local copy with other
 *          tickets is never scored by mistake.
 *
 *   node tools/reports/credits.mjs read  --site=https://groddleafternoon.com --jar=<cookies.txt> --nonce-file=<nonce.txt> --out=<dir>
 *   node tools/reports/credits.mjs check --proposals=<dir>/proposals.json [--md=<dir>/proposals.md]
 *   node tools/reports/credits.mjs apply --site=https://groddle.localhost --jar=... --nonce-file=... --proposals=... [--yes] [--live]
 *
 * Signing in: a Netscape cookie jar (curl -c) and a REST nonce file (from
 * /wp-admin/admin-ajax.php?action=rest-nonce), or MINN_USER and MINN_PASS in
 * the environment (tools/changelog/to-minn.mjs's Minn helper).
 *
 * The rubric (the site's ReportCredits::KINDS): safety_fix 5 (a fix that keeps
 * saves, accounts or security safe), bug_fixed 3, improvement_shipped 2,
 * partial_or_clue 1, none 0 (working as Glitch intended, the same player's repeat,
 * withdrawn, nothing changed; the reason says so kindly). A report with several
 * changes scores its best one plus 1 for each other (extras), at most 8.
 * The proposals file:
 *   {"version":1,"source":url,"read_at":iso,"rubric":{…},
 *    "proposals":[{"ticket","player":{id,name},"status","subject","kind","points","items":[…],"reason","refs":[…]}],
 *    "skipped":[{"ticket","player","why"}],"notes":[…]}   items: each change the report led to, so
 *   extras = items - 1; createdAt: when the report was sent (the board's tie-break); notes: judgement
 *   calls for Austin to look at, shown in the .md
 * See tools/reports/README.md for where this sits in a release.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GAME_DIR, SERVER_DIR, SITE_DIR, HAS_SERVER, HAS_SITE } from '../repos.mjs';

/** Each kind of change and its points (src/ReportCredits.php KINDS). */
export const KINDS = Object.freeze({ safety_fix: 5, bug_fixed: 3, improvement_shipped: 2, partial_or_clue: 1, none: 0 });
/** The most one report earns (ReportCredits::CAP). */
export const CAP = 8;
export const REASON_MAX = 200;
export const REFS_MAX = 12;
export const REF_MAX = 64;
/** Never on the board (ReportCredits::EXCLUDED): Austin's accounts. */
export const EXCLUDED = Object.freeze([1, 54]);
/** Scored statuses (ReportCredits::SCORABLE). */
export const SCORABLE = Object.freeze(['closed', 'answered']);
export const RUBRIC = Object.freeze({ ...KINDS, extra_item: 1, cap: CAP });

/** A report's points: its kind's, plus 1 for each other change in it, at most CAP. */
export function pointsFor(kind, extras = 0) {
  if (!(kind in KINDS)) throw new Error(`not a kind: ${kind}`);
  if (kind === 'none') return 0;
  return Math.min(CAP, KINDS[kind] + Math.max(0, Math.trunc(extras)));
}

/** What is wrong with one proposal (an empty list when nothing). */
export function proposalProblems(p) {
  const out = [];
  if (!Number.isInteger(p?.ticket) || p.ticket <= 0) out.push('ticket is not an id');
  if (!(p?.kind in KINDS)) out.push(`kind "${p?.kind}" is not one of ${Object.keys(KINDS).join(', ')}`);
  if (!Number.isInteger(p?.points) || p.points < 0 || p.points > CAP) out.push(`points ${p?.points} is not 0 to ${CAP}`);
  else if (p.kind in KINDS) {
    if ((p.points === 0) !== (p.kind === 'none')) out.push(p.kind === 'none' ? 'kind none has no points' : 'a change has at least 1 point');
    else if (p.kind !== 'none' && p.points < KINDS[p.kind]) out.push(`points ${p.points} is under ${p.kind}'s ${KINDS[p.kind]}`);
    else if (Array.isArray(p.items) && p.kind !== 'none' && p.points !== pointsFor(p.kind, p.items.length - 1)) out.push(`points ${p.points} is not ${p.kind} + ${p.items.length - 1} extra (${pointsFor(p.kind, p.items.length - 1)})`);
  }
  const reason = typeof p?.reason === 'string' ? p.reason.trim() : '';
  if (!reason) out.push('no reason');
  if ([...reason].length > REASON_MAX) out.push(`reason is over ${REASON_MAX} characters`);
  if (/—/.test(reason)) out.push('reason has an em-dash');
  if (/@|\b\d{1,3}(\.\d{1,3}){3}\b/.test(reason)) out.push('reason looks like it has an email or an IP');
  if (!Array.isArray(p?.refs)) out.push('refs is not a list');
  else {
    if (p.refs.length > REFS_MAX) out.push(`more than ${REFS_MAX} refs`);
    for (const r of p.refs) if (typeof r !== 'string' || !r.trim() || r.length > REF_MAX) out.push(`ref ${JSON.stringify(r)} is not a short text`);
    if (p.kind !== 'none' && p.refs.length === 0) out.push('a change with no refs');
  }
  if (EXCLUDED.includes(p?.player?.id)) out.push(`player ${p.player.id} is never scored`);
  return out;
}

/** Each player's totals from proposals (as the site's ReportCredits::totals): points, reports with points, the first such report's createdAt. */
export function totalsFrom(proposals, createdAt = {}) {
  const by = new Map();
  for (const p of proposals) {
    const id = p.player?.id;
    if (!Number.isInteger(id)) continue;
    const t = by.get(id) || { id, name: p.player.name || `#${id}`, points: 0, reports: 0, first: null };
    t.points += p.points;
    if (p.points > 0) {
      t.reports += 1;
      const at = createdAt[p.ticket] ?? p.createdAt ?? null;
      if (at && (!t.first || at < t.first)) t.first = at;
    }
    by.set(id, t);
  }
  return [...by.values()];
}

/** The board (ReportCredits::rank): points, then reports, then the earliest first report, then the lower id; no banned, excluded or pointless players. */
export function rank(totals, limit = 10) {
  return totals
    .filter((t) => t.points > 0 && !t.banned && !EXCLUDED.includes(t.id))
    .sort((a, b) => b.points - a.points || b.reports - a.reports || String(a.first ?? '9999').localeCompare(String(b.first ?? '9999')) || a.id - b.id)
    .slice(0, limit);
}

/** Ticket numbers a commit message cites: "ticket 37", "tickets 51-57", "tickets 12 and 13", "#21". */
export function citedTickets(message) {
  const out = new Set();
  for (const m of String(message).matchAll(/\btickets?\s+((?:#?\d+(?:\s*(?:-|to|,|and|&)\s*#?\d+)*))/gi)) {
    for (const part of m[1].split(/\s*(?:,|and|&)\s*/i)) {
      const range = /^#?(\d+)\s*(?:-|to)\s*#?(\d+)$/i.exec(part.trim());
      if (range) { for (let n = Number(range[1]); n <= Math.min(Number(range[2]), Number(range[1]) + 50); n++) out.add(n); continue; }
      const one = /^#?(\d+)$/.exec(part.trim());
      if (one) out.add(Number(one[1]));
    }
  }
  for (const m of String(message).matchAll(/(?:^|[\s(,])#(\d{1,4})\b/g)) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

/** Commits on main in each repo that cite a ticket: {ticket: ["game abc1234 subject", ...]}. */
export function candidates(repos = defaultRepos()) {
  const out = {};
  for (const [name, dir] of repos) {
    let log = '';
    try { log = execFileSync('git', ['-C', dir, 'log', 'main', '--format=%x1e%h%x1f%s%x1f%b'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); } catch { continue; }
    for (const entry of log.split('\x1e').slice(1)) {
      const [sha, subject, body] = entry.split('\x1f');
      for (const n of citedTickets(`${subject}\n${body}`)) (out[n] ||= []).push(`${name} ${sha} ${subject.trim()}`);
    }
  }
  return out;
}

function defaultRepos() {
  return [['game', GAME_DIR], ...(HAS_SITE ? [['site', SITE_DIR]] : []), ...(HAS_SERVER ? [['server', SERVER_DIR]] : [])];
}

/** The cookies in a Netscape jar (curl -c) that a host is sent, as a Cookie header. */
export function cookieHeader(jar, host) {
  const pairs = [];
  for (const raw of String(jar).split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length);
    else if (line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length < 7) continue;
    const domain = f[0].replace(/^\./, '').toLowerCase();
    if (host === domain || host.endsWith(`.${domain}`)) pairs.push(`${f[5]}=${f[6]}`);
  }
  return pairs.join('; ');
}

/** Whether a site may be written to without --live: only a *.localhost one. */
export function isLocal(site) {
  try { const h = new URL(site).hostname; return h === 'localhost' || h.endsWith('.localhost'); } catch { return false; }
}

// —— The site ——

async function client(args) {
  const site = String(args.site || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(site)) throw new Error('--site=https://… is needed');
  if (args.jar) {
    const cookie = cookieHeader(readFileSync(resolve(args.jar), 'utf8'), new URL(site).hostname);
    const nonce = args['nonce-file'] ? readFileSync(resolve(args['nonce-file']), 'utf8').trim() : '';
    if (!cookie || !/^[0-9a-f]{10}$/.test(nonce)) throw new Error('the jar has no cookies for that site, or the nonce file holds no nonce');
    return {
      site,
      async rest(method, route, body) {
        const res = await fetch(`${site}/wp-json${route}`, { method, headers: { cookie, 'x-wp-nonce': nonce, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        if (!res.ok) throw Object.assign(new Error(`${method} ${route}: ${res.status} ${typeof data === 'string' ? data.slice(0, 160) : data?.message || ''}`), { status: res.status });
        return data;
      },
    };
  }
  const { Minn } = await import('../changelog/to-minn.mjs');
  const minn = new Minn(site);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  return { site, rest: (m, r, b) => minn.rest(m, r, b).catch((e) => { throw Object.assign(e, { status: Number(/: (\d{3}) /.exec(e.message)?.[1]) || 0 }); }) };
}

async function read(args) {
  const out = resolve(args.out || '.');
  const api = await client(args);
  const list = await api.rest('GET', '/groddle/v1/admin/tickets?status=all');
  if (list.more) console.warn('the site has more tickets than one list holds; only the first page was read');
  let scored = new Set();
  try {
    scored = new Set(((await api.rest('GET', '/groddle/v1/admin/credits')).credits || []).map((c) => c.ticket));
  } catch (e) {
    if (e.status !== 404) throw e;
    console.warn('the site has no report credits yet (admin/credits 404): every closed or answered report counts as unscored');
  }
  const threads = [];
  const skipped = [];
  for (const t of list.tickets) {
    if (!SCORABLE.includes(t.status)) continue;
    if (EXCLUDED.includes(t.player?.id)) { skipped.push({ ticket: t.id, player: t.player, why: 'one of Austin\'s own accounts' }); continue; }
    if (t.unread) { skipped.push({ ticket: t.id, player: t.player, why: 'has news nobody has read; read it in the console first' }); continue; }
    if (scored.has(t.id)) continue;
    const r = await api.rest('GET', `/groddle/v1/admin/tickets/${t.id}`);
    threads.push({ ticket: r.ticket, messages: r.messages.map((m) => ({ author: m.author, at: m.at, body: m.body })), context: { street: r.context?.streetName || '', build: r.context?.build || '' } });
  }
  const cites = candidates();
  const proposals = threads.map(({ ticket: t }) => ({
    ticket: t.id, player: t.player, status: t.status, subject: t.subject, createdAt: t.createdAt,
    kind: null, points: null, items: [], reason: '', refs: [], candidates: cites[t.id] || [],
  }));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'tickets.json'), `${JSON.stringify({ source: api.site, read_at: new Date().toISOString(), threads }, null, 1)}\n`);
  writeFileSync(join(out, 'proposals.json'), `${JSON.stringify({ version: 1, source: api.site, read_at: new Date().toISOString(), rubric: RUBRIC, proposals, skipped }, null, 1)}\n`);
  console.log(`${threads.length} reports to score, ${skipped.length} skipped, ${scored.size} scored already: ${join(out, 'proposals.json')}`);
}

function load(file) {
  const doc = JSON.parse(readFileSync(resolve(file), 'utf8'));
  if (doc?.version !== 1 || !Array.isArray(doc.proposals)) throw new Error(`${file} is not a proposals file (version 1)`);
  return doc;
}

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The proposals as a table for review: each report, then the board as it would stand, then the notes. */
export function proposalsMarkdown(doc) {
  const rows = [...doc.proposals].sort((a, b) => a.ticket - b.ticket);
  const lines = [`# Report credits: proposals`, '', `From ${doc.source || 'a site'}, read ${doc.read_at || ''}. Nothing is saved until \`credits.mjs apply\` runs with Austin's OK.`, '',
    '| Ticket | Player | Points | Kind | Reason | Refs |', '|---|---|---|---|---|---|',
    ...rows.map((p) => `| ${p.ticket} | ${cell(p.player?.name)} | ${p.points} | ${p.kind} | ${cell(p.reason)} | ${cell((p.refs || []).join(', '))} |`)];
  const board = rank(totalsFrom(doc.proposals), Infinity);
  lines.push('', '## The board as it would stand', '', '| Rank | Player | Points | Reports that led to a change | First such report |', '|---|---|---|---|---|',
    ...board.map((t, i) => `| ${i + 1} | ${cell(t.name)} (${t.id}) | ${t.points} | ${t.reports} | ${t.first ?? ''} |`));
  const kinds = Object.keys(KINDS).map((k) => `${k} ${doc.proposals.filter((p) => p.kind === k).length}`).join(', ');
  lines.push('', `Kinds: ${kinds}.`);
  if (doc.skipped?.length) lines.push('', '## Skipped', '', ...doc.skipped.map((s) => `- ${s.ticket} (${cell(s.player?.name)}): ${cell(s.why)}`));
  if (doc.notes?.length) lines.push('', '## Judgement calls', '', ...doc.notes.map((n) => `- ${cell(n)}`));
  return `${lines.join('\n')}\n`;
}

function check(args) {
  const doc = load(args.proposals);
  let bad = 0;
  const seen = new Set();
  for (const p of doc.proposals) {
    const problems = proposalProblems(p);
    if (seen.has(p.ticket)) problems.push('scored twice');
    seen.add(p.ticket);
    if (problems.length) { bad++; console.log(`#${p.ticket}: ${problems.join('; ')}`); }
  }
  const board = rank(totalsFrom(doc.proposals));
  const kinds = Object.fromEntries(Object.keys(KINDS).map((k) => [k, doc.proposals.filter((p) => p.kind === k).length]));
  console.log(`${doc.proposals.length} proposals, ${bad} with problems; ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  board.forEach((t, i) => console.log(`${i + 1}. ${t.name} (${t.id}): ${t.points} points, ${t.reports} reports, first ${t.first}`));
  if (args.md) { writeFileSync(resolve(args.md), proposalsMarkdown(doc)); console.log(`wrote ${resolve(args.md)}`); }
  if (bad) process.exitCode = 1;
}

async function apply(args) {
  const doc = load(args.proposals);
  const site = String(args.site || '');
  if (!isLocal(site) && !args.live) throw new Error(`${site} is not a *.localhost site: add --live, and only with Austin's OK`);
  const bad = doc.proposals.filter((p) => proposalProblems(p).length);
  if (bad.length) throw new Error(`fix these first (check): ${bad.map((p) => `#${p.ticket}`).join(', ')}`);
  const api = await client(args);
  let done = 0;
  for (const p of doc.proposals) {
    let there;
    try { there = await api.rest('GET', `/groddle/v1/admin/tickets/${p.ticket}/credit`); } catch (e) {
      if (e.status === 404) { console.log(`#${p.ticket}: not on ${api.site}, skipped`); continue; }
      throw e;
    }
    if (there.ticket.subject !== p.subject || there.ticket.player.id !== p.player.id) {
      console.log(`#${p.ticket}: on ${api.site} it is another report ("${there.ticket.subject}" from ${there.ticket.player.name}), skipped`);
      continue;
    }
    const body = { kind: p.kind, points: p.points, reason: p.reason, refs: p.refs, by: 'agent' };
    if (!args.yes) { console.log(`#${p.ticket}: would PUT ${JSON.stringify(body)}`); continue; }
    await api.rest('PUT', `/groddle/v1/admin/tickets/${p.ticket}/credit`, body);
    done++;
  }
  console.log(args.yes ? `scored ${done} reports on ${api.site}` : 'dry run: add --yes to save them');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
  if (cmd === 'read') return read(args);
  if (cmd === 'check') return check(args);
  if (cmd === 'apply') return apply(args);
  console.log('usage: node tools/reports/credits.mjs read|check|apply …  (see the comment at the top)');
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
