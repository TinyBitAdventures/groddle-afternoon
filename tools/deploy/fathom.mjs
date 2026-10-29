#!/usr/bin/env node
/**
 * Puts Fathom's snippet into the built game's static pages at deploy time (tools/deploy/kinsta.sh), so
 * groddleafternoon.com counts the homepage, /play/, /play/online/, /compare/, the history page and the
 * item pages. Kinsta serves those folders' index.html itself, so the theme's head (groddle-afternoon-site
 * Extension::head, which carries the same snippet for the pages Minn renders) never reaches them. The
 * repo's own pages stay without it: groddle.localhost is never counted.
 *
 * Usage: node tools/deploy/fathom.mjs <built public/ dir>   (idempotent: a page that has it is left alone)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FATHOM_SNIPPET = '<!-- Fathom - beautiful, simple website analytics -->\n'
  + '<script src="https://cdn.usefathom.com/script.js" data-site="OTSJXDRZ" data-included-domains="groddleafternoon.com" defer></script>\n'
  + '<!-- / Fathom -->\n';

/** The page with the snippet before </head>, or null when it has no head or already has it. */
export function withFathom(html) {
  if (html.includes('cdn.usefathom.com/script.js')) return null;
  const at = html.search(/<\/head>/i);
  if (at < 0) return null;
  return html.slice(0, at) + FATHOM_SNIPPET + html.slice(at);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.argv[2];
  if (!root) {
    console.error('usage: node tools/deploy/fathom.mjs <built public/ dir>');
    process.exit(2);
  }
  let added = 0;
  for (const file of walk(root)) {
    const next = withFathom(readFileSync(file, 'utf8'));
    if (next !== null) {
      writeFileSync(file, next);
      added += 1;
    }
  }
  console.log(`fathom: ${added} pages`);
}
