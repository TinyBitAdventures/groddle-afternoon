// Pixi 7 -> 8 API codemod (everything but Graphics drawing): Text options and
// styles, URL textures, BaseTexture, Texture frames, blend/scale enums,
// utils, app.view, TilingSprite, destroy options. Flags what it cannot prove.
// Usage: node tools/pixi8/api-codemod.mjs --root=public [--write] js/x.js ...
// Caveat: objects that merely look like text styles (strokeThickness,
// dropShadow*) are converted too; helper option objects (kit.label) need a
// look afterwards. Run load-codemod.mjs and frames-codemod.mjs next.
import { parse } from 'acorn';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, join } from 'node:path';
import { walk } from './graphics-codemod.mjs';

const PIXI_ROOT = (n) => {
  // PIXI, engine.PIXI, ctx.PIXI, this.PIXI
  if (n.type === 'Identifier' && n.name === 'PIXI') return true;
  return n.type === 'MemberExpression' && !n.computed && n.property.name === 'PIXI';
};
const pixiMember = (n, name) => n && n.type === 'MemberExpression' && !n.computed && n.property.name === name && PIXI_ROOT(n.object);
const pixiMember2 = (n, a, b) => n && n.type === 'MemberExpression' && !n.computed && n.property.name === b && pixiMember(n.object, a);

const URLISH = /url|path|src|file|asset|art|icon|png|webp|svg|sheet|image|img/i;

export function transform(src, file, publicRoot) {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
  const text = (n) => src.slice(n.start, n.end);
  const edits = [];
  const flags = [];
  const flag = (n, msg) => flags.push({ file, line: n.loc.start.line, msg });
  const need = new Set(); // imports from js/textures.js
  const parent = new Map();
  walk(ast, (n, p) => {
    if (p) parent.set(n, p);
  });

  const isUrlish = (n) => {
    if (!n) return false;
    switch (n.type) {
      case 'Literal':
        return typeof n.value === 'string';
      case 'TemplateLiteral':
        return true;
      case 'BinaryExpression':
        return n.operator === '+' && (isUrlish(n.left) || isUrlish(n.right));
      case 'Identifier':
        return URLISH.test(n.name);
      case 'MemberExpression':
        return !n.computed ? URLISH.test(n.property.name) || (n.object.type !== 'ThisExpression' && isUrlish(n.object) && /^(open|wrapped|path|url|src)$/i.test(n.property.name)) : isUrlish(n.object);
      case 'CallExpression': {
        const c = n.callee;
        const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '';
        if (name === 'replace' && c.type === 'MemberExpression') return isUrlish(c.object);
        return URLISH.test(name) && !/canvas|tile|texture/i.test(name);
      }
      case 'ConditionalExpression':
        return isUrlish(n.consequent) && isUrlish(n.alternate);
      case 'LogicalExpression':
        return isUrlish(n.left) || isUrlish(n.right);
      case 'ChainExpression':
        return isUrlish(n.expression);
      default:
        return false;
    }
  };

  // ---- Text styles -------------------------------------------------------
  const DS_KEYS = { dropShadowAlpha: 'alpha', dropShadowAngle: 'angle', dropShadowBlur: 'blur', dropShadowColor: 'color', dropShadowDistance: 'distance' };
  const keyName = (p) => (p.type === 'Property' && !p.computed ? String(p.key.name ?? p.key.value) : null);
  const styleObjects = new Set();
  const pendingStyles = [];
  function convertStyle(obj, context) {
    if (styleObjects.has(obj)) return;
    styleObjects.add(obj);
    const props = obj.properties;
    const byKey = new Map();
    for (const p of props) {
      const k = keyName(p);
      if (k) byKey.set(k, p);
    }
    const hasSpread = props.some((p) => p.type === 'SpreadElement');
    const st = byKey.get('strokeThickness');
    const stroke = byKey.get('stroke');
    const ds = byKey.get('dropShadow');
    const dsKeys = Object.keys(DS_KEYS).filter((k) => byKey.has(k));
    const fill = byKey.get('fill');
    const stops = byKey.get('fillGradientStops');
    const removeProp = (p) => {
      // Remove "key: value," including the trailing comma/whitespace.
      let start = p.start;
      let end = p.end;
      const after = src.slice(end).match(/^\s*,/);
      if (after) end += after[0].length;
      else {
        const before = src.slice(0, start).match(/,\s*$/);
        if (before) start -= before[0].length;
      }
      // Remove the whole line when the property sat on its own line.
      const lineStart = src.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = src.indexOf('\n', end);
      if (/^\s*$/.test(src.slice(lineStart, start)) && /^\s*(\/\/.*)?$/.test(src.slice(end, lineEnd < 0 ? src.length : lineEnd)) && !src.slice(end, lineEnd).includes('//')) {
        start = lineStart;
        end = lineEnd < 0 ? src.length : lineEnd + 1;
      }
      edits.push({ start, end, text: '' });
    };
    // Stroke: v7 draws it only with a thickness.
    if (st) {
      const lit = st.value.type === 'Literal' ? st.value.value : null;
      if (lit === 0) {
        removeProp(st);
        if (stroke) removeProp(stroke);
      } else {
        const color = stroke ? text(stroke.value) : "'black'";
        const target = stroke || st;
        edits.push({ start: target.start, end: target.end, text: `stroke: { color: ${color}, width: ${text(st.value)} }` });
        if (stroke) removeProp(st);
      }
    } else if (stroke) {
      if (hasSpread) flag(stroke, `${context}: stroke without strokeThickness next to a spread (v7 width may come from the spread)`);
      else if (stroke.value.type !== 'ObjectExpression') removeProp(stroke);
    }
    // Drop shadow.
    if (ds) {
      const v = ds.value;
      if (v.type === 'Literal' && v.value === true) {
        const parts = dsKeys.map((k) => `${DS_KEYS[k]}: ${text(byKey.get(k).value)}`);
        edits.push({ start: ds.start, end: ds.end, text: `dropShadow: { ${parts.join(', ')} }` });
        for (const k of dsKeys) removeProp(byKey.get(k));
      } else if (v.type === 'Literal' && v.value === false) {
        for (const k of dsKeys) removeProp(byKey.get(k));
      } else if (v.type !== 'ObjectExpression') {
        flag(ds, `${context}: dynamic dropShadow (check)`);
      }
    } else if (dsKeys.length) {
      flag(byKey.get(dsKeys[0]), `${context}: dropShadow* keys without dropShadow (override of a spread?)`);
    }
    if (stops || (fill && fill.value.type === 'ArrayExpression')) flag(fill || stops, `${context}: gradient fill (use FillGradient)`);
    for (const k of ['fillGradientType', 'fillGradientStops']) if (byKey.has(k) && !fill) flag(byKey.get(k), `${context}: ${k}`);
  }

  // ---- walk --------------------------------------------------------------
  walk(ast, (n) => {
    // new PIXI.Text(a, b)
    if (n.type === 'NewExpression' && pixiMember(n.callee, 'Text')) {
      const [a, b] = n.arguments;
      if (a && a.type === 'ObjectExpression' && !b) return; // already v8
      const argsStart = n.arguments.length ? n.arguments[0].start : null;
      if (argsStart === null) return;
      const parts = [`text: ${text(a)}`];
      if (b) parts.push(`style: ${text(b)}`);
      edits.push({ start: n.arguments[0].start, end: n.arguments[n.arguments.length - 1].end, text: `{ ${parts.join(', ')} }`, inner: [a, b].filter(Boolean) });
      if (b && b.type === 'ObjectExpression') convertStyle(b, 'Text style');
      return;
    }
    if (n.type === 'NewExpression' && pixiMember(n.callee, 'TextStyle')) {
      const [a] = n.arguments;
      if (a && a.type === 'ObjectExpression') convertStyle(a, 'TextStyle');
      return;
    }
    if (n.type === 'ObjectExpression') {
      const keys = n.properties.map(keyName);
      if (keys.some((k) => k === 'strokeThickness' || (k && k.startsWith('dropShadow')) || k === 'fillGradientStops')) {
        // Defer: converted after the walk unless already handled.
        pendingStyles.push(n);
      }
      return;
    }
    // PIXI.Texture.from(x) / PIXI.Sprite.from(x)
    if (n.type === 'CallExpression' && (pixiMember2(n.callee, 'Texture', 'from') || pixiMember2(n.callee, 'Sprite', 'from'))) {
      const isSprite = n.callee.object.property.name === 'Sprite';
      const [arg, opts] = n.arguments;
      if (!arg) return;
      if (isUrlish(arg)) {
        need.add('textureFromUrl');
        const optsText = opts ? `, ${text(opts)}` : '';
        if (opts) flag(n, `${isSprite ? 'Sprite' : 'Texture'}.from options (check: ${text(opts).slice(0, 60)})`);
        const root = text(n.callee.object.object);
        const call = `textureFromUrl(${text(arg)}${optsText})`;
        edits.push({ start: n.start, end: n.end, text: isSprite ? `new ${root}.Sprite(${call})` : call, inner: [arg] });
      } else {
        flag(n, `${isSprite ? 'Sprite' : 'Texture'}.from(${text(arg).slice(0, 50)}): not a URL? (left as is)`);
      }
      return;
    }
    // PIXI.BaseTexture.from(x, opts)
    if (n.type === 'CallExpression' && pixiMember2(n.callee, 'BaseTexture', 'from')) {
      const [arg, opts] = n.arguments;
      if (isUrlish(arg)) {
        need.add('sourceFromUrl');
        edits.push({ start: n.start, end: n.end, text: `sourceFromUrl(${text(arg)}${opts ? `, ${text(opts)}` : ''})`, inner: [arg, opts].filter(Boolean) });
        if (opts) flag(n, 'BaseTexture.from(url, options) (check)');
      } else {
        const root = text(n.callee.object.object);
        let o = '';
        if (opts && opts.type === 'ObjectExpression') o = `, ${src.slice(opts.start + 1, opts.end - 1).trim()}`;
        else if (opts) o = `, ...${text(opts)}`;
        edits.push({ start: n.start, end: n.end, text: `new ${root}.CanvasSource({ resource: ${text(arg)}${o} })`, inner: [arg, opts].filter(Boolean) });
      }
      return;
    }
    // new PIXI.Texture(base, frame)
    if (n.type === 'NewExpression' && pixiMember(n.callee, 'Texture')) {
      const [base, frame, orig, trim] = n.arguments;
      if (!base || (base.type === 'ObjectExpression' && !frame)) return;
      if (orig || trim) flag(n, 'new Texture with orig/trim (check)');
      const parts = [`source: ${text(base)}`];
      if (frame) parts.push(`frame: ${text(frame)}`);
      edits.push({ start: base.start, end: n.arguments[n.arguments.length - 1].end, text: `{ ${parts.join(', ')} }`, inner: [base, frame].filter(Boolean) });
      return;
    }
    // new PIXI.TilingSprite(t, w, h)
    if (n.type === 'NewExpression' && pixiMember(n.callee, 'TilingSprite')) {
      const [t, w, h] = n.arguments;
      if (!t || (t.type === 'ObjectExpression' && !w)) return;
      const parts = [`texture: ${text(t)}`];
      if (w) parts.push(`width: ${text(w)}`);
      if (h) parts.push(`height: ${text(h)}`);
      edits.push({ start: t.start, end: n.arguments[n.arguments.length - 1].end, text: `{ ${parts.join(', ')} }`, inner: [t, w, h].filter(Boolean) });
      return;
    }
    // Enums.
    if (n.type === 'MemberExpression' && !n.computed && pixiMember(n.object, 'BLEND_MODES')) {
      edits.push({ start: n.start, end: n.end, text: `'${n.property.name.toLowerCase().replace(/_/g, '-')}'` });
      return;
    }
    if (n.type === 'MemberExpression' && !n.computed && pixiMember(n.object, 'SCALE_MODES')) {
      edits.push({ start: n.start, end: n.end, text: `'${n.property.name.toLowerCase()}'` });
      return;
    }
    if (n.type === 'MemberExpression' && !n.computed && (pixiMember(n.object, 'LINE_CAP') || pixiMember(n.object, 'LINE_JOIN'))) {
      edits.push({ start: n.start, end: n.end, text: `'${n.property.name.toLowerCase()}'` });
      return;
    }
    // PIXI.utils.string2hex(x)
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'string2hex' && pixiMember(n.callee.object, 'utils')) {
      const root = text(n.callee.object.object);
      edits.push({ start: n.start, end: n.end, text: `new ${root}.Color(${text(n.arguments[0])}).toNumber()`, inner: [n.arguments[0]] });
      return;
    }
    if (n.type === 'MemberExpression' && pixiMember(n, 'TextMetrics')) {
      edits.push({ start: n.property.start, end: n.property.end, text: 'CanvasTextMetrics' });
      return;
    }
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'baseTexture') {
      edits.push({ start: n.property.start, end: n.property.end, text: 'source' });
      return;
    }
    // app.view -> app.canvas (the Application only).
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'view' && n.object.type === 'Identifier' && n.object.name === 'app') {
      edits.push({ start: n.property.start, end: n.property.end, text: 'canvas' });
      return;
    }
    // destroy({ baseTexture: true })
    if (n.type === 'Property' && !n.computed && (n.key.name === 'baseTexture') && parent.get(n)?.type === 'ObjectExpression') {
      const call = parent.get(parent.get(n));
      if (call?.type === 'CallExpression' && call.callee.type === 'MemberExpression' && call.callee.property.name === 'destroy') {
        edits.push({ start: n.key.start, end: n.key.end, text: 'textureSource' });
      }
    }
    // .valid / once('loaded') / on('error')
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'valid') flag(n, `.valid on ${text(n.object).slice(0, 40)}`);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && ['once', 'on'].includes(n.callee.property.name) && n.arguments[0]?.type === 'Literal' && ['loaded', 'error'].includes(n.arguments[0].value)) {
      flag(n, `${n.callee.property.name}('${n.arguments[0].value}') on ${text(n.callee.object).slice(0, 40)}`);
    }
    if (n.type === 'MemberExpression' && pixiMember(n, 'Assets')) flag(n, 'PIXI.Assets use');
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'removeFromCache') flag(n, 'Texture.removeFromCache');
    if (n.type === 'MemberExpression' && pixiMember(n, 'Filter')) flag(n, 'PIXI.Filter');
    if (n.type === 'Identifier' && ['generateTexture', 'cacheAsBitmap', 'MIPMAP_MODES', 'ImageBitmapResource'].includes(n.name)) flag(n, n.name);
    if (n.type === 'MemberExpression' && !n.computed && ['generateTexture', 'cacheAsBitmap', 'MIPMAP_MODES', 'ImageBitmapResource', 'getChildByName', 'resource'].includes(n.property.name)) flag(n, `.${n.property.name}`);
  });
  for (const o of pendingStyles) convertStyle(o, 'style-like object');

  // Imports for js/textures.js.
  if (need.size) {
    const rel = relative(dirname(join(publicRoot, file)), join(publicRoot, 'js/textures.js'));
    const spec = rel.startsWith('.') ? rel : `./${rel}`;
    const names = [...need].sort();
    const existing = ast.body.find((s) => s.type === 'ImportDeclaration' && s.source.value === spec);
    if (existing) {
      const have = new Set(existing.specifiers.map((s) => s.local.name));
      const add = names.filter((x) => !have.has(x));
      if (add.length) {
        const last = existing.specifiers[existing.specifiers.length - 1];
        edits.push({ start: last.end, end: last.end, text: `, ${add.join(', ')}` });
      }
    } else {
      const imports = ast.body.filter((s) => s.type === 'ImportDeclaration');
      const at = imports.length ? imports[imports.length - 1].end : 0;
      edits.push({ start: at, end: at, text: `${at ? '\n' : ''}import { ${names.join(', ')} } from '${spec}';${at ? '' : '\n'}` });
    }
  }

  // Apply: outer edits that contain inner nodes re-render inner edits first.
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  // Resolve nesting: an edit with `inner` nodes embeds their (edited) text.
  const render = (start, end, list) => {
    let out = '';
    let pos = start;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.start < pos) continue;
      out += src.slice(pos, e.start);
      // Edits fully inside e's inner nodes.
      const nested = list.filter((x) => x !== e && x.start >= e.start && x.end <= e.end);
      if (e.inner && nested.length) {
        let t = e.text;
        for (const node of e.inner) {
          const orig = src.slice(node.start, node.end);
          const sub = nested.filter((x) => x.start >= node.start && x.end <= node.end);
          if (!sub.length) continue;
          const rendered = render(node.start, node.end, sub);
          t = t.replace(orig, rendered);
        }
        out += t;
      } else {
        out += e.text;
      }
      pos = e.end;
      // Skip nested edits.
      while (i + 1 < list.length && list[i + 1].start < e.end) i++;
    }
    return out + src.slice(pos, end);
  };
  const code = render(0, src.length, edits);
  return { code, flags, changed: code !== src };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  const root = process.argv.find((a) => a.startsWith('--root='))?.slice(7) || '.';
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let total = 0;
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    let r;
    try {
      r = transform(src, f, root);
    } catch (e) {
      console.log(`ERROR ${f}: ${e.stack}`);
      continue;
    }
    for (const fl of r.flags) console.log(`${fl.file}:${fl.line}: ${fl.msg}`);
    total += r.flags.length;
    if (write && r.changed) writeFileSync(join(root, f), r.code);
  }
  console.error(`${total} flags`);
}
