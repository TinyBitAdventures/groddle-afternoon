// CSS with the design tokens resolved, for tests that pin a value the client or the art fixes
// (a source colour, a stacking order): they read the value a rule ends up with, not the token name.
//   resolveTokens(css): var(--token) from style.css's token block -> its value, calc(a + b) of plain
//   numbers -> the sum, color-mix(in srgb, <colour> P%, transparent) -> rgba(r, g, b, a).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTokens } from '../tools/tokens/css-sources.mjs';
import { parseColour } from '../tools/tokens/colour.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readTokens(root);

const num = (n) => String(+n.toFixed(3));
function rgba(c) {
  const [r, g, b, a] = c.map((v, i) => (i < 3 ? Math.round(v) : v));
  return a >= 1 ? '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : `rgba(${r}, ${g}, ${b}, ${num(a)})`;
}

export function resolveTokens(css) {
  let out = css;
  for (let i = 0; i < 12; i++) {
    const next = out.replace(/var\((--[\w-]+)\)/g, (all, name) => (tokens.has(name) ? tokens.get(name) : all));
    if (next === out) break;
    out = next;
  }
  out = out.replace(/calc\((-?\d+) \+ (\d+)\)/g, (all, a, b) => String(Number(a) + Number(b)));
  out = out.replace(/color-mix\(in srgb, ([^,()]+|rgba?\([^()]*\)) ([\d.]+)%, transparent\)/g, (all, colour, pct) => {
    const c = parseColour(colour);
    return c ? rgba([c[0], c[1], c[2], c[3] * (Number(pct) / 100)]) : all;
  });
  return out;
}

export const resolvedStyleCss = () => resolveTokens(readFileSync(join(root, 'public/style.css'), 'utf8'));
