/** Neighbour home streets for the Visiting Stone (js/neighbours.js + neighbour-scene.js). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CHORES,
  FIRST_VISIT_XP,
  LETTER_DELAY_MS,
  NEIGHBOURS,
  NEIGHBOUR_ITEMS,
  NEIGHBOUR_SCENE,
  choreVerb,
  doChore,
  isNeighbourSceneTsid,
  neighbourById,
  neighbourFromScene,
  neighbourLayout,
  neighbourSceneTsid,
  normalizeNeighbourState,
  pickNeighbour,
  porchGift,
  postNoteReply,
  postNoteVerb,
  recordVisit,
  visitorLetter,
} from '../public/js/neighbours.js?v=7fbf44a4';
import { SCENE_DECO_SIZES, SCENE_STYLES, neighbourPlatforms, propPlan } from '../public/js/features/neighbour-scene.js?v=302e64ad';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const DECO = join(root, 'assets/decos/groddle');
// Logical deco sizes are the source PNGs' (tools/deco-pipeline keeps each WebP at that size).
const DECO_SRC = join(root, '..', 'assets-src/decos/groddle');

function pngSize(path) {
  const buf = readFileSync(path);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const pc = () => ({ energy: 50, mood: 40, xp: 0, imagination: 0 });

describe('the neighbours', () => {
  it('are six named Glitches, each with a chore, a door note and letters', () => {
    assert.equal(NEIGHBOURS.length, 6);
    assert.equal(new Set(NEIGHBOURS.map((n) => n.id)).size, 6);
    for (const n of NEIGHBOURS) {
      assert.ok(CHORES[n.chore], n.id);
      assert.ok(n.doorNote.title && n.doorNote.text);
      assert.ok(n.thanks.text && n.thanks.attachment.count > 0);
      assert.ok(n.visitor && n.visitorGift.count > 0);
      assert.ok(SCENE_STYLES[n.style], n.style);
      for (const copy of [n.doorNote.text, n.thanks.text, n.visitor]) assert.ok(!copy.includes('—'));
      for (const item of [n.thanks.attachment, n.visitorGift, ...(n.gifts || [])]) {
        assert.ok(NEIGHBOUR_ITEMS[item.classTsid], item.classTsid);
        assert.ok(existsSync(join(root, `assets/sprites/icons/${item.classTsid}.png`)), item.classTsid);
      }
    }
    assert.ok(NEIGHBOURS.filter((n) => n.chore === 'gift').every((n) => n.gifts?.length));
  });

  it('draw every house and deco at its true recovered size', () => {
    for (const n of NEIGHBOURS) {
      assert.deepEqual(pngSize(join(DECO_SRC, `${n.house.path}.png`)), [n.house.w, n.house.h], n.house.path);
      for (const prop of n.props) assert.ok(existsSync(join(DECO, `${prop}.webp`)), prop);
    }
    for (const [name, size] of Object.entries(SCENE_DECO_SIZES)) {
      assert.deepEqual(pngSize(join(DECO_SRC, `${name}.png`)), size, name);
    }
    for (const style of Object.values(SCENE_STYLES)) {
      for (const layer of style.layers) for (const item of layer.items) assert.ok(SCENE_DECO_SIZES[item.s], item.s);
      for (const item of style.near) assert.ok(SCENE_DECO_SIZES[item.s], item.s);
      assert.ok(SCENE_DECO_SIZES[style.soil], style.soil);
    }
  });

  it('lay out stone, mailbox, house and chore inside the street', () => {
    for (const n of NEIGHBOURS) {
      const l = neighbourLayout(n);
      assert.ok(l.stoneX < l.mailboxX && l.mailboxX < l.choreX && l.choreX < l.width - 100, n.id);
      assert.ok(l.doorX > l.houseX - l.houseW / 2 && l.doorX < l.houseX + l.houseW / 2);
      for (const p of propPlan(n)) assert.ok(p.x > 0 && p.x < l.width);
      assert.deepEqual(neighbourLayout(n), l, 'deterministic');
    }
    assert.equal(neighbourPlatforms()[0].y1, NEIGHBOUR_SCENE.groundY);
    assert.equal(NEIGHBOUR_SCENE.height - 80, NEIGHBOUR_SCENE.groundY, 'enterScene puts the ground 80 px above the scene bottom');
  });
});

describe('visiting', () => {
  it('picks a neighbour other than the last one', () => {
    for (let i = 0; i < 20; i += 1) assert.notEqual(pickNeighbour(i / 20, 'dorrit').id, 'dorrit');
    assert.equal(pickNeighbour(0).id, 'dorrit');
  });

  it('scene ids round-trip', () => {
    assert.equal(neighbourSceneTsid('juniper'), 'NB_juniper');
    assert.equal(isNeighbourSceneTsid('NB_juniper'), true);
    assert.equal(isNeighbourSceneTsid('NB_nobody'), false);
    assert.equal(neighbourFromScene('NB_tamsin').name, 'Tamsin Gloam');
  });

  it('counts visit_random and gives a little iMG on the first visit only', () => {
    const s = normalizeNeighbourState({});
    const first = recordVisit(s, neighbourById('hadwin'));
    assert.deepEqual(first, { first: true, visits: 1, xp: FIRST_VISIT_XP, counter: 'visit_random:hadwin' });
    assert.equal(recordVisit(s, neighbourById('hadwin')).xp, 0);
    assert.equal(s.lastId, 'hadwin');
  });
});

describe('chores', () => {
  it('can be done once per game day and thank you by mail once', () => {
    const s = normalizeNeighbourState({});
    const dorrit = neighbourById('dorrit');
    const p = pc();
    const out = doChore(s, dorrit, p, { dayKey: 'd1', now: 1000, energy: p.energy });
    assert.equal(out.ok, true);
    assert.deepEqual(out.effects, { energy: -3, mood: 6, xp: 8 });
    assert.equal(p.energy, 47);
    assert.equal(p.imagination, 8);
    assert.equal(out.letter.sender, 'Dorrit Applewhistle');
    assert.equal(out.letter.deliveryAt, 1000 + LETTER_DELAY_MS);
    assert.deepEqual(out.letter.attachment, { classTsid: 'tomato', count: 3 });
    assert.equal(choreVerb(s, dorrit, { dayKey: 'd1', energy: 50 }).enabled, false);
    const again = doChore(s, dorrit, pc(), { dayKey: 'd2', now: 2000, energy: 50 });
    assert.equal(again.ok, true);
    assert.equal(again.letter, null);
  });

  it('refills the birdhouse with one Grain', () => {
    const s = normalizeNeighbourState({});
    const juniper = neighbourById('juniper');
    assert.equal(choreVerb(s, juniper, { dayKey: 'd1', have: { grain: 0 } }).reason, CHORES.birdhouse.noItem);
    const out = doChore(s, juniper, pc(), { dayKey: 'd1', have: { grain: 1 } });
    assert.deepEqual(out.take, [{ classTsid: 'grain', count: 1 }]);
  });

  it('rotates the porch gift by day', () => {
    const pemberton = neighbourById('pemberton');
    const days = new Set(Array.from({ length: 12 }, (_, i) => porchGift(pemberton, `day-${i}`).classTsid));
    assert.ok(days.size > 1);
    const out = doChore(normalizeNeighbourState({}), pemberton, pc(), { dayKey: 'day-3' });
    assert.deepEqual(out.give, [porchGift(pemberton, 'day-3')]);
    assert.equal(porchGift(neighbourById('dorrit'), 'x'), null);
  });

  it('is blocked without energy', () => {
    const verb = choreVerb(normalizeNeighbourState({}), neighbourById('dorrit'), { dayKey: 'd', energy: 1 });
    assert.equal(verb.enabled, false);
  });
});

describe('letters', () => {
  it('replies to one posted note per day', () => {
    const s = normalizeNeighbourState({});
    const fenwick = neighbourById('fenwick');
    assert.equal(postNoteVerb(s, fenwick, { carried: 0, dayKey: 'd' }).reason, 'You have no notes to post!');
    assert.equal(postNoteVerb(s, fenwick, { carried: 1, dayKey: 'd' }).enabled, true);
    const reply = postNoteReply(s, fenwick, { title: 'Hello there' }, { dayKey: 'd', now: 5 });
    assert.match(reply.text, /“Hello there”/);
    assert.equal(postNoteVerb(s, fenwick, { carried: 1, dayKey: 'd' }).enabled, false);
  });

  it('sends a visitor letter once per new day while opted in with a home', () => {
    const s = normalizeNeighbourState({ allowVisits: true });
    assert.equal(visitorLetter(s, { dayKey: 'd1', homeOwned: false }), null);
    const letter = visitorLetter(s, { dayKey: 'd1', homeOwned: true, now: 9 });
    assert.ok(neighbourById(letter.neighbourId));
    assert.equal(letter.attachment.count > 0, true);
    assert.equal(visitorLetter(s, { dayKey: 'd1', homeOwned: true }), null);
    assert.ok(visitorLetter(s, { dayKey: 'd2', homeOwned: true }));
    assert.equal(visitorLetter(normalizeNeighbourState({}), { dayKey: 'd3', homeOwned: true }), null);
  });
});

describe('saved state', () => {
  it('drops unknown neighbours and never returns to a neighbour scene', () => {
    const s = normalizeNeighbourState({
      visits: { dorrit: 2, ghost: 9 },
      chores: { juniper: 'd1', juniper2: 'x' },
      thanked: { tamsin: true, hadwin: 'yes' },
      lastId: 'nobody',
      returnTo: { tsid: 'NB_dorrit', x: 1, y: 2 },
    });
    assert.deepEqual(s.visits, { dorrit: 2 });
    assert.deepEqual(s.chores, { juniper: 'd1' });
    assert.deepEqual(s.thanked, { tamsin: true });
    assert.equal(s.lastId, '');
    assert.equal(s.returnTo, null);
    assert.deepEqual(normalizeNeighbourState({ returnTo: { tsid: 'GLI2V0UN7RD1T2J', x: 3, y: 4 } }).returnTo, { tsid: 'GLI2V0UN7RD1T2J', x: 3, y: 4 });
  });
});
