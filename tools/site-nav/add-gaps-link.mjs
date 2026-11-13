#!/usr/bin/env node
/**
 * Puts the Known gaps page (/restoration/gaps/) in the header menu (Austin 2026-11-12): in the Project
 * submenu, the Restoration link becomes a submenu of its own (still the link to /restoration/) holding
 * History and a new Known gaps link, which the site draws as a third level indented under Restoration
 * (SiteNav::panel, tools/site-nav/apply.mjs). Compare, Notes, Code and Contribute stay where they are.
 *
 * It changes only those blocks, keeping every other byte of the menu, and it is idempotent: a menu that
 * already has the change is left alone, and one where Restoration already holds History gains only the
 * Known gaps link. Any other shape (no Project submenu, no Restoration link followed by History, a gaps
 * link somewhere else) is refused and nothing is written.
 *
 *   node tools/site-nav/add-gaps-link.mjs --menu=<file>                         print the changed markup
 *   node tools/site-nav/add-gaps-link.mjs --site=<webroot> [--write]            the local site, through WP-CLI
 *   node tools/site-nav/add-gaps-link.mjs --live [--write]                      groddleafternoon.com over SSH
 *
 * --site and --live read the newest published wp_navigation post (as SiteNav::links does) and only show
 * the change unless --write is given; after writing they read the post back and check it.
 * --live takes the SSH address as tools/deploy/kinsta.sh does (GRODDLE_KINSTA_SSH and
 * GRODDLE_KINSTA_PORT, from the environment or ~/.config/groddle/deploy.env).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const GAPS = { label: 'Known gaps', url: '/restoration/gaps/' };

/** Every block comment in the markup with its offsets, nested: { name, attrs, start, end, inner } (end past the closer). */
function blocks(markup) {
  const top = { inner: [] };
  const stack = [top];
  for (const m of markup.matchAll(/<!--\s+(\/)?wp:([a-z0-9/-]+)(?:\s+(\{[\s\S]*?\}))?\s+(\/)?-->/g)) {
    const [text, closing, rawName, json, selfClosing] = m;
    if (closing) {
      if (stack.length > 1) stack.pop().end = m.index + text.length;
      continue;
    }
    let attrs = {};
    try { attrs = json ? JSON.parse(json) : {}; } catch { attrs = { unreadable: true }; }
    const node = { name: rawName.includes('/') ? rawName : `core/${rawName}`, json: json || '', attrs, start: m.index, end: m.index + text.length, openEnd: m.index + text.length, inner: [] };
    stack.at(-1).inner.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length > 1) throw new Error('the menu has a block that is never closed');
  return top.inner;
}

const LINK = 'core/navigation-link';
const SUBMENU = 'core/navigation-submenu';
const is = (node, name, label, url) => node && node.name === name && node.attrs.label === label && (url === undefined || node.attrs.url === url);
const isRestoration = (node, name) => is(node, name, 'Restoration', '/restoration/');
const isHistory = (node) => is(node, LINK, 'History', '/restoration/history/');
const isGaps = (node) => is(node, LINK, GAPS.label, GAPS.url);
const gapsLine = () => `<!-- wp:navigation-link ${JSON.stringify({ label: GAPS.label, url: GAPS.url, kind: 'custom' })} /-->`;

/**
 * The menu with the change made: { markup, changed, note }. Throws (writing nothing) when the menu is
 * not the shape the change expects.
 */
export function addGapsLink(markup) {
  markup = String(markup);
  const all = blocks(markup);
  const walk = (list) => list.flatMap((n) => [n, ...walk(n.inner)]);
  const gapsLinks = walk(all).filter((n) => (n.name === LINK || n.name === SUBMENU) && String(n.attrs.url || '').replace(/\/?$/, '/') === GAPS.url);
  const projects = all.filter((n) => is(n, SUBMENU, 'Project'));
  if (projects.length !== 1) throw new Error(`expected one top-level Project submenu, found ${projects.length}`);
  const project = projects[0];
  const kids = project.inner;
  const at = kids.findIndex((n) => isRestoration(n, LINK) || isRestoration(n, SUBMENU));
  if (at < 0) throw new Error('the Project submenu has no Restoration link to /restoration/');
  const restoration = kids[at];
  if (restoration.name === SUBMENU) {
    const inner = restoration.inner;
    if (inner.length === 2 && isHistory(inner[0]) && isGaps(inner[1]) && gapsLinks.length === 1) {
      return { markup, changed: false, note: 'the menu already has Known gaps under Restoration' };
    }
    if (inner.length === 1 && isHistory(inner[0]) && gapsLinks.length === 0) {
      const history = inner[0];
      return {
        markup: markup.slice(0, history.end) + '\n\n' + gapsLine() + markup.slice(history.end),
        changed: true, note: 'added Known gaps after History under Restoration',
      };
    }
    throw new Error('Restoration is already a submenu, but not of History (and Known gaps): change it in Minn Admin');
  }
  if (gapsLinks.length) throw new Error('the menu already links to /restoration/gaps/ somewhere else: change it in Minn Admin');
  const history = kids[at + 1];
  if (!isHistory(history)) throw new Error('the Restoration link is not followed by the History link (/restoration/history/)');
  const between = markup.slice(restoration.end, history.start);
  if (between.trim() !== '') throw new Error('something sits between the Restoration and History links');
  const historyText = markup.slice(history.start, history.end);
  const submenu = `<!-- wp:navigation-submenu ${restoration.json} -->\n${historyText}\n\n${gapsLine()}\n<!-- /wp:navigation-submenu -->`;
  return {
    markup: markup.slice(0, restoration.start) + submenu + markup.slice(history.end),
    changed: true, note: 'Restoration is now a submenu holding History and Known gaps',
  };
}

function deployEnv() {
  const env = { ...process.env };
  const file = join(homedir(), '.config/groddle/deploy.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?(GRODDLE_KINSTA_SSH|GRODDLE_KINSTA_PORT)=["']?([^"'\s]*)["']?\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  if (!env.GRODDLE_KINSTA_SSH || !env.GRODDLE_KINSTA_PORT) throw new Error('set GRODDLE_KINSTA_SSH and GRODDLE_KINSTA_PORT (or put them in ~/.config/groddle/deploy.env)');
  return env;
}

/** A WP-CLI runner for the local site or the live one: wp(args, stdin) returns stdout. */
function runner(args) {
  if (args.site) return (wpArgs, input) => execFileSync('wp', [`--path=${args.site}`, ...wpArgs], { encoding: 'utf8', input });
  const env = deployEnv();
  const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return (wpArgs, input) => execFileSync('ssh', ['-p', env.GRODDLE_KINSTA_PORT, '-o', 'BatchMode=yes', env.GRODDLE_KINSTA_SSH,
    `cd ~/public && wp ${wpArgs.map(quote).join(' ')}`], { encoding: 'utf8', input });
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, ...v]) => [k, v.join('=') || true]));
  if (args.menu) {
    const out = addGapsLink(readFileSync(args.menu, 'utf8'));
    console.error(out.note);
    process.stdout.write(out.markup);
    return;
  }
  if (!args.site && !args.live) {
    console.error('usage: add-gaps-link.mjs (--menu=<file> | --site=<webroot> | --live) [--write]');
    process.exit(2);
  }
  const wp = runner(args);
  const menus = JSON.parse(wp(['post', 'list', '--post_type=wp_navigation', '--post_status=publish', '--fields=ID,post_date', '--format=json']) || '[]');
  menus.sort((a, b) => (a.post_date === b.post_date ? Number(b.ID) - Number(a.ID) : (a.post_date < b.post_date ? 1 : -1)));
  if (!menus.length) throw new Error('no published Navigation menu');
  const id = String(menus[0].ID);
  // WP-CLI prints the field with a newline after it, which is not part of the post.
  const before = wp(['post', 'get', id, '--field=post_content']).replace(/\n$/, '');
  const out = addGapsLink(before);
  console.log(`menu ${id}: ${out.note}`);
  if (!out.changed) return;
  if (!args.write) {
    console.log('\n--- after (not written; add --write) ---\n' + out.markup);
    return;
  }
  wp(['post', 'update', id, '-'], out.markup);
  const after = wp(['post', 'get', id, '--field=post_content']).replace(/\n$/, '');
  if (after !== out.markup) throw new Error(`menu ${id} reads back different from what was written: check it in Minn Admin`);
  console.log(`menu ${id} written and read back`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(`add-gaps-link: ${err.message}`);
    process.exit(1);
  }
}
