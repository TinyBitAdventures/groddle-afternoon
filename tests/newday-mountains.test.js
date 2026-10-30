import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('the New Day mountains are the traced SVG, current with the CC0 PNG it comes from', () => {
  const out = execFileSync(process.execPath, ['tools/newday/trace.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /is current/);
  const svg = read('public/assets/ui/newday/new_day_mountains.svg');
  assert.match(svg, /viewBox="0 0 857 52"/, "the PNG's own size, so it scales without stretching");
  assert.doesNotMatch(svg, /<image|data:/, 'outline only, no embedded bitmap');
});

test('both play pages draw the sharp mountains, not the 857 px bitmap', () => {
  for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
    const html = read(page);
    assert.match(html, /class="new-day-mountains" src="assets\/ui\/newday\/new_day_mountains\.svg\?v=/, page);
    assert.doesNotMatch(html, /new_day_mountains\.png/, page);
  }
});
