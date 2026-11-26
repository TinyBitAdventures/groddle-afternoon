/**
 * R48 (G1163, #623): a street data box with no handler. Storyland's instance_exit and
 * greedy_street_spirit_check boxes sat in the street JSON and nothing read them, so its EXIT did
 * nothing. Glitch's server ran every walk-in box through locations/location.js hitBox (a named
 * case, a quest callback, or a logged "unhandled box"); the remake reads boxes feature by feature,
 * so nothing noticed one that no feature took.
 *
 * This lists every box id on every street (public/assets/streets/*.json) and fails on one that
 * the game's code never names (a whole word in code, comments left out), unless it is listed
 * below: HANDLED_ELSEWHERE (read by a pattern, a rebuilt spot or the realtime server; the named
 * file must still carry the proof), PER_STREET (an id too common to prove by name: the street's
 * own handler must carry it) or SKIP (no handler, with the reason).
 *
 * Run: node --test tests/r48-street-box-handlers.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const STREETS = join(ROOT, 'public/assets/streets');

/** Read by something the name scan cannot see: { file, proof (a string the file must hold), why }. */
const HANDLED_ELSEWHERE = [
  { match: /^TowerSpot_\d\d$/, file: 'public/js/home-tower.js', proof: '/^TowerSpot_\\d\\d$/.test(', why: 'the Tower Secrets read every TowerSpot_NN box by pattern (location.js handleTowerSecrets)' },
  { match: 'pig_pen', file: 'public/js/features/hog-haul-mp-feature.js', proof: "ask(mp, 'race_pen'", why: 'The Great Hog Haul pen: the client asks at the pen and the realtime server takes the Piggy (hoghaul.go; location.js 1428-1437)' },
  { match: 'blue_and_white_go_bonus', file: 'public/js/summers-day.js', proof: "Object.freeze({ id: 'exit', x: -925, y: -910 })", why: "A Summer's Day: the memory's exit checkpoint stands at the box (blue_and_white_part2.js callback_blue_and_white_go_bonus)" },
  { match: 'it_game_start', file: 'public/js/features/crowns-feature.js', proof: 'games_it_game_gate', why: 'Game of Crowns: the play line is the gate (location.js 1484-1486, inc_games.js games_it_game_gate)' },
  { match: 'wateringcan', file: 'public/js/features/newxp-feature.js', proof: "'wateringcan_on'", why: 'Light Green Thumb practice: the Watering Can sign is fired by the tool itself (skillquest_lgt_v2.js 75-97 wateringcan_on / _off)' },
  { match: 'flamingo_talk1', file: 'public/js/features/newxp-feature.js', proof: '// flamingo_talk1: the flamingo pops in', why: 'practice streets: the box is at the start, the flamingo talks on arrival' },
  { match: 'quest:flag:find_groddle_ladder', file: 'public/js/quest-offers.js', proof: "counter: 'find_groddle_ladder', event: 'street_entered:groddle_ladder'", why: "Jump In Hole: the box is Groddle Ladder's whole floor (4000 wide); the flag counts on entering the street" },
];

/** Ids common to several systems: on these streets, this file must hold the proof. */
const PER_STREET = {
  instance_exit: {
    GNVD57N9ERF3TNH: { file: 'public/js/greedy-street-spirit.js', proof: "GREEDY_EXIT_BOX_ID = 'instance_exit'" },
  },
};

const STOPS_WHY = 'no handler survives: these ids appear nowhere in Glitch\'s server (GSJS); they come with the retired intro street copies ("And so it begins...", "The Next Step")';
/** No handler, on purpose or not yet: the reason each stays unread. */
const SKIP = {
  introstop: STOPS_WHY,
  firststop: STOPS_WHY,
  secondstop: STOPS_WHY,
  thirdstop: STOPS_WHY,
  fourthstop: STOPS_WHY,
  fifthstop: STOPS_WHY,
  sixthstop: STOPS_WHY,
  seventhstop: STOPS_WHY,
  eighthstop: STOPS_WHY,
  misc: "the map editor's default box id; Glitch's location.js had no case for it (logged as an unhandled box)",
  flamingo_talk2: "Glitch's final scripts for both practice streets (skillquest_ak.js, skillquest_lgt_v2.js) never wait for it; only the retired skillquest_ezc.js did",
  quickstart_account_check: 'Gentle Island held quickstart players without an account (newbie_island.js 41-53); the remake has no account-less play to hold',
};

/** SKIP ids whose name is an ordinary word the code uses for other things (not proof of a handler). */
const COMMON_WORDS = new Set(['misc']);

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsFiles(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Code with its comments taken out (a box named only in a comment is not handled). */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const CODE = [...jsFiles(join(ROOT, 'public/js')), join(ROOT, 'public/game.js')].map((f) => ({
  file: relative(ROOT, f),
  text: stripComments(readFileSync(f, 'utf8')),
}));

function codeNaming(id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Za-z0-9_:])${esc}(?![A-Za-z0-9_])`);
  return CODE.filter((c) => re.test(c.text)).map((c) => c.file);
}

/** Every box: { id, tsid }. */
function streetBoxes() {
  const out = [];
  for (const name of readdirSync(STREETS)) {
    if (!name.endsWith('.json')) continue;
    const street = JSON.parse(readFileSync(join(STREETS, name), 'utf8'));
    for (const box of street?.boxes || []) out.push({ id: String(box?.id || ''), tsid: name.replace(/\.json$/, '') });
  }
  return out;
}

const elsewhere = (id) => HANDLED_ELSEWHERE.find((h) => (h.match instanceof RegExp ? h.match.test(id) : h.match === id));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('R48 every street box has a handler or a reason', () => {
  const boxes = streetBoxes();
  const ids = [...new Set(boxes.map((b) => b.id))].sort();

  it('finds the boxes (151 ids when R48 landed)', () => {
    assert.ok(ids.length >= 140, `${ids.length} box ids`);
    assert.ok(ids.includes('instance_exit') && ids.includes('greedy_street_spirit_check'));
  });

  it('no box id goes unread without a reason', () => {
    const unread = ids.filter((id) => !PER_STREET[id] && !SKIP[id] && !elsewhere(id) && !codeNaming(id).length);
    assert.deepEqual(unread, [], `street boxes nothing reads: give each a handler, or a SKIP entry with the reason: ${unread.join(', ')}`);
  });

  it('each handled-elsewhere entry still carries its proof, and is still needed', () => {
    for (const h of HANDLED_ELSEWHERE) {
      assert.ok(read(h.file).includes(h.proof), `${h.match}: ${h.file} no longer holds ${h.proof}`);
      assert.ok(ids.some((id) => (h.match instanceof RegExp ? h.match.test(id) : h.match === id)), `${h.match}: no street has it now`);
      assert.ok(h.why, `${h.match}: a reason`);
    }
  });

  it('a per-street id is read on each street that has it, by that street\'s own handler', () => {
    for (const [id, streets] of Object.entries(PER_STREET)) {
      const on = [...new Set(boxes.filter((b) => b.id === id).map((b) => b.tsid))].sort();
      assert.deepEqual(on, Object.keys(streets).sort(), `${id}: a street with this box needs its own handler listed here`);
      for (const [tsid, h] of Object.entries(streets)) assert.ok(read(h.file).includes(h.proof), `${id} on ${tsid}: ${h.file} no longer holds ${h.proof}`);
    }
  });

  it('a SKIP entry has a reason and is still needed (a handled id leaves the list)', () => {
    for (const [id, why] of Object.entries(SKIP)) {
      assert.ok(String(why).length > 20, `${id}: a reason`);
      assert.ok(ids.includes(id), `${id}: no street has it now`);
      if (COMMON_WORDS.has(id)) continue;
      assert.deepEqual(codeNaming(id), [], `${id} is read now (${codeNaming(id).join(', ')}): take it off SKIP`);
    }
  });

  it('the scan sees through comments (a box named only in a comment is not handled)', () => {
    assert.equal(stripComments("a(); // 'caveIn'\n/* street_spirit_pan */ b('x');").includes('caveIn'), false);
    assert.equal(stripComments("const u = 'http://x'; c('quest:flag:x');").includes("quest:flag:x"), true);
  });
});
