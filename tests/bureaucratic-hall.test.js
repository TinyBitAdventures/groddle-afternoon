/**
 * The Bureaucratic Hall visit (js/bureaucratic-hall.js): the greeting, the
 * waiting area and Please Wait, "Just wait!", help, the purchase, and the
 * hall drawn from Tiny Speck's bldg_int_bhall.swf.
 * Run: node --test tests/bureaucratic-hall.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HALL,
  HALL_LAYOUT,
  HALL_QUESTIONS,
  HALL_RESPONSES,
  HALL_TEXT,
  PLEASE_WAIT_MS,
  createHallFlow,
  fillHallText,
  hallItems,
  hallX,
  waitPromptFor,
} from '../public/js/bureaucratic-hall.js?v=g443-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const pub = (p) => readFileSync(join(root, 'public', p), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

function fakeHost(over = {}) {
  let t = 1000;
  const calls = { prompts: [], removed: [], says: [], talks: [], buffs: [], bought: [] };
  const pos = { x: HALL_LAYOUT.arrival.x, y: HALL.ground };
  let answer = null;
  const host = {
    now: () => t,
    player: () => pos,
    pcLabel: () => 'Ur',
    clerkCount: 4,
    clerkLabel: (i) => ['Assistant Wigglesbottom', 'Deputy Sharpburger', 'Secretary Piksnixson', 'Administrator Earwick'][i],
    drawClerk() {},
    say: (i, text) => calls.says.push({ i, text }),
    converse: (i, opts) =>
      new Promise((resolve) => {
        calls.talks.push({ i, ...opts });
        answer = resolve;
      }),
    prompt: (opts) => {
      calls.prompts.push(opts);
      return `p${calls.prompts.length}`;
    },
    removePrompt: (uid) => calls.removed.push(uid),
    applyBuff: () => calls.buffs.push('on'),
    removeBuff: () => calls.buffs.push('off'),
    acting: () => false,
    learned: () => [],
    achievements: () => [],
    buy: (item) => {
      calls.bought.push(item.classTsid);
      return 'ok';
    },
    setData() {},
    rng: () => 0,
    ...over,
  };
  return {
    host,
    calls,
    pos,
    advance: (ms) => (t += ms),
    answer: async (value) => {
      const r = answer;
      answer = null;
      r(value);
      await flush();
    },
    lastTalk: () => calls.talks[calls.talks.length - 1],
  };
}

/** Walk the visit to its first call: greeted, sent to wait, the 10 s done. */
async function toCalled(h, flow) {
  flow.tick(16);
  flow.hurryClerks();
  flow.tick(16);
  await h.answer('greeting-ok');
  // The greeter walks back behind the counter (about 2.5 s of the 10).
  flow.hurryClerks();
  flow.tick(16);
  h.pos.x = 900;
  flow.tick(16);
  h.advance(PLEASE_WAIT_MS);
  flow.tick(16);
  flow.hurryClerks();
  flow.tick(16);
}

describe('the hall on the backdrop', () => {
  it('maps the source x numbers onto bureaucratic_hall_bg (stage x = hall x + 1106)', () => {
    assert.equal(hallX(-857), 249);
    assert.deepEqual(HALL_LAYOUT.arrival, { x: 249, y: 547 });
    assert.equal(HALL_LAYOUT.waitingLine, 886);
    assert.ok(HALL_LAYOUT.waitingLine > HALL_LAYOUT.waitingArea[0] && HALL_LAYOUT.waitingLine < HALL_LAYOUT.waitingArea[1], 'the -220 line falls among the chairs');
    assert.equal(HALL_LAYOUT.greetMin, 1490);
    assert.equal(HALL_LAYOUT.helpMax, 1556);
    assert.deepEqual(HALL_LAYOUT.stroll, [1606, 2166]);
    assert.ok(HALL_LAYOUT.clerkHomes.every((x) => x >= HALL_LAYOUT.stroll[0] && x <= HALL_LAYOUT.stroll[1]));
    assert.equal(HALL.ground, HALL.height - 128, 'the bureaucrats path at y -128');
  });

  it('draws Tiny Speck\'s hall: the backdrop and the signs, no drawn chairs', () => {
    const game = pub('game.js');
    const draw = game.slice(game.indexOf('function drawBureaucraticHall()'), game.indexOf('function installLegalizeScene('));
    for (const name of ['bureaucratic_hall_bg', 'bureaucratic_hall_waitingroom_1', 'sign_waiting_area', 'bureaucratic_hall_sign_wait_1', 'bureaucratic_hall_sign_1']) {
      assert.match(draw, new RegExp(`'${name}'`), name);
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${name}.webp`)), `${name}.webp`);
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${name}@1.5x.webp`)), `${name}@1.5x.webp`);
    }
    assert.doesNotMatch(draw, /roundRect|WAITING\\nAREA/, 'the remake\'s own chairs and plaque are gone');
    const manifest = JSON.parse(pub('assets/decos/manifest.json'));
    for (const name of ['bureaucratic_hall_bg', 'sign_waiting_area', 'bureaucratic_hall_waitingroom_1']) assert.ok(manifest.includes(name), name);
    const recovered = JSON.parse(readFileSync(join(root, 'tools/deco-pipeline/recovered.json'), 'utf8')).decos;
    assert.match(recovered.bureaucratic_hall_bg.swf, /^bundle:bldg_int_bhall\.swf#bureaucratic_hall_bg$/);
  });

  it('the bureaucrats walk on their recovered walk sheets', () => {
    const game = pub('game.js');
    for (let i = 0; i < 4; i += 1) {
      assert.match(game, new RegExp(`bureaucrat${i}Walk1: \\{\\n[^}]*cols: 8, rows: 3,`));
      assert.match(game, new RegExp(`bureaucrat${i}Walk2: \\{\\n[^}]*cols: 6, rows: 2,`));
    }
    for (const m of game.matchAll(/bureaucrat\dWalk\d: \{\n\s*url: '([^']+)'/g)) assert.ok(existsSync(join(root, 'public', m[1])), m[1]);
  });
});

describe('the copy is the source\'s', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
  const bureaucrat = existsSync(gsjs) ? readFileSync(join(gsjs, 'items/npc_bureaucrat.js'), 'utf8') : '';
  it('responses and random questions word for word', () => {
    for (const list of Object.values(HALL_RESPONSES)) for (const line of list) assert.ok(bureaucrat.includes(`"${line}"`), line);
    for (const qn of HALL_QUESTIONS) assert.ok(bureaucrat.includes(`{txt: "${qn.txt}", options: [${qn.options.map((o) => `'${o}'`).join(', ')}]`), qn.txt);
    assert.equal(HALL_QUESTIONS.length, 49);
  });
  it('greeting, prompts, refusal, buff', () => {
    assert.ok(bureaucrat.includes('"</b>! We will be with you as soon as possible. Now please go and wait."'));
    for (const t of [HALL_TEXT.waitRight, HALL_TEXT.waitLeft, HALL_TEXT.endPrompt, HALL_TEXT.noOne, HALL_TEXT.broke, HALL_TEXT.approach]) assert.ok(bureaucrat.includes(t), t);
    const player = readFileSync(join(gsjs, 'players/player.js'), 'utf8');
    assert.ok(player.includes("'You can\\'t do anything while waiting. Just wait!'"));
    const location = readFileSync(join(gsjs, 'locations/location.js'), 'utf8');
    assert.ok(location.includes(HALL_TEXT.cardNoSkill));
    const buffs = readFileSync(join(gsjs, 'items/catalog_buffs.js'), 'utf8');
    assert.match(buffs, /"please_wait" : \{\n\t\tname\t\t: "Please Wait",\n\t\tdesc\t\t: "Do not move: just wait.",\n\t\tduration\t: 10,/);
  });
});

describe('the visit', () => {
  it('greets you on arrival and sends you right when you are left of -220', async () => {
    const h = fakeHost();
    const flow = createHallFlow(h.host);
    flow.tick(16);
    assert.equal(flow.state.phase, 'greeting');
    assert.equal(flow.clerks[0].target, 1490, 'max(pc.x + 100, 384)');
    flow.hurryClerks();
    flow.tick(16);
    assert.equal(h.lastTalk().text, '<b>Ur</b>! We will be with you as soon as possible. Now please go and wait.');
    await h.answer('greeting-ok');
    assert.equal(flow.state.waiting, true);
    assert.equal(h.calls.prompts[0].text, 'Please move into the waiting area to your right.');
    assert.equal(waitPromptFor(1000), 'Please move into the waiting area to your left.');
    // Closing the greeting counts as OK too (conversation_cancel).
    const h2 = fakeHost();
    const f2 = createHallFlow(h2.host);
    f2.tick(16);
    f2.hurryClerks();
    f2.tick(16);
    await h2.answer(null);
    assert.equal(f2.state.waiting, true);
  });

  it('the waiting area applies Please Wait once; 10 s later a bureaucrat comes to call you', async () => {
    const h = fakeHost();
    const flow = createHallFlow(h.host);
    flow.tick(16);
    flow.hurryClerks();
    flow.tick(16);
    await h.answer('greeting-ok');
    h.pos.x = 700;
    flow.tick(16);
    assert.deepEqual(h.calls.removed, ['p1'], 'the waiting prompt goes');
    assert.deepEqual(h.calls.buffs, ['on']);
    assert.equal(flow.state.waiting, false);
    h.advance(PLEASE_WAIT_MS - 1);
    flow.tick(16);
    assert.equal(flow.state.helping, -1);
    h.advance(1);
    flow.tick(16);
    assert.deepEqual(h.calls.buffs, ['on', 'off']);
    assert.ok(flow.state.helping >= 0);
    const helper = flow.clerks[flow.state.helping];
    assert.equal(helper.anim, 'walk2');
    assert.ok(helper.target <= HALL_LAYOUT.helpMax);
    flow.hurryClerks();
    flow.tick(16);
    assert.equal(flow.state.phase, 'called');
    assert.ok(HALL_RESPONSES.helping_ready.map((l) => l.replace(/{pc_label}/g, 'Ur')).includes(h.calls.says[0].text));
    h.advance(8000);
    flow.tick(16);
    assert.equal(h.calls.says.length, 2, 'helping_reminder after 8 s');
  });

  it('acting mid-wait: the buff goes, "Just wait!", and its OK starts the wait over', async () => {
    const h = fakeHost();
    const flow = createHallFlow(h.host);
    flow.tick(16);
    flow.hurryClerks();
    flow.tick(16);
    await h.answer('greeting-ok');
    h.pos.x = 900;
    flow.tick(16);
    assert.equal(flow.noteAction('local_chat'), false, 'chat is allowed');
    h.advance(600);
    h.pos.x = 930;
    flow.tick(16);
    flow.tick(16);
    assert.equal(flow.state.buffOn, false);
    const refusal = h.calls.prompts.at(-1);
    assert.equal(refusal.text, "You can't do anything while waiting. Just wait!");
    assert.equal(refusal.timeout, 3);
    assert.equal(refusal.timeoutValue, 'ok');
    refusal.onChoice('ok');
    assert.equal(flow.state.buffOn, true);
    assert.equal(flow.state.buffAt, h.host.now(), 'a fresh 10 s');
    h.advance(600);
    assert.equal(flow.noteAction('npc_piggy:pet'), true);
    assert.equal(flow.state.refusals, 2);
    h.calls.prompts.at(-1).onTimeout('ok');
    assert.equal(flow.state.buffOn, true);
  });

  it('leaving the hall clears the flags and the buff', async () => {
    const h = fakeHost();
    const flow = createHallFlow(h.host);
    flow.tick(16);
    flow.hurryClerks();
    flow.tick(16);
    await h.answer('greeting-ok');
    h.pos.x = 900;
    flow.tick(16);
    flow.end();
    assert.equal(h.calls.buffs.at(-1), 'off');
    assert.equal(flow.state.waiting, false);
    assert.equal(flow.state.started, false);
    assert.equal(flow.state.phase, 'left');
  });

  it('Talk to only for the bureaucrat calling you; the list, a transfer, the question, the fee', async () => {
    const h = fakeHost({ rng: () => 0.9 });
    const flow = createHallFlow(h.host);
    await toCalled(h, flow);
    const first = flow.state.helping;
    const other = (first + 1) % 4;
    assert.deepEqual(flow.talkState(other), { enabled: false, reason: 'Please approach the counter for assistance.' });
    assert.equal(flow.talkState(first).enabled, true);
    flow.talk(first);
    await flush();
    assert.equal(h.lastTalk().text, 'The following items are available to you:');
    assert.deepEqual(h.lastTalk().choices.map((c) => c.label), ['Card-Carrying Qualification (50c)', 'Nevermind']);
    await h.answer('card_carrying_qualification');
    assert.match(h.lastTalk().text, /a <b>Card-Carrying Qualification<\/b>/);
    const second = flow.state.helperIndex;
    assert.notEqual(second, first);
    assert.ok(h.lastTalk().text.includes(`<b>${h.host.clerkLabel(second)}</b>`));
    await h.answer('ok');
    assert.equal(flow.state.step, 2);
    assert.equal(flow.state.helping, second);
    flow.hurryClerks();
    flow.tick(16);
    await flush();
    assert.deepEqual(h.lastTalk().choices.map((c) => c.label), ['YES']);
    await h.answer('yes');
    const qn = HALL_QUESTIONS.find((row) => row.txt === h.lastTalk().text);
    assert.ok(qn, 'a random question');
    await h.answer('random-0');
    // rng 0.9: no further transfer (40%), the fee.
    assert.match(h.lastTalk().text, /<b>50<\/b>/);
    assert.deepEqual(h.lastTalk().choices.map((c) => c.label), ['Pay 50', 'Nevermind']);
    await h.answer('purchase');
    assert.deepEqual(h.calls.bought, ['card_carrying_qualification']);
    assert.equal(h.calls.prompts.at(-1).text, HALL_TEXT.endPrompt);
    assert.equal(h.calls.prompts.at(-1).timeout, 10);
    assert.equal(flow.state.phase, 'done');
  });

  it('a 40% roll sends you on to yet another bureaucrat', async () => {
    const h = fakeHost({ rng: () => 0.1 });
    const flow = createHallFlow(h.host);
    await toCalled(h, flow);
    flow.talk(flow.state.helping);
    await flush();
    await h.answer('card_carrying_qualification');
    await h.answer('ok');
    flow.hurryClerks();
    flow.tick(16);
    await flush();
    await h.answer('yes');
    await h.answer('random-1');
    assert.ok(HALL_RESPONSES.purchasing_step3.some((l) => h.lastTalk().text.startsWith(l.split('{')[0])));
    await h.answer('ok');
    assert.equal(flow.state.step, 3);
  });

  it('Nevermind (or closing it) ends the visit with the end prompt', async () => {
    const h = fakeHost();
    const flow = createHallFlow(h.host);
    await toCalled(h, flow);
    flow.talk(flow.state.helping);
    await flush();
    await h.answer(null);
    assert.equal(h.calls.prompts.at(-1).text, HALL_TEXT.endPrompt);
    assert.equal(flow.state.done, true);
    assert.equal(flow.talkState(0).enabled, false);
  });

  it('a card holder without Bureaucratic Arts is sent away', async () => {
    const h = fakeHost({ achievements: () => ['card_carrying_qualification'] });
    const flow = createHallFlow(h.host);
    flow.tick(16);
    flow.hurryClerks();
    flow.tick(16);
    await h.answer('greeting-ok');
    h.pos.x = 900;
    flow.tick(16);
    assert.equal(h.calls.prompts.at(-1).text, HALL_TEXT.cardNoSkill);
    assert.equal(h.calls.buffs.length, 0, 'no wait for them');
    flow.hurryClerks();
    flow.tick(16);
    await flush();
    assert.equal(h.lastTalk().text, "Go away, <b>Ur</b>, we don't have time to waste on people who have not learned any Bureaucratic Arts.");
  });

  it('a script (Legalize It) fixes the picks and hears each step', async () => {
    const heard = [];
    const h = fakeHost({ rng: () => 0.05 });
    const flow = createHallFlow(h.host, {
      script: {
        pick: (kind) => ({ helping_ready: 6, purchasing_step1: 1, purchasing_step2: 1, purchasing_confirm: 0 })[kind] ?? null,
        question: () => 34,
        handoff: () => false,
        helperFor: () => (heard.includes('item') ? 1 : 0),
        onHelp: (i, step) => heard.push(`help:${i}:${step}`),
        onTalk: (i) => heard.push(`talk:${i}`),
        onItem: () => heard.push('item'),
        onAnswer: (k) => heard.push(`answer:${k}`),
        onPurchase: () => 'ok',
      },
    });
    await toCalled(h, flow);
    assert.equal(h.calls.says[0].text, 'Attention, Ur! When you’re ready?');
    flow.talk(0);
    await flush();
    await h.answer('card_carrying_qualification');
    assert.equal(h.lastTalk().text, 'I understand you’re hoping to attain a <b>Card-Carrying Qualification</b>, Ur. That’s a matter for <b>Deputy Sharpburger</b>. Let me find out if they’re in the office this week.');
    await h.answer('ok');
    flow.hurryClerks();
    flow.tick(16);
    await flush();
    assert.equal(h.lastTalk().text, 'I understand you’re here to procure yourself a <b>Card-Carrying Qualification</b>, is that right?');
    await h.answer('yes');
    assert.equal(h.lastTalk().text, 'This shouldn’t be a problem. One last question. Your favorite color?');
    assert.deepEqual(h.lastTalk().choices.map((c) => c.label), ['Beige', 'Other']);
    await h.answer('random-0');
    assert.equal(h.lastTalk().text, 'Very well. The fee is <b>50</b>. We only accept cash.');
    await h.answer('purchase');
    assert.deepEqual(heard, ['help:0:0', 'talk:0', 'item', 'help:1:2', 'talk:1', 'answer:0']);
  });
});

describe('getItems and the fill rules', () => {
  it('store 17 as getItems allows it', () => {
    assert.deepEqual(hallItems([], []).map((i) => i.classTsid), ['card_carrying_qualification']);
    assert.deepEqual(hallItems([], ['card_carrying_qualification']), []);
    assert.deepEqual(hallItems(['bureaucraticarts_1'], ['card_carrying_qualification']).map((i) => i.classTsid), ['your_papers']);
    assert.deepEqual(hallItems(['bureaucraticarts_1', 'bureaucraticarts_2'], []).map((i) => i.classTsid), ['card_carrying_qualification', 'your_papers', 'general_building_permit']);
  });
  it('"a" before the item except Your Papers', () => {
    assert.equal(fillHallText('{item_label}', { item: { label: 'Your Papers', cost: 100 }, article: true }), '<b>Your Papers</b>');
    assert.equal(fillHallText('{item_label}', { item: { label: 'General Building Permit', cost: 500 }, article: true }), 'a <b>General Building Permit</b>');
  });
});
