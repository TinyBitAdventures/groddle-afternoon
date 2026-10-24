#!/usr/bin/env node
/**
 * The Groddle theme's blocks (minn/groddle/blocks/<name>/block.json) and the
 * card icons they draw (minn/groddle/marks/<name>.svg). The note blocks are
 * written from tools/changelog/posts.json: each card's icon is named after the
 * first card that used it, and the feature block's icon attribute lists every
 * name. The restoration blocks are the restoration report's data sections,
 * drawn from public/restoration/data.json (minn/groddle/src/Restoration.php).
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
import { MUSICBLOCK_SERIES } from '../../public/js/musicblocks.js';

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
    ...restorationTypes(leaf),
    ...musicblockTypes(leaf),
    'wiki-topics': { ...leaf('wiki-topics', 'Wiki topics', 'The wiki\'s topics as links, each with how many entries it holds; the one being read is marked.', { allLabel: text('All') }), category: 'widgets', keywords: ['wiki', 'topics'] },
  };
}

/**
 * The Musicblocks wiki entry's data blocks, drawn from public/musicblocks/data.json
 * (tools/musicblocks/build-data.mjs, minn/groddle/src/Musicblocks.php): one
 * series (or the rare blocks) per block, and what a play pays.
 */
function musicblockTypes(leaf) {
  const data = (name, title, description, attributes = {}) => ({ ...leaf(name, title, description, attributes), category: 'widgets', keywords: ['musicblock', 'music'] });
  return {
    musicblocks: data('musicblocks', 'Musicblocks', 'One musicblock series, or the rare blocks, as cards to play, with the series\' collector trophy.', { set: { type: 'string', enum: [...Object.keys(MUSICBLOCK_SERIES), 'rare'], default: 'DG' } }),
    'musicblocks-rules': data('musicblocks-rules', 'Musicblock rules', 'What playing a musicblock costs and pays, read from the game itself.'),
  };
}

/**
 * The restoration report's data sections: each draws its part of the page from
 * data.json (build-restoration.mjs), so its figures are never typed in. The
 * words around them are ordinary blocks.
 */
function restorationTypes(leaf) {
  const data = (name, title, description, attributes = {}) => ({ ...leaf(`restoration-${name}`, title, description, attributes), category: 'widgets', keywords: ['restoration', 'report'] });
  return {
    'restoration-score': data('score', 'Restoration score', 'How many of the game\'s systems are playable again, with a bar and legend by status.'),
    'restoration-street': data('street', 'Restoration street', 'The street diorama: click anything on it to see what has been restored behind it.', { prompt: text('Pick something on the street: a piggy, the tree, a quoin, the shrine…') }),
    'restoration-systems': data('systems', 'Restoration systems', 'Every system of the game by group, with status filters.'),
    'restoration-numbers': data('numbers', 'Restoration numbers', 'Figures counted from the repository, and where the original quests stand. {total} in the heading is the number of original quests.', { questsHeading: text('Where the {total} original quests stand') }),
    'restoration-rooms': data('rooms', 'Restoration quest rooms', 'The quest rooms as cards, each opening its story.'),
    'restoration-designers': data('designers', 'Restoration designers\' levels', 'The levels Tiny Speck\'s designers recorded, grouped by designer.'),
    'restoration-levels': data('levels', 'Restoration levels from words', 'Levels rebuilt from text alone, with no recording.'),
    'restoration-recent': data('recent', 'Restoration recent changes', 'The latest additions and fixes from the project\'s history.'),
    'restoration-lost': data('lost', 'Restoration lost systems', 'The systems that cannot come back, with why.'),
    'restoration-legend': data('legend', 'Restoration tag legend', 'What each status tag means.'),
    'restoration-stamp': data('stamp', 'Restoration stamp', 'When data.json was generated, from how many commits and test files.'),
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
