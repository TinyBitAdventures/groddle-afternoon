/**
 * Groddle Field Notes · Every change: the day-by-day heatmap's logic (no DOM, so tests import it).
 * history.json's `activity` (tools/build-restoration.mjs activityLog) holds every commit of the game,
 * site and server counted by day and kind, and the release tags by day. The heatmap's intensity is a
 * day's commits across the three repos; its five steps are the quartiles of the days with any.
 */

/** Heatmap kinds in tooltip order, with the page's own words (New, Better, Fixed as the list's tags). */
export const KIND_LABELS = { new: 'New', improve: 'Better', fix: 'Fixed', doc: 'Docs', test: 'Tests', other: 'Other' };
export const REPO_LABELS = { game: 'game', site: 'site', server: 'server' };
const LIST_KINDS = ['new', 'improve', 'fix'];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s) => typeof s === 'string' && DAY.test(s);

/** A yyyy-mm-dd day `n` days on (UTC arithmetic, so no daylight-saving drift). */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday. */
export const weekday = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/** "Wednesday 4 November 2026". */
export function dayName(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "4 November 2026". */
export function shortDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/**
 * One day's breakdown: { date, total, repos: { game: n, ... }, kinds: { new: n, ... }, releases: [...] }.
 * Repos and kinds hold only the non-zero counts, in REPO order and KIND_LABELS order.
 */
export function dayTotals(activity, date) {
  const day = activity?.days?.[date] || {};
  const repos = {};
  const kinds = {};
  let total = 0;
  for (const repo of activity?.repos || Object.keys(day)) {
    const counts = day[repo];
    if (!counts) continue;
    let n = 0;
    for (const [kind, c] of Object.entries(counts)) {
      n += c;
      kinds[kind] = (kinds[kind] || 0) + c;
    }
    if (n) repos[repo] = n;
    total += n;
  }
  const ordered = {};
  for (const k of Object.keys(KIND_LABELS)) if (kinds[k]) ordered[k] = kinds[k];
  return { date, total, repos, kinds: ordered, releases: activity?.releases?.[date] || [] };
}

/** The player-visible changes a day's game commits list (what the list below shows for it). */
export const listedCount = (activity, date) => LIST_KINDS.reduce((n, k) => n + (activity?.days?.[date]?.game?.[k] || 0), 0);

/** The first and last day: the first commit to the later of `end` (the build day) and the last commit. */
export function daySpan(activity, end = '') {
  const days = Object.keys(activity?.days || {}).filter(isDay).sort();
  if (!days.length) return null;
  const last = isDay(end) && end > days[days.length - 1] ? end : days[days.length - 1];
  return { from: days[0], to: last };
}

/** Columns of 7 days (Monday first) covering from..to; days outside the span are null. */
export function weekColumns(from, to) {
  const cols = [];
  let start = addDays(from, -weekday(from));
  while (start <= to) {
    const col = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(start, i);
      col.push(d < from || d > to ? null : d);
    }
    cols.push(col);
    start = addDays(start, 7);
  }
  return cols;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A month label per column ('' for none): on the first column and on each column whose first day
 * starts a new month. A label one column before the next is dropped (they would overlap).
 */
export function monthLabels(cols) {
  const firstDay = (col) => col.find(Boolean);
  const labels = cols.map((col, i) => {
    const d = firstDay(col);
    if (!d) return '';
    if (i === 0) return MONTHS[Number(d.slice(5, 7)) - 1];
    const prev = firstDay(cols[i - 1]);
    return prev && prev.slice(0, 7) !== d.slice(0, 7) ? MONTHS[Number(d.slice(5, 7)) - 1] : '';
  });
  for (let i = 0; i < labels.length - 1; i += 1) if (labels[i] && labels[i + 1]) labels[i] = '';
  return labels;
}

/**
 * Level steps from the totals of the days with commits: [q1, q2, q3] (quartiles), so the five shades
 * spread over the project's own range. level 0 = none, 1..4 = up to q1, q2, q3, more.
 */
export function levelSteps(totals) {
  const v = totals.filter((n) => n > 0).sort((a, b) => a - b);
  if (!v.length) return [0, 0, 0];
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  return [q(0.25), q(0.5), q(0.75)];
}

export function levelOf(total, steps) {
  if (!total) return 0;
  if (total <= steps[0]) return 1;
  if (total <= steps[1]) return 2;
  if (total <= steps[2]) return 3;
  return 4;
}

/** The legend's words for each level: ['No commits', '1 to 70 commits', ...]. */
export function levelRanges(steps) {
  const out = ['No commits'];
  let lo = 1;
  for (const hi of steps) {
    out.push(hi < lo ? '' : lo === hi ? plural(hi, 'commit') : `${fmt(lo)} to ${plural(hi, 'commit')}`);
    lo = Math.max(lo, hi + 1);
  }
  out.push(`${fmt(lo)} or more commits`);
  return out;
}

/** Release tags grouped per repo: "game v0.4.0 to v0.5.0 (7 releases), site v0.4.5". */
export function releaseText(releases = []) {
  const by = new Map();
  for (const r of releases) {
    const [repo, tag] = r.split(' ');
    if (!by.has(repo)) by.set(repo, []);
    by.get(repo).push(tag);
  }
  return [...by].map(([repo, tags]) => (tags.length === 1
    ? `${repo} ${tags[0]}`
    : `${repo} ${tags[0]} to ${tags[tags.length - 1]} (${tags.length} releases)`)).join(', ');
}

/** The lines a day's tooltip shows (also joined into its aria-label). */
export function describeDay(t) {
  const lines = [dayName(t.date)];
  if (!t.total) {
    lines.push('No commits');
    return lines;
  }
  const repos = Object.entries(t.repos);
  lines.push(`${plural(t.total, 'commit')}${repos.length > 1 ? `: ${repos.map(([r, n]) => `${REPO_LABELS[r] || r} ${fmt(n)}`).join(', ')}` : repos.length ? ` to the ${REPO_LABELS[repos[0][0]] || repos[0][0]}` : ''}`);
  lines.push(Object.entries(t.kinds).map(([k, n]) => `${KIND_LABELS[k] || k} ${fmt(n)}`).join(', '));
  if (t.releases.length) lines.push(`Released ${releaseText(t.releases)}`);
  return lines;
}

export const describeDayLabel = (t) => describeDay(t).join('. ');

/** "#fix&day=2026-11-04" -> { kind: 'fix', day: '2026-11-04' }; #new, #improve and #fix alone still work. */
export function parseHash(hash = '') {
  let kind = 'all';
  let day = '';
  for (const part of hash.replace(/^#/, '').split('&')) {
    if (['new', 'improve', 'fix'].includes(part)) kind = part;
    else if (part.startsWith('day=') && isDay(part.slice(4))) day = part.slice(4);
  }
  return { kind, day };
}

/** The address hash for a view ('' for everything). */
export function formatHash({ kind = 'all', day = '' } = {}) {
  const parts = [];
  if (kind && kind !== 'all') parts.push(kind);
  if (isDay(day)) parts.push(`day=${day}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

/** The list's filter: kind ('all' or one), a lower-case search, and a day ('' for every day). */
export function matchesChange(c, { kind = 'all', query = '', day = '' } = {}) {
  if (day && c.date !== day) return false;
  if (kind !== 'all' && c.kind !== kind) return false;
  if (!query) return true;
  return c.text.toLowerCase().includes(query) || c.details.some((d) => d.toLowerCase().includes(query));
}

/** Changes grouped by day (in the list's order), filtered. */
export function groupChanges(changes, filter) {
  const days = new Map();
  for (const c of changes) {
    if (!matchesChange(c, filter)) continue;
    if (!days.has(c.date)) days.set(c.date, []);
    days.get(c.date).push(c);
  }
  return days;
}

/** A day may be picked when it had commits (or, with no activity data, listed changes). */
export function selectableDay(day, activity, changes = []) {
  if (!isDay(day)) return false;
  if (activity?.days) return dayTotals(activity, day).total > 0;
  return changes.some((c) => c.date === day);
}

/** Arrow-key moves in the grid: rows are weekdays, columns weeks. */
export function stepDay(day, key, span) {
  const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[key];
  let next = day;
  if (step) next = addDays(day, step);
  else if (key === 'Home') next = span.from;
  else if (key === 'End') next = span.to;
  else if (key === 'PageUp') next = addDays(day, -28);
  else if (key === 'PageDown') next = addDays(day, 28);
  else return day;
  if (next < span.from) return step ? day : span.from;
  if (next > span.to) return step ? day : span.to;
  return next;
}
