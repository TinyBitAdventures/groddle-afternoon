/**
 * Flatten Tiny Speck's avatar timelines into frame tables the browser
 * compositor can draw without a Flash player.
 *
 * Flash semantics followed (glitch-client AvatarSwf / MCUtil):
 *  - AvatarSwf.gotoFrameNumAndStop sends the avatarContainer_mc and every
 *    MovieClip under it to the same absolute frame number
 *    (MCUtil.recursiveGotoAndStop); a clip with fewer frames stops on its
 *    last frame (AS3 clamps gotoAndStop).
 *  - Articles are attached by AvatarSwf.addArticlePartToContainer: the named
 *    container is emptied and the article's exported part symbol (e.g.
 *    shirtTorso) is added as its only child, so it follows the container's
 *    per-frame matrix.
 *  - Containers in Avatar.swf persist for the whole timeline (one instance
 *    per depth); hidden ones carry an alpha-0 colour transform.
 */
import { displayListAt } from './swf.mjs';

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r2 = (v) => Math.round(v * 100) / 100;

export function mul(p, c) {
  return [
    p[0] * c[0] + p[2] * c[1],
    p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3],
    p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4],
    p[1] * c[4] + p[3] * c[5] + p[5],
  ];
}

export const roundMatrix = (m) => [r4(m[0]), r4(m[1]), r4(m[2]), r4(m[3]), r2(m[4]), r2(m[5])];
const IDENTITY = [1, 0, 0, 1, 0, 0];
const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-6);

/** Alpha after a placement's colour transform (only alpha is used by the avatar timelines). */
function alphaOf(cx, a) {
  if (!cx) return a;
  return Math.max(0, Math.min(1, a * cx.m[3] + cx.o[3] / 255));
}

/** Non-alpha colour transform, or null when it is identity. */
function colorPart(cx) {
  if (!cx) return null;
  const { m, o } = cx;
  if (m[0] === 1 && m[1] === 1 && m[2] === 1 && !o[0] && !o[1] && !o[2]) return null;
  return { m: m.slice(0, 3), o: o.slice(0, 3) };
}

/**
 * Draw-op shape id for a DefineMorphShape placed at `ratio` (0-65535, the
 * PlaceObject ratio; 0 when absent). Ids from 65536 up never clash with SWF
 * character ids, so ops keep a plain numeric `s`; build.mjs makes the
 * outline at that ratio (shapes.mjs morphShapeAt). Shape tweens (hair locks,
 * cloth) compile to morphs, often as mask layers.
 */
export const MORPH_ID_BASE = 65536;
export const morphShapeId = (id, ratio = 0) => (ratio + 1) * MORPH_ID_BASE + id;
/** { id, ratio } for a morph draw id, or null for a plain shape id. */
export const morphOfShapeId = (s) => (s >= MORPH_ID_BASE ? { id: s % MORPH_ID_BASE, ratio: Math.floor(s / MORPH_ID_BASE) - 1 } : null);

/**
 * Flash blend modes that read what is beneath (everything but normal and
 * layer). A display object with one composites against what its parent has
 * drawn so far: the Flash player precomposes a container holding such a
 * child in its own buffer (BlendMode.LAYER docs), so the blend never reaches
 * past the parent.
 */
export const BACKDROP_BLENDS = Object.freeze(['multiply', 'screen', 'lighten', 'darken', 'difference', 'add', 'subtract', 'invert', 'alpha', 'erase', 'overlay', 'hardlight']);
const backdropBlend = (p) => BACKDROP_BLENDS.includes(p.blendMode);

/** A sprite's colour transform on every shape op it drew (blend groups included, not mask groups). */
function tintOps(ops, cp) {
  for (const o of ops) {
    if (o.s !== undefined && !o.cx) o.cx = cp;
    else if (o.bm) tintOps(o.ops, cp);
  }
}

/** A mask's ops without blend groups (a mask uses only its outlines). */
const unblend = (ops) => ops.flatMap((o) => (o.bm ? unblend(o.ops) : [o]));

/**
 * Ops as one blend group { bm, ops, a?, n? }; a lone layer group inside is
 * merged. n: 'color_10' when the group is a part's own color_10 child, whose
 * blend mode AvatarSwf resets to NORMAL when the look colours color_10
 * (js/avatar-rig.js frameDrawList).
 */
function blendGroup(bm, ops, a, n) {
  const inner = ops.length === 1 && ops[0].bm === 'layer' && ops[0].a === undefined ? ops[0].ops : ops;
  const out = { bm, ops: inner };
  if (a < 1) out.a = r4(a);
  if (n) out.n = n;
  return out;
}

/**
 * Flatten one sprite instance at absolute frame n into draw ops (in the
 * instance's own coordinates): { s: shapeId, m, a?, g?: [colour groups,
 * innermost first], cx? }, clip groups { clip: ops, ops } and blend groups
 * { bm, ops, a? } (bm a Flash blend mode name: the ops paint into their own
 * layer, which composites onto what is beneath with that mode at alpha a;
 * 'layer' is a plain isolated group). `stop(name, path)` may return a marker
 * to emit instead of descending (slots).
 */
export function flattenSprite(swf, id, n, opts = {}, m = IDENTITY, a = 1, groups = [], path = '', level = 0) {
  const t = swf.sprites.get(id);
  if (!t) return [];
  const list = [...displayListAt(t, Math.min(n, t.frameCount)).values()].sort((x, y) => x.depth - y.depth);
  // A child that blends with what is beneath it: this sprite becomes an
  // isolated layer (its alpha applies to the layer, not to each child).
  if (list.some((p) => !p.clipDepth && backdropBlend(p) && alphaOf(p.cxform, 1) > 0)) {
    const inner = flattenList(swf, list, n, opts, m, 1, groups, path, level);
    return inner.length ? [blendGroup('layer', inner, a)] : [];
  }
  return flattenList(swf, list, n, opts, m, a, groups, path, level);
}

/** flattenSprite for one display list (depth order); level 0 is the flattened sprite's own children. */
function flattenList(swf, list, n, opts, m, a, groups, path, level) {
  const out = [];
  let clipUntil = -1;
  let clipGroup = null;
  for (const p of list) {
    if (clipGroup && p.depth > clipUntil) { out.push(clipGroup); clipGroup = null; }
    const pm = mul(m, p.matrix);
    const pa = alphaOf(p.cxform, a);
    const kind = swf.kinds.get(p.id);
    const childPath = p.name ? (path ? `${path}/${p.name}` : p.name) : path;
    const g = p.name && /^color_\d+$/.test(p.name) ? [p.name, ...groups] : groups;
    let ops;
    if (p.clipDepth) {
      // A mask layer: its shapes clip the following depths up to clipDepth.
      const clip = kind === 'shape' || kind === 'morph'
        ? [{ s: kind === 'morph' ? morphShapeId(p.id, p.ratio || 0) : p.id, m: roundMatrix(pm) }]
        : unblend(flattenSprite(swf, p.id, n, {}, pm, 1, [], childPath, level + 1));
      clipGroup = { clip, ops: [] };
      clipUntil = p.clipDepth;
      continue;
    }
    if (p.name && opts.seen) opts.seen(p.name, pm, pa);
    const marker = p.name && opts.stop ? opts.stop(p.name, childPath, pm, pa, m, p.id) : null;
    if (marker) ops = [marker];
    else if (pa <= 0 && !opts.keepHidden) ops = [];
    else if (kind === 'shape' || kind === 'morph') {
      const op = { s: kind === 'morph' ? morphShapeId(p.id, p.ratio || 0) : p.id, m: roundMatrix(pm) };
      if (pa < 1) op.a = r4(pa);
      if (g.length) op.g = g;
      const cp = colorPart(p.cxform);
      if (cp) op.cx = cp;
      ops = [op];
    } else if (kind === 'sprite') {
      const blended = p.blendMode && p.blendMode !== 'normal';
      ops = flattenSprite(swf, p.id, n, opts, pm, blended ? 1 : pa, g, childPath, level + 1);
      const cp = colorPart(p.cxform);
      if (cp) tintOps(ops, cp);
    } else ops = [];
    // A blend mode on this placement: its content as one layer, composited
    // with that mode (a layer at full alpha is just its content).
    if (ops.length && p.blendMode && p.blendMode !== 'normal' && !marker && pa > 0) {
      if (kind !== 'sprite' && pa < 1) for (const o of ops) delete o.a;
      // A part's direct color_10 child: AvatarSwf (addShadowToHair,
      // maybeColorIt) sets its blendMode, so the runtime decides.
      const own10 = level === 0 && p.name === 'color_10' ? 'color_10' : undefined;
      if (p.blendMode !== 'layer' || pa < 1) ops = [blendGroup(p.blendMode, ops, pa, own10)];
    }
    if (clipGroup) clipGroup.ops.push(...ops);
    else out.push(...ops);
  }
  if (clipGroup) out.push(clipGroup);
  return out;
}

/**
 * The base avatar rig: per needed frame, the paint-ordered list of
 * { n: nodeIndex, m, a? } (static skin/body shape groups) and
 * { slot, m, a?, pm? } hooks where article parts go. `slotNames` are the
 * containers the client empties for articles; nodes are sprite instances
 * whose content is static (body parts).
 */
export function buildRig(swf, rootId, frames, slotNames, watchNames = []) {
  const slots = new Set(slotNames);
  const watch = new Set(watchNames);
  const nodes = [];
  const nodeIndex = new Map();
  const containers = [];
  const table = frames.map((n) => {
    const seenHere = {};
    containers.push(seenHere);
    const ops = flattenSprite(swf, rootId, n, {
      keepHidden: false,
      seen: (name, pm) => { if (watch.has(name)) seenHere[name] = roundMatrix(pm); },
      stop: (name, path, pm, pa, parentM, id) => {
        if (pa <= 0) return { hidden: true };
        if (slots.has(name)) {
          const hook = { slot: name, m: roundMatrix(pm) };
          if (pa < 1) hook.a = r4(pa);
          // Face containers move by AvatarConfig offsets in their parent's space.
          if (path.includes('sideHeadContainer_mc/')) hook.pm = roundMatrix(parentM);
          return hook;
        }
        if (/_mc$/.test(name) && !/Container/.test(name)) {
          // A body part (sideTorso_mc ...): static content, drawn by node.
          // Keyed by symbol too, in case a path holds another symbol on
          // some frames (the idle and sleepy frames reuse the same parts).
          const key = `${path}#${id}`;
          return { node: key, m: roundMatrix(pm), a: pa < 1 ? r4(pa) : undefined, name };
        }
        return null;
      },
    });
    const rows = [];
    const visit = (list) => {
      for (const o of list) {
        if (o.hidden) continue;
        if (o.node) {
          if (!nodeIndex.has(o.node)) {
            nodeIndex.set(o.node, nodes.length);
            nodes.push({ path: o.node.replace(/#\d+$/, ''), name: o.name, frame: n });
          }
          const row = { n: nodeIndex.get(o.node), m: o.m };
          if (o.a !== undefined) row.a = o.a;
          rows.push(row);
        } else if (o.slot) rows.push(o);
        else if (o.clip) throw new Error('mask layers in the base rig are not supported');
        else if (o.bm) throw new Error('blend modes in the base rig are not supported');
        else if (o.s !== undefined) rows.push({ s: o.s, m: o.m, ...(o.a ? { a: o.a } : {}) });
      }
    };
    visit(ops);
    return rows;
  });
  return { nodes, table, containers };
}

/** Static content of each rig node, in node-local coordinates. */
export function nodeContent(swf, rootId, node, frames) {
  // Resolve the node's sprite id by walking its instance path at its first frame.
  let id = rootId;
  const n = node.frame;
  for (const name of node.path.split('/')) {
    const t = swf.sprites.get(id);
    const p = [...displayListAt(t, Math.min(n, t.frameCount)).values()].find((x) => x.name === name);
    if (!p) throw new Error(`rig node ${node.path} not found`);
    id = p.id;
  }
  const t = swf.sprites.get(id);
  if (t && t.frameCount > 1) throw new Error(`rig node ${node.path} is animated (${t.frameCount} frames)`);
  return { id, ops: flattenSprite(swf, id, 1) };
}

/**
 * An article part (exported class) at each needed frame, deduplicated:
 * { frames: [variant index per needed frame], variants: [ops...] }.
 */
export function flattenPart(swf, partId, frames) {
  const variants = [];
  const keys = new Map();
  const index = frames.map((n) => {
    const ops = flattenSprite(swf, partId, n);
    const key = JSON.stringify(ops);
    if (!keys.has(key)) { keys.set(key, variants.length); variants.push(ops); }
    return keys.get(key);
  });
  return { frames: index.every((v) => v === 0) ? 0 : index, variants };
}

/** Every shape id an op list uses (clip groups included). */
export function shapeIds(ops, out = new Set()) {
  for (const o of ops) {
    if (o.s !== undefined) out.add(o.s);
    if (o.clip) shapeIds(o.clip, out);
    if (o.ops) shapeIds(o.ops, out);
  }
  return out;
}

export { isIdentity };
