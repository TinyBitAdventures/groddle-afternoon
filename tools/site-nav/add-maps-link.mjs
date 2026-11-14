#!/usr/bin/env node
/**
 * Puts the Maps page (/restoration/maps/) in the header menu (Austin 2026-11-14: "Restoration -> Maps"):
 * in the Project submenu, a Maps link after Known gaps under Restoration, the third level the site draws
 * indented under Restoration (SiteNav::panel, tools/site-nav/apply.mjs). Nothing else changes.
 *
 * It changes only that one block, keeping every other byte of the menu, and it is idempotent: a menu
 * that already has Maps under Restoration is left alone. Any other shape (no Project submenu, Restoration
 * not yet a submenu of History and Known gaps, a maps link somewhere else) is refused and nothing is
 * written; run tools/site-nav/add-gaps-link.mjs first where Restoration is still a plain link.
 *
 *   node tools/site-nav/add-maps-link.mjs --menu=<file>                         print the changed markup
 *   node tools/site-nav/add-maps-link.mjs --site=<webroot> [--write]            the local site, through WP-CLI
 *   node tools/site-nav/add-maps-link.mjs --live [--write]                      groddleafternoon.com over SSH
 *
 * --site and --live read the newest published wp_navigation post (as SiteNav::links does) and only show
 * the change unless --write is given; after writing they read the post back and check it. --live takes
 * the SSH address as tools/site-nav/add-gaps-link.mjs does.
 */
import { readFileSync } from 'node:fs';

import { blocks, runner } from './add-gaps-link.mjs';

export const MAPS = { label: 'Maps', url: '/restoration/maps/' };

const LINK = 'core/navigation-link';
const SUBMENU = 'core/navigation-submenu';
const is = (node, name, label, url) => node && node.name === name && node.attrs.label === label && (url === undefined || node.attrs.url === url);
const isMaps = (node) => is(node, LINK, MAPS.label, MAPS.url);
const mapsLine = () => `<!-- wp:navigation-link ${JSON.stringify({ label: MAPS.label, url: MAPS.url, kind: 'custom' })} /-->`;

/**
 * The menu with the change made: { markup, changed, note }. Throws (writing nothing) when the menu is
 * not the shape the change expects.
 */
export function addMapsLink(markup) {
  markup = String(markup);
  const all = blocks(markup);
  const walk = (list) => list.flatMap((n) => [n, ...walk(n.inner)]);
  const mapsLinks = walk(all).filter((n) => (n.name === LINK || n.name === SUBMENU) && String(n.attrs.url || '').replace(/\/?$/, '/') === MAPS.url);
  const projects = all.filter((n) => is(n, SUBMENU, 'Project'));
  if (projects.length !== 1) throw new Error(`expected one top-level Project submenu, found ${projects.length}`);
  const restoration = projects[0].inner.find((n) => is(n, SUBMENU, 'Restoration', '/restoration/'));
  if (!restoration) throw new Error('Restoration is not a submenu of History and Known gaps yet: run tools/site-nav/add-gaps-link.mjs first');
  const inner = restoration.inner;
  const gapsAt = inner.findIndex((n) => is(n, LINK, 'Known gaps', '/restoration/gaps/'));
  if (gapsAt < 0) throw new Error('the Restoration submenu has no Known gaps link: run tools/site-nav/add-gaps-link.mjs first');
  if (inner.some(isMaps) && mapsLinks.length === 1) return { markup, changed: false, note: 'the menu already has Maps under Restoration' };
  if (mapsLinks.length) throw new Error('the menu already links to /restoration/maps/ somewhere else: change it in Minn Admin');
  const gaps = inner[gapsAt];
  return {
    markup: markup.slice(0, gaps.end) + '\n\n' + mapsLine() + markup.slice(gaps.end),
    changed: true, note: 'added Maps after Known gaps under Restoration',
  };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, ...v]) => [k, v.join('=') || true]));
  if (args.menu) {
    const out = addMapsLink(readFileSync(args.menu, 'utf8'));
    console.error(out.note);
    process.stdout.write(out.markup);
    return;
  }
  if (!args.site && !args.live) {
    console.error('usage: add-maps-link.mjs (--menu=<file> | --site=<webroot> | --live) [--write]');
    process.exit(2);
  }
  const wp = runner(args);
  const menus = JSON.parse(wp(['post', 'list', '--post_type=wp_navigation', '--post_status=publish', '--fields=ID,post_date', '--format=json']) || '[]');
  menus.sort((a, b) => (a.post_date === b.post_date ? Number(b.ID) - Number(a.ID) : (a.post_date < b.post_date ? 1 : -1)));
  if (!menus.length) throw new Error('no published Navigation menu');
  const id = String(menus[0].ID);
  // WP-CLI prints the field with a newline after it, which is not part of the post.
  const before = wp(['post', 'get', id, '--field=post_content']).replace(/\n$/, '');
  const out = addMapsLink(before);
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
    console.error(`add-maps-link: ${err.message}`);
    process.exit(1);
  }
}
