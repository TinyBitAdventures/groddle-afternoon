/**
 * Static emission scanner for tools/inventory/build.mjs.
 *
 * Parses JavaScript as text (acorn, never executed) and finds what a set of
 * "emitter" calls can be called with: which achievement counters the remake
 * increments (engine.achievement, applyAchievementProgress), which badges it
 * grants outright, which buffs it applies, which items it adds to the pack;
 * and the same for the original GameServerJS (achievements_increment,
 * achievements_grant, buffs_apply). The GSJS files are data: they are parsed,
 * never run.
 *
 * Each emitter argument is resolved to a set of string patterns by a small
 * abstract evaluator:
 *   - string literals, template literals, `+` concatenation, `a || b`, `c ? a : b`
 *   - identifiers: the innermost binding by source range (function params,
 *     local and module consts, for-of bindings, destructuring), then imports
 *     (followed into the exporting file), then a name declared once anywhere
 *   - function params: bound to the arguments of every call of that function
 *     (same file, plus files that import it); a call being inlined binds them
 *     directly
 *   - calls of known functions: their `return` expressions, params bound
 *   - String(x), x.trim(), x.toLowerCase(), x.split(s)[i]: passed through
 *   - `obj.key`: the `key` property of whatever object `obj` resolves to,
 *     otherwise every `key:` property value in the scanned code (the
 *     `{ counter, amount }` row convention), capped
 *   - `this.class_tsid` inside a GSJS items/<id>.js or quests/<id>.js file
 * Anything else becomes a wildcard. A wildcard born from an unresolvable
 * parameter carries a constraint: the string and regex literals of the
 * function that owns the parameter (e.g. worldVerbAchievementCounters only
 * emits npc_piggy:pet because its guards name those). A pattern made only of
 * unconstrained wildcards proves nothing and is reported as unresolved.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve as resolvePath } from 'node:path';
import { parse } from 'acorn';

const MAX_DEPTH = 14;
const MAX_PATTERNS = 400;
const KEY_TABLE_CAP = 600;

/* ------------------------------------------------------------------ */
/* Files                                                                */
/* ------------------------------------------------------------------ */

/** Every .js/.mjs file under `dir` (recursive), skipping `skip` folder names. */
export function listJsFiles(dir, { skip = ['node_modules'] } = {}) {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      if (skip.includes(f)) continue;
      const p = join(d, f);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(m?js)$/.test(f)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/* ------------------------------------------------------------------ */
/* AST walking                                                          */
/* ------------------------------------------------------------------ */

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) { if (c && typeof c.type === 'string') walk(c, visit, node); }
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

function propName(p) {
  if (!p || p.computed) return p?.key?.type === 'Literal' ? String(p.key.value) : null;
  if (p.key.type === 'Identifier') return p.key.name;
  if (p.key.type === 'Literal') return String(p.key.value);
  return null;
}

/** Names bound by a pattern, with the object key path that leads to each. */
function patternBindings(pat, path = []) {
  if (!pat) return [];
  if (pat.type === 'Identifier') return [{ name: pat.name, path, node: pat }];
  if (pat.type === 'AssignmentPattern') return patternBindings(pat.left, path).map((b) => ({ ...b, def: b.def || pat.right }));
  if (pat.type === 'RestElement') return patternBindings(pat.argument, [...path, '*']);
  if (pat.type === 'ObjectPattern') {
    return pat.properties.flatMap((p) => (p.type === 'RestElement'
      ? patternBindings(p.argument, [...path, '*'])
      : patternBindings(p.value, [...path, propName(p)])));
  }
  if (pat.type === 'ArrayPattern') return pat.elements.flatMap((e, i) => patternBindings(e, [...path, `[${i}]`]));
  return [];
}

/* ------------------------------------------------------------------ */
/* Index                                                                */
/* ------------------------------------------------------------------ */

/**
 * Build a scan index over files: [{ path, text, rel }] or paths.
 * `sourceType` 'module' (remake) or 'script' (GSJS).
 */
export function buildIndex(files, { sourceType = 'module', root = '' } = {}) {
  const index = { files: [], byPath: new Map(), keyTable: new Map(), globalDecls: new Map(), fnByName: new Map(), failures: [] };
  for (const f of files) {
    const path = typeof f === 'string' ? f : f.path;
    const text = typeof f === 'string' ? readFileSync(f, 'utf8') : f.text;
    let ast;
    try {
      ast = parse(text, { ecmaVersion: 'latest', sourceType, allowReturnOutsideFunction: true, allowHashBang: true, allowImportExportEverywhere: true, locations: true });
    } catch (e) {
      try {
        ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true, locations: true });
      } catch (e2) {
        index.failures.push({ path, error: e.message });
        continue;
      }
    }
    const file = indexFile({ path, rel: root ? relative(root, path) : path, text, ast });
    index.files.push(file);
    index.byPath.set(resolvePath(path), file);
  }
  for (const file of index.files) {
    for (const [k, list] of file.props) {
      if (!index.keyTable.has(k)) index.keyTable.set(k, []);
      const arr = index.keyTable.get(k);
      for (const v of list) arr.push({ file, node: v });
    }
    for (const d of file.decls) {
      if (d.owner || d.kind === 'param' || d.kind === 'forof') continue;
      if (!index.globalDecls.has(d.name)) index.globalDecls.set(d.name, []);
      index.globalDecls.get(d.name).push({ file, decl: d });
    }
    for (const [name, list] of file.fnNames) {
      if (!index.fnByName.has(name)) index.fnByName.set(name, []);
      for (const fn of list) index.fnByName.get(name).push({ file, fn });
    }
  }
  return index;
}

/**
 * The arguments of every `name.push(...)` call on the binding an array literal initialises, inside the
 * function that declares it (the whole file for a module-level one): what the array holds beyond its literal.
 */
function pushedOnto(file, arrayNode) {
  const out = [];
  for (const d of file.decls) {
    if (d.node !== arrayNode || d.kind === 'param' || d.path?.length) continue;
    const from = d.owner ? d.owner.start : 0;
    const to = d.owner ? d.owner.end : Infinity;
    for (const c of file.calls) {
      const callee = c.callee;
      if (c.start < from || c.end > to || callee?.type !== 'MemberExpression' || callee.computed) continue;
      if (callee.property.name !== 'push' || callee.object.type !== 'Identifier' || callee.object.name !== d.name) continue;
      out.push(...c.arguments);
    }
  }
  return out;
}

function indexFile({ path, rel, text, ast }) {
  const file = {
    path, rel, text, ast,
    fns: [], // function nodes
    decls: [], // { name, kind, node(init), owner(fn|null), start, path, fn, index, def, iter }
    fnNames: new Map(), // name -> [fn]
    fnNameOf: new Map(), // fn -> [names]
    calls: [], // CallExpression nodes
    props: new Map(), // key -> [value nodes] (object literal properties)
    imports: new Map(), // local name -> { source, imported }
    literals: [], // { start, value } string literals
    deps: [], // module specifiers: static imports, re-exports, import('literal')
    regexes: [], // { start, re }
    itemId: /\/(items|quests|achievements)\/[^/]+\.js$/.test(path) && !/\/include\//.test(path) ? basename(path, '.js') : null,
  };
  const nameFn = (name, fn) => {
    if (!name || !fn) return;
    if (!file.fnNames.has(name)) file.fnNames.set(name, []);
    file.fnNames.get(name).push(fn);
    if (!file.fnNameOf.has(fn)) file.fnNameOf.set(fn, []);
    file.fnNameOf.get(fn).push(name);
  };
  walk(ast, (n, parent) => {
    if (isFn(n)) {
      file.fns.push(n);
      if (n.id?.name) nameFn(n.id.name, n);
      n.params.forEach((p, index) => {
        for (const b of patternBindings(p)) file.decls.push({ name: b.name, kind: 'param', fn: n, index, path: b.path, def: b.def, start: n.start, scopeFn: n });
      });
    }
    if (n.type === 'VariableDeclarator') {
      if (n.id.type === 'Identifier') {
        file.decls.push({ name: n.id.name, kind: 'const', node: n.init, start: n.start });
        if (isFn(n.init)) nameFn(n.id.name, n.init);
      } else {
        for (const b of patternBindings(n.id)) file.decls.push({ name: b.name, kind: 'destruct', node: n.init, path: b.path, def: b.def, start: n.start });
      }
    }
    if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left) {
      const pat = n.left.type === 'VariableDeclaration' ? n.left.declarations[0].id : n.left;
      for (const b of patternBindings(pat)) file.decls.push({ name: b.name, kind: 'forof', iter: n.right, forIn: n.type === 'ForInStatement', path: b.path, start: n.start, scopeNode: n });
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.operator === '=') {
      file.decls.push({ name: n.left.name, kind: 'const', node: n.right, start: n.start, assign: true });
      if (isFn(n.right)) nameFn(n.left.name, n.right);
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && isFn(n.right)) {
      nameFn(n.left.property.name, n.right);
    }
    if ((n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition') && n.key) {
      const k = propName(n);
      if (k && isFn(n.value)) nameFn(k, n.value);
      if (k && n.type === 'Property' && parent?.type === 'ObjectExpression') {
        if (!file.props.has(k)) file.props.set(k, []);
        file.props.get(k).push(n.value);
      }
    }
    if (n.type === 'CallExpression') file.calls.push(n);
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source?.value) file.deps.push(n.source.value);
    if (n.type === 'ImportExpression' && n.source?.type === 'Literal' && typeof n.source.value === 'string') file.deps.push(n.source.value);
    if (n.type === 'ImportDeclaration') {
      for (const s of n.specifiers) {
        file.imports.set(s.local.name, { source: n.source.value, imported: s.type === 'ImportSpecifier' ? (s.imported.name ?? s.imported.value) : s.type === 'ImportDefaultSpecifier' ? 'default' : '*' });
      }
    }
    if (n.type === 'Literal' && typeof n.value === 'string') file.literals.push({ start: n.start, value: n.value });
    if (n.type === 'TemplateLiteral' && n.expressions.length === 0) file.literals.push({ start: n.start, value: n.quasis[0].value.cooked ?? '' });
    if (n.type === 'Literal' && n.regex) {
      try { file.literals.push({ start: n.start, regex: new RegExp(n.regex.pattern.replace(/^\^/, '').replace(/\$$/, ''), n.regex.flags.replace(/[gy]/g, '')) }); } catch { /* ignore */ }
    }
  });
  // Owner function for each declaration (innermost function containing it).
  const sortedFns = [...file.fns].sort((a, b) => a.start - b.start);
  file.ownerOf = (pos) => {
    let best = null;
    for (const fn of sortedFns) {
      if (fn.start > pos) break;
      if (fn.end >= pos && (!best || fn.start >= best.start)) best = fn;
    }
    return best;
  };
  for (const d of file.decls) {
    if (d.kind === 'param') { d.owner = d.fn; continue; }
    d.owner = file.ownerOf(d.start);
  }
  file.enclosing = (pos) => sortedFns.filter((fn) => fn.start <= pos && fn.end >= pos).sort((a, b) => b.start - a.start);
  return file;
}

/* ------------------------------------------------------------------ */
/* Patterns                                                             */
/* ------------------------------------------------------------------ */

/** A wildcard part. `cons` = { strings: Set, regexes: [] } or null (anything). */
const wild = (cons = null, why = '') => ({ wild: true, cons, why });
const isWild = (p) => typeof p === 'object' && p?.wild;

function concat(a, b) {
  const out = [];
  for (const x of a) for (const y of b) {
    out.push([...x, ...y]);
    if (out.length > MAX_PATTERNS) return [[wild(null, 'too many combinations')]];
  }
  return out;
}

function normalise(pattern) {
  const out = [];
  for (const p of pattern) {
    if (typeof p === 'string') {
      if (!p) continue;
      if (typeof out[out.length - 1] === 'string') out[out.length - 1] += p;
      else out.push(p);
    } else if (isWild(p)) {
      const prev = out[out.length - 1];
      if (isWild(prev) && !prev.cons && !p.cons) continue;
      out.push(p);
    }
  }
  return out;
}

function dedupe(patterns) {
  const seen = new Map();
  for (const p of patterns) {
    const n = normalise(p);
    const key = patternString(n);
    if (!seen.has(key)) seen.set(key, n);
  }
  return [...seen.values()];
}

/** Human-readable pattern: literals as-is, wildcards as * (or {a|b} when constrained). */
export function patternString(pattern) {
  return pattern.map((p) => {
    if (typeof p === 'string') return p;
    if (!p.cons) return '*';
    const list = [...p.cons.strings].slice(0, 6);
    const more = p.cons.strings.size + p.cons.regexes.length - list.length;
    return `{${list.join('|')}${more > 0 ? `|+${more}` : ''}}`;
  }).join('');
}

/** True when a pattern carries no literal text beyond separators and no constrained wildcard. */
export function isUninformative(pattern) {
  const lit = pattern.filter((p) => typeof p === 'string').join('').replace(/[:_\s-]/g, '');
  return !lit && !pattern.some((p) => isWild(p) && p.cons);
}

function consMatches(cons, s) {
  if (cons.strings.has(s)) return true;
  return cons.regexes.some((re) => { re.lastIndex = 0; const m = re.exec(s); return m && m.index === 0 && m[0].length === s.length; });
}

/** Does `pattern` match the whole string `s`? */
export function matchPattern(pattern, s) {
  const go = (i, pos) => {
    if (i === pattern.length) return pos === s.length;
    const p = pattern[i];
    if (typeof p === 'string') return s.startsWith(p, pos) && go(i + 1, pos + p.length);
    for (let end = s.length; end > pos; end -= 1) {
      if (p.cons && !consMatches(p.cons, s.slice(pos, end))) continue;
      if (go(i + 1, end)) return true;
    }
    return false;
  };
  return go(0, 0);
}

/** Can `pattern` produce some string that starts with `prefix` and continues? Returns the label set or true (open). */
export function prefixLabels(pattern, prefix) {
  // Walk literal text; at the point where the prefix is consumed, collect what follows.
  const labels = new Set();
  let open = false;
  const go = (i, rest, acc) => {
    if (rest.length === 0) {
      // The remainder of the pattern from part i (with `acc` carried) is the label.
      const tail = pattern.slice(i);
      if (tail.some((p) => isWild(p) && !p.cons)) { open = true; return; }
      let combos = [acc];
      for (const p of tail) {
        if (typeof p === 'string') combos = combos.map((c) => c + p);
        else {
          const next = [];
          for (const c of combos) {
            for (const s of p.cons.strings) next.push(c + s);
            if (p.cons.regexes.length) open = true;
          }
          combos = next.slice(0, 2000);
        }
      }
      for (const c of combos) if (c) labels.add(c);
      return;
    }
    if (i === pattern.length) return;
    const p = pattern[i];
    if (typeof p === 'string') {
      const n = Math.min(p.length, rest.length);
      if (p.slice(0, n) !== rest.slice(0, n)) return;
      if (p.length > rest.length) go(i + 1, '', acc + p.slice(n));
      else go(i + 1, rest.slice(n), acc);
      return;
    }
    if (!p.cons) {
      // An open wildcard can swallow the rest of the prefix and more.
      open = true;
      return;
    }
    for (const s of p.cons.strings) {
      const n = Math.min(s.length, rest.length);
      if (s.slice(0, n) !== rest.slice(0, n)) continue;
      if (s.length > rest.length) go(i + 1, '', acc + s.slice(n));
      else go(i + 1, rest.slice(n), acc);
    }
    // A regex-constrained wildcard takes part only where one of its regexes matches a piece of the prefix
    // (a guard like /^(pet|feed)$/ never spells "artifacts_made"); one that can take all of it stays open.
    for (const re of p.cons.regexes) {
      for (let end = 1; end <= rest.length; end += 1) {
        re.lastIndex = 0;
        const m = re.exec(rest.slice(0, end));
        if (!m || m.index !== 0 || m[0].length !== end) continue;
        if (end === rest.length) open = true;
        else go(i + 1, rest.slice(end), acc);
      }
    }
  };
  go(0, prefix, '');
  return open ? true : labels;
}

/* ------------------------------------------------------------------ */
/* Parents and guards                                                   */
/* ------------------------------------------------------------------ */

const parentMaps = new WeakMap();
/** node -> parent for every node of an indexed file (built once, on first use). */
export function parentsOf(file) {
  if (!parentMaps.has(file)) {
    const m = new Map();
    walk(file.ast, (n, parent) => { if (parent) m.set(n, parent); });
    parentMaps.set(file, m);
  }
  return parentMaps.get(file);
}

const EQ_OPS = new Set(['===', '==']);
const NE_OPS = new Set(['!==', '!=']);

/** `x.prop === 'lit'` (either side): { name, prop, value, eq } or null. */
function memberEquality(test) {
  if (test?.type !== 'BinaryExpression' || !(EQ_OPS.has(test.operator) || NE_OPS.has(test.operator))) return null;
  const sides = [[test.left, test.right], [test.right, test.left]];
  for (const [m, lit] of sides) {
    if (m.type !== 'MemberExpression' || m.computed || m.object.type !== 'Identifier') continue;
    if (lit.type !== 'Literal' || typeof lit.value !== 'string') continue;
    return { name: m.object.name, prop: m.property.name, value: lit.value, eq: EQ_OPS.has(test.operator) };
  }
  return null;
}

/**
 * Guards a test proves when it holds (`truthy`) or fails: [{ name, prop, eq: Set|null, ne: Set|null }].
 * `a && b` holds -> both; `x.p === 'a' || x.p === 'b'` holds -> x.p in {a, b}; the negation of a
 * single comparison (or of an `||` of them on one member) is its complement.
 */
function guardsFromTest(test, truthy) {
  if (!test) return [];
  if (test.type === 'LogicalExpression' && test.operator === '&&') return truthy ? [...guardsFromTest(test.left, true), ...guardsFromTest(test.right, true)] : [];
  if (test.type === 'LogicalExpression' && test.operator === '||') {
    if (!truthy) return [...guardsFromTest(test.left, false), ...guardsFromTest(test.right, false)];
    const l = guardsFromTest(test.left, true);
    const r = guardsFromTest(test.right, true);
    if (l.length === 1 && r.length === 1 && l[0].name === r[0].name && l[0].prop === r[0].prop && l[0].eq && r[0].eq) {
      return [{ name: l[0].name, prop: l[0].prop, eq: new Set([...l[0].eq, ...r[0].eq]), ne: null }];
    }
    return [];
  }
  if (test.type === 'UnaryExpression' && test.operator === '!') return guardsFromTest(test.argument, !truthy);
  const m = memberEquality(test);
  if (!m) return [];
  const isEq = m.eq === truthy;
  return [{ name: m.name, prop: m.prop, eq: isEq ? new Set([m.value]) : null, ne: isEq ? null : new Set([m.value]) }];
}

const guardMemo = new WeakMap();
/**
 * Discriminator guards around `node`: the `if`, `?:`, `&&` and `switch` tests that must hold for
 * it to run, e.g. `if (e.type === 'grant_item') addItem(inv, e.classTsid)` -> e.type in {grant_item}.
 * The resolver drops effect rows a guard rules out ({ type: 'consume_item', classTsid } there).
 */
export function guardsAt(file, node) {
  let byFile = guardMemo.get(file);
  if (!byFile) { byFile = new Map(); guardMemo.set(file, byFile); }
  if (byFile.has(node)) return byFile.get(node);
  const parents = parentsOf(file);
  const out = [];
  let child = node;
  let p = parents.get(node);
  while (p) {
    if ((p.type === 'IfStatement' || p.type === 'ConditionalExpression') && child !== p.test) {
      out.push(...guardsFromTest(p.test, child === p.consequent));
    } else if (p.type === 'LogicalExpression' && p.operator === '&&' && child === p.right) {
      out.push(...guardsFromTest(p.left, true));
    } else if (p.type === 'SwitchCase' && child !== p.test) {
      const sw = parents.get(p);
      const d = sw?.discriminant;
      if (d?.type === 'MemberExpression' && !d.computed && d.object.type === 'Identifier') {
        const i = sw.cases.indexOf(p);
        const labels = new Set();
        // Fallthrough: empty cases just above share this body.
        for (let k = i; k >= 0 && (k === i || !sw.cases[k].consequent.length); k -= 1) {
          const t = sw.cases[k].test;
          if (!t) { labels.clear(); break; }
          if (t.type === 'Literal' && typeof t.value === 'string') labels.add(t.value);
        }
        if (labels.size) out.push({ name: d.object.name, prop: d.property.name, eq: labels, ne: null });
        else if (!p.test) {
          const others = sw.cases.filter((c) => c.test?.type === 'Literal' && typeof c.test.value === 'string').map((c) => c.test.value);
          if (others.length) out.push({ name: d.object.name, prop: d.property.name, eq: null, ne: new Set(others) });
        }
      }
    }
    child = p;
    p = parents.get(p);
  }
  byFile.set(node, out);
  return out;
}

/** Does an object expression's literal `prop` value break one of the guards on its binding? */
function ruledOut(objNode, guards) {
  if (objNode.type !== 'ObjectExpression') return false;
  for (const g of guards) {
    const p = objNode.properties.find((x) => x.type === 'Property' && propName(x) === g.prop);
    if (!p || p.value.type !== 'Literal' || typeof p.value.value !== 'string') continue;
    const v = p.value.value;
    if (g.eq && !g.eq.has(v)) return true;
    if (g.ne && g.ne.has(v)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Resolver                                                             */
/* ------------------------------------------------------------------ */

export function createResolver(index, opts = {}) {
  // Keys whose values are looked up across every scanned file when `obj` itself cannot be
  // resolved (the `{ counter, amount }` row convention). Other keys stay wildcards.
  const keyTableKeys = opts.keyTableKeys || ['counter', 'counters', 'achievement', 'badge', 'badges', 'buffId', 'buff', 'events'];
  const memo = new Map();
  const BUDGET = opts.budget || 40000;
  let budget = BUDGET;
  let topDepth = 0;

  function consFor(file, fn) {
    if (!fn) return null;
    const strings = new Set();
    const regexes = [];
    for (const l of file.literals) {
      if (l.start < fn.start || l.start > fn.end) continue;
      if (l.regex) regexes.push(l.regex);
      else if (l.value && l.value.length <= 80) strings.add(l.value);
    }
    if (!strings.size && !regexes.length) return null;
    if (strings.size > 60) return null;
    return { strings, regexes };
  }

  function fileForImport(file, source) {
    if (!source.startsWith('.')) return null;
    const target = resolvePath(dirname(file.path), source.replace(/\?.*$/, ''));
    return index.byPath.get(target) || index.byPath.get(`${target}.js`) || index.byPath.get(`${target}.mjs`) || null;
  }

  /** Bindings of identifier `name` visible at position `pos` in `file`. */
  function bindingsAt(file, name, pos) {
    const cands = file.decls.filter((d) => d.name === name && (!d.owner || (d.owner.start <= pos && d.owner.end >= pos)));
    if (!cands.length) return [];
    // Innermost owner wins.
    let best = -1;
    for (const d of cands) best = Math.max(best, d.owner ? d.owner.start : -1);
    return cands.filter((d) => (d.owner ? d.owner.start : -1) === best);
  }

  /** Call sites of a function node: [{ file, call }]. */
  function callersOf(file, fn) {
    const names = file.fnNameOf.get(fn) || [];
    const out = [];
    for (const name of names) {
      for (const call of file.calls) {
        const c = call.callee;
        const cname = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
        if (cname === name) out.push({ file, call });
      }
      // Files that import this name from this file.
      for (const other of index.files) {
        if (other === file) continue;
        for (const [local, imp] of other.imports) {
          if (imp.imported !== name) continue;
          if (fileForImport(other, imp.source) !== file) continue;
          for (const call of other.calls) if (call.callee.type === 'Identifier' && call.callee.name === local) out.push({ file: other, call });
        }
      }
    }
    return out;
  }

  /** The value at a destructuring path inside an object expression. */
  function atPath(results, path) {
    let cur = results;
    for (const step of path) {
      if (step === '*') return [];
      const next = [];
      for (const r of cur) {
        for (const o of objectsOf(r.file, r.node, r.env, r.depth + 1)) {
          if (step.startsWith('[')) {
            const i = Number(step.slice(1, -1));
            if (o.node.type === 'ArrayExpression' && o.node.elements[i]) next.push({ file: o.file, node: o.node.elements[i], env: o.env, depth: r.depth + 1 });
          } else if (o.node.type === 'ObjectExpression') {
            for (const p of o.node.properties) if (p.type === 'Property' && propName(p) === step) next.push({ file: o.file, node: p.value, env: o.env, depth: r.depth + 1 });
          }
        }
      }
      cur = next;
    }
    return cur;
  }

  /** Expression nodes a binding can hold: [{ file, node, env, depth }] or [{ wild }]. */
  function bindingValues(file, d, env, depth) {
    if (env && env.has(d)) return d.kind === 'param' ? env.get(d).map((v) => ({ ...v, viaParam: d, paramFile: file })) : env.get(d);
    if (d.kind === 'param') {
      const out = [];
      if (d.def) out.push({ file, node: d.def, env: null, depth });
      for (const { file: cf, call } of callersOf(file, d.fn)) {
        const arg = call.arguments[d.index];
        if (!arg || arg.type === 'SpreadElement') continue;
        const base = [{ file: cf, node: arg, env: null, depth: depth + 1 }];
        out.push(...(d.path.length ? atPath(base, d.path) : base));
      }
      if (!out.length) return [{ wildParam: d, file }];
      return out.map((v) => ({ ...v, viaParam: d, paramFile: file }));
    }
    if (d.kind === 'const') return d.node ? [{ file, node: d.node, env, depth }] : [];
    if (d.kind === 'destruct') {
      const base = d.node ? [{ file, node: d.node, env, depth }] : [];
      const got = atPath(base, d.path);
      if (d.path.length === 1 && !got.length) return keyTableValues(d.path[0], depth);
      return got;
    }
    if (d.kind === 'forof') {
      const elems = elementsOf(file, d.iter, env, depth + 1, d.forIn);
      if (!d.path.length) return elems;
      const got = atPath(elems, d.path);
      if (!got.length && d.path.length === 1 && !d.path[0].startsWith('[')) return keyTableValues(d.path[0], depth);
      return got;
    }
    return [];
  }

  function keyTableValues(key, depth) {
    if (!keyTableKeys.includes(key)) return [];
    const list = index.keyTable.get(key) || [];
    if (list.length > KEY_TABLE_CAP) return [];
    return list.map((r) => ({ file: r.file, node: r.node, env: null, depth: depth + 1 }));
  }

  /** Identifier → values from its bindings, imports or a unique global. */
  function identValues(file, node, env, depth) {
    const name = node.name;
    const local = bindingsAt(file, name, node.start);
    if (local.length) return local.flatMap((d) => bindingValues(file, d, env, depth));
    const imp = file.imports.get(name);
    if (imp) {
      const target = fileForImport(file, imp.source);
      if (target) {
        const decls = target.decls.filter((d) => d.name === imp.imported && !d.owner);
        if (decls.length) return decls.flatMap((d) => bindingValues(target, d, null, depth));
        const fns = target.fnNames.get(imp.imported);
        if (fns) return fns.map((fn) => ({ file: target, node: fn, env: null, depth }));
      }
    }
    const g = index.globalDecls.get(name) || [];
    if (g.length && g.length <= 3) return g.flatMap(({ file: gf, decl }) => bindingValues(gf, decl, null, depth));
    return [];
  }

  /** Object/array expressions `node` may evaluate to. */
  function objectsOf(file, node, env, depth) {
    if (!node || depth > MAX_DEPTH) return [];
    if (--budget < 0) return [];
    switch (node.type) {
      case 'ObjectExpression':
      case 'ArrayExpression':
        return [{ file, node, env }];
      case 'Identifier':
        return identValues(file, node, env, depth).flatMap((v) => (v.node ? objectsOf(v.file, v.node, v.env, (v.depth ?? depth) + 1) : []));
      case 'ConditionalExpression':
        return [...objectsOf(file, node.consequent, env, depth + 1), ...objectsOf(file, node.alternate, env, depth + 1)];
      case 'LogicalExpression':
        return [...objectsOf(file, node.left, env, depth + 1), ...objectsOf(file, node.right, env, depth + 1)];
      case 'MemberExpression': {
        const out = [];
        for (const o of objectsOf(file, node.object, env, depth + 1)) {
          if (o.node.type === 'ObjectExpression') {
            for (const p of o.node.properties) {
              if (p.type !== 'Property') continue;
              if (node.computed || propName(p) === node.property.name) out.push(...objectsOf(o.file, p.value, o.env, depth + 1));
            }
          } else if (o.node.type === 'ArrayExpression' && node.computed) {
            for (const e of o.node.elements) if (e) out.push(...objectsOf(o.file, e, o.env, depth + 1));
          }
        }
        if (!out.length && !node.computed) {
          for (const v of keyTableValues(node.property.name, depth)) out.push(...objectsOf(v.file, v.node, null, depth + 1));
        }
        return out;
      }
      case 'CallExpression': {
        const c = node.callee;
        if (c.type === 'MemberExpression' && !c.computed && ['freeze', 'assign'].includes(c.property.name) && node.arguments[0]) {
          return node.arguments.flatMap((a) => objectsOf(file, a, env, depth + 1));
        }
        if (c.type === 'MemberExpression' && !c.computed && ['filter', 'slice', 'concat', 'sort', 'reverse'].includes(c.property.name)) {
          return objectsOf(file, c.object, env, depth + 1);
        }
        return returnsOf(file, node, env, depth).flatMap((r) => objectsOf(r.file, r.node, r.env, depth + 1));
      }
      default:
        return [];
    }
  }

  /** An object key as an element: its name, or the expression of a computed key (`{ [CONST]: 1 }`). */
  function keyValue(o, p, depth) {
    if (p.computed && p.key.type !== 'Literal') return { file: o.file, node: p.key, env: o.env, depth };
    return { literal: propName(p) };
  }

  /** Element value nodes of an iterable expression (arrays, Object.keys/values, .map()). */
  function elementsOf(file, node, env, depth, forIn = false) {
    if (!node || depth > MAX_DEPTH) return [];
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed) {
      const m = node.callee.property.name;
      const obj = node.callee.object;
      if (obj.type === 'Identifier' && obj.name === 'Object' && ['keys', 'values', 'entries'].includes(m) && node.arguments[0]) {
        const out = [];
        for (const o of objectsOf(file, node.arguments[0], env, depth + 1)) {
          if (o.node.type !== 'ObjectExpression') continue;
          for (const p of o.node.properties) {
            if (p.type !== 'Property') continue;
            if (m === 'keys') out.push(keyValue(o, p, depth));
            else if (m === 'values') out.push({ file: o.file, node: p.value, env: o.env, depth });
            else {
              // Object.entries: a [key, value] pair per property, for `for (const [cls, n] of Object.entries(give))`
              // over `{ [PLATE_OF_BEANS]: 1 }` (G176: constant grants through a computed key).
              const key = p.computed && p.key.type !== 'Literal' ? p.key : { type: 'Literal', value: propName(p), start: p.key.start, end: p.key.end };
              out.push({ file: o.file, node: { type: 'ArrayExpression', elements: [key, p.value], start: p.start, end: p.end }, env: o.env, depth });
            }
          }
        }
        return out;
      }
      if (m === 'map' && node.arguments[0] && isFn(node.arguments[0])) {
        const cb = node.arguments[0];
        const elems = elementsOf(file, obj, env, depth + 1);
        const out = [];
        const params = file.decls.filter((d) => d.kind === 'param' && d.fn === cb && d.index === 0);
        for (const e of elems.slice(0, 200)) {
          const env2 = new Map(env || []);
          for (const p of params) env2.set(p, p.path.length ? atPath([e], p.path) : [e]);
          const body = cb.body.type === 'BlockStatement' ? returnNodes(cb) : [cb.body];
          for (const b of body) out.push({ file, node: b, env: env2, depth });
        }
        return out;
      }
      if (['filter', 'slice', 'concat', 'sort', 'reverse', 'flat'].includes(m)) return elementsOf(file, obj, env, depth + 1);
    }
    if (node.type === 'CallExpression') {
      const viaReturn = returnsOf(file, node, env, depth).flatMap((r) => elementsOf(r.file, r.node, r.env, depth + 1, forIn));
      if (viaReturn.length) return viaReturn;
    }
    if (node.type === 'Identifier') {
      const vals = identValues(file, node, env, depth);
      const viaIdent = vals.flatMap((v) => (v.node && v.node.type !== 'ArrayExpression' && v.node.type !== 'ObjectExpression' ? elementsOf(v.file, v.node, v.env, depth + 1, forIn) : []));
      if (viaIdent.length) return viaIdent;
    }
    const out = [];
    for (const o of objectsOf(file, node, env, depth + 1)) {
      if (o.node.type === 'ArrayExpression') {
        for (const e of o.node.elements) if (e && e.type !== 'SpreadElement') out.push({ file: o.file, node: e, env: o.env, depth });
        // An array built up after its declaration (`const rows = []; rows.push({ counter: 'x' })`) also holds
        // what is pushed onto it in the same function (resource-nodes.js achievementCounters).
        for (const p of pushedOnto(o.file, o.node)) {
          if (p.type === 'SpreadElement') out.push(...elementsOf(o.file, p.argument, o.env, depth + 1));
          else out.push({ file: o.file, node: p, env: o.env, depth });
        }
      } else if (o.node.type === 'ObjectExpression' && forIn) {
        for (const p of o.node.properties) if (p.type === 'Property') out.push(keyValue(o, p, depth));
      }
    }
    return out;
  }

  function returnNodes(fn) {
    if (fn.body.type !== 'BlockStatement') return [fn.body];
    const out = [];
    walk(fn.body, (n) => { if (n.type === 'ReturnStatement' && n.argument) out.push(n.argument); });
    // Drop returns that belong to nested functions.
    return out.filter((r) => !nestedIn(fn, r));
  }

  function nestedIn(fn, node) {
    let nested = false;
    walk(fn.body, (n) => {
      if (nested || n === fn) return;
      if (isFn(n) && n.start <= node.start && n.end >= node.end) nested = true;
    });
    return nested;
  }

  /** Return expressions of the function(s) a call invokes, params bound to the call's args. */
  function returnsOf(file, call, env, depth) {
    if (depth > MAX_DEPTH) return [];
    const c = call.callee;
    let fns = [];
    if (c.type === 'Identifier') {
      fns = identValues(file, c, env, depth).filter((v) => v.node && isFn(v.node)).map((v) => ({ file: v.file, fn: v.node }));
      if (!fns.length) {
        const local = (file.fnNames.get(c.name) || []).map((fn) => ({ file, fn }));
        fns = local.length ? local : (index.fnByName.get(c.name) || []).length <= 2 ? (index.fnByName.get(c.name) || []) : [];
      }
    } else if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'ThisExpression') {
      // GSJS `this.method()`: a function of the same file (items include their parents' code).
      fns = (file.fnNames.get(c.property.name) || []).map((fn) => ({ file, fn }));
    } else if (c.type === 'MemberExpression' && !c.computed) {
      // A method on an object we can see, else a uniquely named function.
      for (const o of objectsOf(file, c.object, env, depth + 1)) {
        if (o.node.type !== 'ObjectExpression') continue;
        for (const p of o.node.properties) if (p.type === 'Property' && propName(p) === c.property.name && isFn(p.value)) fns.push({ file: o.file, fn: p.value });
      }
    }
    const out = [];
    for (const { file: ff, fn } of fns.slice(0, 6)) {
      const env2 = new Map();
      for (const d of ff.decls) {
        if (d.kind !== 'param' || d.fn !== fn) continue;
        const arg = call.arguments[d.index];
        if (!arg) { if (d.def) env2.set(d, [{ file: ff, node: d.def, env: null, depth }]); continue; }
        const base = [{ file, node: arg, env, depth: depth + 1 }];
        env2.set(d, d.path.length ? atPath(base, d.path) : base);
      }
      for (const r of returnNodes(fn)) out.push({ file: ff, node: r, env: env2, depth: depth + 1 });
    }
    return out;
  }

  /** String patterns an expression can evaluate to. */
  function strings(file, node, env = null, depth = 0) {
    if (!node) return [[wild()]];
    if (topDepth === 0) budget = BUDGET;
    if (depth > MAX_DEPTH) return [[wild(null, 'depth')]];
    if (--budget < 0) return [[wild(null, 'budget')]];
    topDepth += 1;
    try {
      return stringsMemo(file, node, env, depth);
    } finally {
      topDepth -= 1;
    }
  }

  function stringsMemo(file, node, env, depth) {
    const key = env ? null : `${file.path}:${node.start}:${node.end}`;
    if (key && memo.has(key)) return memo.get(key);
    if (key) memo.set(key, [[wild(null, 'cycle')]]);
    const res = dedupe(stringsInner(file, node, env, depth)).slice(0, MAX_PATTERNS);
    if (key) memo.set(key, res);
    return res;
  }

  function fromValues(vals, file, depth) {
    const out = [];
    for (const v of vals) {
      if (v.literal != null) { out.push([String(v.literal)]); continue; }
      if (v.wildParam) { out.push([wild(consFor(v.file, v.wildParam.fn), `param ${v.wildParam.name}`)]); continue; }
      if (!v.node) continue;
      let got = strings(v.file, v.node, v.env, (v.depth ?? depth) + 1);
      if (v.viaParam) {
        // A caller passing something unknowable: fall back to the param owner's guards.
        const cons = consFor(v.paramFile, v.viaParam.fn);
        got = got.map((p) => p.map((part) => (isWild(part) && !part.cons ? wild(cons, `param ${v.viaParam.name}`) : part)));
      }
      out.push(...got);
    }
    return out;
  }

  function stringsInner(file, node, env, depth) {
    switch (node.type) {
      case 'Literal':
        if (typeof node.value === 'string') return [[node.value]];
        if (typeof node.value === 'number') return [[String(node.value)]];
        return [[wild()]];
      case 'TemplateLiteral': {
        let acc = [[node.quasis[0].value.cooked ?? '']];
        node.expressions.forEach((e, i) => {
          acc = concat(acc, strings(file, e, env, depth + 1));
          acc = concat(acc, [[node.quasis[i + 1].value.cooked ?? '']]);
        });
        return acc;
      }
      case 'BinaryExpression':
        if (node.operator === '+') return concat(strings(file, node.left, env, depth + 1), strings(file, node.right, env, depth + 1));
        return [[wild()]];
      case 'LogicalExpression': {
        const l = strings(file, node.left, env, depth + 1);
        const r = strings(file, node.right, env, depth + 1);
        if (node.operator === '&&') return r;
        return [...l, ...r].filter((p) => p.length); // '' fallbacks drop out
      }
      case 'ConditionalExpression':
        return [...strings(file, node.consequent, env, depth + 1), ...strings(file, node.alternate, env, depth + 1)];
      case 'SequenceExpression':
        return strings(file, node.expressions.at(-1), env, depth + 1);
      case 'AwaitExpression':
      case 'ChainExpression':
        return strings(file, node.expression || node.argument, env, depth + 1);
      case 'Identifier': {
        if (node.name === 'undefined') return [];
        const vals = identValues(file, node, env, depth);
        if (!vals.length) return [[wild(null, `unbound ${node.name}`)]];
        return fromValues(vals, file, depth);
      }
      case 'MemberExpression': {
        // this.class_tsid inside items/<id>.js, quests/<id>.js
        if (node.object.type === 'ThisExpression' && !node.computed && ['class_tsid', 'class_id', 'classTsid'].includes(node.property.name) && file.itemId) return [[file.itemId]];
        // x.split(sep)[i]
        if (node.computed && node.object.type === 'CallExpression' && node.object.callee.type === 'MemberExpression' && node.object.callee.property?.name === 'split') {
          const base = strings(file, node.object.callee.object, env, depth + 1);
          const sep = node.object.arguments[0]?.type === 'Literal' ? node.object.arguments[0].value : null;
          const idx = node.property.type === 'Literal' ? node.property.value : null;
          return base.map((p) => (p.length === 1 && typeof p[0] === 'string' && sep != null && idx != null ? [p[0].split(sep)[idx] ?? ''] : p.map((x) => (typeof x === 'string' && sep != null && idx === 0 ? x.split(sep)[0] : x))));
        }
        let objs = objectsOf(file, node.object, env, depth + 1);
        // `if (e.type === 'grant_item') addItem(inv, e.classTsid)`: rows the guard rules out
        // (a `{ type: 'consume_item' }` effect) are not what this read can see (G176).
        if (objs.length && node.object.type === 'Identifier') {
          const guards = guardsAt(file, node).filter((g) => g.name === node.object.name);
          if (guards.length) {
            const kept = objs.filter((o) => !ruledOut(o.node, guards));
            if (!kept.length) return [];
            objs = kept;
          }
        }
        const out = [];
        for (const o of objs) {
          if (o.node.type === 'ObjectExpression') {
            for (const p of o.node.properties) {
              if (p.type !== 'Property') continue;
              if (node.computed) { out.push(...strings(o.file, p.value, o.env, depth + 1)); continue; }
              if (propName(p) === node.property.name) out.push(...strings(o.file, p.value, o.env, depth + 1));
            }
          } else if (o.node.type === 'ArrayExpression' && node.computed) {
            for (const e of o.node.elements) if (e && e.type !== 'SpreadElement') out.push(...strings(o.file, e, o.env, depth + 1));
          }
        }
        if (out.length) return out;
        if (!node.computed) {
          const vals = keyTableValues(node.property.name, depth);
          if (vals.length) return fromValues(vals, file, depth);
        }
        return [[wild(null, `member ${node.computed ? '[]' : node.property.name}`)]];
      }
      case 'CallExpression': {
        const c = node.callee;
        if (c.type === 'Identifier' && c.name === 'String' && node.arguments[0]) return strings(file, node.arguments[0], env, depth + 1);
        if (c.type === 'MemberExpression' && !c.computed && ['getClassProp', 'getInstanceProp'].includes(c.property.name) && node.arguments[0]?.type === 'Literal') {
          // GSJS items: this.getClassProp('herb_buff') reads the file's classProps literal.
          const want = String(node.arguments[0].value);
          const out = [];
          for (const d of file.decls.filter((x) => x.name === 'classProps' && !x.owner)) {
            for (const o of objectsOf(file, d.node, null, depth + 1)) {
              if (o.node.type !== 'ObjectExpression') continue;
              for (const p of o.node.properties) if (p.type === 'Property' && propName(p) === want) out.push(...strings(o.file, p.value, null, depth + 1));
            }
          }
          if (out.length) return out;
        }
        if (c.type === 'MemberExpression' && !c.computed) {
          const m = c.property.name;
          if (['trim', 'toString', 'valueOf', 'normalize'].includes(m)) return strings(file, c.object, env, depth + 1);
          if (m === 'toLowerCase' || m === 'toUpperCase') {
            return strings(file, c.object, env, depth + 1).map((p) => p.map((x) => (typeof x === 'string' ? (m === 'toLowerCase' ? x.toLowerCase() : x.toUpperCase()) : x)));
          }
          if (m === 'replace' || m === 'replaceAll') {
            const [a0, a1] = node.arguments;
            const lit = a0?.type === 'Literal' && typeof a0.value === 'string' && a1?.type === 'Literal' && typeof a1.value === 'string';
            return strings(file, c.object, env, depth + 1).map((p) => {
              if (!p.every((x) => typeof x === 'string')) return p;
              return lit ? [p.join('')[m](a0.value, a1.value)] : [wild(null, 'replace')];
            });
          }
          if (m === 'join' || m === 'slice' || m === 'substring' || m === 'substr') return [[wild(null, m)]];
          if (m === 'concat') return [[wild(null, 'concat')]];
        }
        const rets = returnsOf(file, node, env, depth);
        if (!rets.length) return [[wild(null, 'call')]];
        return rets.flatMap((r) => strings(r.file, r.node, r.env, r.depth));
      }
      case 'AssignmentExpression':
        return strings(file, node.right, env, depth + 1);
      default:
        return [[wild(null, node.type)]];
    }
  }

  return { strings, objectsOf, elementsOf, consFor };
}

/* ------------------------------------------------------------------ */
/* Emissions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Find emitter calls and resolve their arguments.
 *   emitters: [{ name, args: [i] | [gi, li], join: ':', member: true|false|undefined, tag }]
 * Returns { emissions: [{ tag, pattern, text, file, line, callee, qa }], unresolved: [...] }.
 * `qa` marks calls inside functions that read URL params (QA/demo seeding).
 */
export function scanEmissions(index, emitters, { keyTableKeys, qaRe = QA_RE } = {}) {
  const resolver = createResolver(index, { keyTableKeys });
  const emissions = [];
  const unresolved = [];
  const passThrough = [];
  for (const file of index.files) {
    for (const call of file.calls) {
      const c = call.callee;
      const isMember = c.type === 'MemberExpression' && !c.computed;
      const name = c.type === 'Identifier' ? c.name : isMember ? c.property.name : null;
      if (!name) continue;
      for (const em of emitters) {
        if (em.name !== name) continue;
        if (em.member === true && !isMember) continue;
        if (em.member === false && isMember) continue;
        if (em.files && !em.files.test(file.path)) continue;
        if (em.object && !(isMember && c.object.type === 'Identifier' && em.object.test(c.object.name))) continue;
        const argNodes = em.args.map((i) => call.arguments[i]);
        if (argNodes.some((a) => !a || a.type === 'SpreadElement')) continue;
        const fns = file.enclosing(call.start);
        const line = call.loc?.start.line || 0;
        // A wrapper that is itself an emitter forwarding its own parameter (applyAchievementProgress
        // -> applyAchievementProgressRaw(state, counter), engine.achievement(counter) ->
        // applyAchievementProgress): every caller of the wrapper is scanned as an emitter, so the
        // forwarded parameter is counted there, not here.
        if (fns.length && isPassThrough(file, fns[0], argNodes, em.tag, emitters)) {
          passThrough.push({ tag: em.tag, file: file.rel, line, callee: name });
          continue;
        }
        let patterns = resolver.strings(file, argNodes[0]);
        for (let k = 1; k < argNodes.length; k += 1) {
          patterns = concat(concat(patterns, [[em.join ?? ':']]), resolver.strings(file, argNodes[k]));
        }
        patterns = dedupe(patterns);
        const qa = qaAt(file, call.start, qaRe);
        const informative = patterns.some((p) => !isUninformative(p));
        for (const pattern of patterns) {
          const row = { tag: em.tag, pattern, text: patternString(pattern), file: file.rel, line, start: call.start, argKey: memberKey(argNodes[0]), callee: name, qa };
          if (!isUninformative(pattern)) { emissions.push(row); continue; }
          // A literal '' (an `x || ''` fallback, an empty `counter:` row) emits nothing.
          if (pattern.every((p) => typeof p === 'string')) continue;
          // The memo's cycle placeholder next to resolved values is recursion, not a lost argument.
          if (informative && pattern.some((p) => isWild(p) && p.why === 'cycle')) continue;
          unresolved.push(row);
        }
      }
    }
  }
  return { emissions, unresolved, passThrough, failures: index.failures };
}

/** `row.classTsid` -> 'classTsid' (the key a dynamic argument reads), else null. */
function memberKey(node) {
  const n = node?.type === 'ChainExpression' ? node.expression : node;
  return n?.type === 'MemberExpression' && !n.computed ? n.property.name : null;
}

/** The emitter call forwards parameters of `fn`, and `fn` is an emitter of the same tag taking them at the same positions. */
function isPassThrough(file, fn, argNodes, tag, emitters) {
  const names = file.fnNameOf.get(fn) || [];
  for (const em of emitters) {
    if (em.tag !== tag || !names.includes(em.name) || em.args.length !== argNodes.length) continue;
    const ok = argNodes.every((a, k) => a.type === 'Identifier'
      && file.decls.some((d) => d.kind === 'param' && d.fn === fn && d.name === a.name && !d.path.length && d.index === em.args[k]));
    if (ok) return true;
  }
  return false;
}

/** Every string literal in the indexed files: Map value -> Set of file rel paths. */
export function literalIndex(index, { exclude = () => false } = {}) {
  const out = new Map();
  for (const file of index.files) {
    if (exclude(file.rel)) continue;
    for (const l of file.literals) {
      if (l.regex || !l.value) continue;
      if (!out.has(l.value)) out.set(l.value, new Set());
      out.get(l.value).add(file.rel);
    }
  }
  return out;
}

/**
 * Files reachable from `roots` (rel paths) through static imports, re-exports and import('literal'):
 * Set of rel paths. Query strings (`./x.js?v=2`) are ignored.
 */
export function liveFiles(index, roots) {
  const byRel = new Map(index.files.map((f) => [f.rel, f]));
  const live = new Set();
  const queue = roots.filter((r) => byRel.has(r));
  while (queue.length) {
    const rel = queue.pop();
    if (live.has(rel)) continue;
    live.add(rel);
    const file = byRel.get(rel);
    for (const spec of file.deps) {
      if (!spec.startsWith('.')) continue;
      const target = resolvePath(dirname(file.path), spec.replace(/[?#].*$/, ''));
      const dep = index.byPath.get(target) || index.byPath.get(`${target}.js`) || index.byPath.get(`${target}.mjs`);
      if (dep && !live.has(dep.rel)) queue.push(dep.rel);
    }
  }
  return live;
}

const OFF_KEYS = new Set(['available', 'built', 'playable', 'enabled']);

/** String literals by the property key or call they sit in: Map value -> [{ file, ctx, line, off? }]. */
export function contextLiterals(index) {
  const out = new Map();
  const add = (v, file, ctx, line, off = false) => {
    if (typeof v !== 'string' || !v) return;
    if (!out.has(v)) out.set(v, []);
    out.get(v).push(off ? { file: file.rel, ctx, line, off: true } : { file: file.rel, ctx, line });
  };
  for (const file of index.files) {
    // Property values of an object that says it is switched off (`available: false`, `built: false`):
    // a declaration of something the remake does not have yet.
    const offValues = new Set();
    walk(file.ast, (n) => {
      if (n.type !== 'ObjectExpression') return;
      const off = n.properties.some((p) => p.type === 'Property' && OFF_KEYS.has(propName(p)) && p.value?.type === 'Literal' && p.value.value === false);
      if (off) for (const p of n.properties) if (p.type === 'Property' && p.value?.type === 'Literal') offValues.add(p.value);
    });
    walk(file.ast, (n, parent) => {
      if (n.type !== 'Literal' || typeof n.value !== 'string') return;
      if (!parent) return;
      const line = n.loc?.start.line || 0;
      if (parent.type === 'Property' && parent.value === n) add(n.value, file, `prop:${propName(parent)}`, line, offValues.has(n));
      else if (parent.type === 'Property' && parent.key === n) add(n.value, file, 'key', line);
      else if (parent.type === 'CallExpression' && parent.arguments.includes(n)) {
        const c = parent.callee;
        add(n.value, file, `call:${c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '?'}`, line);
      } else if (parent.type === 'ArrayExpression') add(n.value, file, 'array', line);
      else add(n.value, file, parent.type, line);
    });
    // Unquoted object keys (`npc_piggy: {...}`) count as keys too.
    walk(file.ast, (n, parent) => {
      if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && parent?.type === 'ObjectExpression') add(n.key.name, file, 'key', n.loc?.start.line || 0);
    });
  }
  return out;
}

/** Whether a node sits in a function that reads URL params: QA and demo seeding, never evidence (as scanEmissions' `qa`). */
const QA_RE = /engine\.param(?:\?\.)?\(|searchParams|URLSearchParams/;
/**
 * Whether `pos` runs in QA or demo seeding: an enclosing function, out to the innermost named one,
 * whose own code reads URL params. Nested functions that do not hold `pos` are not its own code:
 * newxp-feature.js runTraining2 hands over the Home Street Ticket for real, and only its
 * `help: () => engine.param('newxpstyle')` callback is QA (G176).
 */
export function qaAt(file, pos, re = QA_RE) {
  if (!re) return false;
  for (const fn of file.enclosing(pos)) {
    let text = file.text.slice(fn.start, fn.end);
    for (const g of file.fns) {
      if (g === fn || g.start <= fn.start || g.end > fn.end || (g.start <= pos && g.end >= pos)) continue;
      text = text.slice(0, g.start - fn.start) + ' '.repeat(g.end - g.start) + text.slice(g.end - fn.start);
    }
    re.lastIndex = 0;
    if (re.test(text)) return true;
    if ((file.fnNameOf.get(fn) || []).length) break;
  }
  return false;
}
function inQaFunction(file, node) {
  return qaAt(file, node.start);
}

/* ------------------------------------------------------------------ */
/* What a literal does (G176)                                           */
/* ------------------------------------------------------------------ */

// A place that takes, checks or names an item is not a way to get it (hell-bar-feature.js consumes
// drink_ticket; the inventory once called it obtainable for that). These name the call shapes and
// row keys of the remake's pack code: inventory.js addItem/removeItem/countItem and the effect rows.
export const GRANT_CALL = /^(addItems?|give|giveItems?|grantItems?|addTo|addInv|addToPack|awardItem|createItemFromFamiliar)$/;
const CONSUME_CALL = /^(removeItems?|removeFrom|consumeItems?|takeItems?|takeFrom|spendItems?|useItem|usePackItem|burnItems?|destroyItem|deleteItem)$/;
const CHECK_CALL = /^(countItems?|hasItems?|haveItem|countOf|itemCount|count|includes|has|indexOf|lastIndexOf|startsWith|endsWith|test|holding|owns|hasBuff)$/;
const LABEL_CALL = /(label|icon|sprite|texture|title|name|art|image|sound|ensureItem|itemdef|describe|toast|say|log|setData|registerItemUse)/i;
const PASS_CALL = /^(freeze|assign|concat|from|of)$/;
const GRANT_KEY = /^(gives?|giveItems|grants?|rewards?|outputs?|prizes?|drops?|yields?|loot|awards?|becomes|results?|makes|produces|gifts?|spawns?|contents|packs?)$/i;
const CONSUME_KEY = /^(inputs?|consumes?|costs?|takes?|spend|burns?|ingredients?|fuel|removes?|uses|eats?|pay|price|wants?|accepts?|tradeIn|trade_in)$/i;
const CHECK_KEY = /^(requires?|required|requirements?|reqs?|needs?|needed|needsItem|tools?|toolClass|toolId|gate|ifHas|holding|when|unless|key|keyClass)$/i;
const LABEL_KEY = /^(labels?|name|title|icons?|sprite|art|image|img|src|tooltip|text|desc|description|sound|alt|hint|msg|message|note|verb)$/i;
/** Keys whose value names an item class: a row's id, not one of its other fields (`reason: 'missing'`). */
const ITEM_KEY = /^(cls|item|items|id|ids|tsid|class|from|to|swap)$|(Id|Ids|Class|Classes|Tsid|Item|Items)$|_(id|class|tsid)$/;
const COUNTER_KEY = new Set(['event', 'counter', 'counters', 'achievement', 'badge', 'flag']);
const DISCRIM_KEY = new Set(['type', 'kind', 'op', 'effect', 'action', 'mode']);
const GRANT_TYPE = /grant|give|add|reward|drop|award|output|yield|loot|prize|gift/i;
const CONSUME_TYPE = /consume|remove|take|spend|cost|require|need|input|burn|pay/i;

const calleeName = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '');

function callRole(name) {
  if (GRANT_CALL.test(name)) return 'grant';
  if (CONSUME_CALL.test(name)) return 'consume';
  if (CHECK_CALL.test(name)) return 'check';
  if (LABEL_CALL.test(name)) return 'label';
  return null;
}

/**
 * What the expression `node` is used for where it stands: { role, table, key } with role one of
 * grant | consume | check | label | counter | data | const | other, `table` the name a data row is
 * declared under (`const MUSICBLOCK_CATALOG = { ... }`) and `key` the property it is the value of.
 */
export function useRole(file, node) {
  const parents = parentsOf(file);
  let child = node;
  let p = parents.get(node);
  let inData = false;
  let innermostObj = true;
  let key = null; // the property the literal is the value of (`chunkId: 'beryl'`)
  const data = () => (inData ? 'data' : 'other');
  const R = (role, table = null) => ({ role, table, key });
  while (p) {
    if (p.type === 'ConditionalExpression' && child !== p.test) { child = p; p = parents.get(p); continue; }
    if (p.type === 'LogicalExpression') { child = p; p = parents.get(p); continue; }
    if (p.type === 'BinaryExpression') return R(EQ_OPS.has(p.operator) || NE_OPS.has(p.operator) ? 'check' : 'other');
    if (p.type === 'SwitchCase' && child === p.test) return R('check');
    if (p.type === 'SwitchStatement' && child === p.discriminant) return R('check');
    if ((p.type === 'IfStatement' || p.type === 'WhileStatement') && child === p.test) return R('check');
    if (p.type === 'UnaryExpression') return R('check');
    if (p.type === 'MemberExpression') {
      if (p.computed && p.property === child) {
        const a = parents.get(p);
        if (a?.type === 'AssignmentExpression' && a.left === p) {
          if (a.operator === '+=') return R('grant');
          if (a.operator === '-=') return R('consume');
          if (a.operator === '=' && a.right.type === 'BinaryExpression') return R(a.right.operator === '+' ? 'grant' : a.right.operator === '-' ? 'consume' : 'other');
          return R('other');
        }
        return R('check');
      }
      if (p.object === child) {
        // `['a', 'b'].includes(x)`, `new Set([...]).has(x)`.
        const call = parents.get(p);
        if (call?.type === 'CallExpression' && call.callee === p && callRole(p.property?.name || '') === 'check') return R('check');
        return R(data());
      }
      return R('other');
    }
    if (p.type === 'CallExpression' || p.type === 'NewExpression') {
      if (p.callee === child) return R('other');
      const name = calleeName(p.callee);
      const r = callRole(name);
      if (r) return R(r);
      // Object.freeze({...}), new Set([...]), and row builders inside a table (`a: row('musicblock_x', ...)`).
      const up = parents.get(p);
      if (p.type === 'NewExpression' || PASS_CALL.test(name) || up?.type === 'Property' || up?.type === 'ArrayExpression') { inData = true; child = p; p = up; continue; }
      return R(data());
    }
    if (p.type === 'Property') {
      if (p.key === child && !p.computed) {
        // A quoted key: a label map ({ 'drink_ticket': 'Drink Ticket' }) names it; a table keyed by id is data.
        if (p.value.type === 'Literal' && typeof p.value.value === 'string') return R('label');
        inData = true; child = p; p = parents.get(p); continue;
      }
      if (p.key === child) { inData = true; child = p; p = parents.get(p); continue; }
      const k = p.computed ? '' : propName(p) || '';
      if (child === node) key = k;
      if (GRANT_KEY.test(k)) return R('grant');
      if (CONSUME_KEY.test(k)) return R('consume');
      if (CHECK_KEY.test(k)) return R('check');
      if (LABEL_KEY.test(k)) return R('label');
      // A plain field of a row (`reason: 'missing'`, `state: 'idle'`) is not an item reference.
      if (child === node && !ITEM_KEY.test(k)) return R('other');
      inData = true; child = p; p = parents.get(p); continue;
    }
    if (p.type === 'ObjectExpression') {
      const keys = p.properties.filter((x) => x.type === 'Property').map((x) => [propName(x), x]);
      if (keys.some(([k]) => COUNTER_KEY.has(k))) return R('counter');
      if (innermostObj) {
        for (const [k, x] of keys) {
          if (!DISCRIM_KEY.has(k) || x.value.type !== 'Literal' || typeof x.value.value !== 'string') continue;
          if (CONSUME_TYPE.test(x.value.value)) return R('consume');
          if (GRANT_TYPE.test(x.value.value)) return R('grant');
        }
      }
      innermostObj = false;
      inData = true; child = p; p = parents.get(p); continue;
    }
    if (p.type === 'ArrayExpression' || p.type === 'SpreadElement' || p.type === 'TemplateLiteral' || p.type === 'ChainExpression') { inData = true; child = p; p = parents.get(p); continue; }
    if (p.type === 'VariableDeclarator' && p.init === child) return inData ? R('data', p.id?.type === 'Identifier' ? p.id.name : null) : R('const');
    if (p.type === 'AssignmentExpression' && p.right === child) return R(data(), p.left.type === 'Identifier' ? p.left.name : null);
    if (p.type === 'ReturnStatement' || p.type === 'ArrowFunctionExpression' || p.type === 'ExportDefaultDeclaration') return R('data');
    return R(data());
  }
  return R('other');
}

const ROLE_ORDER = ['grant', 'data', 'consume', 'check', 'label', 'counter', 'other'];

/**
 * The role of every string literal of a file: Map literal start -> { role, table } (useRole), with
 * QA seeding (functions that read URL params) as `qa`. A constant (`const TICKET = 'drink_ticket'`)
 * takes the strongest role among its uses in the file (grant over data over consume ...), so a
 * constant only ever checked is a check.
 */
export function literalRoles(file) {
  const parents = parentsOf(file);
  const out = new Map();
  const uses = new Map(); // name -> [Identifier nodes that read it]
  const consts = [];
  walk(file.ast, (n, parent) => {
    if (n.type !== 'Identifier' || !parent) return;
    if ((parent.type === 'MemberExpression' && parent.property === n && !parent.computed) || (parent.type === 'Property' && parent.key === n && !parent.computed)
      || (parent.type === 'VariableDeclarator' && parent.id === n) || /Specifier$/.test(parent.type)) return;
    if (!uses.has(n.name)) uses.set(n.name, []);
    uses.get(n.name).push(n);
  });
  walk(file.ast, (n) => {
    if (n.type !== 'Literal' || typeof n.value !== 'string') return;
    if (inQaFunction(file, n)) { out.set(n.start, { role: 'qa', table: null, key: null }); return; }
    const r = useRole(file, n);
    if (r.role === 'const') consts.push(n);
    out.set(n.start, r);
  });
  for (const n of consts) {
    const decl = parents.get(n);
    const name = decl?.id?.type === 'Identifier' ? decl.id.name : null;
    const got = (uses.get(name) || []).filter((u) => !inQaFunction(file, u)).map((u) => useRole(file, u)).map((r) => (r.role === 'const' ? { ...r, role: 'other' } : r));
    const role = got.length ? ROLE_ORDER.find((r) => got.some((g) => g.role === r)) : 'other';
    const use = got.find((g) => g.role === role);
    out.set(n.start, { role, table: use?.table || null, key: use?.key ?? null, via: name });
  }
  return out;
}

/**
 * Identifier names read in [start, end) of a file, following same-file functions and module tables
 * they name (`selectCubimal` -> `CUBIMAL_SERIES` -> `cubimal()`), `hops` deep: { names, fns }.
 */
export function namesReached(file, start, end, hops = 3) {
  const names = new Set();
  const spans = [[start, end]];
  const seenFns = new Set();
  const seenTables = new Set();
  const tables = new Map();
  for (const d of file.decls) if (!d.owner && d.kind === 'const' && d.node && !isFn(d.node)) tables.set(d.name, d.node);
  for (let h = 0; h <= hops && spans.length; h += 1) {
    const next = [];
    for (const [a, b] of spans.splice(0)) {
      walk(file.ast, (n) => {
        if (n.type !== 'Identifier' || n.start < a || n.end > b || names.has(n.name)) return;
        names.add(n.name);
        for (const fn of file.fnNames.get(n.name) || []) if (!seenFns.has(fn)) { seenFns.add(fn); next.push([fn.start, fn.end]); }
        const t = tables.get(n.name);
        if (t && !seenTables.has(t)) { seenTables.add(t); next.push([t.start, t.end]); }
      });
    }
    spans.push(...next);
  }
  return { names, fns: [...seenFns] };
}

const INV_OBJ = /^(inv|inventory|pack)$/i;
/**
 * Pack writes that add: `inv[id] += n`, `inv[id] = (inv[id] || 0) + n`, `inv[id] = Math.max(...)`.
 * Returns emissions like scanEmissions' (tag 'item', callee 'inv[]'): animal-husbandry.js, rube.js,
 * home-decor.js and master-garden.js give items this way, not through addItem.
 */
export function inventoryWrites(index, { qaRe = QA_RE, emitterFns = new Set(['addItem', 'addItems', 'give']) } = {}) {
  const resolver = createResolver(index);
  const emissions = [];
  const unresolved = [];
  for (const file of index.files) {
    walk(file.ast, (n) => {
      if (n.type !== 'AssignmentExpression' || n.left.type !== 'MemberExpression' || !n.left.computed) return;
      const o = n.left.object;
      const objName = o.type === 'Identifier' ? o.name : o.type === 'MemberExpression' && !o.computed ? o.property.name : '';
      if (!INV_OBJ.test(objName)) return;
      const r = n.right;
      const adds = n.operator === '+=' || (n.operator === '=' && ((r.type === 'BinaryExpression' && r.operator === '+')
        || (r.type === 'CallExpression' && r.callee.type === 'MemberExpression' && r.callee.object.name === 'Math' && r.callee.property.name === 'max')));
      if (!adds) return;
      const fn = file.enclosing(n.start)[0];
      // inventory.js addItem itself: its callers are scanned as emitters (and QA callers flagged there).
      if (fn && (file.fnNameOf.get(fn) || []).some((x) => emitterFns.has(x))) return;
      const qa = qaAt(file, n.start, qaRe);
      const line = n.loc?.start.line || 0;
      for (const pattern of dedupe(resolver.strings(file, n.left.property))) {
        const row = { tag: 'item', pattern, text: patternString(pattern), file: file.rel, line, start: n.start, argKey: memberKey(n.left.property), callee: 'inv[]', qa };
        if (!isUninformative(pattern)) emissions.push(row);
        else if (!pattern.every((x) => typeof x === 'string')) unresolved.push(row);
      }
    });
  }
  return { emissions, unresolved };
}

/** Patterns of every template literal with substitutions in one indexed file (prize tables built from slugs). */
export function templatePatterns(index, file, opts = {}) {
  const resolver = createResolver(index, opts);
  const out = [];
  walk(file.ast, (n) => {
    if (n.type !== 'TemplateLiteral' || !n.expressions.length || inQaFunction(file, n)) return;
    for (const p of resolver.strings(file, n)) if (!isUninformative(p)) out.push({ pattern: p, line: n.loc?.start.line || 0, start: n.start, node: n });
  });
  return out;
}

const SPAWN_KEYS = new Set(['classId', 'classTsid', 'cls', 'class_tsid', 'class_id', 'itemClass']);

/** Template literals assigned to a classId-like property (spawned classes built from a variable): [{ pattern, file, line }]. */
export function spawnTemplates(index, { skipFile = () => false } = {}) {
  const resolver = createResolver(index);
  const out = [];
  for (const file of index.files) {
    if (skipFile(file.rel)) continue;
    walk(file.ast, (n, parent) => {
      if (n.type !== 'TemplateLiteral' || !n.expressions.length) return;
      if (!(parent?.type === 'Property' && parent.value === n && SPAWN_KEYS.has(propName(parent)))) return;
      if (inQaFunction(file, n)) return;
      for (const p of resolver.strings(file, n)) if (!isUninformative(p)) out.push({ pattern: p, file: file.rel, line: n.loc?.start.line || 0, text: patternString(p) });
    });
  }
  return out;
}
