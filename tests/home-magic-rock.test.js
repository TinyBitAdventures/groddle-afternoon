/**
 * G226: the Magic Rock at home (js/magic-rock-home.js), from GSJS CC0
 * items/magic_rock.js (verbs 131-358, checkLevelCapForHowto 520-532,
 * doCultivationModeEnded 564-572), main.js doCultivationModeEnded 6062-6068
 * and locations/inc_homes.js homes_demo_backyard 2349-2358.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CULTIVATE_COMPLETE,
  HOWTO_LEVEL_CAP,
  HOWTO_SHOWN,
  HOWTO_TEXT,
  ROCK_LINES,
  ROCK_VERB_IDS,
  applyLevelCap,
  cultivateLandCheck,
  cultivationModeEnded,
  normalizeRockFlags,
  readHowto,
  rockVerbs,
} from '../public/js/magic-rock-home.js';
import {
  CULTIVATION_REWARDS_CAP,
  HOUSE_SIGN,
  HOUSE_SIGN_ART_DIR,
  dailyImgCounters,
  houseSignArt,
  houseSignCanExpand,
  imgBubbleText,
  imgRewardLine,
  imgRewards,
  rewardsCap,
} from '../public/js/magic-rock-home.js?v=g253-1';
import { getGameDayKey } from '../public/js/game-day.js?v=dametime-4';

const spike = join(import.meta.dirname, '..');
const GS = join(spike, '../glitch-GameServerJS');
const ROCK_JS = join(GS, 'items/magic_rock.js');
const ids = (rows) => rows.map((r) => r.id);
const today = () => getGameDayKey(Date.now());

describe('Magic Rock home verbs (magic_rock.js)', () => {
  it('a new player sees only the lessons, in sort_on order', () => {
    const flags = {};
    assert.deepEqual(ids(rockVerbs(flags, { level: 3 })), ['howto_changestyle', 'howto_expand', 'howto_cultivate']);
    assert.deepEqual(flags, {}, 'below level 6 nothing is set by looking');
  });

  it('each lesson swaps for its verb (howto_shown)', () => {
    const flags = {};
    const pages = readHowto(flags, 'howto_cultivate');
    assert.equal(flags.cultivate, HOWTO_SHOWN);
    assert.equal(pages.length, 5);
    assert.equal(pages[3], '(The first thing you cultivate must be cultivated in your yard.)');
    assert.deepEqual(ids(rockVerbs(flags, { level: 3 })), ['howto_changestyle', 'howto_expand', 'cultivate_land']);
    readHowto(flags, 'howto_expand');
    readHowto(flags, 'howto_changestyle');
    assert.deepEqual(ids(rockVerbs(flags, { level: 3 })), ['change_style', 'expand', 'cultivate_land']);
    assert.equal(readHowto(flags, 'expand'), null, 'only How To verbs teach');
  });

  it('level 6 skips every lesson (checkLevelCapForHowto)', () => {
    assert.equal(HOWTO_LEVEL_CAP, 6);
    const flags = {};
    assert.equal(applyLevelCap(flags, 5), false);
    assert.deepEqual(ids(rockVerbs(flags, { level: 6 })), ['change_style', 'expand', 'cultivate_land']);
    assert.equal(flags.cultivate, CULTIVATE_COMPLETE);
    assert.deepEqual(cultivateLandCheck(flags, 'street'), { ok: true });
  });

  it('expand reads "Expand your yard" in the yard and "Expand your street" outside', () => {
    const flags = { expand: HOWTO_SHOWN };
    assert.equal(rockVerbs(flags, { room: 'yard' }).find((v) => v.id === 'expand').tooltip, 'Expand your yard');
    assert.equal(rockVerbs(flags, { room: 'street' }).find((v) => v.id === 'expand').tooltip, 'Expand your street');
    assert.deepEqual(ROCK_VERB_IDS, ['howto_changestyle', 'howto_expand', 'howto_cultivate', 'change_style', 'expand', 'cultivate_land']);
  });
});

describe('the first cultivation happens in the yard (magic_rock.js 350)', () => {
  it('refuses Cultivate Land on the street until cultivation mode has ended once', () => {
    const flags = {};
    readHowto(flags, 'howto_cultivate');
    assert.deepEqual(cultivateLandCheck(flags, 'yard'), { ok: true });
    const street = cultivateLandCheck(flags, 'street');
    assert.equal(street.ok, false);
    assert.equal(street.lines, ROCK_LINES.yardFirst);
    // doCultivationModeEnded: the first time says Good work and completes it.
    assert.equal(cultivationModeEnded(flags), ROCK_LINES.goodWork);
    assert.equal(flags.cultivate, CULTIVATE_COMPLETE);
    assert.deepEqual(cultivateLandCheck(flags, 'street'), { ok: true });
    assert.equal(cultivationModeEnded(flags), null, 'only once');
  });

  it('says nothing with no lesson read (pc.magic_rock unset), and any lesson completes cultivation', () => {
    assert.equal(cultivationModeEnded({}), null);
    const flags = {};
    readHowto(flags, 'howto_expand');
    assert.equal(cultivationModeEnded(flags), null);
    assert.equal(flags.cultivate, CULTIVATE_COMPLETE, 'pc.magic_rock existed, so cultivate_complete');
    assert.ok(ids(rockVerbs(flags, { level: 2 })).includes('cultivate_land'));
  });

  it('keeps only known flags from a save', () => {
    assert.deepEqual(normalizeRockFlags({ cultivate: 'cultivate_complete', expand: 'howto_shown', keys: 'howto_shown', changestyle: 'x' }), { cultivate: 'cultivate_complete', expand: 'howto_shown' });
    assert.deepEqual(normalizeRockFlags({ expand: 'cultivate_complete' }), {});
    assert.deepEqual(normalizeRockFlags(null), {});
  });
});

describe('source wording', { skip: !existsSync(ROCK_JS) }, () => {
  const src = existsSync(ROCK_JS) ? readFileSync(ROCK_JS, 'utf8') : '';
  const gsString = (text) => text.replace(/'/g, "\\'");

  it('the How To pages are the announce_vog_fade text', () => {
    for (const [key, text] of Object.entries(HOWTO_TEXT)) {
      const raw = key === 'changestyle' ? text.replace("'Change Style’", "\\'Change Style\\’") : gsString(text);
      assert.ok(src.includes(`pc.announce_vog_fade('${raw}'`), key);
    }
  });

  it('the rock lines are conversation_start pages', () => {
    const [a, b] = ROCK_LINES.yardFirst;
    assert.ok(src.includes(`'${a.text} <split butt_txt=\\"${a.response}\\" />${b.text}', {txt:'${b.response}'}`));
    const [c, d] = ROCK_LINES.goodWork;
    assert.ok(src.includes(`"${c.text} <split butt_txt=\\"${c.response}\\">${d.text}", [{txt:'${d.response}'}]`));
  });

  it('the verbs keep their names, tooltips and sort order', () => {
    const rows = rockVerbs({ changestyle: HOWTO_SHOWN, expand: HOWTO_SHOWN, cultivate: CULTIVATE_COMPLETE }, { level: 1 })
      .concat(rockVerbs({}, { level: 1 }));
    for (const row of rows) {
      const at = src.indexOf(`verbs.${row.id} = {`);
      assert.ok(at >= 0, row.id);
      const block = src.slice(at, at + 400);
      assert.ok(block.includes(`"name"\t\t\t\t: "${row.label}"`), row.id);
      if (row.id !== 'expand') assert.ok(block.includes(`"tooltip"\t\t\t: "${row.tooltip}"`), row.id);
    }
  });

  it('puts the yard rock at (-29, -155), owner only', () => {
    const homes = readFileSync(join(GS, 'locations/inc_homes.js'), 'utf8');
    assert.match(homes, /function homes_demo_backyard\(\)\{[\s\S]*?apiPutItemIntoPosition\(i5, -29, -155\);\s*i5\.setProp\('only_visible_to'/);
    const feature = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /const YARD_ROCK = Object\.freeze\(\{ dx: -29 \}\);/);
  });
});

/*
 * G231: the home street's rock (inc_homes.js homes_demo_frontyard 2469-2471),
 * the Tower's talk to merged into it (magic_rock.js onCreate 773-781, talk_to
 * 360-386), the tutorial rock holding the street, the Butler on a left street
 * expansion, and the C / shift+C keys (TSMainView.as cKeyHandler 790-800,
 * shiftCKeyHandler 816-828; HouseManager.as startCultivation 102-118).
 */
describe('the home street rock (G231)', async () => {
  const { homesFeature } = await import('../public/js/features/homes-feature.js?v=homes-43');
  const { towerApi } = await import('../public/js/features/home-tower-feature.js?v=home-tower-15');
  const { shiftButlerRuntime } = await import('../public/js/features/butler-feature.js?v=butler-feature-42');
  const { homeEditing } = await import('../public/js/features/camera-mode-feature.js?v=g231-1');
  const { newxpFeature, __newxpTest } = await import('../public/js/features/newxp-feature.js?v=play-2');
  const street = { classId: 'magic_rock', state: { room: 'street' } };
  const yard = { classId: 'magic_rock', state: { room: 'yard' } };
  const towerQuest = { active: { build_a_tower: { started: 1 } }, completed: [], offers: {} };

  it('stands at (221, -144) on the home street, owner only, in the source and here', () => {
    const homes = readFileSync(join(GS, 'locations/inc_homes.js'), 'utf8');
    assert.match(homes, /function homes_demo_frontyard\([^)]*\)\{[\s\S]*?apiPutItemIntoPosition\(i5, 221, -144\);\s*i5\.setProp\('only_visible_to', this\.owner\.tsid\);/);
    const feature = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /const STREET_ROCK = Object\.freeze\(\{ dx: 221 \}\);/);
    assert.match(feature, /homeContext\?\.\(\)\.owned === true/);
    // One rock a street: the Tower module no longer draws its own.
    const tower = readFileSync(join(spike, 'public/js/features/home-tower-feature.js'), 'utf8');
    assert.doesNotMatch(tower, /function spawnRock\(|rock_read\.png/);
  });

  it('the street rock adds the Tower quest’s talk to after its home verbs; the yard rock never does', () => {
    // G232: today's iMG already handed over, so only the Tower can bring talk to.
    homesFeature.restore({ decor: {}, cult: {}, magicRock: { cultivate: 'cultivate_complete', changestyle: 'howto_shown', expand: 'howto_shown' }, rockImgDay: today() });
    const engine = { pc: { level: 20 }, questState: towerQuest };
    assert.deepEqual(towerApi.rockTalk(engine), { tooltip: 'Talk to the Magic Rock!', subtitle: 'Build a Tower' });
    assert.deepEqual(ids(homesFeature.verbsFor(street, engine)), ['change_style', 'expand', 'cultivate_land', 'talk_to']);
    assert.deepEqual(ids(homesFeature.verbsFor(yard, engine)), ['change_style', 'expand', 'cultivate_land']);
    const quiet = { pc: { level: 3 }, questState: { active: {}, completed: [], offers: {} } };
    assert.equal(towerApi.rockTalk(quiet), null, 'nothing to give: no talk to');
    assert.deepEqual(ids(homesFeature.verbsFor(street, quiet)), ['change_style', 'expand', 'cultivate_land']);
  });

  it('talk to on the street rock runs the Tower’s talk; on the yard rock it has nothing to say', () => {
    homesFeature.restore({ decor: {}, cult: {}, magicRock: {}, rockImgDay: today() });
    const said = [];
    const engine = { pc: { level: 20 }, questState: towerQuest, say: (who, text) => said.push(text) };
    assert.equal(homesFeature.runVerb(street, 'talk_to', engine), true);
    assert.equal(said.length, 1);
    assert.match(said[0], /Cultivate a Tower/);
    assert.equal(homesFeature.runVerb(yard, 'talk_to', engine), true, 'the rock’s verb, not offered: nothing happens');
    assert.equal(said.length, 1);
  });

  it('the yard rule can fire on the street rock now (magic_rock.js 350)', () => {
    homesFeature.restore({ decor: {}, cult: {}, magicRock: { cultivate: 'howto_shown' } });
    const beats = [];
    const engine = { pc: { level: 3 }, questState: { active: {}, completed: [], offers: {} }, scriptedDialogue: (d) => beats.push(d), setData() {} };
    assert.equal(homesFeature.runVerb(street, 'cultivate_land', engine), true);
    assert.equal(beats.length, 1);
    assert.equal(beats[0].beats[0].text, ROCK_LINES.yardFirst[0].text);
  });

  it('a how-to is a VOG (announce_vog_fade, width 600), not the quest card (G311)', () => {
    homesFeature.restore({ decor: {}, cult: {}, magicRock: {} });
    const vogs = [];
    const beats = [];
    const data = {};
    const engine = {
      pc: { level: 3 },
      questState: { active: {}, completed: [], offers: {} },
      vog: (opts) => vogs.push(opts),
      scriptedDialogue: (d) => beats.push(d),
      setData: (k, v) => { data[k] = v; },
    };
    assert.equal(homesFeature.runVerb(yard, 'howto_cultivate', engine), true);
    assert.equal(beats.length, 0, 'no card');
    assert.equal(vogs.length, 1);
    assert.equal(vogs[0].width, 600);
    const rock = readFileSync(join(GS, 'items/magic_rock.js'), 'utf8');
    const said = rock.match(/announce_vog_fade\('(Cultivation allows[^']*(?:\\'[^']*)*)', \{width: '600'\}\)/);
    assert.ok(said, 'magic_rock.js howto_cultivate');
    assert.deepEqual(vogs[0].lines, said[1].replace(/\\'/g, "'").split('//'));
    assert.equal(data.homeRockLast, 'howto_cultivate');
    assert.equal(homesFeature.save().magicRock.cultivate, 'howto_shown');
  });

  it('hides while the tutorial’s own rock has the home street (newxp homeRockHeld)', () => {
    const saved = __newxpTest.save;
    try {
      __newxpTest.save = { ...saved, status: 'active', island: 'go_home' };
      assert.equal(newxpFeature.homeRockHeld({ streetTsid: 'RH_HOME_EXT' }), true);
      assert.equal(newxpFeature.homeRockHeld({ streetTsid: 'LA5101HF7F429V3' }), null, 'only on the home street');
      __newxpTest.save = { ...saved, status: 'done', island: 'go_home' };
      assert.equal(newxpFeature.homeRockHeld({ streetTsid: 'RH_HOME_EXT' }), null, 'after the tutorial the street rock is the rock');
    } finally {
      __newxpTest.save = saved;
    }
  });

  it('the Butler’s live x, walk and facing move with a left street expansion; his post stays house-relative', () => {
    const r = { x: 900, walkTo: 1000, faceX: 950 };
    assert.equal(shiftButlerRuntime(r, 'street', 150), true);
    assert.deepEqual(r, { x: 1050, walkTo: 1150, faceX: 1100 });
    assert.equal(shiftButlerRuntime(r, 'interior', 150), false, 'the house x shift is not his');
    const unplaced = { x: 0, walkTo: null };
    shiftButlerRuntime(unplaced, 'street', 150);
    assert.deepEqual(unplaced, { x: 0, walkTo: null }, 'x 0: not placed yet, spawnView puts him at his post');
    const butler = readFileSync(join(spike, 'public/js/features/butler-feature.js'), 'utf8');
    assert.match(butler, /homeRoomShifted\(room, dx\) \{\s*if \(shiftButlerRuntime\(rt, room, dx\) && pendingOpenAt\) pendingOpenX \+= dx;/);
  });

  it('shift+C away from home clicks and is handled (no Making); Camera Mode leaves plain C alone in edit modes', () => {
    homesFeature.onStreetClear({});
    const sounds = [];
    const data = {};
    const engine = { homeContext: () => ({ inHome: false }), playSound: (k) => sounds.push(k), setData: (k, v) => { data[k] = v; } };
    assert.equal(homesFeature.cultivateKey(engine), true);
    assert.deepEqual(sounds, ['CLICK_FAILURE']);
    assert.equal(data.homeCultivateKey, 'failed');
    assert.equal(homesFeature.homeEditMode(), null);
    assert.equal(homeEditing({ query: (hook) => (hook === 'homeEditMode' ? 'cultivate' : null) }), true);
    assert.equal(homeEditing({ query: () => null }), false);
    const client = join(spike, '../glitch-client/com/tinyspeck/engine/view/TSMainView.as');
    if (existsSync(client)) {
      const src = readFileSync(client, 'utf8');
      assert.match(src, /private function cKeyHandler[\s\S]*?if \(model\.stateModel\.decorator_mode \|\| model\.stateModel\.chassis_mode \|\| model\.stateModel\.cult_mode\) return;/);
      const hm = readFileSync(join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseManager.as'), 'utf8');
      assert.match(hm, /private function onCultStart[\s\S]*?\} else \{\s*SoundMaster\.instance\.playSound\('CLICK_FAILURE'\);/);
    }
  });
});

/*
 * G232: talk to hands over the home street's daily iMG (magic_rock.js
 * 380-446, inc_houses.js 1706-1715, inc_cultivation.js 168-292), else sends
 * houses_upgrade_start (448-458), the client's HouseSignDialog
 * (NCMsgHandler.as 3093-3096). Solo: no visitors, so only the stipend.
 */
describe('the rock’s daily iMG and the house sign (G232)', async () => {
  const { homesFeature } = await import('../public/js/features/homes-feature.js?v=homes-43');
  const street = { classId: 'magic_rock', state: { room: 'street' } };
  const yard = { classId: 'magic_rock', state: { room: 'yard' } };
  const quiet = { active: {}, completed: [], offers: {} };
  const src = existsSync(ROCK_JS) ? readFileSync(ROCK_JS, 'utf8') : '';
  const cultSrc = existsSync(join(GS, 'locations/inc_cultivation.js')) ? readFileSync(join(GS, 'locations/inc_cultivation.js'), 'utf8') : '';

  it('keeps cultivation_rewards_cap row for row, and the stipend rule', { skip: !cultSrc }, () => {
    const table = cultSrc.match(/var cultivation_rewards_cap = \[([\s\S]*?)\];/)[1].match(/\d+/g).map(Number);
    assert.deepEqual([...CULTIVATION_REWARDS_CAP], table);
    assert.equal(table.length, 60);
    assert.match(cultSrc, /if \(pc\.stats_get_level\(\) >= 2\)\{\s*best_amount \+= Math\.round\(cap \* 0\.20\);/);
    // The owner never adds to their own pool; visitors only (the solo reading).
    assert.match(cultSrc, /if \(!config\.is_dev && this\.pols_is_owner\(pc\)\) return false;/);
    assert.match(cultSrc, /if \(pc\.stats_get_daily_counter\('cultivation_img_rewards'\)\) return 0;/);
  });

  it('solo: nothing at level 1, then 20% of the level’s cap once a game day', () => {
    assert.equal(imgRewards({ level: 1 }), 0);
    assert.equal(imgRewards({ level: 2 }), 15);
    assert.equal(imgRewards({ level: 20 }), 165);
    assert.equal(imgRewards({ level: 60 }), 915);
    assert.equal(imgRewards({ level: 75 }), 915, 'past the table: its last row');
    assert.equal(imgRewards({ level: 20, cashedToday: true }), 0);
    assert.equal(rewardsCap(1), 50);
    // With a visitors' pool: the best earlier day, capped; today never counts.
    assert.equal(imgRewards({ level: 2, pool: { d1: 40, d2: 900, d3: 5000 }, today: 'd3' }), 75 + 15);
    assert.equal(imgRewards({ level: 1, pool: { d1: 30 }, today: 'd2' }), 30);
  });

  it('keeps the source’s words and badge thresholds', { skip: !src }, () => {
    assert.ok(src.includes('My observations today have resulted in <b>"+img_rewards+" iMG</b>. Remember: the more stuff visitors do on your home street, the more you’ll earn.'));
    assert.equal(imgRewardLine(165), 'My observations today have resulted in 165 iMG. Remember: the more stuff visitors do on your home street, the more you’ll earn.');
    assert.ok(src.includes('I have some iMG for you. Click on me and I’ll hand it over.'));
    assert.equal(imgBubbleText(), 'Hey friend, I have some iMG for you. Click on me and I’ll hand it over.');
    assert.deepEqual(dailyImgCounters(503), []);
    assert.deepEqual(dailyImgCounters(515), ['daily_img:five_hundred_three']);
    assert.deepEqual(dailyImgCounters(2504), ['daily_img:five_hundred_three', 'daily_img:one_thousand_nine', 'daily_img:twenty_five_hundred_three']);
    assert.match(src, /type:'houses_upgrade_start',/);
  });

  it('talk to shows on either rock while there is iMG, hands it over once, then opens the house sign', () => {
    homesFeature.restore({ decor: {}, cult: {}, magicRock: { cultivate: 'cultivate_complete', changestyle: 'howto_shown', expand: 'howto_shown' } });
    const beats = [];
    const counters = [];
    const data = {};
    const pc = { level: 40, imagination: 100, xp: 1000 };
    const engine = {
      pc,
      questState: quiet,
      scriptedDialogue: (d) => beats.push(d),
      achievement: (c) => counters.push(c),
      setData: (k, v) => { data[k] = v; },
      homeContext: () => ({ inHome: false }),
    };
    assert.deepEqual(ids(homesFeature.verbsFor(yard, engine)), ['change_style', 'expand', 'cultivate_land', 'talk_to']);
    assert.deepEqual(ids(homesFeature.verbsFor(street, engine)), ['change_style', 'expand', 'cultivate_land', 'talk_to']);
    assert.equal(homesFeature.runVerb(yard, 'talk_to', engine), true);
    assert.equal(pc.imagination, 100 + 515);
    assert.equal(pc.xp, 1000 + 515);
    assert.deepEqual(counters, ['daily_img:five_hundred_three']);
    assert.equal(beats.length, 1);
    assert.equal(beats[0].beats[0].text, imgRewardLine(515));
    assert.equal(data.homeRockLast, 'img:515');
    assert.equal(homesFeature.save().rockImgDay, today());
    // Nothing more today: talk to leaves the menu. A click from a stale menu does nothing: the
    // server checks a verb's conditions again before its handler (main.js 3067-3079).
    assert.deepEqual(ids(homesFeature.verbsFor(yard, engine)), ['change_style', 'expand', 'cultivate_land']);
    assert.equal(homesFeature.runVerb(yard, 'talk_to', engine), true, 'not offered: nothing');
    assert.equal(pc.imagination, 615);
  });

  it('the Tower offer still comes before the iMG on the street rock', () => {
    const feature = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    const body = feature.slice(feature.indexOf('function talkToRock('), feature.indexOf('function handOverImg('));
    assert.ok(body.indexOf('towerApi.rockOffer') < body.indexOf('rockImgToCollect'));
    assert.ok(body.indexOf('rockImgToCollect') < body.indexOf('openHouseSign'));
    const tower = readFileSync(join(spike, 'public/js/features/home-tower-feature.js'), 'utf8');
    assert.match(tower, /rockOffer: \(engine\) => rockOffers\(engine\)\.length > 0,/);
  });

  it('the house sign has the client’s title, buttons and Expand rule', () => {
    assert.equal(HOUSE_SIGN.title, 'Your street');
    assert.deepEqual(HOUSE_SIGN.buttons.map((b) => b.label), ['Expand', 'Change Style', 'Cultivate Land']);
    assert.equal(HOUSE_SIGN.expandTip, 'Your street is already sooo big!');
    assert.equal(houseSignCanExpand({ room: 'street', countLeft: 0, countRight: 2 }), true);
    assert.equal(houseSignCanExpand({ room: 'street', countLeft: 0, countRight: 0 }), false);
    assert.equal(houseSignCanExpand({ room: 'yard', count: 1 }), true);
    assert.equal(houseSignCanExpand({ room: 'yard', count: 0 }), false);
    const dlg = join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseSignDialog.as');
    if (existsSync(dlg)) {
      const as = readFileSync(dlg, 'utf8');
      assert.match(as, /_setTitle\('Your street'\);/);
      assert.match(as, /buildButton\('Expand', onExpandClick\)[\s\S]*buildButton\('Change Style', onChangeStyleClick\)[\s\S]*buildButton\('Cultivate Land', onCutivateClick\)/);
      assert.ok(as.includes("{txt:'Your street is already sooo big!'"));
    }
  });

  it('G253: the house sign buttons carry the client’s street_* icons (buildButton 146-193)', () => {
    assert.deepEqual(HOUSE_SIGN.buttons.map((b) => b.art), ['expand', 'style', 'cultivate']);
    assert.equal(houseSignArt('expand'), 'assets/ui/house-sign/street_expand.png');
    assert.equal(houseSignArt('style', 'hover'), 'assets/ui/house-sign/street_style_hover.png');
    assert.equal(houseSignArt('cultivate', 'disabled'), 'assets/ui/house-sign/street_cultivate_disabled.png');
    for (const b of HOUSE_SIGN.buttons) {
      for (const state of ['', 'hover', 'disabled']) {
        const file = join(spike, 'public', houseSignArt(b.art, state));
        assert.ok(existsSync(file), file);
        const client = join(spike, '../glitch-client/TSEngineAssets/src', HOUSE_SIGN_ART_DIR.replace('assets/ui/house-sign/', 'assets/graphics/'), houseSignArt(b.art, state).split('/').pop());
        if (existsSync(client)) assert.ok(readFileSync(client).equals(readFileSync(file)), `${b.art} ${state} is Tiny Speck's own PNG`);
      }
    }
    const dlg = join(spike, '../glitch-client/com/tinyspeck/engine/port/HouseSignDialog.as');
    if (existsSync(dlg)) {
      const as = readFileSync(dlg, 'utf8');
      assert.match(as, /case onExpandClick:\s*image_name = 'expand';[\s\S]*case onChangeStyleClick:\s*image_name = 'style';[\s\S]*case onCutivateClick:\s*image_name = 'cultivate';/);
      assert.match(as, /graphic = new AssetManager\.instance\.assets\['street_'\+image_name\];/);
    }
    const feature = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /--hsd-ic:url\(\$\{houseSignArt\(row\.art\)\}\)/);
  });

  it('G253: the rock closes its bubble through engine.closeSay, not game.js internals', () => {
    const feature = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /engine\.closeSay\?\.\(rockBubble\)/);
    assert.ok(!feature.includes('_speechFx'), 'no feature reaches into a bubble');
    const game = readFileSync(join(spike, 'public/game.js'), 'utf8');
    const api = game.slice(game.indexOf('  closeSay(targetOrBubble'), game.indexOf('  closeSay(targetOrBubble') + 600);
    assert.match(api, /if \(now\) removeSpeechBubble\(bubble\);\s*else meta\.max = Math\.min\(meta\.max, meta\.life \+ 24\);/);
  });

  it('the street rock’s subtitle follows the Tower offer while you stand there', () => {
    const feature = readFileSync(join(spike, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /\} else if \(have && refreshRockSubtitle\(engine\)\) \{/);
  });
});
