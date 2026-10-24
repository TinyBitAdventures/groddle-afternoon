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
 * image -> an image block; stat, cards, milestones, ledgers, quests and signs ->
 * the theme's note blocks (minn/groddle/blocks, words in attributes, so Minn
 * Admin edits them with a form); sub-intros, checklists and tables -> core
 * blocks; sections -> section groups. The blocks draw the markup build.mjs
 * drew, so the site's stylesheets style them as before.
 */
import { loadPosts } from './build.mjs';
import { plain } from './html.mjs';
import { markNames } from './minn-blocks.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const SITE = String(args.site || 'https://groddle.localhost').replace(/\/$/, '');
const DRY = !!args.dry;

export const json = (v) => JSON.stringify(v);
// Attributes as the block editor writes them into the comment.
export const attrJson = (attrs) => json(attrs).replace(/--/g, '\\u002d\\u002d').replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\\"/g, '\\u0022');
const opened = (name, attrs) => `<!-- wp:${name}${attrs && Object.keys(attrs).length ? ' ' + attrJson(attrs) : ''}`;
export const block = (name, attrs, inner) => `${opened(name, attrs)} -->\n${inner}\n<!-- /wp:${name} -->`;
// The theme's blocks: empty attributes left out (the block.json defaults are empty or a placeholder only a new block shows).
const given = (attrs) => Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const leaf = (name, attrs) => `${opened(`groddle/${name}`, given(attrs))} /-->`;
const parent = (name, attrs, kids) => `${opened(`groddle/${name}`, given(attrs))} -->\n${kids.join('\n')}\n<!-- /wp:groddle/${name} -->`;
const MARKS = markNames();
const p = (cls, words) => block('paragraph', cls ? { className: cls } : null, `<p${cls ? ` class="${cls}"` : ''}>${words}</p>`);
const h = (level, cls, words) => block('heading', { ...(level === 2 ? {} : { level }), ...(cls ? { className: cls } : {}) }, `<h${level} class="wp-block-heading${cls ? ` ${cls}` : ''}">${words}</h${level}>`);
const group = (cls, inner) => block('group', { className: cls }, `<div class="wp-block-group ${cls}">${inner.join('\n\n')}</div>`);

const cards = (list, variant) => parent('features', { variant }, list.map((c) => leaf('feature', { icon: MARKS.get(c.mark), title: c.title, text: c.text })));

/** A structured block of posts.json as blocks. */
const STRUCTURED = {
  cards: (b) => cards(b.cards, b.variant),
  milestones: (b) => parent('milestones', { label: b.label }, b.items.map((m) => leaf('milestone', { step: m.button === m.kind ? '' : m.button, kind: m.kind, title: m.title, text: m.text }))),
  ledger: (b) => parent('ledger', { label: b.label }, b.items.map((i) => leaf('figure', { value: i.num, caption: i.caption }))),
  stats: (b) => parent('ledger', { variant: 'stats', id: b.id }, b.items.map((i) => leaf('figure', { value: i.num, unit: i.unit, caption: i.caption }))),
  quests: (b) => parent('quests', {}, b.items.map((q) => leaf('quest', { n: String(q.n), kind: q.kind, short: q.short, title: q.title, text: q.text, source: q.source, play: q.play, finish: q.finish }))),
  signs: (b) => parent('signpost', { label: b.label, caption: b.caption }, b.arms.map((a) => leaf('sign', { side: a.side, text: a.text }))),
  intro: (b) => group('note-subintro', [p('note-eyebrow', b.eyebrow), h(3, 'note-subhead', b.heading), p('note-text', b.lead)]),
  lists: (b) => group('note-lists', b.cards.map((c) => group('note-list-card', [
    h(3, '', c.title),
    ...(c.text ? [p('', c.text)] : []),
    block('list', { className: 'note-checks' }, `<ul class="wp-block-list note-checks">${c.items.map((i) => block('list-item', null, `<li>${i}</li>`)).join('')}</ul>`),
  ]))),
  table: (b) => {
    const cell = (tag, i, words) => (i === b.numCol ? `<${tag} class="has-text-align-right" data-align="right">${words}</${tag}>` : `<${tag}>${words}</${tag}>`);
    return block('table', { hasFixedLayout: false, className: 'note-table-wrap' }, `<figure class="wp-block-table note-table-wrap"><table><thead><tr>${b.head.map((c, i) => cell('th', i, c)).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => cell('td', i, c)).join('')}</tr>`).join('')}</tbody></table>${b.label ? `<figcaption class="wp-element-caption">${b.label}</figcaption>` : ''}</figure>`);
  },
};
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
    if (post.stat) inner.push(leaf('stamp', { value: post.stat.num, caption: post.stat.caption }));
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
    if (b.type !== 'section') {
      if (!STRUCTURED[b.type]) throw new Error(`${post.slug}: no block for ${b.type}`);
      return STRUCTURED[b.type](b);
    }
    const inner = [block('heading', { anchor: `${b.id}-h` }, `<h2 class="wp-block-heading" id="${b.id}-h">${b.title}</h2>`), ...b.blocks.map(one)];
    return block('group', { tagName: 'section', anchor: b.id, className: 'note-section' }, `<section id="${b.id}" class="wp-block-group note-section">${inner.join('\n\n')}</section>`);
  };
  out.push(...blocks.slice(0, at).map(one));
  if (post.cards?.length) out.push(cards(post.cards));
  out.push(...blocks.slice(at).map(one));
  return out.join('\n\n');
}

export class Minn {
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
