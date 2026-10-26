#!/usr/bin/env node
/**
 * Moves the restoration report into Minn, which is its source from then on:
 * the /restoration/ page becomes a Minn page (template "Full-width page") made
 * of blocks, so its words are edited in Minn Admin. Headings, intros and notes
 * are core blocks; each data section is one of the theme's restoration blocks
 * (groddle-afternoon-site/src/Restoration.php), drawn from data.json, so the figures
 * still come from build-restoration.mjs. A published page at a folder's path
 * wins over the built index.html (groddle-afternoon-site/src/StaticPages.php).
 *
 *   MINN_USER=admin MINN_PASS=... node tools/restoration/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 */
import { attrJson, block, Minn } from '../changelog/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

export const p = (cls, words) => block('paragraph', cls ? { className: cls } : null, `<p${cls ? ` class="${cls}"` : ''}>${words}</p>`);
export const h = (level, words, { id, cls } = {}) => block('heading', { ...(level === 2 ? {} : { level }), ...(id ? { anchor: id } : {}), ...(cls ? { className: cls } : {}) }, `<h${level} class="wp-block-heading${cls ? ` ${cls}` : ''}"${id ? ` id="${id}"` : ''}>${words}</h${level}>`);
export const group = (tag, cls, id, inner) => block('group', { ...(tag === 'div' ? {} : { tagName: tag }), ...(id ? { anchor: id } : {}), ...(cls ? { className: cls } : {}) }, `<${tag} class="wp-block-group${cls ? ` ${cls}` : ''}"${id ? ` id="${id}"` : ''}>${inner.join('\n\n')}</${tag}>`);
const data = (name, attrs) => `<!-- wp:groddle/restoration-${name}${attrs ? ' ' + attrJson(attrs) : ''} /-->`;
const band = (id, alt, title, inner) => group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);

/** The page's blocks: the built page's words, around its data sections. */
export function restorationContent() {
  const jump = [
    ['#street', 'Walk a street'], ['#systems', 'Every system'], ['#numbers', 'By the numbers'], ['#rooms', 'Quest rooms'],
    ['#designers', 'Designers’ levels'], ['#recent', 'Recently restored'], ['#honest', 'What can’t come back'], ['/compare/', 'Other remakes compared'],
  ].map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Restoration report'),
      h(1, 'How much of Glitch is back?'),
      p('lead', 'Glitch closed in December 2012. Tiny Speck released its art, music and server code into the public domain, and almost everything else was lost: the maps of private quest rooms, most of the sound library, the multiplayer world itself. Groddle Afternoon is a fresh web build that puts the pieces back together, rule by rule from the original code, and room by room from players’ recordings where nothing else survives.'),
      data('score'),
      p('jump', jump),
    ])]),
    band('street', false, 'Walk a street', [
      p('section-lead', 'A simplified Hechey Track, drawn with the game’s own sprites. Click anything you’d find on a street in Ur to see what’s been restored behind it.'),
      data('street'),
    ]),
    band('systems', true, 'Every system, checked off', [
      p('section-lead', 'The whole game, system by system. This list lives in the code and is rebuilt with every session, so it ticks over as things land.'),
      data('systems'),
    ]),
    band('numbers', false, 'By the numbers', [
      p('section-lead', 'Counted straight from the repository: nothing here is typed in by hand.'),
      data('numbers'),
    ]),
    band('rooms', true, 'Quest rooms, rebuilt', [
      p('section-lead', 'Many of Glitch’s best quests happened in private rooms built just for you. Only a handful survive in the archive, so most are reconstructed from the quest’s code (its timers, flags, dialogue and rewards) and recordings players and Tiny Speck’s own level designer left behind. Pick a room to read its story.'),
      data('rooms'),
    ]),
    band('designers', false, 'Play the designers’ levels', [
      p('section-lead', 'Two of Tiny Speck’s own level designers recorded the levels they built: Ian Passmore in 2015, and Lisa Trac as LT_IndieGameDev in 2012. Tiny Speck never released these levels’ layouts, so each one here is rebuilt from the quest code, Tiny Speck’s art and those recordings. Open the rebuild and the recording side by side.'),
      p('practice-note', 'Every <strong>Play</strong> link on this page opens a practice copy in its own tab: it starts fresh and never touches your saved game.'),
      data('designers'),
      h(3, 'Rebuilt from words alone', { cls: 'levels-h' }),
      p('section-lead', 'No recording of these is known, so they come from the upgrade cards, item text and players’ forum posts.'),
      data('levels'),
    ]),
    band('recent', true, 'Recently restored', [
      p('section-lead', 'The latest additions and fixes, straight from the project’s history.'),
      data('recent'),
      p('recent-more', '<a href="/restoration/history/">See every change, day by day</a> · <a href="/changelog/">Build notes</a> for the nights before that'),
    ]),
    band('honest', false, 'What can’t come back, and how the rest was made', [
      group('div', 'honest', null, [
        group('div', '', null, [
          h(3, 'Gone for good'),
          data('lost'),
          p('note', 'Things that only made sense with other players are adapted for one where it works (races against rival Glitches, Feats with companions, street projects with a hired hand) and left out where it doesn’t.'),
        ]),
        group('div', '', null, [h(3, 'How to read the tags'), data('legend')]),
      ]),
    ]),
    group('div', 'wrap report-foot', null, [
      data('stamp'),
      p('', 'Screenshots are from the remake itself; recordings were used only as reference.'),
    ]),
  ].join('\n\n');
}

async function main() {
  const content = restorationContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const found = await minn.rest('GET', '/wp/v2/pages?slug=restoration&status=publish,draft,private,pending&context=edit');
  if (found[0] && !args.force) {
    console.log(`page ${found[0].id} is already there; left alone (--force overwrites it)`);
    return;
  }
  const body = { title: 'Restoration', slug: 'restoration', status: 'publish', template: 'page-wide', excerpt: 'How much of Tiny Speck’s Glitch has the Groddle Afternoon remake brought back? A walk through every system, checked off as it lands.', content };
  const saved = found[0] ? await minn.rest('POST', `/wp/v2/pages/${found[0].id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
  console.log(`${found[0] ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
