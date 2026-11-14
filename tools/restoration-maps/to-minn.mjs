#!/usr/bin/env node
/**
 * Creates the Maps page in Minn (/restoration/maps/, a child of the
 * restoration report, template "Full-width page"; Austin 2026-11-14), which is
 * its source from then on: the words are core blocks edited in Minn Admin, and
 * the maps are the groddle/restoration-maps block drawn from
 * public/restoration/maps.json (tools/restoration-maps/build-data.mjs), so a
 * region restored later shows up with no page edit.
 *
 *   MINN_USER=admin MINN_PASS=... node tools/restoration-maps/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 */
import { attrJson, Minn } from '../changelog/to-minn.mjs';
import { group, h, p } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

export const PATH = '/restoration/maps/';
export const SLUG = 'maps';
export const TEMPLATE = 'page-wide';
const data = (part) => `<!-- wp:groddle/restoration-maps ${attrJson({ part })} /-->`;
const band = (id, alt, title, inner) => group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);

/** The page's blocks: our words around the maps drawn from maps.json. */
export function mapsContent() {
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Restoration report'),
      h(1, 'Maps'),
      p('lead', 'Every map in Groddle Afternoon beside the picture it replaced or was made from. Tiny Speck’s large region paintings were lost when Glitch closed. Some are back from 2012, the rest were painted again from the small pictures that survived, and the World map was sharpened for today’s screens. Flip, wipe or enlarge any of them to see the difference.'),
      data('summary'),
      p('jump', '<a href="#world">The World map</a> <a href="#restored">Restored from 2012</a> <a href="#painted">Painted again</a> <a href="#how">How they were made</a> <a href="/restoration/">The restoration report</a>'),
    ])]),
    band('world', false, 'The World map', [
      p('section-lead', 'Tiny Speck’s two World map charts survive whole, but only at 760 x 460, so they looked soft on a sharp screen. These copies were sharpened at twice the size from the charts themselves: the same lines, lettering and places. The originals still draw on a standard screen.'),
      data('world'),
    ]),
    band('restored', true, 'Restored from 2012', [
      p('section-lead', 'For these regions Tiny Speck’s own painting came back. The 2012 Encyclopedia showed each region’s map with the game’s roads, names and buttons drawn on top. That picture was the starting point: an image model took the markings off and sharpened it without moving anything, and the result was toned back to 2012’s colour. Each is shown beside the painting it replaced. The 2012 pictures themselves are not shown, because they are not part of Tiny Speck’s CC0 release.'),
      data('restored'),
    ]),
    band('painted', false, 'Painted again', [
      p('section-lead', 'For the other regions, the only thing left of Tiny Speck’s painting is the small thumbnail on the World map. Each was painted again from that thumbnail and the region’s street layout, in the style of the decos Tiny Speck painted its streets with. A few regions had no thumbnail at all and were painted from their street layout alone. As more 2012 paintings are restored, they move up to the section above.'),
      data('painted'),
    ]),
    band('how', true, 'How they were made', [
      p('section-lead', 'Each restore is toned to its own 2012 picture: the average saturation and lightness of its middle tones are matched, leaving out the 2012 roads, white lettering and pale paper sea, so they do not count. Gamma is used rather than a brightness boost, so the light paper sea keeps its grain.'),
      p('', 'Every picture on this page is CC0: Tiny Speck’s own art, which they gave to the public domain, or a picture made for Groddle Afternoon and given to the public domain the same way. The 2012 Encyclopedia pictures were only a guide and are kept out. The record of how each map was made, from what, and who chose it, ships with the game’s source.'),
    ]),
    group('div', 'wrap report-foot', null, [
      p('', 'This page fills itself from those records, so a region restored in a new release appears here on its own.'),
    ]),
  ].join('\n\n');
}

async function main() {
  const content = mapsContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const parent = (await minn.rest('GET', '/wp/v2/pages?slug=restoration&status=publish,draft,private,pending&context=edit'))[0];
  if (!parent) throw new Error('no restoration page to put this under (tools/restoration/to-minn.mjs makes it)');
  const found = (await minn.rest('GET', `/wp/v2/pages?slug=${SLUG}&parent=${parent.id}&status=publish,draft,private,pending&context=edit`))[0];
  if (found && !args.force) {
    console.log(`page ${found.id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Maps', slug: SLUG, parent: parent.id, status: 'publish', template: TEMPLATE, excerpt: 'Every map in Groddle Afternoon beside the picture it replaced or was made from: the World map sharpened, the regions restored from 2012, and the regions painted again from their thumbnails.', content };
  const saved = found ? await minn.rest('POST', `/wp/v2/pages/${found.id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
