/**
 * G121 (lane MAILNPC): the AFLC Frog's express mail and the Mail Dispatcher.
 * Rules: public/js/mail-courier.js; mailbox flags: public/js/mailbox.js;
 * feature: public/js/features/mail-courier-feature.js; art: public/js/mail-npc-art.js.
 */
import { describe, it, mock } from 'node:test';
import { imageSize } from '../tools/image-size.mjs';
import { pngBufferToWebp } from '../tools/webp-lossless.mjs';
import assert from 'node:assert/strict';
import { existsSync, openSync, readFileSync, readSync, readdirSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  AUCTION_ACTIONS,
  AUCTION_PAGE,
  COURIER,
  COURIER_TEXT,
  FROG_EPIPHANIES,
  FROG_MORE_AUCTIONS,
  FROG_RAMBLINGS,
  FROG_VARIANT,
  PARCEL,
  auctionDescribe,
  auctionGotLine,
  courierDueAt,
  dueAuctions,
  handOverAuction,
  isAuctionPending,
  nextAuction,
  flyStep,
  handOver,
  isExpressPending,
  letterLine,
  nextExpress,
  nextRamble,
  normalizeCourierState,
  pickPose,
  sendAuctionsToMailbox,
  sendCarriedToMailbox,
  sendDueToMailbox,
} from '../public/js/mail-courier.js?v=68125101';
import {
  createMailboxState,
  deliverMail,
  normalizeMailboxState,
  receiveMailAttachments,
  seedMailbox,
} from '../public/js/mailbox.js?v=a3e833ba';
import { DISPATCHER_ART, FROG_ART, MAIL_NPC_ART_DIR } from '../public/js/mail-npc-art.js?v=1ed97a5d';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pub = join(root, 'public');
const GSJS = join(os.homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'players/inc_mail.js'));
const OGA_FROG = join(os.homedir(), 'Documents/glitch-audit/opengameart/extracted_vendors/glitch-assets');
const read = (p) => readFileSync(join(GSJS, p), 'utf8');
/** House style: the source's em-dashes became a comma or a colon. */
const plain = (s) => s.replace(/\s*—\s*/g, ' ').replace(/[,:]\s*/g, ' ').replace(/\s+/g, ' ').trim();

function pngSize(file) {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(32);
  readSync(fd, buf, 0, 32, 0);
  closeSync(fd);
  return [imageSize(buf).w, imageSize(buf).h];
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
    for (const v of Object.values(COURIER_TEXT)) {
      const t = typeof v === 'function' ? v(['an Apple', '3 Cherries']) : v;
      assert.ok(!t.includes('—'), t);
    }
    for (const t of FROG_MORE_AUCTIONS) assert.ok(!t.includes('—'), t);
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

describe('ticket 74: auction deliveries come by red AFLC Frog (inc_mail.js, npc_yoga_frog.js)', () => {
  const ID = '0123456789abcdef';
  const auc = (st, extra = {}) => deliverMail(st, {
    id: `auction-${extra.id || ID}`, sender: 'Auction Fulfillment and Logistics Corporation', text: 'x',
    attachment: { classTsid: 'cherry', count: 3 }, ledger: `auc-${extra.id || ID}-d`, auction: 'purchased', express: true, deliveryAt: 1000, ...extra,
  });

  it('cites the source: red for auctions, blue for courier mail, the frog\'s words', { skip: !hasGsjs && 'needs glitch-GameServerJS beside the game' }, () => {
    const mail = read('players/inc_mail.js');
    assert.match(mail, /if\(this\.delivery_type == 'courier'\) \{\s*frog\.setInstanceProp\('variant', 'frogBlue'\);\s*\} else \{\s*frog\.setInstanceProp\('variant', 'frogRed'\);/);
    assert.deepEqual(FROG_VARIANT, { courier: 'frogBlue', auction: 'frogRed', pickup: 'frogBlue' });
    assert.match(mail, /this\.sendActivity\("Mail time! You got "\+mailItems\[0\]\+'\.'\);/);
    assert.match(mail, /deets\.mailType == 'auction' && deets\.delivery_time <= time\(\) \+ 60/);
    assert.match(read('config_prod.js'), /var auction_delivery_time = 600;/);
    const auctions = read('players/inc_auctions.js');
    for (const kind of AUCTION_ACTIONS) assert.ok(auctions.includes(`config.auction_delivery_time, uid, this.tsid, '${kind}')`), kind);
    const frog = read('items/npc_yoga_frog.js');
    assert.ok(frog.includes("var conv_start = 'Got your ' + rewards.describe + (rewards.items.length > 1 ? ' auctions, brah.' : ' auction, brah.');"));
    assert.match(frog, /mail_build_auction_rewards\(0, 10\)/);
    assert.equal(AUCTION_PAGE, 10);
    for (const line of FROG_MORE_AUCTIONS) assert.ok(frog.includes(line.replace(/'/g, "\\'")) || frog.includes(line), line);
    assert.match(frog, /if\(this\.pc\.get_auction_mail\(\)\) \{\s*this\.deliveryFailed\(pc, msg\);/);
  });

  it('an auction row is the red frog\'s only when the auctions feature says so; never the blue one\'s', () => {
    const st = createMailboxState();
    const old = deliverMail(st, { sender: 'AFLC', text: 'x', attachment: { classTsid: 'apple', count: 1 }, ledger: `auc-${ID}-d` });
    assert.equal('express' in old, false, 'a row from before keeps waiting in the mailbox');
    assert.equal(isAuctionPending(old), false);
    const m = auc(st, { id: 'fedcba9876543210' });
    assert.equal(m.express, true);
    assert.equal(m.auction, 'purchased');
    assert.equal(isAuctionPending(m), true);
    assert.equal(isExpressPending(m), false);
    const again = normalizeMailboxState(JSON.parse(JSON.stringify(st)));
    assert.equal(again.messages[1].auction, 'purchased');
    assert.equal(again.messages[1].express, true);
    assert.equal(normalizeMailboxState({ messages: [{ id: 'x', auction: 'stolen' }] }).messages[0].auction, undefined);
  });

  it('the next delivery is due within 60 s; the frog carries only what the site will hand over', () => {
    const st = createMailboxState();
    auc(st, { id: '1111111111111111', deliveryAt: 100_000 });
    auc(st, { id: '2222222222222222', deliveryAt: 130_000, auction: 'expired' });
    const [a, b] = st.messages;
    assert.equal(nextAuction(st.messages, 0), null);
    assert.equal(nextAuction(st.messages, 0, { future: true }).id, a.id);
    assert.equal(nextAuction(st.messages, 40_000).id, a.id);
    assert.deepEqual(dueAuctions(st.messages, 100_000).map((m) => m.id), [a.id]);
    assert.deepEqual(dueAuctions(st.messages, 130_000).map((m) => m.id), [a.id, b.id]);
    a.attachmentsClaimed = true;
    assert.equal(nextAuction(st.messages, 130_000).id, b.id);
    // The solo demo's rows (no site) look 60 s ahead as the source did.
    const solo = createMailboxState();
    deliverMail(solo, { sender: 'AFLC', text: 'x', attachment: { classTsid: 'apple', count: 1 }, auction: 'cancelled', express: true, deliveryAt: 50_000 });
    assert.equal(dueAuctions(solo.messages, 0).length, 1);
  });

  it('the frog follows to inside its stopping distance, either side of you (the middle of the source\'s flying area)', () => {
    for (const dx of [COURIER.followLeftDx, COURIER.followRightDx]) assert.ok(Math.abs(dx + COURIER.followArea / 2) < COURIER.followNear, String(dx));
    if (hasGsjs) assert.match(read('items/npc_yoga_frog.js'), /apiStartFlyingInTheAreaX\(this\.pc\.x - 100, this\.pc\.y - 50, 50, 50, 200, false\)/);
  });

  it('says what it brought as the source did', () => {
    const row = (auction) => ({ auction });
    assert.equal(auctionDescribe([row('purchased')]), 'purchased');
    assert.equal(auctionGotLine([row('purchased')]), 'Got your purchased auction, brah.');
    assert.equal(auctionGotLine([row('purchased'), row('purchased'), row('purchased')]), 'Got your 3 purchased auctions, brah.');
    assert.equal(auctionGotLine([row('purchased'), row('expired'), row('purchased')]), 'Got your 2 purchased and 1 expired auctions, brah.');
    assert.equal(auctionDescribe([row('purchased'), row('expired'), row('cancelled')]), '1 purchased, 1 expired and 1 cancelled');
    assert.equal(COURIER_TEXT.mailTime(['3 Cherries']), 'Mail time! You got 3 Cherries.');
    assert.equal(COURIER_TEXT.mailTime(['3 Cherries', 'an Apple']), 'Mail time! You got 3 Cherries, and an Apple.');
    assert.equal(COURIER_TEXT.mailTime(['a', 'b', 'c']), 'Mail time! You got a, b, and c.');
  });

  it('a full pack keeps it; Just send it to my mailbox leaves it there; login sweeps what came while away', () => {
    const st = createMailboxState();
    deliverMail(st, { sender: 'AFLC', text: 'x', attachment: { classTsid: 'apple', count: 3 }, auction: 'purchased', express: true, deliveryAt: 10 });
    const [m] = st.messages;
    const inv = { apple: 1 };
    assert.deepEqual(handOverAuction(m, inv, { room: 2 }), { ok: false, reason: 'pack_full', item: m.attachment });
    assert.equal(inv.apple, 1);
    assert.equal(handOverAuction(m, inv, { room: 3 }).ok, true);
    assert.equal(inv.apple, 4);
    assert.equal(isAuctionPending(m), false);
    // A row from the site is never handed over here: the site does it.
    const mp = createMailboxState();
    const r = auc(mp);
    assert.equal(handOverAuction(r, {}, {}).ok, false);
    assert.deepEqual(sendAuctionsToMailbox(mp.messages, 999).map((x) => x.id), []);
    assert.deepEqual(sendAuctionsToMailbox(mp.messages, 1000).map((x) => x.id), [r.id]);
    assert.equal(r.inMailbox, true);
    assert.equal(isAuctionPending(r), false);
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
    assert.deepEqual(FROG_ART.variants.frogBlue, FROG_ART.files);
    assert.deepEqual(Object.keys(FROG_ART.variants).sort(), ['frogBlue', 'frogRed']);
    for (const [label, [cols, count]] of Object.entries(FROG_ART.sheets)) {
      for (const files of Object.values(FROG_ART.variants)) {
        for (const kind of ['box', 'none']) {
          const [w, h] = pngSize(join(dir, `${files[kind]}${label}.webp`));
          assert.equal(w, cols * FROG_ART.cell.w, `${files[kind]} ${label}`);
          assert.ok(h >= Math.ceil(count / cols) * FROG_ART.cell.h, `${files[kind]} ${label}`);
        }
      }
    }
    // The built frog lines up with Tiny Speck's own renders.
    for (const fit of Object.values(FROG_ART.redFit)) assert.ok(fit >= 0.8);
  });

  it('ticket 74: the red frog\'s sheets are Tiny Speck\'s own OGA renders (their pixels, as lossless WebP)', { skip: !existsSync(OGA_FROG) && 'needs the OpenGameArt archive' }, () => {
    for (const label of Object.keys(FROG_ART.sheets)) {
      for (const [box, file] of [['box', FROG_ART.variants.frogRed.box], ['none', FROG_ART.variants.frogRed.none]]) {
        const ogaDir = join(OGA_FROG, `npc_yoga_frog_box_${box}_variant_frogRed`);
        const oga = readdirSync(ogaDir).find((f) => f.includes(`_x1_${label}_png_`));
        assert.ok(oga, `${box} ${label}`);
        assert.ok(pngBufferToWebp(readFileSync(join(ogaDir, oga))).equals(readFileSync(join(pub, MAIL_NPC_ART_DIR, `${file}${label}.webp`))), `${file}${label}`);
      }
    }
  });

  it('G448: the frog\'s 56 sheets (blue and red) have 3x renders from npc_yoga_frog.swf that swap in on first draw', async () => {
    const { FIRST_DRAW_SPRITES, HIRES_SPRITES, hiresSpriteUrl } = await import('../public/js/sprite-hires.js?v=dd5da64c');
    const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
    let n = 0;
    for (const label of Object.keys(FROG_ART.sheets)) {
      for (const [variant, kind] of ['frogBlue', 'frogRed'].flatMap((v) => [[v, 'box'], [v, 'none']])) {
        const path = `${MAIL_NPC_ART_DIR}${FROG_ART.variants[variant][kind]}${label}.webp`.replace(/^.*?(assets\/)/, '$1');
        const r = results[path];
        assert.equal(r?.status, 'ok', path);
        assert.ok(r.score >= 0.9 && r.minFrame >= 0.8 && r.drift.length === 0, `${path} ${r.score}`);
        assert.ok(HIRES_SPRITES.has(path) && FIRST_DRAW_SPRITES.has(path), path);
        assert.match(hiresSpriteUrl(path), /@3x\.webp$/, path);
        assert.ok(existsSync(join(pub, r.hires)), r.hires);
        n += 1;
      }
    }
    assert.equal(n, 56);
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
      const { mailCourierFeature } = await import('../public/js/features/mail-courier-feature.js?v=74d8f796');
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

describe('ticket 74: the courier calls the red frog for an auction delivery', () => {
  it('takes whichever delivery is next, prompts the same way, and sweeps what came while away', async () => {
    mock.timers.enable({ apis: ['Date'], now: 2_000_000 });
    try {
      const { mailCourierFeature } = await import('../public/js/features/mail-courier-feature.js?fresh=auction-frog');
      const st = createMailboxState();
      const prompts = [];
      const data = {};
      const activity = [];
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
        transientInstance: () => false,
        homeContext: () => ({ inHome: false }),
        setData: (k, v) => { data[k] = v; },
        pushActivity: (t) => activity.push(t),
        refreshPack: () => {},
        save: () => {},
      };
      const row = (id, at, extra = {}) => deliverMail(st, { id: `auction-${id}`, sender: 'Auction Fulfillment and Logistics Corporation', text: 'x', attachment: { classTsid: 'cherry', count: 3 }, ledger: `auc-${id}-d`, auction: 'purchased', express: true, deliveryAt: at, ...extra });
      mailCourierFeature.restore({});
      const away = row('aaaaaaaaaaaaaaaa', 1_999_000);
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(st.messages[0].inMailbox, true, 'mail_login: an auction that came while away is in the mailbox');
      assert.equal(data.mailCourierLast, 'login:1');
      assert.ok(activity.includes(COURIER_TEXT.growl));
      assert.equal(away.id, 'auction-aaaaaaaaaaaaaaaa');
      // A letter due later and an auction due now: the auction comes first.
      deliverMail(st, { sender: 'Amp', text: 'hi', attachment: { classTsid: 'apple', count: 1 }, deliveryAt: Date.now() + 120_000 });
      row('bbbbbbbbbbbbbbbb', Date.now(), { auction: 'expired' });
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(prompts.length, 0, 'not before 30 s');
      mock.timers.tick(30_000);
      mailCourierFeature.onTick(16, 0, engine);
      assert.equal(prompts.length, 1);
      assert.equal(prompts[0].text, 'Special delivery! A package has arrived for you.');
      assert.equal(data.mailCourierLast, 'courier:prompt:auction');
    } finally {
      mock.timers.reset();
    }
  });

  it('the red frog hands auctions straight to the pack through the site, and leaves no letter behind', () => {
    const src = readFileSync(join(pub, 'js/features/mail-courier-feature.js'), 'utf8');
    assert.match(src, /engine\.query\?\.\('mailReceive', m, engine, \{ quiet: true \}\)/);
    assert.match(src, /m\.deleted = true;/);
    assert.match(src, /spawnCourier\(engine, kind\)/);
    const feat = readFileSync(join(pub, 'js/features/auctions-feature.js'), 'utf8');
    assert.match(feat, /mailReceive\(message, engine, opts = \{\}\) \{[\s\S]{0,200}?session\.receive\(message, opts\)/);
    assert.match(feat, /engine\.deliverMail\?\.\(\{ \.\.\.row, express: true, inMailbox: cameAway \}\)/);
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /!\(m\.auction && m\.express && !m\.inMailbox\)/, 'a delivery on its way is not waiting at a mailbox');
  });
});

describe('ticket 86: the Mail Dispatcher opens on a new letter, cleanly', () => {
  const game = readFileSync(join(root, 'public/game.js'), 'utf8');
  const feature = readFileSync(join(root, 'public/js/features/mail-courier-feature.js'), 'utf8');
  const fn = (src, name) => { const at = src.indexOf(`\nfunction ${name}(`); assert.ok(at >= 0, name); return src.slice(at, src.indexOf('\n}\n', at)); };

  it('the station asks for the window on Compose (MailManager.as start: MailDialog.COMPOSE), no click on Write mail', () => {
    const open = fn(feature, 'openStation');
    assert.match(open, /engine\.openMailbox\?\.\(\{ compose: true \}\);/);
    assert.doesNotMatch(open, /mail-compose-btn/);
    assert.match(game, /openMailbox: \(opts = \{\}\) => openMailboxPanel\(\{ anywhere: true, atMailbox: opts\?\.atMailbox === true, compose: opts\?\.compose === true \}\),/);
  });

  it('the inbox is not read under the letter, and no message shows as open while it is written', () => {
    const panel = fn(game, 'openMailboxPanel');
    assert.match(panel, /mailboxComposeReplyTo = compose \? '__new_mail__' : null;\n\s+mailboxAt = atMailbox === true;\n\s+renderMailboxPanel\(\);/, 'the draft is set before the panel draws, so its reader (readMail) is skipped');
    assert.match(panel, /if \(compose\) renderMailboxCompose\(\);/);
    const list = fn(game, 'renderMailboxPanel');
    assert.match(list, /const open = message\.id === mailboxSelectedId && mailboxComposeReplyTo !== '__new_mail__';/);
    assert.match(list, /mailboxSelectedId = message\.id;\n\s+\/\/[^\n]*\n\s+mailboxComposeReplyTo = null;\n\s+renderMailboxPanel\(\);/, 'a click on a message reads it');
    assert.match(fn(game, 'renderMailboxCompose'), /if \(!replyTo\) document\.querySelectorAll\('#mail-list \.mail-row\.is-selected'\)/);
    // The folder tabs already leave the letter (mailboxComposeReplyTo = null), the Inbox tab too.
    assert.match(game, /mailboxFolder = button\.dataset\.mailFolder \|\| 'inbox';\n\s+mailboxSelectedId = null;\n\s+mailboxComposeReplyTo = null;/);
  });

  it('receiving things stays a mailbox\'s (the station does not pass atMailbox)', () => {
    assert.doesNotMatch(fn(feature, 'openStation'), /atMailbox/);
  });
});

describe('ticket 86: a long subject wraps in the inbox list', () => {
  const css = readFileSync(join(root, 'public/style.css'), 'utf8');
  const rule = (sel) => { const m = css.match(new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`)); assert.ok(m, sel); return m[1]; };

  it('the list scrolls only up and down; a row\'s words column may shrink, so the row stays the list\'s width', () => {
    assert.match(rule('.mail-list'), /overflow-x: hidden;\s+overflow-y: auto;/);
    assert.match(rule('.mail-row'), /grid-template-columns: 12px minmax\(0, 1fr\) auto;/);
    assert.match(rule('.mail-row-copy'), /min-width: 0;/);
  });

  it('the subject wraps (three lines at most) and the time stays one piece at the right', () => {
    const subject = css.slice(css.indexOf('*/\n.mail-row-copy span {'), css.indexOf('}', css.indexOf('*/\n.mail-row-copy span {')));
    assert.ok(subject.length > 20, 'the subject rule');
    assert.match(subject, /white-space: normal;/);
    assert.match(subject, /-webkit-line-clamp: 3;/);
    assert.doesNotMatch(subject, /nowrap/);
    assert.match(rule('.mail-row-copy strong,\n.mail-row-copy span'), /overflow-wrap: anywhere;/);
    assert.match(rule('.mail-row time'), /white-space: nowrap;/);
  });
});
