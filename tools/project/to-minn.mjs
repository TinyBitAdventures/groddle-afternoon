#!/usr/bin/env node
/**
 * Creates the Project page in Minn (/project/, template "Full-width page"),
 * which is its source from then on: the words are core blocks edited in Minn
 * Admin. It gathers the restoration story the header's Project link stands
 * for (Austin 2026-10-28, register G338): one card each for Restoration,
 * Compare, Notes and Code, with a line on what is there. Each card wears a
 * Tiny Speck icon (CC0, the game's public/assets/sprites/icons) through the
 * .pj-card styles in the site's style.css.
 *
 *   MINN_USER=admin MINN_PASS=... node tools/project/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 */
import { Minn } from '../changelog/to-minn.mjs';
import { p, h, group } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

/** The cards: id, title, where it leads, one line, and the Tiny Speck icon its style shows. */
export const CARDS = [
  { id: 'restoration', title: 'Restoration', href: '/restoration/', icon: 'tinkertool', words: 'How much of the original game is back, measured street by street and system by system.' },
  { id: 'compare', title: 'Compare', href: '/compare/', icon: 'artifact_mirror_with_scribbles', words: 'Groddle Afternoon beside the other Glitch remakes: what each one plays like, and where each fact comes from.' },
  { id: 'notes', title: 'Notes', href: '/changelog/', icon: 'quill', words: 'What changed in the game, written up as each piece landed.' },
  { id: 'code', title: 'Code', href: '/code/', icon: 'loomer', words: 'The three open-source repos behind the game, the realtime server and the site, and how to help.' },
];

/** One card: its title links the page (the whole card is the link's target), then its line. */
const card = ({ id, title, href, words }) => group('div', `pj-card pj-card-${id}`, null, [
  h(2, `<a href="${href}">${title}</a>`, { cls: 'pj-card-title' }),
  p('pj-card-line', words),
]);

/** The page's blocks. */
export function projectContent() {
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Project'),
      h(1, 'The project'),
      p('lead', 'Groddle Afternoon brings back Glitch, Tiny Speck’s game, from the art, sounds and code they left behind. These pages follow how that is going.'),
    ])]),
    group('section', 'band pj-band', 'pages', [group('div', 'wrap', null, [
      group('div', 'pj-cards', null, CARDS.map(card)),
    ])]),
  ].join('\n\n');
}

async function main() {
  const content = projectContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=project&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Project', slug: 'project', status: 'publish', template: 'page-wide', excerpt: 'The restoration report, the remakes compared, the Notes and the code behind Groddle Afternoon, in one place.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
