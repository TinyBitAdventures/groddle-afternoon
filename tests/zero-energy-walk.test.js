/**
 * Ticket 45 (2026-11-02): at 0 energy a living player could not move at all until they ate.
 * The client never checked energy to walk (AvatarController / PhysicsModel); Pooped and Super Pooped
 * halve walk and jump (catalog_buffs.js 1689-1717), and the server repeats its low-energy line each
 * minute of play while energy is 10% or less (player.js onTimePlaying 837-843).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HELL_TEXT, checkLowEnergyWarning, createHellState } from '../public/js/hell.js?v=87b075a8';

const root = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('walking at 0 energy (ticket 45)', () => {
  it('nothing freezes the avatar at 0 energy; the zero-energy hook is gone', () => {
    assert.ok(!read('game.js').includes("features.query('allowZeroEnergyMovement'"));
    assert.ok(!read('js/features/hell-feature.js').includes('allowZeroEnergyMovement'));
  });

  it('the low-energy line repeats each minute while energy stays low, every tick checked', () => {
    const pc = { energy: 0, energyMax: 100, buffs: {} };
    let s = createHellState();
    const t0 = 1_000_000;
    const first = checkLowEnergyWarning(s, pc, t0);
    assert.equal(first.warn, true);
    assert.equal(first.text, HELL_TEXT.aboutToCroak);
    s = first.state;
    assert.equal(checkLowEnergyWarning(s, pc, t0 + 30_000).warn, false, 'not twice in a minute');
    assert.equal(checkLowEnergyWarning(s, pc, t0 + 61_000).warn, true, 'again a minute on');
    const src = read('js/features/hell-feature.js');
    assert.match(src, /lastEnergy = energy;\n\s*\/\/ player\.js onTimePlaying 837-843[\s\S]{0,200}const warning = checkLowEnergyWarning\(state, engine\.pc, now\);/);
  });
});

describe('Pooped says why you did not croak again (ticket 44)', () => {
  it('Pooped and Super Pooped carry the You Croaked ending, in the strip and the Buffs panel', async () => {
    const { POOPED_EXPLAINED, hellBuffDesc } = await import('../public/js/hell.js?v=87b075a8');
    assert.ok(POOPED_EXPLAINED.startsWith('You can only croak once a day'));
    assert.equal(hellBuffDesc('pooped', 'You are seriously pooped! You need energy to get out of it'),
      `You are seriously pooped! You need energy to get out of it. ${POOPED_EXPLAINED}`);
    assert.ok(hellBuffDesc('super_pooped', 'Rest').endsWith(POOPED_EXPLAINED));
    assert.equal(hellBuffDesc('spinach', 'Strong'), 'Strong');
    const game = read('game.js');
    assert.match(game, /chip\.title = `\$\{row\.def\.name\}: \$\{hellBuffDesc\(row\.def\.classTsid, row\.def\.desc\)\}`;/);
    assert.match(game, /escapeHtml\(hellBuffDesc\(b\.def\.classTsid, b\.def\.desc\)\)/);
    // The source's own words (quests/you_croaked.js 4).
    const src = readFileSync(join(root, '../../glitch-GameServerJS/quests/you_croaked.js'), 'utf8');
    assert.ok(src.includes(POOPED_EXPLAINED.replace(/'/g, "'")));
  });
});
