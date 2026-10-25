/**
 * Builds the Notes blog from tools/changelog/posts.json:
 *
 *   public/changelog/index.html          the list of notes, newest first
 *   public/changelog/<slug>/index.html   one page per note (drafts too)
 *   public/changelog.html                the old build archive's address,
 *                                        now a redirect that keeps its
 *                                        #release-... anchors working
 *
 *   node tools/changelog/build.mjs          write the pages
 *   node tools/changelog/build.mjs --check  exit 1 if any page is stale
 *
 * A post with "draft": true gets its page (with a Draft banner and noindex)
 * but stays out of the list, the older/newer links and the redirect.
 * Text fields in posts.json are HTML fragments and go in as written.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plain } from './html.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pub = join(root, 'public');
export const POSTS_FILE = join(here, 'posts.json');
const HISTORY_FALLBACK_SINCE = '2026-10-19';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (s) => esc(plain(s));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parts = (iso) => iso.split('-').map(Number);
/** "Monday 19 October 2026", as the history page names its days. */
export const dayName = (iso) => {
  const [y, m, d] = parts(iso);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
};
const monthName = (iso) => { const [y, m] = parts(iso); return `${MONTHS[m - 1]} ${y}`; };

export function loadPosts(file = POSTS_FILE) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  // Newest first; posts on the same day keep their order in the file.
  data.posts = [...data.posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return data;
}

export function historySince() {
  try {
    return JSON.parse(readFileSync(join(pub, 'restoration', 'history.json'), 'utf8')).since || HISTORY_FALLBACK_SINCE;
  } catch {
    return HISTORY_FALLBACK_SINCE;
  }
}

/* —— Shared page parts ————————————————————————————————— */

/** The site header, identical on every page apart from the path prefix (tests/site-nav.test.js). */
export const siteNav = (p, current) => `  <nav class="site-nav" aria-label="Site">
    <div class="wrap site-nav-row">
      <a class="wordmark" href="${p}"><img src="${p}favicon.svg?v=quoin" alt="" width="28" height="28" /><span>Groddle Afternoon</span></a>
      <div class="site-nav-links">
        <a href="${p}restoration/">Restoration</a>
        <a href="${p}compare/">Compare</a>
        <a href="${p}items/"${current === 'items' ? ' aria-current="page"' : ''}>Items</a>
        <a href="${p}changelog/"${current === 'changelog' ? ' aria-current="page"' : ''}>Notes</a>
        <a class="site-nav-play" href="${p}play/">Play</a>
      </div>
    </div>
  </nav>`;

const page = ({ p, title, description, noindex, body }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${esc(description)}" />
${noindex ? '  <meta name="robots" content="noindex" />\n' : ''}  <title>${esc(title)}</title>
  <link rel="stylesheet" href="${p}restoration/restoration.css" />
  <link rel="stylesheet" href="${p}changelog/changelog.css" />
  <link rel="stylesheet" href="${p}site/site-nav.css" />
  <link rel="icon" href="${p}favicon.svg?v=quoin" type="image/svg+xml" />
  <link rel="icon" href="${p}favicon.ico?v=quoin" sizes="32x32" />
  <link rel="apple-touch-icon" href="${p}apple-touch-icon.png?v=quoin" />
</head>
<body class="notes">
${siteNav(p, 'changelog')}
${body}
  <footer class="foot">
    <div class="wrap">
      <p>Tiny Speck's Glitch art, music and code are CC0. Groddle Afternoon is a fan remake and uses no Glitch logo.</p>
      <p><a href="${p}">Home</a> · <a href="${p}play/">Play Groddle Afternoon</a> · <a href="${p}restoration/">Restoration report</a> · <a href="${p}restoration/history/">Every change</a></p>
    </div>
  </footer>
</body>
</html>
`;

/* —— Blocks ———————————————————————————————————————— */

const ariaLabel = (label) => (label ? ` aria-label="${attr(label)}"` : '');

export function cardsHtml(cards, variant) {
  return `<div class="note-features${variant ? ` note-features-${variant}` : ''}">
${cards.map((c) => `          <article class="note-feature">
            <div class="note-mark" aria-hidden="true">${c.mark}</div>
            <h3>${c.title}</h3>
            <p>${c.text}</p>
          </article>`).join('\n')}
        </div>`;
}

const BLOCKS = {
  cards: (b) => cardsHtml(b.cards, b.variant),
  intro: (b) => `<div class="note-subintro">
          <p class="note-eyebrow">${b.eyebrow}</p>
          <h3 class="note-subhead">${b.heading}</h3>
          <p class="note-text">${b.lead}</p>
        </div>`,
  signs: (b) => `<figure class="note-signs"${ariaLabel(b.label)}>
          <div class="note-signpost">
${b.arms.map((a) => `            <span class="note-sign-arm ${a.side}">${a.text}</span>`).join('\n')}
          </div>
          <figcaption>${b.caption}</figcaption>
        </figure>`,
  // The quest map and milestone labels said "Interactive" and "Clickable"; here they are plain lists.
  quests: (b) => `<ol class="note-quests">
${b.items.map((q) => `          <li class="note-quest">
            <p class="note-quest-top"><span class="note-quest-n">${q.n}</span><span class="note-kind">${q.kind}</span><span class="note-quest-short">${q.short}</span></p>
            <h3>${q.title}</h3>
            <p>${q.text}</p>
            <dl class="note-facts">
              <dt>Source</dt><dd>${q.source}</dd>
              <dt>Play</dt><dd>${q.play}</dd>
              <dt>Finish</dt><dd>${q.finish}</dd>
            </dl>
          </li>`).join('\n')}
        </ol>`,
  milestones: (b) => `<ol class="note-milestones">
${b.items.map((m) => `          <li class="note-milestone">
            <p class="note-milestone-top">${m.button === m.kind ? '' : `<span class="note-milestone-step">${m.button}</span>`}<span class="note-kind">${m.kind}</span></p>
            <h3>${m.title}</h3>
            <p>${m.text}</p>
          </li>`).join('\n')}
        </ol>`,
  lists: (b) => `<div class="note-lists">
${b.cards.map((c) => `          <div class="note-list-card">
            <h3>${c.title}</h3>
${c.text ? `            <p>${c.text}</p>\n` : ''}            <ul class="note-checks">
${c.items.map((i) => `              <li>${i}</li>`).join('\n')}
            </ul>
          </div>`).join('\n')}
        </div>`,
  ledger: (b) => `<div class="note-ledger"${ariaLabel(b.label)}>
${b.items.map((i) => `          <div><strong>${i.num}</strong><span>${i.caption}</span></div>`).join('\n')}
        </div>`,
  stats: (b) => `<div class="note-ledger note-stats"${b.id ? ` id="${esc(b.id)}"` : ''}>
${b.items.map((i) => `          <div><strong>${i.num}${i.unit ? `<small>${i.unit}</small>` : ''}</strong><span>${i.caption}</span></div>`).join('\n')}
        </div>`,
  table: (b) => `<div class="note-table-wrap">
          <table class="note-table"${ariaLabel(b.label)}>
            <thead>
              <tr>${b.head.map((h, i) => `<th${i === b.numCol ? ' class="num-col"' : ''}>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
${b.rows.map((r) => `              <tr>${r.map((c, i) => `<td${i === b.numCol ? ' class="num-col"' : ''}>${c}</td>`).join('')}</tr>`).join('\n')}
            </tbody>
          </table>
        </div>`,
  section: (b) => `<section class="note-section" id="${esc(b.id)}" aria-labelledby="${esc(b.id)}-h">
        <h2 id="${esc(b.id)}-h">${b.title}</h2>
        ${b.blocks.map(blockHtml).join('\n        ')}
      </section>`,
};

export function blockHtml(b) {
  const render = BLOCKS[b.type];
  if (!render) throw new Error(`unknown block type ${b.type}`);
  return render(b);
}

/* —— Pages ————————————————————————————————————————— */

function postBody(post, ctx) {
  const p = '../../';
  const blocks = post.blocks || [];
  const at = post.cardsAt || 0;
  const body = [
    ...blocks.slice(0, at).map(blockHtml),
    ...(post.cards?.length ? [cardsHtml(post.cards)] : []),
    ...blocks.slice(at).map(blockHtml),
  ];
  const intro = post.subtitle || post.lead || post.stat ? `
      <div class="note-intro${post.stat ? '' : ' note-intro-solo'}">
        <div>
${post.subtitle ? `          <h2>${post.subtitle}</h2>\n` : ''}${post.lead ? `          <p class="note-text">${post.lead}</p>\n` : ''}        </div>
${post.stat ? `        <aside class="note-stamp">
          <strong>${post.stat.num}</strong>
          <span>${post.stat.caption}</span>
        </aside>\n` : ''}      </div>` : '';
  const figure = post.image ? `
      <figure class="note-figure">
        <img src="${p}${esc(post.image.src)}" alt="${attr(post.image.alt)}"${post.image.width ? ` width="${post.image.width}" height="${post.image.height}"` : ''} loading="lazy" />
${post.image.caption ? `        <figcaption>${post.image.caption}</figcaption>\n` : ''}      </figure>` : '';

  const covered = post.date >= ctx.since;
  const history = covered
    ? `<p>Every change made that day is listed on the history page, with what it did and where it came from.</p>
        <p><a href="${p}restoration/history/#d-${post.date}">Every change on ${dayName(post.date)}</a></p>`
    : `<p>This note is older than the day-by-day history, which starts on ${dayName(ctx.since).replace(/^\w+ /, '')}.</p>
        <p><a href="${p}restoration/history/">Every change since then</a></p>`;
  const pager = (dir, label, other) => (other ? `<a class="note-pager-${dir}" href="../${other.slug}/" rel="${dir === 'older' ? 'prev' : 'next'}"><span>${label}</span>${other.title}</a>` : '<span></span>');

  return `
  <header class="masthead note-head">
    <div class="wrap">
${post.draft ? `      <p class="note-draft" role="note"><strong>Draft</strong> Not published yet: this note is left out of the Notes list and search engines until <code>"draft": true</code> comes off it in tools/changelog/posts.json.</p>\n` : ''}      <p class="kicker"><a href="../">Groddle Field Notes · Notes</a> · <time datetime="${post.date}">${post.meta}</time></p>
      <h1>${post.title}</h1>
      <p class="lead">${post.summary}</p>
${post.tags?.length ? `      <ul class="note-tags" aria-label="Topics">\n${post.tags.map((t) => `        <li>${t}</li>`).join('\n')}\n      </ul>\n` : ''}    </div>
  </header>

  <main>
    <article class="band note-body">
      <div class="wrap">${intro}${figure}
      ${body.join('\n      ')}
      </div>
    </article>

    <nav class="band band-alt note-after" aria-label="More notes">
      <div class="wrap">
        <div class="note-history">
        ${history}
        </div>
        <div class="note-pager">
          ${pager('older', 'Older', ctx.older)}
          ${pager('newer', 'Newer', ctx.newer)}
        </div>
        <p class="note-all"><a href="../">All notes</a></p>
      </div>
    </nav>
  </main>
`;
}

function indexBody(data, published) {
  const months = [];
  for (const post of published) {
    const name = monthName(post.date);
    if (months.at(-1)?.name !== name) months.push({ name, posts: [] });
    months.at(-1).posts.push(post);
  }
  const card = (post) => `          <li>
            <article class="note-card">
              <p class="note-card-meta"><time datetime="${post.date}">${post.meta}</time></p>
              <h3><a href="${post.slug}/">${post.title}</a></h3>
              <p class="note-card-summary">${post.summary}</p>
${post.stat ? `              <p class="note-card-stat"><strong>${post.stat.num}</strong> <span>${post.stat.caption}</span></p>\n` : ''}            </article>
          </li>`;
  return `
  <header class="masthead note-head">
    <div class="wrap">
      <p class="kicker">Groddle Field Notes · Notes</p>
      <h1>${data.archive?.heading || 'Notes'}</h1>
      <p class="lead">${data.archive?.lead || ''}</p>
      <p class="note-index-intro">Longer write-ups of the work, one round at a time, newest first. For every single change since 19 October 2026, day by day, see <a href="../restoration/history/">Every change</a>.</p>
    </div>
  </header>

  <main class="band">
    <div class="wrap">
${months.map((m) => `      <section class="note-month" aria-labelledby="m-${m.posts[0].date.slice(0, 7)}">
        <h2 id="m-${m.posts[0].date.slice(0, 7)}">${m.name}</h2>
        <ol class="note-cards">
${m.posts.map(card).join('\n')}
        </ol>
      </section>`).join('\n')}
    </div>
  </main>
`;
}

/** The old build archive address: send each #release-... anchor to its post. */
function redirectPage(published) {
  const map = {};
  for (const post of published) {
    if (!post.archived?.id) continue;
    map[post.archived.id] = `${post.slug}/`;
    for (const section of post.blocks || []) {
      if (section.type !== 'section') continue;
      map[`panel-${section.id}`] = `${post.slug}/#${section.id}`;
      map[`tab-${section.id}`] = `${post.slug}/#${section.id}`;
      for (const a of section.anchors || []) map[a] = `${post.slug}/#${a}`;
    }
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Groddle Field Notes · Notes</title>
  <link rel="canonical" href="changelog/" />
  <script>
    // The build archive became the Notes blog; old #release-... links open their post.
    var posts = ${JSON.stringify(map, null, 6).replace(/\n}$/, '\n    }')};
    location.replace('changelog/' + (posts[decodeURIComponent(location.hash.slice(1))] || ''));
  </script>
  <noscript><meta http-equiv="refresh" content="0; url=changelog/" /></noscript>
</head>
<body>
  <p>The build archive is now <a href="changelog/">Notes</a>.</p>
</body>
</html>
`;
}

/** Every file the blog owns, path relative to public/ to contents. */
export function buildPages(data = loadPosts(), since = historySince()) {
  const slugs = new Set();
  for (const post of data.posts) {
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(post.slug) || !post.slug.startsWith(post.date)) throw new Error(`bad slug ${post.slug}`);
    if (slugs.has(post.slug)) throw new Error(`duplicate slug ${post.slug}`);
    slugs.add(post.slug);
  }
  const published = data.posts.filter((p) => !p.draft);
  const files = {};
  files['changelog/index.html'] = page({
    p: '../',
    title: 'Groddle Field Notes · Notes',
    description: 'Notes on building Groddle Afternoon, the Glitch remake: longer write-ups of each round of work, newest first.',
    body: indexBody(data, published),
  });
  for (const post of data.posts) {
    const i = published.indexOf(post);
    const ctx = post.draft
      ? { since, older: published[0], newer: null }
      : { since, older: published[i + 1], newer: published[i - 1] };
    files[`changelog/${post.slug}/index.html`] = page({
      p: '../../',
      title: `${plain(post.title)} · Groddle Field Notes`,
      description: plain(post.summary),
      noindex: !!post.draft,
      body: postBody(post, ctx),
    });
  }
  files['changelog.html'] = redirectPage(published);
  return files;
}

/** Post folders on disk that no post builds any more. */
function strayDirs(files) {
  const dir = join(pub, 'changelog');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !files[`changelog/${d.name}/index.html`])
    .map((d) => `changelog/${d.name}/`);
}

export function staleFiles(files = buildPages()) {
  const stale = Object.entries(files)
    .filter(([path, html]) => !existsSync(join(pub, path)) || readFileSync(join(pub, path), 'utf8') !== html)
    .map(([path]) => path);
  return [...stale, ...strayDirs(files)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = buildPages();
  if (process.argv.includes('--check')) {
    const stale = staleFiles(files);
    if (stale.length) {
      console.error(`Notes pages are stale (${stale.join(', ')}): run node tools/changelog/build.mjs`);
      process.exit(1);
    }
    console.log(`Notes pages are current (${Object.keys(files).length} files)`);
  } else {
    for (const dir of strayDirs(files)) rmSync(join(pub, dir), { recursive: true });
    for (const [path, html] of Object.entries(files)) {
      mkdirSync(dirname(join(pub, path)), { recursive: true });
      writeFileSync(join(pub, path), html);
    }
    const drafts = loadPosts().posts.filter((p) => p.draft).map((p) => p.slug);
    console.log(`${Object.keys(files).length} files -> ${relative(root, pub)}/changelog/${drafts.length ? ` (drafts: ${drafts.join(', ')})` : ''}`);
  }
}
