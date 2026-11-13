/**
 * #300 (G699): the Quests panel said "You have 41 new quests" while the Offered tab held one card:
 * offers made by the Magic Rock and left unanswered (G225) were only a count. They are cards in the
 * Offered tab now, with Accept and (a quest that can wait, G229) "Not right now", so the count and
 * the tab agree. The original kept only the count and "Show me" (QuestsDialog.as updateCountToast
 * 241-252, onToastStarted 222-238), which still opens one offer.
 * Run: node --test tests/quest-offered-tab300.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getQuestCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=40c71a37';
import { listDeclinedOffers, markOffered, offerCanWait, putOffOffer, waitingOffers } from '../public/js/quest-offers.js?v=89511e1e';
import { questOffersFeature, waitingOfferCards } from '../public/js/features/quest-offers-feature.js?v=bc8aff77';
import { questCardTab } from '../public/js/ui/quest-sheet.js?v=c5465bbe';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');

/** Just enough of a DOM for the log's cards. */
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.title = '';
    this.disabled = false;
    this.listeners = {};
    const self = this;
    this.classList = { contains: (c) => self.className.split(/\s+/).includes(c) };
  }
  append(...n) { this.children.push(...n); }
  appendChild(n) { this.children.push(n); return n; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { this.listeners.click?.(); }
  find(pred) { return this.children.find(pred); }
}
const fakeDocument = {
  createElement: (t) => new El(t),
  createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  getElementById: () => null,
};

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function engine() {
  const data = {};
  return {
    data,
    started: true,
    pc: { level: 5, xp: 0, energy: 50, mood: 50, currants: 0, giantFavor: {} },
    inv: {},
    learnedSkills: [],
    unlockedAchievements: [],
    questState: createQuestState(),
    streetTsid: 'GLI2V0UN7RD1T2J',
    param: () => null,
    activeBuffIds: () => [],
    questDialogueOpen: () => false,
    offerQuestDialogue() {},
    playSound() {},
    setData: (k, v) => { data[k] = v; },
    updateHud() {},
    refreshPack() {},
    save() {},
    pushActivity() {},
    toast() {},
    award() {},
    query: () => null,
  };
}

function withDocument(fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = fakeDocument;
  try {
    return fn();
  } finally {
    if (had) Object.defineProperty(globalThis, 'document', had);
    else delete globalThis.document;
  }
}

describe('#300: every new quest is a card in the Offered tab', () => {
  it('each waiting offer draws a card the sheet files under Offered, oldest first', () => {
    const e = engine();
    const ordinary = Object.values(getQuestCatalog()).filter((d) => !d.isEmergency && (d.requirements || []).length).slice(0, 5);
    ordinary.forEach((d, i) => markOffered(e.questState, d.classTsid, 1000 + i));
    const waiting = waitingOffers(e.questState).filter((r) => !r.emergency);
    assert.equal(waiting.length, 5);
    const cards = withDocument(() => questOffersFeature.questLogCards(e));
    assert.equal(cards.length, 5, 'the count and the cards agree');
    assert.deepEqual(cards.map((c) => c.dataset.questWaiting), waiting.map((r) => r.classTsid));
    for (const c of cards) {
      assert.equal(questCardTab(c), 'offered');
      assert.equal(c.dataset.questPutOff, c.dataset.questWaiting, 'the Encyclopedia link and the sheet read this id');
      assert.equal(c.children[1].textContent, 'New. Not accepted yet.');
      assert.ok(c.find((n) => n.dataset?.questAccept), 'Accept');
    }
  });

  it('Accept takes the quest; the card leaves the tab', () => {
    const e = engine();
    const def = Object.values(getQuestCatalog()).find((d) => !d.isEmergency && !d.needsStart && (d.requirements || []).length && !d.instanceRoom);
    markOffered(e.questState, def.classTsid, 1000);
    const [card] = withDocument(() => waitingOfferCards(e));
    assert.equal(card.find((n) => n.dataset?.questLater), undefined, 'a quest that cannot wait has no "Not right now" (G229)');
    withDocument(() => card.find((n) => n.dataset?.questAccept).click());
    assert.equal(e.data.questOfferResult, 'accepted');
    assert.ok(e.questState.active[def.classTsid]);
    assert.equal(withDocument(() => waitingOfferCards(e)).length, 0);
  });

  it('"Not right now" puts a startable quest off: one card, now with Try it', () => {
    const e = engine();
    const def = Object.values(getQuestCatalog()).find((d) => !d.isEmergency && offerCanWait(d));
    markOffered(e.questState, def.classTsid, 1000);
    const [card] = withDocument(() => waitingOfferCards(e));
    const later = card.find((n) => n.dataset?.questLater);
    assert.equal(later.textContent, def.declineLabel || 'Not right now');
    withDocument(() => later.click());
    assert.equal(e.data.questOfferResult, 'putoff');
    assert.equal(listDeclinedOffers(e.questState).length, 1);
    assert.equal(e.data.questOffersWaiting, '0');
    const after = withDocument(() => questOffersFeature.questLogCards(e));
    assert.equal(after.length, 1, 'never drawn twice');
    assert.equal(after[0].dataset.questWaiting, undefined);
    assert.equal(after[0].className, 'q-card q-put-off');
  });

  it('emergencies pop on the street and are neither counted nor drawn', () => {
    const e = engine();
    const em = Object.values(getQuestCatalog()).find((d) => d.isEmergency);
    if (!em) return;
    markOffered(e.questState, em.classTsid, 1000);
    assert.equal(withDocument(() => waitingOfferCards(e)).length, 0);
  });

  it('a quest put off and offered again is drawn once', () => {
    const e = engine();
    const def = Object.values(getQuestCatalog()).find((d) => !d.isEmergency && offerCanWait(d));
    markOffered(e.questState, def.classTsid, 1000);
    putOffOffer(e.questState, def.classTsid, 2000);
    markOffered(e.questState, def.classTsid, 3000);
    assert.equal(withDocument(() => questOffersFeature.questLogCards(e)).length, 1);
  });

  it('the log asks for these cards with the put-off ones, and "Show me one" still opens one offer', () => {
    const feature = readFileSync(join(PUBLIC, 'js/features/quest-offers-feature.js'), 'utf8');
    assert.match(feature, /return \[\.\.\.waitingOfferCards\(engine\), \.\.\.putOffCards\(engine\)\];/);
    assert.match(feature, /addEventListener\('click', \(\) => showWaitingOffer\(engine\)\)/);
  });
});
