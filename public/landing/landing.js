// Home page: fill the numbers and the recent changes from the restoration
// report's data (restoration/data.json, rebuilt with every commit). The HTML
// carries reasonable numbers so the page reads fine if this fetch fails.

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const of = (a, b) => `${fmt(a)} of ${fmt(b)}`;

function setStat(key, text) {
  const el = document.querySelector(`[data-stat="${key}"]`);
  if (el && text) el.textContent = text;
}

function shortDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function main() {
  let data;
  try {
    const res = await fetch('restoration/data.json', { cache: 'no-cache' });
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return;
  }

  const t = data.tally || {};
  const playable = (t.source || 0) + (t.rebuilt || 0) + (t.solo || 0) + (t.reimagined || 0);
  const all = Object.values(t).reduce((a, b) => a + b, 0);
  if (all) setStat('systems', of(playable, all));
  if (data.quests) setStat('quests', fmt(data.quests.playable));
  if (data.rooms) setStat('rooms', of(data.rooms.built, data.rooms.total));
  if (data.streets) setStat('streets', fmt(data.streets.onMapsImported ?? data.streets.imported));
  if (data.skills) setStat('skills', of(data.skills.counts?.live, data.skills.total));
  if (data.sounds) setStat('sounds', fmt(data.sounds.playable ?? data.sounds.withFile));
  if (data.jobs) setStat('jobs', fmt(data.jobs.playableJobs));
  const img = data.imagination;
  if (img?.counts && img.total) setStat('cards', of((img.counts.live || 0) + (img.counts.starter || 0), img.total));

  const recent = (data.git?.recent || []).filter((r) => r.kind === 'new' || r.kind === 'improve' || r.kind === 'fix').slice(0, 5);
  const list = document.getElementById('log-list');
  if (list && recent.length) {
    list.replaceChildren(...recent.map((r) => {
      const li = document.createElement('li');
      li.dataset.kind = r.kind;
      li.textContent = r.text;
      const when = document.createElement('time');
      when.dateTime = r.date;
      when.textContent = shortDate(r.date);
      li.append(when);
      return li;
    }));
  }
  const meta = document.getElementById('log-meta');
  if (meta && data.git?.commits) {
    const files = typeof data.tests === 'number' ? `, checked by ${fmt(data.tests)} test files` : '';
    meta.textContent = `${fmt(data.git.commits)} changes since ${shortDate(data.git.since)}${files}.`;
  }
}

main();
