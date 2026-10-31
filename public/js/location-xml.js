/**
 * Convert Tiny Speck location XML (locations-xml) → street JSON for the Pixi client.
 * Pure: string/path input → street object. No DOM/Pixi/fs in convert functions.
 *
 * XML dialect: game_object / object / int / str / bool / null / objref
 * (same layout as tinyspeck/glitch-locations dumps).
 */

/** @typedef {import('./street-model.js').StreetData} StreetData */

/**
 * Decode a few XML entities used in labels.
 * @param {string} s
 */
export function decodeXmlEntities(s) {
  return String(s ?? '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Minimal recursive parser for the location XML dialect.
 * Returns a tree: { tag, id?, attrs, children: [], text? }
 * @param {string} xml
 */
export function parseLocationXmlTree(xml) {
  const tokens = [];
  const re = /<\/?([A-Za-z0-9_]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1]) {
      const close = m[0].startsWith('</');
      const self = m[0].endsWith('/>');
      const attrs = {};
      const attrRe = /([A-Za-z0-9_]+)="([^"]*)"/g;
      let a;
      while ((a = attrRe.exec(m[2] || ''))) {
        attrs[a[1]] = decodeXmlEntities(a[2]);
      }
      tokens.push({ type: close ? 'close' : 'open', tag: m[1], attrs, self });
    } else if (m[3] && m[3].trim()) {
      tokens.push({ type: 'text', text: decodeXmlEntities(m[3]) });
    }
  }

  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  for (const t of tokens) {
    if (t.type === 'open') {
      const node = {
        tag: t.tag,
        id: t.attrs.id,
        attrs: t.attrs,
        children: [],
        text: '',
      };
      stack[stack.length - 1].children.push(node);
      if (!t.self) stack.push(node);
    } else if (t.type === 'close') {
      if (stack.length > 1) stack.pop();
    } else if (t.type === 'text') {
      const cur = stack[stack.length - 1];
      cur.text = (cur.text || '') + t.text;
    }
  }
  return root;
}

/**
 * Find first child with tag + optional id.
 * @param {object} node
 * @param {string} tag
 * @param {string} [id]
 */
export function findChild(node, tag, id) {
  if (!node?.children) return null;
  for (const c of node.children) {
    if (c.tag === tag && (id === undefined || c.id === id || c.attrs?.id === id)) {
      return c;
    }
  }
  return null;
}

/**
 * @param {object} node
 * @param {string} tag
 * @param {string} [id]
 */
export function findAll(node, tag, id) {
  if (!node?.children) return [];
  return node.children.filter(
    (c) => c.tag === tag && (id === undefined || c.id === id || c.attrs?.id === id)
  );
}

/**
 * Read int/str child by id under an object node.
 * @param {object} objNode
 * @param {string} id
 * @param {*} [fallback=null]
 */
export function childValue(objNode, id, fallback = null) {
  if (!objNode) return fallback;
  for (const c of objNode.children || []) {
    if ((c.id || c.attrs?.id) === id) {
      if (c.tag === 'int') {
        const n = Number(c.text);
        return Number.isFinite(n) ? n : fallback;
      }
      if (c.tag === 'str') return c.text ?? fallback;
      if (c.tag === 'bool') return String(c.text).toLowerCase() === 'true' || c.text === '1';
      if (c.tag === 'null') return null;
      if (c.tag === 'objref') return { ...c.attrs, text: c.text };
      return c.text ?? fallback;
    }
  }
  return fallback;
}

/**
 * @param {object} gameObject root game_object node
 * @param {Record<string, string>} [hubNames] hubId → name
 * @param {{ hubId?: string|number|null }} [opts] hubId: the street's own hub,
 *   the `hubid` attribute on its L*.xml location object (G184). The geometry
 *   XML carries no hub of its own; without one the hub of the first signpost
 *   target is a guess, and on a border street that is the neighbour's hub.
 * @returns {StreetData}
 */
export function convertGameObjectToStreet(gameObject, hubNames = {}, opts = {}) {
  if (!gameObject || gameObject.tag !== 'game_object') {
    throw new Error('expected game_object root');
  }
  const tsid = gameObject.attrs.tsid || '';
  const labelAttr = gameObject.attrs.label || '';
  const dynamic = findChild(gameObject, 'object', 'dynamic');
  if (!dynamic) throw new Error(`missing dynamic object for ${tsid}`);

  const bounds = {
    l: Number(childValue(dynamic, 'l', 0)),
    r: Number(childValue(dynamic, 'r', 0)),
    t: Number(childValue(dynamic, 't', 0)),
    b: Number(childValue(dynamic, 'b', 0)),
  };
  const label = childValue(dynamic, 'label', labelAttr) || labelAttr || tsid;
  const swf_file = childValue(dynamic, 'swf_file', '') || '';

  const layersNode = findChild(dynamic, 'object', 'layers');
  const platforms = [];
  /** @type {{ id:string, x:number, y:number, h:number, w:number, pc_perm:number|null, item_perm:number|null, source?:string }[]} */
  const walls = [];
  const layers = [];
  const signposts = [];
  let hubId = '';
  let hubName = '';

  const layerObjs = layersNode
    ? layersNode.children.filter((c) => c.tag === 'object')
    : [];

  for (const layerObj of layerObjs) {
    const layerId = layerObj.id || layerObj.attrs?.id || 'layer';
    const layerName = childValue(layerObj, 'name', layerId) || layerId;
    const layerZ = childValue(layerObj, 'z', 0);

    // Platforms (usually middleground)
    const plRoot = findChild(layerObj, 'object', 'platform_lines');
    if (plRoot) {
      for (const pl of plRoot.children.filter((c) => c.tag === 'object')) {
        const start = findChild(pl, 'object', 'start');
        const end = findChild(pl, 'object', 'end');
        if (!start || !end) continue;
        // platform_item_perm: what the line is for items (street-model.js isItemSolid);
        // an <int> or <null>, left off when the line has none (solid, as in the client).
        const itemPerm = childValue(pl, 'platform_item_perm', undefined);
        platforms.push({
          id: pl.id || pl.attrs?.id || '',
          x1: Number(childValue(start, 'x', 0)),
          y1: Number(childValue(start, 'y', 0)),
          x2: Number(childValue(end, 'x', 0)),
          y2: Number(childValue(end, 'y', 0)),
          pc_perm: childValue(pl, 'platform_pc_perm', -1),
          ...(itemPerm === undefined ? {} : { item_perm: itemPerm }),
        });
      }
    }

    // Climbable walls (vertical colliders). Glitch: top at y (more negative),
    // bottom at y+h (see Wall.as getClosestToXY: y <= wall.y && y >= wall.y+h).
    const wallsRoot = findChild(layerObj, 'object', 'walls');
    if (wallsRoot) {
      for (const w of wallsRoot.children.filter((c) => c.tag === 'object')) {
        const x = Number(childValue(w, 'x', 0));
        const y = Number(childValue(w, 'y', 0));
        const h = Number(childValue(w, 'h', 0));
        const width = Number(childValue(w, 'w', 0));
        if (!Number.isFinite(h) || h === 0) continue;
        walls.push({
          id: w.id || w.attrs?.id || '',
          x,
          y,
          h,
          w: width,
          pc_perm: childValue(w, 'pc_perm', null),
          item_perm: childValue(w, 'item_perm', null),
          source: 'xml',
        });
      }
    }

    // Decos — keep world coords (client applies worldToScreen)
    const decosRoot = findChild(layerObj, 'object', 'decos');
    const decos = [];
    if (decosRoot) {
      for (const d of decosRoot.children.filter((c) => c.tag === 'object')) {
        const sprite =
          childValue(d, 'sprite_class', null) ||
          childValue(d, 'sprite', null) ||
          '';
        if (!sprite) continue;
        decos.push({
          id: d.id || d.attrs?.id || '',
          name: String(childValue(d, 'name', '') || ''),
          signText: String(childValue(d, 'sign_txt', '') || ''),
          sprite: String(sprite),
          x: Number(childValue(d, 'x', 0)),
          y: Number(childValue(d, 'y', 0)),
          w: Number(childValue(d, 'w', 0)),
          h: Number(childValue(d, 'h', 0)),
          z: Number(childValue(d, 'z', 0)),
          r: Number(childValue(d, 'r', 0)),
        });
      }
    }

    // Signposts
    const spRoot = findChild(layerObj, 'object', 'signposts');
    if (spRoot) {
      for (const sp of spRoot.children.filter((c) => c.tag === 'object')) {
        const connects = [];
        const connRoot = findChild(sp, 'object', 'connects');
        if (connRoot) {
          for (const c of connRoot.children.filter((ch) => ch.tag === 'object')) {
            const target = findChild(c, 'objref', 'target');
            const tAttrs = target?.attrs || {};
            const cTsid = tAttrs.tsid || '';
            const cLabel = tAttrs.label || cTsid;
            const cHub = String(childValue(c, 'hub_id', '') || '');
            if (cHub && !hubId) {
              hubId = cHub;
              hubName = hubNames[cHub] || hubNames[String(cHub)] || '';
            }
            if (cTsid) {
              connects.push({
                tsid: cTsid,
                label: cLabel,
                hub_id: cHub || undefined,
              });
            }
          }
        }
        signposts.push({
          id: sp.id || sp.attrs?.id || '',
          x: Number(childValue(sp, 'x', 0)),
          y: Number(childValue(sp, 'y', 0)),
          w: Number(childValue(sp, 'w', 0)),
          h: Number(childValue(sp, 'h', 0)),
          connects,
        });
      }
    }

    layers.push({
      id: layerId,
      name: layerName,
      z: Number(layerZ) || 0,
      decos,
    });
  }

  // Prefer G-prefix tsid from game_object when present
  const outTsid = tsid;
  const ownHub = opts?.hubId != null && opts.hubId !== '' ? String(opts.hubId) : '';
  if (ownHub) {
    hubId = ownHub;
    hubName = hubNames[ownHub] || '';
  }

  /** @type {StreetData} */
  const street = {
    source: 'tinyspeck/glitch-locations locations-xml.zip (CC0)',
    tsid: outTsid,
    label: String(label),
    hubId: hubId ? String(hubId) : undefined,
    hubName: hubName || undefined,
    swf_file: swf_file || undefined,
    bounds,
    platforms,
    walls,
    layers,
    signposts,
    stats: {
      platformCount: platforms.length,
      wallCount: walls.length,
      layerCount: layers.length,
      decoCount: layers.reduce((n, L) => n + (L.decos?.length || 0), 0),
      signpostCount: signposts.length,
    },
  };
  return street;
}

/**
 * Convert a full location XML document string to street JSON.
 * @param {string} xmlText
 * @param {Record<string, string>} [hubNames]
 */
export function convertLocationXml(xmlText, hubNames = {}, opts = {}) {
  if (!xmlText || !String(xmlText).includes('game_object')) {
    throw new Error('not a location game_object XML');
  }
  const tree = parseLocationXmlTree(xmlText);
  const gameObject = tree.children.find((c) => c.tag === 'game_object');
  if (!gameObject) throw new Error('game_object not found');
  return convertGameObjectToStreet(gameObject, hubNames, opts);
}

/**
 * Whether a converted street is loadable (has platforms + at least one deco).
 * Matches street-model assertStreetGeometry requirements.
 * @param {StreetData} street
 */
export function isConvertibleStreet(street) {
  if (!street?.tsid || !street?.label) return false;
  if (!street.bounds) return false;
  if (!Array.isArray(street.platforms) || street.platforms.length < 1) return false;
  const decoCount = (street.layers || []).reduce((n, L) => n + (L.decos?.length || 0), 0);
  return decoCount >= 1;
}

/**
 * Collect unique deco sprite names from a street.
 * @param {StreetData} street
 * @returns {string[]}
 */
export function collectSprites(street) {
  const set = new Set();
  for (const L of street.layers || []) {
    for (const d of L.decos || []) {
      if (d.sprite) set.add(d.sprite);
    }
  }
  return [...set].sort();
}
