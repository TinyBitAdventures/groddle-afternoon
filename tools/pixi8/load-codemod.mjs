// .valid -> isLoaded(x); x.once('loaded', fn) -> onLoaded(x, fn); once('error') -> onFailed.
// Usage: node tools/pixi8/load-codemod.mjs --root=public js/x.js ...
import { parse } from 'acorn';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, join } from 'node:path';
import { walk } from './graphics-codemod.mjs';
const root = process.argv.find((a) => a.startsWith('--root='))?.slice(7) || '.';
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const src = readFileSync(join(root, f), 'utf8');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const parent = new Map();
  walk(ast, (n, p) => { if (p) parent.set(n, p); });
  const text = (n) => src.slice(n.start, n.end);
  const edits = [];
  const need = new Set();
  const top = (n) => { const p = parent.get(n); return p && p.type === 'ChainExpression' ? p : n; };
  walk(ast, (n) => {
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'valid') {
      const outer = top(n);
      edits.push({ start: outer.start, end: outer.end, text: `isLoaded(${text(n.object)})` });
      need.add('isLoaded');
    }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && ['once', 'on'].includes(n.callee.property.name) && n.arguments[0]?.type === 'Literal' && ['loaded', 'error'].includes(n.arguments[0].value)) {
      const outer = top(n);
      const fn = n.arguments[0].value === 'loaded' ? 'onLoaded' : 'onFailed';
      edits.push({ start: outer.start, end: outer.end, text: `${fn}(${text(n.callee.object)}, ${n.arguments.slice(1).map(text).join(', ')})` });
      need.add(fn);
    }
  });
  if (!edits.length) continue;
  // Nested edits: keep outer only when overlapping (inner object text has no edits in practice).
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  let last = Infinity;
  for (const e of edits) {
    if (e.end > last) { console.log(`overlap ${f}`); continue; }
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    last = e.start;
  }
  const rel = relative(dirname(join(root, f)), join(root, 'js/textures.js'));
  const spec = rel.startsWith('.') ? rel : `./${rel}`;
  const re = new RegExp(`import \\{([^}]*)\\} from '${spec.replace(/[.\/]/g, (c) => '\\' + c)}';`);
  const m = re.exec(out);
  if (m) {
    const have = new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
    for (const x of need) have.add(x);
    out = out.replace(m[0], `import { ${[...have].sort().join(', ')} } from '${spec}';`);
  } else {
    const ast2 = parse(out, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
    const imports = ast2.body.filter((s) => s.type === 'ImportDeclaration');
    const at = imports.length ? imports[imports.length - 1].end : 0;
    out = out.slice(0, at) + `${at ? '\n' : ''}import { ${[...need].sort().join(', ')} } from '${spec}';${at ? '' : '\n'}` + out.slice(at);
  }
  writeFileSync(join(root, f), out);
  console.log(`${f}: ${edits.length}`);
}
