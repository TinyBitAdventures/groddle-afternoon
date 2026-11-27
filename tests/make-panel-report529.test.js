// #529 (a phone with "Remove animations"): the Make panel's tool stood still while the machines, the
// Tinkertool sprite and the street kept moving, and the report picture showed "Only show what I can
// make" ticked (the markup's checked attribute, not the box the player unticked), lists on their
// first option, and the "-16 energy" pills broken onto two lines.
//  - reduced motion stops the icon wobble, sparkles and result pulse; a tool's own sheet keeps playing;
//  - the report's context line says "motion reduce" so the digest shows it;
//  - the picture's copy draws each checkbox, radio and select as the player left it;
//  - the Make result's snug chips never wrap.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { markFormState, restoreFormState } from '../public/js/features/bug-report-feature.js?v=8a536e43';
import { renderProbeLine } from '../public/js/render-probe.js?v=519c86ef';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('public/style.css');
const game = read('public/game.js');
const report = read('public/js/features/bug-report-feature.js');

describe('#529 the Make panel under reduced motion', () => {
  const reduce = css.match(/@media \(prefers-reduced-motion: reduce\) \{[^{}]*(?:\/\*[^*]*\*\/[^{}]*)?\.make-progress[^{}]*\{ animation: none; \}\s*\}/)?.[0] || '';

  it('stops the wobble, sparkles and pulse, not the tool\'s own sprite sheet', () => {
    assert.ok(reduce, 'the Make panel has a reduced-motion rule');
    assert.match(reduce, /\.make-progress \.mp-tool:not\(\.mp-tool-sheet\)/);
    assert.match(reduce, /\.make-progress \.mp-spark/);
    assert.match(reduce, /\.make-progress \.mp-output/);
    assert.doesNotMatch(reduce, /\.mp-tool,/, 'a bare .mp-tool would also stop the sheet');
    // Nothing else under reduced motion reaches the sheet.
    for (const block of css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || []) {
      assert.doesNotMatch(block, /mp-tool-sheet[^)]*\{[^}]*animation: none/, block.slice(0, 120));
    }
    // The sheet is drawn with both its classes (game.js makeToolSheetVisual).
    assert.match(game, /<span class="mp-tool mp-tool-sheet" data-tool=/);
  });

  it('the report\'s context line says when the device asks for less motion', () => {
    const probe = { ok: true, plain: true, resolution: 2, maxTexture: 4096, api: 'webgl2', gl: 'Mali-G78' };
    assert.equal(renderProbeLine(probe, { resolution: 2, restores: 0, motion: 'reduce' }), 'rt ok (plain ok) · res 2 · tex 4096 · restores 0 · motion reduce · webgl2 · Mali-G78');
    assert.equal(renderProbeLine(probe, { resolution: 2 }), 'rt ok (plain ok) · res 2 · tex 4096 · restores 0 · webgl2 · Mali-G78');
    // The game passes the device's preference wherever it writes the line.
    assert.equal((game.match(/renderProbeLine\(renderProbe, \{[^}]*motion: motionPreference\(\) \}\)/g) || []).length, 2);
    assert.match(game, /function motionPreference\(\) \{\s*try \{ return globalThis\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\?\.matches \? 'reduce' : ''; \} catch \{ return ''; \}\s*\}/);
  });
});

// —— A tiny DOM: inputs, selects and options with live state apart from their attributes ——
class El {
  constructor(tag, opts = {}) {
    Object.assign(this, { tagName: tag, type: opts.type || '', children: [], attrs: {}, checked: false, selected: false, options: [] });
  }
  add(...kids) { this.children.push(...kids); if (this.tagName === 'SELECT') this.options.push(...kids); return this; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  is(sel) {
    if (sel === 'select') return this.tagName === 'SELECT';
    if (sel === 'input[type="checkbox"]') return this.tagName === 'INPUT' && this.type === 'checkbox';
    if (sel === 'input[type="radio"]') return this.tagName === 'INPUT' && this.type === 'radio';
    const m = /^\[(.+)\]$/.exec(sel);
    return Boolean(m && m[1] in this.attrs);
  }
  matches(sel) { return sel.split(',').some((s) => this.is(s.trim())); }
  querySelectorAll(sel) { return this.all().filter((n) => n.matches(sel)); }
}

function makePanel() {
  // play/index.html: <input type="checkbox" id="make-canmake" checked />, the player unticked it.
  const canMake = new El('INPUT', { type: 'checkbox' });
  canMake.setAttribute('checked', '');
  canMake.checked = false;
  const other = new El('INPUT', { type: 'checkbox' });
  other.checked = true;
  const radio = new El('INPUT', { type: 'radio' });
  radio.checked = true;
  const first = new El('OPTION');
  const second = new El('OPTION');
  first.setAttribute('selected', '');
  second.selected = true;
  const select = new El('SELECT').add(first, second);
  const page = new El('DIV').add(new El('DIV').add(canMake, other), radio, select);
  return { page, canMake, other, radio, first, second };
}

describe('#529 the report picture draws boxes and lists as the player left them', () => {
  it('marks every checkbox, radio and option with its live state, and takes the marks off again', () => {
    const { page, canMake, other, radio, first, second } = makePanel();
    const unmark = markFormState(page);
    assert.equal(canMake.getAttribute('data-shot-checked'), '0');
    assert.equal(other.getAttribute('data-shot-checked'), '1');
    assert.equal(radio.getAttribute('data-shot-checked'), '1');
    assert.equal(first.getAttribute('data-shot-selected'), '0');
    assert.equal(second.getAttribute('data-shot-selected'), '1');
    assert.equal(canMake.getAttribute('checked'), '', 'the live page\'s own attributes are not touched');
    unmark();
    for (const n of [canMake, other, radio]) assert.equal(n.getAttribute('data-shot-checked'), null);
    for (const n of [first, second]) assert.equal(n.getAttribute('data-shot-selected'), null);
  });

  it('the copy gets checked and selected attributes to match, and no marks', () => {
    const { page, canMake, other, radio, first, second } = makePanel();
    markFormState(page);
    // The library copies attributes (marks included), not live state: the marked page stands in for its copy.
    assert.equal(restoreFormState(page), 5);
    assert.equal(canMake.hasAttribute('checked'), false, 'the unticked box is drawn unticked');
    assert.equal(other.getAttribute('checked'), '');
    assert.equal(radio.getAttribute('checked'), '');
    assert.equal(first.hasAttribute('selected'), false);
    assert.equal(second.getAttribute('selected'), '');
    assert.equal(page.querySelectorAll('[data-shot-checked]').length + page.querySelectorAll('[data-shot-selected]').length, 0);
  });

  it('capturePictureWithUi marks the page before the copy and fixes the copy in onCloneNode', () => {
    const body = report.slice(report.indexOf('export async function capturePictureWithUi'));
    assert.match(body, /markFormState\(root\)/);
    assert.match(body, /onCloneNode: \(clone\) => \{ maskClone\(clone\); restoreScrolls\(clone\); restoreFormState\(clone\); \}/);
    assert.match(body, /unmark = \(\) => \{ unmarkScrolls\(\); unmarkForms\(\); \}/);
    assert.match(body, /unmark\?\.\(\)/);
    // The markup the report caught: the box starts ticked in both pages.
    assert.match(read('public/play/index.html'), /id="make-canmake"[^>]*checked/);
    assert.match(read('public/play/online/index.html'), /id="make-canmake"[^>]*checked/);
  });
});

describe('#529 the Make result\'s snug chips stay on one line', () => {
  const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.]/g, '\\.')} \\{[^}]*\\}`))?.[0] || '';
  it('the energy and iMG pills and the used items do not wrap', () => {
    assert.match(rule('.make-result .mr-delta'), /white-space: nowrap;/);
    assert.match(rule('.make-result .mr-used-item'), /white-space: nowrap;/);
    assert.match(rule('.make-result .mr-machine-say'), /white-space: nowrap;/);
  });
});
