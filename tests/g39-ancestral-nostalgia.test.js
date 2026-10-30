/**
 * G39 / G151 (Austin 2026-10-27): the Ancestral Lands' limited visit, the
 * Ancestral Nostalgia buffs, the kick, and the two Prepared For Ancestral
 * Nostalgia cards (js/ancestral-nostalgia.js, features/juju-bandits-feature.js).
 * Run: node --test tests/g39-ancestral-nostalgia.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOSTALGIA,
  NOSTALGIA_TEXT,
  buffLeftSeconds,
  giveBaqalaTime,
  nostalgiaLimitSeconds,
  pickBootTarget,
  resetBaqalaTimes,
} from '../public/js/ancestral-nostalgia.js';
import { NOSTALGIA_BOOT_STREETS } from '../public/js/ancestral-nostalgia-data.js';
import { BOOT_SOURCE_TSIDS, buildRows, render } from '../tools/build-ancestral-nostalgia.mjs';
import { ancestralClock, stealChanceForSeconds } from '../public/js/juju-bandits.js';
import { applyBuff, createBuffState, hasBuff, removeBuff } from '../public/js/buffs.js?v=g403-1';
import { getBuffCatalog, loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { IMAGINATION_UPGRADES, buildDeck, upgradeStatus } from '../public/js/imagination.js?v=g403-1';
import { isOfferedInRemake, remakeStatus } from '../public/js/imagination-remake.js?v=g403-1';
import { POTION_TEXT, ancestralCheck } from '../public/js/potions.js';
import { FEATURES } from '../public/js/features/index.js?v=registry-340';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'players/inc_special_locations.js'));
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');
const pub = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

describe('source numbers and copy', () => {
  it('the two buffs keep catalog_buffs.js names, text, durations and flags', () => {
    const buffs = getBuffCatalog();
    const a = buffs.ancestral_nostalgia;
    assert.equal(a.name, 'Overwhelming Ancestral Nostalgia');
    assert.equal(a.desc, 'You are overwhelmed by the weight of millions of years of history');
    assert.deepEqual([a.duration, a.isTimer, a.isOffline, a.isDebuff, a.itemClass], [600, true, false, false, null]);
    const t = buffs.too_much_nostalgia;
    assert.equal(t.name, 'Overwhelmed by Ancestral Nostalgia');
    assert.equal(t.desc, 'All that nostalgia was too much. You need a breather!');
    assert.deepEqual([t.duration, t.isTimer, t.isOffline, t.isDebuff, t.itemClass], [1800, true, true, true, null]);
    assert.equal(NOSTALGIA.baseSeconds, a.duration);
    assert.equal(NOSTALGIA.overwhelmedSeconds, t.duration);
  });

  it('10 minutes, 11 with Prepared I, 12 with Prepared II', () => {
    assert.equal(nostalgiaLimitSeconds([]), 600);
    assert.equal(nostalgiaLimitSeconds(['ancestral_lands_time_1']), 660);
    assert.equal(nostalgiaLimitSeconds(['ancestral_lands_time_1', 'ancestral_lands_time_2']), 720);
    assert.equal(buffLeftSeconds(585, []), 15, 'the 585 s grace leaves 15 s');
    assert.equal(buffLeftSeconds(585, ['ancestral_lands_time_1', 'ancestral_lands_time_2']), 135);
  });

  it('copies inc_special_locations.js, savanna.js, catalog_buffs.js, inc_imagination.js and the potion', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
    const loc = gsjs('players/inc_special_locations.js');
    assert.ok(loc.includes(`this.sendActivity("${NOSTALGIA_TEXT.enter}")`));
    assert.match(loc, /ancestral_lands_time_2"\)\) \{\s*this\.buffs_alter_time\('ancestral_nostalgia', -this\.baqala_times\.time_spent, 12\*60\)/);
    assert.match(loc, /ancestral_lands_time_1"\)\)\{\s*this\.buffs_alter_time\('ancestral_nostalgia', -this\.baqala_times\.time_spent, 11\*60\)/);
    assert.match(loc, /if\(!this\.buffs_has\('too_much_nostalgia'\)\) \{\s*this\.buffs_apply\('too_much_nostalgia'\);/);
    assert.match(loc, /\/\/ Reset times and do teleport:\s*this\.reset_baqala_times\(\);/);
    // The exit prompt's flag is never cleared (the callback tests it the wrong way round): once per player.
    assert.match(loc, /function overwhelmed_prompt_callback\(\) \{\s*if\(!this\['too_much_nostalgia_prompt'\]\) \{\s*delete this\['too_much_nostalgia_prompt'\];/);
    const sav = gsjs('locations/savanna.js');
    assert.ok(sav.includes(`txt: "${NOSTALGIA_TEXT.tooMuch}"`));
    assert.ok(sav.includes(`txt: "${NOSTALGIA_TEXT.kicked}"`));
    assert.equal((sav.match(/title: "Overwhelmed!"/g) || []).length, 2);
    assert.match(sav, /prompt_callback: 'do_baqala_boot'/);
    const cat = gsjs('items/catalog_buffs.js');
    assert.match(cat, /"ancestral_nostalgia" : \{[\s\S]*?ancestral_lands_time_2"\)\) \{\s*pc\.buffs_extend_time\("ancestral_nostalgia", 120\);[\s\S]*?ancestral_lands_time_1"\)\) \{\s*pc\.buffs_extend_time\("ancestral_nostalgia", 60\);[\s\S]*?on_remove\s*: function\(pc, args\)\{\s*pc\.check_baqala_boot\(\);/);
    assert.match(cat, /"too_much_nostalgia" : \{[\s\S]*?on_remove\s*: function\(pc, args\)\{\s*pc\.reset_baqala_times\(\);/);
    assert.match(gsjs('players/inc_imagination.js'), /ancestral_lands_time\/\.exec\(class_tsid\) && this\.buffs_has\("ancestral_nostalgia"\)\) \{\s*this\.buffs_extend_time\("ancestral_nostalgia", 60\);/);
    const potion = gsjs('items/potion_ancestral_spirits.js');
    assert.ok(potion.includes(`error: "${POTION_TEXT.ancestral}"`));
    assert.ok(potion.includes(`error: "${POTION_TEXT.ancestralOnce}"`));
    assert.match(potion, /pc\.give_baqala_time\(300\);\s*pc\.baqala_times\.potion_used = true;\s*return \{ok:1, msg: "Your nostalgia subsides somewhat\."\};/);
    assert.equal(POTION_TEXT.ancestralDone, 'Your nostalgia subsides somewhat.');
  });

  it('player copy has no em dashes', () => {
    for (const text of Object.values(NOSTALGIA_TEXT)) assert.ok(!/—/.test(text), text);
    for (const id of ['ancestral_lands_time_1', 'ancestral_lands_time_2']) assert.ok(!/—/.test(remakeStatus(id).note));
  });
});

describe('the clock and the buff (give_baqala_time, reset_baqala_times)', () => {
  it('give_baqala_time takes time off the clock, never past a full buff', () => {
    const c = ancestralClock({ spent: 100, inside: true });
    assert.equal(giveBaqalaTime(c, 40), 40);
    assert.equal(c.spent, 60);
    assert.equal(giveBaqalaTime(c, 300), 60, 'buffs_alter_time moves the start to now at most');
    assert.equal(c.spent, 0);
    assert.equal(giveBaqalaTime(ancestralClock({ spent: 100 }), 40, { active: false }), 0, 'no buff, nothing (give_baqala_time 129-131)');
  });

  it('reset_baqala_times starts the clock over', () => {
    const c = resetBaqalaTimes(ancestralClock({ spent: 590, inside: true, exitAt: 5, loggedOut: true }));
    assert.deepEqual(c, { spent: 0, inside: false, exitAt: null, loggedOut: false });
  });
});

describe('where the kick sends you (do_baqala_boot)', () => {
  it('lists the 26 prod streets in source order', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
    const src = gsjs('players/inc_special_locations.js');
    const list = [...src.slice(src.indexOf('config.is_prod')).matchAll(/"(L[A-Z0-9]{14})"/g)].map((m) => m[1]);
    assert.deepEqual(list, [...BOOT_SOURCE_TSIDS]);
    assert.equal(list.length, 26);
  });

  it('has every one imported with at least one way in, and the data file is current', () => {
    assert.equal(NOSTALGIA_BOOT_STREETS.length, 26);
    for (const row of NOSTALGIA_BOOT_STREETS) {
      assert.ok(existsSync(join(root, 'public/assets/streets', `${row.tsid}.json`)), row.tsid);
      assert.ok(row.arrivals.length >= 1, row.tsid);
      assert.ok(!['86', '90', '91', '95'].includes(row.hubId), `${row.label} is outside the Savanna`);
    }
    assert.equal(render(buildRows()), pub('js/ancestral-nostalgia-data.js'), 'node tools/build-ancestral-nostalgia.mjs');
  });

  it('picks a street, then one of its arrivals', () => {
    const t = pickBootTarget(NOSTALGIA_BOOT_STREETS, { streetRoll: 0, arrivalRoll: 0.99 });
    assert.equal(t.tsid, 'GHV17T973F42GEP');
    assert.deepEqual(t.arrive, { x: 5653, y: 763 });
    assert.equal(pickBootTarget(NOSTALGIA_BOOT_STREETS, { exists: () => false }), null);
  });
});

describe('the Prepared For Ancestral Nostalgia cards', () => {
  it('keep inc_data_imagination.js cost, chance and conditions and are dealt', () => {
    const one = IMAGINATION_UPGRADES.ancestral_lands_time_1;
    const two = IMAGINATION_UPGRADES.ancestral_lands_time_2;
    assert.equal(one.name, 'Prepared For Ancestral Nostalgia I');
    assert.equal(one.desc, 'Be prepared for the onset of the Ancestral Nostalgia: gain an extra minute to spend in the Ancestral lands (in the regions of Baqala, Xalanga, Choru or Zhambu).');
    assert.deepEqual([one.cost, one.chance, one.max_uses], [12000, 5, 1]);
    assert.deepEqual(one.conditions, [{ type: 6, quest_id: 'baqala_nostalgia' }, { type: 2, level: 18 }]);
    assert.equal(two.name, 'Prepared For Ancestral Nostalgia II');
    assert.equal(two.desc, 'Gain a second extra minute to spend in the Ancestral lands for a total of twelve glorious minutes.');
    assert.deepEqual([two.cost, two.chance, two.max_uses], [25000, 4, 1]);
    assert.deepEqual(two.conditions, [{ type: 3, imagination_id: 'ancestral_lands_time_1' }, { type: 2, level: 25 }]);
    for (const id of ['ancestral_lands_time_1', 'ancestral_lands_time_2']) assert.equal(isOfferedInRemake(id), true, id);
  });

  it('need Baqalic Caesura done and level 18, then the first card and level 25', () => {
    const ctx = (over) => ({ level: 18, owned: [], questsDone: ['baqala_nostalgia'], offerable: isOfferedInRemake, ...over });
    assert.equal(upgradeStatus('ancestral_lands_time_1', ctx({})).can_learn, true);
    assert.equal(upgradeStatus('ancestral_lands_time_1', ctx({ questsDone: [] })).can_learn, false);
    assert.equal(upgradeStatus('ancestral_lands_time_1', ctx({ level: 17 })).can_learn, false);
    assert.equal(upgradeStatus('ancestral_lands_time_2', ctx({ level: 25 })).can_learn, false);
    assert.equal(upgradeStatus('ancestral_lands_time_2', ctx({ level: 25, owned: ['ancestral_lands_time_1'] })).can_learn, true);
    const deck = buildDeck(ctx({}));
    assert.equal(deck.filter((c) => c.class_tsid === 'ancestral_lands_time_1').length, 5, 'chance 5');
    assert.ok(deck.every((c) => c.class_tsid !== 'ancestral_lands_time_1' || c.cost === 12000));
  });
});

describe('the visit, in the feature', () => {
  const feature = FEATURES.find((f) => f.id === 'juju-bandits');
  const street = (hubId) => ({ hubId, platforms: [], bounds: { l: 0, r: 3000, t: -1000, b: 0 } });
  const enter = (engine, s) => {
    engine.street = s;
    feature.onStreetClear(engine);
    feature.onStreetEnter(s, engine);
  };
  const makeEngine = ({ params = {}, owned = [] } = {}) => {
    const buffs = createBuffState();
    const data = {};
    const engine = {
      data,
      buffs,
      prompts: [],
      travels: [],
      activity: [],
      street: street('86'),
      inv: {},
      player: { x: 500, y: 0 },
      pc: { imaginationUpgrades: [...owned] },
      questState: { active: { help_juju_bandits: {} }, completed: [] },
      scene: false,
      dialogue: false,
      param: (k) => (k in params ? String(params[k]) : null),
      setData: (k, v) => { data[k] = String(v); },
      achievement() {},
      save() {},
      refreshPack() {},
      pushActivity: (t) => engine.activity.push(t),
      hasBuff: (id) => hasBuff(buffs, id, Date.now()),
      applyBuff: (id) => applyBuff(buffs, id, null, Date.now()),
      removeBuff: (id) => removeBuff(buffs, id, null, Date.now()),
      buffRow: (id) => (hasBuff(buffs, id, Date.now()) ? buffs.active[id] : null),
      prompt: (p) => { engine.prompts.push(p); return ''; },
      travel: async (tsid, meta) => {
        engine.travels.push({ tsid, ...meta });
        enter(engine, street('85'));
        return { ok: true };
      },
      streetExists: () => true,
      inScene: () => engine.scene,
      transientInstance: () => false,
      questDialogueOpen: () => engine.dialogue,
      acting: () => false,
    };
    return engine;
  };
  /** Run the ticker for `seconds` of play (1 s frames). */
  let clockNow = Date.now();
  const play = (engine, seconds) => {
    for (let i = 0; i < seconds; i += 1) {
      clockNow += 1000;
      feature.onTick(16, clockNow, engine);
    }
  };

  it('entering applies the buff with the source line; its time left follows the clock', () => {
    feature.restore(undefined);
    const engine = makeEngine();
    enter(engine, street('86'));
    // Entering stamps the real clock (trackRegion), so the fake clock starts after it: set first, a
    // millisecond's gap made the first 1 s tick short and the rounded-up time left read 501.
    clockNow = Date.now();
    play(engine, 2);
    assert.equal(engine.activity.at(-1), NOSTALGIA_TEXT.enter, 'start_baqala_buff sendActivity, after the arrival line');
    const row = engine.buffRow('ancestral_nostalgia');
    assert.ok(row, 'buff on');
    assert.equal(row.heldBy, 'ancestral-lands', 'not ended by hand');
    assert.equal(row.iconUrl, 'assets/ui/buff-none.svg');
    play(engine, 98);
    assert.equal(engine.data.nostalgiaLeft, '500');
    assert.equal(engine.data.nostalgiaState, 'inside');
    assert.ok(Math.abs(engine.buffRow('ancestral_nostalgia').expiresAt - clockNow - 500000) < 1500);
    // Walking out (leave_savanna) takes the buff away.
    enter(engine, street('56'));
    assert.equal(engine.hasBuff('ancestral_nostalgia'), false);
  });

  it('kicks you out at 10 minutes: Overwhelmed, the clock reset, one of the 26 streets, the exit prompt once', async () => {
    feature.restore(undefined);
    const engine = makeEngine();
    clockNow = Date.now();
    enter(engine, street('86'));
    play(engine, 590);
    assert.equal(engine.travels.length, 0);
    assert.ok(Number(engine.data.jujuStealChance) === 1, 'every payout brings a thief from 9 minutes');
    play(engine, 12);
    await flush();
    assert.equal(engine.travels.length, 1);
    const trip = engine.travels[0];
    const row = NOSTALGIA_BOOT_STREETS.find((r) => r.tsid === trip.tsid);
    assert.ok(row, trip.tsid);
    assert.ok(row.arrivals.some(([x, y]) => x === trip.arrive.x && y === trip.arrive.y));
    assert.equal(engine.hasBuff('ancestral_nostalgia'), false);
    assert.equal(engine.hasBuff('too_much_nostalgia'), true);
    assert.equal(engine.buffRow('too_much_nostalgia').heldBy, 'ancestral-lands');
    assert.equal(feature._state().clock.spent, 0);
    assert.equal(engine.data.jujuStealChance, '0');
    assert.equal(engine.prompts.length, 1);
    assert.deepEqual([engine.prompts[0].title, engine.prompts[0].text, engine.prompts[0].modal], ['Overwhelmed!', NOSTALGIA_TEXT.kicked, true]);
    assert.equal(feature._state().nostalgia.kicks, 1);

    // Back while overwhelmed: the other prompt; OK sends you away again (no clock, no buff).
    enter(engine, street('91'));
    assert.equal(engine.prompts.length, 2);
    assert.equal(engine.prompts[1].text, NOSTALGIA_TEXT.tooMuch);
    assert.equal(engine.hasBuff('ancestral_nostalgia'), false);
    assert.equal(feature._state().clock.inside, false);
    engine.prompts[1].onChoice('ok');
    play(engine, 1);
    await flush();
    assert.equal(engine.travels.length, 2);
    assert.equal(engine.prompts.length, 2, 'the exit prompt only ever shows once (too_much_nostalgia_prompt)');

    // too_much_nostalgia runs out (on_remove reset_baqala_times): a fresh 10 minutes.
    engine.buffs.active.too_much_nostalgia.expiresAt = Date.now() - 1;
    feature.onTick(16, clockNow, engine);
    assert.equal(feature._state().nostalgia.overwhelmed, false);
    enter(engine, street('86'));
    play(engine, 1);
    assert.equal(engine.data.nostalgiaLeft, '599');
    // The exit-prompt flag is saved.
    const saved = JSON.parse(JSON.stringify(feature.save()));
    assert.equal(saved.nostalgia.exitPromptShown, true);
    feature.restore(undefined);
  });

  it('waits while you are in a scene or a dialogue', async () => {
    feature.restore(undefined);
    const engine = makeEngine({ params: { nostalgiademo: 3 } });
    clockNow = Date.now();
    enter(engine, street('86'));
    assert.equal(engine.data.nostalgiaLeft, '3');
    engine.dialogue = true;
    play(engine, 5);
    await flush();
    assert.equal(engine.travels.length, 0);
    assert.equal(engine.data.nostalgiaState, 'booting');
    engine.dialogue = false;
    play(engine, 1);
    await flush();
    assert.equal(engine.travels.length, 1);
    feature.restore(undefined);
  });

  it('the cards lengthen the buff, not the clock, so the thief keeps coming past 9 minutes', () => {
    feature.restore(undefined);
    const engine = makeEngine({ params: { jujutime: 590 } });
    clockNow = Date.now();
    enter(engine, street('86'));
    assert.equal(engine.data.nostalgiaLeft, '10');
    // Buying Prepared I mid-visit: +60 s (inc_imagination.js 175-176).
    engine.pc.imaginationUpgrades.push('ancestral_lands_time_1');
    play(engine, 1);
    assert.equal(engine.data.nostalgiaLeft, '69');
    engine.pc.imaginationUpgrades.push('ancestral_lands_time_2');
    play(engine, 1);
    assert.equal(engine.data.nostalgiaLimit, '720');
    assert.equal(engine.data.nostalgiaLeft, '128');
    play(engine, 100);
    assert.equal(engine.travels.length, 0, 'still here at 11.5 minutes');
    assert.equal(stealChanceForSeconds(feature._state().clock.spent), 1);
    feature.restore(undefined);
  });

  it('Dust Trap remnants and Ancestral Spirits put time back (once a visit for the potion)', () => {
    feature.restore(undefined);
    const engine = makeEngine({ params: { jujutime: 400 } });
    clockNow = Date.now();
    enter(engine, street('86'));
    assert.equal(feature.giveBaqalaTime(40, engine), 40);
    assert.equal(engine.data.nostalgiaLeft, '240');
    assert.equal(engine.data.jujuStealChance, '0.25', '6:00 on the clock');
    assert.deepEqual(ancestralCheck(feature.ancestralSpiritsState(engine)), { ok: true });
    assert.equal(feature.ancestralSpiritsQuaff(engine), 300);
    assert.equal(engine.data.nostalgiaLeft, '540');
    assert.equal(engine.data.nostalgiaPotion, '1');
    assert.equal(engine.data.jujuStealChance, '0', 'a minute on the clock: no thief yet');
    assert.equal(ancestralCheck(feature.ancestralSpiritsState(engine)).error, POTION_TEXT.ancestralOnce);
    assert.equal(feature.ancestralSpiritsQuaff(engine), null);
    // Outside the Savanna: no buff, so nothing (give_baqala_time returns early) and the potion refuses.
    enter(engine, street('56'));
    assert.equal(feature.giveBaqalaTime(40, engine), 0);
    assert.equal(ancestralCheck(feature.ancestralSpiritsState(engine)).error, POTION_TEXT.ancestral);
    // The next visit may drink again (leave_savanna forgets potion_used).
    enter(engine, street('86'));
    assert.deepEqual(ancestralCheck(feature.ancestralSpiritsState(engine)), { ok: true });
    feature.restore(undefined);
  });

  it('&nostalgiademo=overwhelmed starts on the entry prompt', async () => {
    feature.restore(undefined);
    const engine = makeEngine({ params: { nostalgiademo: 'overwhelmed' } });
    enter(engine, street('86'));
    assert.equal(engine.hasBuff('too_much_nostalgia'), true);
    assert.equal(engine.prompts.at(-1).text, NOSTALGIA_TEXT.tooMuch);
    assert.equal(engine.data.nostalgiaState, 'overwhelmed');
    feature.restore(undefined);
  });
});

describe('wiring', () => {
  it('the potion, the Dust Trap and the tray icon reach the feature', () => {
    const potions = pub('js/features/potions-feature.js');
    assert.match(potions, /engine\.query\?\.\('ancestralSpiritsState', engine\)/);
    assert.match(potions, /engine\.query\?\.\('ancestralSpiritsQuaff', engine\)/);
    assert.match(pub('js/features/resource-nodes-feature.js'), /engine\.query\?\.\('giveBaqalaTime', result\.baqalaSeconds, engine\)/);
    assert.match(pub('game.js'), /if \(row\?\.iconUrl\) return row\.iconUrl;/);
    assert.ok(existsSync(join(root, 'public/assets/ui/buff-none.svg')));
    const feature = pub('js/features/juju-bandits-feature.js');
    assert.match(feature, /applyBuff\('ancestral_nostalgia'/);
    assert.match(feature, /applyBuff\?\.\('too_much_nostalgia'/);
  });
});
