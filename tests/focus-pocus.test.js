/**
 * Focus Pocus (quests/focusedmeditation_get_mood_or_energy.js r160, flag
 * meditation_24_mood_energy) through the real Focusing Orb verbs: Focus energy
 * and Focus mood on the meditation feature, the timer end, the quest router.
 *
 * The source rule (items/focusing_orb.js endFocusedMeditation 822-836): the
 * flag is set when the energy or mood that one focus actually added (what
 * metabolics_add_energy / _mood returned after the tank clamp,
 * players/inc_metabolics.js 55-76) is 24 or more. Gains never add up across
 * focuses, and a focus at a full tank adds, and counts, nothing.
 *
 * Run: node --test tests/focus-pocus.test.js
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=2ce7b3cb';
import { acceptOffer, routeQuestEvent } from '../public/js/quest-offers.js?v=33c0e39f';
import { createInventory } from '../public/js/inventory.js?v=d82f3b00';
import { createToolConditionState } from '../public/js/tools.js?v=6684b484';
import { setMetabolicGainGate } from '../public/js/metabolics.js?v=8504134e';
import {
  FOCUS_POCUS_FLAG,
  FOCUS_POCUS_NEED,
  FOCUS_POCUS_QUEST,
  bestFocusGain,
  focusPocusHint,
} from '../public/js/meditation.js?v=380b2f3f';
import { meditationFeature } from '../public/js/features/meditation-feature.js?v=dee100f0';

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(here, '../public/assets/content');
const MA1 = ['meditativearts_1', 'focused_meditation_1'];
const MA2 = ['meditativearts_1', 'meditativearts_2', 'focused_meditation_1'];
const MA3 = ['meditativearts_1', 'meditativearts_2', 'meditativearts_3', 'focused_meditation_1'];

/** Just enough Pixi for the orb overlay (buildMeditationFx) in Node. */
class Obj {
  constructor() {
    this.children = [];
    this.anchor = { set() {} };
    this.position = { set() {} };
  }
  addChild(c) { this.children.push(c); return c; }
  removeChild() {}
  destroy() {}
  play() {}
}
const PIXI = {
  Container: Obj,
  AnimatedSprite: Obj,
  Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } },
  ImageSource: class { on() {} emit() {} },
  Texture: class { constructor(o) { Object.assign(this, o); } },
};

function playerOn(quest = true, { learned = MA3, pc = {}, roll = '0.9999' } = {}) {
  const questState = createQuestState();
  if (quest) assert.equal(acceptOffer(questState, FOCUS_POCUS_QUEST, { inv: {}, now: 1 }).ok, true);
  const calls = { activity: [], completable: [], events: [] };
  const engine = {
    PIXI,
    started: true,
    questState,
    pc: { energy: 0, mood: 0, xp: 0, imagination: 0, energyMax: 100, imaginationUpgrades: [], ...pc },
    inv: createInventory({ focusing_orb: 1 }),
    toolState: createToolConditionState(),
    learnedSkills: learned,
    player: { x: 500, y: 400, vx: 0, vy: 0, onGround: true, pivot: { y: 0 }, height: 96 },
    street: { label: 'Gregarious Grange' },
    streetTsid: 'GLI32G3NUTD100I',
    fxLayer: new Obj(),
    param: (k) => (k === 'meditateroll' ? roll : null),
    setData() {},
    toast() {},
    pushActivity: (t) => calls.activity.push(t),
    floatText() {},
    updateHud() {},
    save() {},
    // The engine hands quest counters to features/quest-offers-feature.js onEvent.
    achievement: (counter, amount) => {
      calls.events.push([counter, amount]);
      const res = routeQuestEvent(questState, counter, amount, { now: 2 });
      calls.completable.push(...res.completable.map((c) => c.classTsid));
    },
    transientInstance: () => false,
    acting: () => false,
    busy: () => false,
    playCue: () => Promise.resolve(() => {}),
  };
  return { engine, calls };
}

/** Press the verb, then let the orb's timer run out. */
function focus(engine, verb) {
  meditationFeature.restore({});
  assert.equal(meditationFeature.runPackVerb('focusing_orb', verb, engine), true);
  meditationFeature.onTick(16, Date.now() + 120_000, engine);
  return meditationFeature._state();
}

const progress = (engine) => engine.questState.active[FOCUS_POCUS_QUEST]?.progress?.[FOCUS_POCUS_FLAG] || 0;
const done = (calls) => calls.completable.includes(FOCUS_POCUS_QUEST);

let prevPixi;
before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(CONTENT);
});
beforeEach(() => {
  prevPixi = globalThis.PIXI;
  globalThis.PIXI = PIXI;
  meditationFeature._mpReset?.();
  meditationFeature.restore({});
});
afterEach(() => {
  globalThis.PIXI = prevPixi;
  setMetabolicGainGate(null);
});

describe('Focus Pocus: the quest step', () => {
  it('reads as one focus, the way the quest desc says "in one try"', () => {
    const quests = JSON.parse(readFileSync(join(CONTENT, 'quests.json'), 'utf8'));
    const def = (quests.quests || quests)[FOCUS_POCUS_QUEST];
    assert.deepEqual(def.requirements.map((r) => [r.type, r.name, r.num, r.desc]), [
      ['flag', FOCUS_POCUS_FLAG, 1, 'Focus your meditation to gain 24 mood or energy in a single focus'],
    ]);
    assert.match(def.desc, /in one try/);
    assert.doesNotMatch(def.requirements[0].desc, /—|Glitch/);
  });
});

describe('Focus Pocus through the Focusing Orb verbs', () => {
  it('Focus energy that adds 24 or more completes it', () => {
    const { engine, calls } = playerOn(true, { learned: MA3 });
    focus(engine, 'focus_energy');
    // 1.5/s x 25 s = 37.5, +10% full effect = 41.
    assert.equal(engine.pc.energy, 41);
    assert.ok(calls.events.some(([c]) => c === 'meditation_gain_24'));
    assert.equal(progress(engine), 1);
    assert.ok(done(calls));
  });

  it('Focus mood that adds 24 or more completes it', () => {
    const { engine, calls } = playerOn(true, { learned: MA3 });
    focus(engine, 'focus_mood');
    assert.equal(engine.pc.mood, 41);
    assert.equal(engine.pc.energy, 0);
    assert.ok(done(calls));
  });

  it('gains never add up: two focuses of 17 leave it at 0 of 1 (Meditative Arts I, tank 100)', () => {
    const { engine, calls } = playerOn(true, { learned: MA1 });
    focus(engine, 'focus_energy');
    focus(engine, 'focus_mood');
    // 0.75/100 x 100 x 2 = 1.5/s x 11 s = 16.5, +4% = 17.16.
    assert.equal(engine.pc.energy, 17);
    assert.equal(engine.pc.mood, 17);
    assert.equal(progress(engine), 0);
    assert.equal(done(calls), false);
    assert.ok(!calls.events.some(([c]) => c === 'meditation_gain_24'));
    // The player is told why, and what gets them there.
    const hint = calls.activity.filter((l) => l.startsWith('Focus Pocus'));
    assert.equal(hint.length, 2);
    assert.match(hint[0], /needs 24 energy from a single focus, and right now the most one focus can give you is 17\./);
    assert.match(hint[0], /Meditative Arts II makes a focus last longer/);
    assert.match(hint[1], /24 mood/);
  });

  it('at or near a full tank only the room counts (energy 90 of 100 adds 10: no flag)', () => {
    const { engine, calls } = playerOn(true, { learned: MA3, pc: { energy: 90, mood: 100 } });
    focus(engine, 'focus_energy');
    assert.equal(engine.pc.energy, 100);
    assert.equal(done(calls), false);
    assert.match(calls.activity.at(-1), /counts only the energy you actually gain, and you had room for just 10 more\. Focus again when your energy is at least 24 below full\./);
    // A full mood tank: nothing added, nothing counted.
    focus(engine, 'focus_mood');
    assert.equal(engine.pc.mood, 100);
    assert.equal(done(calls), false);
    assert.match(calls.activity.at(-1), /room for just 0 more/);
  });

  it('Austin on Gregarious Grange: energy 100 of a 150 tank at Meditative Arts I tops out at 23', () => {
    const { engine, calls } = playerOn(true, { learned: MA1, pc: { energy: 100, mood: 105, energyMax: 150 } });
    focus(engine, 'focus_energy');
    assert.equal(engine.pc.energy, 123);
    assert.equal(done(calls), false);
    assert.match(calls.activity.at(-1), /the most one focus can give you is 23\./);
    // Meditative Arts II: the same tank pays 37 on the longest roll and completes it.
    const two = playerOn(true, { learned: MA2, pc: { energy: 100, mood: 105, energyMax: 150 } });
    focus(two.engine, 'focus_energy');
    assert.equal(two.engine.pc.energy, 137);
    assert.ok(done(two.calls));
  });

  it('a short roll says what the long ones give', () => {
    const { engine, calls } = playerOn(true, { learned: MA2, roll: '0' });
    focus(engine, 'focus_energy');
    // Focus always uses the x2.0 skill multiplier: 1.5/s x 5 s = 7.5, +7% = 8.
    assert.equal(engine.pc.energy, 8);
    assert.equal(done(calls), false);
    assert.match(calls.activity.at(-1), /that one gave 8\. A focus lasts a random time and the longest give up to 27, so hold still and try again\./);
  });

  it('a player already stuck on 0 of 1 completes it on their next focus of 24+', () => {
    const { engine, calls } = playerOn(true, { learned: MA1 });
    focus(engine, 'focus_energy');
    assert.equal(progress(engine), 0);
    engine.learnedSkills = MA2;
    engine.pc.energy = 0;
    focus(engine, 'focus_energy');
    assert.ok(done(calls));
  });

  it('a gain the Super Pooped gate refused sets no flag (metabolics_add_energy returned 0)', () => {
    setMetabolicGainGate((stat) => (stat === 'energy' ? { ok: false, msg: "You would have gained energy, but you're super pooped!" } : null));
    const { engine, calls } = playerOn(true, { learned: MA3 });
    focus(engine, 'focus_energy');
    assert.equal(engine.pc.energy, 0);
    assert.ok(!calls.events.some(([c]) => c === 'meditation_gain_24'));
    assert.equal(done(calls), false);
  });

  it('says nothing about Focus Pocus off the quest, or once a focus reached 24', () => {
    const off = playerOn(false, { learned: MA1 });
    focus(off.engine, 'focus_energy');
    assert.ok(!off.calls.activity.some((l) => l.startsWith('Focus Pocus')));
    const on = playerOn(true, { learned: MA3 });
    focus(on.engine, 'focus_energy');
    assert.ok(!on.calls.activity.some((l) => l.startsWith('Focus Pocus')));
  });
});

describe('Focus Pocus: the best one focus can do', () => {
  it('matches the source formula at the edges (getTankMultiplier x tank x 2.0 x seconds, + bonus_amount%)', () => {
    assert.equal(bestFocusGain({ learned: MA1, tank: 100 }), 17);
    assert.equal(bestFocusGain({ learned: MA1, tank: 150 }), 23);
    assert.equal(bestFocusGain({ learned: MA1, tank: 160 }), 24);
    assert.equal(bestFocusGain({ learned: MA2, tank: 100 }), 27);
    assert.equal(bestFocusGain({ learned: MA3, tank: 100 }), 41);
    assert.equal(bestFocusGain({ learned: [], tank: 100 }), 0);
    // Double Max Relax doubles a roll that lands on duration_max.
    assert.equal(bestFocusGain({ learned: MA1, tank: 100, upgrades: ['meditative_arts_max_relax'] }), 34);
    assert.ok(FOCUS_POCUS_NEED === 24);
  });

  it('agrees with a real longest focus from an empty tank', () => {
    for (const [learned, tank] of [[MA1, 100], [MA1, 150], [MA2, 130], [MA3, 300]]) {
      const { engine } = playerOn(false, { learned, pc: { energyMax: tank } });
      focus(engine, 'focus_energy');
      assert.equal(engine.pc.energy, bestFocusGain({ learned, tank }), `${learned.at(-2)} tank ${tank}`);
    }
  });

  it('hint copy: plain words, no em dashes, never the old game name', () => {
    const lines = [
      focusPocusHint({ focus: 'energy', gained: 17, room: 100, best: 17, learned: MA1 }),
      focusPocusHint({ focus: 'mood', gained: 20, room: 100, best: 23, learned: MA2 }),
      focusPocusHint({ focus: 'mood', gained: 10, room: 10, best: 41, learned: MA3 }),
      focusPocusHint({ focus: 'energy', gained: 8, room: 100, best: 27, learned: MA2 }),
    ];
    for (const l of lines) assert.doesNotMatch(l, /—|Glitch/);
    assert.match(lines[1], /Meditative Arts III/);
    assert.equal(focusPocusHint({ focus: 'energy', gained: 24, room: 100, best: 41 }), null);
  });
});
