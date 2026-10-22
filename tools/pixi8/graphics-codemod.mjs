// Pixi 7 -> 8 Graphics codemod.
// Usage: node tools/pixi8/graphics-codemod.mjs [--write] public/js/x.js ...
// Prints flags (file:line: reason) to fix by hand; check with check-graphics.mjs.
//
// Pixi 7 Graphics is a state machine: beginFill/lineStyle set the current
// styles, every draw* shape is captured with the styles active when it is
// drawn, and moveTo/lineTo polygons with the styles active when the polygon is
// finished (the next moveTo, closePath, style change, endFill or render).
// Pixi 8 builds a path and paints it with explicit fill()/stroke() calls.
//
// The codemod runs an abstract interpreter over every function: it tracks,
// per Graphics receiver, the fill and line style (none / set at site S /
// unknown) and whether shapes are pending, and emits fill()/stroke() where
// v7 would have finished a run of shapes under one style:
// - style setters (beginFill, lineStyle, endFill) and exits flush pending
//   shapes with the styles that were active;
// - with both a fill and a line active, every shape is flushed on its own
//   (v7 draws fill then line per shape; a run flush would stroke after all
//   fills);
// - a style whose expression is stable and is only consumed by one flush is
//   inlined (`.fill({ color, alpha })`); otherwise the setter becomes
//   setFillStyle/setStrokeStyle at the same place and the flush is a bare
//   fill()/stroke().
// Anything it cannot prove is reported (file:line, reason) for a manual edit.
import { parse } from 'acorn';
import { readFileSync, writeFileSync } from 'node:fs';

const STYLE_OPS = new Set(['beginFill', 'endFill', 'lineStyle']);
const SHAPE_OPS = { drawRect: 'rect', drawRoundedRect: 'roundRect', drawCircle: 'circle', drawEllipse: 'ellipse', drawPolygon: 'poly', drawStar: 'star' };
const PATH_OPS = new Set(['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'closePath']);
const V7_ONLY = new Set([...STYLE_OPS, ...Object.keys(SHAPE_OPS)]);
const ALL_OPS = new Set([...V7_ONLY, ...PATH_OPS, 'clear']);
const ITERATORS = new Set(['forEach', 'map', 'flatMap', 'filter', 'some', 'every', 'reduce', 'find']);
const LOOP_TYPES = new Set(['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement']);
const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

export function transform(src, file = '') {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
  const flags = [];
  const lineOf = (node) => node.loc.start.line;
  const flag = (node, msg) => flags.push({ file, line: lineOf(node), msg });

  // ---------------------------------------------------------------- parents
  const parent = new Map();
  (function link(node, p) {
    if (!node || typeof node.type !== 'string') return;
    if (p) parent.set(node, p);
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && link(c, node));
      else if (v && typeof v.type === 'string') link(v, node);
    }
  })(ast, null);
  const fnOf = (node) => {
    let n = parent.get(node);
    while (n && !FN_TYPES.has(n.type) && n.type !== 'Program') n = parent.get(n);
    return n || ast;
  };

  // ---------------------------------------------------------------- scopes
  // name -> declared in function node (function-level approximation).
  const declared = new Map(); // fnNode -> Map(name -> declNode)
  const decl = (fn, name, node) => {
    if (!declared.has(fn)) declared.set(fn, new Map());
    declared.get(fn).set(name, node);
  };
  const patternNames = (p, out = []) => {
    if (!p) return out;
    if (p.type === 'Identifier') out.push(p);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
    else if (p.type === 'ArrayPattern') p.elements.forEach((e) => patternNames(e, out));
    else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
    else if (p.type === 'RestElement') patternNames(p.argument, out);
    return out;
  };
  walk(ast, (node) => {
    if (FN_TYPES.has(node.type)) {
      if (node.type === 'FunctionDeclaration' && node.id) decl(fnOf(node), node.id.name, node);
      for (const p of node.params) for (const id of patternNames(p)) decl(node, id.name, p);
    } else if (node.type === 'VariableDeclarator') {
      for (const id of patternNames(node.id)) decl(fnOf(node), id.name, node);
    } else if (node.type === 'ClassDeclaration' && node.id) decl(fnOf(node), node.id.name, node);
    else if (node.type === 'CatchClause' && node.param) for (const id of patternNames(node.param)) decl(fnOf(node), id.name, node);
    else if (node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier' || node.type === 'ImportNamespaceSpecifier') decl(ast, node.local.name, node);
  });
  const resolve = (name, fromFn) => {
    let f = fromFn;
    while (f) {
      if (declared.get(f)?.has(name)) return f;
      if (f === ast) return null;
      f = fnOf(f);
    }
    return null;
  };
  // Assignments per name (to detect reassigned identifiers).
  const assigned = new Map(); // `${fnStart}:${name}` -> [nodes]
  walk(ast, (node) => {
    let target = null;
    if (node.type === 'AssignmentExpression') target = node.left;
    else if (node.type === 'UpdateExpression') target = node.argument;
    if (target?.type === 'Identifier') {
      const f = resolve(target.name, fnOf(node));
      const k = `${f ? f.start : 'g'}:${target.name}`;
      if (!assigned.has(k)) assigned.set(k, []);
      assigned.get(k).push(node);
    }
  });

  // ------------------------------------------------------------- receivers
  const text = (node) => src.slice(node.start, node.end);
  /** Normalised key for a receiver expression, or null. */
  const keyOf = (expr) => {
    if (expr.type === 'Identifier') return expr.name;
    if (expr.type === 'ThisExpression') return 'this';
    if (expr.type === 'MemberExpression' && !expr.computed && !expr.optional) {
      const k = keyOf(expr.object);
      return k ? `${k}.${expr.property.name}` : null;
    }
    return null;
  };
  const rootName = (expr) => {
    while (expr.type === 'MemberExpression') expr = expr.object;
    return expr.type === 'Identifier' ? expr.name : expr.type === 'ThisExpression' ? 'this' : null;
  };
  const rootNode = (expr) => {
    while (expr.type === 'MemberExpression') expr = expr.object;
    return expr;
  };
  /** Identity of a receiver expression used in function fn. */
  const identityOf = (expr, fn) => {
    const key = keyOf(expr);
    if (!key) return null;
    const root = rootName(expr);
    if (root === 'this') return `this:${key}`;
    const f = resolve(root, fn);
    return `${f ? f.start : 'global'}:${key}`;
  };
  const thisFn = (fn) => {
    let f = fn;
    while (f && f.type === 'ArrowFunctionExpression') f = fnOf(f);
    return f || ast;
  };

  /** A call chain `R.op(..).op(..)`: { base, links:[{call, name}] } or null. */
  const chainOf = (call) => {
    const links = [];
    let node = call;
    while (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed && ALL_OPS.has(node.callee.property.name)) {
      links.unshift({ call: node, name: node.callee.property.name });
      node = node.callee.object;
    }
    if (!links.length) return null;
    return { base: node, links };
  };

  // Which identities are Graphics: a v7-only op on them anywhere, or a
  // `new *.Graphics(` assigned to them.
  const graphicsIds = new Set();
  const isNewGraphics = (n) => n && n.type === 'NewExpression' && ((n.callee.type === 'MemberExpression' && n.callee.property.name === 'Graphics') || (n.callee.type === 'Identifier' && n.callee.name === 'Graphics'));
  const chainHead = (call) => {
    // The outermost call of the chain this call belongs to.
    let n = call;
    for (;;) {
      const p = parent.get(n);
      const pp = p && parent.get(p);
      if (p?.type === 'MemberExpression' && p.object === n && !p.computed && ALL_OPS.has(p.property.name) && pp?.type === 'CallExpression' && pp.callee === p) n = pp;
      else return n;
    }
  };
  const newGraphicsBase = (base) => isNewGraphics(base);
  walk(ast, (node) => {
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed && V7_ONLY.has(node.callee.property.name)) {
      const ch = chainOf(chainHead(node));
      if (!ch) return;
      const id = identityOf(ch.base, fnOf(node));
      if (id) graphicsIds.add(id);
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
      let init = node.init;
      if (init.type === 'CallExpression') {
        const ch = chainOf(init);
        if (ch && isNewGraphics(ch.base)) init = ch.base;
      }
      if (isNewGraphics(init)) graphicsIds.add(identityOf(node.id, fnOf(node)));
    }
    if (node.type === 'AssignmentExpression' && isNewGraphics(node.right)) {
      const id = identityOf(node.left, fnOf(node));
      if (id) graphicsIds.add(id);
    }
  });

  // Path ops on receivers that are neither known Graphics nor canvas 2D.
  const CANVAS = new Set(['beginPath', 'fill', 'stroke', 'fillRect', 'strokeRect', 'save', 'restore', 'fillText', 'clearRect', 'drawImage', 'translate', 'rect', 'ellipse']);
  {
    const byFnKey = new Map();
    walk(ast, (n) => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return;
      const fn = fnOf(n);
      const key = keyOf(n.callee.object);
      if (!key) return;
      const k = `${fn.start}|${key}`;
      if (!byFnKey.has(k)) byFnKey.set(k, { canvas: false, path: [], id: identityOf(n.callee.object, fn) });
      const e = byFnKey.get(k);
      if (CANVAS.has(n.callee.property.name)) e.canvas = true;
      if (PATH_OPS.has(n.callee.property.name)) e.path.push(n);
    });
    for (const e of byFnKey.values()) {
      if (e.path.length && !e.canvas && !graphicsIds.has(e.id)) flag(e.path[0], `path ops on ${e.id.split(':').slice(1).join(':')} which is not a known Graphics nor a canvas context (check)`);
    }
  }

  // ------------------------------------------------------- abstract states
  const NONE = { kind: 'none', sites: new Set() };
  const TOP = { kind: 'top', sites: new Set() };
  const set = (site) => ({ kind: 'set', sites: new Set([site]) });
  const mergeStyle = (a, b) => {
    if (a === b) return a;
    if (a.kind === 'top' || b.kind === 'top') return TOP;
    if (a.kind === 'none' && b.kind === 'none') return NONE;
    if (a.kind === 'set' && b.kind === 'set') return { kind: 'set', sites: new Set([...a.sites, ...b.sites]) };
    return { kind: 'mixed', sites: new Set([...a.sites, ...b.sites]) };
  };
  const eqStyle = (a, b) => a.kind === b.kind && a.sites.size === b.sites.size && [...a.sites].every((s) => b.sites.has(s));
  const fresh = (assumed = false) => ({ fill: NONE, line: NONE, pfill: NONE, pline: NONE, pending: 0, open: false, assumed, afterEnd: false });
  const clone = (st) => (st ? new Map([...st].map(([k, v]) => [k, { ...v }])) : null);
  const mergeStates = (a, b) => {
    if (!a) return clone(b);
    if (!b) return clone(a);
    const out = new Map();
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k) || fresh(true);
      const y = b.get(k) || fresh(true);
      const pick = (f) => (!x.pending ? y[f] : !y.pending ? x[f] : mergeStyle(x[f], y[f]));
      out.set(k, {
        fill: mergeStyle(x.fill, y.fill),
        line: mergeStyle(x.line, y.line),
        pfill: pick('pfill'),
        pline: pick('pline'),
        pending: x.pending === y.pending ? x.pending : 2,
        open: x.open || y.open,
        assumed: x.assumed || y.assumed,
        afterEnd: x.afterEnd || y.afterEnd,
        viaCall: (x.pending && x.viaCall) || (y.pending && y.viaCall),
      });
    }
    return out;
  };
  const eqStates = (a, b) => {
    if (!a || !b) return a === b;
    if (a.size !== b.size) return false;
    for (const [k, x] of a) {
      const y = b.get(k);
      if (!y || !eqStyle(x.fill, y.fill) || !eqStyle(x.line, y.line) || !eqStyle(x.pfill, y.pfill) || !eqStyle(x.pline, y.pline) || x.pending !== y.pending || x.open !== y.open) return false;
    }
    return true;
  };

  // ------------------------------------------------------- style sites
  // site: { node (call), kind:'fill'|'line', none:boolean, styleText, stable:boolean, consumers:Set(flushId) }
  const sites = new Map(); // call node -> site
  const literalZero = (n) => n && n.type === 'Literal' && n.value === 0;
  const isLiteral = (n) => n && (n.type === 'Literal' || (n.type === 'UnaryExpression' && n.argument.type === 'Literal'));
  /** Can `n` be undefined at runtime? (alpha/width guards) */
  const maybeUndefined = (n, fn) => {
    if (!n) return true;
    if (isLiteral(n) || n.type === 'BinaryExpression' || n.type === 'TemplateLiteral') return false;
    if (n.type === 'Identifier') {
      const f = resolve(n.name, fn);
      const d = f && declared.get(f)?.get(n.name);
      if (!d) return true;
      if (d.type === 'AssignmentPattern') return false; // param with default
      if (d.type === 'VariableDeclarator' && d.init && d.id.type === 'Identifier') return maybeUndefined(d.init, fnOf(d));
      if (d.type === 'VariableDeclarator' && d.id.type !== 'Identifier') {
        // destructured: default value present?
        const target = patternNames(d.id).find((id) => id.name === n.name);
        const p = target && parent.get(target);
        return !(p && p.type === 'AssignmentPattern' && p.left === target);
      }
      if (d.type === 'ForOfStatement' || d.type === 'ForStatement') return true;
      return true;
    }
    if (n.type === 'ConditionalExpression') return maybeUndefined(n.consequent, fn) || maybeUndefined(n.alternate, fn);
    if (n.type === 'LogicalExpression' && (n.operator === '??' || n.operator === '||')) return maybeUndefined(n.right, fn);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Math') return false;
    return true;
  };
  const guard = (n, fallback, fn) => (maybeUndefined(n, fn) ? `${text(n)} ?? ${fallback}` : text(n));
  const fillStyleText = (call, fn) => {
    const [c, a] = call.arguments;
    if (!c) return '0x000000';
    if (!a) return text(c);
    return `{ color: ${text(c)}, alpha: ${guard(a, 1, fn)} }`;
  };
  const LINE_CONST = { 'PIXI.LINE_CAP.ROUND': "'round'", 'PIXI.LINE_CAP.SQUARE': "'square'", 'PIXI.LINE_CAP.BUTT': "'butt'", 'PIXI.LINE_JOIN.ROUND': "'round'", 'PIXI.LINE_JOIN.BEVEL': "'bevel'", 'PIXI.LINE_JOIN.MITER': "'miter'" };
  const lineStyleText = (call, fn) => {
    const args = call.arguments;
    if (args[0]?.type === 'ObjectExpression') {
      const parts = [];
      let hasColor = false;
      for (const p of args[0].properties) {
        if (p.type === 'SpreadElement') {
          parts.push(text(p));
          hasColor = true; // unknown spread: assume it carries colour
          continue;
        }
        const key = p.key.name || p.key.value;
        let v = text(p.value);
        v = v.replace(/\b(?:\w+\.)?PIXI\.LINE_(?:CAP|JOIN)\.[A-Z]+\b/g, (m) => LINE_CONST[m.replace(/^\w+\.(?=PIXI)/, '')] || m);
        if (key === 'alignment') {
          flag(call, 'lineStyle alignment: v8 alignment is 1 - v7 alignment (check)');
          v = `1 - (${v})`;
        }
        if (key === 'native') {
          flag(call, 'lineStyle native line: use pixelLine in v8 (check)');
          parts.push(`pixelLine: ${v}`);
          continue;
        }
        if (key === 'color') hasColor = true;
        if (key === 'alpha' && maybeUndefined(p.value, fn)) v = `${v} ?? 1`;
        parts.push(p.shorthand && v === key ? key : `${key}: ${v}`);
      }
      if (!hasColor) parts.push('color: 0x000000');
      return `{ ${parts.join(', ')} }`;
    }
    const [w, c, a, align, nat] = args;
    if (align || nat) flag(call, 'lineStyle alignment/native positional args (check)');
    const parts = [`width: ${text(w)}`, `color: ${c ? text(c) : '0x000000'}`];
    if (a) parts.push(`alpha: ${guard(a, 1, fn)}`);
    return `{ ${parts.join(', ')} }`;
  };
  const isNoneStyle = (call) => {
    const name = call.callee.property.name;
    const args = call.arguments;
    if (name === 'endFill') return true;
    if (name === 'beginFill') return literalZero(args[1]);
    if (name === 'lineStyle') {
      if (!args.length) return true;
      if (args[0].type === 'ObjectExpression') {
        const w = args[0].properties.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'width');
        const a = args[0].properties.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'alpha');
        if (!args[0].properties.some((p) => p.type === 'SpreadElement') && (!w || literalZero(w.value))) return true;
        return !!(a && literalZero(a.value));
      }
      return literalZero(args[0]) || literalZero(args[2]);
    }
    return false;
  };
  // Identifiers referenced by an expression.
  const idsIn = (node, out = new Set()) => {
    walk(node, (n, p) => {
      if (n.type === 'Identifier' && !(p && p.type === 'MemberExpression' && p.property === n && !p.computed) && !(p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand)) out.add(n);
    });
    return out;
  };
  const hasCall = (node) => {
    let found = false;
    walk(node, (n) => {
      if (n.type === 'CallExpression' || n.type === 'NewExpression' || n.type === 'UpdateExpression' || n.type === 'AssignmentExpression') {
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Math' && n.callee.property.name !== 'random') return;
        found = true;
      }
    });
    return found;
  };
  const loopsAround = (node) => {
    const out = [];
    for (let n = parent.get(node); n && !FN_TYPES.has(n.type); n = parent.get(n)) if (LOOP_TYPES.has(n.type)) out.push(n);
    return out;
  };
  /** Innermost scope node (block, loop or function) a declaration lives in. */
  const scopeOfDecl = (d) => {
    for (let n = parent.get(d); n; n = parent.get(n)) {
      if (n.type === 'BlockStatement' || LOOP_TYPES.has(n.type) || FN_TYPES.has(n.type) || n.type === 'Program' || n.type === 'SwitchCase' || n.type === 'CatchClause') return n;
    }
    return ast;
  };
  const inside = (n, outer) => n.start >= outer.start && n.end <= outer.end;
  /** Is the style at `site` evaluated to the same value at flush node `at`? */
  const LIST_PARENTS = new Set(['BlockStatement', 'Program', 'SwitchCase', 'StaticBlock']);
  const stmtOf = (node) => {
    let n = node;
    for (let p = parent.get(n); p; n = p, p = parent.get(p)) if (LIST_PARENTS.has(p.type)) return n;
    return null;
  };
  const listOf = (stmt) => {
    const p = parent.get(stmt);
    return p ? (p.type === 'SwitchCase' ? p.consequent : p.body) : null;
  };
  /** A statement that only draws on Graphics (no other code can run). */
  const drawingOnly = (stmt) => {
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
      const ch = chainOf(stmt.expression);
      return !!(ch && chainHead(stmt.expression) === stmt.expression);
    }
    if (LOOP_TYPES.has(stmt.type)) {
      const body = stmt.body.type === 'BlockStatement' ? stmt.body.body : [stmt.body];
      return body.every(drawingOnly);
    }
    return stmt.type === 'EmptyStatement';
  };
  const adjacent = (siteCall, at) => {
    if (at.type === 'BlockStatement') {
      // A flush at the end of this block: everything after the site's
      // statement in the block must only draw.
      let a = siteCall;
      while (a && parent.get(a) !== at) a = parent.get(a);
      if (!a) return false;
      const i = at.body.indexOf(a);
      for (let k = i + 1; k < at.body.length; k++) if (!drawingOnly(at.body[k])) return false;
      return true;
    }
    const a = stmtOf(siteCall);
    const b = stmtOf(at);
    if (!a || !b) return false;
    if (a === b) return siteCall.start <= at.start;
    const list = listOf(a);
    if (!list || list !== listOf(b)) return false;
    const i = list.indexOf(a);
    const j = list.indexOf(b);
    if (i < 0 || j <= i) return false;
    for (let k = i + 1; k < j; k++) if (!drawingOnly(list[k])) return false;
    return true;
  };
  /** Assignments that only advance a loop counter between site and flush in one iteration. */
  const counterOnly = (assigns, siteCall, at) => assigns.every((asg) => {
    for (let n = parent.get(asg); n; n = parent.get(n)) {
      const p = parent.get(n);
      if (p && p.type === 'ForStatement' && p.update === n) return inside(siteCall, p.body) && inside(at, p.body) && siteCall.start < at.start;
      if (FN_TYPES.has(n.type)) return false;
    }
    return false;
  });
  const stableBetween = (siteCall, at, fn) => {
    const args = siteCall.arguments;
    for (const a of args) if (hasCall(a)) return false;
    if (adjacent(siteCall, at)) return true;
    for (const a of args) {
      for (const id of idsIn(a)) {
        const f = resolve(id.name, fn);
        if (!f) continue; // global
        const asg = assigned.get(`${f.start}:${id.name}`);
        if (asg?.length && !counterOnly(asg, siteCall, at)) return false;
        const d = declared.get(f).get(id.name);
        if (!d) return false;
        // The binding must be in scope at the flush ...
        const scope = FN_TYPES.has(d.type) && d.type !== 'FunctionDeclaration' ? d : scopeOfDecl(d);
        if (!inside(at, scope)) return false;
        // ... and the same per-iteration binding: no loop between the
        // declaration and the flush that the flush re-enters before the site.
        for (let n = parent.get(d); n && n !== scope.parent; n = parent.get(n)) {
          if (LOOP_TYPES.has(n.type) && inside(at, n) && at.start <= siteCall.start) return false;
          if (n === scope) break;
        }
        if (LOOP_TYPES.has(scope.type) && at.start <= siteCall.start) return false;
        for (const l of loopsAround(d)) if (inside(at, l) && inside(siteCall, l) && at.start <= siteCall.start) return false;
      }
    }
    // A site inside a loop consumed at or before itself (back edge).
    for (const l of loopsAround(siteCall)) if (inside(at, l) && at.start <= siteCall.start && args.some((a) => idsIn(a).size)) return false;
    return true;
  };

  // ------------------------------------------------------- edit recording
  const edits = []; // { start, end, text }
  const decisions = new Map(); // key -> decision (last analysis pass wins)
  const decide = (key, value) => decisions.set(key, value);

  // Flush record: { id, node(anchor), where:'replace-link'|'before'|'after-link'|'end-of-body', state }
  const flushes = new Map(); // anchorKey -> flush

  // ------------------------------------------------------- interpreter
  let recording = false;

  function analyzeFunction(fn) {
    const body = fn.type === 'Program' ? fn : fn.body;
    let st = new Map();
    if (body.type !== 'BlockStatement' && body.type !== 'Program') {
      // Expression-bodied arrow.
      st = expr(body, st, fn);
      exitFlush(st, fn, body, 'expr-body');
      return;
    }
    // Fixpoint is only needed in loops; run the body twice to settle sites.
    st = block(body.body, st, fn);
    if (st) exitFlush(st, fn, body, 'end');
  }

  const hasContinue = (body) => {
    let found = false;
    walk(body, (n) => {
      if (n.type === 'ContinueStatement') found = true;
    });
    return found;
  };
  const sitesInside = (style, body) => style.kind === 'none' || (style.kind === 'set' && [...style.sites].every((c) => inside(c, body)));
  const firstOpCache = new Map();
  const firstOpName = (body, id, fn) => {
    const k = `${body.start}|${id}`;
    if (firstOpCache.has(k)) return firstOpCache.get(k);
    let best = null;
    walk(body, (n) => {
      if (n.type !== 'CallExpression') return;
      const ch = chainOf(n);
      if (!ch || chainHead(n) !== n || ch.base.type === 'NewExpression') return;
      if (identityOf(ch.base, fnOf(n)) !== id) return;
      if (!best || n.start < best.start) best = { start: n.start, name: ch.links[0].name };
    });
    firstOpCache.set(k, best?.name || null);
    return best?.name || null;
  };
  const CONTINUES = new Set(['lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'closePath']);
  /** Flush shapes styled inside a loop body at the end of that body. */
  const returnsIn = (body) => {
    const out = [];
    (function visit(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n !== body && FN_TYPES.has(n.type)) return;
      if (n.type === 'ReturnStatement') out.push(n);
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'range') continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v.type === 'string') visit(v);
      }
    })(body);
    return out;
  };
  function loopEndFlush(st, body, fn) {
    if (!st || body.type !== 'BlockStatement' || hasContinue(body)) return st;
    let anchor = body;
    let where = 'loop-end';
    if (FN_TYPES.has(parent.get(body)?.type)) {
      const rets = returnsIn(body);
      const last = body.body[body.body.length - 1];
      if (rets.length > 1 || (rets.length === 1 && rets[0] !== last)) return st;
      if (rets.length === 1) {
        anchor = last;
        where = 'before';
      }
    }
    for (const [id, g] of st) {
      if (!g.pending) continue;
      if (g.pfill.kind === 'none' && g.pline.kind === 'none') continue;
      if (!sitesInside(g.pfill, body) || !sitesInside(g.pline, body)) continue;
      const first = firstOpName(body, id, fn);
      if (!first || CONTINUES.has(first)) continue;
      recordFlush(id, g, anchor, where, fn);
      g.pending = 0;
    }
    return st;
  }

  function ensure(st, id) {
    if (!st.has(id)) st.set(id, fresh(true));
    return st.get(id);
  }

  function exitFlush(st, fn, anchor, where) {
    for (const [id, s] of st) {
      if (!s.pending) continue;
      // Shapes drawn under the caller's style: the caller flushes them.
      if (s.assumed && s.pfill.kind === 'none' && s.pline.kind === 'none') continue;
      recordFlush(id, s, anchor, where, fn);
    }
  }
  const ownedOrParam = () => true;

  function recordFlush(id, s, anchor, where, fn, extra = {}) {
    const key = `${anchor.start}-${anchor.end}:${where}:${id}`;
    if (!recording) return;
    flushes.set(key, { id, anchor, where, fill: s.pfill, line: s.pline, pending: s.pending, fn, ...extra });
  }

  function block(stmts, st, fn) {
    for (const s of stmts) {
      if (!st) return null;
      st = statement(s, st, fn);
    }
    return st;
  }

  /** First Graphics op on `id` inside `node` (source order), or null. */
  const firstOpIn = (node, id) => {
    let best = null;
    walk(node, (n) => {
      if (n.type !== 'CallExpression') return;
      const ch = chainOf(n);
      if (!ch || chainHead(n) !== n || ch.base.type === 'NewExpression') return;
      if (identityOf(ch.base, fnOf(n)) !== id) return;
      if (!best || n.start < best.start) best = { start: n.start, name: ch.links[0].name };
    });
    return best?.name || null;
  };
  const COMPOUND = new Set(['IfStatement', 'ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement']);
  /** Flush before a loop or branch whose first op on the receiver changes style anyway. */
  const exitsIn = (node) => {
    let found = false;
    (function visit(n) {
      if (found || !n || typeof n.type !== 'string') return;
      if (n !== node && FN_TYPES.has(n.type)) return;
      if (n.type === 'ReturnStatement' || n.type === 'ThrowStatement') {
        found = true;
        return;
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'range') continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v.type === 'string') visit(v);
      }
    })(node);
    return found;
  };
  /** The first op on `id` after `node` in the same function (source order). */
  const nextOpAfter = (node, id, fn) => {
    let best = null;
    walk(fn, (n) => {
      if (n.type !== 'CallExpression' || n.start < node.end) return;
      const ch = chainOf(n);
      if (!ch || chainHead(n) !== n || ch.base.type === 'NewExpression') return;
      if (identityOf(ch.base, fnOf(n)) !== id) return;
      if (!best || n.start < best.start) best = { start: n.start, name: ch.links[0].name };
    });
    return best?.name || null;
  };
  function preCompoundFlush(s, st, fn) {
    for (const [id, g] of st) {
      if (!g.pending || (g.pending === 2 && g.viaCall)) continue;
      if (g.open) {
        const inner = firstOpIn(s, id);
        const after = nextOpAfter(s, id, fn);
        if ((inner && CONTINUES.has(inner)) || (after && CONTINUES.has(after))) continue;
      }
      if (!['none', 'set'].includes(g.pfill.kind) || !['none', 'set'].includes(g.pline.kind)) continue;
      if (g.pfill.kind === 'none' && g.pline.kind === 'none') continue;
      const first = firstOpIn(s, id);
      if (!(first && STYLE_OPS.has(first)) && !exitsIn(s)) continue;
      recordFlush(id, g, s, 'before', fn);
      g.pending = 0;
      g.open = false;
    }
  }

  function statement(s, st, fn) {
    if (st && COMPOUND.has(s.type)) preCompoundFlush(s, st, fn);
    switch (s.type) {
      case 'BlockStatement':
        return block(s.body, st, fn);
      case 'ExpressionStatement':
        return expr(s.expression, st, fn, s);
      case 'VariableDeclaration':
        for (const d of s.declarations) {
          if (!d.init) continue;
          st = expr(d.init, st, fn, s);
          if (d.id.type === 'Identifier') {
            let init = d.init;
            if (init.type === 'CallExpression') {
              const ch = chainOf(init);
              if (ch && isNewGraphics(ch.base)) init = null; // handled in expr
            }
            if (init && isNewGraphics(init)) st.set(identityOf(d.id, fn), fresh(false));
          }
        }
        return st;
      case 'IfStatement': {
        st = expr(s.test, st, fn, s);
        const a = statement(s.consequent, clone(st), fn);
        const b = s.alternate ? statement(s.alternate, clone(st), fn) : st;
        return mergeStates(a, b);
      }
      case 'ForStatement':
      case 'ForOfStatement':
      case 'ForInStatement':
      case 'WhileStatement':
      case 'DoWhileStatement': {
        if (s.init) st = s.init.type === 'VariableDeclaration' ? statement(s.init, st, fn) : expr(s.init, st, fn, s);
        if (s.right) st = expr(s.right, st, fn, s);
        if (s.test && s.type !== 'DoWhileStatement') st = expr(s.test, st, fn, s);
        let entry = clone(st);
        let out = null;
        const wasRecording = recording;
        recording = false;
        for (let i = 0; i < 6; i++) {
          out = loopEndFlush(statement(s.body, clone(entry), fn), s.body, fn);
          if (out && s.update) out = expr(s.update, out, fn, s);
          const next = mergeStates(st, out);
          if (eqStates(next, entry)) break;
          entry = next;
        }
        recording = wasRecording;
        out = loopEndFlush(statement(s.body, clone(entry), fn), s.body, fn);
        if (out && s.update) out = expr(s.update, out, fn, s);
        return s.type === 'DoWhileStatement' ? mergeStates(out, out) : mergeStates(st, out);
      }
      case 'SwitchStatement': {
        st = expr(s.discriminant, st, fn, s);
        let acc = s.cases.some((c) => !c.test) ? null : clone(st);
        let fall = null;
        for (const c of s.cases) {
          const entry = fall ? mergeStates(st, fall) : clone(st);
          fall = block(c.consequent, entry, fn);
          acc = mergeStates(acc, fall);
        }
        return acc;
      }
      case 'ReturnStatement': {
        if (s.argument) st = expr(s.argument, st, fn, s);
        if (inlineFns.has(fn) && inlineStack.length) {
          inlineStack[inlineStack.length - 1].push(clone(st));
          return null;
        }
        if (st && s.argument?.type === 'CallExpression') {
          const ch = chainOf(s.argument);
          const id = ch && ch.base.type !== 'NewExpression' ? identityOf(ch.base, fn) : null;
          const g = id && st.get(id);
          if (g && g.pending) {
            recordFlush(id, g, s.argument, 'after-chain', fn);
            g.pending = 0;
          }
        }
        if (st) exitFlush(st, fn, s, 'before');
        return null;
      }
      case 'ThrowStatement':
        return null;
      case 'TryStatement': {
        const a = statement(s.block, clone(st), fn);
        let out = a;
        if (s.handler) out = mergeStates(a, statement(s.handler.body, mergeStates(st, a), fn));
        if (s.finalizer) out = statement(s.finalizer, out || clone(st), fn);
        return out;
      }
      case 'LabeledStatement':
        return statement(s.body, st, fn);
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        return st;
      default:
        return st;
    }
  }

  /** Effects of an expression, in evaluation order (approximate). */
  function expr(e, st, fn, stmt) {
    if (!e || !st) return st;
    if (e.type === 'CallExpression') {
      const ch = chainOf(e);
      if (ch && (chainHead(e) === e)) {
        if (ch.base.type === 'NewExpression') {
          if (!isNewGraphics(ch.base)) return st;
          // `new PIXI.Graphics().beginFill(..)...` assigned to a declarator?
          const p = parent.get(e);
          const id = p?.type === 'VariableDeclarator' && p.id.type === 'Identifier' ? identityOf(p.id, fn) : `anon@${e.start}`;
          st.set(id, fresh(false));
          st = links(id, ch, st, fn, stmt);
          const s = st.get(id);
          if (s.pending) {
            // Flush at the end of the chain expression.
            recordFlush(id, s, e, 'after-chain', fn);
            s.pending = 0;
          }
          return st;
        }
        const id = identityOf(ch.base, fn);
        if (id && graphicsIds.has(id)) {
          // Arguments first.
          for (const l of ch.links) for (const a of l.call.arguments) st = expr(a, st, fn, stmt);
          return links(id, ch, st, fn, stmt);
        }
      }
      // Array iteration with an inline callback: loop semantics.
      const cal = e.callee;
      if (cal.type === 'MemberExpression' && !cal.computed && ITERATORS.has(cal.property.name)) {
        st = expr(cal.object, st, fn, stmt);
        for (const a of e.arguments) {
          if (FN_TYPES.has(a.type)) {
            inlineFns.add(a);
            let entry = clone(st);
            let out = null;
            const wasRecording = recording;
            recording = false;
            for (let i = 0; i < 6; i++) {
              out = loopEndFlush(inlineBody(a, clone(entry), fn), a.body, a);
              const next = mergeStates(st, out);
              if (eqStates(next, entry)) break;
              entry = next;
            }
            recording = wasRecording;
            out = loopEndFlush(inlineBody(a, clone(entry), fn), a.body, a);
            st = mergeStates(st, out);
          } else st = expr(a, st, fn, stmt);
        }
        return st;
      }
      // Generic call: arguments, then effects on Graphics passed or captured.
      st = expr(cal.type === 'MemberExpression' ? cal.object : cal, st, fn, stmt);
      for (const a of e.arguments) if (!FN_TYPES.has(a.type)) st = expr(a, st, fn, stmt);
      callEffects(e, st, fn);
      return st;
    }
    if (e.type === 'AssignmentExpression') {
      st = expr(e.right, st, fn, stmt);
      if (isNewGraphics(e.right)) {
        const id = identityOf(e.left, fn);
        if (id) st.set(id, fresh(false));
      }
      return st;
    }
    if (e.type === 'SequenceExpression') {
      for (const x of e.expressions) st = expr(x, st, fn, stmt);
      return st;
    }
    if (e.type === 'ConditionalExpression') {
      st = expr(e.test, st, fn, stmt);
      const a = expr(e.consequent, clone(st), fn, stmt);
      const b = expr(e.alternate, clone(st), fn, stmt);
      return mergeStates(a, b);
    }
    if (e.type === 'LogicalExpression') {
      st = expr(e.left, st, fn, stmt);
      const b = expr(e.right, clone(st), fn, stmt);
      return mergeStates(st, b);
    }
    if (FN_TYPES.has(e.type)) return st;
    // Look inside for nested calls / reads (approximate order).
    for (const key of Object.keys(e)) {
      if (key === 'loc' || key === 'range') continue;
      const v = e[key];
      if (Array.isArray(v)) {
        for (const c of v) if (c && typeof c.type === 'string' && !FN_TYPES.has(c.type)) st = expr(c, st, fn, stmt);
      } else if (v && typeof v.type === 'string' && !FN_TYPES.has(v.type)) st = expr(v, st, fn, stmt);
      if (!st) return st;
    }
    // Bounds reads on a pending Graphics.
    if (e.type === 'MemberExpression' && !e.computed && ['width', 'height', 'getBounds', 'getLocalBounds'].includes(e.property.name)) {
      const id = identityOf(e.object, fn);
      const s = id && st.get(id);
      if (s && s.pending && recording) flag(e, `reads ${e.property.name} while shapes are pending (flush earlier?)`);
    }
    return st;
  }

  const inlineFns = new Set();
  const inlineStack = [];
  function inlineBody(f, st, outerFn) {
    if (f.body.type !== 'BlockStatement') return expr(f.body, st, f);
    inlineStack.push([]);
    let out = block(f.body.body, st, f);
    const returns = inlineStack.pop();
    for (const r of returns) out = mergeStates(out, r);
    return out || st;
  }

  // Calls that pass or capture a Graphics: unknown drawing.
  const BENIGN = new Set(['addChild', 'addChildAt', 'removeChild', 'removeChildren', 'push', 'unshift', 'set', 'add', 'splice', 'includes', 'indexOf', 'has', 'delete', 'swapChildren', 'setChildIndex', 'getChildIndex', 'removeChildAt']);
  function callEffects(call, st, fn) {
    if (call.callee.type === 'MemberExpression' && !call.callee.computed && BENIGN.has(call.callee.property.name)) return;
    const touched = new Set();
    for (const a of call.arguments) {
      const id = (a.type === 'Identifier' || a.type === 'MemberExpression' || a.type === 'ThisExpression') ? identityOf(a, fn) : null;
      if (id && graphicsIds.has(id)) touched.add(id);
    }
    const callee = call.callee.type === 'Identifier' ? call.callee : null;
    if (callee) {
      const f = resolve(callee.name, fn);
      const d = f && declared.get(f)?.get(callee.name);
      const target = d && (d.type === 'FunctionDeclaration' ? d : d.type === 'VariableDeclarator' && d.init && FN_TYPES.has(d.init.type) ? d.init : null);
      if (target) for (const id of capturedGraphics(target)) touched.add(id);
    }
    for (const id of touched) {
      const s = ensure(st, id);
      // The callee may add shapes under the current style (helpers that
      // only add paths): the caller's next flush paints them.
      if (s.pending !== 1) {
        if (s.pending === 0) {
          s.pfill = s.fill;
          s.pline = s.line;
        } else {
          s.pfill = mergeStyle(s.pfill, s.fill);
          s.pline = mergeStyle(s.pline, s.line);
        }
        s.pending = 2;
        s.viaCall = true;
      }
    }
  }
  const capturedCache = new Map();
  function capturedGraphics(f) {
    if (capturedCache.has(f)) return capturedCache.get(f);
    const out = new Set();
    capturedCache.set(f, out);
    walk(f, (n) => {
      if (n.type === 'CallExpression') {
        const ch = chainOf(n);
        if (ch) {
          const id = identityOf(ch.base, fnOf(n));
          if (id && graphicsIds.has(id)) {
            const root = rootName(ch.base);
            const declFn = root === 'this' ? null : resolve(root, fnOf(n));
            // Captured iff declared outside f.
            if (declFn && !(declFn.start >= f.start && declFn.end <= f.end)) out.add(id);
          }
        }
      }
    });
    return out;
  }

  function links(id, ch, st, fn, stmt) {
    const s = ensure(st, id);
    for (let i = 0; i < ch.links.length; i++) {
      const l = ch.links[i];
      const call = l.call;
      const name = l.name;
      const linkKey = `${call.end}`;
      if (STYLE_OPS.has(name)) {
        // Flush pending shapes with the old styles, replacing this link.
        const pend = s.pending;
        if (pend) {
          checkFlushable(s, call);
          recordFlush(id, s, call, 'replace-link', fn);
        }
        if (recording) decide(`link:${linkKey}`, { op: name, pend: !!pend });
        s.pending = 0;
        s.open = false;
        if (name === 'endFill') {
          s.fill = NONE;
          s.afterEnd = true;
        } else if (name === 'beginFill') {
          s.fill = isNoneStyle(call) ? NONE : set(siteFor(call, 'fill', fn));
          s.afterEnd = false;
        } else {
          s.line = isNoneStyle(call) ? NONE : set(siteFor(call, 'line', fn));
          s.afterEnd = false;
        }
        s.assumed = false;
        continue;
      }
      if (name === 'clear') {
        if (recording) decide(`link:${linkKey}`, { op: 'clear' });
        Object.assign(s, fresh(false));
        continue;
      }
      // Shapes and path ops.
      const both = s.fill.kind !== 'none' && s.line.kind !== 'none';
      if (recording && s.fill.kind === 'none' && s.line.kind === 'none' && !s.assumed) {
        flag(call, `${name} with no fill or line (invisible shape: v8 drops it from bounds)`);
      }
      if (recording && (s.fill.kind === 'mixed' || s.line.kind === 'mixed' || s.fill.kind === 'top' || s.line.kind === 'top')) {
        flag(call, `${name}: fill/line may or may not be active here (branch-dependent style)`);
      }
      if (SHAPE_OPS[name]) {
        if (s.open && recording) flag(call, `${name} while a moveTo/lineTo polygon is open (v7 kept the polygon going; v8 ends it)`);
        if (recording) decide(`link:${linkKey}`, { op: name, perShape: both });
        if (both) {
          recordFlush(id, { ...s, pending: 1, pfill: s.fill, pline: s.line }, call, 'after-link', fn);
          s.pending = 0;
        } else s.pending = 1;
          s.viaCall = false;
          s.pfill = s.fill;
          s.pline = s.line;
        s.open = false;
        s.afterEnd = false;
        continue;
      }
      // Path ops.
      if (name === 'moveTo') {
        if (both && s.pending) {
          recordFlush(id, s, call, 'before-link', fn);
          s.pending = 0;
        }
        s.open = true;
        s.pending = 1;
          s.viaCall = false;
          s.pfill = s.fill;
          s.pline = s.line;
        s.afterEnd = false;
        continue;
      }
      if (name === 'closePath') {
        s.pending = 1;
          s.viaCall = false;
          s.pfill = s.fill;
          s.pline = s.line;
        if (both) {
          recordFlush(id, s, call, 'after-link', fn);
          s.pending = 0;
        }
        s.open = false;
        continue;
      }
      if (s.afterEnd && !s.open && name === 'lineTo' && recording) flag(call, 'lineTo right after endFill without moveTo (v7 restarted at 0,0)');
      s.open = true;
      s.pending = 1;
          s.viaCall = false;
          s.pfill = s.fill;
          s.pline = s.line;
      s.afterEnd = false;
    }
    return st;
  }

  function checkFlushable(s, at) {
    if (!recording) return;
    if (s.assumed && s.pending === 1 && s.pfill.kind === 'none' && s.pline.kind === 'none') flag(at, 'shapes drawn with the caller\'s style are flushed here, inside the helper (manual)');
    if (s.pfill.kind === 'mixed' || s.pline.kind === 'mixed' || s.pfill.kind === 'top' || s.pline.kind === 'top') flag(at, 'flush with a branch-dependent fill/line state');
  }

  function siteFor(call, kind, fn) {
    if (!sites.has(call)) sites.set(call, { call, kind, fn, consumers: new Set() });
    return call;
  }

  // ---------------------------------------------------------------- run
  const fns = [ast];
  walk(ast, (n) => {
    if (FN_TYPES.has(n.type)) fns.push(n);
  });
  // First pass: collect inline-callback functions (analyzed in their callers).
  recording = false;
  for (const f of fns) analyzeFunction(f);
  recording = true;
  for (const f of fns) if (!inlineFns.has(f)) analyzeFunction(f);

  // ------------------------------------------------------- decide forms
  // A style site is inlined into its single consuming flush when stable.
  for (const fl of flushes.values()) {
    for (const st of [fl.fill, fl.line]) {
      if (st.kind !== 'set') continue;
      for (const site of st.sites) sites.get(site)?.consumers.add(fl);
    }
  }
  for (const site of sites.values()) {
    site.inline = false;
    if (site.consumers.size === 0) continue;
    const ok = [...site.consumers].every((fl) => {
      const st = site.kind === 'fill' ? fl.fill : fl.line;
      return st.sites.size === 1 && stableBetween(site.call, fl.anchor, site.fn);
    });
    // Inline only when every consumer can take the literal style.
    site.inline = ok && site.consumers.size <= 1;
  }

  // ------------------------------------------------------- emit
  const styleArg = (st, kind) => {
    if (st.kind !== 'set') return null;
    if (st.sites.size === 1) {
      const site = sites.get([...st.sites][0]);
      if (site.inline) return kind === 'fill' ? fillStyleText(site.call, site.fn) : lineStyleText(site.call, site.fn);
    }
    return '';
  };
  const flushText = (fl) => {
    const parts = [];
    const f = styleArg(fl.fill, 'fill');
    const l = styleArg(fl.line, 'line');
    if (f !== null) parts.push(`fill(${f})`);
    if (l !== null) parts.push(`stroke(${l})`);
    if (!parts.length && fl.pending !== 2) parts.push('beginPath()');
    return parts;
  };
  // Links: style setters become nothing, setFillStyle/setStrokeStyle, or a flush.
  const linkFlush = new Map(); // call.start -> flush (replace-link)
  const afterLink = new Map();
  const beforeLink = new Map();
  const otherFlushes = [];
  for (const fl of flushes.values()) {
    if (fl.where === 'replace-link') linkFlush.set(fl.anchor.end, fl);
    else if (fl.where === 'after-link') afterLink.set(fl.anchor.end, fl);
    else if (fl.where === 'before-link') beforeLink.set(fl.anchor.end, fl);
    else otherFlushes.push(fl);
  }

  // Move exit flushes up to just after the last statement that draws on
  // the receiver, so the paint call sits next to the drawing code.
  const touches = (node, id) => {
    let hit = false;
    walk(node, (n) => {
      if (hit || n.type !== 'CallExpression') return;
      const ch = chainOf(n);
      if (ch && chainHead(n) === n && ch.base.type !== 'NewExpression' && identityOf(ch.base, fnOf(n)) === id) {
        hit = true;
        return;
      }
      const benign = n.callee.type === 'MemberExpression' && !n.callee.computed && BENIGN.has(n.callee.property.name);
      if (!benign) {
        for (const a of n.arguments) {
          if ((a.type === 'Identifier' || a.type === 'MemberExpression' || a.type === 'ThisExpression') && identityOf(a, fnOf(n)) === id) hit = true;
        }
        if (n.callee.type === 'Identifier') {
          const f = resolve(n.callee.name, fnOf(n));
          const d = f && declared.get(f)?.get(n.callee.name);
          const target = d && (d.type === 'FunctionDeclaration' ? d : d.type === 'VariableDeclarator' && d.init && FN_TYPES.has(d.init.type) ? d.init : null);
          if (target && capturedGraphics(target).has(id)) hit = true;
        }
      }
    });
    return hit;
  };
  for (const fl of otherFlushes) {
    if (!['end', 'loop-end', 'before'].includes(fl.where)) continue;
    let list;
    let exit;
    if (fl.where === 'before') {
      const p = parent.get(fl.anchor);
      if (!p || !(p.type === 'BlockStatement' || p.type === 'Program' || p.type === 'SwitchCase')) continue;
      list = p.type === 'SwitchCase' ? p.consequent : p.body;
      exit = list.indexOf(fl.anchor);
    } else {
      list = fl.anchor.body;
      if (!Array.isArray(list)) continue;
      exit = list.length;
    }
    // A receiver declared in an inner block is flushed at the end of that block.
    const rootName0 = fl.id.split(':').slice(1).join(':').split('.')[0];
    const declFn = fl.fn && rootName0 !== 'this' ? resolve(rootName0, fl.fn) : null;
    const declNode = declFn && declared.get(declFn)?.get(rootName0);
    if (declNode && declNode.type === 'VariableDeclarator') {
      const block = scopeOfDecl(declNode);
      if (block && Array.isArray(block.body) && !inside(fl.anchor, block)) {
        list = block.body;
        exit = list.length;
      }
    }
    let k = exit - 1;
    while (k >= 0 && !touches(list[k], fl.id)) k--;
    if (k < 0 || (k === exit - 1 && list === (fl.where === 'before' ? (parent.get(fl.anchor).type === 'SwitchCase' ? parent.get(fl.anchor).consequent : parent.get(fl.anchor).body) : fl.anchor.body))) continue;
    const S = list[k];
    if (S.type === 'ExpressionStatement' && S.expression.type === 'CallExpression' && chainOf(S.expression) && chainHead(S.expression) === S.expression && identityOf(chainOf(S.expression).base, fnOf(S)) === fl.id) {
      fl.where = 'after-chain';
      fl.anchor = S.expression;
    } else {
      fl.where = 'after-stmt';
      fl.anchor = S;
    }
  }

  // Rewrite each chain statement link by link.
  const handled = new Set();
  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const ch = chainOf(node);
    if (!ch || chainHead(node) !== node || handled.has(node)) return;
    handled.add(node);
    const fn = fnOf(node);
    let isG = false;
    if (ch.base.type === 'NewExpression') isG = isNewGraphics(ch.base);
    else {
      const id = identityOf(ch.base, fn);
      isG = !!(id && graphicsIds.has(id));
      if (!id && ch.links.some((l) => V7_ONLY.has(l.name))) flag(node, `v7 Graphics call on an unsupported receiver: ${text(ch.base).slice(0, 40)}`);
    }
    if (!isG) return;
    rewriteChain(node, ch, fn);
  });

  function rewriteChain(head, ch, fn) {
    // Per-link in-place edits so formatting and arguments stay as written.
    const linkEdits = [];
    let kept = 0;
    for (const l of ch.links) {
      const call = l.call;
      const spanStart = call.callee.object.end;
      const lead = src.slice(spanStart, call.callee.property.start); // e.g. "." or "\n    ."
      const parts = [];
      const before = beforeLink.get(call.end);
      if (before) parts.push(...flushText(before));
      let self = null; // text for this link itself (null: removed)
      if (STYLE_OPS.has(l.name)) {
        const fl = linkFlush.get(call.end);
        if (fl) parts.push(...flushText(fl));
        if (l.name !== 'endFill' && !isNoneStyle(call)) {
          const site = sites.get(call);
          if (site && !site.inline && site.consumers.size > 0) {
            parts.push(l.name === 'beginFill' ? `setFillStyle(${fillStyleText(call, fn)})` : `setStrokeStyle(${lineStyleText(call, fn)})`);
          }
        }
      } else if (SHAPE_OPS[l.name]) {
        if (l.name === 'drawPolygon') {
          const a = call.arguments;
          if (a.length !== 1) flag(call, 'drawPolygon with varargs points (check)');
          else if (a[0].type !== 'ArrayExpression') flag(call, 'drawPolygon(non-literal): v8 poly() takes number[] or point[], not a Polygon (check)');
        }
        if (l.name === 'drawStar') flag(call, 'drawStar -> star: check innerRadius/rotation defaults');
        self = SHAPE_OPS[l.name] + src.slice(call.callee.property.end, call.end);
      } else {
        self = null; // unchanged path op / clear
      }
      const after = afterLink.get(call.end);
      const afterParts = after ? flushText(after) : [];
      const isUnchanged = !STYLE_OPS.has(l.name) && !SHAPE_OPS[l.name];
      if (isUnchanged && !parts.length && !afterParts.length) {
        kept++;
        continue;
      }
      const original = src.slice(call.callee.property.start, call.end);
      const items = [...parts];
      if (isUnchanged) items.push(original);
      else if (self) items.push(self);
      items.push(...afterParts);
      if (items.length) kept++;
      const sep = lead.includes('\n') ? lead : '.';
      const replacement = items.map((t, i) => (i === 0 ? lead : sep) + t).join('');
      linkEdits.push({ start: spanStart, end: call.end, text: items.length ? replacement : '' , removed: !items.length, lead });
    }
    const tail = [];
    for (const fl of otherFlushes) {
      if (fl.where === 'after-chain' && fl.anchor === head) tail.push(...flushText(fl));
    }
    const stmt = parent.get(head);
    if (!kept && !tail.length) {
      if (stmt?.type === 'ExpressionStatement') {
        removeStatement(stmt);
        return;
      }
      if (ch.base.type !== 'NewExpression') flag(head, 'style-only chain used as an expression (left as the bare receiver)');
    }
    for (const e of linkEdits) edits.push({ start: e.start, end: e.end, text: e.text });
    if (tail.length) edits.push({ start: head.end, end: head.end, text: tail.map((t) => `.${t}`).join('') });
  }

  function removeStatement(stmt) {
    // Remove the statement and its line if it is alone on the line.
    let start = stmt.start;
    let end = stmt.end;
    const lineStart = src.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = src.indexOf('\n', end);
    const pre = src.slice(lineStart, start);
    const post = src.slice(end, lineEnd < 0 ? src.length : lineEnd);
    const p = parent.get(stmt);
    const loneBody = p && (p.type === 'IfStatement' || LOOP_TYPES.has(p.type) || p.type === 'LabeledStatement') && p.body !== undefined && (p.body === stmt || p.consequent === stmt || p.alternate === stmt);
    if (loneBody || (p && p.type === 'IfStatement' && (p.consequent === stmt || p.alternate === stmt))) {
      edits.push({ start, end, text: ';' });
      return;
    }
    if (/^\s*$/.test(pre) && /^\s*(\/\/.*)?$/.test(post) && !/\/\//.test(post)) {
      start = lineStart;
      end = lineEnd < 0 ? src.length : lineEnd + 1;
    }
    edits.push({ start, end, text: '' });
  }

  // Flushes before returns / at end of bodies.
  const beforeGroups = new Map();
  for (const fl of otherFlushes) {
    if (fl.where !== 'before') continue;
    const p = parent.get(fl.anchor);
    if (p && p.type !== 'BlockStatement' && p.type !== 'Program' && p.type !== 'SwitchCase') {
      if (!beforeGroups.has(fl.anchor)) beforeGroups.set(fl.anchor, []);
      beforeGroups.get(fl.anchor).push(fl);
      fl.where = 'before-grouped';
    }
  }
  for (const [anchor, list] of beforeGroups) {
    const calls = list.flatMap((fl) => flushText(fl).map((p) => `${receiverText(fl.id)}.${p};`));
    if (!calls.length) continue;
    edits.push({ start: anchor.start, end: anchor.start, text: `{ ${calls.join(' ')} ` });
    edits.push({ start: anchor.end, end: anchor.end, text: ' }' });
  }
  for (const fl of otherFlushes) {
    if (fl.where === 'before-grouped') continue;
    if (fl.where === 'after-chain') continue;
    const recv = receiverText(fl.id);
    if (!recv) {
      flag(fl.anchor, `cannot name receiver for exit flush (${fl.id})`);
      continue;
    }
    const calls = flushText(fl).map((p) => `${recv}.${p};`);
    if (!calls.length) continue;
    if (fl.where === 'before') {
      const lineStart = src.lastIndexOf('\n', fl.anchor.start - 1) + 1;
      const indent = src.slice(lineStart, fl.anchor.start).match(/^\s*/)[0];
      const p = parent.get(fl.anchor);
      if (p && p.type !== 'BlockStatement' && p.type !== 'Program' && p.type !== 'SwitchCase') {
        edits.push({ start: fl.anchor.start, end: fl.anchor.start, text: `{ ${calls.join(' ')} ` });
        edits.push({ start: fl.anchor.end, end: fl.anchor.end, text: ' }' });
      } else edits.push({ start: fl.anchor.start, end: fl.anchor.start, text: `${calls.join(`\n${indent}`)}\n${indent}` });
    } else if (fl.where === 'end' || fl.where === 'loop-end') {
      const body = fl.anchor;
      if (body.type === 'Program') {
        edits.push({ start: src.length, end: src.length, text: `${calls.join('\n')}\n` });
        continue;
      }
      const close = body.end - 1; // the closing brace
      const lineStart = src.lastIndexOf('\n', close - 1) + 1;
      const closeIndent = src.slice(lineStart, close).match(/^\s*/)[0];
      const innerIndent = `${closeIndent}  `;
      if (/^\s*$/.test(src.slice(lineStart, close))) {
        edits.push({ start: lineStart, end: lineStart, text: calls.map((c) => `${innerIndent}${c}\n`).join('') });
      } else edits.push({ start: close, end: close, text: ` ${calls.join(' ')} ` });
    } else if (fl.where === 'after-stmt') {
      const lineStart = src.lastIndexOf('\n', fl.anchor.start - 1) + 1;
      const indent = src.slice(lineStart, fl.anchor.start).match(/^\s*/)[0];
      edits.push({ start: fl.anchor.end, end: fl.anchor.end, text: calls.map((c) => `\n${indent}${c}`).join('') });
    } else if (fl.where === 'expr-body') {
      flag(fl.anchor, 'expression-bodied arrow leaves shapes pending (manual)');
    }
  }

  function receiverText(id) {
    const key = id.split(':').slice(1).join(':');
    if (!key || key.startsWith('anon@')) return null;
    return key;
  }

  // ------------------------------------------------------- apply
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  let lastStart = Infinity;
  for (const e of edits) {
    if (e.end > lastStart) {
      flag({ loc: { start: { line: src.slice(0, e.start).split('\n').length } } }, 'overlapping edits (manual)');
      continue;
    }
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  return { code: out, flags, changed: out !== src };
}

const V8_SHAPES = new Set(['rect', 'roundRect', 'circle', 'ellipse', 'poly', 'star']);
const PAINT = new Set(['fill', 'stroke']);
const DRAWING = new Set([...V8_SHAPES, ...PATH_OPS]);
/** `g.rect(..);` directly followed by `g.fill(..);` -> `g.rect(..).fill(..);` */
export function mergeShapeFlush(src) {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const keyOf = (e) => (e.type === 'Identifier' ? e.name : e.type === 'ThisExpression' ? 'this' : e.type === 'MemberExpression' && !e.computed ? (keyOf(e.object) ? `${keyOf(e.object)}.${e.property.name}` : null) : null);
  const chain = (e) => {
    const links = [];
    let n = e;
    while (n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) {
      links.unshift(n.callee.property.name);
      n = n.callee.object;
    }
    return links.length ? { base: n, links, key: keyOf(n) } : null;
  };
  const edits = [];
  walk(ast, (node) => {
    const body = node.type === 'BlockStatement' || node.type === 'Program' ? node.body : node.type === 'SwitchCase' ? node.consequent : null;
    if (!body) return;
    for (let i = 0; i + 1 < body.length; i++) {
      const a = body[i];
      const b = body[i + 1];
      if (a.type !== 'ExpressionStatement' || b.type !== 'ExpressionStatement') continue;
      const ca = chain(a.expression);
      const cb = chain(b.expression);
      if (!ca || !cb || !ca.key || ca.key !== cb.key) continue;
      if (!ca.links.every((l) => DRAWING.has(l))) continue;
      if (ca.links.length !== 1 && !(ca.links[0] === 'moveTo')) continue;
      if (!cb.links.every((l) => PAINT.has(l))) continue;
      const prev = body[i - 1];
      const cp = prev?.type === 'ExpressionStatement' ? chain(prev.expression) : null;
      if (cp && cp.key === ca.key && DRAWING.has(cp.links[cp.links.length - 1])) continue;
      if (!/^\s*$/.test(src.slice(a.end, b.start))) continue;
      if (src.slice(a.expression.end, a.end) !== ';') continue;
      const tail = src.slice(cb.base.end, b.expression.end);
      if ((src.slice(a.start, a.expression.end) + tail).length > 150) continue;
      edits.push({ start: a.expression.end, end: b.expression.end, text: tail });
      i++;
    }
  });
  edits.sort((x, y) => y.start - x.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

export function walk(node, fn, p = null) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, p);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, fn, node));
    else if (v && typeof v.type === 'string') walk(v, fn, node);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let total = 0;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let r;
    try {
      r = transform(src, f);
    } catch (e) {
      console.log(`ERROR ${f}: ${e.stack}`);
      continue;
    }
    for (const fl of r.flags) console.log(`${fl.file}:${fl.line}: ${fl.msg}`);
    total += r.flags.length;
    if (write && r.changed) writeFileSync(f, mergeShapeFlush(r.code));
  }
  console.error(`${total} flags`);
}
