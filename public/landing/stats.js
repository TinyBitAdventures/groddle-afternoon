// The home page's numbers, from the restoration report's data (restoration/data.json).
// landing.js fills them in the browser; tools/deploy/landing-stats.mjs writes the same text into
// the built page, so it reads true before the script runs (or if the fetch fails).
// Each number is the count alone (Austin 2026-11-25: "76", not "76 of 77"); a count with a total
// also fills a bar (data-bar) to its share of that total.

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** key -> [done, total] for the counts that have a total. */
function shares(data) {
  const out = {};
  const t = data?.tally || {};
  const playable = (t.source || 0) + (t.rebuilt || 0) + (t.solo || 0) + (t.reimagined || 0);
  const all = Object.values(t).reduce((a, b) => a + b, 0);
  if (all) out.systems = [playable, all];
  if (data?.rooms) out.rooms = [data.rooms.built, data.rooms.total];
  if (data?.skills) out.skills = [data.skills.counts?.live, data.skills.total];
  const img = data?.imagination;
  if (img?.counts && img.total) out.cards = [(img.counts.live || 0) + (img.counts.starter || 0), img.total];
  return out;
}

/** data-stat key -> its text, for every number the data has. */
export function landingStats(data) {
  const out = {};
  const s = shares(data);
  if (s.systems) out.systems = fmt(s.systems[0]);
  if (data?.quests) out.quests = fmt(data.quests.playable);
  if (s.rooms) out.rooms = fmt(s.rooms[0]);
  if (data?.streets) out.streets = fmt(data.streets.onMapsImported ?? data.streets.imported);
  if (s.skills) out.skills = fmt(s.skills[0]);
  if (data?.sounds) out.sounds = fmt(data.sounds.playable ?? data.sounds.withFile);
  if (data?.jobs) out.jobs = fmt(data.jobs.playableJobs);
  if (s.cards) out.cards = fmt(s.cards[0]);
  return out;
}

/** data-bar key -> its fill as a CSS percentage ("98.7%"), for the counts that have a total. */
export function landingBars(data) {
  const out = {};
  for (const [key, [done, total]] of Object.entries(shares(data))) {
    if (!total) continue;
    out[key] = `${Math.round(Math.min(1, Math.max(0, (done || 0) / total)) * 1000) / 10}%`;
  }
  return out;
}

/** The page's HTML with each <span ... data-stat="key">…</span> set to its number and each
 * <i data-bar="key" style="--w: …"> to its fill (others left as they are). */
export function stampStats(html, stats, bars = {}) {
  return html
    .replace(/(<span class="stat-num" data-stat="([a-z]+)">)([^<]*)(<\/span>)/g,
      (m, open, key, text, close) => (key in stats ? `${open}${stats[key]}${close}` : m))
    .replace(/(<i data-bar="([a-z]+)" style="--w: )([0-9.]+%)(">)/g,
      (m, open, key, w, close) => (key in bars ? `${open}${bars[key]}${close}` : m));
}
