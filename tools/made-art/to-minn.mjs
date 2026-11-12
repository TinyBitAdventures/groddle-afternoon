#!/usr/bin/env node
/**
 * Adds the Made for Groddle section to the restoration report in Minn
 * (/restoration/): one band, a heading and a paragraph as core blocks around
 * the groddle/restoration-made block (drawn from public/restoration/made.json,
 * tools/made-art/build-data.mjs), after the What can't come back band and
 * before the report's footer. Nothing else on the page changes: its own words,
 * edited in Minn Admin, are kept as they are, and a page that already has the
 * section is left alone. A page made fresh by tools/restoration/to-minn.mjs
 * carries the section already.
 *
 *   MINN_USER=admin MINN_PASS=... node tools/made-art/to-minn.mjs [--site=https://groddle.localhost] [--dry]
 *   node tools/made-art/to-minn.mjs --in=<content.html>    print the page with the section (exit 3: already there), for WP-CLI over SSH
 *
 * --dry prints the band alone.
 */
import { readFileSync } from 'node:fs';

import { Minn } from '../changelog/to-minn.mjs';
import { madeBand } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

/** The report's footer group; the band goes just above it. */
export const FOOT = '<!-- wp:group {"className":"wrap report-foot"} -->';

/** The page's content with the band added before its footer (or at its end); null when it already has the section. */
export function withMade(content) {
  if (content.includes('wp:groddle/restoration-made') || /\bid="made"/.test(content)) return null;
  const band = madeBand();
  const at = content.indexOf(FOOT);
  return at < 0 ? `${content.replace(/\s+$/, '')}\n\n${band}` : `${content.slice(0, at)}${band}\n\n${content.slice(at)}`;
}

async function main() {
  if (args.dry) {
    console.log(madeBand());
    return;
  }
  if (args.in) {
    const added = withMade(readFileSync(String(args.in), 'utf8'));
    if (added === null) {
      console.error('the page already has the Made for Groddle section; left alone');
      process.exit(3);
    }
    process.stdout.write(added);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const page = (await minn.rest('GET', '/wp/v2/pages?slug=restoration&status=publish,draft,private,pending&context=edit'))[0];
  if (!page) throw new Error('no restoration page (tools/restoration/to-minn.mjs makes it, with this section)');
  const added = withMade(page.content.raw);
  if (added === null) {
    console.log(`restoration page ${page.id} already has the Made for Groddle section; left alone`);
    return;
  }
  await minn.rest('POST', `/wp/v2/pages/${page.id}`, { content: added });
  console.log(`restoration page ${page.id}: added the Made for Groddle section`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
