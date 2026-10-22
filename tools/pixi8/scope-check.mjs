// Report identifiers used outside the block scope of their (only) declarations.
// Usage: node tools/pixi8/scope-check.mjs public/js/x.js ... (after codemods:
// paint calls moved past a block end show up as out-of-scope identifiers)
import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
import { walk } from './graphics-codemod.mjs';
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f, 'utf8');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
  const parent = new Map();
  walk(ast, (n, p) => { if (p) parent.set(n, p); });
  const scopes = new Map(); // scope node -> Set(names)
  const scopeOf = (n, kind) => {
    for (let p = parent.get(n); p; p = parent.get(p)) {
      if (kind === 'var' ? /Function|Program/.test(p.type) : /BlockStatement|Program|Function|For|SwitchCase|CatchClause|StaticBlock/.test(p.type)) return p;
    }
    return ast;
  };
  const add = (scope, name) => { if (!scopes.has(scope)) scopes.set(scope, new Set()); scopes.get(scope).add(name); };
  const names = (p, out = []) => { if (!p) return out; if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach((q) => names(q.type === 'RestElement' ? q.argument : q.value, out)); else if (p.type === 'ArrayPattern') p.elements.forEach((e) => names(e, out)); else if (p.type === 'AssignmentPattern') names(p.left, out); else if (p.type === 'RestElement') names(p.argument, out); return out; };
  const declared = new Set();
  walk(ast, (n) => {
    if (n.type === 'VariableDeclaration') {
      const kind = n.kind === 'var' ? 'var' : 'let';
      let sc = scopeOf(n, kind);
      const p = parent.get(n);
      if (p && /^For/.test(p.type) && kind !== 'var') sc = p;
      for (const d of n.declarations) for (const x of names(d.id)) { add(sc, x); declared.add(x); }
    } else if (n.type === 'FunctionDeclaration') { add(scopeOf(n, 'var'), n.id.name); declared.add(n.id.name); for (const p of n.params) for (const x of names(p)) add(n, x); }
    else if (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') { for (const p of n.params) for (const x of names(p)) add(n, x); if (n.id) add(n, n.id.name); }
    else if (n.type === 'ClassDeclaration') { add(scopeOf(n, 'let'), n.id.name); declared.add(n.id.name); }
    else if (n.type === 'CatchClause' && n.param) for (const x of names(n.param)) add(n, x);
    else if (/^Import/.test(n.type) && n.local) add(ast, n.local.name);
  });
  walk(ast, (n, p) => {
    if (n.type !== 'Identifier' || !declared.has(n.name)) return;
    if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return;
    if (p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand) return;
    if (p && (p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n) return;
    for (let s = parent.get(n); s; s = parent.get(s)) if (scopes.get(s)?.has(n.name)) return;
    if (scopes.get(ast)?.has(n.name)) return;
    console.log(`${f}:${n.loc.start.line}: ${n.name} not in scope`);
  });
}
