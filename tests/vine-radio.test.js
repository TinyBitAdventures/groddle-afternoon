/**
 * The Vine Radio (register G1245, report #661; Austin's rulings 2026-11-24; ours: Glitch had no radio
 * a player could own). js/vine-radio.js holds the rules, features/vine-radio-feature.js draws it and
 * plays it, js/home-cultivation.js keeps it with the home street.
 *
 * 1. Tunes for Crabs counts the tunes crabs hear and gives the radio.
 * 2. Its size: 10 tunes for the 8 crabs, scaled to the crabs players can reach on the open world (5).
 * 3. Placing and moving it in Cultivate, as the Mail Dispatcher.
 * 4. The unlock rules: regions by visiting, theme tracks by hearing them where the game plays them
 *    (the rest come with the radio), musicblocks by owning them (a medley); region names from the data.
 * 5. Street only: the house and the Tower keep the home's own music.
 * 6. Louder near it, with a floor.
 * 7. Visitors hear the owner's choice and can opt out for their visit.
 * 8. The save round trip.
 * 9. The Choose music sheet opens, a 2012 window in Classic.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CRAB_TUNES_COUNTER,
  HEARD_WHERE,
  MEDLEY_GAP_SEC,
  RADIO_FALLOFF,
  RADIO_PANEL_ID,
  RADIO_QUEST,
  RADIO_QUEST_ID,
  RADIO_QUEST_TUNES,
  RADIO_REACHABLE_CRABS,
  RADIO_REGIONS,
  WORLD_CRABS,
  normalizeRadioState,
  pickOpen,
  radioNearLevel,
  radioOwned,
  radioPlaylist,
  radioThemeTracks,
  radioTuneGoal,
  radioUnlocks,
  visitRadio,
  withOursQuests,
} from '../public/js/vine-radio.js?v=5436aa09';
import { CRAB_STREETS } from '../public/js/crabs.js?v=eb0bdc39';
import { MUSICBLOCK_CATALOG } from '../public/js/musicblocks.js?v=e4c81eb7';
import { getAmbientMusicConfig, resolveAmbientTheme, setAmbientMusicConfig } from '../public/js/ambient-music.js?v=4b3c6041';
import { streetGraph } from '../public/js/street-graph.js?v=d767f3a2';
import { closedForEveryone, freeWays, openWorld } from '../public/js/open-roads.js?v=2e03b0a6';
import { TELEPORTERS } from '../public/js/hidden-floors.js?v=023336cb';
import { WINTRY_PORTAL_TELEPORTERS } from '../public/js/wintry-portal.js?v=1437deda';
import { WORLD_MAP } from '../public/js/map-views-data.js?v=07734585';
import { getQuestCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=c9b84764';
import { createQuestState } from '../public/js/quests.js?v=f68437db';
import { acceptOffer, isEventEmitted, npcQuestOffers, requirementRoute, routeQuestEvent, turnInQuest } from '../public/js/quest-offers.js?v=7e00498b';
import {
  createCultivationState,
  fixtureRx,
  homeStreetLayout,
  normalizeCultivationState,
  placementCheck,
  putAwayRadio,
  putOutRadio,
  radioState,
  setRadioState,
} from '../public/js/home-cultivation.js?v=122d6f45';
import { MOVABLE_FIXTURES, MOVABLE_FIXTURE_IDS, RADIO_USUAL_DX, fixtureFits, fixtureText, radioOut } from '../public/js/home-street-fixtures.js?v=d4e5b56a';
import { homesFeature } from '../public/js/features/homes-feature.js?v=76aa2f88';
import { radioFeature } from '../public/js/features/vine-radio-feature.js?v=fabb31ce';
import { SIDE_SHEET_IDS } from '../public/js/ui/panel-shell.js?v=5efb38c6';
import { page } from './social-fake-dom.js';
import { CULTIVATION_CLASSES } from '../public/js/homes-catalog.js?v=0367f90f';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const index = json('public/assets/streets/index.json');
const ambient = json('public/assets/content/ambient-music.json');
setAmbientMusicConfig(ambient);
const blockAudio = (c) => MUSICBLOCK_CATALOG[c]?.audio || '';

describe('1. Tunes for Crabs counts the tunes crabs hear and gives the radio', () => {
  before(async () => {
    resetContentCatalogs();
    await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
  });

  it('is in the quest catalog (ours, beside Tiny Speck\'s), and a crab offers it', () => {
    const def = getQuestCatalog()[RADIO_QUEST_ID];
    assert.ok(def, 'the catalog has it');
    assert.equal(def.ours, true);
    assert.equal(def.solo, true);
    assert.deepEqual(def.offerTriggers, [{ type: 'npc', npc: 'npc_crab' }]);
    assert.ok(!JSON.parse(read('public/assets/content/quests.json'))[RADIO_QUEST_ID], 'quests.json stays the mined quests');
    assert.equal(withOursQuests({ a: 1 })[RADIO_QUEST_ID].title, 'Tunes for Crabs');
    const qs = createQuestState();
    const offered = npcQuestOffers(qs, 'npc_crab', { level: 3, xp: 100 }, { level: 3 }).offered.map((c) => c.classTsid);
    assert.ok(offered.includes(RADIO_QUEST_ID));
    assert.ok(!npcQuestOffers(qs, 'npc_piggy', { level: 3 }, { level: 3 }).offered.some((c) => c.classTsid === RADIO_QUEST_ID));
  });

  it('counts each tune heard, completes on the last and makes the radio yours', () => {
    const qs = createQuestState();
    assert.equal(radioOwned(qs), false);
    assert.equal(acceptOffer(qs, RADIO_QUEST_ID, { level: 3 }).ok, true);
    let res = null;
    for (let i = 1; i <= RADIO_QUEST_TUNES; i += 1) {
      res = routeQuestEvent(qs, CRAB_TUNES_COUNTER, 1, {});
      assert.equal(qs.active[RADIO_QUEST_ID].progress[CRAB_TUNES_COUNTER], i);
      assert.equal(res.completable.some((r) => r.classTsid === RADIO_QUEST_ID), i === RADIO_QUEST_TUNES);
    }
    const pc = { xp: 0, mood: 10, energy: 10, currants: 0, giantFavor: {} };
    assert.equal(turnInQuest(qs, RADIO_QUEST_ID, pc, {}).ok, true);
    assert.equal(radioOwned(qs), true);
    assert.ok(pc.xp > 0);
  });

  it('the crab emits the counter on every tune it hears, and the quest system knows it is emitted', () => {
    assert.equal(isEventEmitted(CRAB_TUNES_COUNTER), true);
    assert.equal(requirementRoute(RADIO_QUEST.requirements[0]).emitted, true);
    const crab = read('public/js/features/crabs-feature.js');
    const listen = crab.slice(crab.indexOf('function onListen('), crab.indexOf('function onSettle('));
    assert.match(listen, /engine\.achievement\?\.\(CRAB_TUNES_COUNTER, 1\);/);
    // Offered to a home owner after the crab's say, through the game's quest dialogue.
    assert.match(crab, /engine\.homeOwned\?\.\(\) !== true/);
    assert.match(crab, /engine\.offerQuestDialogue\(\{/);
  });

  it('plain words, no em dashes', () => {
    for (const k of ['title', 'desc', 'offer', 'completion']) assert.ok(!/—/.test(RADIO_QUEST[k]), k);
    assert.match(RADIO_QUEST.desc, new RegExp(`Play ${RADIO_QUEST_TUNES} tunes for crabs`));
  });
});

describe('2. the quest\'s size: Austin\'s 10 tunes for 8 crabs, on the crabs players can reach', () => {
  const graph = streetGraph(json('public/assets/content/signpost-graph.json'));
  const closed = closedForEveryone(json('public/assets/content/street-jobs.json'), {}, { starters: [index.default] });
  const open = openWorld(graph, { closed, starter: index.default, free: freeWays([...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) });

  it('5 of the 8 crab streets are on the open world; the other 3 are not', () => {
    assert.equal(CRAB_STREETS.length, WORLD_CRABS);
    const reach = CRAB_STREETS.filter((c) => open.has(c.tsid)).map((c) => c.tsid);
    assert.deepEqual(reach.sort(), [...RADIO_REACHABLE_CRABS].sort());
    assert.equal(reach.length, 5);
    for (const c of CRAB_STREETS) assert.ok(index.streets[c.tsid], `${c.label} is a street in the data`);
  });

  it('the goal scales 10 for 8 to the reachable crabs: 6, more than one game day of them', () => {
    assert.equal(radioTuneGoal(8, 8), 10);
    assert.equal(RADIO_QUEST_TUNES, radioTuneGoal(RADIO_REACHABLE_CRABS.length));
    assert.equal(RADIO_QUEST_TUNES, 6);
    assert.ok(RADIO_QUEST_TUNES > RADIO_REACHABLE_CRABS.length, 'still takes two game days, as 10 for 8 did');
    assert.equal(RADIO_QUEST.requirements[0].num, RADIO_QUEST_TUNES);
  });
});

describe('3. placing and moving it in Cultivate, as the Mail Dispatcher', () => {
  it('is a movable fixture of the home street', () => {
    assert.deepEqual(MOVABLE_FIXTURE_IDS, ['mailbox', 'rock', 'dispatcher', 'radio']);
    assert.equal(MOVABLE_FIXTURES.radio.classId, 'vine_radio');
    assert.equal(fixtureText('radio').banner, 'Move Vine Radio');
  });

  it('stands only once put out, at its usual spot just right of the Butler Box; put away keeps its spot and music', () => {
    const st = createCultivationState({});
    assert.equal(fixtureRx(st, 'radio'), null, 'not on the street until put out');
    const out = putOutRadio(st);
    assert.deepEqual(out, { ok: true, kept: false, rx: RADIO_USUAL_DX });
    assert.equal(radioOut(st), true);
    setRadioState(st, { on: true, pick: 'region:76' });
    st.radioRx = 900;
    assert.equal(putAwayRadio(st), true);
    assert.equal(fixtureRx(st, 'radio'), null);
    assert.deepEqual(radioState(st), { on: true, pick: 'region:76' });
    const back = putOutRadio(st);
    assert.equal(back.kept, true);
    assert.equal(back.rx, 900);
  });

  it('a move must be clear of the door, the other fixtures and the street\'s ends; cultivations keep clear of it', () => {
    const st = createCultivationState({ radioOut: true, yardRight: 3 });
    const layout = homeStreetLayout(st);
    assert.equal(fixtureFits(layout, 'radio', layout.houseX, {}).ok, true, 'nothing given, nothing in the way');
    assert.equal(fixtureFits(layout, 'radio', 10, {}).reason, 'edge');
    assert.equal(fixtureFits(layout, 'radio', layout.houseX + 300, { fixtures: [{ id: 'butler_box', x1: layout.houseX + 268, x2: layout.houseX + 332 }] }).reason, 'butler_box');
    const check = placementCheck(st, Object.keys(CULTIVATION_CLASSES)[0], RADIO_USUAL_DX);
    assert.equal(check.ok, false);
    assert.equal(check.reason, 'radio');
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /for \(const id of \['dispatcher', 'mailbox', 'rock', 'radio'\]\)/, 'pressed and dragged like the others');
    assert.match(homes, /'data-home-radio': 'put-out'/, 'Put out Vine Radio in the Cultivate banner');
    assert.match(homes, /'data-home-radio': 'put-away'/, 'Put away in its Cultivate actions');
  });
});

describe('4. what unlocks', () => {
  it('lists each region by its own name from the data, playing its hub\'s library; no library group labels', () => {
    const names = new Map();
    for (const s of Object.values(index.streets)) if (s.hubId != null) names.set(String(s.hubId), s.hubName);
    assert.equal(RADIO_REGIONS.length, 50);
    const libraries = new Set();
    for (const r of RADIO_REGIONS) {
      assert.equal(names.get(r.hubId), r.name, `hub ${r.hubId}`);
      assert.equal(resolveAmbientTheme({ hubId: r.hubId, hubName: r.name }), r.theme, r.name);
      assert.equal(ambient.themes[r.theme].order, 'library', r.name);
      assert.ok(!/,| and /.test(r.name), `${r.name} is one region`);
      libraries.add(r.theme);
    }
    assert.equal(libraries.size, 14, 'every region library but Hell\'s');
    // Every World Map region is listed.
    for (const hub of Object.keys(WORLD_MAP.regions)) assert.ok(RADIO_REGIONS.some((r) => r.hubId === hub), hub);
  });

  it('a region opens by visiting it', () => {
    const u = radioUnlocks({ config: ambient, hubs: ['56', '76'] });
    assert.deepEqual(u.regions.filter((r) => r.open).map((r) => r.name), ['Alakol', 'Groddle Forest']);
    assert.equal(pickOpen('region:76', u), true);
    assert.equal(pickOpen('region:27', u), false);
    assert.equal(u.regions.find((r) => r.name === 'Ix').tracks, 18);
  });

  it('a theme track opens by hearing it where the game plays it; the ones it never plays come with the radio', () => {
    const tracks = radioThemeTracks(ambient);
    assert.equal(tracks.length, 26);
    const u0 = radioUnlocks({ config: ambient });
    // #674: the three subway stand-ins play nowhere now (stations play their region's music), so they come with the radio.
    assert.equal(u0.tracks.filter((t) => t.open).length, 18);
    assert.equal(u0.tracks.filter((t) => !t.open).length, 8);
    const u1 = radioUnlocks({ config: ambient, heard: ['enchanted_woods_1344997332'] });
    assert.equal(pickOpen('track:enchanted_woods_1344997332', u1), true);
    assert.equal(pickOpen('track:enchanted_woods_1344997332', u0), false);
    // The party's lively stand-in counts for nothing: its three come with the radio.
    for (const url of ambient.themes.party_lively.tracks) {
      const t = tracks.find((r) => r.url === url);
      assert.equal(t.played, false, t.title);
    }
  });

  it('every place a track is "heard" is one the game plays it (street music it uses, or a sound or cue in the code)', () => {
    const used = new Set();
    for (const hub of Object.keys(ambient.hubMap)) if ([...Object.values(index.streets)].some((s) => String(s.hubId) === hub)) used.add(ambient.hubMap[hub]);
    for (const theme of Object.values(ambient.streetMusic)) used.add(theme);
    used.delete('party_lively');
    const keys = read('public/js/sound-keys.js');
    const game = read('public/game.js');
    const code = [game, read('public/js/meditation.js'), read('public/js/features/rube-feature.js'), read('public/js/machine-rooms.js')].join('\n');
    for (const id of Object.keys(HEARD_WHERE)) {
      const url = `assets/audio/ambient/${id}.mp3`;
      const inTheme = [...used].some((t) => (ambient.themes[t]?.tracks || []).includes(url));
      const key = new RegExp(`"([A-Z_0-9]+)": "${url.replace(/[.]/g, '\\.')}"`).exec(keys)?.[1];
      const played = inTheme || code.includes(url) || (key && (code.includes(`'${key}'`) || /spinningWheel/.test(game)));
      assert.ok(played, `${id} is played somewhere`);
    }
    assert.match(game, /noteMusicHeard\(url\);/, 'street music and cues report what they play');
  });

  it('musicblocks: owning them opens a medley of the owned tunes, each once with a short gap', () => {
    const blocks = ['musicblock_d_green_01', 'musicblock_b_brown_03'];
    const u = radioUnlocks({ config: ambient, blocks });
    assert.equal(pickOpen('blocks', u), true);
    assert.equal(pickOpen('blocks', radioUnlocks({ config: ambient })), false);
    const list = radioPlaylist('blocks', { config: ambient, blocks, blockAudio });
    assert.deepEqual(list.tracks, blocks.map(blockAudio));
    assert.equal(list.loop, false);
    assert.equal(list.gapSec, MEDLEY_GAP_SEC);
    const game = read('public/game.js');
    assert.match(game, /if \(list\.gapSec > 0\) setTimeout\(next, list\.gapSec \* 1000\);/);
  });

  it('a region plays each track once, then the next; a theme track loops', () => {
    const region = radioPlaylist('region:27', { config: ambient });
    assert.equal(region.tracks.length, 18);
    assert.equal(region.loop, false);
    const one = radioPlaylist('track:Tubamaphone_1292397289', { config: ambient });
    assert.equal(one.loop, true);
    assert.equal(one.tracks.length, 1);
    assert.equal(radioPlaylist('', { config: ambient }), null, 'street style music is the street\'s own');
  });
});

/** A small engine for the radio feature. */
function fakeEngine({ room = 'street', tsid = 'RH_HOME_EXT', home = null, street = null } = {}) {
  const data = {};
  let refreshed = 0;
  return {
    data,
    get refreshed() { return refreshed; },
    started: true,
    streetTsid: tsid,
    street: street || { tsid },
    inv: {},
    homeContext: () => ({ inHome: tsid.startsWith('RH_'), room }),
    query(name) {
      if (name === 'homeRadio') return room === 'street' && tsid === 'RH_HOME_EXT' ? home : null;
      return null;
    },
    setData(k, v) { data[k] = String(v); },
    param: () => null,
    refreshStreetMusic() { refreshed += 1; },
    streetMusicNow: () => null,
    setStreetMusicNear() {},
    pushActivity() {},
    save() {},
  };
}

describe('5. street only: the house and the Tower keep the home\'s own music', () => {
  const home = { x: 900, y: 600, state: { on: true, pick: 'region:76' } };

  it('on the home street the radio\'s playlist replaces the street music', () => {
    const out = radioFeature.streetMusicOverride({ tsid: 'RH_HOME_EXT' }, fakeEngine({ home }));
    assert.equal(out.key, 'region:76');
    assert.equal(out.tracks.length, 7);
  });

  it('in the house, on a Tower floor or with the radio stopped, nothing replaces it', () => {
    assert.equal(radioFeature.streetMusicOverride({ tsid: 'RH_HOME_INT' }, fakeEngine({ room: 'interior', tsid: 'RH_HOME_INT', home })), null);
    assert.equal(radioFeature.streetMusicOverride({ tsid: 'RH_HOME_EXT' }, fakeEngine({ home: { ...home, state: { on: false, pick: 'region:76' } } })), null);
    assert.equal(radioFeature.streetMusicOverride({ tsid: 'GLI2V0UN7RD1T2J' }, fakeEngine({ tsid: 'GLI2V0UN7RD1T2J', home })), null);
  });

  it('game.js asks for it whenever it sets a street\'s music', () => {
    const game = read('public/game.js');
    assert.match(game, /const radio = features\.query\('streetMusicOverride', street \|\| \{\}, engine\);/);
  });
});

describe('6. louder near the radio, never silent on its street', () => {
  it('full near it, easing down with distance to a floor', () => {
    assert.equal(radioNearLevel(0), 1);
    assert.equal(radioNearLevel(RADIO_FALLOFF.full), 1);
    let prev = 1;
    for (let d = RADIO_FALLOFF.full; d <= RADIO_FALLOFF.far + 600; d += 50) {
      const v = radioNearLevel(d);
      assert.ok(v <= prev + 1e-9, `falls at ${d}`);
      assert.ok(v >= RADIO_FALLOFF.floor, `floor at ${d}`);
      prev = v;
    }
    assert.equal(radioNearLevel(RADIO_FALLOFF.far), RADIO_FALLOFF.floor);
    assert.equal(radioNearLevel(-5000), RADIO_FALLOFF.floor);
    assert.ok(RADIO_FALLOFF.floor > 0);
  });

  it('it scales the street music\'s own mix, on the Music channel (no volume of its own)', () => {
    const game = read('public/game.js');
    assert.match(game, /const near = String\(ambientThemeId\)\.startsWith\('radio:'\) \? audio\.radioNear \?\? 1 : 1;/);
    assert.match(game, /const mix = near \* base;/);
  });
});

describe('7. visitors hear the owner\'s choice and can opt out', () => {
  const homeRadio = visitRadio({ radioOut: true, radio: { on: true, pick: 'region:27' } }, { owner: 'Pip', ownerId: 42 });

  it('a visit scene carries the owner\'s radio only while it stands out', () => {
    assert.equal(visitRadio({ radio: { on: true, pick: 'region:27' } }), null);
    assert.deepEqual(homeRadio, { owner: 'Pip', ownerId: '42', state: { on: true, pick: 'region:27' } });
    const nb = read('public/js/features/neighbours-mp-feature.js');
    assert.match(nb, /homeRadio: room === 'street' \? visitRadio\(visitorHomeState\(visit\.view\)\.cult/);
    assert.match(read('public/js/features/homes-feature.js'), /return \{ door, gate, mailbox, gardens, tower: yardOpts\.towerSpot \|\| null, radio \};/);
  });

  it('the visitor hears it, picks street music for this visit, then the radio again', () => {
    const street = { tsid: 'MPH_42', homeRadio };
    const engine = fakeEngine({ tsid: 'MPH_42', street });
    assert.equal(radioFeature.streetMusicOverride(street, engine).key, 'region:27');
    radioFeature._verb(engine, 'radio_optout');
    assert.equal(radioFeature.streetMusicOverride(street, engine), null);
    assert.equal(engine.data.radioOptOut, '1');
    radioFeature._verb(engine, 'radio_optin');
    assert.equal(radioFeature.streetMusicOverride(street, engine).key, 'region:27');
    assert.ok(engine.refreshed >= 2);
  });

  it('only the owner can change it: a visitor\'s menu is two rows', () => {
    const feature = read('public/js/features/vine-radio-feature.js');
    const visitor = feature.slice(feature.indexOf('function visitorVerbs('), feature.indexOf('function runRadioVerb('));
    assert.ok(!/radio_choose|radio_stop|radio_next/.test(visitor));
  });
});

describe('8. the save round trip', () => {
  it('the radio\'s spot, its standing out and its music save with the home street', () => {
    homesFeature.restore({ decor: {}, cult: { radioOut: true, radioRx: 777, radio: { on: true, pick: 'track:winterland_1344997854', junk: 1 } } });
    const slice = JSON.parse(JSON.stringify(homesFeature.save()));
    assert.equal(slice.cult.radioOut, true);
    assert.equal(slice.cult.radioRx, 777);
    assert.deepEqual(slice.cult.radio, { on: true, pick: 'track:winterland_1344997854' });
    homesFeature.restore(slice);
    assert.deepEqual(radioState(homesFeature._state().cult), { on: true, pick: 'track:winterland_1344997854' });
    homesFeature.restore(undefined);
  });

  it('a bad or empty choice saves nothing; a medley keeps its tunes for visitors', () => {
    assert.equal('radio' in normalizeCultivationState({ radio: { on: true, pick: 'region:9999' } }), false);
    assert.equal('radioOut' in normalizeCultivationState({ radioOut: 'yes' }), false);
    assert.deepEqual(normalizeRadioState({ on: true, pick: 'blocks', blocks: ['musicblock_d_red_01', 'bad thing'] }), { on: true, pick: 'blocks', blocks: ['musicblock_d_red_01'] });
  });

  it('what you have visited and heard saves in the radio\'s own slice', () => {
    radioFeature.restore({ hubs: ['76', 'x', '27'], heard: ['enchanted_woods_1344997332', '<bad>'] });
    assert.deepEqual(radioFeature.save(), { hubs: ['76', '27'], heard: ['enchanted_woods_1344997332'] });
    radioFeature.onEvent('hubs_visited:91', 1, {});
    assert.ok(radioFeature.save().hubs.includes('91'));
    radioFeature.restore(undefined);
    assert.deepEqual(radioFeature.save(), { hubs: [], heard: [] });
  });
});

describe('9. Choose music opens, a 2012 window in Classic', () => {
  let saved;
  before(() => {
    saved = globalThis.document;
    const { doc } = page();
    doc.documentElement = { dataset: { ui: 'classic' } };
    globalThis.document = doc;
  });
  after(() => {
    globalThis.document = saved;
  });

  it('the owner\'s Choose music opens the sheet with its three tabs, Street style music first', () => {
    // No spot: the sheet, not the sprite, is what this checks.
    const engine = fakeEngine({ home: { state: { on: true, pick: 'region:76' } } });
    engine.panelShell = null; // Classic has no panel shell
    radioFeature.restore({ hubs: ['76'] });
    assert.equal(radioFeature._verb(engine, 'radio_choose'), true);
    const panel = document.getElementById(RADIO_PANEL_ID);
    assert.ok(panel, 'mounted');
    assert.equal(panel.hidden, false);
    assert.ok(panel.classList.contains('side-panel') && panel.classList.contains('ui-sheet'));
    assert.equal(panel.querySelector('.ui-sheet-title').textContent, 'Choose music');
    assert.equal(panel.querySelectorAll('[role="tab"]').length, 3);
    const rows = panel.querySelectorAll('[data-vr-pick]');
    assert.equal(rows[0].dataset.vrPick, 'street');
    assert.ok(rows.some((r) => r.dataset.vrPick === 'region:76' && r.dataset.vrOpen === '1'));
    assert.ok(rows.some((r) => r.dataset.vrPick === 'region:27' && r.dataset.vrOpen === '0'));
    assert.equal(engine.data.radioSheet, 'regions');
    panel.querySelector('#vine-radio-close').click();
    assert.equal(panel.hidden, true);
  });

  it('Classic dresses it as its windows; it is a side sheet beside the world (walking still works)', () => {
    const classic = read('public/css/classic.css');
    assert.match(classic, /#projects-panel, #vine-radio-panel\) > \.side-card/);
    assert.match(classic, /#projects-panel, #vine-radio-panel, #map-panel, #make-panel\) :is\(\.side-head, \.map-head, \.ui-sheet-head\) \.verb-menu-x \{/);
    assert.ok(SIDE_SHEET_IDS.includes(RADIO_PANEL_ID));
  });
});

after(() => {
  setAmbientMusicConfig(getAmbientMusicConfig());
});
