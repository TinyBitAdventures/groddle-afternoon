/**
 * G277, G172 and G266 leftovers (lane LEFT, 2026-10-27), each from what the source says:
 *
 * - G277: butterflies_milked moves only while a milk quest is todo (npc_butterfly.js 1286:
 *   animalkinship_milk_butterflies or master_milker), so the Aranna Scramble's r475 advances only
 *   alongside one; butterflies_massaged only while animalkinship_massage_butterflies is (1139).
 * - G277: the potions' tray stand-ins (Crazy Quoin Collector, Feeling Called Love, Please Wait's
 *   npc_bureaucrat) join buff-triggers BUFF_ICONS, which applyBuff reads, so the icon is right
 *   from the first frame instead of a tick later.
 * - G277: the Starter quests award waits only for the demo kit's quest, Animal Kinship I's
 *   (inc_data_skills.js 3912); the milk quest is Animal Kinship IV's offer (3915).
 * - G172: The Good Neighbor (visiting_stones, epic 4) takes its turn as the shared Feat in
 *   multiplayer: a package a neighbour's Butler took is +2 (bag_butler.js 3802-3805), once per
 *   Butler a run (the server dedupes the neighbour's HOME_<id>). It goes last in the order so the
 *   other Feats keep their index.
 * - G266: the Comedian's laugh makes the companions playEmotionAnimation('happy') (catalog_buffs.js
 *   470-472); Sneezing Powder plays overlay_sneezing_powder over the scatterer two seconds in
 *   (sneezing_powder.js 282-293); the Musicblock note no longer says the Funpickle is missing.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=282e1621';
import { acceptOffer, routeQuestEvent } from '../public/js/quest-offers.js?v=6b6cbf22';
import { applyBuff, createBuffState } from '../public/js/buffs.js?v=c7727c43';
import { BUFF_ICONS } from '../public/js/buff-triggers.js?v=a3093922';
import { FEAT_BY_ID, UNWIRED_FEATS, WIRED_FEATS, featsInEpic } from '../public/js/solo-feats.js?v=e026b67b';
import { MP_ACTS, MP_ORDER, MP_PACE, mpGoals, reportFor } from '../public/js/feats-mp.js?v=3aa606d6';
import { featTable } from '../tools/build-realtime-feats.mjs';
import { endComedian } from '../public/js/features/funpickle-feature.js?v=ff004579';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(GSJS);
const gsjs = (p) => readFileSync(join(GSJS, p), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

describe('G277: butterfly counters move only while their own quests are todo', () => {
  const milk = (qs, animal) => routeQuestEvent(qs, 'npc_butterfly:milk', 1, { managedOnly: true, detail: { animal } });

  it("the Aranna Scramble's butterflies_milked waits for a milk quest", () => {
    const qs = createQuestState();
    assert.equal(acceptOffer(qs, 'rannacramble', { now: Date.now(), ignorePrereq: true }).ok, true);
    milk(qs, 'GA94:npc_butterfly:0');
    assert.equal(qs.active.rannacramble.progress.butterflies_milked || 0, 0);
    assert.equal(acceptOffer(qs, 'animalkinship_milk_butterflies', { now: Date.now(), ignorePrereq: true }).ok, true);
    milk(qs, 'GA94:npc_butterfly:1');
    assert.equal(qs.active.rannacramble.progress.butterflies_milked, 1);
    assert.equal(qs.active.animalkinship_milk_butterflies.progress.butterflies_milked, 1);
  });

  it('Master Milker opens the gate too, and a milk quest alone still counts', () => {
    const qs = createQuestState();
    assert.equal(acceptOffer(qs, 'rannacramble', { now: Date.now(), ignorePrereq: true }).ok, true);
    assert.equal(acceptOffer(qs, 'master_milker', { now: Date.now(), ignorePrereq: true }).ok, true);
    milk(qs, 'GA94:npc_butterfly:0');
    assert.equal(qs.active.rannacramble.progress.butterflies_milked, 1);
    const solo = createQuestState();
    assert.equal(acceptOffer(solo, 'animalkinship_milk_butterflies', { now: Date.now(), ignorePrereq: true }).ok, true);
    milk(solo, 'GA94:npc_butterfly:0');
    assert.equal(solo.active.animalkinship_milk_butterflies.progress.butterflies_milked, 1);
  });

  it('the source guards both counters with their quests', { skip: !hasGsjs && 'no GSJS' }, () => {
    const src = gsjs('items/npc_butterfly.js');
    assert.ok(src.includes("if (pc.getQuestStatus('animalkinship_milk_butterflies') == 'todo' || pc.getQuestStatus('master_milker') == 'todo'){\n\t\t\t\tif (!pc.butterflies_milked) pc.butterflies_milked = {};"));
    assert.ok(src.includes("if (pc.getQuestStatus('animalkinship_massage_butterflies') == 'todo'){\n\t\t\tif (!pc.butterflies_massaged) pc.butterflies_massaged = {};"));
    assert.match(gsjs('quests/rannacramble.js'), /"r475"\t: \{\n\t\t"type"\t\t: "counter",\n\t\t"name"\t\t: "butterflies_milked",\n\t\t"num"\t\t: 11,/);
  });
});

describe('G277: potion and waiting-room buffs show their stand-in from the first frame', () => {
  it('applyBuff takes the stand-in', () => {
    const state = createBuffState();
    assert.equal(applyBuff(state, 'please_wait', null, 1000).buff.sourceItem, 'npc_cubimal_bureaucrat');
    assert.equal(applyBuff(state, 'crazy_coin_collector', null, 1000).buff.sourceItem, 'potion_elixir_of_avarice');
    assert.equal(applyBuff(state, 'feeling_called_love', null, 1000).buff.sourceItem, 'potion_amorous_philtre');
    for (const id of ['please_wait', 'crazy_coin_collector', 'feeling_called_love']) {
      assert.ok(existsSync(join(PUBLIC, 'assets/sprites/icons', `${BUFF_ICONS[id]}.png`)), id);
    }
  });

  it("potions-feature no longer keeps its own table a tick behind", () => {
    const src = read('js/features/potions-feature.js');
    assert.doesNotMatch(src, /TRAY_ICONS|syncTrayIcons/);
  });
});

describe('G277: the Starter quests award is the demo kit\'s one quest', () => {
  it('game.js waits only for Animal Kinship I\'s quest', () => {
    const game = read('game.js');
    assert.match(game, /const main = \['animalkinship_pet_piggies'\];/);
    assert.match(game, /const mainQuests = \['animalkinship_pet_piggies'\];/);
    assert.doesNotMatch(game, /\['animalkinship_pet_piggies', 'animalkinship_milk_butterflies'\]/);
  });

  it('the source offers the milk quest at Animal Kinship IV', { skip: !hasGsjs && 'no GSJS' }, () => {
    const src = gsjs('inc_data_skills.js');
    assert.match(src, /"animalkinship_1"\t\t: "animalkinship_pet_piggies",/);
    assert.match(src, /"animalkinship_4"\t\t: "animalkinship_milk_butterflies",/);
  });
});

describe('G172: The Good Neighbor as the shared Feat', () => {
  it('stays out of solo (no Butler next door) and takes the last turn in multiplayer', () => {
    const f = FEAT_BY_ID.visiting_stones;
    assert.equal(f.wired, false);
    assert.equal(f.mp, true);
    assert.equal(f.epic_id, 4);
    assert.ok(UNWIRED_FEATS.includes(f));
    assert.ok(!WIRED_FEATS.includes(f));
    assert.ok(!/—/.test(f.what));
    assert.deepEqual(MP_ORDER.slice(0, -1), WIRED_FEATS.map((w) => w.id));
    assert.equal(MP_ORDER.at(-1), 'visiting_stones');
    assert.deepEqual(mpGoals('visiting_stones'), { goal: 12, bonus: 24, super: 36 });
    assert.equal(featsInEpic(4), 3);
  });

  it('a package names its act and the Butler\'s home street; the server takes 2 once per street', () => {
    assert.deepEqual({ ...MP_ACTS.visiting_stones.package }, {
      n: 2, dedupe: 'street', source: 'bag_butler.js 3802-3805: +2, the first package left with this Butler',
    });
    assert.ok(MP_PACE.visiting_stones.source);
    const run = { feat: 'visiting_stones' };
    assert.equal(reportFor(run, 'visiting_stones', 2), null);
    assert.deepEqual(reportFor(run, 'visiting_stones', 2, { act: 'package', street: 'HOME_7' }), {
      feat: 'visiting_stones', n: 2, act: 'package', street: 'HOME_7',
    });
    const row = featTable().feats.visiting_stones;
    assert.deepEqual(row.acts, { package: { n: 2, dedupe: 'street' } });
    assert.ok(!featTable().unwired.includes('visiting_stones'));
  });

  it('neighbours-mp-feature reports it where the Butler confirms the package', () => {
    const src = read('js/features/neighbours-mp-feature.js');
    assert.match(src, /if \(receipt !== false\) engine\.featsIncrement\?\.\('visiting_stones', 2, \{ act: 'package', street: homeStreetFor\(visit\.owner\) \}\);/);
    assert.match(src, /if \(msg\.status !== 'settled'\) \{/);
  });

  it('the source counts the first package left with this Butler', { skip: !hasGsjs && 'no GSJS' }, () => {
    assert.ok(gsjs('items/bag_butler.js').includes("if (this.packages.list[pc.tsid].length == 0) {\n\t\tpc.feats_increment('visiting_stones', 2);\n\t}"));
    assert.match(gsjs('inc_data_feats_prod.js'), /"visiting_stones"\t\t: \{\n\t\t"game_day"\t: "25-05-33",[\s\S]*?"epic_id"\t: 4/);
  });
});

describe('G266: Funpickle and powder follow-ups', () => {
  it("the Comedian's laugh makes vector companions happy", () => {
    const buffs = new Set(['comedian']);
    const emotes = [];
    const engine = {
      inv: {},
      hasBuff: (id) => buffs.has(id),
      removeBuff: (id) => buffs.delete(id),
      playSound() {},
      pushActivity() {},
      toast() {},
      floatText() {},
      setData() {},
      localCompanions: [
        { sprite: { x: 1, y: 2 }, body: { npc: { emote: (e) => emotes.push(e) } } },
        { sprite: { x: 3, y: 4 }, body: {} },
      ],
    };
    assert.equal(endComedian(engine), true);
    assert.deepEqual(emotes, ['happy']);
  });

  it('the source plays happy on the others', { skip: !hasGsjs && 'no GSJS' }, () => {
    assert.match(gsjs('items/catalog_buffs.js'), /if\(players\[i\] != pc\) \{\r?\n\t+players\[i\]\.playEmotionAnimation\('happy'\);\r?\n\t+players\[i\]\.metabolics_add_mood\(10\);/);
  });

  it('Sneezing Powder plays its overlay over you two seconds in', () => {
    const src = read('js/features/powders-feature.js');
    assert.match(src, /later\(2000, \(\) => \{\n\s+engine\.playSound\?\.\('SNEEZING_AHCHOO', \{ volume: 0\.7 \}\);\n\s+engine\.dropWorldStack\?\.\('bean_plain', 1, x, y - 1\);\n\s+sneezeOverlay\(engine, \(\) => \(engine\.player \? \{ x: engine\.player\.x, y: engine\.player\.y \} : null\)\);/);
  });

  it('the source sends that overlay on use', { skip: !hasGsjs && 'no GSJS' }, () => {
    assert.match(gsjs('items/sneezing_powder.js'), /swf_url: overlay_key_to_url\('overlay_sneezing_powder'\),\n\t\tdelay_ms: 2000,\n\t\tduration: 2000,\n\t\tlocking: false,\n\t\tpc_tsid: pc\.tsid,\n\t\tdelta_x: 0,\n\t\tdelta_y: -110,\n\t\twidth: 300,\n\t\theight: 300/);
  });

  it('the Musicblock note says the Funpickle sends GNG', () => {
    const src = read('js/musicblocks.js');
    assert.doesNotMatch(src, /which the remake\s+\* does not have/);
    assert.match(src, /seeing all six of its\n \* powers sends it/);
  });
});
