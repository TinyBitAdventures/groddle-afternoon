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
