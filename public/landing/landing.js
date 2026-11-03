// Home page: fill the numbers and the recent changes from the restoration
// report's data (restoration/data.json, rebuilt with every commit). The HTML
// carries the same numbers as of the last build (tools/deploy/landing-stats.mjs), so the page reads
// true if this fetch fails.
// Every photo opens full size in the viewer (landing/viewer.js).
import { mountViewer } from './viewer.js?v=9a919381';
import { landingStats } from './stats.js?v=26a4d16f';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

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

  for (const [key, text] of Object.entries(landingStats(data))) setStat(key, text);

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

mountViewer();
main();
