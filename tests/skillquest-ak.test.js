/**
 * G290: the Animal Kinship practice street (skillquest_ak) poofs its chicken,
 * piggy and butterfly in with their bubbles and poofs each out 2.5 s after the
 * second squeeze, the nibble and the milk, with the sign events; cultivations
 * poof in at home (quest.js 1880, include/cultivation.js 75); no chicken feed
 * entry; the sloth's tree goes 0.5 s after its poof.
 * Run: node --test tests/skillquest-ak.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AK_ANIMALS,
  AK_BUBBLE,
  AK_EVENT_BOXES,
  AK_POOF_OUT,
  AK_SIGNS,
  AK_SQUEEZES,
  AK_WALL_OFF_MS,
  SKILLQUEST_AK_TSID,
  akAnimalForEvent,
  akVerbReaction,
  createAkState,
} from '../public/js/skillquest-ak.js';
import { listAnimalFeedOptions } from '../public/js/animals.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const audit = join(here, '../..');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const gsjsPath = join(audit, 'glitch-GameServerJS');
const haveGsjs = existsSync(gsjsPath);
const gsjs = (p) => readFileSync(join(gsjsPath, p), 'utf8');
const locPath = join(audit, 'streets/mnt/stos/location_data');
const haveLoc = existsSync(join(locPath, 'GHFRK14DDU53RQQ.xml'));
const loc = (tsid) => readFileSync(join(locPath, `${tsid}.xml`), 'utf8');
const street = JSON.parse(read(`assets/streets/${SKILLQUEST_AK_TSID}.json`));

describe('skillquest_ak: source data', () => {
  it('spawn points, bubbles and timers are skillquest_ak.js verbatim', { skip: !haveGsjs }, () => {
    const src = gsjs('locations/skillquest_ak.js');
    for (const [classId, row] of Object.entries(AK_ANIMALS)) {
      const key = classId.replace('npc_', '');
      assert.match(src, new RegExp(`'${key}': \\{x:${row.x}, y:${row.y}\\}`), classId);
      assert.ok(src.includes(`'sendBubble', 2*1000, '${row.bubble}', 5*1000`), row.bubble);
      assert.ok(src.includes(`createItemStackWithPoof('${classId}'`), classId);
    }
    assert.equal(AK_BUBBLE.delayMs, 2000);
    assert.equal(AK_BUBBLE.durationMs, 5000);
    assert.equal((src.match(/'deleteWithPoof', 2\.5\*1000, 20, 100\)/g) || []).length, 3);
    assert.deepEqual([AK_POOF_OUT.delayMs, AK_POOF_OUT.dx, AK_POOF_OUT.dy], [2500, 20, 100]);
    assert.match(src, /this\.squeeze_count >= 2/);
    assert.equal(AK_SQUEEZES, 2);
    assert.match(src, /'broadcastLocationEvent', 1\*1000, 'wall_off'/);
    assert.equal(AK_WALL_OFF_MS, 1000);
    // deleteWithPoof removes the stack 200 ms after the puff.
    assert.match(gsjs('items/item.js'), /this\.apiSetTimer\('apiDelete', 200\)/);
    assert.equal(AK_POOF_OUT.deleteMs, 200);
  });

  it('the sign texts are the street\'s sign_txt', { skip: !haveLoc }, () => {
    const geo = loc('GHFRK14DDU53RQQ');
    for (const [id, sign] of Object.entries(AK_SIGNS)) {
      const block = geo.slice(geo.indexOf(`<object id="${id}">`));
      const txt = block.match(/<str id="sign_txt">([^<]*)<\/str>/)[1];
      assert.equal(sign.text, txt, id);
    }
  });

  it('the location events call the spawns, and every box event exists on the street', { skip: !haveLoc }, () => {
    const xml = loc('LHFRK14DDU53RQQ');
    assert.match(xml, /<object id="chicken">[\s\S]*?loc\.spawnChicken\(\);/);
    assert.match(xml, /<object id="pig">[\s\S]*?loc\.spawnPiggy\(\);/);
    assert.match(xml, /<object id="butterfly">[\s\S]*?loc\.spawnButterfly\(\);/);
    assert.equal((xml.match(/label="Collision-triggered Event Box"/g) || []).length, 10);
    for (const box of AK_EVENT_BOXES) {
      for (const ev of box.events) assert.ok(street.events[ev], ev);
    }
    for (const ev of ['s1off', 's2off', 'sign4off', 'lotion_off', 'wall_off']) assert.ok(street.events[ev], ev);
  });

  it('each box stands before what it shows, left to right as the street is walked', () => {
    let last = -Infinity;
    for (const box of AK_EVENT_BOXES) {
      assert.ok(box.x > last, box.id);
      last = box.x;
      const classId = box.events.map(akAnimalForEvent).find(Boolean);
      if (classId) assert.ok(box.x < AK_ANIMALS[classId].x, box.id);
    }
    // The butterfly's box is past the lotion wall (wall_1343335116552 at x 1912).
    assert.ok(AK_EVENT_BOXES.find((b) => b.id === 'butterfly').x - 80 > 1912);
    assert.equal(akAnimalForEvent('pig'), 'npc_piggy');
    assert.equal(akAnimalForEvent('sign1'), null);
  });
});

describe('skillquest_ak: eventScriptEventFired', () => {
  it('the chicken goes after the second squeeze, with s1off, and the count starts again', () => {
    const s = createAkState();
    assert.equal(akVerbReaction(s, 'squeeze'), null);
    assert.deepEqual(akVerbReaction(s, 'squeeze'), { poof: 'npc_chicken', event: 's1off' });
    assert.equal(s.squeezes, 0);
    assert.equal(akVerbReaction(s, 'squeeze'), null);
  });

  it('nibble and milk poof their animal; pet and massage hide their signs', () => {
    const s = createAkState();
    assert.deepEqual(akVerbReaction(s, 'nibble'), { poof: 'npc_piggy', event: null });
    assert.deepEqual(akVerbReaction(s, 'milk'), { poof: 'npc_butterfly', event: null });
    assert.deepEqual(akVerbReaction(s, 'pet'), { poof: null, event: 's2off' });
    assert.deepEqual(akVerbReaction(s, 'massage'), { poof: null, event: 'sign4off' });
    assert.equal(akVerbReaction(s, 'butter_up'), null);
  });

  it('a gone animal sets nothing off (getAnimal), and s1off rides on the chicken', () => {
    const s = createAkState();
    const none = () => false;
    assert.equal(akVerbReaction(s, 'milk', none), null);
    assert.equal(akVerbReaction(s, 'nibble', none), null);
    akVerbReaction(s, 'squeeze', none);
    assert.equal(akVerbReaction(s, 'squeeze', none), null);
    assert.deepEqual(akVerbReaction(s, 'pet', none), { poof: null, event: 's2off' });
  });
});

describe('G290 wiring', () => {
  // assert.ok, so a miss names the pattern instead of printing the whole module.
  const has = (text, re) => assert.ok(re.test(text), String(re));
  const newxp = read('js/features/newxp-feature.js');
  const homes = read('js/features/homes-feature.js');

  it('the practice street has no fauna of its own; the run spawns, bubbles and poofs them', () => {
    has(newxp, /SKILLQUEST_AK_TSID\) \{\n\s+return \{ label: 'A L\\'il Animal Kinship', sourceTsid: SKILLQUEST_AK_SOURCE, counts: \{\} \}/);
    has(newxp, /function akSpawn\([\s\S]*?playPoofIn\(PIXI[\s\S]*?engine\.say\(target, def\.bubble, AK_BUBBLE\.durationMs\)/);
    has(newxp, /function akPoofOut\([\s\S]*?deleteWithPoof\(engine, row\.sprite, AK_POOF_OUT\.dx, AK_POOF_OUT\.dy\)/);
    has(newxp, /akVerb\(engine, cls, verb\)/);
    has(newxp, /islandSigns\(engine, AK_SIGNS, \{ follow: true \}\)/);
  });

  it('the sloth\'s tree hides 0.5 s after its poof (slothRemove -> hideTree)', { skip: !haveGsjs }, () => {
    assert.match(gsjs('locations/newxp_training1.js'), /sloth\.deleteWithPoof\(-50, 250\);\n\tthis\.apiSetTimer\('hideTree', 0\.5\*1000\);/);
    has(newxp, /const SLOTH_TREE_HIDE_MS = 500;/);
    has(newxp, /deleteWithPoof\(engine, sloth, -50, 250\);[\s\S]{0,200}setTimeout\(\(\) => \{[\s\S]{0,80}treeHidden = true;[\s\S]*?\}, SLOTH_TREE_HIDE_MS\);/);
  });

  it('cultivations poof in where the source does (quest.js 1880, cultivation.js 75)', { skip: !haveGsjs }, () => {
    assert.match(gsjs('quests/quest.js'), /offerer\.container\.createItemStackWithPoof\(/);
    assert.match(gsjs('items/include/cultivation.js'), /this\.replaceWithPoofIfOnGround\(this\.proto_class\)/);
    has(homes, /import \{ playPoofIn \} from '\.\.\/overlay-art\.js/);
    has(homes, /function finishRestore\([\s\S]*?queueCultivationPoof\(result\.item, st\);/);
    has(homes, /function depleteItem\([\s\S]*?queueCultivationPoof\(.*\{ proto: true \}\);/);
    has(homes, /spawnProtos\(engine, st\);\n\s+if \(pendingPoofs\.length\) playPendingPoofs\(engine, st\);/);
  });

  it('chickens have no feed entry (npc_chicken.js has no feed verb)', () => {
    assert.deepEqual(listAnimalFeedOptions('npc_chicken', { grain: 4, corn: 2 }), []);
    assert.ok(!/npc_chicken: Object\.freeze\(\{\n\s+grain:/.test(read('js/animals.js')));
  });
});
