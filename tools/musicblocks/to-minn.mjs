#!/usr/bin/env node
/**
 * Creates the Musicblocks page in Minn (/musicblocks/, template "Full-width
 * page"), which is its source from then on: the words are core blocks edited
 * in Minn Admin, and each series is a groddle/musicblocks block drawn from
 * public/musicblocks/data.json (tools/musicblocks/build-data.mjs), so the
 * tunes, descriptions and figures come from the game.
 *
 *   MINN_USER=admin MINN_PASS=... node tools/musicblocks/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 */
import { attrJson, Minn } from '../changelog/to-minn.mjs';
import { p, h, group } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

/** The sets in page order: the five series by colour, then the two that belong to none. */
export const SETS = [
  ['dg', 'DG', 'DG: the green blocks'],
  ['dr', 'DR', 'DR: the red blocks'],
  ['db', 'DB', 'DB: the blue blocks'],
  ['bb', 'BB', 'BB: the brown blocks'],
  ['xs', 'XS', 'XS: the shiny blocks'],
  ['rare', 'rare', 'Two rare ones'],
];

const data = (name, attrs) => `<!-- wp:groddle/${name}${attrs ? ' ' + attrJson(attrs) : ''} /-->`;
const band = (id, alt, title, inner) => group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);

/** The page's blocks: the words around the game's own data. */
export function musicblocksContent() {
  const jump = [...SETS.map(([id, set]) => [`#${id}`, set === 'rare' ? 'Rare' : set]), ['#play', 'How they play'], ['#find', 'Where to find them']]
    .map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  const lead = {
    rare: [p('section-lead', 'Goodnight Groddle and SB-1 belong to no series. Goodnight Groddle was once the song that sent the world to sleep, and SB-1 is the one the Giants hummed while they imagined it.')],
  };
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Musicblocks'),
      h(1, 'Musicblocks'),
      p('lead', 'Musicblocks were Glitch’s pocket music: small collectible blocks, each holding one tune, that you could play for yourself and anyone nearby. Tiny Speck released the recordings with the rest of the game, and every tune that survived is here to hear. Press play on any block.'),
      p('jump', jump),
    ])]),
    ...SETS.map(([id, set, title], i) => band(id, i % 2 === 1, title, [...(lead[set] ?? []), data('musicblocks', { set })])),
    band('play', false, 'How they play', [
      p('section-lead', 'A musicblock is never used up: play it as often as you like. While it plays, the street music steps aside, and it comes back when the tune ends.'),
      data('musicblocks-rules'),
    ]),
    band('find', true, 'Where to find them', [
      p('section-lead', 'In the remake a block waits on each street you have not collected one from, always one you do not own yet, so exploring fills the series. SB-1 only comes out of the soil while you tend patches, and Goodnight Groddle turns up once every series tune is yours.'),
      p('', '<a href="/play/">Play Groddle Afternoon</a> to start collecting.'),
    ]),
    band('missing', false, 'The one still missing', [
      p('section-lead', 'Musicblock T-1 is in Tiny Speck’s item files, with a price and no description, but its tune has never been found in the archives. If it turns up, it joins this page. The <a href="/restoration/">restoration report</a> tracks the search.'),
    ]),
    group('div', 'wrap report-foot', null, [
      p('', 'The tunes are Tiny Speck’s own recordings and the icons its own art, both released into the public domain. The descriptions are from the game’s item files.'),
    ]),
  ].join('\n\n');
}

async function main() {
  const content = musicblocksContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=musicblocks&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Musicblocks', slug: 'musicblocks', status: 'publish', template: 'page-wide', excerpt: 'Every recovered Musicblock tune from Tiny Speck’s Glitch, to play, with the series they belong to and what they paid in the game.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
