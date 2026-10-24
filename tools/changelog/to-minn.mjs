#!/usr/bin/env node
/**
 * Moves the Notes blog into Minn, which is its source from then on: each note in
 * tools/changelog/posts.json becomes a post on the Minn site (groddle.localhost), written
 * through Minn's own REST API, so it can be edited in Minn Admin. The Groddle theme
 * draws it (minn/groddle/templates/single.html, home.html).
 *
 *   MINN_USER=admin MINN_PASS=... node tools/changelog/to-minn.mjs [--site=https://groddle.localhost] [--dry]
 *
 * Idempotent by slug: a note already on the site is updated, not duplicated.
 * It also sets the site up for the blog, once: the Notes page (/changelog/) as
 * the posts page, a Home page in front (the theme answers / itself), and the
 * starter post and page removed. Permalinks are /changelog/%postname%/, set with
 * `wp option update permalink_structure` on the site (see the skill).
 * Mapping: title (plain), slug, date, draft -> status; summary -> excerpt;
 * label -> category, tags -> tags; subtitle/lead/stat -> a note-intro group;
 * image -> an image block; every structured block (cards, ledgers, tables,
 * quests ...) -> an HTML block with the markup build.mjs drew, so the
 * site's stylesheets style it as before; sections -> section groups.
 */
import { loadPosts, blockHtml, cardsHtml } from './build.mjs';
import { plain } from './html.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');
const DRY = !!args.dry;

const json = (v) => JSON.stringify(v);
const block = (name, attrs, inner) => `<!-- wp:${name}${attrs && Object.keys(attrs).length ? ' ' + json(attrs) : ''} -->\n${inner}\n<!-- /wp:${name} -->`;
const html = (markup) => block('html', null, markup.trim());
const titleCase = (s) => plain(s).toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** One note as block markup. */
export function noteContent(post) {
  const out = [];
  if (post.subtitle || post.lead || post.stat) {
    const inner = [];
    const words = [];
    if (post.subtitle) words.push(block('heading', null, `<h2 class="wp-block-heading">${post.subtitle}</h2>`));
    if (post.lead) words.push(block('paragraph', { className: 'note-text' }, `<p class="note-text">${post.lead}</p>`));
    inner.push(block('group', null, `<div class="wp-block-group">${words.join('\n\n')}</div>`));
    if (post.stat) inner.push(html(`<aside class="note-stamp">\n  <strong>${post.stat.num}</strong>\n  <span>${post.stat.caption}</span>\n</aside>`));
    const cls = `note-intro${post.stat ? '' : ' note-intro-solo'}`;
    out.push(block('group', { className: cls }, `<div class="wp-block-group ${cls}">${inner.join('\n\n')}</div>`));
  }
  if (post.image) {
    const src = '/' + post.image.src.replace(/^\/+/, '');
    const size = post.image.width ? ` width="${post.image.width}" height="${post.image.height}"` : '';
    const caption = post.image.caption ? `<figcaption class="wp-element-caption">${post.image.caption}</figcaption>` : '';
    out.push(block('image', { className: 'note-figure' }, `<figure class="wp-block-image note-figure"><img src="${src}" alt="${plain(post.image.alt).replace(/"/g, '&quot;')}"${size} loading="lazy"/>${caption}</figure>`));
  }
  const blocks = post.blocks || [];
  const at = post.cardsAt || 0;
  const one = (b) => {
    if (b.type !== 'section') return html(blockHtml(b));
    const inner = [block('heading', { anchor: `${b.id}-h` }, `<h2 class="wp-block-heading" id="${b.id}-h">${b.title}</h2>`), ...b.blocks.map(one)];
    return block('group', { tagName: 'section', anchor: b.id, className: 'note-section' }, `<section id="${b.id}" class="wp-block-group note-section">${inner.join('\n\n')}</section>`);
  };
  out.push(...blocks.slice(0, at).map(one));
  if (post.cards?.length) out.push(html(cardsHtml(post.cards)));
  out.push(...blocks.slice(at).map(one));
  return out.join('\n\n');
}

class Minn {
  constructor(site) { this.site = site; this.cookies = new Map(); this.nonce = ''; }
  jar(res) {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  cookie() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async signIn(user, pass) {
    const res = await fetch(`${this.site}/wp-login.php`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'wordpress_test_cookie=WP%20Cookie%20check' }, body: new URLSearchParams({ log: user, pwd: pass, 'wp-submit': 'Log In', testcookie: '1' }) });
    this.jar(res);
    const nonce = await fetch(`${this.site}/wp-admin/admin-ajax.php?action=rest-nonce`, { headers: { cookie: this.cookie() } });
    this.nonce = (await nonce.text()).trim();
    if (!/^[a-f0-9]{10}$/.test(this.nonce)) throw new Error(`sign-in failed (nonce: ${this.nonce.slice(0, 80)})`);
  }
  async rest(method, route, body) {
    const res = await fetch(`${this.site}/wp-json${route}`, { method, headers: { cookie: this.cookie(), 'x-wp-nonce': this.nonce, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? json(body) : undefined });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${typeof data === 'string' ? data.slice(0, 200) : json(data).slice(0, 300)}`);
    return data;
  }
  async term(tax, name) {
    const found = await this.rest('GET', `/wp/v2/${tax}?search=${encodeURIComponent(name)}&per_page=100&context=edit`);
    const hit = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
    return hit ? hit.id : (await this.rest('POST', `/wp/v2/${tax}`, { name })).id;
  }
}

/** The pages the blog needs, the reading settings, and no starter content. */
async function setUp(minn) {
  const page = async (slug, title) => {
    const found = await minn.rest('GET', `/wp/v2/pages?slug=${slug}&status=publish,draft&context=edit`);
    return found[0]?.id ?? (await minn.rest('POST', '/wp/v2/pages', { slug, title, status: 'publish', content: '' })).id;
  };
  const home = await page('home', 'Home');
  const notes = await page('changelog', 'Notes');
  await minn.rest('POST', '/wp/v2/settings', { title: 'Groddle Afternoon', description: 'A fan remake of Glitch', show_on_front: 'page', page_on_front: home, page_for_posts: notes, posts_per_page: 50 });
  for (const [type, slug] of [['posts', 'hello-world'], ['pages', 'sample-page']]) {
    const found = await minn.rest('GET', `/wp/v2/${type}?slug=${slug}&context=edit`);
    if (found[0]) await minn.rest('DELETE', `/wp/v2/${type}/${found[0].id}?force=true`);
  }
}

async function main() {
  const data = loadPosts();
  if (DRY) {
    for (const post of data.posts) console.log(post.slug, noteContent(post).length);
    return;
  }
  const minn = new Minn(SITE);
  await minn.signIn(process.env.MINN_USER || 'admin', process.env.MINN_PASS || '');
  await setUp(minn);
  const sameDay = new Map();
  for (const post of [...data.posts].reverse()) {
    // posts.json lists a day's notes newest first; minutes past noon keep that order on the site.
    const nth = sameDay.get(post.date) || 0;
    sameDay.set(post.date, nth + 1);
    const categories = post.label ? [await minn.term('categories', titleCase(post.label))] : [];
    const tags = [];
    for (const t of post.tags || []) tags.push(await minn.term('tags', titleCase(t)));
    const body = {
      title: plain(post.title),
      slug: post.slug,
      date: `${post.date}T12:${String(nth).padStart(2, '0')}:00`,
      status: post.draft ? 'draft' : 'publish',
      excerpt: post.summary,
      content: noteContent(post),
      categories,
      tags,
    };
    const existing = await minn.rest('GET', `/wp/v2/posts?slug=${encodeURIComponent(post.slug)}&status=publish,draft,future,private,pending&context=edit`);
    const saved = existing[0] ? await minn.rest('POST', `/wp/v2/posts/${existing[0].id}`, body) : await minn.rest('POST', '/wp/v2/posts', body);
    console.log(`${existing[0] ? 'updated' : 'created'} ${saved.id} ${post.slug}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
