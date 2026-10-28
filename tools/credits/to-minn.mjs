#!/usr/bin/env node
/**
 * Creates the Credits page in Minn (/credits/, template "Full-width page"),
 * which is its source from then on: the words are core blocks edited in Minn
 * Admin. It holds the licence and credit wording once, so the site footer,
 * the home page, the start card and the generated pages carry one short line
 * that links here (Austin 2026-10-28: "the license warnings ... are too much").
 *
 *   MINN_USER=admin MINN_PASS=... node tools/credits/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 */
import { Minn } from '../changelog/to-minn.mjs';
import { p, h, group } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

/** The one line every footer carries, linking this page. */
export const CREDIT_LINE = 'A <a href="https://tinybitadventures.com">fan remake</a> of Tiny Speck’s Glitch';

/** The page's sections: heading, then its paragraphs. */
export const SECTIONS = [
  ['Art and code', [
    'When Glitch closed, Tiny Speck released its art and code into the public domain (CC0) at <a href="https://github.com/tinyspeck">github.com/tinyspeck</a>. Every picture in the game comes from that release or is drawn fresh from it.',
    'Item names, descriptions and the game’s dialogue are Tiny Speck’s own words, from the game’s code.',
  ]],
  ['Sounds', [
    'The sounds are Tiny Speck’s original recordings, shipped as the originals: from the Glitch audio sets on archive.org (most tagged CC0, one untagged) and from Glitch’s own servers through the Wayback Machine.',
    'Sounds that were never recovered play short tones the game makes itself.',
  ]],
  ['The Glitch name', [
    'The Glitch name and logo belong to Tiny Speck and were never part of their release. Groddle Afternoon uses no Glitch logo, and it is not made by or affiliated with Tiny Speck or Slack.',
  ]],
  ['This project', [
    'Groddle Afternoon’s own code, the realtime server, this site and the Groddle mark are MIT licensed. The <a href="/code/">Code</a> page has the three repos.',
    'Screenshots are from the remake itself. Recordings of the original game were watched for reference and never ship in the game.',
  ]],
];

/** The page's blocks. */
export function creditsContent() {
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Credits'),
      h(1, 'Credits'),
      p('lead', 'Groddle Afternoon is a fan remake of Glitch, the game Tiny Speck ran from 2011 to 2012. This is where each part of it comes from.'),
    ])]),
    group('section', 'band', 'credits', [group('div', 'wrap', null, SECTIONS.flatMap(([title, lines]) => [
      h(2, title),
      ...lines.map((line) => p('', line)),
    ]))]),
  ].join('\n\n');
}

async function main() {
  const content = creditsContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=credits&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Credits', slug: 'credits', status: 'publish', template: 'page-wide', excerpt: 'Where Groddle Afternoon’s art, sounds, words and code come from, and their licences.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
