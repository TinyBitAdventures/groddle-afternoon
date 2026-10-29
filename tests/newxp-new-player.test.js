/**
 * A brand-new solo player's tutorial (lane NEWPLAYER, Austin's new-player play of 2026-10-28):
 *
 * 1. "Start with the tutorial" on the start card starts from zero, as a new multiplayer
 *    character does (game.js engine.startAsNewPlayer, js/new-player.js; players/player.js
 *    onCreate 1188-1243); "Skip to Ur" keeps the demo kit. The save remembers it
 *    (player-save.js startedFresh), so a reload never hands the kit's migrations back.
 * 2. No quest offers while the tutorial runs (inc_quests.js quests_offer 622-624,
 *    quests_give_level_do 1035-1036): newxp-feature holdQuestOffers.
 * 3. A reload mid-tutorial skips the welcome card and resumes the stage.
 * 4. The Cloud Level ends in a soft cloud and walking off it falls straight through.
 * 5. The start card: no "Arrived:" toast over it; the credit line.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { newPlayerInventory, newPlayerStats } from '../public/js/new-player.js?v=mp5-1';
import { createInventory } from '../public/js/inventory.js?v=catalog-unified-7';
import { PARADISE_TICKET_IDS } from '../public/js/paradise-flight.js?v=g424-1';
import { createPlayerSave, parsePlayerSave, restorePlayerSave, serializePlayerSave, normalizePlayerSnapshot } from '../public/js/player-save.js?v=g424-1';
import { cloudsLayout, SCENE_TSIDS, GENTLE_ISLAND } from '../public/js/newxp.js?v=g449-1';
import { newxpFeature, __newxpTest, cloudEdge, cloudStepOff, cloudStepOffAny, CLOUD_BODY_DEPTH, CLOUD_EDGE_CLEAR, CLOUD_END_PUFFS } from '../public/js/features/newxp-feature.js?v=g451-1';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const game = read('public/game.js');
const feature = read('public/js/features/newxp-feature.js');

const HECHEY = 'GLI2V0UN7RD1T2J';
const engineStub = (extra = {}) => ({
  started: false,
  mode: 'solo',
  data: {},
  param: () => null,
  setData(k, v) { this.data[k] = v; },
  streetTsid: HECHEY,
  inScene: () => false,
  ...extra,
});

describe('1. the tutorial path starts from zero; Skip to Ur keeps the kit', () => {
  it('the start card starts from zero on the tutorial button and on Customize look first, never on Skip to Ur', () => {
    const card = feature.slice(feature.indexOf('function showStartCard(engine)'), feature.indexOf('// Solo or multiplayer is chosen before the game'));
    const solo = card.slice(card.indexOf('<strong>New to Ur?</strong>'));
    const start = solo.slice(solo.indexOf("querySelector('[data-nx-start]')"), solo.indexOf("querySelector('[data-nx-skipstart]')"));
    const skip = solo.slice(solo.indexOf("querySelector('[data-nx-skipstart]')"), solo.indexOf("getElementById('start-customize-btn')"));
    const customize = solo.slice(solo.indexOf("getElementById('start-customize-btn')"));
    assert.match(start, /engine\.startAsNewPlayer\?\.\(\) === true;[\s\S]*pendingStage = 'clouds';\n\s+startBtn\.click\(\);/);
    assert.doesNotMatch(skip, /startAsNewPlayer/);
    assert.match(skip, /save\.status = 'skipped';/);
    // Customize look first (Austin 2026-10-28): the tutorial from zero, the builder opened by game.js on the same click.
    assert.match(customize, /if \(save\.status === 'skipped' \|\| pendingStage\) return;[\s\S]*engine\.startAsNewPlayer\?\.\(\) === true;[\s\S]*pendingStage = 'clouds';/);
    assert.match(customize, /\{ capture: true, once: true \}/);
  });

  it('game.js starts a brand-new solo save as the multiplayer new player, and nothing else', () => {
    const fn = game.slice(game.indexOf('  startAsNewPlayer() {'), game.indexOf('  get started() {'));
    assert.match(fn, /if \(NEW_PLAYER \|\| !isSolo\(\) \|\| state\.started \|\| bootHadPlayerSave\) return false;/);
    assert.match(fn, /inventory: newPlayerInventory\(createInventory\(\), PARADISE_TICKET_IDS\),/, 'the multiplayer empty pack');
    assert.match(fn, /player: \{ \.\.\.newPlayerStats\(\), startedFresh: true \},/, 'the multiplayer stats');
    assert.match(fn, /restorePlayerSave\(fresh, inv, pc, systems\);/);
    assert.match(fn, /starterSkills = new Set\(\);/);
    assert.match(fn, /features\.get\('imagination'\)\?\.restore\(\{ starterGranted: true \}, engine\);/);
    // Only a save with no player state at boot: an existing solo save is never reset.
    assert.match(game, /const savedPlayerState = loadPlayerState\(\);\n\s+bootHadPlayerSave = Boolean\(savedPlayerState\);/);
    // Its reloads: no Tinkering I migration, no demo-kit starter skills off the First Eleven count.
    assert.match(game, /if \(isSolo\(\) && !pc\.startedFresh\) grantSkill\(skillState, 'tinkering_1', true\);/);
    assert.match(game, /if \(pc\.startedFresh\) starterSkills = new Set\(\);/);
    // The kit itself is unchanged for every other start (Skip to Ur, QA routes, marketing links).
    assert.match(game, /const pc = NEW_PLAYER \? newPlayerStats\(\) : \{ energy: 80, mood: 70, imagination: 5000, currants: 200, xp: 5000, level: 5, rewardMultiplier: 1 \};/);
  });

  it('the reset leaves the demo kit at the source new player: level 1, nothing in the pack, no skills or quests', () => {
    // What startAsNewPlayer does to the boot's demo-kit state, on plain objects.
    const inv = createInventory({ apple: 2, hatchet: 1, butterfly_lotion: 3, paradise_ticket_cloud_rings: 1, scraper: 1 });
    const pc = { energy: 80, mood: 70, imagination: 5000, currants: 200, xp: 5000, level: 5, rewardMultiplier: 1, imaginationUpgrades: ['walk_speed_1', 'jump_1'] };
    const quests = { active: { animalkinship_pet_piggies: { classTsid: 'animalkinship_pet_piggies', progress: {}, startedAt: 1 } }, completed: [], story: {}, offers: {} };
    const skills = { learned: ['animalkinship_1', 'ezcooking_1', 'tinkering_1'], queue: {} };
    const achievements = { progress: { musicblock_collector: { progress: { 'in_inventory:musicblock_b_brown_01': 1 } } }, unlocked: [], groups: {} };
    const fresh = createPlayerSave({
      inventory: newPlayerInventory(createInventory(), PARADISE_TICKET_IDS),
      player: { ...newPlayerStats(), startedFresh: true },
    });
    assert.equal(restorePlayerSave(fresh, inv, pc, { quests, skills, achievements }), true);
    assert.deepEqual({ level: pc.level, xp: pc.xp, imagination: pc.imagination, currants: pc.currants, energy: pc.energy, mood: pc.mood, energyMax: pc.energyMax },
      { level: 1, xp: 0, imagination: 0, currants: 0, energy: 55, mood: 55, energyMax: 100 });
    assert.deepEqual(pc.imaginationUpgrades, []);
    assert.equal(pc.startedFresh, true);
    assert.ok(Object.values(inv).every((n) => n === 0), JSON.stringify(inv));
    for (const id of PARADISE_TICKET_IDS) assert.equal(inv[id], 0, `${id}: a deliberate zero, so the boot migration never refills it`);
    assert.equal(inv.hatchet, 0, 'the hatchet migration (undefined -> 1) sees a zero');
    assert.deepEqual(quests.active, {});
    assert.deepEqual(skills.learned, []);
    assert.deepEqual(achievements.progress, {});
  });

  it('the save remembers a fresh start; old saves and the kit default never gain it', () => {
    const pc = { ...newPlayerStats(), startedFresh: true };
    const back = parsePlayerSave(serializePlayerSave(createPlayerSave({ inventory: {}, player: pc })));
    assert.equal(back.player.startedFresh, true);
    assert.equal(back.player.level, 1);
    assert.equal('startedFresh' in normalizePlayerSnapshot({}), false);
    assert.equal('startedFresh' in normalizePlayerSnapshot({ startedFresh: 'yes' }), false);
    // A restore of an old save leaves a kit pc without the mark.
    const kit = { energy: 80, mood: 70, imagination: 5000, currants: 200, xp: 5000, level: 5 };
    restorePlayerSave(createPlayerSave({ inventory: { apple: 1 }, player: kit }), {}, kit, {});
    assert.equal(kit.startedFresh, undefined);
  });

  it('cites the source new player it copies', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const onCreate = readFileSync(join(gsjs, 'players/player.js'), 'utf8').split('\n');
    assert.match(onCreate[1187], /^function onCreate\(\)\{/);
    assert.match(onCreate[1238], /this\.goToNewNewStartingLevel\(\);/);
  });
});

describe('2. no quest offers during the tutorial', () => {
  afterEach(() => { __newxpTest.save = {}; });

  it('held while the tutorial runs and in its scenes; offered again once it is done or skipped', () => {
    const e = engineStub();
    __newxpTest.save = { status: 'off' };
    assert.equal(newxpFeature.holdQuestOffers(e), null, 'no tutorial: offers as usual');
    __newxpTest.save = { status: 'active', stage: 'clouds' };
    assert.equal(newxpFeature.holdQuestOffers({ ...e, streetTsid: SCENE_TSIDS.clouds }), true);
    __newxpTest.save = { status: 'active', stage: 'island' };
    assert.equal(newxpFeature.holdQuestOffers({ ...e, streetTsid: GENTLE_ISLAND.surveyors_stroll }), true, 'Gentle Island while the tutorial runs');
    for (const status of ['done', 'skipped']) {
      __newxpTest.save = { status, stage: 'island' };
      assert.equal(newxpFeature.holdQuestOffers(e), null, `${status}: in Ur, offers resume`);
    }
    __newxpTest.save = { status: 'done' };
    assert.equal(newxpFeature.holdQuestOffers({ ...e, streetTsid: SCENE_TSIDS.training1 }), true, 'a tutorial scene never offers');
  });

  it('held from the start card\'s choice, before the first stage has begun (the Play by Mail pop)', () => {
    // quest-offers ticks before newxp (features/index.js order), so the first started frame
    // used to check offers before startTutorial set the status: pendingStage holds them.
    const src = read('public/js/features/index.js');
    assert.ok(src.indexOf('quest-offers-feature.js') < src.indexOf('newxp-feature.js'));
    assert.match(feature, /holdQuestOffers\(engine\) \{\n\s+if \(pendingStage \|\| active\(\)\) return true;\n\s+return isNewxpSceneTsid\(engine\?\.streetTsid\) \? true : null;/);
    assert.match(read('public/js/features/quest-offers-feature.js'), /if \(offerOpen \|\| engine\.busy\(\) \|\| engine\.questOffersHeld\?\.\(\)\) return false;/);
    assert.match(game, /questOffersHeld: \(\) => (?:(?:!state\.started|startHeld\(\)) \|\| )?features\.query\('holdQuestOffers', engine\) === true,/);
  });

  it('cites inc_quests.js', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const lines = readFileSync(join(gsjs, 'players/inc_quests.js'), 'utf8').split('\n');
    assert.match(lines[622], /!this\.has_done_intro \|\| this\.location\.is_newxp/);
    assert.match(lines[1034], /No quests during newxp/);
  });
});

describe('3. a reload mid-tutorial goes straight back into it', () => {
  const realDocument = globalThis.document;
  afterEach(() => {
    globalThis.document = realDocument;
    __newxpTest.save = {};
  });

  function fakeDocument() {
    const clicks = [];
    const overlay = { classList: { set: new Set(), add(c) { this.set.add(c); } } };
    const startBtn = { click: () => clicks.push(Date.now()) };
    const doc = {
      getElementById: (id) => ({ overlay, 'start-btn': startBtn })[id] || null,
      querySelector: () => null,
      body: { classList: { contains: () => false } },
    };
    return { doc, overlay, clicks };
  }

  it('no welcome card; the game starts by itself and the stage resumes', async () => {
    const { doc, overlay, clicks } = fakeDocument();
    globalThis.document = doc;
    const e = engineStub();
    // QA routes and finished tutorials keep the card.
    newxpFeature.restore({ status: 'done', stage: 'island' });
    newxpFeature.onStreetEnter({ tsid: HECHEY }, e);
    newxpFeature.restore({ status: 'active', stage: 'training1' });
    newxpFeature.onStreetEnter({ tsid: HECHEY }, engineStub({ param: (k) => (k === 'autostart' ? '1' : null) }));
    newxpFeature.onStreetEnter({ tsid: HECHEY }, engineStub({ param: (k) => (k === 'fresh' ? '1' : null) }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(overlay.classList.set.size, 0);
    assert.equal(clicks.length, 0);
    // The tutorial in progress, a plain reload.
    newxpFeature.onStreetEnter({ tsid: HECHEY }, e);
    assert.ok(overlay.classList.set.has('hidden'), 'the welcome card never shows');
    assert.equal(e.data.newxpResume, 'training1');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(clicks.length, 1, 'the game starts by itself');
    // onTick's resume (shouldResume) then begins the saved stage; the scene stages restart at their top.
    assert.match(feature, /\} else if \(shouldResume\(save, \{ fresh: engine\.param\('fresh'\) != null, resetgame: engine\.param\('resetgame'\) != null \}\)\) \{\n[^\n]*\n\s+if \(SCENE_STAGES\.includes\(save\.stage\)/);
  });

  it('the arrival lines stay quiet until the stage is back (no "Hechey Track loaded" over Training)', () => {
    __newxpTest.save = { status: 'active', stage: 'training1' };
    assert.equal(newxpFeature.arrivalQuiet(engineStub({ started: true })), true);
    __newxpTest.save = { status: 'active', stage: 'island' };
    assert.equal(newxpFeature.arrivalQuiet(engineStub({ started: true })), null, 'the island resumes in place, as before');
    // game.js asks it for the reload's "Welcome back to Hechey Track" line too.
    assert.match(game, /if \(savedLoc && features\.query\('arrivalQuiet', engine\) !== true\) \{\n\s+pushActivity\(`Welcome back to /);
  });
});

describe('4. the Cloud Level ends in a soft cloud, and the edge drops cleanly', () => {
  const L = cloudsLayout();
  const cloud = L.platforms.find((p) => p.id === 'cloud');

  it('the drop is tested at the cloud\'s edge, so a slow step off never stands on the catch floor', () => {
    assert.equal(cloudEdge(L), cloud.x2);
    const below = L.platforms.find((p) => p.id === 'below');
    assert.ok(below.x1 > cloud.x2, 'the catch floor starts past the edge');
    assert.ok(L.dropY < below.y1, 'the drop fires mid-fall, above the catch floor');
    assert.match(feature, /const edge = cloudEdge\(L\);\n\s+run\.data\.cloudEdge = edge;\n\s+await until\(t, \(\) => P\(\)\.x > edge && P\(\)\.y > L\.dropY/);
  });

  it('feet standing just past the edge (the ground slack) are moved clear, so the avatar falls', () => {
    const edge = cloudEdge(L);
    const read = (f) => readFileSync(join(root, f), 'utf8');
    // The slack it clears: platformYAt's 4 px margin and resolveGround's 8 px seam bridge.
    assert.match(read('public/js/street-model.js'), /export function platformYAt\(p, x, margin = 4\)/);
    assert.match(game, /const maxX = Math\.max\(p\.x1, p\.x2\) \+ 8;/);
    assert.ok(CLOUD_EDGE_CLEAR > 8);
    assert.equal(cloudStepOff(edge, { x: edge + 4, onGround: true }), edge + CLOUD_EDGE_CLEAR, 'the QA stick: x 3354 standing on air');
    assert.equal(cloudStepOff(edge, { x: edge + 1, onGround: true }), edge + CLOUD_EDGE_CLEAR);
    assert.equal(cloudStepOff(edge, { x: edge, onGround: true }), null, 'still on the cloud');
    assert.equal(cloudStepOff(edge, { x: edge + 4, onGround: false }), null, 'already falling');
    assert.equal(cloudStepOff(edge, { x: edge + 20, onGround: true }), null, 'on the catch floor below, past the slack');
    // Every cloud drops onto the next, so every edge is cleared the same way.
    for (const t of L.terraces) {
      assert.equal(cloudStepOffAny(L.terraces, { x: t.x2 + 4, y: t.y, onGround: true }), t.x2 + CLOUD_EDGE_CLEAR, t.id);
      assert.equal(cloudStepOffAny(L.terraces, { x: t.x2 + 4, y: t.y + 200, onGround: true }), null, `${t.id}: not on its line`);
    }
    assert.match(feature, /if \(run\?\.stage === 'clouds' && run\.data\.terraces\) \{\n\s+const p = P\(\);\n\s+const x = cloudStepOffAny\(run\.data\.terraces, p\);/);
  });

  it('the floor is the scene\'s colour, blurred, ending in puffs at the edge (no hard white block side)', () => {
    for (const [dx, dy, r] of CLOUD_END_PUFFS) {
      assert.ok(dx < 0 && r > 0 && dy >= 0, JSON.stringify([dx, dy, r]));
      assert.ok(dx + r <= 20, 'no puff reaches far past the drop');
    }
    // Lower puffs tuck in under the edge, as a cloud's underside does.
    const xs = CLOUD_END_PUFFS.map(([dx]) => dx);
    assert.ok(xs.at(-1) < xs[0]);
    const fn = feature.slice(feature.indexOf('function cloudFloor('), feature.indexOf('function pullChain('));
    assert.match(fn, /body\.rect\(x1 - 300, top, edge - 160 - x1 \+ 300, CLOUD_BODY_DEPTH - 60\)\.fill\(colour\);/);
    assert.match(fn, /new PIXI\.BlurFilter\(/);
    assert.match(fn, /stageDeco\(PIXI, 'clouds_bg_middleplus_01b_newxp'/, 'Tiny Speck\'s own newxp cloud art');
    // The deco row stops at the edge.
    assert.match(fn, /for \(let x = x1 - 120, i = 0; x < edge - 150; x \+= 300, i\+\+\) \{/);
    // A cloud's body ends above the next cloud's walking line, so it never hides the one below.
    for (let i = 1; i < L.terraces.length; i++) assert.ok(L.terraces[i - 1].y + CLOUD_BODY_DEPTH < L.terraces[i].y);
    const drop = Math.min(...L.terraces.slice(1).map((t, i) => t.y - L.terraces[i].y));
    for (const [, dy, r] of CLOUD_END_PUFFS) assert.ok(60 + dy + r < drop, 'the end puffs stop above the next cloud');
  });
});

describe('5. the start card', () => {
  it('no "Arrived:" toast while it is up (or into the tutorial)', () => {
    assert.match(game, /if \(!opts\.quiet && features\.query\('arrivalQuiet', engine\) !== true\) toast\(`Arrived: \$\{data\.label\}`, 2800\);/);
    // arrivalQuiet answers true while the brand-new save's start card is up (before the game starts).
    assert.match(feature, /return !engine\?\.started && startCardShown && !hadSave \? true : null;/);
    // The street enter runs the features (newxp's onStreetEnter shows the card) before the toast.
    const enter = game.slice(game.indexOf('async function enterStreet('));
    assert.ok(enter.indexOf('features.streetEnter(data, engine, opts);') < enter.indexOf('toast(`Arrived: ${data.label}`'));
  });

  it('the credit line names the remake and links Credits (Austin 2026-10-28) and Privacy (2026-10-29)', () => {
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(page);
      assert.match(html, /<p class="fine">A <a href="https:\/\/tinybitadventures\.com">fan remake<\/a> of Tiny Speck’s Glitch · <a href="credits\/">Credits<\/a> · <a href="privacy-policy\/">Privacy<\/a><\/p>/, page);
      assert.doesNotMatch(html, /remake experiment/, page);
    }
  });
});
