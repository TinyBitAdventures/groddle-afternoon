/**
 * A very small HTML reader for the build archive (public/changelog.html as it
 * stood in git). It is enough for that one hand-written, well-formed page:
 * elements with attributes, text, void tags and self-closing SVG children.
 * Every element keeps its source offsets, so innerHTML is the exact source.
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);

export function parse(src) {
  const root = { tag: '#root', attrs: {}, children: [], start: 0, innerStart: 0, innerEnd: src.length, end: src.length };
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi;
  let at = 0;
  let m;
  const top = () => stack[stack.length - 1];
  while ((m = tagRe.exec(src))) {
    if (m.index > at) top().children.push({ text: src.slice(at, m.index), start: at, end: m.index });
    at = tagRe.lastIndex;
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== name) i -= 1;
      if (i === 0) throw new Error(`stray </${name}> at ${m.index}`);
      // Anything left open inside (never in this page) closes where its parent does.
      for (let j = stack.length - 1; j >= i; j -= 1) {
        stack[j].innerEnd = m.index;
        stack[j].end = j === i ? at : m.index;
      }
      stack.length = i;
      continue;
    }
    const name = m[2].toLowerCase();
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const node = { tag: name, attrs, children: [], parent: top(), start: m.index, innerStart: at, innerEnd: at, end: at };
    top().children.push(node);
    if (m[4] || VOID.has(name)) continue;
    if (RAW.has(name)) {
      const close = src.toLowerCase().indexOf(`</${name}`, at);
      node.children.push({ text: src.slice(at, close), start: at, end: close });
      node.innerEnd = close;
      at = src.indexOf('>', close) + 1;
      node.end = at;
      tagRe.lastIndex = at;
      continue;
    }
    stack.push(node);
  }
  if (at < src.length) root.children.push({ text: src.slice(at), start: at, end: src.length });
  root.src = src;
  const setSrc = (n) => { n.src = src; for (const c of n.children || []) if (c.tag) setSrc(c); };
  setSrc(root);
  return root;
}

export const hasClass = (n, cls) => !!n.tag && (n.attrs.class || '').split(/\s+/).includes(cls);

export function findAll(node, pred, out = []) {
  for (const c of node.children || []) {
    if (!c.tag) continue;
    if (pred(c)) out.push(c);
    findAll(c, pred, out);
  }
  return out;
}
export const find = (node, pred) => findAll(node, pred)[0] || null;
export const byClass = (cls) => (n) => hasClass(n, cls);
export const byTag = (tag) => (n) => n.tag === tag;
export const kids = (node, pred = () => true) => (node.children || []).filter((c) => c.tag && pred(c));

/** The element's inner source with whitespace runs collapsed (inline HTML is kept as written). */
export const inner = (n) => n.src.slice(n.innerStart, n.innerEnd).replace(/\s+/g, ' ').trim();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e.toLowerCase()] ?? all;
});

/** Plain text of an HTML fragment: tags dropped, entities decoded, whitespace collapsed. */
export const plain = (html) => decode(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.;:!?’)])/g, '$1').trim();

/** Every text run in a fragment, in order (tags split runs), entities decoded. */
export const textRuns = (html) => String(html)
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .split(/<[^>]*>/)
  .map((t) => decode(t).replace(/\s+/g, ' ').trim())
  .filter(Boolean);
