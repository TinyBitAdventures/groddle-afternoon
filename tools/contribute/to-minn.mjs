#!/usr/bin/env node
/**
 * Creates the Contribute page in Minn (/contribute/, template "Full-width
 * page"), which is its source from then on: the words are core blocks edited
 * in Minn Admin, and the two data sections are theme blocks drawn from
 * public/contribute/data.json (tools/contribute/build-data.mjs): the street
 * with Pot's shrine, whose Donate opens GitHub Sponsors
 * (groddle/contribute-shrine), and the open ledger, worked out on the day the
 * page is read (groddle/contribute-ledger). Austin's brief, 2026-11-03: point
 * people who loved Glitch at the ways to help (play and report, send original
 * materials, help with the costs), and keep the money in the open. Last, the
 * testers board (groddle/contribute-credits, the site's ContributeCredits):
 * "Thank you, testers", the ten players whose reports led to the most changes
 * (Austin 2026-11-03: "honor contributors ... show the top 10 contributors
 * with links to their profile pages"), scored per report with
 * tools/reports/credits.mjs.
 *
 *   MINN_USER=admin MINN_PASS=... node tools/contribute/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *   MINN_USER=admin MINN_PASS=... node tools/contribute/to-minn.mjs --add-credits [--site=...] [--dry]
 *   wp post get <id> --field=post_content | node tools/contribute/to-minn.mjs --add-credits --stdin > page.html
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 * --add-credits adds only the testers band (and its jump link) to the page as
 * it stands, so words edited in Minn Admin stay (withCredits); a page that has
 * the board already is left alone. With --stdin it reads the page's content and
 * prints the new content instead of signing in, for a site reached by WP-CLI
 * over SSH (the live site keeps no password for the script): then
 * `wp post update <id> page.html`.
 */
import { attrJson, block, Minn } from '../changelog/to-minn.mjs';
import { p, h, group } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

const GH = 'https://github.com/TinyBitAdventures';
export const SPONSORS = 'https://github.com/sponsors/austinginder';
export const EMAIL = 'hello@groddleafternoon.com';

/** The bands in page order: id and title (the jump links name them). */
export const BANDS = [
  ['about', 'What this is'],
  ['play', 'Play and report'],
  ['materials', 'Original materials'],
  ['support', 'Help with the costs'],
  ['ledger', 'What it costs and what comes in'],
  ['thanks', 'Thank you, testers'],
];

/** The words over the board, and the block (its "how points work" line is the block's own attribute). */
export const THANKS_LEAD = 'Some of the best fixes in the game started as a player’s report. These are the testers whose reports led to the most changes, scored once each report is closed.';

const data = (name, attrs) => `<!-- wp:groddle/${name}${attrs ? ' ' + attrJson(attrs) : ''} /-->`;
const band = (id, alt, inner) => {
  const title = BANDS.find(([b]) => b === id)[1];
  return group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);
};
const list = (cls, items, ordered = false) => block('list', { ...(ordered ? { ordered: true } : {}), ...(cls ? { className: cls } : {}) },
  `<${ordered ? 'ol' : 'ul'} class="wp-block-list${cls ? ` ${cls}` : ''}">${items.map((i) => block('list-item', null, `<li>${i}</li>`)).join('\n')}</${ordered ? 'ol' : 'ul'}>`);
const repo = (name, words) => `<a href="${GH}/${name}">${name}</a>: ${words}`;

/** The page's blocks: Austin's words, first person, around the shrine and the ledger. */
export function contributeContent() {
  const jump = BANDS.map(([id, title]) => `<a href="#${id}">${title}</a>`).join(' ');
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Contribute'),
      h(1, 'Help with Groddle Afternoon'),
      p('lead', 'Groddle Afternoon is a remake of Glitch, built from the art, sounds and code Tiny Speck released when the game closed. If you played Glitch and would like to help bring it back, this page is for you.'),
      p('jump', jump),
    ])]),
    band('about', false, [
      p('section-lead', 'Groddle Afternoon is free to play and open source. I have no plans to charge for it or to run ads. It is simply a fun side project for me.'),
      p('', 'All of the code is on GitHub under the MIT licence, in three repositories:'),
      list('', [
        repo('groddle-afternoon', 'the game that runs in your browser.'),
        repo('groddle-afternoon-server', 'the realtime server that lets players share a street.'),
        repo('groddle-afternoon-site', 'this website, with the accounts and saves.'),
      ]),
      p('', 'The <a href="/code/">Code</a> page shows how they fit together.'),
    ]),
    band('play', true, [
      p('section-lead', 'The most useful thing you can do is play, and tell me what you find: bugs, things that work differently from the original, and ideas. Replies come back to you in the game, and by email.'),
      list('', [
        'Sign in at <a href="/play/online/">Play online</a>. Reports need an account so I can write back. It is free.',
        'Press the bug icon at the top of the game (it says Feedback, ideas and bugs), or press R.',
        'Choose Write to us, describe what you found, and press Send.',
      ], true),
      h(3, 'What makes a good report'),
      list('', [
        'Where you were and what you were doing.',
        'What you expected to happen, and what happened instead.',
        'How to make it happen again, if you know.',
        'For an idea or a difference from the original, how it worked in Glitch, as best you remember.',
        'One thing per report, so each can be followed up on its own.',
      ]),
      p('', 'A picture of the game is attached for you, along with the street, where you were standing, the game’s version and your browser, so you do not need to note those. Chat and mail are blanked out of the picture, and you can untick it before sending.'),
      p('', 'You can also play solo at <a href="/play/">Play</a> without an account, but solo has no reports: sign in to send one. Issues on <a href="' + GH + '/groddle-afternoon/issues">GitHub</a> are welcome too.'),
    ]),
    band('materials', false, [
      p('section-lead', 'A lot of Glitch was never saved anywhere public. If you kept anything from the game, it could help fill a gap. These help most:'),
      list('', [
        'Files from the Glitch years: anything saved from the game, its client or its website.',
        'Sounds and music, and recordings of the game being played.',
        'Art: sprites, backgrounds, icons, concept art.',
        'Videos and screenshots of streets, quests, menus and events.',
        'Notes, guides, forum posts and wiki pages.',
        'What you remember about how something worked, even roughly.',
      ]),
      p('', `Email <a href="mailto:${EMAIL}">${EMAIL}</a> with what you have, or a link to it if the files are large.`),
      p('', 'Only Tiny Speck’s own art, which they released into the public domain (CC0), and the game’s original recordings go into the game itself. Everything else, such as screenshots, videos and notes, I use as reference when rebuilding things.'),
    ]),
    band('support', true, [
      p('section-lead', 'The game costs a little to run each month: the domain, the web hosting, the server players share streets on, and AI tokens. If you would like to chip in, you can through GitHub Sponsors. It is entirely optional, and the game stays free either way.'),
      data('contribute-shrine'),
      p('', `Or go straight to <a href="${SPONSORS}">GitHub Sponsors</a>.`),
    ]),
    band('ledger', false, [
      p('section-lead', 'An open ledger of what Groddle Afternoon costs and what comes in, all time, starting 1 November 2026.'),
      data('contribute-ledger'),
    ]),
    thanksBand(),
    group('div', 'wrap report-foot', null, [
      p('', 'The street and Pot’s shrine are Tiny Speck’s own art from Glitch (CC0), as the game draws them.'),
    ]),
  ].join('\n\n');
}

/** The testers band (an alternate band, after the ledger). */
export function thanksBand() {
  return band('thanks', true, [p('section-lead', THANKS_LEAD), data('contribute-credits')]);
}

/**
 * The page's content with the testers band added after the ledger band (or
 * before the footnote, or at the end) and its link added to the jump line,
 * leaving every other word as it was. Content that has the board already comes
 * back unchanged.
 */
export function withCredits(content) {
  if (content.includes('<!-- wp:groddle/contribute-credits')) return content;
  const bandText = thanksBand();
  let out;
  const ledger = content.indexOf('<!-- wp:groddle/contribute-ledger');
  const close = '</section>\n<!-- /wp:group -->';
  const end = ledger < 0 ? -1 : content.indexOf(close, ledger);
  if (end >= 0) {
    const at = end + close.length;
    out = `${content.slice(0, at)}\n\n${bandText}${content.slice(at)}`;
  } else {
    const foot = content.indexOf('<!-- wp:group {"className":"wrap report-foot"}');
    out = foot >= 0 ? `${content.slice(0, foot)}${bandText}\n\n${content.slice(foot)}` : `${content}\n\n${bandText}`;
  }
  const [id, title] = BANDS.at(-1);
  return out.replace(/(<p class="jump">)([\s\S]*?)(<\/p>)/, (m, a, links, b) => (links.includes(`href="#${id}"`) ? m : `${a}${links} <a href="#${id}">${title}</a>${b}`));
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function addCredits() {
  if (args.stdin) {
    process.stdout.write(withCredits(await readStdin()));
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=contribute&status=publish,draft,private,pending&context=edit');
  if (!found[0]) throw new Error('no Contribute page yet: run this without --add-credits first');
  const before = found[0].content.raw;
  const after = withCredits(before);
  if (after === before) {
    console.log(`page ${found[0].id} has the testers board already; left alone`);
    return;
  }
  if (args.dry) {
    console.log(after);
    return;
  }
  const saved = await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, { content: after });
  console.log(`added the testers board to page ${saved.id} at ${saved.link}`);
}

async function main() {
  if (args['add-credits']) return addCredits();
  const content = contributeContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=contribute&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Contribute', slug: 'contribute', status: 'publish', template: 'page-wide', excerpt: 'How to help Groddle Afternoon, the free and open-source Glitch remake: play and report, send original materials, or help with the running costs, with an open ledger.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
