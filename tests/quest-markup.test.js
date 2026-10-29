/**
 * Quest copy markup and requirement lines (js/quest-text.js; cleanQuestMarkup is tests/quest-text.test.js) (Austin 2026-10-29: the Quests panel showed
 * "Teleport to <b>Tamila</b> from <b>Shimla Mirch</b>: 0 / 1" and "Find what cannot be found.: 0 / 7").
 * GSJS quest text is Flash htmlText the client set with tf.htmlText; requirement lines read
 * "desc (got/need)" in the quest tracker (QuestTracker.as 212-214).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  questTextSegments,
  questTextPlain,
  renderQuestText,
  questRequirementText,
  withQuestMarkup,
} from '../public/js/quest-text.js?v=g425-1';
import { cleanQuestMarkup, parseQuestConversation } from '../public/js/quests.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const QUESTS = JSON.parse(read('public/assets/content/quests.json'));
const CLIENT = join(root, '..', 'glitch-client', 'com/tinyspeck/engine/view/ui/quest');

/** A DOM stand-in that refuses innerHTML/outerHTML/insertAdjacentHTML: only nodes may be built. */
function fakeDocument() {
  const made = [];
  const node = (tag) => {
    const n = {
      tagName: tag,
      children: [],
      attrs: {},
      className: '',
      ownerDocument: null,
      get firstChild() { return this.children[0] || null; },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children.splice(this.children.indexOf(c), 1); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      set textContent(v) { this.children = v ? [{ nodeType: 3, text: String(v) }] : []; },
      get textContent() { return this.children.map((c) => c.text ?? c.textContent).join(''); },
      insertAdjacentHTML() { throw new Error('insertAdjacentHTML used'); },
    };
    for (const prop of ['innerHTML', 'outerHTML']) {
      Object.defineProperty(n, prop, { set() { throw new Error(`${prop} used`); }, get() { return ''; } });
    }
    made.push(n);
    return n;
  };
  const doc = {
    made,
    createElement: (tag) => { const n = node(tag.toUpperCase()); n.ownerDocument = doc; return n; },
    createTextNode: (text) => ({ nodeType: 3, text }),
  };
  return doc;
}

/** The rendered tree as compact markup, for comparisons. */
function serialize(el) {
  return el.children.map((c) => {
    if (c.nodeType === 3) return c.text;
    if (c.tagName === 'BR') return '<br>';
    const attrs = c.className ? ` class="${c.className}"` : '';
    const link = c.attrs['data-quest-link'] ? ` data-quest-link="${c.attrs['data-quest-link']}"` : '';
    return `<${c.tagName.toLowerCase()}${attrs}${link}>${serialize(c)}</${c.tagName.toLowerCase()}>`;
  }).join('');
}

describe('quest text markup (quest-text.js)', () => {
  it('draws the source <b> as bold and never shows the tag', () => {
    const desc = QUESTS.teleportation_teleport_between_zones.requirements[0].desc;
    assert.equal(desc, 'Teleport to <b>Tamila</b> from <b>Shimla Mirch</b>');
    assert.deepEqual(questTextSegments(desc), [
      { text: 'Teleport to ' },
      { text: 'Tamila', bold: true },
      { text: ' from ' },
      { text: 'Shimla Mirch', bold: true },
    ]);
    const doc = fakeDocument();
    const el = doc.createElement('div');
    renderQuestText(el, desc);
    assert.equal(serialize(el), 'Teleport to <b>Tamila</b> from <b>Shimla Mirch</b>');
    assert.equal(questTextPlain(desc), 'Teleport to Tamila from Shimla Mirch');
  });

  it('keeps <i>, <br> and in-game links; drops every other tag but keeps its text', () => {
    const doc = fakeDocument();
    const el = doc.createElement('div');
    renderQuestText(el, '<i>psst, <b>kid</b>.</i><br>Use <a href="event:item|test_tube">Test Tube</a> at <a href="event:external|http://www.glitch.com/auctions/">Auction</a> <span class="nuxp_vog">now</span><font color="#f00">!</font>');
    assert.equal(
      serialize(el),
      '<i>psst, </i><b><i>kid</i></b><i>.</i><br>Use <span class="q-link" data-quest-link="item|test_tube">Test Tube</span> at Auction now!'
    );
  });

  it('never builds markup from the text: tags become nodes or nothing, everything else is a text node', () => {
    const doc = fakeDocument();
    const el = doc.createElement('div');
    renderQuestText(el, 'a <script>alert(1)</script> &lt;img src=x onerror=alert(1)&gt; <img src=x onerror="alert(2)"> 1 < 2 &amp; <b onclick="x()">b</b>');
    assert.equal(serialize(el), 'a alert(1) <img src=x onerror=alert(1)>  1 < 2 & <b>b</b>');
    const tags = new Set(doc.made.map((n) => n.tagName));
    for (const tag of tags) assert.ok(['DIV', 'B', 'I', 'BR', 'SPAN'].includes(tag), tag);
    // The <b onclick> lost its attribute: the renderer sets only data-quest-link on links.
    assert.deepEqual(doc.made.find((n) => n.tagName === 'B').attrs, {});
  });

  it('reads the same words as cleanQuestMarkup for every quest in the catalog', () => {
    let checked = 0;
    for (const def of Object.values(QUESTS)) {
      const texts = [def.desc, def.offer, def.completion, ...(def.requirements || []).map((r) => r.desc)];
      for (const raw of texts) {
        if (!raw) continue;
        checked += 1;
        const plain = questTextPlain(raw);
        assert.doesNotMatch(plain, /<\/?(?:a|b|i|br|split|span|font|p)\b/i, `${def.classTsid}: ${plain.slice(0, 80)}`);
        // cleanQuestMarkup leaves &#34; encoded; quest-text decodes it.
        const want = cleanQuestMarkup(raw.replace(/<split\b[^>]*>/gi, '\n')).replace(/&#34;/g, '"').replace(/\s+/g, ' ').trim();
        assert.equal(plain.replace(/\s+/g, ' ').trim(), want, def.classTsid);
      }
    }
    assert.ok(checked > 3000, `checked ${checked}`);
  });

  it('gives each offer page its own markup when the pages line up with parseQuestConversation', () => {
    const raw = Object.values(QUESTS).find((q) => /<i>/.test(q.offer || '') && /<split/.test(q.offer || '')).offer;
    const beats = withQuestMarkup(parseQuestConversation(raw), raw);
    assert.ok(beats.length > 1);
    for (const beat of beats) {
      assert.equal(typeof beat.markup, 'string');
      assert.equal(questTextPlain(beat.markup).replace(/\s+/g, ' ').trim(), beat.text.replace(/\s+/g, ' ').trim());
    }
    assert.ok(beats.some((b) => /<i>/.test(b.markup)));
    // Beats that did not come from this text keep their own shape.
    const other = [{ text: 'Hi', response: 'OK' }];
    assert.equal(withQuestMarkup(other, raw), other);
  });
});

describe('quest requirement lines', () => {
  it('reads "desc (got/need)" as the client tracker did, so a sentence never ends ".:"', () => {
    assert.equal(questRequirementText('Find what cannot be found.', 0, 7), 'Find what cannot be found. (0/7)');
    assert.equal(questRequirementText('Dig 7 Earth from Dirt Piles or Patches.', 3, 7), 'Dig 7 Earth from Dirt Piles or Patches. (3/7)');
    assert.equal(questRequirementText('Hogtie three Piggies!', 9, 3), 'Hogtie three Piggies! (3/3)');
    // need_num 1: the desc alone (QuestTracker.as 213: is_count && need_num > 1).
    assert.equal(questRequirementText('Teleport to <b>Tamila</b> from <b>Shimla Mirch</b>', 0, 1), 'Teleport to <b>Tamila</b> from <b>Shimla Mirch</b>');
    for (const def of Object.values(QUESTS)) {
      for (const r of def.requirements || []) {
        const line = questTextPlain(questRequirementText(r.desc, 0, r.num));
        assert.doesNotMatch(line, /[.!?]\s*:/, `${def.classTsid}: ${line}`);
        assert.doesNotMatch(line, /</, `${def.classTsid}: ${line}`);
      }
    }
  });

  it('cites the client tracker format', { skip: !existsSync(CLIENT) && 'no glitch-client checkout' }, () => {
    const tracker = readFileSync(join(CLIENT, 'QuestTracker.as'), 'utf8').split('\n');
    assert.match(tracker[211], /var txt:String = req\.desc;/);
    assert.match(tracker[212], /if\(req\.is_count && req\.need_num > 1\)\{/);
    assert.match(tracker[213], /txt \+= ' \('\+req\.got_num\+'\/'\+req\.need_num\+'\)';/);
    assert.match(tracker[215], /tf\.htmlText = /);
  });

  it('the Quests panel, the HUD tracker and put-off cards draw requirements through quest-text.js', () => {
    const game = read('public/game.js');
    const offers = read('public/js/features/quest-offers-feature.js');
    assert.doesNotMatch(game, /\$\{r\.desc\}: \$\{r\.current\} \/ \$\{r\.num\}/);
    assert.doesNotMatch(offers, /\$\{r\.desc\}: 0 \/ \$\{r\.num\}/);
    assert.doesNotMatch(game, /escapeHtml\(req\.desc\)/);
    assert.match(game, /renderQuestText\(row, questRequirementText\(r\.desc, r\.current, r\.num\)\)/);
    assert.match(offers, /renderQuestText\(row, questRequirementText\(r\.desc, 0, r\.num\)\)/);
    assert.match(game, /renderQuestText\(desc, req\.desc\)/);
    assert.match(game, /renderQuestText\(copy, beat\.markup \?\? beat\.text\)/);
    // One key for quest-text.js in every importer.
    const keys = new Set();
    for (const text of [game, offers]) for (const m of text.matchAll(/quest-text\.js(\?v=[^'"]*)?['"]/g)) keys.add(m[1] || '');
    assert.equal(keys.size, 1, [...keys].join(', '));
    assert.match([...keys][0], /^\?v=g\d+-\d+$/);
  });
});
