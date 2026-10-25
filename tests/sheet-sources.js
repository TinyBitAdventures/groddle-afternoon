// Every grid sprite sheet the js/ modules slice, as rows for tests/sheet-blank-cells.test.js (G276).
// Exported data is imported; definitions a module keeps to itself are read from its syntax tree
// (acorn) and evaluated, so a row always carries the same numbers the module slices with.
// A row: { name, path, fw, fh, cols, first, n, density, derive?, tail }. Cell i of the clip is
// grid cell first + i at (col * fw, row * fh) in 1x units; density is texels per 1x pixel (read
// from an @Nx name, as js/textures.js does). derive: { cols, rows } cuts fw/fh from the image
// size (js/quest-rooms/kit.js sheetFrames). tail: also report art in the grid cells after the clip.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const imp = (rel) => import(join(pub, rel));

const densityOf = (path) => Number(/@(\d+(?:\.\d+)?)x\./.exec(path)?.[1] || 1);
const clean = (path) => String(path).split('?')[0];

/** Top-level `const NAME = <literal>` values of one module, evaluated from its syntax tree. */
export function moduleConsts(rel, scope = {}) {
  const src = readFileSync(join(pub, rel), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const decls = new Map();
  for (let node of ast.body) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration) node = node.declaration;
    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) if (d.id.type === 'Identifier' && d.init) decls.set(d.id.name, d.init);
  }
  const cache = new Map();
  const get = (name) => {
    if (name in scope) return scope[name];
    if (!cache.has(name)) {
      if (!decls.has(name)) throw new Error(`${rel}: no top-level const ${name}`);
      cache.set(name, evaluate(decls.get(name)));
    }
    return cache.get(name);
  };
  const evaluate = (n, env = {}) => {
    switch (n.type) {
      case 'Literal': return n.value;
      case 'Identifier': return n.name in env ? env[n.name] : n.name === 'undefined' ? undefined : get(n.name);
      case 'TemplateLiteral': return n.quasis.map((q, i) => q.value.cooked + (i < n.expressions.length ? evaluate(n.expressions[i], env) : '')).join('');
      case 'ArrayExpression': return n.elements.map((e) => evaluate(e, env));
      case 'ObjectExpression': {
        const o = {};
        for (const p of n.properties) {
          if (p.type === 'SpreadElement') Object.assign(o, evaluate(p.argument, env));
          else o[p.computed ? evaluate(p.key, env) : p.key.name ?? p.key.value] = evaluate(p.value, env);
        }
        return o;
      }
      case 'UnaryExpression': {
        const v = evaluate(n.argument, env);
        if (n.operator === '-') return -v;
        if (n.operator === '+') return +v;
        if (n.operator === '!') return !v;
        break;
      }
      case 'BinaryExpression': {
        const a = evaluate(n.left, env);
        const b = evaluate(n.right, env);
        const ops = { '+': a + b, '-': a - b, '*': a * b, '/': a / b, '%': a % b, '===': a === b, '!==': a !== b };
        if (n.operator in ops) return ops[n.operator];
        break;
      }
      case 'ConditionalExpression': return evaluate(n.test, env) ? evaluate(n.consequent, env) : evaluate(n.alternate, env);
      case 'LogicalExpression': {
        const a = evaluate(n.left, env);
        if (n.operator === '||') return a || evaluate(n.right, env);
        if (n.operator === '&&') return a && evaluate(n.right, env);
        if (n.operator === '??') return a ?? evaluate(n.right, env);
        break;
      }
      case 'MemberExpression': {
        const o = evaluate(n.object, env);
        return o[n.computed ? evaluate(n.property, env) : n.property.name];
      }
      case 'CallExpression':
        // Object.freeze(x) is x; anything else is a value this reader does not compute.
        if (n.callee.type === 'MemberExpression' && n.callee.object.name === 'Object' && n.callee.property.name === 'freeze') return evaluate(n.arguments[0], env);
        break;
      default: break;
    }
    throw new Error(`${rel}: cannot evaluate ${n.type} at ${n.start}`);
  };
  /** Every call of `name(...)` / `x.name(...)` with the function it sits in. */
  const calls = (name) => {
    const out = [];
    const visit = (n, fn) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'FunctionDeclaration') fn = n.id?.name || fn;
      if (n.type === 'CallExpression' && (n.callee.name === name || n.callee.property?.name === name)) {
        out.push({ node: n, fn, line: src.slice(0, n.start).split('\n').length, callee: src.slice(n.callee.start, n.callee.end) });
      }
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach((x) => visit(x, fn));
        else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v, fn);
      }
    };
    visit(ast, null);
    return out;
  };
  return { get, ast, src, evaluate, calls };
}

/**
 * Every kit sheet cut under public/js: `kit.sheetFrames(PIXI, url, cols, rows, count)` and
 * `kit.animated(PIXI, url, cols, rows, { count })` (js/quest-rooms/kit.js; count defaults to
 * cols * rows). args is null when the call's numbers live in a table (read separately).
 */
export function kitCalls() {
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(join(pub, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`;
      if (f.isDirectory()) walk(rel);
      else if (f.name.endsWith('.js') && /kit\.(sheetFrames|animated)\(/.test(readFileSync(join(pub, rel), 'utf8'))) files.push(rel);
    }
  };
  walk('js');
  const out = [];
  for (const rel of files.sort()) {
    const m = moduleConsts(rel);
    for (const name of ['sheetFrames', 'animated']) {
      for (const c of m.calls(name)) {
        if (!/kit$/.test(c.callee.replace(/\.(sheetFrames|animated)$/, ''))) continue;
        let args = null;
        try {
          const [url, cols, rows] = c.node.arguments.slice(1, 4).map((a) => m.evaluate(a));
          let count = cols * rows;
          const last = c.node.arguments[4];
          if (name === 'sheetFrames' && last) count = m.evaluate(last);
          if (name === 'animated' && last?.type === 'ObjectExpression') {
            const p = last.properties.find((x) => x.type === 'Property' && x.key.name === 'count');
            if (p) count = m.evaluate(p.value);
          }
          args = [url, cols, rows, count];
        } catch { args = null; }
        out.push({ rel, line: c.line, args });
      }
    }
  }
  return out;
}

const row = (name, path, { fw, fh, cols, n, frames, first = 0, cells = null, density, derive, tail = true }) => ({
  name, path: clean(path), fw, fh, cols, n: n ?? frames, first, cells, density: density ?? densityOf(clean(path)), derive: derive || null, tail,
});
const kitRow = (name, url, cols, rows, count = cols * rows) => row(name, url, { cols, n: count, derive: { cols, rows } });

/** Plain exported defs: { path|url|src|sheet, fw|frameW|frameWidth|cellW, fh|..., cols, frames|frameCount|count|cells, first? }. */
function plainDef(v) {
  if (!v || typeof v !== 'object' || typeof v.cols !== 'number') return null;
  const path = [v.path, v.url, v.src, v.sheet].find((p) => typeof p === 'string' && /\.(png|webp)(\?|$)/.test(p));
  const fw = [v.fw, v.frameW, v.frameWidth, v.cellW].find((x) => typeof x === 'number');
  const fh = [v.fh, v.frameH, v.frameHeight, v.cellH].find((x) => typeof x === 'number');
  const n = [v.frames, v.frameCount, v.count, v.cells].find((x) => typeof x === 'number');
  if (!path || !fw || !fh || !n) return null;
  return { path, fw, fh, cols: v.cols, n, first: v.first || 0 };
}

async function exportedPlainDefs() {
  const rows = [];
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(join(pub, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`;
      if (f.isDirectory()) walk(rel);
      else if (f.name.endsWith('.js')) files.push(rel);
    }
  };
  walk('js');
  for (const rel of files.sort()) {
    const mod = await imp(rel);
    const seen = new Set();
    const visit = (v, name, depth) => {
      if (!v || typeof v !== 'object' || seen.has(v) || depth > 6) return;
      seen.add(v);
      if (v instanceof Map) return;
      const d = plainDef(v);
      if (d) rows.push(row(`${rel.replace(/^js\//, '')} ${name}`, d.path, { ...d }));
      for (const [k, x] of Object.entries(v)) visit(x, `${name}.${k}`, depth + 1);
    };
    for (const [k, v] of Object.entries(mod)) visit(v, k, 0);
  }
  return rows;
}

export async function collectSheets() {
  const rows = await exportedPlainDefs();

  // Avatar and NPC Glitch sheets (generated by tools/avatar-compositor): dir + file, `cells` frames.
  const { VECTOR_AVATAR } = await imp('js/avatar-vector-sheets.js');
  for (const [k, s] of Object.entries(VECTOR_AVATAR.sheets)) rows.push(row(`vector avatar ${k}`, `${VECTOR_AVATAR.dir}${s.file}`, { fw: s.fw, fh: s.fh, cols: s.cols, n: s.cells }));
  const { NPC_GLITCH_SHEETS } = await imp('js/npc-glitch-sheets.js');
  for (const look of Object.values(NPC_GLITCH_SHEETS)) {
    for (const [k, s] of Object.entries(look.sheets)) {
      rows.push(row(`npc glitch ${look.id} ${k}`, `${look.dir}${s.file}`, { fw: s.fw, fh: s.fh, cols: s.cols, n: s.cells }));
      if (s.hires) rows.push(row(`npc glitch ${look.id} ${k} hires`, `${look.dir}${s.hires}`, { fw: s.fw, fh: s.fh, cols: s.cols, n: s.cells }));
    }
  }

  // Make panel tool loops: a grid of full rows, `cols` per row (tools/build-make-tool-sheets.py, G188/G191).
  const { MAKE_TOOL_SHEETS } = await imp('js/make-tool-sheets.js');
  for (const [k, s] of Object.entries(MAKE_TOOL_SHEETS)) rows.push(row(`make tool ${k}`, s.url, { fw: s.fw, fh: s.fh, cols: s.cols, n: s.frames, density: s.density || 1 }));

  // Machines: each state's run inside the packed sheet (the whole sheet is already a plain def).
  const { MACHINE_ART_SHEETS } = await imp('js/machine-art-sheets.js');
  for (const [k, s] of Object.entries(MACHINE_ART_SHEETS)) {
    for (const [state, [first, n]] of Object.entries(s.states)) rows.push(row(`machine ${k} ${state}`, s.url, { fw: s.fw, fh: s.fh, cols: s.cols, first, n, tail: false }));
  }

  // Cubimal race sheets (cubimals.js cubimalRaceSheet).
  const { CUBIMAL_RACE_CELLS, cubimalRaceSheet } = await imp('js/cubimals.js');
  for (const cls of Object.keys(CUBIMAL_RACE_CELLS)) {
    const d = cubimalRaceSheet(cls);
    rows.push(row(`cubimal race ${cls}`, d.path, { fw: d.fw, fh: d.fh, cols: d.cols, n: d.frames }));
  }

  // Vendors, street spirits (and their loneliness clips), Juju Bandits: cropped OGA strips.
  const { VENDOR_NPC_ART, vendorSheet } = await imp('js/vendor-npcs.js');
  for (const [cls, art] of Object.entries(VENDOR_NPC_ART)) {
    for (const state of Object.keys(art.states)) {
      const d = vendorSheet(cls, state);
      rows.push(row(`vendor ${cls} ${state}`, d.path, { fw: d.fw, fh: d.fh, cols: d.cols, n: d.frames }));
    }
  }
  const spirits = await imp('js/street-spirits.js');
  for (const [variant, art] of Object.entries(spirits.STREET_SPIRIT_ART)) {
    for (const look of Object.keys(art.looks)) {
      for (const state of Object.keys(art.states)) {
        const d = spirits.spiritSheet(variant, look, state);
        if (d) rows.push(row(`spirit ${variant} ${look} ${state}`, d.path, { fw: d.fw, fh: d.fh, cols: d.cols, n: d.frames }));
      }
      const cry = spirits.spiritCrySheet(variant, look);
      if (cry) rows.push(row(`spirit ${variant} ${look} cry`, cry.path, { fw: cry.fw, fh: cry.fh, cols: cry.cols, n: cry.frames }));
      for (const state of spirits.PORTRAIT_STATES) {
        const p = spirits.portraitSheet(variant, look, state);
        if (p) rows.push(row(`spirit ${variant} ${look} lonely_${state}`, p.path, { fw: p.fw, fh: p.fh, cols: p.cols, n: p.frames }));
      }
    }
  }
  const juju = await imp('js/juju-bandits.js');
  for (const variant of juju.JUJU_VARIANTS) {
    for (const bandana of juju.JUJU_BANDANAS) {
      for (const [state, s] of Object.entries(juju.JUJU_SHEETS)) {
        const url = juju.jujuSheetUrl(variant, bandana, state);
        // features/juju-bandits-feature.js cuts them with kit.sheetFrames (cols 8, rows from the count).
        if (existsSync(join(pub, url))) rows.push(kitRow(`juju ${variant} ${bandana} ${state}`, url, juju.JUJU_SHEET_COLS, Math.ceil(s.frames / juju.JUJU_SHEET_COLS), s.frames));
      }
    }
  }

  // Hi signs: overlay, missile icon and bonus per variant (hi-signs.js hiArtSheet).
  const hi = await imp('js/hi-signs.js');
  for (const v of hi.HI_VARIANTS) {
    for (const kind of ['hi', 'still', 'bonus']) {
      const s = hi.hiArtSheet(v, kind);
      rows.push(row(`hi ${v} ${kind}`, s.url, { fw: s.w, fh: s.h, cols: s.cols, n: s.frames }));
    }
  }

  // Hell: the bartender's clips share one cell size; graveside markers hold three states.
  const { HELL_SPRITES } = await imp('js/hell.js');
  const bt = HELL_SPRITES.bartender;
  for (const [k, s] of Object.entries(bt)) if (s?.url) rows.push(row(`hell bartender ${k}`, s.url, { fw: bt.frameW, fh: bt.frameH, cols: s.cols, n: s.frames }));
  const gs = HELL_SPRITES.graveside;
  for (const g of gs.giants) rows.push(row(`hell graveside ${g}`, gs.urlPattern.replace('<giant>', g), { fw: gs.frameW, fh: gs.frameH, cols: gs.cols, n: gs.states.length }));

  // The Door Drink portal: features/door-drink-feature.js cuts 37 cells (every state's frames).
  const { PORTAL_SHEET } = await imp('js/door-drink.js');
  const portalCells = ['closed', 'opening', 'open', 'closing'].flatMap((k) => PORTAL_SHEET[k]);
  rows.push(row('door-drink portal', PORTAL_SHEET.url, { fw: PORTAL_SHEET.cellW, fh: PORTAL_SHEET.cellH, cols: PORTAL_SHEET.cols, n: Math.max(...portalCells) + 1 }));
  const doorCut = moduleConsts('js/features/door-drink-feature.js').calls('frameTexture').length; // cutFrames
  if (doorCut < 1) throw new Error('door-drink-feature.js: cutFrames moved');

  // Enchanted wood trees: one row of six maturity frames (features/enchanted-forest-feature.js).
  const { ENCHANTED_TREE_SHEETS } = await imp('js/enchanted-forests.js');
  for (const s of ENCHANTED_TREE_SHEETS) rows.push(row(`enchanted tree v${s.variant}`, s.url, { fw: s.fw, fh: s.fh, cols: 6, n: 6 }));

  // Quoins: one row of spin frames per quoin type.
  const { QUOIN_SHEET } = await imp('js/quoins.js');
  for (let r = 0; r < QUOIN_SHEET.rows; r += 1) rows.push(row(`quoin row ${r}`, QUOIN_SHEET.url, { fw: QUOIN_SHEET.frameWidth, fh: QUOIN_SHEET.frameHeight, cols: QUOIN_SHEET.columns, first: r * QUOIN_SHEET.columns, n: QUOIN_SHEET.columns, tail: false }));

  // Butler: the shipped fallback clips (features/butler-feature.js clipFrames).
  const butler = await imp('js/butler.js');
  const look = butler.BUTLER_LOOKS.find((l) => l.id === butler.BUTLER_FALLBACK.look);
  for (const clip of butler.BUTLER_FALLBACK.clips) rows.push(row(`butler ${clip}`, butler.butlerSheetUrl(look.id, clip), { fw: look.cell.w, fh: look.cell.h, cols: look.cols[clip] || 1, n: butler.BUTLER_FRAMES[clip] || 1 }));

  // Overlay sheets (overlay-art.js cellRect): every cell the timeline shows.
  const overlays = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays.json'), 'utf8'));
  for (const [k, m] of Object.entries(overlays)) {
    if (m.kind !== 'sheet') continue;
    const cells = [...new Set(m.order)].sort((a, b) => a - b);
    rows.push({ ...row(`overlay ${k}`, `assets/sprites/overlays/${m.file}`, { fw: m.cell[0], fh: m.cell[1], cols: m.cols, n: cells.length, cells, density: 1 }), order: m.order });
  }

  // Mine rocks: five depletion frames in one row (game.js refreshMineRockVisual, mining.js rockFrameIndex).
  const { ROCK_CATALOG } = await imp('js/mining.js');
  for (const [k, d] of Object.entries(ROCK_CATALOG)) rows.push(row(`mine rock ${k}`, d.worldSheet, { fw: d.frameWidth, fh: d.frameHeight, cols: d.sheetFrames, n: d.sheetFrames }));

  // game.js sheets outside its SHEETS table (that table is the game.js test's).
  const game = moduleConsts('game.js');
  const irr = game.get('IRRIGATOR_TOOL_SHEET');
  rows.push(row('game.js irrigator tool', irr.url, { fw: irr.fw, fh: irr.fh, cols: irr.cols, n: 30 }));
  const pickDef = game.get('PICK_TOOL_DEF');
  for (const [k, url] of Object.entries(game.get('PICK_TOOL_SHEETS'))) rows.push(row(`game.js ${k} tool`, url, { fw: pickDef.fw, fh: pickDef.fh, cols: pickDef.cols, n: game.get('PICK_SWING_FRAMES') }));
  // ensureShrineTextures: one grid per giant and motion, its count from the sliceSheet call.
  const shrineCall = game.calls('sliceSheet').find((c) => c.fn === 'ensureShrineTextures');
  const shrineFn = game.ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'ensureShrineTextures');
  const shrineDef = game.evaluate(shrineFn.body.body.find((n) => n.type === 'VariableDeclaration').declarations[0].init);
  for (const f of readdirSync(join(pub, 'assets/sprites/shrines')).filter((x) => /^[a-z]+_(open|close)\.png$/.test(x))) {
    const [giant, motion] = f.replace('.png', '').split('_');
    const n = game.evaluate(shrineCall.node.arguments[2], { motion });
    rows.push(row(`shrine ${giant} ${motion}`, `assets/sprites/shrines/${f}`, { ...shrineDef, n }));
  }

  // Module-internal tables, read from the source.
  const crabs = moduleConsts('js/features/crabs-feature.js');
  for (const [k, s] of Object.entries(crabs.get('SHEETS'))) rows.push(row(`crab ${k}`, s.path, s));

  const crafty = moduleConsts('js/features/craftybot-feature.js');
  const cCell = crafty.get('CELL');
  for (const [k, s] of Object.entries(crafty.get('CLIPS'))) rows.push(row(`craftybot ${k}`, `${crafty.get('ART')}${s.file}`, { fw: cCell.w, fh: cCell.h, cols: s.cols, n: s.frames }));

  const rube = moduleConsts('js/features/rube-feature.js');
  const rCell = rube.get('CELL');
  for (const [k, s] of Object.entries(rube.get('CLIPS'))) rows.push(row(`rube ${k}`, `${rube.get('ART')}${s.file}`, { fw: rCell.w, fh: rCell.h, cols: s.cols, n: s.frames }));

  const patches = moduleConsts('js/features/patches-feature.js');
  for (const [k, s] of Object.entries(patches.get('TOOL_SHEETS'))) rows.push(row(`patches tool ${k}`, s.url, { fw: s.fw, fh: s.fh, cols: s.cols || s.count, n: s.count }));
  const wood = patches.get('WOOD_SHEET');
  rows.push(row('patches wood tree', wood.url, { fw: wood.fw, fh: wood.fh, cols: wood.count, n: wood.count }));

  const mine = moduleConsts('js/features/help-mine-feature.js');
  const pick = mine.get('PICK_DEF');
  rows.push(row('help-mine pick', mine.get('PICK_SHEET'), { fw: pick.fw, fh: pick.fh, cols: pick.cols, n: mine.get('PICK_FRAMES') }));

  const fun = moduleConsts('js/features/funpickle-feature.js');
  rows.push(row('funpickle bounce', fun.get('BOUNCE_SHEET').path, fun.get('BOUNCE_SHEET')));

  const homes = moduleConsts('js/features/homes-feature.js');
  const rock = homes.get('ROCK_SHEET');
  rows.push(row('homes street rock', rock.file, { cols: rock.cols, n: rock.count, derive: { cols: rock.cols, rows: rock.rows } }));

  const smug = moduleConsts('js/features/smuggling-feature.js');
  const sCell = smug.get('CELL');
  const sArt = smug.get('ART');
  const smugClips = smug.get('SMUGGLER_CLIPS');
  for (const [color, list] of [['red', smug.get('RED_SHEETS')], ['green', smug.get('GREEN_SHEETS')]]) {
    for (const v of [1, 2]) {
      for (const clip of list) {
        const [cols, n] = smugClips[clip];
        rows.push(row(`smuggler ${color} ${v} ${clip}`, `${sArt}smuggler_${color}_${v}_${clip}.webp`, { fw: sCell.w, fh: sCell.h, cols, n }));
      }
    }
  }
  for (const [clip, [cols, n]] of Object.entries(smug.get('DEIM_CLIPS'))) rows.push(row(`deimaginator ${clip}`, `${sArt}deimaginator_${clip}.webp`, { fw: sCell.w, fh: sCell.h, cols, n }));

  const seasons = moduleConsts('js/features/seasons-feature.js');
  for (const [face, [w, h]] of Object.entries(seasons.get('TALK_SIZE'))) {
    rows.push(row(`seasons pumpkin ${face} talk`, `assets/sprites/seasons/pumpkin_lit_${face}_talk.png`, { fw: w, fh: h, cols: seasons.get('TALK_COLS'), n: seasons.get('TALK_FRAMES') }));
  }

  const party = moduleConsts('js/features/party-spaces-feature.js');
  for (const file of ['teleporter_visible_portal.png', 'teleporter_visible_disappear.png']) {
    const cols = party.get('PORTAL_COLS');
    rows.push(row(`party ${file}`, `${party.get('ART')}${file}`, { fw: party.get('PORTAL_W'), fh: party.get('PORTAL_H'), cols, n: cols * party.get('PORTAL_ROWS') }));
  }

  const yard = moduleConsts('js/quest-rooms/rube-yard.js');
  const yCell = yard.get('CELL');
  for (const call of [['rube_talk.webp', 7, 20], ['rube_offer_accept.webp', 9, 70]]) {
    rows.push(row(`rube-yard ${call[0]}`, `${yard.get('RUBE_DIR')}${call[0]}`, { fw: yCell.w, fh: yCell.h, cols: call[1], n: call[2] }));
  }

  // kit.sheetFrames tables (each call site's [cols, rows, count] by name).
  const gw = moduleConsts('js/quest-rooms/gwendolyn.js');
  const gwSheets = gw.get('SHEETS');
  for (const [prefix, grid] of [['squid_blue', gwSheets.squid], ['squid_purple', gwSheets.squid], ['cactus', gwSheets.cactus], ['gwendolyn', gwSheets.gwendolyn]]) {
    for (const [k, [cols, r, n]] of Object.entries(grid)) rows.push(kitRow(`gwendolyn ${prefix}_${k}`, `${gw.get('ART')}${prefix}_${k}.webp`, cols, r, n));
  }
  const room23 = moduleConsts('js/features/gwendolyn-room-23-feature.js');
  for (const [k, [cols, r, n]] of Object.entries(room23.get('GWEN_SHEETS'))) rows.push(kitRow(`room 23 ${k}`, `${room23.get('GWEN_ART')}${k}.webp`, cols, r, n));
  const camp = moduleConsts('js/quest-rooms/juju-camp.js');
  for (const [k, [cols, r, n]] of Object.entries(camp.get('GRANDMA_SHEETS'))) rows.push(kitRow(`juju camp grandma ${k}`, `${camp.get('ART')}grandma_${k}.png`, cols, r, n));
  for (const color of ['green', 'red', 'yellow']) {
    for (const [k, [cols, r, n]] of Object.entries(camp.get('KID_SHEETS'))) {
      const url = `${camp.get('ART')}bandit_${color}_${k}.png`;
      if (existsSync(join(pub, url))) rows.push(kitRow(`juju camp bandit ${color} ${k}`, url, cols, r, n));
    }
  }
  const esq = moduleConsts('js/quest-rooms/esquibeth.js');
  for (const [k, [cols, r, n]] of Object.entries(esq.get('GHOST_SHEETS'))) rows.push(kitRow(`esquibeth ghost ${k}`, `${esq.get('ART')}ghost_${k}.webp`, cols, r, n));
  const pen = moduleConsts('js/quest-rooms/penalty.js');
  for (const [k, [cols, n]] of Object.entries(pen.get('VENDOR_CLIPS'))) rows.push(kitRow(`penalty vendor ${k}`, `${pen.get('ART')}vendor_${k}.webp`, cols, Math.ceil(n / cols), n));
  const newxp = moduleConsts('js/features/newxp-feature.js');
  for (const [who, s] of Object.entries(newxp.get('SHEETS'))) {
    for (const [mode, [file, cols, r, n]] of Object.entries(s.modes)) rows.push(kitRow(`newxp ${who} ${mode}`, `${newxp.get('ART')}${file}.png`, cols, r, n));
  }
  // Every other kit call whose arguments are literals or module constants.
  for (const c of kitCalls()) {
    if (!c.args || c.args.some((a) => a === undefined)) continue;
    const [url, cols, r, n] = c.args;
    rows.push(kitRow(`${c.rel.replace(/^js\//, '')}:${c.line}`, url, cols, r, n));
  }
  return dedupe(rows);
}

/** Kit call sites whose arguments the reader cannot fold (tables handled above). */
export const KIT_TABLE_CALLS = Object.freeze([
  'js/features/gwendolyn-room-23-feature.js', 'js/features/newxp-feature.js', 'js/quest-rooms/esquibeth.js',
  'js/quest-rooms/gwendolyn.js', 'js/quest-rooms/juju-camp.js', 'js/quest-rooms/penalty.js',
]);

function dedupe(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = [r.path, r.fw, r.fh, r.cols, r.first, r.n, r.density, JSON.stringify(r.derive)].join('|');
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

/** 3x twins (js/sprite-hires.js): one file, or split parts that each hold a run of 1x cells. */
export async function hiresRows(rows) {
  const { HIRES_SPRITES, SPLIT_SPRITES } = await imp('js/sprite-hires.js');
  const out = [];
  for (const r of rows) {
    if (r.density !== 1) continue;
    const twin = HIRES_SPRITES.get(r.path);
    if (typeof twin === 'string') out.push({ ...r, name: `${r.name} @3x`, path: twin, density: r.derive ? 1 : densityOf(twin), tail: false });
    const split = SPLIT_SPRITES.get(r.path);
    if (split && !r.derive) {
      for (const [url, from, count, cols] of split.parts) {
        const lo = Math.max(r.first, from);
        const hi = Math.min(r.first + r.n, from + count);
        if (hi > lo) out.push({ ...r, name: `${r.name} ${url.split('/').pop()}`, path: url, cols, first: lo - from, n: hi - lo, density: densityOf(url), tail: false });
      }
    }
  }
  return out;
}
