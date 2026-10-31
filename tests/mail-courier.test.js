/**
 * G121 (lane MAILNPC): the AFLC Frog's express mail and the Mail Dispatcher.
 * Rules: public/js/mail-courier.js; mailbox flags: public/js/mailbox.js;
 * feature: public/js/features/mail-courier-feature.js; art: public/js/mail-npc-art.js.
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, openSync, readFileSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  COURIER,
  COURIER_TEXT,
  FROG_EPIPHANIES,
  FROG_RAMBLINGS,
  PARCEL,
  courierDueAt,
  flyStep,
  handOver,
  isExpressPending,
  letterLine,
  nextExpress,
  nextRamble,
  normalizeCourierState,
  pickPose,
  sendCarriedToMailbox,
  sendDueToMailbox,
} from '../public/js/mail-courier.js?v=cef544b7';
import {
  createMailboxState,
  deliverMail,
  normalizeMailboxState,
  receiveMailAttachments,
  seedMailbox,
} from '../public/js/mailbox.js?v=e62cffa6';
import { DISPATCHER_ART, FROG_ART, MAIL_NPC_ART_DIR } from '../public/js/mail-npc-art.js?v=790f980a';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pub = join(root, 'public');
const GSJS = join(os.homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'players/inc_mail.js'));
const read = (p) => readFileSync(join(GSJS, p), 'utf8');
/** House style: the source's em-dashes became a comma or a colon. */
const plain = (s) => s.replace(/\s*—\s*/g, ' ').replace(/[,:]\s*/g, ' ').replace(/\s+/g, ' ').trim();

function pngSize(file) {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(24);
  readSync(fd, buf, 0, 24, 0);
  closeSync(fd);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('express mail rules (players/inc_mail.js)', () => {
  it('cites the source numbers and words', { skip: !hasGsjs && 'needs glitch-GameServerJS beside the game' }, () => {
    assert.match(read('config_prod.js'), /mail_delivery_time_with_attachment = 7\*60;/);
    const mail = read('players/inc_mail.js');
    assert.match(mail, /if\(next_delivery - time\(\) < 30\)/);
    assert.equal(COURIER.minLeadMs, 30_000);
    assert.match(mail, /apiSetTimer\('deliver_mail', 3\*60\*1000\)/);
    assert.equal(COURIER.rescheduleMs, 180_000);
    assert.match(mail, /choose_one\(\[-500, 500\]\)/);
    assert.match(mail, /this\.y - 400\)/);
    assert.ok(mail.includes(COURIER_TEXT.prompt));
    assert.ok(mail.includes(COURIER_TEXT.growl));
    const frog = read('items/npc_yoga_frog.js');
    for (const t of ['gotMail', 'namaste', 'packFull', 'makeRoom', 'toMailbox', 'comeBack', 'willDo', 'karmaReply', 'yoga', 'description']) {
      assert.ok(frog.includes(COURIER_TEXT[t].replace(/'/g, "\\'")) || frog.includes(COURIER_TEXT[t]), t);
    }
    for (const t of ['karma', 'offToYoga', 'epiphany']) assert.ok(plain(frog.replace(/\\'/g, "'")).includes(plain(COURIER_TEXT[t])), t);
    for (const [line, reply] of FROG_RAMBLINGS) {
      assert.ok(frog.includes(line.replace(/"/g, '\\"')), line);
      assert.ok(frog.includes(reply), reply);
    }
    for (const e of FROG_EPIPHANIES) assert.ok(frog.includes(e.replace(/"/g, '\\"')), e);
    const disp = read('items/npc_mail_dispatcher.js');
    assert.match(disp, /apiSetTimer\('doParcel', 600\)/);
    assert.match(disp, /this\.x \+ 250, this\.y - 500/);
    assert.equal(PARCEL.prepareMs, 600);
    assert.equal(PARCEL.frogDx, 250);
    assert.equal(PARCEL.frogDy, -500);
  });

  it('player copy has no em-dashes', () => {
    for (const v of Object.values(COURIER_TEXT)) assert.ok(!v.includes('—'), v);
    for (const [a, b] of FROG_RAMBLINGS) assert.ok(!a.includes('—') && !b.includes('—'));
    for (const e of FROG_EPIPHANIES) assert.ok(!e.includes('—'));
  });

  it('a letter with an item is express; words, currants, ledger and welcome letters are not', () => {
    const st = createMailboxState();
    const item = deliverMail(st, { sender: 'Amp', text: 'hi', attachment: { classTsid: 'apple', count: 2 }, deliveryAt: 1000 });
    assert.equal(item.express, true);
    assert.equal(item.inMailbox, false);
    const words = deliverMail(st, { sender: 'Amp', text: 'hi', deliveryAt: 1000 });
    assert.equal('express' in words, false);
    const cash = deliverMail(st, { sender: 'Amp', text: 'hi', currants: 5, deliveryAt: 1000 });
    assert.equal('express' in cash, false);
    const auc = deliverMail(st, { sender: 'AFLC', text: 'x', attachment: { classTsid: 'apple', count: 1 }, ledger: 'auc-0123456789abcdef-d' });
    assert.equal('express' in auc, false);
    const no = deliverMail(st, { sender: 'Amp', text: 'hi', attachment: { classTsid: 'apple', count: 1 }, express: false });
    assert.equal('express' in no, false);
    const seeded = seedMailbox(createMailboxState(), 5000);
    assert.ok(seeded.messages.every((m) => !m.express));
    // A save round trip keeps the flags; older rows keep their old shape.
    const again = normalizeMailboxState(JSON.parse(JSON.stringify(st)));
    assert.equal(again.messages[0].express, true);
    assert.equal(again.messages[0].inMailbox, false);
    assert.deepEqual(Object.keys(again.messages[1]).sort(), Object.keys(words).sort());
  });

  it('collecting at the mailbox leaves the frog nothing to bring', () => {
    const st = createMailboxState();
    const m = deliverMail(st, { sender: 'Amp', text: 'hi', attachment: { classTsid: 'apple', count: 1 }, deliveryAt: 1 });
    const inv = {};
    const pc = { currants: 0 };
    assert.ok(receiveMailAttachments(st, inv, pc, m.id, 10).ok);
    assert.equal(m.inMailbox, true);
    assert.equal(isExpressPending(m), false);
  });

  it('the next express letter is due within 60 s; a call is never sooner than 30 s', () => {
    const st = createMailboxState();
    deliverMail(st, { sender: 'A', text: 'a', attachment: { classTsid: 'apple', count: 1 }, deliveryAt: 200_000 });
    deliverMail(st, { sender: 'B', text: 'b', attachment: { classTsid: 'cherry', count: 1 }, deliveryAt: 100_000 });
    const [a, b] = st.messages;
    assert.equal(nextExpress(st.messages, 0), null);
    assert.equal(nextExpress(st.messages, 0, { future: true }).id, b.id);
    assert.equal(nextExpress(st.messages, 50_000).id, b.id);
    assert.equal(courierDueAt(b, 10_000), 100_000);
    assert.equal(courierDueAt(b, 90_000), 120_000);
    b.deleted = true;
    assert.equal(nextExpress(st.messages, 150_000).id, a.id);
  });

  it('mail_login: what came due while away goes to the mailbox, expedited', () => {
    const st = createMailboxState();
    deliverMail(st, { sender: 'A', text: 'a', attachment: { classTsid: 'apple', count: 1 }, deliveryAt: 1000 });
    deliverMail(st, { sender: 'B', text: 'b', attachment: { classTsid: 'apple', count: 1 }, deliveryAt: 9000 });
    // deliverMail re-normalizes the rows, so read them back from the state.
    const [old, soon] = st.messages;
    assert.equal(sendDueToMailbox(st.messages, 5000), 1);
    assert.equal(old.inMailbox, true);
    assert.equal(old.expedited, true);
    assert.equal(soon.inMailbox, false);
    assert.equal(sendCarriedToMailbox(st.messages, 5000), 1);
    assert.equal(soon.inMailbox, true);
  });

  it('handing over: currants first, the item only when the pack takes it', () => {
    const st = createMailboxState();
    const m = deliverMail(st, { sender: 'A', text: 'a', currants: 25, attachment: { classTsid: 'apple', count: 3 }, deliveryAt: 1 });
    const inv = { apple: 1 };
    const pc = { currants: 10 };
    const full = handOver(m, inv, pc, { room: 2 });
    assert.equal(full.ok, false);
    assert.equal(full.reason, 'pack_full');
    assert.equal(pc.currants, 35);
    assert.equal(m.currants, 0);
    assert.equal(inv.apple, 1);
    assert.equal(isExpressPending(m), true);
    const ok = handOver(m, inv, pc, { room: 3 });
    assert.equal(ok.ok, true);
    assert.equal(ok.currants, 0);
    assert.equal(inv.apple, 4);
    assert.equal(pc.currants, 35);
    assert.equal(m.read && m.inMailbox && m.expedited && m.attachmentsClaimed, true);
    assert.equal(handOver(m, inv, pc).ok, false);
  });

  it('the frog\'s lines: ramblings in turn, letters by count, a pose', () => {
    let order = null;
    const seen = [];
    for (let i = 0; i < 8; i += 1) {
      const r = nextRamble(order);
      order = r.order;
      seen.push(order);
    }
    assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 0]);
    assert.equal(letterLine(0, { sender: 'Amp', text: 'Hi', stuff: true }), 'OK, so there\'s like… an express message for you from Amp. They said, "Hi" and they sent you all this stuff, too.');
    assert.equal(letterLine(1, { sender: '', text: 'Hi' }), 'Oh, right. There\'s also a message from Groddle Afternoon Post. They said, "Hi"');
    assert.equal(letterLine(2, { sender: 'Amp', stuff: true }), 'And you\'ve got something from Amp. They sent you all this stuff.');
    assert.equal(pickPose(0), 'tree');
    assert.equal(pickPose(0.5), 'dancer');
    assert.equal(pickPose(0.999), 'warrior');
    const body = { x: 0, y: 0 };
    assert.equal(flyStep(body, { x: 400, y: 0 }, 400, 500), false);
    assert.equal(body.x, 200);
    assert.equal(flyStep(body, { x: 400, y: 0 }, 400, 600), true);
    assert.equal(body.x, 400);
    assert.deepEqual(normalizeCourierState({ order: 9, delivered: 2 }), { order: 2, delivered: 2, parcels: 0 });
  });
});

describe('mail npc art (tools/mail-npc-art/build.mjs)', () => {
  it('every sheet is in the build and its size matches the module', () => {
    const dir = join(pub, MAIL_NPC_ART_DIR);
    const [dw, dh] = pngSize(join(dir, DISPATCHER_ART.file));
    const frames = Object.values(DISPATCHER_ART.labels).reduce((n, [, c]) => n + c, 0);
    assert.equal(frames, 116);
    assert.equal(dw, DISPATCHER_ART.cols * DISPATCHER_ART.cell.w);
    assert.equal(dh, Math.ceil(frames / DISPATCHER_ART.cols) * DISPATCHER_ART.cell.h);
    for (const label of ['idle', 'interact', 'cancel', 'prepare_package', 'waiting_for_frog', 'package_sent']) assert.ok(DISPATCHER_ART.labels[label], label);
    assert.equal(Object.keys(FROG_ART.sheets).length, 14);
    for (const [label, [cols, count]] of Object.entries(FROG_ART.sheets)) {
      for (const kind of ['box', 'none']) {
        const [w, h] = pngSize(join(dir, `${FROG_ART.files[kind]}${label}.png`));
        assert.equal(w, cols * FROG_ART.cell.w, `${kind} ${label}`);
        assert.ok(h >= Math.ceil(count / cols) * FROG_ART.cell.h, `${kind} ${label}`);
      }
    }
    // The built frog lines up with Tiny Speck's own renders.
    for (const fit of Object.values(FROG_ART.redFit)) assert.ok(fit >= 0.8);
  });

  it('G448: the frog\'s 28 sheets have 3x renders from npc_yoga_frog.swf that swap in on first draw', async () => {
    const { FIRST_DRAW_SPRITES, HIRES_SPRITES, hiresSpriteUrl } = await import('../public/js/sprite-hires.js?v=f7ea0bd5');
    const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
    let n = 0;
    for (const label of Object.keys(FROG_ART.sheets)) {
      for (const kind of ['box', 'none']) {
        const path = `${MAIL_NPC_ART_DIR}${FROG_ART.files[kind]}${label}.png`.replace(/^.*?(assets\/)/, '$1');
        const r = results[path];
        assert.equal(r?.status, 'ok', path);
        assert.ok(r.score >= 0.9 && r.minFrame >= 0.8 && r.drift.length === 0, `${path} ${r.score}`);
        assert.ok(HIRES_SPRITES.has(path) && FIRST_DRAW_SPRITES.has(path), path);
        assert.match(hiresSpriteUrl(path), /@3x\.webp$/, path);
        assert.ok(existsSync(join(pub, r.hires)), r.hires);
        n += 1;
      }
    }
    assert.equal(n, 28);
  });
});

describe('mail courier feature', () => {
  it('is registered once under its key', () => {
    const index = readFileSync(join(pub, 'js/features/index.js'), 'utf8');
    assert.equal(index.match(/mail-courier-feature\.js\?v=[0-9a-f]{8}/g)?.length, 1);
  });

  it('calls the frog with the source prompt once a letter is due, and waits in an instance', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    try {
      const { mailCourierFeature } = await import('../public/js/features/mail-courier-feature.js?v=d9d91923');
      const st = createMailboxState();
      const prompts = [];
      let instance = false;
      const data = {};
      const engine = {
        started: true,
        player: { x: 500, y: 600 },
        streetTsid: 'GA5101HF7F429V5',
        interactables: [],
        mailMessages: () => st.messages,
        param: () => null,
        prompt: (p) => prompts.push(p),
        busy: () => false,
        acting: () => false,
        questDialogueOpen: () => false,
        streetCardUp: () => false,
        transientInstance: () => instance,
        homeContext: () => ({ inHome: false }),
        setData: (k, v) => { data[k] = v; },
        pushActivity: () => {},
        refreshPack: () => {},
        save: () => {},
      };
      mailCourierFeature.restore({});
      // Due while away: straight to the mailbox at load.
      const away = deliverMail(st, { sender: 'A', text: 'a', attachment: { classTsid: 'apple', count: 1 }, deliveryAt: 999_000 });
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(away.inMailbox, true);
      assert.equal(data.mailCourierLast, 'login:1');
      const m = deliverMail(st, { sender: 'Amp', text: 'hi', attachment: { classTsid: 'apple', count: 1 }, deliveryAt: Date.now() });
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(prompts.length, 0, 'not before 30 s');
      instance = true;
      mock.timers.tick(30_000);
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(prompts.length, 0, 'not in an instance');
      assert.equal(data.mailCourierLast, 'courier:rescheduled');
      instance = false;
      mock.timers.tick(179_000);
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(prompts.length, 0, 'three minutes later');
      mock.timers.tick(1_000);
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(prompts.length, 1);
      assert.equal(prompts[0].modal, true);
      assert.equal(prompts[0].text, 'Special delivery! A package has arrived for you.');
      assert.equal(isExpressPending(m), true);
    } finally {
      mock.timers.reset();
    }
  });
});
