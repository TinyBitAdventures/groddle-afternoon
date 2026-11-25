/**
 * The Butler's Rook alert (register G799).
 * Source: glitch-GameServerJS items/include/butler_hints.js giveHint 5-62 (rook_interval 5 min,
 * start_delay 10 min), getHint 628-632 (a rook alert comes before any hint), getRookNotification
 * 664-694 (level > 4, a running attack, the line); items/bag_butler.js 4003-4041 (the owner coming
 * near, hints_off); groups/rook_attack_tracker.js (the attacks under way).
 * Remake: js/butler.js rookAlert, js/rook-mp.js attacksFromServer (the server's rook_alert.go
 * rook_attacks), features/rook-attack-feature.js rookAttacksUnderWay, features/butler-feature.js.
 * Run: node --test tests/butler-rook-alert.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUTLER, ROOK_ALERTS_KEPT, createButlerState, normalizeButlerState, rookAlert, rookAlertLine } from '../public/js/butler.js?v=152429c8';
import { attacksFromServer } from '../public/js/rook-mp.js?v=dda37008';
import { rookAttackFeature } from '../public/js/features/rook-attack-feature.js?v=0b338c7c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(gsjs);

const T0 = 1_800_000_000_000;
const STREET = 'GLI2V0UN7RD1T2J';

/** A Butler past its intro and its ten quiet minutes, no hint given lately. */
function butler(extra = {}) {
  return { ...createButlerState(), owned: true, introDone: true, createdAt: T0 - 60 * 60_000, lastHintAt: 0, ...extra };
}

describe('the Butler tells of a Rook attack (G799)', () => {
  it('says the source line, naming the street', { skip: !hasGsjs }, () => {
    const text = readFileSync(join(gsjs, 'items/include/butler_hints.js'), 'utf8');
    assert.match(text, /var hint = "Hurry, boss! I just heard on the butlervine that "\+loc_text\+" is being attacked by the rook! Ur needs your help!";/);
    assert.equal(rookAlertLine('Hechey Track'), 'Hurry, boss! I just heard on the butlervine that Hechey Track is being attacked by the rook! Ur needs your help!');
  });

  it('announces each attack once, above level 4, after the intro quiet and 5 min after the last hint', () => {
    const st = butler();
    const attacks = [{ street: STREET, since: T0 - 1000, name: 'Hechey Track' }];
    assert.equal(rookAlert(st, attacks, { now: T0, level: 4 }), null, 'level 4 is not enough (player_level > 4)');
    const got = rookAlert(st, attacks, { now: T0, level: 5 });
    assert.equal(got.text, rookAlertLine('Hechey Track'));
    assert.equal(got.key, `${STREET}@${T0 - 1000}`);
    assert.equal(st.lastHintAt, T0, 'it counts as the hint given');
    // The same attack, much later: not again.
    assert.equal(rookAlert(st, attacks, { now: T0 + 60 * 60_000, level: 5 }), null);
    // A new attack on that street (another day) is a new alert.
    const next = [{ street: STREET, since: T0 + 2 * 86_400_000, name: 'Hechey Track' }];
    assert.ok(rookAlert(st, next, { now: T0 + 2 * 86_400_000 + 1000, level: 5 }));
  });

  it('waits rook_interval after the last hint and start_delay after the intro', () => {
    const attacks = [{ street: STREET, since: 1, name: 'Hechey Track' }];
    assert.equal(rookAlert(butler({ lastHintAt: T0 - BUTLER.ROOK_ALERT_INTERVAL_MS + 1 }), attacks, { now: T0, level: 20 }), null);
    assert.ok(rookAlert(butler({ lastHintAt: T0 - BUTLER.ROOK_ALERT_INTERVAL_MS - 1 }), attacks, { now: T0, level: 20 }));
    assert.equal(rookAlert(butler({ createdAt: T0 - BUTLER.HINT_START_DELAY_MS }), attacks, { now: T0, level: 20 }), null);
    assert.equal(BUTLER.ROOK_ALERT_INTERVAL_MS, 5 * 60_000);
  });

  it('stays quiet with its wisdom muffled (hints_off) or no attack', () => {
    assert.equal(rookAlert(butler({ hintsOff: true }), [{ street: STREET, since: 1 }], { now: T0, level: 20 }), null);
    assert.equal(rookAlert(butler(), [], { now: T0, level: 20 }), null);
    assert.equal(rookAlert(butler(), null, { now: T0, level: 20 }), null);
  });

  it('keeps what it told in the save, at most ROOK_ALERTS_KEPT', () => {
    const st = butler();
    for (let i = 0; i < ROOK_ALERTS_KEPT + 5; i += 1) rookAlert(st, [{ street: STREET, since: i + 1 }], { now: T0, level: 9, force: true });
    const back = normalizeButlerState(JSON.parse(JSON.stringify(st)));
    assert.equal(back.rookAlerted.length, ROOK_ALERTS_KEPT);
    assert.equal(back.rookAlerted.at(-1), `${STREET}@${ROOK_ALERTS_KEPT + 5}`);
    assert.deepEqual(normalizeButlerState({}).rookAlerted, []);
  });
});

describe('where the attacks come from', () => {
  it('online: the server list, cleaned', () => {
    assert.deepEqual(attacksFromServer([{ street: STREET, hub: '58', since: 123 }, { street: 'bad street' }, null]), [{ street: STREET, hub: '58', since: 123 }]);
    assert.deepEqual(attacksFromServer(undefined), []);
    assert.equal(attacksFromServer(Array.from({ length: 40 }, () => ({ street: STREET, since: 1 }))).length, 16);
  });

  it('solo: your own attack once the Rook is over its street, not its herald or once it is over', () => {
    const solo = { mode: 'solo', inv: {} };
    const attack = (phase) => ({ tsid: STREET, phase, startedAt: T0, health: 100, maxHealth: 100 });
    rookAttackFeature.restore({ active: attack('herald') }, solo);
    assert.deepEqual(rookAttackFeature.rookAttacksUnderWay(solo), []);
    for (const phase of ['build_up', 'angry', 'stunned']) {
      rookAttackFeature.restore({ active: attack(phase) }, solo);
      assert.deepEqual(rookAttackFeature.rookAttacksUnderWay(solo), [{ street: STREET, since: T0 }], phase);
    }
    for (const phase of ['dead', 'departed']) {
      rookAttackFeature.restore({ active: attack(phase) }, solo);
      assert.deepEqual(rookAttackFeature.rookAttacksUnderWay(solo), [], phase);
    }
    rookAttackFeature.restore({}, solo);
    assert.deepEqual(rookAttackFeature.rookAttacksUnderWay(solo), []);
  });

  it('the Butler asks the rook feature, a Rook out before any hint', () => {
    const src = readFileSync(join(root, 'public/js/features/butler-feature.js'), 'utf8');
    assert.match(src, /engine\.query\?\.\('rookAttacksUnderWay', engine\)/);
    assert.match(src, /if \(!maybeRookAlert\(engine\)\) maybeHint\(engine\);/);
  });
});
