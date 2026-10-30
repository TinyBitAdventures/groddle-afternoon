/**
 * The Classic top bar's pure parts (public/js/classic/classic-topbar.js): the ring shares the game
 * already draws, the 11-stop energy ramp, the mood face's states, the volume icon's frame, the date
 * block and the energy line.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shareFromDash, rampStop, moodState, volumeFrame, dateLines, energyText } from '../public/js/classic/classic-topbar.js?v=g468-9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Classic top bar', () => {
  it('reads the share from the ring the game fills', () => {
    assert.equal(shareFromDash('63.5 100'), 0.635);
    assert.equal(shareFromDash('0 100'), 0);
    assert.equal(shareFromDash('140 100'), 1);
    assert.equal(shareFromDash(null), 0);
  });

  it('the energy ramp: 11 stops, empty red to full green (EnergyBar.as 114-126)', () => {
    assert.equal(rampStop(0), 0);
    assert.equal(rampStop(0.05), 0);
    assert.equal(rampStop(0.5), 5);
    assert.equal(rampStop(0.95), 10);
    assert.equal(rampStop(1), 10);
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    for (let i = 0; i <= 10; i++) assert.match(css, new RegExp(`--c-classic-ramp-${i}: #[0-9a-f]{6};`));
  });

  it('the face: 90, 80, 70 and 20% in order (PlayerFaceUI.as 232-252)', () => {
    assert.deepEqual([0.95, 0.9, 0.85, 0.75, 0.5, 0.2, 0.19, 0].map(moodState), ['sun', 'sun', 'glow', 'fair', 'meh', 'meh', 'low', 'low']);
  });

  it('the volume icon: the louder channel, 65 / 33 / 1, muted is silent (AudioControl.as 214-229)', () => {
    assert.equal(volumeFrame(100, 0, false), 0);
    assert.equal(volumeFrame(40, 64, false), 1);
    assert.equal(volumeFrame(10, 0, false), 2);
    assert.equal(volumeFrame(0, 0, false), 3);
    assert.equal(volumeFrame(100, 100, true), 3);
  });

  it('the date block from the clock (DateTimeUI.as 49-74)', () => {
    assert.deepEqual(dateLines('12:30 PM, Twoday, the 28th of Primuary, year 3'), { day: 'Twoday', time: '12:30 pm', date: '28th of Primuary' });
    assert.deepEqual(dateLines('', '9:05 AM'), { day: '', time: '9:05 am', date: '' });
  });

  it('the energy line from the ring\'s tooltip', () => {
    assert.equal(energyText('Energy 80/100'), '80/100');
    assert.equal(energyText('Energy 1,200/1,500'), '1,200/1,500');
    assert.equal(energyText(''), '');
  });
});
