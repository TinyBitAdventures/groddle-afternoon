#!/usr/bin/env node
/**
 * Creates the Street music page in Minn (/street-music/, template "Full-width
 * page"), which is its source from then on: the words are core blocks edited
 * in Minn Admin, and each of Tiny Speck's track groups is a
 * groddle/street-music block drawn from public/street-music/data.json
 * (tools/streetmusic/build-data.mjs).
 *
 *   MINN_USER=admin MINN_PASS=... node tools/streetmusic/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once; --force overwrites it with the words below.
 */
import { attrJson, Minn } from '../changelog/to-minn.mjs';
import { p, h, group } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

/** The bands in page order: Tiny Speck's groups, then what survives. */
export const BANDS = [
  ['themes', 'theme', 'Theme tracks', 'The themes of Ur’s regions as Tiny Speck published them: the Groddle forests, the caverns, the Firebogs, the winter lands and the rest.'],
  ['sketches', 'sketch', 'Theme sketches', 'Four shorter pieces. Three of them play in the subway, whose own hum is still missing.'],
  ['activity', 'activity', 'Activity music', 'Tunes for things you did rather than places you went: meditating, making metal, spinning thread.'],
  ['rube', 'ringtone', 'The Rube Song', 'Tiny Speck also published the Rube’s own song, as a ringtone.'],
];

const data = (name, attrs) => `<!-- wp:groddle/${name}${attrs ? ' ' + attrJson(attrs) : ''} /-->`;
const band = (id, alt, title, inner) => group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);

/** The entry's blocks: the words around Tiny Speck's tracks. */
export function streetMusicContent() {
  const jump = [...BANDS.map(([id, , title]) => [`#${id}`, title]), ['#survives', 'What survives']]
    .map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Music'),
      h(1, 'Street music'),
      p('lead', 'Every region of Ur had its own set of tunes, and one of them played whenever you walked in. Those loops are back: Groddle Afternoon plays the originals again in every region. This page is the music Tiny Speck published for everyone to download. Press play on any track.'),
      p('jump', jump),
    ])]),
    ...BANDS.map(([id, set, title, lead], i) => band(id, i % 2 === 1, title, [p('section-lead', lead), data('street-music', { group: set })])),
    band('survives', BANDS.length % 2 === 1, 'What survives', [
      p('section-lead', 'Glitch played its street music from a library of loops on Tiny Speck’s servers. Those files were thought lost when the game closed, until a fan’s copy of the server’s sound folder turned up, file for file the same as Tiny Speck’s. Groddle Afternoon now plays the original loops in every region and on many streets and party spaces. A few are still missing, such as the subway hum and the Enchanted Wood themes, and the remake fills those with tracks from this page. The places under each track are where it plays now.'),
      p('', 'The six Musicblock tunes from the same page are on the <a href="/musicblocks/">Musicblocks</a> page, with the rest of the Musicblocks.'),
    ]),
    group('div', 'wrap report-foot', null, [
      p('', 'The tracks and their titles are Tiny Speck’s own, from its Glitch downloads page.'),
    ]),
  ].join('\n\n');
}

async function main() {
  const content = streetMusicContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=street-music&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Street music', slug: 'street-music', status: 'publish', template: 'page-wide', excerpt: 'The music Tiny Speck published for Glitch’s regions and activities, to play, with where Groddle Afternoon plays each track.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
