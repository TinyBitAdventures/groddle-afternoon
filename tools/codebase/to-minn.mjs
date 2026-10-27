#!/usr/bin/env node
/**
 * Creates the Code page in Minn (/code/, template "Full-width page"), which is
 * its source from then on: the words are core blocks edited in Minn Admin, and
 * every figure is a groddle/codebase block drawn from public/codebase/data.json
 * (tools/codebase/build-data.mjs), measured from git at the live release.
 *
 *   MINN_USER=admin MINN_PASS=... node tools/codebase/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 */
import { attrJson, block, Minn } from '../changelog/to-minn.mjs';
import { p, h, group } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

const GH = 'https://github.com/TinyBitAdventures';
const data = (repo) => `<!-- wp:groddle/codebase ${attrJson({ repo })} /-->`;
const band = (id, alt, title, inner) => group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);
/** A repo's section as a fabric patch sewn onto the page (the .cb-patch styles in the site's style.css). */
const patch = (id, alt, title, inner) => group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [group('div', `cb-patch cb-patch-${id}`, null, [h(2, title, { id: `${id}-h` }), ...inner])])]);
/** A checkpoint on the seam that runs down the page: one link of Glitch's textile chain, drawn with its Tiny Speck icon by the .cb-knot styles. */
const knot = (item, name, words) => group('div', `cb-knot cb-knot-${item}`, null, [p('', `<strong>${name}</strong> ${words}`)]);
/** A Tiny Speck badge from the game's own badge art (public/assets/badges). */
const badge = (file, alt) => block('image', { width: '72px', height: '72px', className: 'cb-badge' },
  `<figure class="wp-block-image is-resized cb-badge"><img src="/assets/badges/${file}.png" alt="${alt}" width="72" height="72" style="width:72px;height:72px"/></figure>`);
const list = (cls, items, ordered = false) => block('list', { ...(ordered ? { ordered: true } : {}), ...(cls ? { className: cls } : {}) },
  `<${ordered ? 'ol' : 'ul'} class="wp-block-list${cls ? ` ${cls}` : ''}">${items.map((i) => block('list-item', null, `<li>${i}</li>`)).join('\n')}</${ordered ? 'ol' : 'ul'}>`);
/** A repo's contributing badge: a small sewn-on patch in its section's tone, with a Tiny Speck icon and its two GitHub doors (the .cb-rbadge styles). */
const repoBadge = (id, name, repo) => group('div', `cb-rbadge cb-rbadge-${id}`, null, [
  p('cb-rbadge-name', `<strong>${name}</strong> <span>${repo}</span>`),
  p('cb-rbadge-links', `<a href="${GH}/${repo}/issues">Issues</a> <a href="${GH}/${repo}/pulls">Pull requests</a>`),
]);
const links = (repo) => p('cb-links', `On GitHub: <a href="${GH}/${repo}">the code</a> · <a href="${GH}/${repo}/issues">issues</a> · <a href="${GH}/${repo}/pulls">pull requests</a>`);

/** The page's blocks: our words around the measured figures. */
export function codebaseContent() {
  const jump = [['#game', 'The game'], ['#server', 'The realtime server'], ['#site', 'The site'], ['#platform', 'What it runs on'], ['#art', 'Art, sound and data'], ['#contribute', 'Contributing']]
    .map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Code'),
      h(1, 'How Groddle Afternoon is built'),
      p('lead', 'Groddle Afternoon is open source, in three repositories on GitHub: the game that runs in your browser, the server that lets players share a street, and the website that keeps accounts and saves. The site runs on Minn Engine, and the art, sound and game data come from Tiny Speck’s public-domain release of Glitch. Every figure on this page is measured from git at the release the live site runs.'),
      data('overview'),
      p('jump', jump),
    ])]),
    knot('fiber', 'Fiber', 'The scraps we started from: Tiny Speck’s code and art files, pages the Wayback Machine kept, and what players recorded.'),
    patch('game', false, 'The game', [
      p('section-lead', '<a href="' + GH + '/groddle-afternoon">groddle-afternoon</a> is the whole game: streets and physics, skills, quests, crafting, gardens, homes, and the multiplayer client. It is plain JavaScript in ES modules, drawn with PixiJS, with no framework and no build step for the game itself: the files in <code>public/</code> are what your browser loads. Most rules are ported from Tiny Speck’s GameServerJS, and the scripts in <code>tools/</code> turn Tiny Speck’s item, street and art files into the data and sprites the game reads. The tests run on Node’s own test runner, and many of them check the game against Tiny Speck’s files directly.'),
      links('groddle-afternoon'),
      data('game'),
    ]),
    knot('spindle', 'Spindle', 'The build tools, which spin those scraps into the data and sprites the game reads.'),
    patch('server', true, 'The realtime server', [
      p('section-lead', '<a href="' + GH + '/groddle-afternoon-server">groddle-afternoon-server</a> is the multiplayer side: one Go program that keeps who is where, chat, parties and groups, and the parts of the world players share, such as quoins, rocks, races, Rook attacks and trades. Players connect over a WebSocket (coder/websocket), and each shared system is a module of its own that registers with one hub. It saves its state to files when it stops; on the live server it runs under systemd behind Caddy. Its world data is written by the game’s build tools, so both sides read the same numbers.'),
      links('groddle-afternoon-server'),
      data('server'),
    ]),
    knot('thread', 'Thread', 'The modules: one strand for each system, from gardens to trades.'),
    patch('site', false, 'The site', [
      p('section-lead', '<a href="' + GH + '/groddle-afternoon-site">groddle-afternoon-site</a> is groddleafternoon.com: a theme and extension for Minn, in PHP. The theme draws the pages and Notes in the site’s look. The extension serves the built game beside them, adds the page blocks (each a <code>block.json</code> drawn in PHP, like the figures on this page) and answers the game’s <code>groddle/v1</code> routes: sign-up and sign-in, saves, buddies, groups, profiles, homes, and the shared ledger of currants and items. It uses only Minn’s own classes, no WordPress functions. Its tests live in the game repo and run when the two are checked out side by side.'),
      links('groddle-afternoon-site'),
      data('site'),
    ]),
    knot('loomer', 'Loomer', 'The tests, which weave the strands together and hold them to the original.'),
    band('platform', true, 'What it runs on', [
      p('section-lead', '<a href="https://github.com/austinginder/minn-engine">Minn Engine</a> is a from-scratch PHP engine, MIT licensed, that speaks WordPress’s contracts (its database tables, REST API, sign-in and roles), so the site can be hosted and run like a WordPress site without being one. <a href="https://github.com/austinginder/minn-admin">Minn Admin</a> is the admin it comes with, where the words on this page are edited. Both are separate projects with repositories of their own.'),
      data('platform'),
    ]),
    band('art', false, 'Where the art, sound and data come from', [
      p('section-lead', 'When Glitch closed, Tiny Speck released its art, sound and code into the public domain (CC0) at <a href="https://github.com/tinyspeck">github.com/tinyspeck</a>: the items, locations, avatars and overlays, the Flash client, and the GameServerJS code that ran the game. Groddle Afternoon is built from those files, and where nothing survived, rebuilt from what players recorded. The Glitch name and logo were not part of that release, so they are not used here.'),
    ]),
    knot('general_fabric', 'Fabric', 'The finished cloth: the game you play at <a href="https://groddleafternoon.com">groddleafternoon.com</a>.'),
    band('contribute', true, 'Contributing', [
      group('div', 'cb-invite', null, [
        p('section-lead', 'Issues and pull requests are welcome on all three repos. A bug you hit while playing, a rule that does not match the original, an item that is missing: open an issue, or send the fix.'),
        group('div', 'cb-nod', null, [
          group('div', 'cb-nod-badges', null, [badge('string_practicioner', 'String Practitioner badge'), badge('threader_of_renown', 'Threader of Renown badge')]),
          p('cb-nod-note', 'A nod to everyone who sends a pull request: <strong>String Practitioner</strong> and <strong>Threader of Renown</strong>, two of Tiny Speck’s badges. In Glitch you earned them by spinning fiber straight into string and by threading five bead necklaces. Nothing grants them for a pull request: they are only our thanks.'),
        ]),
      ]),
      group('div', 'cb-rbadges', null, [
        repoBadge('game', 'The game', 'groddle-afternoon'),
        repoBadge('server', 'The realtime server', 'groddle-afternoon-server'),
        repoBadge('site', 'The site', 'groddle-afternoon-site'),
      ]),
      h(3, 'Run it locally'),
      list('code-steps', [
        'Clone the three repos side by side: <code>groddle-afternoon</code>, <code>groddle-afternoon-server</code> and <code>groddle-afternoon-site</code>.',
        'Play solo: in <code>groddle-afternoon</code>, run <code>node tools/serve-static.mjs public 8080</code> and open <code>http://127.0.0.1:8080/play/</code>.',
        'Test the game: <code>npm install</code>, then <code>npm test</code> (Node 22 or newer). For the full suite, clone Tiny Speck’s glitch-GameServerJS, glitch-client, glitch-items, glitch-overlays and glitch-locations beside it; a test that needs a missing checkout skips and says what to clone.',
        'Test the server: <code>go test ./...</code> in <code>groddle-afternoon-server</code>.',
        'Run the site: it needs a Minn site. <a href="https://cove.run">Cove</a> runs one locally; the site’s readme has the steps.',
      ], true),
      h(3, 'Licences'),
      p('', 'The code in all three repos is MIT. Tiny Speck’s art, sound and game data are CC0. The Glitch name and logo are not ours to use, and never ship.'),
      h(3, 'House rules'),
      list('code-rules', [
        'Commit subjects use Emoji-Log: <code>📦 NEW:</code>, <code>👌 IMPROVE:</code>, <code>🐛 FIX:</code>, <code>📖 DOC:</code> or <code>🤖 TEST:</code>, then the change in plain words, such as <code>📦 NEW: Peat bogs and dirt piles to dig</code>.',
        'Every change comes with a test, and <code>npm test</code> stays green.',
        'Solo play does not change for multiplayer work: multiplayer sits beside the solo game, never inside it.',
        'Rules cite their source: the GameServerJS file and line a number or a line of dialogue came from.',
        'Page copy is in our own words; item and game text come from Tiny Speck’s files.',
      ]),
    ]),
    group('div', 'wrap report-foot', null, [
      p('', 'What counts as code: files in JavaScript, Go, PHP, Python, Shell, CSS and HTML that people write, every line counted, blank ones too. Art and sound, JSON data, vendored libraries, docs, and files a tool writes (their header says so, and the built item and notes pages) are listed under each repo but not counted. Tests are the <code>it()</code> and <code>test()</code> cases in the game’s tests and the <code>Test</code> functions in the server’s.'),
    ]),
  ].join('\n\n');
}

async function main() {
  const content = codebaseContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=code&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Code', slug: 'code', status: 'publish', template: 'page-wide', excerpt: 'The three open-source repos behind Groddle Afternoon, the tech each uses, and their code measured from git, with how to contribute.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
