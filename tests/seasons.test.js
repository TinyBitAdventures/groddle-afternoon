/**
 * Seasonal calendar and holiday rules (js/seasons.js) plus the feature's
 * vendor stock and eating gates.
 * Run: node --test tests/seasons.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIRES_SPRITES } from '../public/js/sprite-hires.js';
import { HIRES_ICONS } from '../public/js/icon-hires.js';
import {
  CANDY_DAILY_MAX,
  CARVED_CLASSES,
  EGG_CLASSES,
  LIT_CLASSES,
  PI_DIGITS,
  SEASONS,
  activeSeasons,
  calendarSeasons,
  candyEatGate,
  carveCheck,
  carveOutcome,
  createSeasonState,
  crackerNote,
  easterSunday,
  eggForStreet,
  estimatePi,
  isDametimeZilloween,
  isPiDay,
  lightCheck,
  nogCheck,
  parseSeasonDate,
  pieEatGate,
  placeCheck,
  pumpkinTreat,
  recordCandyEaten,
  recordCandyGiven,
  recordCarvedFace,
  saysYay,
  seasonYearKey,
  seasonalConversions,
  smashOutcome,
  syncCards,
  teachPhrase,
  yetiMailDue,
  yetiQuote,
} from '../public/js/seasons.js';
import { SEASON_DATA } from '../public/js/seasons-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const seq = (...vals) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe('seasonal calendar', () => {
  it('opens Zilloween, Glitchmas and the Egg Hunt on their real-world dates', () => {
    assert.deepEqual(calendarSeasons(at(2026, 10, 20)), ['zilloween']);
    assert.deepEqual(calendarSeasons(at(2026, 10, 31)), ['zilloween']);
    assert.deepEqual(calendarSeasons(at(2026, 11, 2)), []);
    assert.deepEqual(calendarSeasons(at(2026, 12, 24)), ['glitchmas']);
    assert.deepEqual(calendarSeasons(at(2027, 1, 3)), ['glitchmas']);
    assert.deepEqual(calendarSeasons(at(2027, 1, 4)), []);
    assert.deepEqual(easterSunday(2027), [3, 28]);
    assert.deepEqual(easterSunday(2026), [4, 5]);
    assert.deepEqual(calendarSeasons(at(2027, 3, 22)), ['egg_hunt']);
    assert.deepEqual(calendarSeasons(at(2027, 3, 30)), []);
  });

  it('keeps the source Pi Day test (March 14 anywhere on Earth)', () => {
    assert.equal(isPiDay(Date.UTC(2027, 2, 14, 3)), true);
    assert.equal(isPiDay(Date.UTC(2027, 2, 13, 13)), true);
    assert.equal(isPiDay(Date.UTC(2027, 2, 15, 11)), true);
    assert.equal(isPiDay(Date.UTC(2027, 2, 15, 12)), false);
    assert.equal(isPiDay(Date.UTC(2027, 2, 13, 11)), false);
  });

  it('runs the source Dametime Zilloween from Remember 25 and honours the QA override', () => {
    assert.equal(isDametimeZilloween({ month: 'Remember', monthDay: 25 }), true);
    assert.equal(isDametimeZilloween({ month: 'Remember', monthDay: 24 }), false);
    assert.equal(isDametimeZilloween({ month: 'Doom', monthDay: 30 }), false);
    const quiet = at(2026, 6, 1);
    assert.deepEqual(activeSeasons(quiet, { dametime: { month: 'Remember', monthDay: 37 } }), { ids: ['zilloween'], primary: 'zilloween', via: 'dametime' });
    assert.deepEqual(activeSeasons(at(2026, 10, 20), { override: 'none' }).ids, []);
    assert.deepEqual(activeSeasons(quiet, { override: 'glitchmas' }), { ids: ['glitchmas'], primary: 'glitchmas', via: 'override' });
    assert.equal(parseSeasonDate('2026-12-24'), at(2026, 12, 24));
    assert.equal(seasonYearKey('glitchmas', at(2027, 1, 2)), 'glitchmas:2026');
  });

  it('has art for every event icon and every holiday item', () => {
    for (const s of Object.values(SEASONS)) assert.ok(existsSync(join(root, 'assets/sprites/icons', `${s.icon}.png`)), s.icon);
    for (const id of Object.keys(SEASON_DATA.items)) assert.ok(existsSync(join(root, 'assets/sprites/icons', `${id}.png`)), id);
    for (const n of [1, 2, 3, 4, 5]) assert.ok(existsSync(join(root, `assets/sprites/seasons/pumpkin_lit_${n}_talk.png`)));
  });

  it('draws every street sprite from a sheet or icon with a 3x render', () => {
    const src = readFileSync(join(root, 'js/features/seasons-feature.js'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(root, '../tools/vector-sprites/seasons.json'), 'utf8'));
    const sheets = new Map(manifest.jobs.flatMap((j) => j.sheets.map((s) => [s.path, s])));
    // The talk sheets keep the feature's cell size and 19 x 74 frame order.
    const size = Function(`return ${/const TALK_SIZE = (\{[^;]+\});/.exec(src)[1]}`)();
    assert.match(src, /const TALK_COLS = 19;/);
    assert.match(src, /const TALK_FRAMES = 74;/);
    for (const n of [1, 2, 3, 4, 5]) {
      const path = `assets/sprites/seasons/pumpkin_lit_${n}_talk.png`;
      const s = sheets.get(path);
      assert.deepEqual([s.fw, s.fh, s.cols, s.frames, s.label], [...size[n], 19, 74, 'talk'], path);
      assert.match(HIRES_SPRITES.get(path) || '', /@3x\.webp$/, path);
    }
    for (const path of ['assets/sprites/seasons/egghunt_egg_4_world.png', 'assets/sprites/seasons/glitchmas_cracker_world.png']) {
      assert.ok(src.includes(`'${path}'`), path);
      assert.match(HIRES_SPRITES.get(path) || '', /@3x\.webp$/, path);
    }
    // Eggs 1, 2, 3 and 5 look like their icon in the world, so they draw it (3x via icon-hires).
    assert.match(src, /assets\/sprites\/icons\/egghunt_egg_\$\{n\}\.png/);
    for (const n of [1, 2, 3, 5]) assert.ok(HIRES_ICONS.has(`egghunt_egg_${n}`), n);
    // Placed carved pumpkins draw their pack icon.
    for (const cls of CARVED_CLASSES) assert.ok(HIRES_ICONS.has(cls), cls);
  });
});

describe('Zilloween pumpkins', () => {
  it('gates carving in the source order', () => {
    const ok = { zilloween: true, hasPick: true, hasKnife: true, energy: 40 };
    assert.equal(carveCheck(ok).ok, true);
    assert.equal(carveCheck({ ...ok, zilloween: false }).msg, 'You can only carve a pumpkin during Zilloween!');
    assert.match(carveCheck({ ...ok, hasKnife: false }).msg, /Pick \(or Fancy Pick\) and a Knife & Board/);
    assert.match(carveCheck({ ...ok, energy: 15 }).msg, /enough energy/);
  });

  it('pays a face, 5 Pepitas and a Clump of Jellisac for 15 energy, +10 mood, +5 iMG', () => {
    const out = carveOutcome(seq(0.99, 0));
    assert.equal(out.face, 5);
    assert.deepEqual(out.outputs, [['pumpkin_carved_5', 1], ['pepitas', 5], ['jellisac_clump', 1]]);
    assert.deepEqual(out.effects, { energy: -15, mood: 10, xp: 5 });
    assert.equal(out.counter, 'pumpkins_carved:number_5');
    assert.equal(out.growl, SEASON_DATA.carveGrowls[0]);
    assert.equal(SEASON_DATA.carveGrowls.length, 9);
  });

  it('awards Pumpkin Carver at all five faces and keeps light, smash and place rules', () => {
    const state = createSeasonState();
    for (const f of [1, 2, 2, 3, 4]) assert.equal(recordCarvedFace(state, f), false);
    assert.equal(recordCarvedFace(state, 5), true);
    assert.equal(lightCheck(6).ok, false);
    assert.equal(lightCheck(7).ok, true);
    assert.deepEqual(smashOutcome(CARVED_CLASSES[0]).items, [['pepitas', 5]]);
    assert.deepEqual(smashOutcome(LIT_CLASSES[2]).items, [['pumpkin_pie', 1]]);
    assert.match(placeCheck({}).msg, /near the entrance to your house/);
    assert.equal(placeCheck({ inHome: true }).ok, true);
  });

  it('learns three phrases at most', () => {
    const list = [];
    assert.match(teachPhrase(list, 'Boo').msg, /MWA-HA-HA! Now I've learned how to say "Boo"/);
    teachPhrase(list, 'Two');
    teachPhrase(list, 'Three');
    assert.equal(teachPhrase(list, 'Four').ok, false);
    assert.equal(list.length, 3);
  });

  it('treats or tricks once a street a game day', () => {
    const state = createSeasonState();
    const treat = pumpkinTreat(state, 'GA1', 'day1', seq(0.1, 0.6, 0));
    assert.equal(treat.kind, 'treat');
    assert.equal(treat.candy, 'corn_syrup_squares');
    assert.equal(pumpkinTreat(state, 'GA1', 'day1').ok, false);
    assert.equal(pumpkinTreat(state, 'GA1', 'day2', seq(0.9, 0)).kind, 'trick');
  });
});

describe('Zilloween candy', () => {
  it('rushes, extends, then aches on the eleventh candy', () => {
    const state = createSeasonState();
    assert.deepEqual(recordCandyEaten(state, 'd', { zilloween: true }), { total: 1, toothache: false, rush: 'apply', counter: 'candy_eaten:zilloween' });
    assert.equal(recordCandyEaten(state, 'd', { hasRush: true }).rush, 'extend');
    for (let i = 3; i < CANDY_DAILY_MAX; i += 1) recordCandyEaten(state, 'd', { hasRush: true });
    const last = recordCandyEaten(state, 'd', { hasRush: true });
    assert.equal(last.toothache, true);
    assert.equal(last.rush, null);
    assert.equal(candyEatGate(state, 'd').ok, false);
    assert.equal(candyEatGate(state, 'e').ok, true);
    assert.equal(pieEatGate(state, 'e').ok, true);
  });

  it('counts distinct candy-lovers for the Tricksy-Treater badges', () => {
    const state = createSeasonState();
    for (const g of ['a', 'b', 'c', 'd']) recordCandyGiven(state, g);
    assert.equal(recordCandyGiven(state, 'a').fresh, false);
    assert.deepEqual(recordCandyGiven(state, 'e').badges, ['mini_tricksy_treater']);
  });

  it('matches the archived badge conditions', () => {
    const cat = JSON.parse(readFileSync(join(root, 'assets/content/achievements.json'), 'utf8'));
    assert.equal(cat.candy_muncher.conditions[0].group, 'candy_eaten');
    assert.equal(cat.pumpkin_carver.conditions[0].group, 'pumpkins_carved');
    assert.equal(cat.lanternerer.conditions[0].group, 'pumpkins_placed');
    assert.equal(cat.pop_star.conditions[0].num, 13);
    assert.equal(cat.collection_egg_hunter.conditions.length, 5);
  });
});

describe('Glitchmas', () => {
  it('pulls a joke or a fun fact from the 2011 lists', () => {
    assert.equal(SEASON_DATA.crackerJokes.length, 14);
    assert.equal(SEASON_DATA.crackerFactoids.length, 30);
    assert.equal(crackerNote(seq(0.2, 0)).classTsid, 'glitchmas_cracker_joke');
    assert.equal(crackerNote(seq(0.7, 0)).body, SEASON_DATA.crackerFactoids[0]);
  });

  it('keeps one poem card per Glitchmas Card and nogs once a day', () => {
    const state = createSeasonState();
    syncCards(state, 2, () => 0.5);
    assert.equal(state.cards.length, 2);
    assert.equal(state.cards[0].poem, 2);
    syncCards(state, 1);
    assert.equal(state.cards.length, 1);
    assert.equal(nogCheck(state, 'd').ok, true);
    state.daily.nog = 1;
    assert.equal(nogCheck(state, 'd').msg, "You've already nogged an Egg today.");
  });

  it('hears "yay", quotes the Yetis and mails the cracker from December 24', () => {
    assert.equal(saysYay('Yay!'), true);
    assert.equal(saysYay('yayyy'), false);
    assert.equal(yetiQuote('collectors_edition_2010_glitchmas_yeti', () => 0), 'Humbaba bless us, every one.');
    assert.equal(yetiQuote('limited_edition_imitation_grichmas_yeti', () => 0), 'Humbaba to give bless each person.');
    const state = createSeasonState();
    assert.equal(yetiMailDue(state, at(2026, 12, 20)), null);
    assert.equal(yetiMailDue(state, at(2026, 12, 24)), 'glitchmas:2026');
    state.yetiMail.push('glitchmas:2026');
    assert.equal(yetiMailDue(state, at(2027, 1, 2)), null);
    assert.match(SEASON_DATA.yetiMail, /^Good news! The Glitchmas Yeti awoke/);
    assert.match(SEASON_DATA.holidayQuest.offer, /type "yay"/);
  });
});

describe('Egg Hunt and Pi Day', () => {
  it('hides one of five eggs on about half the streets, stable for a hunt', () => {
    let hidden = 0;
    const kinds = new Set();
    for (let i = 0; i < 400; i += 1) {
      const egg = eggForStreet(`GA${i}`, 'egg_hunt:2027');
      if (egg) {
        hidden += 1;
        kinds.add(egg);
      }
    }
    assert.ok(hidden > 150 && hidden < 250, String(hidden));
    assert.equal(kinds.size, 5);
    assert.equal(eggForStreet('GA7', 'egg_hunt:2027'), eggForStreet('GA7', 'egg_hunt:2027'));
    assert.deepEqual(EGG_CLASSES, ['egghunt_egg_1', 'egghunt_egg_2', 'egghunt_egg_3', 'egghunt_egg_4', 'egghunt_egg_5']);
  });

  it('estimates the first six digits for sure, then fades out (pi.js estimateDigit)', () => {
    const always = estimatePi(() => 0);
    assert.deepEqual(always.digits, PI_DIGITS);
    const six = estimatePi(seq(0, 0, 0, 0, 0, 0, 0.99));
    assert.deepEqual(six.digits, [3, 1, 4, 1, 5, 9]);
    assert.equal(six.total, 23);
  });
});

describe('supply paths', () => {
  it('carving a pumpkin makes Pepitas', () => {
    const rows = seasonalConversions();
    const carve = rows.find((r) => r.source === 'season:zilloween_carve');
    assert.equal(carve.tool, 'knife_and_board');
    assert.ok(carve.outputs.includes('pepitas'));
  });
});
