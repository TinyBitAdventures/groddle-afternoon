// G213 prompt follow-ups: one door for energy and mood gains (Super Pooped, dead),
// one-choice source prompts, speakerless location VOGs, Pooped in the buffs
// tray, and a quest offer check that waits out an award screen the card held.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { metabolicGain, setMetabolicGainGate } from '../public/js/metabolics.js';
import { applyRewards, createQuestState } from '../public/js/quests.js';
import { collectQuoin, createQuoinState, creditQuoinStat } from '../public/js/quoins.js';
import { HELL_TEXT, metabolicGate, normalizeHellState } from '../public/js/hell.js';
import { questOffersFeature } from '../public/js/features/quest-offers-feature.js?v=offers-11';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const gsjs = join(here, '../../glitch-GameServerJS');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');
const game = read('game.js');

/** The hell feature's gate over a hell state, as game.js installs it. */
function gateFor(hell) {
  return (stat) => {
    const g = metabolicGate(hell, stat, 'gain', Date.now());
    return g.allowed ? { ok: true } : { ok: false, msg: g.text };
  };
}
const superPooped = () => normalizeHellState({ pooped: { kind: 'super_pooped', appliedAt: Date.now() - 1000, expiresAt: Date.now() + 3_600_000 } });
const dead = () => normalizeHellState({ isDead: true });

afterEach(() => setMetabolicGainGate(null));

describe('what the source does', () => {
  it('metabolics_add_energy refuses while dead or Super Pooped; add_mood only while dead; try_inc has no callers', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'players/inc_metabolics.js'), 'utf8');
    const addEnergy = src.slice(src.indexOf('function metabolics_add_energy'), src.indexOf('function metabolics_add_mood'));
    assert.match(addEnergy, /if \(this\.is_dead\)\{[\s\S]{0,140}You would have gained energy, but you're dead!/);
    assert.match(addEnergy, /else if \(this\.buffs_has\('super_pooped'\)\)\{[\s\S]{0,140}You would have gained energy, but you're super pooped!/);
    assert.equal(HELL_TEXT.superPoopedEnergyGain, "You would have gained energy, but you're super pooped!");
    const addMood = src.slice(src.indexOf('function metabolics_add_mood'), src.indexOf('function metabolics_try_lose_energy'));
    assert.match(addMood, /is_dead/);
    assert.doesNotMatch(addMood, /super_pooped/);
    // quoin.js credits through metabolics_add_energy / _mood.
    const quoin = readFileSync(join(gsjs, 'items/quoin.js'), 'utf8');
    assert.match(quoin, /actual = players\[i\]\.pc\.metabolics_add_energy\(final_amount\);/);
    assert.match(quoin, /if \(this\.instanceProps\.type == 'energy'\) var actual = pc\.metabolics_add_energy\(amount\);/);
  });

  it('a prompt shows one button per choice and nothing else', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const view = readFileSync(join(client, 'view/gameoverlay/PromptView.as'), 'utf8');
    assert.match(view, /for \(i=prompt\.choices\.length-1;i>-1;i--\) \{\s*if\(prompt\.choices\.length == 1\)\{\s*bt_type = Button\.TYPE_SINGLE;/);
  });

  it('a location VOG is a speakerless, locking, click-to-advance overlay', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'locations/inc_events.js'), 'utf8');
    const vog = src.slice(src.indexOf('function events_VOGPlayer'), src.indexOf('function events_VOGPlayer') + 1600);
    assert.match(vog, /type: "vp_overlay"/);
    assert.match(vog, /locking: true/);
    assert.match(vog, /click_to_advance: true/);
    assert.doesNotMatch(vog, /npc|speaker|label/);
  });

  it('Pooped and Super Pooped are timed buffs to the next game day', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'players/inc_metabolics.js'), 'utf8');
    assert.match(src, /this\.buffs_apply\('super_pooped', \{duration: remaining\}\);/);
    assert.match(src, /this\.buffs_apply\('pooped', \{duration: remaining\}\);/);
  });
});

describe('the gain door (js/metabolics.js)', () => {
  it('lets everything through until a gate is installed', () => {
    assert.deepEqual(metabolicGain('energy'), { ok: true, msg: null });
    assert.deepEqual(metabolicGain('xp'), { ok: true, msg: null });
  });

  it('Super Pooped: quest and badge rewards keep the iMG and currants but not the energy', () => {
    setMetabolicGainGate(gateFor(superPooped()));
    const pc = { energy: 10, energyMax: 200, mood: 50, xp: 0, imagination: 0, currants: 0 };
    applyRewards(pc, { energy: 50, mood: 20, xp: 100, currants: 30 });
    assert.equal(pc.energy, 10, 'no energy');
    assert.equal(pc.mood, 70, 'mood still lands');
    assert.equal(pc.xp, 100);
    assert.equal(pc.currants, 30);
  });

  it('dead: neither energy nor mood lands', () => {
    setMetabolicGainGate(gateFor(dead()));
    const pc = { energy: 0, energyMax: 100, mood: 0 };
    applyRewards(pc, { energy: 50, mood: 20 });
    assert.equal(pc.energy, 0);
    assert.equal(pc.mood, 0);
  });

  it('an energy quoin still counts toward the day but gives +0, and says why', () => {
    const said = [];
    setMetabolicGainGate((stat, opts) => {
      const g = gateFor(superPooped())(stat);
      if (!g.ok && !opts?.quiet) said.push(g.msg);
      return g;
    });
    const state = createQuoinState();
    const pc = { energy: 5, energyMax: 100, mood: 50, level: 5 };
    const r = collectQuoin(state, 'energy', pc);
    assert.equal(r.ok, true);
    assert.equal(r.actual, 0);
    assert.equal(r.blocked, HELL_TEXT.superPoopedEnergyGain);
    assert.equal(pc.energy, 5);
    assert.equal(state.collectedToday, 1, 'the quoin is spent');
    assert.deepEqual(said, [HELL_TEXT.superPoopedEnergyGain]);
    // A mood quoin is not Super Pooped's business.
    assert.ok(collectQuoin(state, 'mood', pc).actual > 0);
  });

  it('an energy shard is refused too', () => {
    setMetabolicGainGate(gateFor(superPooped()));
    const pc = { energy: 5, energyMax: 100 };
    assert.equal(creditQuoinStat(pc, 'energy', 6), 0);
    assert.equal(pc.energy, 5);
    setMetabolicGainGate(null);
    assert.equal(creditQuoinStat(pc, 'energy', 6), 6);
  });

  it('game.js installs the feature host gate and sends the line unless quiet', () => {
    assert.match(game, /setMetabolicGainGate\(\(stat, \{ quiet = false \} = \{\}\) => \{\s*const gate = features\.metabolicGate\(stat, 'gain', engine\);\s*if \(gate\?\.ok === false && !quiet && gate\.msg\) pushActivity\(gate\.msg\);/);
    // The Paradise ticket was already gated (8feae470).
    assert.match(game, /eatParadiseTicket\(\{ count: 1, energyAllowed: energyGate\.ok !== false \}\)/);
  });
});

describe('prompts, VOGs and the buffs tray', () => {
  it('engine.prompt: one choice is one button with no Close; two choices can be cancelled', () => {
    const body = game.slice(game.indexOf('  prompt({ title = '), game.indexOf('  /** Enter the Museum of the Rook instance'));
    assert.match(body, /cancelable: list\.length > 1,/);
    assert.match(body, /response: list\[0\]\?\.label \|\| 'OK'/);
    assert.doesNotMatch(body, /cancelable: true/);
  });

  it('a location VOG has no speaker, no Close and no quest sound', () => {
    const src = read('js/features/location-events-feature.js');
    const vog = src.slice(src.indexOf("case 'vog': {"), src.indexOf("case 'activity':"));
    // G228: its own overlay (js/vog-overlay.js), not the quest card.
    assert.match(vog, /engine\.vog\?\.\(\{ lines: fx\.lines, onComplete: next \}\);/);
    assert.doesNotMatch(vog, /scriptedDialogue|offerQuestDialogue|declineLabel|cancelable/);
    assert.match(game, /kicker\.hidden = questDialogueState\.kicker === null;/);
  });

  it('buff-triggers mirrors Pooped and Super Pooped from the hell state, quietly', () => {
    const src = read('js/features/buff-triggers-feature.js');
    assert.match(src, /import \{ hellFeature \} from '\.\/hell-feature\.js\?v=hell-14';/);
    assert.match(read('js/features/index.js'), /hell-feature\.js\?v=hell-14/);
    assert.match(src, /'pooped',\s*'super_pooped',\s*\]\);/);
    assert.match(src, /const QUIET_MIRRORS = new Set\(\['pooped', 'super_pooped'\]\);/);
    assert.match(src, /mirror\(engine, kind, poopedKind === kind \? Number\(hell\.pooped\?\.expiresAt\) \|\| 0 : 0\);/);
  });

  it('a debuff with no item shows the bang, and a held buff has no End button', () => {
    assert.ok(existsSync(join(pub, 'assets/ui/buff-debuff.svg')));
    assert.match(game, /return row\?\.def\?\.isDebuff \? 'assets\/ui\/buff-debuff\.svg' : 'assets\/sprites\/icons\/apple\.png';/);
    assert.match(game, /if \(!b\.heldBy\) \{\s*const btn = document\.createElement\('button'\);/);
    const catalog = JSON.parse(read('assets/content/buffs.json'));
    for (const id of ['pooped', 'super_pooped']) {
      assert.equal(catalog[id].isDebuff, true, id);
      assert.equal(catalog[id].itemClass, null, id);
    }
  });
});

describe('a quest offer check and the award screen the card held', () => {
  function offerEngine() {
    const log = { busy: 0, presented: 0 };
    return {
      started: true,
      log,
      cardUp: false,
      screenUp: false,
      pc: { level: 5, xp: 0, energy: 50, energyMax: 100 },
      inv: {},
      learnedSkills: [],
      unlockedAchievements: [],
      shrineState: {},
      questState: createQuestState(),
      street: { tsid: 'GLI2V0UN7RD1T2J', hubId: '56', label: 'Hechey Track' },
      streetTsid: 'GLI2V0UN7RD1T2J',
      param: () => null,
      activeBuffIds: () => [],
      streetCardUp() { return this.cardUp; },
      screenFxScreenUp() { return this.screenUp; },
      busy() {
        log.busy += 1;
        return true;
      },
      questOffersHeld: () => false,
      questDialogueOpen: () => false,
      setData() {},
      updateHud() {},
      save() {},
      pushActivity() {},
    };
  }

  it('looks again every second while the screen is up, then the 30 s cadence', () => {
    const engine = offerEngine();
    questOffersFeature.init(engine);
    const t0 = Date.now();
    questOffersFeature.onStreetEnter(engine.street, engine);
    engine.cardUp = true;
    questOffersFeature.onTick(16, t0 + 5000, engine);
    engine.cardUp = false;
    engine.screenUp = true; // the held award screen shows as the card goes
    questOffersFeature.onTick(16, t0 + 5100, engine);
    assert.equal(engine.log.busy, 0, 'not opened over the screen, not spent');
    questOffersFeature.onTick(16, t0 + 5600, engine);
    assert.equal(engine.log.busy, 0);
    questOffersFeature.onTick(16, t0 + 6200, engine);
    assert.equal(engine.log.busy, 0, 'still up: looks again in a second');
    engine.screenUp = false;
    questOffersFeature.onTick(16, t0 + 7300, engine);
    assert.equal(engine.log.busy, 1, 'the screen has gone: the check runs');
    questOffersFeature.onTick(16, t0 + 8500, engine);
    assert.equal(engine.log.busy, 1, 'busy for another reason: back to 30 s');
    questOffersFeature.onTick(16, t0 + 37400, engine);
    assert.equal(engine.log.busy, 2);
  });

  it('queued award screens count as up (game.js)', () => {
    assert.match(game, /awardsPending \+= 1;/);
    assert.match(game, /\.finally\(\(\) => \{\s*awardsPending = Math\.max\(0, awardsPending - 1\);/);
    assert.match(game, /function isAwardScreenUp\(\) \{\s*if \(awardsPending > 0\) return true;/);
    assert.match(game, /screenFxScreenUp: \(\) => isAwardScreenUp\(\),/);
  });
});
