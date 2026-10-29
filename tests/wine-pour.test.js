/**
 * Wine of the Dead's pack verb "pour" (js/wine-pour.js; carried out by
 * features/homes-feature.js, the Tower's project by home-tower-feature.js).
 * Register row G165. Source: glitch-GameServerJS items/wine_of_the_dead.js:151-271,
 * locations/inc_cultivation.js:163, items/proto_furniture_tower_chassis.js:49-77.
 * Run: node --test tests/wine-pour.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WOTD_DEPLETE_MS,
  WOTD_REACH,
  WOTD_TEXT,
  nearestPourTarget,
  pourButton,
  pourConditions,
  pourConfirmText,
} from '../public/js/wine-pour.js?v=g165-1';
import { homeTowerFeature, towerApi } from '../public/js/features/home-tower-feature.js?v=g443-1';
import { homesFeature } from '../public/js/features/homes-feature.js?v=g443-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');

function stubEngine() {
  const toasts = [];
  const dialogs = [];
  return {
    toasts,
    dialogs,
    inv: {},
    param: () => null,
    setData: () => {},
    save: () => {},
    toast: (t) => toasts.push(t),
    offerQuestDialogue: (d) => dialogs.push(d),
    // G277: the Tower's remove confirm is a modal prompt (proto_furniture_tower_chassis.js 66-76).
    prompt: (d) => dialogs.push(d),
    homeContext: () => ({ inHome: false, owned: true }),
  };
}

afterEach(() => homeTowerFeature.restore(undefined, stubEngine()));

describe('source text', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
  it('keeps the pour verb, prompt and lines verbatim', () => {
    const s = src('items/wine_of_the_dead.js');
    assert.ok(s.includes(`"tooltip"\t\t\t: "${WOTD_TEXT.pourTip}"`));
    assert.equal((s.match(new RegExp(`reason: "${WOTD_TEXT.nothingHere}"`, 'g')) || []).length, 2);
    assert.ok(s.includes(`title\t\t\t: '${WOTD_TEXT.confirmTitle}'`));
    assert.ok(s.includes(`{ value : 'ok', label : '${WOTD_TEXT.yes}' }`));
    assert.ok(s.includes(`{ value : 'cancel', label : '${WOTD_TEXT.nevermind}' }`));
    assert.ok(s.includes('var txt = "Are you really sure you want to remove this "+target.name_single+"?";'));
    assert.ok(s.includes('txt = "Are you really sure you want to cancel the project on this "+target.name_single+"? All contributions made so far will be lost.";'));
    assert.ok(s.includes('pc.sendActivity("You poured Wine of the Dead on a "+target.name_single+" and canceled the project.");'));
    assert.match(s, /findCloseStack\(is_cultivated_item, 200\)/);
    assert.match(s, /it\.class_tsid != 'furniture_tower_chassis'/);
    assert.match(s, /apiSetTimerX\('makeDepleted', 3000, true\)/);
    assert.equal(WOTD_REACH, 200);
    assert.equal(WOTD_DEPLETE_MS, 3000);
    assert.ok(src('items/proto_furniture_tower_chassis.js').includes(`reason: "${WOTD_TEXT.pourFirst}"`));
    assert.match(src('locations/inc_cultivation.js'), /return this\.pols_is_pol\(\) && this\.getProp\('is_home'\) && this\.pols_is_owner\(pc\);/);
  });
});

describe('rules', () => {
  const rows = [
    { id: 1, kind: 'cultivated', name: 'Beryl Rock', x: 1200 },
    { id: 2, kind: 'proto', name: 'S. Crop Garden', x: 1350 },
  ];

  it('the nearest valid target within 200 px', () => {
    assert.equal(nearestPourTarget(rows, { x: 1290, y: 870 }).id, 2);
    assert.equal(nearestPourTarget(rows, { x: 1000, y: 870 }).id, 1, '200 px is in reach');
    assert.equal(nearestPourTarget(rows, { x: 999, y: 870 }), null);
    assert.equal(nearestPourTarget([], { x: 0, y: 0 }), null);
  });

  it('pour is disabled away from your home or with nothing near', () => {
    assert.deepEqual(pourConditions({ canCultivate: false, target: rows[0] }), { state: 'disabled', reason: WOTD_TEXT.nothingHere });
    assert.deepEqual(pourConditions({ canCultivate: true, target: null }), { state: 'disabled', reason: WOTD_TEXT.nothingHere });
    assert.deepEqual(pourConditions({ canCultivate: true, target: rows[0] }), { state: 'enabled' });
    assert.deepEqual(pourButton(pourConditions({ canCultivate: true, target: rows[0] })), { id: 'pour', label: 'pour', tooltip: WOTD_TEXT.pourTip, enabled: true, reason: '' });
    assert.equal(pourButton(pourConditions({})).reason, WOTD_TEXT.nothingHere);
  });

  it('asks the remove or the cancel question by target', () => {
    assert.equal(pourConfirmText(rows[0]), 'Are you really sure you want to remove this Beryl Rock?');
    assert.equal(pourConfirmText(rows[1]), 'Are you really sure you want to cancel the project on this S. Crop Garden? All contributions made so far will be lost.');
    assert.equal(WOTD_TEXT.canceled('Tower'), 'You poured Wine of the Dead on a Tower and canceled the project.');
  });
});

describe('the homes feature', () => {
  it('no pour button without a bottle, and nothing to pour on away from home', () => {
    const engine = stubEngine();
    assert.deepEqual(homesFeature.packVerbs('wine_of_the_dead', engine), []);
    engine.inv.wine_of_the_dead = 1;
    const [b] = homesFeature.packVerbs('wine_of_the_dead', engine);
    assert.deepEqual([b.id, b.enabled, b.reason], ['pour', false, WOTD_TEXT.nothingHere]);
    assert.equal(homesFeature.runPackVerb('wine_of_the_dead', 'pour', engine), true);
    assert.deepEqual([engine.toasts, engine.dialogs.length], [[WOTD_TEXT.nothingHere], 0]);
  });
});

describe('the Tower project', () => {
  const started = { project: { r1704: 50 } };

  it('a started Tower project cannot be removed until Wine of the Dead cancels it', () => {
    const engine = stubEngine();
    homeTowerFeature.restore(started, engine);
    assert.equal(towerApi.projectStarted(), true);
    const remove = homeTowerFeature.verbsFor({ classId: 'proto_furniture_tower_chassis' }, engine).find((v) => v.id === 'remove');
    assert.deepEqual([remove.enabled, remove.reason], [false, WOTD_TEXT.pourFirst]);
    let removed = false;
    assert.equal(towerApi.requestRemove(engine, { endClass: 'proto_furniture_tower_chassis' }, () => { removed = true; }), false);
    assert.deepEqual([engine.toasts.at(-1), engine.dialogs.length, removed], [WOTD_TEXT.pourFirst, 0, false]);
    assert.equal(towerApi.cancelProject(engine), true);
    assert.deepEqual([towerApi.projectStarted(), towerApi.state().project], [false, {}]);
    assert.equal(towerApi.cancelProject(engine), false, 'nothing left to cancel');
    // Untouched: the ordinary "Please Confirm!".
    assert.equal(towerApi.requestRemove(engine, { endClass: 'proto_furniture_tower_chassis' }, () => { removed = true; }), true);
    const ask = engine.dialogs[0];
    assert.deepEqual([ask.modal, ask.title, ask.text], [true, 'Please Confirm!', 'Are you really sure you want to remove this Tower?']);
    assert.deepEqual(ask.choices, [{ value: 'ok', label: 'Yes' }, { value: 'cancel', label: 'Nevermind' }]);
    ask.onChoice('cancel');
    assert.equal(removed, false, 'Nevermind keeps it');
    ask.onChoice('ok');
    assert.equal(removed, true);
  });

  it('a built Tower is never a pour target', () => {
    homeTowerFeature.restore({ built: true }, stubEngine());
    assert.equal(towerApi.projectStarted(), false);
  });
});
