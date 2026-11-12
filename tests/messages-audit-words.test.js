/**
 * The messages audit's wording rows (2026-11-12): each line says what the code does, Glitch's
 * words where Glitch had them.
 * Run: node --test tests/messages-audit-words.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTY_TEXT } from '../public/js/party-spaces.js?v=dcc45819';
import { SKILL_REMAKE_NOTES } from '../public/js/skill-tree.js?v=e399b9ca';
import { SETTINGS_COPY } from '../public/js/account-forms.js?v=29e9e2c3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('messages audit wording', () => {
  it('quest rooms point at the true way back (location.js 386; npc_gwendolyn.js 215-233)', () => {
    assert.match(read('public/js/quest-rooms/rainbow-run.js'), /My Grandma has more Hustle than that\. Open your quest log if you want to try again\./);
    const gw = read('public/js/quest-rooms/gwendolyn.js');
    assert.doesNotMatch(gw, /Magic Rock can take you back/);
    assert.equal((gw.match(/Gwendolyn can give it to you again in Room 23\./g) || []).length, 2);
  });

  it('Teleportation says the Map needs rank IV (inc_teleportation.js 957-967)', () => {
    assert.match(SKILL_REMAKE_NOTES.Teleportation.note, /Teleportation IV adds teleporting from the Map\./);
  });

  it('Party Space "later" points at the Map card', () => {
    assert.equal(PARTY_TEXT.joinLater, "If you'd like to join the Party Space later, open the Map and choose Join party.");
  });

  it('the multiplayer tutorial gate never mentions the hidden Skip', () => {
    assert.match(read('public/js/features/newxp-feature.js'), /engine\?\.mode === 'multiplayer' \? 'Follow the tutorial for now\.' : 'Follow the tutorial \(or skip it from the Tutorial card\)\.'/);
  });

  it('Appear offline says players on your street still see you', () => {
    assert.match(SETTINGS_COPY.presence.help, /Players on the same street still see you\./);
    assert.match(SETTINGS_COPY.presence.on, /players on your street still see you/);
    assert.doesNotMatch(SETTINGS_COPY.presence.on, /Nobody sees you/);
  });

  it('Paradise says when the last ticket of the day was used (paradise_ticket_cloud_rings.js 154-155)', () => {
    const game = read('public/game.js');
    assert.match(game, /That was your last ticket today\. Another ticket can take you back next game day\./);
    assert.equal((game.match(/\$\{paradiseWayBack\(\)\}/g) || []).length, 2);
  });

  it('the Emotional Bear says you are reminiscing while the repeat story runs', () => {
    assert.match(read('public/game.js'), /bearReminisceQuote\?\.reason === 'active'\n\s+\? 'You are reminiscing right now\.'/);
  });

  it('a Game of Crowns challenge that never went out says the ticket came back', () => {
    const src = read('public/js/features/crowns-feature.js');
    assert.match(src, /mpRefund\(engine\);\n\s+engine\.toast\(`\$\{CROWNS_MP_TEXT\.offline\} Your ticket is back in your pack\.`/);
    assert.ok(src.indexOf("engine.pushActivity('You activated a Game of Crowns Ticket.')") > src.indexOf("c.send('crown_challenge'"), 'activated only once it went out');
  });

  it('the fifth milker says milkers and a feeder never warns (butterfly_milker.js 80-83, piggy_feeder.js)', () => {
    assert.match(read('public/js/features/animal-husbandry-feature.js'), /classTsid === 'butterfly_milker' \? 'milkers' : classTsid === 'piggy_feeder' \? '' : 'collectors'/);
  });

  it('the race ticket cap reads as the remake\'s own limit, not a full pack', () => {
    const src = read('public/js/features/races-feature.js');
    assert.doesNotMatch(src, /Your pack can only hold five|Your pack holds 5/);
    assert.match(src, /You can carry five of each race ticket\./);
  });

  it('a broken tool says only that it broke, as Glitch did (tinkertool.js 528)', () => {
    assert.doesNotMatch(read('public/game.js'), /Repair it with the Tinkertool/);
  });
});
