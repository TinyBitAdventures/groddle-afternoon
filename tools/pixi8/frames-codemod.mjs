// new PIXI.Texture({ source, frame }) -> frameTexture(source, frame) (dynamic when lazily loaded)
// Usage: node tools/pixi8/frames-codemod.mjs --root=public js/x.js ...
import { parse } from 'acorn';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, join } from 'node:path';
import { walk } from './graphics-codemod.mjs';
const root = process.argv.find((a) => a.startsWith('--root='))?.slice(7) || '.';
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const src = readFileSync(join(root, f), 'utf8');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const text = (n) => src.slice(n.start, n.end);
  const edits = [];
  walk(ast, (n) => {
    if (n.type !== 'NewExpression' || n.callee.type !== 'MemberExpression' || n.callee.property.name !== 'Texture') return;
    const [o] = n.arguments;
    if (!o || o.type !== 'ObjectExpression' || n.arguments.length !== 1) return;
    const keys = o.properties.map((p) => p.key?.name);
    if (keys.length === 2 && keys.includes('source') && keys.includes('frame')) {
      const s = o.properties.find((p) => p.key.name === 'source').value;
      const fr = o.properties.find((p) => p.key.name === 'frame').value;
      edits.push({ start: n.start, end: n.end, text: `frameTexture(${text(s)}, ${text(fr)})` });
    } else if (keys.length === 1 && keys[0] === 'source') {
      edits.push({ start: n.start, end: n.end, text: `frameTexture(${text(o.properties[0].value)})` });
    }
  });
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  let last = Infinity;
  for (const e of edits) { if (e.end > last) { console.log('overlap', f); continue; } out = out.slice(0, e.start) + e.text + out.slice(e.end); last = e.start; }
  const rel = relative(dirname(join(root, f)), join(root, 'js/textures.js'));
  const spec = rel.startsWith('.') ? rel : `./${rel}`;
  const re = new RegExp(`import \\{([^}]*)\\} from '${spec.replace(/[.\/]/g, (c) => '\\' + c)}';`);
  const m = re.exec(out);
  if (m) {
    const have = new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
    have.add('frameTexture');
    out = out.replace(m[0], `import { ${[...have].sort().join(', ')} } from '${spec}';`);
  } else {
    const ast2 = parse(out, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
    const imports = ast2.body.filter((s) => s.type === 'ImportDeclaration');
    if (imports.length) { const at = imports[imports.length - 1].end; out = out.slice(0, at) + `\nimport { frameTexture } from '${spec}';` + out.slice(at); }
    else { const at = ast2.body[0].start; out = out.slice(0, at) + `import { frameTexture } from '${spec}';\n\n` + out.slice(at); }
  }
  writeFileSync(join(root, f), out);
  console.log(f, edits.length);
}
