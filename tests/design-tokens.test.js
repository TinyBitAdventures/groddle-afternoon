/**
 * Design tokens (UI audit, visual system): the game's CSS takes its colours, font sizes and stacking
 * layers from the token block at the top of public/style.css, so a redesign is a change of values
 * there. This lint covers style.css and every stylesheet a module injects (tools/tokens/css-sources.mjs)
 * and fails on a raw colour (hex, rgb(), hsl(), a named colour), an absolute font size (px, rem) or a
 * z-index number outside the block. `node tools/tokens/convert.mjs --write` maps new raw values onto
 * the tokens (`--add` makes palette entries for new colours). The raw values kept on purpose, each
 * with its reason, are in tools/tokens/allowlist.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allDeclarations, readTokens } from '../tools/tokens/css-sources.mjs';
import { colourLiterals, COLOUR_PROP } from '../tools/tokens/colour.mjs';
import { RAW_ALLOWED, allowed } from '../tools/tokens/allowlist.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decls = allDeclarations(root);
const tokens = readTokens(root);
const where = (d) => `${d.file} ${d.selector.slice(0, 70)} { ${d.prop}: ${d.value.trim().slice(0, 90)} }`;
const report = (bad) => `${bad.length} found:\n  ${bad.slice(0, 30).join('\n  ')}`;

// Strip var(...) (with nested parentheses) so fallbacks and token names are not read as raw values.
function withoutVars(v) {
  let out = v;
  for (let guard = 0; guard < 20 && /var\(/.test(out); guard++) out = out.replace(/var\((?:[^()]|\([^()]*\))*\)/g, ' ');
  return out;
}
// clamp(min, preferred, max): the preferred term scales with the viewport, so only min and max count.
const clampEnds = (v) => v.replace(/clamp\(([^,()]*),(?:[^()]|\([^()]*\))*?,([^,()]*)\)/g, ' $1 $2 ');
const absoluteSize = (v) => /(^|[\s(,])-?[\d.]+(px|rem|pt)\b/.test(clampEnds(withoutVars(v)));

describe('design tokens', () => {
  it('the token block defines the scales and the semantic colours', () => {
    for (const name of ['--fs-sm', '--lh-normal', '--sp-4', '--radius-md', '--shadow-2', '--z-panel', '--font-ui', '--surface-card', '--text', '--text-muted', '--text-inverse', '--border', '--accent', '--status-good', '--status-warn', '--status-danger', '--status-info', '--overlay-scrim']) {
      assert.ok(tokens.has(name), `${name} is defined`);
    }
    const palette = [...tokens.keys()].filter((n) => n.startsWith('--c-'));
    assert.ok(palette.length > 50, `palette has ${palette.length} entries`);
  });

  it('no raw colours outside the token block', () => {
    const bad = [];
    for (const d of decls) {
      if (/mask/.test(d.prop)) continue;
      for (const c of colourLiterals(d.maskedValue, COLOUR_PROP.test(d.prop))) {
        if (!allowed(d.file, d.selector, d.value.slice(c.index, c.index + c.length))) bad.push(`${c.text}: ${where(d)}`);
      }
    }
    assert.equal(bad.length, 0, `raw colours (run node tools/tokens/convert.mjs --write --add): ${report(bad)}`);
  });

  it('no absolute font sizes outside the token block', () => {
    const bad = [];
    for (const d of decls) {
      const v = d.maskedValue.replace(/!\s*important/g, '');
      if (d.prop === 'font-size' && absoluteSize(v)) bad.push(where(d));
      if (d.prop === 'font' && !/^\s*(inherit|initial|unset)\s*$/.test(v)) {
        // The size is the token before the optional /line-height and the family.
        const size = /(?:^|\s)((?:clamp|var)\((?:[^()]|\([^()]*\))*\)|[\d.]+(?:px|rem|pt))(?=\/|\s)/.exec(v);
        if (size && absoluteSize(size[1]) && !allowed(d.file, d.selector, size[1])) bad.push(where(d));
      }
    }
    assert.equal(bad.length, 0, `font sizes not from --fs-* tokens: ${report(bad)}`);
  });

  it('no z-index numbers outside the token block', () => {
    const bad = [];
    for (const d of decls) {
      if (d.prop !== 'z-index') continue;
      const v = d.maskedValue.replace(/!\s*important/g, '').trim();
      if (/^(auto|0|inherit|initial|unset)$/.test(v) || /^\s*$/.test(d.maskedValue.replace(/_/g, ''))) continue;
      if (!/var\(--z-[\w-]+\)/.test(v)) bad.push(where(d));
    }
    assert.equal(bad.length, 0, `z-index not from a --z-* layer: ${report(bad)}`);
  });

  it('every design token the CSS names is defined', () => {
    const bad = [];
    const prefix = /^--(c|fs|lh|sp|radius|z|font|shadow|surface|text|border|status|overlay)-/;
    for (const d of decls) {
      for (const m of d.value.matchAll(/var\((--[\w-]+)/g)) if (prefix.test(m[1]) && !tokens.has(m[1])) bad.push(`${m[1]}: ${where(d)}`);
    }
    assert.equal(bad.length, 0, `undefined tokens: ${report(bad)}`);
  });

  it('each allowlist entry still matches a raw value, and says why', () => {
    for (const e of RAW_ALLOWED) {
      assert.ok(e.why && e.why.length > 20, `${e.selector} has a reason`);
      for (const v of e.values) {
        const hit = decls.some((d) => d.file === e.file && e.selector.test(d.selector) && d.value.toLowerCase().includes(v));
        assert.ok(hit, `${e.file} ${e.selector} still uses ${v}`);
      }
    }
  });
});
