// Ticket 39 (2026-11-02): after the Hell Hole, Bellzebooze's offer came back again and again and its X
// seemed not to close it. The quest-complete screen was fading out, so the game held the card; the feature
// read "not open" as "closed unanswered" and offered it again every frame, ~19 copies to click through.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hellTicketsFeature } from '../public/js/features/hell-tickets-feature.js?v=e7184424';
import { hellFeature } from '../public/js/features/hell-feature.js?v=93f1c8dd';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A fake engine whose quest card is held while a screen is up, as game.js holdScriptedDialog does. */
function fadingScreenEngine(qs) {
  const s = { held: [], open: null, screenUp: true, asked: 0 };
  s.engine = {
    started: true, questState: qs, inv: {}, pc: { level: 1 }, learnedSkills: [], streetTsid: 'LA5PV4T79OE2AOA', street: { hubId: '40' },
    param: () => null, setData() {}, save() {}, refreshPack() {}, pushActivity() {}, playSound() {}, prompt() {}, toast() {}, query() {},
    busy: () => Boolean(s.open),
    questDialogueOpen: () => Boolean(s.open),
    questDialogueDismissedAt: () => 0,
    questOfferHeld: (title) => s.held.some((h) => h.title === title),
    offerQuestDialogue(opts) {
      s.asked += 1;
      if (s.screenUp && !s.open) {
        // game.js holdScriptedDialog: the same offer takes the waiting one's place.
        const at = s.held.findIndex((h) => h.title === opts.title);
        if (at >= 0) s.held[at] = opts;
        else s.held.push(opts);
      } else s.open = opts;
    },
  };
  return s;
}

describe('Bellzebooze waits behind a fading screen as one card (ticket 39)', () => {
  it('a 0.3 s fade holds one offer, and one accept starts the quest', async () => {
    await loadContentCatalogsFromDir(path.join(root, 'public/assets/content'));
    hellFeature.restore({ isDead: true, croakedAt: Date.now(), croakDayKey: 'x', visitId: 1, deathsToday: 1 });
    hellTicketsFeature.restore({ plannedVisitId: 1, holeHinted: true });
    const qs = { active: {}, completed: ['hell_hole'], offers: {} };
    const s = fadingScreenEngine(qs);
    hellTicketsFeature.onStreetEnter({}, s.engine);
    let now = Date.now() + 2100;
    for (let f = 0; f < 19; f += 1) {
      hellTicketsFeature.onTick(16, now, s.engine);
      now += 16;
    }
    assert.equal(s.held.length, 1, 'one card waits, not one per frame');
    assert.equal(s.asked, 1, 'the feature asks once while the card waits');
    s.screenUp = false;
    s.open = s.held.shift();
    const o = s.open;
    s.open = null;
    o.onComplete ? o.onComplete() : o.onAccept();
    for (let f = 0; f < 5; f += 1) {
      hellTicketsFeature.onTick(16, now, s.engine);
      now += 16;
    }
    assert.ok(qs.active.hell_quest, 'accepted on the first click');
    assert.equal(s.held.length + (s.open ? 1 : 0), 0, 'nothing comes back');
  });

  it('the game keeps one held copy of an offer and tells features it is waiting', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    assert.match(game, /const same = opts\.offer \? heldScriptedDialogs\.findIndex\(\(held\) => held\?\.offer && held\.title === opts\.title\) : -1;/);
    assert.match(game, /questOfferHeld: \(title\) => heldScriptedDialogs\.some\(/);
    const feature = fs.readFileSync(path.join(root, 'public/js/features/hell-tickets-feature.js'), 'utf8');
    assert.match(feature, /if \(offerOpen && !engine\.questDialogueOpen\(\) && !engine\.questOfferHeld\?\.\(offerOpen\.title\)\)/);
  });
});
