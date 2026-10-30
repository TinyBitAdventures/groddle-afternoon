/**
 * Start learning this skill takes one click (bug report #4, 2026-10-30). The Skills panel redraws
 * on the study ticker (game.js, every 30 frames) and on every HUD update, and each redraw emptied
 * the rows and built new ones, so the button under a pressed pointer was a different button by
 * the time it was let go and the click was lost. Redraws now patch the rows in place
 * (skills-panel.js patchChildren): a node that did not change stays the same node.
 * Run: node --test tests/skills-panel-stable.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchChildren } from '../public/js/skills-panel.js?v=g480-2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Just enough of a DOM element for patchChildren. */
class Node {
  constructor(tag, attrs = {}, kids = []) {
    this.nodeType = tag === '#text' ? 3 : 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
    this.childNodes = [];
    this.text = '';
    for (const k of kids) this.appendChild(typeof k === 'string' ? Object.assign(new Node('#text'), { text: k }) : k);
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  get dataset() { return { skill: this.attrs.get('data-skill') }; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  hasAttribute(n) { return this.attrs.has(n); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  appendChild(n) { n.parent?.childNodes.splice(n.parent.childNodes.indexOf(n), 1); n.parent = this; this.childNodes.push(n); return n; }
  replaceChild(n, old) { n.parent?.childNodes.splice(n.parent.childNodes.indexOf(n), 1); n.parent = this; this.childNodes[this.childNodes.indexOf(old)] = n; old.parent = null; return old; }
  remove() { this.parent?.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; }
  isEqualNode(o) {
    return o && o.nodeType === this.nodeType && o.tagName === this.tagName && o.text === this.text
      && JSON.stringify([...o.attrs].sort()) === JSON.stringify([...this.attrs].sort())
      && o.childNodes.length === this.childNodes.length && this.childNodes.every((c, i) => c.isEqualNode(o.childNodes[i]));
  }
}

const row = (skill, progress) => new Node('div', { class: 'skill-row', 'data-skill': skill }, [
  new Node('button', { class: 'skill-row-head' }, [skill]),
  ...(progress == null ? [] : [new Node('div', { class: 'skill-study-bar' }, [new Node('i', { style: `width: ${progress}%` })])]),
  new Node('div', { class: 'skill-row-body' }, [new Node('button', { class: 'content-action-btn skill-action' }, ['Start learning this skill'])]),
]);
const list = (...rows) => new Node('div', { class: 'skill-tree-list' }, rows);

describe('Skills panel redraws keep the buttons', () => {
  it('an unchanged redraw keeps every node, so the pressed Start button is still the one let go', () => {
    const live = list(row('animalkinship_2'), row('light_green_thumb_1'));
    const start = live.childNodes[0].childNodes[1].childNodes[0];
    patchChildren(live, list(row('animalkinship_2'), row('light_green_thumb_1')));
    assert.equal(live.childNodes[0].childNodes[1].childNodes[0], start);
  });

  it('a study bar that moved is patched in place and the row\'s Start button stays', () => {
    const live = list(row('animalkinship_2', 10));
    const start = live.childNodes[0].childNodes[2].childNodes[0];
    const bar = live.childNodes[0].childNodes[1].childNodes[0];
    patchChildren(live, list(row('animalkinship_2', 11)));
    assert.equal(live.childNodes[0].childNodes[2].childNodes[0], start);
    assert.equal(live.childNodes[0].childNodes[1].childNodes[0], bar);
    assert.equal(bar.getAttribute('style'), 'width: 11%');
  });

  it('a changed button, another skill\'s row, and rows that went are replaced or removed', () => {
    const live = list(row('a'), row('b'), row('c'));
    const next = list(row('a'), row('x'));
    next.childNodes[0].childNodes[1].childNodes[0].childNodes[0].text = 'Pause study';
    patchChildren(live, next);
    assert.equal(live.childNodes.length, 2);
    assert.equal(live.childNodes[0].childNodes[1].childNodes[0].childNodes[0].text, 'Pause study');
    assert.equal(live.childNodes[1].getAttribute('data-skill'), 'x');
  });

  it('the panel draws off the page and patches the study cards and the tree in', () => {
    const src = readFileSync(join(root, 'public/js/skills-panel.js'), 'utf8');
    const body = src.slice(src.indexOf('export function renderSkillTreePanel'));
    assert.doesNotMatch(body, /(study|list)\.innerHTML = ''/);
    assert.match(body, /patchChildren\(studyLive, study\);\n  patchChildren\(listLive, list\);/);
    assert.match(body, /const rerender = \(\) => renderSkillTreePanel\(\{ \.\.\.box\._skillTreeArgs, now: Date\.now\(\) \}\);/);
  });
});
