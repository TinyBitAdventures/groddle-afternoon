/**
 * Shared scanner for tests/player-copy-dev-refs.test.js: finds developer
 * references (source files, GSJS, register rows, QA, tsids) in the text a
 * player reads. Comments and data `source` fields are not copy and may keep
 * them; the scanner only looks where a player-facing string goes.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const pub = join(root, 'public');
const acorn = createRequire(import.meta.url)('acorn');

/** The deny list: each names what it catches. */
export const DENY = [
  ['GSJS', /\bGSJS\b/],
  ['source repo', /glitch-(?:GameServerJS|client|locations|items|overlays)\b|\bGameServerJS\b/i],
  ['catalog file', /\bcatalog_[a-z_]+/],
  ['file name', /\b[\w-]+\.(?:js|mjs|as|swf|xml|php|go)\b/],
  ['register row', /\bregister(?: row)? G\d+|\(G\d{2,4}\)|\bG\d{2,4}\b(?![-.])/i],
  ['QA', /\bQA\b/],
  ['source note', /\(source\b|\bsource:/i],
  ['tsid', /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z][A-Z0-9]*[A-Z])[GLIBRP][A-Z0-9]{14}\b/],
  ['todo', /\b(?:TODO|FIXME|XXX)\b/],
];

/** The first deny rule a text breaks, or null. */
export function denied(text) {
  const s = String(text ?? '');
  for (const [name, re] of DENY) {
    const m = re.exec(s);
    if (m) return { rule: name, match: m[0] };
  }
  return null;
}

/**
 * Object keys whose string values a player reads (labels, descriptions,
 * tooltips, lines, toasts). `source`, `why`, `note` and the like are data
 * provenance unless a file names them in PLAYER_NOTE_FILES.
 */
export const PLAYER_KEYS = new Set([
  'desc', 'description', 'label', 'labelPlural', 'tooltip', 'tip', 'title', 'subtitle', 'text', 'message', 'msg',
  'say', 'line', 'lines', 'prompt', 'hint', 'placeholder', 'caption', 'empty', 'help', 'verb', 'toast',
  'notice', 'body', 'kicker', 'byline', 'heading', 'ariaLabel', 'aria-label', 'confirm', 'cancel', 'ok',
  'blurb', 'flavor', 'flavour', 'instructions', 'objective', 'question', 'answer', 'reply', 'greeting',
  'name_single', 'name_plural', 'namePlural', 'shortDesc', 'longDesc', 'detail', 'details', 'summary', 'reason',
]);

/** Keys that hold provenance (where a number or a layout came from); nothing under them is copy. */
const PROVENANCE_KEYS = new Set(['source', 'sources', 'why', 'gsjs', 'provenance', 'register', 'evidence', 'refs']);

/** Files whose `note` / `reason` values are shown to players. */
export const PLAYER_NOTE_FILES = new Map([
  ['js/imagination-remake.js', new Set(['note'])],
  ['js/skill-tree.js', new Set(['note'])],
]);

/** Calls whose string arguments a player reads. */
const PLAYER_CALLS = new Set([
  'toast', 'say', 'notice', 'pushActivity', 'floatText', 'announce', 'showToast', 'speak', 'bubble',
  'showNotice', 'setPrompt', 'activity', 'alert', 'confirm',
]);
/** Names of copy tables: objects of the words a panel or a feature shows. */
const COPY_TABLE = /^(?:[A-Z][A-Z0-9_]*_(?:TEXT|COPY|WORDS|LINES|MESSAGES|LABELS)|T)$/;
/** DOM properties whose assigned strings a player reads. */
const PLAYER_PROPS = new Set(['textContent', 'innerText', 'innerHTML', 'title', 'placeholder', 'ariaLabel', 'alt']);

/** Folders that are developer pages or tools, not the game a player plays. */
const SKIP = /^(vendor|restoration|codebase|changelog|avatar-lab|builder-render|compare|brand|race-lab|musicblocks|street-music|js\/builder|js\/data-versions\.js)(\/|$)/;

const walk = (dir, skip) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (skip(rel(path))) return [];
  return statSync(path).isDirectory() ? walk(path, skip) : [path];
});
export const rel = (path) => relative(pub, path).split(sep).join('/');

/** The game's own modules: public/game.js, content.js and public/js (developer folders aside). */
export function gameModules() {
  return walk(pub, (p) => SKIP.test(p) || /^(encyclopedia|landing|site|play|assets)(\/|$)/.test(p))
    .filter((p) => /\.m?js$/.test(p));
}

/** Text of a template literal with its placeholders as a mark, HTML tags and entities dropped. */
function templateText(node) {
  const raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('…');
  return stripTags(raw);
}
export function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
}

function literalTexts(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') out.push({ text: stripTags(node.value), node });
      break;
    case 'TemplateLiteral':
      out.push({ text: templateText(node), node });
      break;
    case 'BinaryExpression':
      if (node.operator === '+') { literalTexts(node.left, out); literalTexts(node.right, out); }
      break;
    case 'ConditionalExpression':
      literalTexts(node.consequent, out); literalTexts(node.alternate, out);
      break;
    case 'LogicalExpression':
      literalTexts(node.left, out); literalTexts(node.right, out);
      break;
    case 'ArrayExpression':
      for (const e of node.elements) literalTexts(e, out);
      break;
    case 'CallExpression':
      // `x.replace(...)`, `String(...)`, `plainWords(...)`: look through the call at its literals.
      if (node.callee?.type === 'MemberExpression') literalTexts(node.callee.object, out);
      for (const a of node.arguments) literalTexts(a, out);
      break;
    default:
  }
  return out;
}

const keyName = (k) => (k?.type === 'Identifier' ? k.name : typeof k?.value === 'string' ? k.value : null);
const calleeName = (c) => (c?.type === 'Identifier' ? c.name : c?.type === 'MemberExpression' && !c.computed ? c.property.name : null);

/** Every player-facing string in one module that breaks the deny list. */
export function scanModule(file) {
  const src = readFileSync(file, 'utf8');
  const path = rel(file);
  const noteKeys = PLAYER_NOTE_FILES.get(path) || new Set();
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true });
  const hits = [];
  const check = (value, why) => {
    for (const { text, node } of literalTexts(value)) {
      const d = denied(text);
      if (d) hits.push(`${path}:${node.loc.start.line} [${why}] ${d.rule} "${d.match}": ${text.replace(/\s+/g, ' ').trim().slice(0, 110)}`);
    }
  };
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Property' && !node.computed) {
      const k = keyName(node.key);
      // A provenance record (why: { street, caption, ... }) is data about the code, not copy.
      if (k && PROVENANCE_KEYS.has(k)) return;
      if (k && (PLAYER_KEYS.has(k) || noteKeys.has(k))) check(node.value, k);
    } else if (node.type === 'CallExpression') {
      const name = calleeName(node.callee);
      if (name && PLAYER_CALLS.has(name)) for (const a of node.arguments) check(a, `${name}()`);
      // el('tag', attrs, 'text') and setAttribute('title' | 'aria-label', text)
      if (name === 'setAttribute' && node.arguments[0]?.type === 'Literal' && /^(title|aria-label|alt|placeholder)$/.test(node.arguments[0].value)) check(node.arguments[1], 'setAttribute');
    } else if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && COPY_TABLE.test(node.id.name) && node.init) {
      // A copy table (FOO_TEXT, PACK_COPY, T): every string in it is something a player reads.
      const all = [];
      const collect = (n) => {
        if (!n || typeof n.type !== 'string') return;
        if (n.type === 'Literal' || n.type === 'TemplateLiteral') { all.push(n); return; }
        if (n.type === 'Property' && n.computed) return collect(n.value);
        for (const key of Object.keys(n)) {
          if (key === 'loc' || (n.type === 'Property' && key === 'key')) continue;
          const v = n[key];
          if (Array.isArray(v)) v.forEach(collect);
          else if (v && typeof v.type === 'string') collect(v);
        }
      };
      collect(node.init);
      for (const lit of all) check(lit, node.id.name);
    } else if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && !node.left.computed) {
      if (PLAYER_PROPS.has(node.left.property.name)) check(node.right, node.left.property.name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast);
  return hits;
}

/** The visible text of an HTML page: no comments, scripts, styles or tags; title/alt/aria-label/placeholder kept. */
export function pageText(html) {
  const attrs = [...html.matchAll(/\s(?:title|alt|aria-label|placeholder|content)="([^"]*)"/g)].map((m) => m[1]).join('\n');
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return `${body}\n${attrs}`;
}

export const pagesUnder = (dir) => walk(join(pub, dir), () => false).filter((p) => p.endsWith('.html'));
