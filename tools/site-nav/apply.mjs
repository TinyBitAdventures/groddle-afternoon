#!/usr/bin/env node
/**
 * Writes the site's Navigation menu into the built pages. The header menu is
 * a wp_navigation post on the Minn site, edited in Minn Admin under Design,
 * Navigation; the Groddle theme draws it on Minn's pages (groddle-afternoon-site/src/
 * SiteNav.php), and this puts the same links in every built page that carries
 * the header (<div class="site-nav-links">), with the section being read
 * marked, so one edit changes every page. sync-to-cove.sh runs it on the
 * copy in the site's game/ folder; the spike's own pages keep their links.
 *
 *   node tools/site-nav/apply.mjs --game=<site>/game --site=<site>/public   read the menu with WP-CLI
 *   node tools/site-nav/apply.mjs --game=<dir> --menu=<file>               read block markup from a file
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** The links when no menu exists: what the built pages ship with (SiteNav::FALLBACK). */
export const FALLBACK = [
  { label: 'Restoration', href: '/restoration/', className: '' },
  { label: 'Compare', href: '/compare/', className: '' },
  { label: 'Items', href: '/items/', className: '' },
  { label: 'Notes', href: '/changelog/', className: '' },
  { label: 'Play', href: '/play/', className: 'site-nav-play' },
];

/**
 * Pages a link stands for besides its own path, so its section is marked on
 * them too: Project gathers the restoration story (Austin 2026-10-28, register
 * G338). A link straight to the page still wins. The same list as SiteNav::SECTIONS.
 */
export const SECTIONS = {
  '/project/': ['/restoration/', '/compare/', '/changelog/', '/code/'],
};

const decode = (s) => s.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#039|#39|apos);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#039': "'", '#39': "'", apos: "'" })[e]);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The menu's top-level navigation links from wp_navigation block markup. */
export function parseMenu(markup) {
  const links = [];
  let depth = 0;
  for (const m of String(markup).matchAll(/<!--\s+(\/)?wp:([a-z0-9/-]+)(?:\s+(\{[\s\S]*?\}))?\s+(\/)?-->/g)) {
    const [, closing, rawName, json, selfClosing] = m;
    const name = rawName.includes('/') ? rawName : `core/${rawName}`;
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && (name === 'core/navigation-link' || name === 'core/navigation-submenu')) {
      let attrs = {};
      try { attrs = json ? JSON.parse(json) : {}; } catch { attrs = {}; }
      const label = decode(String(attrs.label ?? '')).trim();
      const href = String(attrs.url ?? '').trim();
      if (label && href) links.push({ label, href, className: String(attrs.className ?? '').trim() });
    }
    if (!selfClosing) depth++;
  }
  return links.length ? links : FALLBACK;
}

/**
 * The link whose section holds the page: the longest site path that starts it
 * (the link's own, or one it stands for in SECTIONS, which loses a tie to a
 * link's own), never home or Play.
 */
export function currentIndex(links, pagePath) {
  let best = -1;
  let score = 0;
  const path = pagePath.replace(/\/?$/, '/');
  links.forEach(({ href, className }, i) => {
    if (href === '/' || !href.startsWith('/') || className.split(/\s+/).includes('site-nav-play')) return;
    const own = href.replace(/\/?$/, '/');
    for (const section of [own, ...(SECTIONS[own] || [])]) {
      const points = section.length * 2 + (section === own ? 1 : 0);
      if (path.startsWith(section) && points > score) { best = i; score = points; }
    }
  });
  return best;
}

/** The links' markup, in the built pages' indentation. */
export function renderLinks(links, pagePath, indent = '        ') {
  const current = currentIndex(links, pagePath);
  return links.map(({ label, href, className }, i) =>
    `${indent}<a${className ? ` class="${esc(className)}"` : ''} href="${esc(href)}"${i === current ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('\n');
}

/** A built page with its header links replaced; unchanged when it has no header. */
export function applyToHtml(html, pagePath, links) {
  return html.replace(/(<div class="site-nav-links">\n)([\s\S]*?)(\n(\s*)<\/div>)/, (all, open, inner, close, closeIndent) => {
    const indent = (inner.match(/^(\s*)</) || [, `${closeIndent}  `])[1];
    return open + renderLinks(links, pagePath, indent) + close;
  });
}

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'assets' || name.startsWith('.')) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...htmlFiles(path));
    else if (name.endsWith('.html')) out.push(path);
  }
  return out;
}

/** The newest published menu, as SiteNav::links reads it, through the site's WP-CLI. */
export function menuFromSite(site) {
  const wp = (...args) => execFileSync('wp', [`--path=${site}`, ...args], { encoding: 'utf8' });
  const menus = JSON.parse(wp('post', 'list', '--post_type=wp_navigation', '--post_status=publish', '--fields=ID,post_date', '--format=json') || '[]');
  menus.sort((a, b) => (a.post_date === b.post_date ? Number(b.ID) - Number(a.ID) : (a.post_date < b.post_date ? 1 : -1)));
  return menus.length ? wp('post', 'get', String(menus[0].ID), '--field=post_content') : '';
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, ...v]) => [k, v.join('=') || true]));
  if (!args.game || (!args.site && !args.menu)) {
    console.error('usage: apply.mjs --game=<dir> (--site=<webroot> | --menu=<file>)');
    process.exit(2);
  }
  const links = parseMenu(args.menu ? readFileSync(args.menu, 'utf8') : menuFromSite(args.site));
  let changed = 0;
  for (const file of htmlFiles(args.game)) {
    const html = readFileSync(file, 'utf8');
    if (!html.includes('<div class="site-nav-links">')) continue;
    const rel = relative(args.game, file).split(sep);
    const pagePath = '/' + (rel.at(-1) === 'index.html' ? rel.slice(0, -1) : rel).join('/');
    const next = applyToHtml(html, pagePath === '/' ? '/' : pagePath.replace(/\/?$/, '/'), links);
    if (next !== html) { writeFileSync(file, next); changed++; }
  }
  console.log(`site nav: ${links.map((l) => l.label).join(', ')}; ${changed} built page${changed === 1 ? '' : 's'} updated`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
