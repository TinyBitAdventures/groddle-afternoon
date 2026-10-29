#!/usr/bin/env node
/**
 * Link previews for the built game's static pages, added at deploy time (tools/deploy/kinsta.sh), like
 * Fathom (tools/deploy/fathom.mjs): Kinsta serves the homepage, /play/, /compare/, the notes and the item
 * pages as files, so the theme's document filter (groddle-afternoon-site src/SocialTags.php, the same
 * tags for the pages Minn renders) never reaches them. Each page's own <title> and description become
 * its Open Graph and Twitter card, with the share card public/brand/share.jpg (tools/brand/share/).
 *
 * Usage: node tools/deploy/social.mjs <built public/ dir>   (idempotent: a page with og:image is left alone)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://groddleafternoon.com';
export const SHARE_IMAGE = { path: '/brand/share.jpg', width: 1200, height: 630, alt: 'A Glitchen in Kristel Kaos, under red mushrooms, beside the words Groddle Afternoon' };

const unescape = (s) => s.replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The page's URL path from its file under public/: index.html is its folder. */
export function pagePath(file) {
  const p = `/${file.split(sep).join('/')}`;
  return p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p;
}

/** The tags for a page with this title, description and path. */
export function socialTags({ title, description, path }) {
  const url = ORIGIN + path;
  const image = ORIGIN + SHARE_IMAGE.path;
  const tags = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Groddle Afternoon'],
    ['property', 'og:title', title],
    ...(description ? [['property', 'og:description', description]] : []),
    ['property', 'og:url', url],
    ['property', 'og:image', image],
    ['property', 'og:image:width', String(SHARE_IMAGE.width)],
    ['property', 'og:image:height', String(SHARE_IMAGE.height)],
    ['property', 'og:image:alt', SHARE_IMAGE.alt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:image', image],
  ];
  return tags.map(([k, n, v]) => `<meta ${k}="${n}" content="${attr(v)}" />`).join('\n') + '\n';
}

/** The page with its tags before </head>, or null when it has no head, no title, or tags already. */
export function withSocial(html, path) {
  if (/property="og:image"/.test(html)) return null;
  const at = html.search(/<\/head>/i);
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  if (at < 0 || !title) return null;
  const description = html.match(/<meta name="description" content="([^"]*)"/i)?.[1];
  const tags = socialTags({ title: unescape(title.trim()), description: description ? unescape(description) : '', path });
  return html.slice(0, at) + tags + html.slice(at);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.argv[2];
  if (!root) {
    console.error('usage: node tools/deploy/social.mjs <built public/ dir>');
    process.exit(2);
  }
  let added = 0;
  for (const file of walk(root)) {
    const next = withSocial(readFileSync(file, 'utf8'), pagePath(relative(root, file)));
    if (next !== null) {
      writeFileSync(file, next);
      added += 1;
    }
  }
  console.log(`social: ${added} pages`);
}
