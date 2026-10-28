#!/usr/bin/env node
/**
 * Creates the Brand page in Minn (/brand/, template "Full-width page"), which
 * is its source from then on: the words are core blocks edited in Minn Admin.
 * The marks are static files under the game build's public/brand/
 * (tools/brand/build.mjs writes them), served beside the page like every
 * other built folder. The page is not linked from the header or any menu
 * (Austin 2026-10-28: a /brand/ page, unlinked, with a mark of our own in
 * place of the quoin icon; he approved the mark the same day, and the site's
 * icons and the header's wordmark are now the arch).
 * The palette is read from public/restoration/restoration.css, the site's
 * tokens, so no colour on the page is typed by hand.
 *
 *   MINN_USER=admin MINN_PASS=... node tools/brand/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { block, Minn } from '../changelog/to-minn.mjs';
import { LOCKUP_RENDERS, svgFiles, svgSize } from './build.mjs';
import { p, h, group } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');
const root = join(import.meta.dirname, '..', '..');

/** The colour tokens the page shows, in order, with a plain name and what each is for. */
export const PALETTE = [
  ['bg', 'Meadow', 'The page behind everything.'],
  ['surface', 'Paper', 'Cards and panels, and the sun in the mark.'],
  ['fg', 'Ink', 'Text, headings and the wordmark.'],
  ['lead', 'Lead', 'The opening paragraph under a page title.'],
  ['muted', 'Muted', 'Secondary text: notes, captions, dates.'],
  ['border', 'Border', 'Lines and the edges of cards.'],
  ['accent', 'Afternoon', 'The Play button, the current page in the menu, focus rings, and the low sky in the mark.'],
  ['moss', 'Moss', 'The hills and the tree in the mark, and the game’s tone on the Code page.'],
  ['sun', 'Sun', 'Notes, and the warm end of charts.'],
  ['sky', 'Sky', 'A section and chart tone: the realtime server, Compare.'],
  ['plum', 'Plum', 'A section and chart tone: the site.'],
  ['sand', 'Sand', 'A chart tone.'],
  ['stone', 'Stone', 'A chart tone for what is left over.'],
  ['dusk', 'Dusk', 'A chart tone.'],
];

/** The site's tokens, light and dark, from restoration.css (the stylesheet that defines them for both themes). */
export function siteTokens(css = readFileSync(join(root, 'public/restoration/restoration.css'), 'utf8')) {
  const read = (opener) => {
    const at = css.indexOf(opener);
    if (at < 0) throw new Error(`restoration.css has no ${opener}`);
    const body = css.slice(at + opener.length, css.indexOf('}', at));
    return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map(([, k, v]) => [k, v.toLowerCase()]));
  };
  return { light: read(':root {'), dark: read(':root[data-theme="dark"] {') };
}

/** Every file under public/brand/ the page shows or offers. */
export const ASSETS = [];
const asset = (path) => {
  if (!ASSETS.includes(path)) ASSETS.push(path);
  return `/brand/${path}`;
};

const img = (path, alt, w, hgt, cls = '') => block('image', { width: `${w}px`, height: `${hgt}px`, ...(cls ? { className: cls } : {}) },
  `<figure class="wp-block-image is-resized${cls ? ` ${cls}` : ''}"><img src="${asset(path)}" alt="${alt}" width="${w}" height="${hgt}" style="width:${w}px;height:${hgt}px"/></figure>`);
const list = (cls, items) => block('list', cls ? { className: cls } : null,
  `<ul class="wp-block-list${cls ? ` ${cls}` : ''}">${items.map((i) => block('list-item', null, `<li>${i}</li>`)).join('\n')}</ul>`);
const band = (id, alt, title, inner) => group('section', `band brand-band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);
/** A tile that shows a file on a fixed light or dark ground, with a caption. */
const tile = (ground, inner, caption) => group('div', `brand-tile brand-on-${ground}`, null, [...inner, p('brand-tile-cap', caption)]);
const tiles = (cls, inner) => group('div', `brand-tiles${cls ? ` ${cls}` : ''}`, null, inner);

/** The PNG renders of a lockup, as links with their pixel sizes: "2x (966 × 112) and 8x (3864 × 448)". */
function lockupPngs(name) {
  const files = svgFiles();
  return LOCKUP_RENDERS.filter(([src]) => src === `${name}.svg`)
    .map(([src, out, scale]) => `<a href="${asset(out)}">${scale}x</a> (${svgSize(files[src]).map((n) => n * scale).join(' × ')})`).join(' and ');
}

/** One colour: its swatch in light and in dark, its name and token, what it is for, and both values. */
function swatch([token, name, role], tokens) {
  const light = tokens.light[token], dark = tokens.dark[token];
  if (!light || !dark) throw new Error(`no --${token} in both themes`);
  return group('div', `brand-swatch brand-swatch-${token}`, null, [
    p('brand-chips', `<span class="brand-chip" style="background:${light}"></span><span class="brand-chip" style="background:${dark}"></span>`),
    p('brand-swatch-name', `<strong>${name}</strong> <code>--${token}</code>`),
    p('brand-swatch-role', role),
    p('brand-swatch-hex', `Light <code>${light}</code> Dark <code>${dark}</code>`),
  ]);
}

/** The page's blocks. */
export function brandContent(tokens = siteTokens()) {
  const jump = [['#mark', 'The mark'], ['#lockups', 'Lockups'], ['#type', 'Type'], ['#colour', 'Colour'], ['#icons', 'Icons'], ['#usage', 'Usage'], ['#directions', 'Directions explored'], ['#files', 'Files']]
    .map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  return [
    group('header', 'masthead brand-masthead', null, [group('div', 'wrap brand-hero', null, [
      img('mark.svg', 'The Groddle Afternoon mark: a low sun over two green hills and a tree, seen through an arched window', 232, 232, 'brand-hero-mark'),
      group('div', 'brand-hero-words', null, [
        p('kicker', 'Groddle Field Notes · Brand'),
        h(1, 'A low sun over the Groddle hills'),
        p('lead', 'The Groddle Afternoon mark is an arched window onto Groddle, the meadows, woods and rolling hills where the game begins, in the warm light of a late afternoon. This page is how to use it, with every file ready to download.'),
        p('jump', jump),
      ]),
    ])]),
    band('mark', false, 'The mark', [
      p('section-lead', 'An arch, a sun, two hills, a tree and a path, drawn on a 64 grid in the site’s own colours. It reads the same on the light and dark pages, and it has a one-colour version for anywhere colour is not an option.'),
      tiles('brand-tiles-4', [
        tile('light', [img('mark.svg', 'The mark on the light page colour', 128, 128)], 'Full colour, on Meadow'),
        tile('dark', [img('mark.svg', 'The mark on the dark page colour', 128, 128)], 'Full colour, on dark Meadow'),
        tile('paper', [img('mark-ink.svg', 'The one-colour mark in Ink', 128, 128)], 'One colour, Ink'),
        tile('dark', [img('mark-paper.svg', 'The one-colour mark in Paper', 128, 128)], 'One colour, Paper'),
      ]),
      list('brand-parts', [
        '<strong>The arch.</strong> A window onto the world, and a door into the game. Its top is a half circle, its foot rounded off.',
        '<strong>The sun.</strong> Low, warm and still clear of the hills: afternoon, not sunset. It is the widest thing in the mark, so it is what you see first at any size.',
        '<strong>The hills and the tree.</strong> Groddle’s meadows and woods, in two greens: the far hill lighter, the near hill darker.',
        '<strong>The path.</strong> Up the near hill toward the sun: the way in.',
      ]),
      p('', 'The one-colour version keeps the same drawing: the arch becomes a frame, the sun, tree and hills are solid, and the path and the line between the hills are cut out. Use it in Ink on light grounds and in Paper on dark ones.'),
    ]),
    band('lockups', true, 'Lockups', [
      p('section-lead', 'The mark and the name together. The name is set in the site’s display face at 0.82 of the arch’s height and starts a third of the arch’s height after it, the same proportions the header uses. Stacked, the name breaks onto two lines under the arch.'),
      tiles('brand-tiles-2', [
        tile('light', [img('lockup-horizontal.svg', 'The horizontal lockup on a light ground', 362, 42, 'brand-lockup')], 'Horizontal, on light'),
        tile('dark', [img('lockup-horizontal-dark.svg', 'The horizontal lockup on a dark ground', 362, 42, 'brand-lockup')], 'Horizontal, on dark'),
        tile('light', [img('lockup-stacked.svg', 'The stacked lockup on a light ground', 127, 100, 'brand-lockup')], 'Stacked, on light'),
        tile('dark', [img('lockup-stacked-dark.svg', 'The stacked lockup on a dark ground', 127, 100, 'brand-lockup')], 'Stacked, on dark'),
      ]),
      group('div', 'brand-rules', null, [
        img('clear-space.svg', 'The horizontal lockup with a dashed line round it, one sun’s width away on every side', 549, 124, 'brand-clear'),
        list('brand-rule-list', [
          '<strong>Clear space.</strong> Keep one sun’s width empty on every side of the mark or a lockup. Nothing else sits inside the dashed line.',
          '<strong>Smallest size.</strong> The mark alone down to 16 px, using the small drawing below 32 px. The horizontal lockup down to 20 px tall, the stacked one down to 64 px tall. Smaller than that, use the mark alone.',
          '<strong>Use the files.</strong> Take the lockup you need from the files below rather than setting the name beside the mark by hand.',
          '<strong>SVG or PNG.</strong> The SVG lockups set the name as text in Iowan Old Style, which Apple devices have and others may not. Where it matters that the lettering is exact, such as print, slides or a link preview, use the PNGs, rendered on a Mac.',
        ]),
      ]),
      list('brand-files', [
        `Horizontal, for light grounds: ${lockupPngs('lockup-horizontal')}`,
        `Horizontal, for dark grounds: ${lockupPngs('lockup-horizontal-dark')}`,
        `Stacked, for light grounds: ${lockupPngs('lockup-stacked')}`,
        `Stacked, for dark grounds: ${lockupPngs('lockup-stacked-dark')}`,
      ]),
    ]),
    band('type', false, 'Type', [
      p('section-lead', 'The wordmark is the site’s display face, the one every heading on the site uses. The pages need no font downloads: each face is already on the reader’s computer, with a close fallback where it is not.'),
      group('div', 'brand-type', null, [
        group('div', 'brand-face brand-face-display', null, [
          p('brand-specimen', 'Groddle Afternoon'),
          p('brand-face-name', '<strong>Iowan Old Style</strong>, semibold (600)'),
          p('brand-face-note', 'The wordmark and every heading. Where it is missing it falls back to Charter, then Georgia. The SVG lockups hold the name at its measured width, so a fallback face keeps the lockup’s shape; the PNG lockups are rendered on a Mac, in the face itself.'),
        ]),
        group('div', 'brand-face brand-face-body', null, [
          p('brand-specimen', 'Plant a bean, pet a piggy, and wait for the sun to come round again.'),
          p('brand-face-name', '<strong>Trebuchet MS</strong>, regular and bold'),
          p('brand-face-note', 'Everything you read: paragraphs, the menu, buttons.'),
        ]),
        group('div', 'brand-face brand-face-mono', null, [
          p('brand-specimen', '<code>node tools/brand/build.mjs</code>'),
          p('brand-face-name', '<strong>The system monospace</strong>'),
          p('brand-face-note', 'Code, file names and figures.'),
        ]),
      ]),
      p('', 'Headings and the name are in sentence case: Groddle Afternoon, never all capitals. In a sentence the name is written out in full; Groddle on its own is the region in the game.'),
    ]),
    band('colour', true, 'Colour', [
      p('section-lead', 'The palette is the site’s own: the same values the pages are drawn with, in light and in dark. In each swatch the left half is the light theme and the right half the dark.'),
      group('div', 'brand-swatches', null, PALETTE.map((c) => swatch(c, tokens))),
    ]),
    band('icons', false, 'Icons', [
      p('section-lead', 'At 16 and 32 pixels the mark is redrawn: a wider arch and a bigger sun, without the path, and the tree a round bush. At 180 and 512 pixels the full mark sits on Meadow, since app icons need a solid ground. These are the site’s icons: the browser tab, the header beside the name, and the home-screen icon.'),
      group('div', 'brand-icons', null, [
        group('div', 'brand-icon', null, [img('png/icon-16.png', 'The favicon at 16 pixels', 16, 16, 'brand-px'), img('png/icon-16.png', 'The 16 pixel favicon enlarged eight times', 128, 128, 'brand-px brand-zoom'), p('brand-tile-cap', '16 px, the browser tab, and enlarged')]),
        group('div', 'brand-icon', null, [img('png/icon-32.png', 'The favicon at 32 pixels', 32, 32, 'brand-px'), img('png/icon-32.png', 'The 32 pixel favicon enlarged four times', 128, 128, 'brand-px brand-zoom'), p('brand-tile-cap', '32 px, high-density tabs, and enlarged')]),
        group('div', 'brand-icon', null, [img('png/icon-180.png', 'The 180 pixel touch icon', 180, 180, 'brand-app'), p('brand-tile-cap', '180 px, the home-screen icon on phones')]),
        group('div', 'brand-icon brand-icon-big', null, [img('png/icon-512.png', 'The 512 pixel app icon', 256, 256, 'brand-app'), p('brand-tile-cap', '512 px, app stores and link previews, shown at half size')]),
      ]),
    ]),
    band('usage', true, 'Usage', [
      group('div', 'brand-usage', null, [
        group('div', 'brand-do', null, [h(3, 'Do'), list('', [
          'Use the files as they are.',
          'Give the mark its clear space.',
          'Use the full-colour mark on Meadow, Paper or the dark page colour.',
          'Use the one-colour mark when there is only one ink, such as a stamp or an engraving.',
          'Use the small drawing for anything under 32 pixels.',
        ])]),
        group('div', 'brand-dont', null, [h(3, 'Don’t'), list('', [
          'Stretch, tilt or rotate the mark.',
          'Recolour parts of it, or put the full-colour mark on a busy photo or another strong colour.',
          'Add a shadow, glow or outline.',
          'Set the name in another typeface, or in capitals.',
          'Put the mark beside Tiny Speck’s art as if it were part of it, or use it with the Glitch name or logo.',
        ])]),
      ]),
    ]),
    band('directions', false, 'Directions explored', [
      p('section-lead', 'Three ways in were drawn before the arch was chosen. All three live in <code>tools/brand/build.mjs</code>, so either of the others can become the mark.'),
      tiles('brand-tiles-3', [
        group('div', 'brand-direction brand-direction-chosen', null, [
          group('div', 'brand-direction-marks', null, [img('mark.svg', 'The arch', 96, 96), img('png/icon-16.png', 'The arch at 16 pixels', 16, 16, 'brand-px')]),
          h(3, 'The arch (chosen)'),
          p('', 'A window onto Groddle with the sun, hills and a tree inside. It says where the game is and what time of day it is, holds together at 16 pixels because the sun is so big, and its outline is nothing like the round quoin it replaces.'),
        ]),
        group('div', 'brand-direction', null, [
          group('div', 'brand-direction-marks', null, [img('direction-lettermark.svg', 'A G lettermark with the sun in its mouth', 96, 96), img('direction-lettermark.svg', 'The lettermark at 16 pixels', 16, 16, 'brand-px')]),
          h(3, 'A G lettermark'),
          p('', 'A rounded G whose bar is the horizon, with the sun resting in its mouth. Strong and simple, but it speaks of a letter before a place, and a G on a dark tile is a crowded field.'),
        ]),
        group('div', 'brand-direction', null, [
          group('div', 'brand-direction-marks', null, [img('direction-emblem.svg', 'A stitched round emblem with a tree and the sun', 96, 96), img('direction-emblem.svg', 'The emblem at 16 pixels', 16, 16, 'brand-px')]),
          h(3, 'A stitched emblem'),
          p('', 'A round patch with a stitched edge, like the sewn cards on the Code and Project pages, holding a tree and the sun. Warm at large sizes, but at 16 pixels the stitching and the tree run together.'),
        ]),
      ]),
    ]),
    band('files', true, 'Files', [
      p('section-lead', 'Every file is an SVG with nothing outside it to load, or a PNG rendered from one.'),
      list('brand-files', [
        `<a href="${asset('mark.svg')}">mark.svg</a>: the mark, full colour`,
        `<a href="${asset('mark-small.svg')}">mark-small.svg</a>: the mark drawn for 16 to 32 px`,
        `<a href="${asset('mark-ink.svg')}">mark-ink.svg</a> and <a href="${asset('mark-paper.svg')}">mark-paper.svg</a>: one colour, for light and dark grounds`,
        `<a href="${asset('lockup-horizontal.svg')}">lockup-horizontal.svg</a> and <a href="${asset('lockup-horizontal-dark.svg')}">lockup-horizontal-dark.svg</a>: the name beside the mark, for light and dark grounds`,
        `<a href="${asset('lockup-stacked.svg')}">lockup-stacked.svg</a> and <a href="${asset('lockup-stacked-dark.svg')}">lockup-stacked-dark.svg</a>: the name under the mark, for light and dark grounds`,
        `<a href="${asset('png/lockup-horizontal-2x.png')}">lockup-horizontal-2x.png</a>, <a href="${asset('png/lockup-horizontal-8x.png')}">lockup-horizontal-8x.png</a>, <a href="${asset('png/lockup-horizontal-dark-2x.png')}">lockup-horizontal-dark-2x.png</a> and <a href="${asset('png/lockup-horizontal-dark-8x.png')}">lockup-horizontal-dark-8x.png</a>: the horizontal lockups as PNGs on a clear ground, at twice and eight times size, rendered on a Mac`,
        `<a href="${asset('png/lockup-stacked-2x.png')}">lockup-stacked-2x.png</a>, <a href="${asset('png/lockup-stacked-8x.png')}">lockup-stacked-8x.png</a>, <a href="${asset('png/lockup-stacked-dark-2x.png')}">lockup-stacked-dark-2x.png</a> and <a href="${asset('png/lockup-stacked-dark-8x.png')}">lockup-stacked-dark-8x.png</a>: the stacked lockups, the same way`,
        `<a href="${asset('png/mark-512.png')}">mark-512.png</a>: the mark at 512 px on a clear ground`,
        `<a href="${asset('png/icon-512.png')}">icon-512.png</a> and <a href="${asset('png/icon-180.png')}">icon-180.png</a>: app icons on Meadow`,
        `<a href="${asset('swap/favicon.svg')}">favicon.svg</a>, <a href="${asset('swap/favicon.ico')}">favicon.ico</a>, <a href="${asset('swap/apple-touch-icon.png')}">apple-touch-icon.png</a> and <a href="${asset('swap/favicon-192.png')}">favicon-192.png</a>: the site’s icons, the same files the site serves from its root`,
      ]),
    ]),
    group('div', 'wrap report-foot', null, [
      p('', 'The mark is our own drawing, released with the game’s code under MIT. Tiny Speck’s art, which the game and these pages use under its public-domain (CC0) release, is not part of the brand, and neither are the Glitch name and logo, which were never part of that release.'),
    ]),
  ].join('\n\n');
}

async function main() {
  const content = brandContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=brand&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Brand', slug: 'brand', status: 'publish', template: 'page-wide', excerpt: 'The Groddle Afternoon mark, its lockups, type and colours, and how to use them.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
