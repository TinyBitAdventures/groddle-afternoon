/**
 * Reimagined wardrobe tags (row G52): the builder's chips for the greyscale
 * masters say "Reimagined" and name where their colours came from.
 * Run: node --test tests/avatar-reimagined.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandCatalog } from '../public/js/avatar-looks.js';
import { REIMAGINED_TAG, decorateWardrobe, installReimaginedTags, isReimagined, reimaginedNote } from '../public/js/avatar-reimagined.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = expandCatalog(JSON.parse(readFileSync(join(root, 'public/assets/avatar/catalog.json'), 'utf8')));
const item = (type, name) => catalog.types[type].find((i) => i.name === name);

/** Just enough DOM for decorateWardrobe: elements with children, dataset, classList, after(). */
class El {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.title = '';
    const self = this;
    this.classList = {
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  get nextElementSibling() {
    const sibs = this.parentElement?.children || [];
    return sibs[sibs.indexOf(this) + 1] || null;
  }
  after(c) {
    const sibs = this.parentElement.children;
    c.parentElement = this.parentElement;
    sibs.splice(sibs.indexOf(this) + 1, 0, c);
  }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll() {
    // The one selector decorateWardrobe asks for: style chips with a type and name.
    return [...this.walk()].filter((e) => e.classList.contains('avatar-style-chip') && e.dataset.type && e.dataset.name);
  }
}
function fakeDoc() {
  const doc = { createElement: (tag) => new El(doc, tag) };
  return doc;
}
function chipRow(doc, type, names, active) {
  const box = doc.createElement('div');
  const row = box.appendChild(doc.createElement('div'));
  row.className = 'avatar-style-row';
  for (const name of names) {
    const chip = row.appendChild(doc.createElement('button'));
    chip.className = name === active ? 'avatar-style-chip active' : 'avatar-style-chip';
    chip.dataset.type = type;
    chip.dataset.name = name;
    chip.textContent = item(type, name)?.label || name;
  }
  return { box, row };
}

describe('reimagined notes', () => {
  it('names the sibling a borrowed article took its colours from', () => {
    const it = item('shirt', 'mushroom_shirt_light');
    assert.ok(isReimagined(it));
    const note = reimaginedNote(it);
    assert.match(note, /^Reimagined: /);
    assert.match(note, /greyscale/);
    assert.match(note, /borrowed from Mushroom shirt\.$/);
  });

  it('says when colours were designed (no sibling to borrow from)', () => {
    assert.match(reimaginedNote(item('dress', 'teaport')), /Teapot is greyscale.*designed for the remake/);
  });

  it('is null for every GSJS article and the own-colour SWF-only ones', () => {
    for (const [type, list] of Object.entries(catalog.types)) {
      for (const i of list) if (!i.reimagined) assert.equal(reimaginedNote(i), null, `${type}/${i.name}`);
    }
    assert.equal(reimaginedNote(item('coat', 'RideRainbow')), null);
  });
});

describe('builder chips', () => {
  it('tags only the reimagined chips, with a tooltip, and explains the worn one under the row', () => {
    const doc = fakeDoc();
    const { box, row } = chipRow(doc, 'shirt', ['classic_undershirt', 'mushroom_shirt', 'mushroom_shirt_light', 'cola_bottle_shirt'], 'mushroom_shirt_light');
    assert.equal(decorateWardrobe(box, catalog), 2);
    const [plain, sibling, light, cola] = row.children;
    for (const c of [plain, sibling]) {
      assert.equal(c.children.length, 0);
      assert.equal(c.title, '');
    }
    for (const c of [light, cola]) {
      assert.equal(c.dataset.reimagined, '1');
      assert.equal(c.children[0].className, 'avatar-reimagined-tag');
      assert.equal(c.children[0].textContent, REIMAGINED_TAG);
      assert.match(c.title, /^Reimagined: /);
    }
    const note = row.nextElementSibling;
    assert.ok(note.classList.contains('avatar-reimagined-note'));
    assert.equal(note.textContent, reimaginedNote(item('shirt', 'mushroom_shirt_light')));
    // Idempotent: a second pass (the observer sees its own changes) adds nothing.
    assert.equal(decorateWardrobe(box, catalog), 0);
    assert.equal(box.children.length, 2);
    assert.equal(light.children.length, 1);
  });

  it('adds no explainer when the worn article is not reimagined', () => {
    const doc = fakeDoc();
    const { box } = chipRow(doc, 'hat', ['bowler_hat', 'real_bowler_hat'], 'bowler_hat');
    assert.equal(decorateWardrobe(box, catalog), 1);
    assert.equal(box.children.length, 1);
  });

  it('install is a no-op without the builder (Node, other pages)', () => {
    assert.equal(installReimaginedTags(undefined), false);
    assert.equal(installReimaginedTags({ getElementById: () => null }), false);
  });
});
