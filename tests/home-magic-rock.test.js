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

const spike = join(import.meta.dirname, '..');
const GS = join(spike, '../glitch-GameServerJS');
const ROCK_JS = join(GS, 'items/magic_rock.js');
const ids = (rows) => rows.map((r) => r.id);

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
  const { homesFeature } = await import('../public/js/features/homes-feature.js?v=homes-12');
  const { towerApi } = await import('../public/js/features/home-tower-feature.js?v=home-tower-6');
  const { shiftButlerRuntime } = await import('../public/js/features/butler-feature.js?v=butler-feature-9');
  const { homeEditing } = await import('../public/js/features/camera-mode-feature.js?v=g231-1');
  const { newxpFeature, __newxpTest } = await import('../public/js/features/newxp-feature.js?v=g148-4');
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
    homesFeature.restore({ decor: {}, cult: {}, magicRock: { cultivate: 'cultivate_complete', changestyle: 'howto_shown', expand: 'howto_shown' } });
    const engine = { pc: { level: 20 }, questState: towerQuest };
    assert.deepEqual(towerApi.rockTalk(engine), { tooltip: 'Talk to the Magic Rock!', subtitle: 'Build a Tower' });
    assert.deepEqual(ids(homesFeature.verbsFor(street, engine)), ['change_style', 'expand', 'cultivate_land', 'talk_to']);
    assert.deepEqual(ids(homesFeature.verbsFor(yard, engine)), ['change_style', 'expand', 'cultivate_land']);
    const quiet = { pc: { level: 3 }, questState: { active: {}, completed: [], offers: {} } };
    assert.equal(towerApi.rockTalk(quiet), null, 'nothing to give: no talk to');
    assert.deepEqual(ids(homesFeature.verbsFor(street, quiet)), ['change_style', 'expand', 'cultivate_land']);
  });

  it('talk to on the street rock runs the Tower’s talk; on the yard rock it is not the rock’s verb', () => {
    homesFeature.restore({ decor: {}, cult: {}, magicRock: {} });
    const said = [];
    const engine = { pc: { level: 20 }, questState: towerQuest, say: (who, text) => said.push(text) };
    assert.equal(homesFeature.runVerb(street, 'talk_to', engine), true);
    assert.equal(said.length, 1);
    assert.match(said[0], /Cultivate a Tower/);
    assert.equal(homesFeature.runVerb(yard, 'talk_to', engine), false);
  });

  it('the yard rule can fire on the street rock now (magic_rock.js 350)', () => {
    homesFeature.restore({ decor: {}, cult: {}, magicRock: { cultivate: 'howto_shown' } });
    const beats = [];
    const engine = { pc: { level: 3 }, questState: { active: {}, completed: [], offers: {} }, scriptedDialogue: (d) => beats.push(d), setData() {} };
    assert.equal(homesFeature.runVerb(street, 'cultivate_land', engine), true);
    assert.equal(beats.length, 1);
    assert.equal(beats[0].beats[0].text, ROCK_LINES.yardFirst[0].text);
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
