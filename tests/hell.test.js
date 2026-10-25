/**
 * Croaking, Hell One grape penance, resurrection, Pooped, and hell quests.
 * Run: node --test tests/hell.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_LOCATION,
  GRAPES_REQUIRED,
  HELL_ACHIEVEMENTS,
  HELL_BUFFS,
  HELL_ITEMS,
  HELL_LOCATION,
  HELL_MUSIC,
  HELL_ONE_GRAPES,
  HELL_ONE_PLATFORMS,
  HELL_QUESTS,
  HELL_SOUNDS,
  HELL_SPRITES,
  HELL_TEXT,
  HOME_TSIDS,
  NARAKA_STREETS,
  achievementEventsFrom,
  canResurrect,
  canTeleport,
  checkLowEnergyWarning,
  checkPooped,
  createHellState,
  croak,
  deathsTodayFor,
  drinkWineOfTheDead,
  energyConsumedTodayFor,
  enforceHellOnEnter,
  ensureHellItems,
  graveMarkerPhase,
  hellEntryPrompt,
  hellHoleFlagForStreet,
  hellHoleOfferText,
  hellNewDay,
  hellPhysics,
  hellQuestOffer,
  isInHell,
  isInHellOne,
  metabolicGate,
  normalizeHellState,
  noteEnergyConsumed,
  noteNarakaVisit,
  onEnergyGained,
  planHellGrapes,
  recognizeDeath,
  remainingGrapes,
  resolveReloadLocation,
  resurrect,
  shouldCroak,
  shouldWarnLowEnergy,
  squishGrape,
  wineDrinkConditions,
} from '../public/js/hell.js';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=catalog-unified-6';
import { GAME_DAY_MS, getGameDayKey, getGameDayStartMs } from '../public/js/game-day.js?v=dametime-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';
import {
  applyAchievementProgress,
  createAchievementState,
} from '../public/js/achievements.js?v=badge-events-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const locationData = join(here, '../../streets/mnt/stos/location_data');

/** Mid-day timestamp so +minutes never crosses a game-day boundary. */
const DAY0 = getGameDayStartMs(Date.UTC(2026, 9, 19, 12)) + GAME_DAY_MS / 2;
const DAY1 = DAY0 + GAME_DAY_MS;
const fixedRng = (value) => () => value;

const STREET = { streetTsid: 'GLI2V0UN7RD1T2J', x: 1840, y: 905, now: DAY0, rng: fixedRng(0) };

function pc(energy = 0, mood = 0) {
  return { energy, mood, energyMax: 100, moodMax: 100, activeBuffs: [] };
}

function croaked(ctx = {}) {
  const r = croak(createHellState(), { ...STREET, ...ctx });
  assert.equal(r.ok, true);
  return r;
}

function squishMany(state, n, now = DAY0) {
  let s = state;
  for (let i = 0; i < n; i += 1) s = squishGrape(s, HELL_ONE_GRAPES[i].id, now).state;
  return s;
}

function pngSize(path) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

describe('source constants', () => {
  it('keeps the exact config hell location, spawns, and penance count', () => {
    assert.equal(HELL_LOCATION.sourceTsid, 'LA5PPFP86NF2FOS');
    assert.equal(HELL_LOCATION.tsid, 'GA5PPFP86NF2FOS');
    assert.deepEqual(
      HELL_LOCATION.sourceSpawns.map((p) => [p.x, p.y]),
      [[-910, -357], [-814, -357], [-712, -357]]
    );
    assert.equal(GRAPES_REQUIRED, 11);
    assert.equal(HELL_TEXT.croaked, 'You croaked!');
    assert.equal(HELL_TEXT.aboutToCroak, 'You are about to croak! Find something to eat.');
    assert.equal(HELL_SOUNDS.croak, 'CROAK');
    assert.equal(HELL_SOUNDS.squish, 'SQUISH_GRAPES');
    assert.deepEqual({ ...HELL_BUFFS.pooped.physics }, { speed: 0.5, jump: 0.5 });
  });

  it('maps hell spawns into street screen space on the raised ledge', () => {
    const street = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/GA5PPFP86NF2FOS.json'), 'utf8'));
    assert.deepEqual(street.bounds, { ...HELL_LOCATION.bounds });
    assert.deepEqual(
      street.platforms.map((p) => ({ ...p })),
      HELL_ONE_PLATFORMS.map((p) => ({ ...p }))
    );
    const ledge = street.platforms.find((p) => p.id === 'pl1263890361047');
    for (const spawn of HELL_LOCATION.spawns) {
      assert.equal(spawn.x, spawn.sourceX - street.bounds.l);
      assert.equal(spawn.y, spawn.sourceY - street.bounds.t);
      assert.equal(spawn.groundY, ledge.y1 - street.bounds.t);
      assert.ok(spawn.sourceX > ledge.x1 && spawn.sourceX < ledge.x2);
      assert.ok(spawn.groundY - spawn.y === 13);
    }
    assert.deepEqual(HELL_LOCATION.spawns.map((s) => [s.x, s.y]), [[590, 643], [686, 643], [788, 643]]);
    // The Hell Hole is the only floor gap, under the signpost_hell deco.
    const sign = street.layers.find((l) => l.name === 'middleground').decos.find((d) => d.sprite === 'signpost_hell');
    assert.ok(sign.x > HELL_LOCATION.hellHole.sourceX1 && sign.x < HELL_LOCATION.hellHole.sourceX2);
  });

  it('resolves the default location against the imported Burnabee street', () => {
    const street = JSON.parse(readFileSync(join(publicRoot, `assets/streets/${DEFAULT_LOCATION.tsid}.json`), 'utf8'));
    assert.equal(DEFAULT_LOCATION.x, DEFAULT_LOCATION.sourceX - street.bounds.l);
    assert.equal(DEFAULT_LOCATION.y, DEFAULT_LOCATION.sourceY - street.bounds.t);
  });

  it('lists all seven Naraka streets with the archived 263 grapes', () => {
    assert.equal(NARAKA_STREETS.length, 7);
    assert.equal(NARAKA_STREETS.reduce((sum, row) => sum + row.grapes, 0), 263);
    const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8'));
    for (const row of NARAKA_STREETS) {
      assert.ok(index.streets[row.tsid], `${row.tsid} imported`);
      const xml = join(locationData, `${row.sourceTsid}.xml`);
      if (existsSync(xml)) {
        const count = (readFileSync(xml, 'utf8').match(/label="Bunch of Hellish Grapes"/g) || []).length;
        assert.equal(count, row.grapes, row.label);
      }
    }
    assert.equal(isInHell('LA5RPAFK9OE28GN'), true);
    assert.equal(isInHell('GLI2V0UN7RD1T2J'), false);
    assert.equal(isInHell('GXXXX', '40'), true);
    assert.equal(isInHellOne('LA5PPFP86NF2FOS'), true);
  });
});

describe('grapes', () => {
  it('places 51 Hell One grapes on walkable floor, never over the Hell Hole', () => {
    assert.equal(HELL_ONE_GRAPES.length, 51);
    const ids = new Set(HELL_ONE_GRAPES.map((g) => g.id));
    assert.equal(ids.size, 51);
    for (const g of HELL_ONE_GRAPES) {
      const p = HELL_ONE_PLATFORMS.find((row) => row.id === g.platformId);
      assert.ok(p, g.id);
      assert.ok(g.sourceX >= Math.min(p.x1, p.x2) && g.sourceX <= Math.max(p.x1, p.x2));
      assert.ok(g.sourceX < HELL_LOCATION.hellHole.sourceX1 || g.sourceX > HELL_LOCATION.hellHole.sourceX2);
      assert.equal(g.x, g.sourceX - HELL_LOCATION.bounds.l);
      assert.equal(g.y, g.sourceY - HELL_LOCATION.bounds.t);
      assert.ok(g.variant >= 0 && g.variant <= 3);
    }
  });

  it('is deterministic and uses each street JSON for other Naraka streets', () => {
    const street = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/GA5PV4T79OE2AOA.json'), 'utf8'));
    const a = planHellGrapes(street);
    const b = planHellGrapes(street);
    assert.equal(a.length, 40);
    assert.deepEqual(a, b);
    const hellOne = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/GA5PPFP86NF2FOS.json'), 'utf8'));
    assert.deepEqual(planHellGrapes(hellOne), HELL_ONE_GRAPES.map((g) => ({ ...g })));
  });

  it('registers the hell items in the shared inventory catalog', () => {
    ensureHellItems();
    assert.equal(ITEM_CATALOG.bunch_of_grapes_hell.label, 'Bunch of Hellish Grapes');
    assert.equal(ITEM_CATALOG.bunch_of_grapes_hell.sellable, false);
    assert.equal(ITEM_CATALOG.bunch_of_grapes_hell.stackMax, 1);
    assert.equal(ITEM_CATALOG.wine_of_the_dead.stackMax, 13);
    assert.equal(ITEM_CATALOG.wine_of_the_dead.baseCost, 66);
    assert.equal(ITEM_CATALOG.drink_ticket.label, 'Diabolical Drink Ticket');
  });

  it('ships the recovered CC0 sheets at their measured grids', () => {
    const sheets = [
      HELL_SPRITES.grapesWorld,
      HELL_SPRITES.grapesIcon,
      HELL_SPRITES.wineWorld,
      HELL_SPRITES.wineIcon,
      HELL_SPRITES.drinkTicketIcon,
      HELL_SPRITES.drinkTicketWorld,
      HELL_SPRITES.hellHoleQuestIcon,
      HELL_SPRITES.bartender.idle1,
      HELL_SPRITES.bartender.idle2,
      HELL_SPRITES.bartender.talkLeft,
      HELL_SPRITES.bartender.talkRight,
      HELL_SPRITES.bartender.talkRightOut,
    ];
    for (const sheet of sheets) {
      const size = pngSize(join(publicRoot, sheet.url));
      assert.deepEqual(size, { width: sheet.width, height: sheet.height }, sheet.url);
      if (sheet.cols) {
        const fw = sheet.frameW || HELL_SPRITES.bartender.frameW;
        const fh = sheet.frameH || HELL_SPRITES.bartender.frameH;
        assert.equal(sheet.cols * fw, sheet.width, sheet.url);
        assert.equal(sheet.rows * fh, sheet.height, sheet.url);
      }
    }
    for (const giant of HELL_SPRITES.graveside.giants) {
      const url = HELL_SPRITES.graveside.urlPattern.replace('<giant>', giant);
      assert.deepEqual(pngSize(join(publicRoot, url)), { width: 270, height: 88 });
    }
    for (const item of Object.values(HELL_ITEMS)) assert.ok(existsSync(join(publicRoot, item.icon)), item.icon);
    assert.ok(existsSync(join(publicRoot, HELL_MUSIC.track)));
  });
});

describe('croak to resurrect lifecycle', () => {
  it('croaks at zero energy, squishes 11 grapes, and resurrects to the croak spot', () => {
    const start = createHellState();
    assert.equal(shouldCroak(pc(0), start, { streetTsid: STREET.streetTsid, now: DAY0 }), true);
    assert.equal(shouldCroak(pc(1), start, { streetTsid: STREET.streetTsid, now: DAY0 }), false);

    const r = croak(start, STREET);
    assert.equal(r.state.isDead, true);
    assert.equal(r.state.deathsToday, 1);
    assert.deepEqual(r.state.resurrectLocation, { tsid: STREET.streetTsid, x: 1840, y: 905 });
    assert.deepEqual(
      r.effects.map((e) => e.type),
      ['stop_all_music', 'sound', 'activity', 'metabolics', 'remove_followers', 'remove_buffs', 'achievement', 'grave_marker', 'teleport', 'music', 'prompt']
    );
    assert.equal(r.effects.find((e) => e.type === 'sound').key, 'CROAK');
    assert.deepEqual(r.effects.find((e) => e.type === 'metabolics').set, { mood: 0, energy: 0 });
    assert.deepEqual(r.effects.find((e) => e.type === 'remove_buffs').buffs, ['no_no_powder_crash', 'no_no_powder']);
    const grave = r.effects.find((e) => e.type === 'grave_marker');
    assert.equal(grave.y, 905 - 29);
    assert.equal(r.teleport.tsid, 'GA5PPFP86NF2FOS');
    assert.deepEqual([r.teleport.x, r.teleport.y], [590, 643]);
    assert.equal(croak(start, { ...STREET, rng: fixedRng(0.99) }).teleport.spawnIndex, 2);
    const prompt = r.effects.at(-1);
    assert.equal(prompt.text, HELL_TEXT.hellEntryPrompt);
    assert.equal(prompt.delayMs, 1000);

    let s = r.state;
    for (let i = 0; i < 10; i += 1) {
      const step = squishGrape(s, HELL_ONE_GRAPES[i].id, DAY0 + i);
      assert.equal(step.ok, true);
      assert.equal(step.canResurrect, false);
      assert.equal(step.effects[0].key, 'SQUISH_GRAPES');
      assert.equal(step.effects.at(-1).text, 'You squished a Bunch of Hellish Grapes.');
      s = step.state;
    }
    assert.equal(canResurrect(s), false);
    assert.equal(remainingGrapes(s, HELL_ONE_GRAPES).length, 41);
    const last = squishGrape(s, HELL_ONE_GRAPES[10].id, DAY0 + 20);
    assert.equal(last.canResurrect, true);
    assert.equal(last.remaining, 0);
    assert.equal(last.effects.at(-1).type, 'resurrect');

    const up = resurrect(last.state, pc(0, 0), DAY0 + 30);
    assert.equal(up.ok, true);
    assert.equal(up.state.isDead, false);
    assert.deepEqual(up.metabolics, { energy: 10, mood: 0, pooped: false });
    assert.deepEqual({ tsid: up.target.tsid, x: up.target.x, y: up.target.y }, { tsid: STREET.streetTsid, x: 1840, y: 905 });
    const types = up.effects.map((e) => e.type);
    assert.deepEqual(types, ['remove_grave_marker', 'music_stop', 'metabolics', 'quest_flag', 'clear_map_path', 'remove_followers', 'teleport']);
    assert.equal(up.effects[1].fadeSeconds, 2);
    assert.equal(up.effects[3].flag, 'resurrected');
    assert.equal(up.state.grapesSquished, 0);
    assert.equal(up.state.resurrectLocation, null);
    assert.equal(up.state.graveMarker, null);
  });

  it('ignores a second squish of the same grape', () => {
    const s = croaked().state;
    const once = squishGrape(s, HELL_ONE_GRAPES[0].id, DAY0);
    const twice = squishGrape(once.state, HELL_ONE_GRAPES[0].id, DAY0);
    assert.equal(twice.ok, false);
    assert.equal(twice.reason, 'already_squished');
    assert.equal(twice.state.grapesSquished, 1);
    assert.equal(squishGrape(createHellState(), HELL_ONE_GRAPES[1].id).reason, 'not_dead');
  });

  it('resets the grape field on the next croak', () => {
    const first = squishMany(croaked().state, 11);
    const alive = resurrect(first, pc(), DAY0).state;
    const again = croak(alive, { ...STREET, now: DAY1 });
    assert.equal(again.ok, true);
    assert.equal(again.state.squishedGrapeIds.length, 0);
    assert.equal(remainingGrapes(again.state, HELL_ONE_GRAPES).length, 51);
    assert.equal(hellEntryPrompt(again.state).delayMs, 30000);
  });

  it('cannot croak while dead, in hell, locked, or Walking Dead', () => {
    const dead = croaked().state;
    assert.equal(croak(dead, STREET).reason, 'dead');
    assert.equal(croak(createHellState(), { ...STREET, streetTsid: 'GA5PPFP86NF2FOS' }).reason, 'in_hell');
    assert.equal(croak(createHellState(), { ...STREET, streetTsid: 'GA5RPAFK9OE28GN' }).reason, 'in_hell');
    assert.equal(croak(createHellState(), { ...STREET, locked: true }).reason, 'locked');
    const zombie = { ...pc(0), activeBuffs: ['walking_dead'] };
    assert.equal(shouldCroak(zombie, createHellState(), { streetTsid: STREET.streetTsid, now: DAY0 }), false);
    const powdered = { ...pc(0), activeBuffs: ['no_no_powder'] };
    assert.equal(shouldCroak(powdered, createHellState(), { streetTsid: STREET.streetTsid, now: DAY0 }), false);
  });

  it('croaks only once per game day, then Pooped takes over', () => {
    const s = resurrect(squishMany(croaked().state, 11), pc(), DAY0).state;
    assert.equal(deathsTodayFor(s, DAY0), 1);
    assert.equal(shouldCroak(pc(0), s, { streetTsid: STREET.streetTsid, now: DAY0 + 60000 }), false);
    const poop = checkPooped(s, pc(5), DAY0 + 60000);
    assert.equal(poop.applied, 'pooped');
    assert.equal(poop.effects.at(-1).text, HELL_TEXT.pooped);
    assert.equal(poop.state.pooped.expiresAt, getGameDayStartMs(DAY0) + GAME_DAY_MS);
    assert.deepEqual(hellPhysics(poop.state, DAY0 + 60000), { speed: 0.5, jump: 0.5 });
    assert.equal(canTeleport(poop.state, 'GLI2V0UN7RD1T2J', DAY0 + 60000).error, HELL_TEXT.teleportPooped);
    assert.equal(checkPooped(s, pc(6), DAY0).applied, null);
    const recovered = onEnergyGained(poop.state, pc(6), DAY0 + 70000);
    assert.equal(recovered.removed, 'pooped');
    assert.equal(recovered.state.pooped, null);
    const superPoop = checkPooped(poop.state, pc(0), DAY0 + 80000, { energyConsumedToday: 2000 });
    assert.equal(superPoop.applied, 'super_pooped');
    assert.equal(metabolicGate(superPoop.state, 'energy', 'gain', DAY0 + 80000).text, HELL_TEXT.superPoopedEnergyGain);
    // New game day: deaths reset and the croak becomes possible again.
    const tomorrow = hellNewDay(superPoop.state, pc(0), DAY1);
    assert.equal(tomorrow.state.pooped, null);
    assert.equal(shouldCroak(pc(0), tomorrow.state, { streetTsid: STREET.streetTsid, now: DAY1 }), true);
  });

  it('G200: energy lost today counts toward Super Pooped (inc_metabolics.js 134, 149)', () => {
    const gsjs = join(here, '../../glitch-GameServerJS/players/inc_metabolics.js');
    if (existsSync(gsjs)) {
      const src = readFileSync(gsjs, 'utf8');
      assert.match(src, /var change = this\.metabolics\.energy\.apiDec\(x\);[\s\S]{0,200}this\.daily_history_increment\('energy_consumed', change \* -1\);/);
      assert.match(src, /if \(this\.daily_history_get\(current_day_key\(\), 'energy_consumed'\) >= this\.metabolics\.energy\.top \* 20 && !this\.buffs_has\('super_pooped'\)\)\{\s*if \(this\.buffs_has\('pooped'\)\) this\.buffs_remove\('pooped'\);\s*this\.buffs_apply\('super_pooped'/);
    }
    // The count: per game day, only real losses, never while dead, kept through a save.
    let s = createHellState();
    assert.equal(energyConsumedTodayFor(s, DAY0), 0);
    s = noteEnergyConsumed(s, 120, DAY0);
    s = noteEnergyConsumed(s, 0.5, DAY0 + 1000);
    s = noteEnergyConsumed(s, -40, DAY0 + 2000);
    s = noteEnergyConsumed(s, 'x', DAY0 + 2000);
    assert.equal(energyConsumedTodayFor(s, DAY0 + 3000), 120.5);
    assert.equal(energyConsumedTodayFor(normalizeHellState(JSON.parse(JSON.stringify(s))), DAY0), 120.5, 'saved');
    assert.equal(energyConsumedTodayFor(s, DAY1), 0, 'a new game day starts at 0');
    assert.equal(energyConsumedTodayFor(noteEnergyConsumed(s, 30, DAY1), DAY1), 30);
    assert.equal(noteEnergyConsumed(croaked().state, 50, DAY0).energyConsumedToday, 0, 'the dead lose nothing');

    // Croaked today and at 5%: Pooped below 20x the tank, Super Pooped at it.
    const alive = resurrect(squishMany(croaked().state, 11), pc(), DAY0).state;
    const under = noteEnergyConsumed(alive, 1999, DAY0);
    assert.equal(checkPooped(under, pc(5), DAY0 + 1000).applied, 'pooped');
    const at = noteEnergyConsumed(under, 1, DAY0);
    const sup = checkPooped(at, pc(5), DAY0 + 1000);
    assert.equal(sup.applied, 'super_pooped', 'the state count is used when no override is given');
    assert.deepEqual(sup.effects.find((e) => e.type === 'prompt'), { type: 'prompt', text: HELL_TEXT.superPooped, timeoutMs: 10000, choices: [{ value: 'ok', label: 'OK' }] });
    // Already Pooped: it upgrades and Pooped goes (buffs_remove('pooped')).
    const pooped = checkPooped(under, pc(5), DAY0 + 1000).state;
    const upgrade = checkPooped(noteEnergyConsumed(pooped, 1, DAY0), pc(4), DAY0 + 2000);
    assert.equal(upgrade.applied, 'super_pooped');
    assert.deepEqual(upgrade.effects[0], { type: 'remove_buff', buff: 'pooped' });
    // A bigger tank needs more: 20x energyMax.
    assert.equal(checkPooped(at, { ...pc(5), energyMax: 150 }, DAY0 + 1000).applied, 'pooped');
    // Yesterday's count does not carry over.
    assert.equal(checkPooped({ ...at, deathsToday: 1, deathsDayKey: getGameDayKey(DAY1) }, pc(5), DAY1).applied, 'pooped');
  });

  it('resurrects at 5% energy when Pooped, and caps mood at half', () => {
    const dead = { ...croaked().state, pooped: { kind: 'pooped', appliedAt: DAY0, expiresAt: DAY0 + 1e6 } };
    assert.equal(resurrect(dead, pc(), DAY0).metabolics.energy, 5);
    // Living player standing in hell: mood above half is capped.
    const alive = resurrect(createHellState(), { ...pc(50, 90) }, DAY0, { inHell: true });
    assert.equal(alive.metabolics.mood, 50);
    assert.equal(resurrect(createHellState(), pc(), DAY0).ok, false);
  });

  it('blocks metabolic changes while dead with the source lines', () => {
    const dead = croaked().state;
    assert.equal(metabolicGate(dead, 'energy', 'gain').text, "You would have gained energy, but you're dead!");
    assert.equal(metabolicGate(dead, 'mood', 'loss').text, "You would have lost some mood, but you're dead!");
    assert.equal(metabolicGate(createHellState(), 'energy', 'gain').allowed, true);
    assert.equal(canTeleport(dead, 'GLI2V0UN7RD1T2J').error, 'You are dead.');
    assert.equal(canTeleport(dead, 'GA5PV4T79OE2AOA').ok, true);
    assert.equal(canTeleport(createHellState(), 'GA5PV4T79OE2AOA').error, HELL_TEXT.teleportToNaraka);
  });
});

describe('resurrect location rules', () => {
  it('uses the current transit stop when croaking on transit', () => {
    const r = croaked({ inTransit: true, transitStop: { tsid: 'GHVSUBWAY1', x: 300, y: 700 } });
    assert.deepEqual(r.state.resurrectLocation, { tsid: 'GHVSUBWAY1', x: 300, y: 700 });
    assert.equal(r.effects.some((e) => e.type === 'grave_marker'), false);
    const up = resurrect(squishMany(r.state, 11), pc(), DAY0);
    assert.equal(up.target.tsid, 'GHVSUBWAY1');
    const lost = croaked({ inTransit: true });
    assert.equal(resurrect(squishMany(lost.state, 11), pc(), DAY0).target.tsid, DEFAULT_LOCATION.tsid);
  });

  it('returns to the home interior and counts Quiet Tragedy only indoors', () => {
    const inside = croaked({ streetTsid: HOME_TSIDS.interior, x: 1030, y: 700, atHome: true });
    assert.deepEqual(achievementEventsFrom(inside.effects), [
      { counter: 'croaked:at_home', amount: 1 },
      { counter: 'player:deaths', amount: 1 },
    ]);
    assert.equal(inside.state.resurrectLocation.home, 'interior');
    const back = resurrect(squishMany(inside.state, 11), pc(), DAY0);
    assert.deepEqual(
      { tsid: back.target.tsid, x: back.target.x, y: back.target.y, home: back.target.home },
      { tsid: HOME_TSIDS.interior, x: 1030, y: 700, home: 'interior' }
    );
    const yard = croaked({ streetTsid: HOME_TSIDS.street, x: 910, y: 700 });
    assert.deepEqual(achievementEventsFrom(yard.effects), [{ counter: 'player:deaths', amount: 1 }]);
    assert.equal(yard.state.resurrectLocation.home, 'street');
  });

  it('falls back to the default location for vanished instances or missing streets', () => {
    const transient = croaked({ transient: true });
    assert.equal(resurrect(squishMany(transient.state, 11), pc(), DAY0).target.tsid, DEFAULT_LOCATION.tsid);
    const exited = croaked({ transient: true, instanceExit: { tsid: 'GCR10K3BPJK1U6F', x: 400, y: 800 } });
    assert.equal(resurrect(squishMany(exited.state, 11), pc(), DAY0).target.tsid, 'GCR10K3BPJK1U6F');
    const gone = resurrect(squishMany(croaked().state, 11), pc(), DAY0, { streetExists: () => false });
    assert.equal(gone.target.fallback, true);
    assert.deepEqual([gone.target.x, gone.target.y], [2532, 889]);
  });

  it('restores a map path saved at croak time', () => {
    const r = croaked({ mapPath: ['GA', 'GB'] });
    const up = resurrect(squishMany(r.state, 11), pc(), DAY0);
    assert.deepEqual(up.effects.find((e) => e.type === 'restore_map_path').path, ['GA', 'GB']);
  });
});

describe('low-energy warning', () => {
  it('warns once at 10% energy, then waits 60 seconds', () => {
    let s = createHellState();
    assert.equal(shouldWarnLowEnergy(pc(11), s, DAY0), null);
    const first = checkLowEnergyWarning(s, pc(10), DAY0);
    assert.equal(first.warn, true);
    assert.equal(first.text, 'You are about to croak! Find something to eat.');
    s = first.state;
    assert.equal(checkLowEnergyWarning(s, pc(8), DAY0 + 30000).warn, false);
    assert.equal(checkLowEnergyWarning(s, pc(8), DAY0 + 60000).warn, false);
    assert.equal(checkLowEnergyWarning(s, pc(8), DAY0 + 60001).warn, true);
    const afterCroak = resurrect(squishMany(croaked().state, 11), pc(), DAY0).state;
    assert.equal(shouldWarnLowEnergy(pc(9), afterCroak, DAY0 + 1000), 'You are extremely low on energy! Find something to eat.');
    assert.equal(shouldWarnLowEnergy(pc(0), croaked().state, DAY0), null);
    assert.equal(shouldWarnLowEnergy({ ...pc(5), activeBuffs: ['walking_dead'] }, s, DAY1), null);
  });
});

describe('persistence', () => {
  it('normalizes saved state and drops junk', () => {
    const fresh = normalizeHellState(null);
    assert.equal(fresh.isDead, false);
    assert.deepEqual(fresh.squishedGrapeIds, []);
    const dead = squishMany(croaked().state, 4);
    const round = normalizeHellState(JSON.parse(JSON.stringify(dead)));
    assert.deepEqual(round, dead);
    const junk = normalizeHellState({ isDead: 'yes', grapesSquished: 9, squishedGrapeIds: ['a', 'a'], pooped: { kind: 'bogus' } });
    assert.equal(junk.isDead, false);
    assert.equal(junk.grapesSquished, 0);
    assert.equal(junk.pooped, null);
  });

  it('resumes inside hell on reload while dead and keeps penance progress', () => {
    const dead = squishMany(croaked().state, 6);
    const saved = JSON.parse(JSON.stringify(dead));
    const resume = resolveReloadLocation(saved, { tsid: 'GA5PPFP86NF2FOS', x: 900, y: 800 }, DAY0 + 1000);
    assert.equal(resume.action, 'resume_hell');
    assert.deepEqual([resume.target.x, resume.target.y], [900, 800]);
    assert.equal(normalizeHellState(saved).grapesSquished, 6);
    const forced = resolveReloadLocation(saved, { tsid: 'GLI2V0UN7RD1T2J', x: 1, y: 2 }, DAY0 + 1000);
    assert.equal(forced.action, 'force_hell');
    assert.equal(forced.target.tsid, 'GA5PPFP86NF2FOS');
    assert.equal(enforceHellOnEnter(saved, 'GLI2V0UN7RD1T2J').tsid, 'GA5PPFP86NF2FOS');
    assert.equal(enforceHellOnEnter(saved, 'GA5PV4T79OE2AOA'), null);
  });

  it('auto-resurrects a player still dead at the next game day', () => {
    const dead = croaked().state;
    assert.equal(resolveReloadLocation(dead, { tsid: 'GA5PPFP86NF2FOS', x: 0, y: 0 }, DAY1).action, 'resurrect');
    const day = hellNewDay(dead, pc(), DAY1);
    assert.equal(day.resurrection.ok, true);
    assert.equal(day.state.isDead, false);
    assert.equal(day.resurrection.target.tsid, STREET.streetTsid);
    assert.equal(hellNewDay(dead, pc(), DAY0 + 1000).resurrection, null);
  });

  it('sends a living player saved in hell back out', () => {
    const r = resolveReloadLocation(createHellState(), { tsid: 'GA5PPFP86NF2FOS', x: 1, y: 2 }, DAY0);
    assert.equal(r.action, 'resurrect');
    assert.equal(r.target.tsid, DEFAULT_LOCATION.tsid);
    assert.equal(resolveReloadLocation(createHellState(), { tsid: 'GLI2V0UN7RD1T2J', x: 1, y: 2 }, DAY0).action, 'none');
  });
});

describe('graves, hell quests, and Wine of the Dead', () => {
  it('offers It\'s Better in a Hell Hole when mourned while in Hell One', () => {
    const dead = croaked().state;
    const quests = { active: {}, completed: [] };
    const r = recognizeDeath(dead, { type: 'mourn', recognizer: 'Mangeclous', streetTsid: 'GA5PPFP86NF2FOS', questState: quests });
    assert.equal(r.offer, 'hell_hole');
    assert.ok(r.effects[1].text.startsWith('Woah! Did you feel that?'));
    assert.ok(r.effects[1].text.includes('Mangeclous just mourned your death at your gravestone.'));
    assert.equal(r.state.graveMarker.state, 'mourn');
    assert.equal(recognizeDeath(r.state, { type: 'celebrate', recognizer: 'X' }).reason, 'already_recognized');
    assert.equal(hellHoleOfferText({ type: 'celebrate', recognizer: 'Pal' }).includes('Pal just celebrated your life'), true);
    assert.equal(HELL_QUESTS.hell_hole.title, "It's Better in a Hell Hole");
  });

  it('offers Beelzebooze elsewhere in Naraka, or hands over a drink ticket', () => {
    const dead = croaked().state;
    const quests = { active: { hell_hole: {} }, completed: [] };
    const naraka = recognizeDeath(dead, { type: 'celebrate', recognizer: 'Pal', streetTsid: 'GA5PV4T79OE2AOA', questState: quests });
    assert.equal(naraka.offer, 'hell_quest');
    assert.equal(HELL_QUESTS.hell_quest.rewards.xp, 250);
    assert.equal(HELL_QUESTS.hell_quest.rewards.currants, 150);
    const done = { active: {}, completed: ['hell_quest'] };
    const ticket = recognizeDeath(dead, { type: 'mourn', recognizer: 'Pal', streetTsid: 'GA5PPFP86NF2FOS', questState: done });
    assert.equal(ticket.offer, null);
    assert.deepEqual(ticket.effects[1], { type: 'grant_item', classTsid: 'drink_ticket', count: 1 });
    assert.equal(ticket.effects[2].text, 'Pal has mourned your passing, you received a drink ticket for Wine of the Dead.');
    assert.equal(hellQuestOffer(dead, { active: {}, completed: [] }, { completedHellHole: true }), 'hell_quest');
    assert.equal(hellHoleFlagForStreet('LA5PV4T79OE2AOA'), 'jump_hell_hole');
    assert.equal(graveMarkerPhase(dead, DAY0 + 46 * 60 * 1000), 'fading');
    assert.equal(graveMarkerPhase(dead, DAY0 + 61 * 60 * 1000), 'gone');
  });

  it('Wine of the Dead unpoops the dead and kills the living', () => {
    const dead = croaked().state;
    assert.equal(wineDrinkConditions(dead).reason, HELL_TEXT.wineNotPooped);
    const pooped = { ...dead, pooped: { kind: 'pooped', appliedAt: DAY0, expiresAt: DAY0 + 1e7 } };
    const sip = drinkWineOfTheDead(pooped, { now: DAY0 });
    assert.equal(sip.reason, 'unpooped');
    assert.equal(sip.state.dontGetPooped, true);
    assert.equal(sip.effects.some((e) => e.flag === 'drink_wotd'), true);
    const alive = resurrect(squishMany(dead, 11), pc(), DAY0).state;
    const gulp = drinkWineOfTheDead(alive, { ...STREET, now: DAY0 + 1000 });
    assert.equal(gulp.reason, 'died');
    assert.equal(gulp.state.isDead, true);
    assert.equal(gulp.state.deathsToday, 2);
  });
});

describe('achievement events', () => {
  it('emits exact player:deaths counters that unlock Clumsy on the third croak', () => {
    const badges = createAchievementState();
    let s = createHellState();
    const unlocked = [];
    for (let day = 0; day < 3; day += 1) {
      const now = DAY0 + day * GAME_DAY_MS;
      s = hellNewDay(s, pc(), now).state;
      const r = croak(s, { ...STREET, now });
      assert.equal(r.ok, true, `croak day ${day}`);
      for (const event of achievementEventsFrom(r.effects)) {
        for (const update of applyAchievementProgress(badges, event.counter, event.amount)) {
          if (update.unlocked) unlocked.push(update.classTsid);
        }
      }
      s = resurrect(squishMany(r.state, 11, now), pc(), now).state;
    }
    assert.deepEqual(unlocked, ['clumsy1']);
    assert.equal(s.totalDeaths, 3);
    assert.equal(HELL_ACHIEVEMENTS.darwin_award_winner.num, 11);
  });

  it('unlocks Quiet Tragedy for a home-interior croak', () => {
    const badges = createAchievementState();
    const r = croaked({ streetTsid: HOME_TSIDS.interior, atHome: true });
    const ids = achievementEventsFrom(r.effects)
      .flatMap((e) => applyAchievementProgress(badges, e.counter, e.amount))
      .filter((u) => u.unlocked)
      .map((u) => u.classTsid);
    assert.deepEqual(ids, ['quiet_tragedy']);
  });

  it('counts each Naraka street once toward Naraka Completist', () => {
    const badges = createAchievementState();
    let s = createHellState();
    let unlockedAt = -1;
    const visits = [...NARAKA_STREETS.map((r) => r.tsid), 'GA5PPFP86NF2FOS', 'GLI2V0UN7RD1T2J'];
    visits.forEach((tsid, index) => {
      const step = noteNarakaVisit(s, tsid);
      s = step.state;
      for (const e of step.events) {
        if (applyAchievementProgress(badges, e.counter, e.amount).some((u) => u.unlocked && u.classTsid === 'naraka_completist')) {
          unlockedAt = index;
        }
      }
    });
    assert.equal(unlockedAt, 6);
    assert.equal(s.narakaStreetsVisited.length, 7);
  });
});
