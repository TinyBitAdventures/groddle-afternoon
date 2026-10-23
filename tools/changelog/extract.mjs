/**
 * One-off: lifts the 20 long-form entries out of the old build archive
 * (public/changelog.html, a single page of <details class="release-log">
 * entries) into tools/changelog/posts.json, word for word.
 *
 * Kept for the record. The archive page is read from git, at the last commit
 * that still held it (ARCHIVE_COMMIT), so this can be re-run after
 * changelog.html became a redirect. Posts already in posts.json that did not
 * come from the archive (new posts, drafts) are kept as they are.
 *
 *   node tools/changelog/extract.mjs            write posts.json
 *   node tools/changelog/extract.mjs --dry-run  print a summary only
 *
 * Text fields hold the entry's own inline HTML (<em>, <span class="code">,
 * entities) exactly as the archive wrote it, with whitespace collapsed.
 * Anything in an entry this script does not recognise stops it, so nothing
 * is dropped silently.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, find, findAll, kids, byClass, byTag, hasClass, inner, plain } from './html.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
export const POSTS_FILE = join(here, 'posts.json');

/** The last commit whose public/changelog.html is the full build archive. */
export const ARCHIVE_COMMIT = '51140eed';
export const ARCHIVE_PATH = 'public/changelog.html';

export const archiveHtml = (commit = ARCHIVE_COMMIT) =>
  execFileSync('git', ['show', `${commit}:${ARCHIVE_PATH}`], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26 });

/** The three night-spanning entries have no label in their meta line. */
const SHORT = {
  'release-2026-07-26': 'world-woke-up',
  'release-2026-07-22': 'systems-night',
  'release-2026-07-20': 'first-spark',
};
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = (n) => String(n).padStart(2, '0');
const slugify = (s) => plain(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^the-/, '');

/** "OCT 19, 2026 · THE WHOLE WORLD" or "JUL 25–26, 2026". */
export function parseMeta(meta) {
  const m = plain(meta).match(/^([A-Z]{3}) (\d{1,2})(?:[–-](\d{1,2}))?, (\d{4})(?: · (.+))?$/);
  if (!m) throw new Error(`unreadable meta line: ${meta}`);
  const [, mon, d1, d2, year, label] = m;
  const month = MONTHS[mon];
  return {
    date: `${year}-${pad(month)}-${pad(d1)}`,
    dateEnd: d2 ? `${year}-${pad(month)}-${pad(d2)}` : undefined,
    label: label || undefined,
  };
}

const fail = (what, node) => { throw new Error(`${what}: <${node.tag} class="${node.attrs.class || ''}"> at ${node.start}`); };
const one = (node, pred, what) => find(node, pred) || fail(`missing ${what}`, node);

function featureCard(article) {
  const mark = one(article, byClass('feature-mark'), 'feature-mark');
  return { mark: inner(mark), title: inner(one(article, byTag('h3'), 'h3')), text: inner(one(article, byTag('p'), 'p')) };
}
function fixCard(article) {
  const mark = one(article, byClass('fix-mark'), 'fix-mark');
  return { mark: inner(mark), title: inner(one(article, byTag('h3'), 'h3')), text: inner(one(article, byTag('p'), 'p')) };
}
function listCard(card) {
  const intro = kids(card, byTag('p'));
  return {
    title: inner(one(card, byTag('h3'), 'h3')),
    ...(intro.length ? { text: inner(intro[0]) } : {}),
    items: findAll(card, byTag('li')).map(inner),
  };
}
const featureGrid = (grid) => {
  const cards = kids(grid);
  if (!cards.length || !cards.every((c) => hasClass(c, 'feature'))) fail('grid without feature cards', grid);
  return cards.map(featureCard);
};

function milestones(explorer) {
  const path = one(explorer, byClass('archive-path'), 'archive-path');
  return {
    type: 'milestones',
    label: path.attrs['aria-label'],
    items: findAll(path, byClass('archive-node')).map((b) => ({
      button: inner(b), kind: b.attrs['data-kind'], title: b.attrs['data-title'], text: b.attrs['data-copy'],
    })),
  };
}
const ledger = (div) => ({
  type: 'ledger',
  label: div.attrs['aria-label'],
  items: kids(div).map((d) => ({ num: inner(one(d, byTag('strong'), 'strong')), caption: inner(one(d, byTag('span'), 'span')) })),
});

/** The quest map's details live in the page script's questData object. */
function questData(root) {
  const script = findAll(root, byTag('script')).map((s) => s.src.slice(s.innerStart, s.innerEnd)).join('\n');
  const m = script.match(/const questData = (\{[\s\S]*?\n {4}\});/);
  if (!m) throw new Error('questData not found in the archive script');
  return Function(`"use strict"; return (${m[1]});`)();
}

function quests(grid, data) {
  const map = one(grid, byClass('quest-map'), 'quest-map');
  const detail = one(grid, byClass('quest-detail'), 'quest-detail');
  const facts = findAll(detail, byClass('quest-fact')).map((f) => inner(one(f, byTag('strong'), 'strong')));
  if (facts.join() !== 'Source,Play,Finish') fail(`unexpected quest facts ${facts}`, detail);
  return {
    type: 'quests',
    label: map.attrs['aria-label'],
    items: findAll(map, byClass('quest-node')).map((b) => {
      const q = data[b.attrs['data-quest']];
      if (!q) fail(`no questData for ${b.attrs['data-quest']}`, b);
      return {
        key: b.attrs['data-quest'], n: inner(b), short: b.attrs['data-short'], label: b.attrs['aria-label'],
        kind: q.kind, title: q.title, text: q.copy, source: q.source, play: q.play, finish: q.finish,
      };
    }),
  };
}

/** One tab panel or entry body, child by child. */
function blocksOf(container, ctx) {
  const out = [];
  for (const child of kids(container)) {
    if (hasClass(child, 'archive-intro') || hasClass(child, 'release-tabs') || hasClass(child, 'tab-panel')) continue;
    if (child.tag === 'hr' && hasClass(child, 'rule')) continue; // a divider line, no content
    if (hasClass(child, 'grid-3') && hasClass(kids(child)[0], 'stat')) {
      out.push({
        type: 'stats',
        ...(child.attrs.id ? { id: child.attrs.id } : {}),
        items: kids(child).map((s) => {
          const num = one(s, byClass('stat-num'), 'stat-num');
          const unit = find(num, byClass('stat-unit'));
          const whole = inner(num);
          return {
            num: unit ? whole.slice(0, whole.indexOf('<span')).trim() : whole,
            ...(unit ? { unit: inner(unit) } : {}),
            caption: inner(one(s, byClass('stat-label'), 'stat-label')),
          };
        }),
      });
    } else if (hasClass(child, 'grid-3')) {
      out.push({ type: 'cards', cards: featureGrid(child) });
    } else if (hasClass(child, 'fix-grid')) {
      out.push({ type: 'cards', variant: 'fix', cards: kids(child).map(fixCard) });
    } else if (hasClass(child, 'grid-2') && kids(child).every((c) => hasClass(c, 'card'))) {
      out.push({ type: 'lists', cards: kids(child).map(listCard) });
    } else if (hasClass(child, 'grid-2') && find(child, byClass('sign-demo'))) {
      const [copy, demo] = kids(child);
      out.push({
        type: 'intro',
        eyebrow: inner(one(copy, byClass('eyebrow'), 'eyebrow')),
        heading: inner(one(copy, byTag('h2'), 'h2')),
        lead: inner(one(copy, byClass('lead'), 'lead')),
      });
      const post = one(demo, byClass('sign-post'), 'sign-post');
      out.push({
        type: 'signs',
        label: post.attrs['aria-label'],
        arms: findAll(post, byClass('sign-arm')).map((b) => ({ text: inner(b), side: hasClass(b, 'left') ? 'left' : 'right' })),
        caption: inner(one(demo, byClass('sign-caption'), 'sign-caption')),
      });
    } else if (hasClass(child, 'grid-2-1') && find(child, byClass('quest-map'))) {
      out.push(quests(child, ctx.questData));
    } else if (hasClass(child, 'archive-explorer')) {
      out.push(milestones(child));
    } else if (hasClass(child, 'archive-ledger')) {
      out.push(ledger(child));
    } else if (child.tag === 'table' && hasClass(child, 'ds-table')) {
      const head = findAll(one(child, byTag('thead'), 'thead'), byTag('th')).map(inner);
      const rows = findAll(one(child, byTag('tbody'), 'tbody'), byTag('tr')).map((tr) => kids(tr, byTag('td')).map(inner));
      out.push({ type: 'table', label: child.attrs['aria-label'], head, rows, numCol: head.length - 1 });
    } else {
      fail('unrecognised block', child);
    }
  }
  return out;
}

export function extractPosts(html) {
  const root = parse(html);
  const ctx = { questData: questData(root) };
  const posts = [];
  for (const d of findAll(root, (n) => n.tag === 'details' && hasClass(n, 'release-log'))) {
    const id = d.attrs.id;
    const summary = one(d, byTag('summary'), 'summary');
    const meta = inner(one(summary, byClass('meta'), 'meta'));
    const head = kids(summary, byTag('div'))[0] || fail('summary without heading', summary);
    const { date, dateEnd, label } = parseMeta(meta);
    const slug = `${date}-${label ? slugify(label) : SHORT[id] || fail(`no short slug for ${id}`, d)}`;
    const body = one(d, byClass('release-body'), 'release-body');
    const post = {
      slug,
      date,
      ...(dateEnd ? { dateEnd } : {}),
      meta,
      ...(label ? { label } : {}),
      title: inner(one(head, byTag('h2'), 'h2')),
      summary: inner(one(head, byTag('p'), 'p')),
    };
    const intro = kids(body, byClass('archive-intro'))[0];
    if (intro) {
      const copy = kids(intro)[0];
      const stamp = one(intro, byClass('archive-stamp'), 'archive-stamp');
      post.eyebrow = inner(one(copy, byClass('eyebrow'), 'eyebrow'));
      post.tags = post.eyebrow.split(' · ').map((t) => t.trim());
      post.subtitle = inner(one(copy, byTag('h2'), 'h2'));
      post.lead = inner(one(copy, byClass('lead'), 'lead'));
      post.stat = { num: inner(one(stamp, byTag('strong'), 'strong')), caption: inner(one(stamp, byTag('span'), 'span')) };
    } else {
      post.tags = [];
    }
    const tabs = kids(body, byClass('release-tabs'))[0];
    let blocks;
    if (tabs) {
      blocks = findAll(tabs, byTag('button')).map((b) => {
        const panel = kids(body, (p) => p.attrs.id === b.attrs['aria-controls'])[0] || fail('tab without panel', b);
        const inside = blocksOf(panel, ctx);
        const proof = inside.find((x) => x.id === 'proof');
        return { type: 'section', id: b.attrs['aria-controls'].replace(/^panel-/, ''), title: inner(b), blocks: inside, ...(proof ? { anchors: ['proof'] } : {}) };
      });
    } else {
      blocks = blocksOf(body, ctx);
    }
    // The entry's first plain grid of feature cards is its main card list.
    const at = blocks.findIndex((b) => b.type === 'cards' && !b.variant);
    if (at >= 0) {
      post.cards = blocks[at].cards;
      blocks.splice(at, 1);
      if (at > 0) post.cardsAt = at;
    } else {
      post.cards = [];
    }
    if (blocks.length) post.blocks = blocks;
    post.archived = { id };
    posts.push(post);
  }
  const slugs = new Set();
  for (const p of posts) {
    if (slugs.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
    slugs.add(p.slug);
  }

  const hero = one(root, (n) => n.attrs.id === 'top', 'hero');
  const archive = {
    source: { commit: ARCHIVE_COMMIT, path: ARCHIVE_PATH },
    title: inner(one(root, byTag('title'), 'title')),
    eyebrow: inner(one(hero, byClass('eyebrow'), 'eyebrow')),
    heading: inner(one(hero, byTag('h1'), 'h1')),
    lead: inner(one(hero, byClass('lead'), 'lead')),
  };
  return { archive, posts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { archive, posts } = extractPosts(archiveHtml());
  const current = existsSync(POSTS_FILE) ? JSON.parse(readFileSync(POSTS_FILE, 'utf8')) : { posts: [] };
  const fromArchive = new Set(posts.map((p) => p.slug));
  const kept = (current.posts || []).filter((p) => !p.archived && !fromArchive.has(p.slug));
  const all = [...kept, ...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const p of posts) console.log(`${p.slug.padEnd(34)} ${plain(p.title)}`);
  console.log(`${posts.length} archived posts, ${kept.length} kept from posts.json`);
  if (!process.argv.includes('--dry-run')) {
    const out = {
      about: 'Groddle Afternoon build notes. One object per post, newest first. Text fields are HTML fragments. Posts with "archived" were lifted word for word from the old build archive by tools/changelog/extract.mjs; "draft": true builds the page but leaves it out of the list. Rebuild the pages with: node tools/changelog/build.mjs',
      archive,
      posts: all,
    };
    writeFileSync(POSTS_FILE, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`-> ${POSTS_FILE}`);
  }
}
