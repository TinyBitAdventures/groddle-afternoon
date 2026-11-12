#!/usr/bin/env node
/**
 * Creates the Known gaps page in Minn (/restoration/gaps/, a child of the
 * restoration report, template "Full-width page"), which is its source from
 * then on: the words are core blocks edited in Minn Admin, and the list is the
 * groddle/restoration-gaps block drawn from public/restoration/gaps.json
 * (tools/gaps/build-data.mjs).
 *
 *   MINN_USER=admin MINN_PASS=... node tools/gaps/to-minn.mjs [--site=https://groddle.localhost] [--dry] [--force] [--link]
 *
 * Creates the page once. If it is already there it is left alone, since it may
 * have been edited since; --force overwrites it with the words below.
 * --link also adds one paragraph linking here to the restoration page, under
 * its Gone for good list (after the restoration-lost block), and nothing else:
 * the page's own words are kept as they are, and a page that already links
 * here is left alone.
 */
import { attrJson, Minn } from '../changelog/to-minn.mjs';
import { group, h, p } from '../restoration/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');

export const PATH = '/restoration/gaps/';
const data = (part) => `<!-- wp:groddle/restoration-gaps ${attrJson({ part })} /-->`;
const band = (id, alt, title, inner) => group('section', `band${alt ? ' band-alt' : ''}`, id, [group('div', 'wrap', null, [h(2, title, { id: `${id}-h` }), ...inner])]);

/** The paragraph --link adds to the restoration page (restorationContent carries it too). */
export const LINK = p('gaps-link', `What is still missing or not right yet, and what is being fixed now: <a href="${PATH}">Known gaps</a>.`);

/** Puts LINK under the restoration page's Gone for good list; null when the page already links here or has no such list. */
export function withLink(content) {
  const anchor = '<!-- wp:groddle/restoration-lost /-->';
  if (content.includes(`href="${PATH}"`) || !content.includes(anchor)) return null;
  return content.replace(anchor, `${anchor}\n\n${LINK}`);
}

/** The page's blocks: our words around the list drawn from gaps.json. */
export function gapsContent() {
  return [
    group('header', 'masthead', null, [group('div', 'wrap', null, [
      p('kicker', 'Groddle Field Notes · Restoration report'),
      h(1, 'Known gaps'),
      p('lead', 'What we know is still missing from Groddle Afternoon, or does not work the way it did in Glitch, and what is being fixed right now. Some gaps can never close, because nothing of the original survived. Others are differences we chose on purpose, and those are listed too, with why.'),
      data('summary'),
      p('jump', '<a href="#list">The list</a> <a href="#purpose">On purpose</a> <a href="#ideas">Never built in Glitch</a> <a href="/restoration/">The restoration report</a>'),
    ])]),
    band('list', false, 'The list', [
      p('section-lead', 'Gaps grouped by where you meet them in the game, each with where it stands. A fix shows the release it came out in. The list is updated with every release.'),
      data('list'),
    ]),
    band('purpose', true, 'On purpose', [
      p('section-lead', 'Places where Groddle Afternoon plays differently from Glitch because we chose it, with what Glitch did instead.'),
      data('purpose'),
    ]),
    band('ideas', false, 'Never built in Glitch', [
      p('section-lead', 'Things Tiny Speck planned, drew or half wrote that never reached players before Glitch closed. They are not gaps in the remake, but they may come one day.'),
      data('ideas'),
    ]),
    band('report', true, 'Found something missing?', [
      p('section-lead', 'If something you remember from Glitch is not here, or something does not work, tell us. In the game, use <strong>Report a bug</strong> (or press R): you can add a picture, and you will see our reply in the game. Or post on the <a href="/chat/bugs/">Bugs board</a>, where other players can see it and add what they know.'),
    ]),
    group('div', 'wrap report-foot', null, [
      p('', 'This list is a public part of the project’s own working list. It is written in plain words and leaves out who reported what.'),
    ]),
  ].join('\n\n');
}

async function main() {
  const content = gapsContent();
  if (args.dry) {
    console.log(content);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  const parent = (await minn.rest('GET', '/wp/v2/pages?slug=restoration&status=publish,draft,private,pending&context=edit'))[0];
  if (!parent) throw new Error('no restoration page to put this under (tools/restoration/to-minn.mjs makes it)');
  const found = (await minn.rest('GET', `/wp/v2/pages?slug=gaps&parent=${parent.id}&status=publish,draft,private,pending&context=edit`))[0];
  if (found && !args.force) console.log(`page ${found.id} is already there; left alone (--force overwrites it)`);
  else {
    const body = { title: 'Known gaps', slug: 'gaps', parent: parent.id, status: 'publish', template: 'page-wide', excerpt: 'What is still missing from Groddle Afternoon or works differently from Glitch, what is being fixed, and what Tiny Speck never built.', content };
    const saved = found ? await minn.rest('POST', `/wp/v2/pages/${found.id}`, body) : await minn.rest('POST', '/wp/v2/pages', body);
    console.log(`${found ? 'overwrote' : 'created'} page ${saved.id} at ${saved.link}`);
  }
  if (args.link) {
    const linked = withLink(parent.content.raw);
    if (linked === null) console.log(`restoration page ${parent.id} already links here (or has no Gone for good list); left alone`);
    else {
      await minn.rest('POST', `/wp/v2/pages/${parent.id}`, { content: linked });
      console.log(`restoration page ${parent.id}: added the Known gaps link under Gone for good`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
