// The home page's numbers, from the restoration report's data (restoration/data.json).
// landing.js fills them in the browser; tools/deploy/landing-stats.mjs writes the same text into
// the built page, so it reads true before the script runs (or if the fetch fails).

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const of = (a, b) => `${fmt(a)} of ${fmt(b)}`;

/** data-stat key -> its text, for every number the data has. */
export function landingStats(data) {
  const out = {};
  const t = data?.tally || {};
  const playable = (t.source || 0) + (t.rebuilt || 0) + (t.solo || 0) + (t.reimagined || 0);
  const all = Object.values(t).reduce((a, b) => a + b, 0);
  if (all) out.systems = of(playable, all);
  if (data?.quests) out.quests = fmt(data.quests.playable);
  if (data?.rooms) out.rooms = of(data.rooms.built, data.rooms.total);
  if (data?.streets) out.streets = fmt(data.streets.onMapsImported ?? data.streets.imported);
  if (data?.skills) out.skills = of(data.skills.counts?.live, data.skills.total);
  if (data?.sounds) out.sounds = fmt(data.sounds.playable ?? data.sounds.withFile);
  if (data?.jobs) out.jobs = fmt(data.jobs.playableJobs);
  const img = data?.imagination;
  if (img?.counts && img.total) out.cards = of((img.counts.live || 0) + (img.counts.starter || 0), img.total);
  return out;
}

/** The page's HTML with each <span ... data-stat="key">…</span> set to its number (others left as they are). */
export function stampStats(html, stats) {
  return html.replace(/(<span class="stat-num" data-stat="([a-z]+)">)([^<]*)(<\/span>)/g,
    (m, open, key, text, close) => (key in stats ? `${open}${stats[key]}${close}` : m));
}
