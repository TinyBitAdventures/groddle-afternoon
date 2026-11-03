#!/usr/bin/env node
/**
 * Writes the home page's numbers (index.html's data-stat spans) from restoration/data.json, with the
 * same words landing.js fills in the browser (landing/stats.js). Run after build-restoration.mjs:
 * tools/deploy/kinsta.sh does it in the built copy, so the page reads true before its script runs or if
 * the fetch fails. Run on the repo's public/ it brings the checked-in fallback up to date.
 *
 *   node tools/deploy/landing-stats.mjs <built public/ dir>
 *
 * Idempotent; prints what it wrote.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { landingStats, stampStats } from '../../public/landing/stats.js?v=26a4d16f';

export function writeLandingStats(dir) {
  const data = JSON.parse(readFileSync(join(dir, 'restoration', 'data.json'), 'utf8'));
  const page = join(dir, 'index.html');
  const stats = landingStats(data);
  const html = readFileSync(page, 'utf8');
  const next = stampStats(html, stats);
  if (next !== html) writeFileSync(page, next);
  return stats;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node tools/deploy/landing-stats.mjs <built public/ dir>');
    process.exit(1);
  }
  const stats = writeLandingStats(dir);
  console.log(`landing stats: ${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
