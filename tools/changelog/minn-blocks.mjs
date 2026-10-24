#!/usr/bin/env node
/**
 * The Groddle theme's note blocks (minn/groddle/blocks/<name>/block.json) and
 * the card icons they draw (minn/groddle/marks/<name>.svg), written from
 * tools/changelog/posts.json. Each card's icon is named after the first card
 * that used it; the feature block's icon attribute lists every name.
 *
 *   node tools/changelog/minn-blocks.mjs [--check]
 *
 * --check exits 1 when a file on disk differs from what would be written.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPosts } from './build.mjs';
import { plain } from './html.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const THEME = join(ROOT, 'minn/groddle');
const CHECK = process.argv.includes('--check');

const slug = (s) => plain(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mark';

/** Every distinct card icon, by name: svg markup => name. */
export function markNames(posts = loadPosts().posts) {
  const names = new Map();
  const taken = new Set();
  const visit = (cards) => {
    for (const c of cards || []) {
      if (!c.mark || names.has(c.mark)) continue;
      let name = slug(c.title);
      for (let n = 2; taken.has(name); n++) name = `${slug(c.title)}-${n}`;
      taken.add(name);
      names.set(c.mark, name);
    }
  };
  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (b.type === 'cards') visit(b.cards);
      if (b.type === 'section') walk(b.blocks);
    }
  };
  for (const post of posts) {
    visit(post.cards);
    walk(post.blocks);
  }
  return names;
}

const text = (def = '') => ({ type: 'string', default: def });

/** The block.json files, by folder name. */
export function blockTypes(icons) {
  const leaf = (name, title, description, attributes, parent) => ({
    $schema: 'https://schemas.wp.org/trunk/block.json',
    apiVersion: 3,
    name: `groddle/${name}`,
    title,
    category: 'text',
    description,
    ...(parent ? { parent: [`groddle/${parent}`] } : {}),
    attributes,
    supports: { html: false, className: false, customClassName: false },
    textdomain: 'groddle',
  });
  const example = (child, items) => ({ attributes: {}, innerBlocks: items.map((attributes) => ({ name: `groddle/${child}`, attributes })) });
  return {
    stamp: leaf('stamp', 'Stamp', 'A big figure with a line under it, beside a note\'s opening.', { value: text('0'), caption: text('what the figure counts') }),
    features: { ...leaf('features', 'Feature cards', 'A row of cards, each an icon, a title and a line.', { variant: { type: 'string', enum: ['', 'fix'], default: '' } }), allowedBlocks: ['groddle/feature'], example: example('feature', [{ icon: icons[0], title: 'A card', text: 'What it is about.' }]) },
    feature: leaf('feature', 'Feature card', 'One card: an icon, a title and a line.', { icon: { type: 'string', enum: icons, default: icons[0] }, title: text('A card'), text: text('What it is about.') }, 'features'),
    milestones: { ...leaf('milestones', 'Milestones', 'A numbered run of steps, each with a kind, a title and a line.', { label: text() }), allowedBlocks: ['groddle/milestone'], example: example('milestone', [{ kind: 'Step', title: 'What happened', text: 'How it went.' }]) },
    milestone: leaf('milestone', 'Milestone', 'One step of a milestone run.', { step: text(), kind: text('Step'), title: text('What happened'), text: text('How it went.') }, 'milestones'),
    ledger: { ...leaf('ledger', 'Ledger', 'A strip of figures, each with a line under it.', { label: text(), variant: { type: 'string', enum: ['', 'stats'], default: '' }, id: text() }), allowedBlocks: ['groddle/figure'], example: example('figure', [{ value: '0', caption: 'what the figure counts' }]) },
    figure: leaf('figure', 'Figure', 'One figure in a ledger.', { value: text('0'), unit: text(), caption: text('what the figure counts') }, 'ledger'),
    quests: { ...leaf('quests', 'Quest list', 'Quests as cards, each with where it came from, how it plays and how it ends.', { }), allowedBlocks: ['groddle/quest'], example: example('quest', [{ n: '1', kind: 'Quest', short: '', title: 'A quest', text: 'What it asks.', source: '', play: '', finish: '' }]) },
    quest: leaf('quest', 'Quest', 'One quest card.', { n: text('1'), kind: text('Quest'), short: text(), title: text('A quest'), text: text('What it asks.'), source: text(), play: text(), finish: text() }, 'quests'),
    signpost: { ...leaf('signpost', 'Signpost', 'A signpost drawing with arms pointing left and right, and a caption.', { label: text(), caption: text() }), allowedBlocks: ['groddle/sign'], example: example('sign', [{ side: 'left', text: 'Somewhere' }]) },
    sign: leaf('sign', 'Sign arm', 'One arm of a signpost.', { side: { type: 'string', enum: ['left', 'right'], default: 'left' }, text: text('Somewhere') }, 'signpost'),
  };
}

function main() {
  const marks = markNames();
  const icons = [...marks.values()];
  const files = new Map();
  for (const [svg, name] of marks) files.set(join(THEME, 'marks', `${name}.svg`), svg.trim() + '\n');
  for (const [dir, type] of Object.entries(blockTypes(icons))) files.set(join(THEME, 'blocks', dir, 'block.json'), JSON.stringify(type, null, '\t') + '\n');
  let stale = 0;
  for (const [file, body] of files) {
    const now = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (now === body) continue;
    stale++;
    if (CHECK) { console.log(`stale ${file.slice(ROOT.length + 1)}`); continue; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  const extra = readdirSync(join(THEME, 'marks')).filter((f) => !files.has(join(THEME, 'marks', f)));
  for (const f of extra) console.log(`not drawn by any note: marks/${f}`);
  console.log(`${icons.length} icons, ${Object.keys(blockTypes(icons)).length} blocks, ${stale} ${CHECK ? 'stale' : 'written'}`);
  if (CHECK && stale) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
