/**
 * Vendor NPCs (register G121): the Gardening Tools Vendor, Meal Vendor, Tool
 * Vendor, Uncle Friendly, Helga and the Sno Cone Vending Machine stand where
 * the archived location objects put them (street-ecology.json `vendors`, 11
 * streets), each selling its own catalog_stores.js store (js/vendor-npcs.js).
 *
 * GameServerJS: items/npc_gardening_vendor.js, npc_cooking_vendor.js,
 * npc_tool_vendor.js, npc_jabba1.js, npc_jabba2.js,
 * npc_sno_cone_vending_machine.js (buy_sell opens store_id 12/16/11/13/15/5;
 * the scarecrow's attract() bubble; the machine's talk_to), and
 * items/include/npc_quests.js offerQuests: turn-ins first, then offers.
 * Uncle Friendly's quest verb is make_eye_contact; Helga has none.
 * Quests: Meet the Merchants (vendor_ping_pong_part1-4) and A Purple
 * Journey North. Their turn-ins wait for a talk here (quest-offers.js
 * heldForNpcTurnIn).
 *
 * Art: CC0 OGA sheets cut by tools/vendor-npc-art.mjs (idle loop + talk).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&streetdemo=<tsid>
 * on a vendor street (GCR101UN0NJ1QPQ Middle Arbor, GIF12PMQ5121D68
 * Cebarkul, GLI101QQRA211SM Level 2 East, GM4118MEHFDMM Uncle Friendly's
 * Emporium, GM413RQ6LRG9N West Spice, GM11E7ODKHO1QJE Wintry Place), or
 * &vendornpcdemo=<class> to stand one beside the player on any street.
 * &vendornpcautoplay=goto stands the player beside it; shop opens its store,
 * talk runs its quest or talk verb (comma-separated, e.g. goto,shop), after
 * &vendornpcwait=<ms> (default 2500). Canvas: vendorNpcs, vendorNpcShop,
 * vendorNpcLast.
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=695775ed';
import { loadWildlifeCatalog, wildlifeCatalog } from '../wildlife.js?v=670c3a7f';
import { VENDOR_PROFILES } from '../vendor.js?v=563afb9b';
import { addItem, countItem, removeItem } from '../inventory.js?v=85d4faba';
import { parseQuestConversation } from '../quests.js?v=282e1621';
import {
  acceptOffer,
  declineOffer,
  npcQuestOffers,
  questAwardPayload,
  turnInQuest,
} from '../quest-offers.js?v=6b6cbf22';
import {
  GOT_QUEST_TEXT,
  VENDOR_NPCS,
  VENDOR_NPC_ART,
  VENDOR_PLACEMENT_KEY,
  vendorAnchor,
  vendorNpcList,
  vendorNpcPlacementGroups,
  vendorNpcStoreProfile,
  vendorNpcsFor,
  vendorSheet,
} from '../vendor-npcs.js?v=53b1f6c9';
import { itemZ } from '../item-bands.js?v=e98b10bc';

export const VENDOR_NPCS_FEATURE_ID = 'vendor-npcs';
const ATTRACT_RADIUS = 200; // npc_gardening_vendor.js onPathing: players within 200px
const ATTRACT_GAP_MS = 5000; // attract(): at most once every 5 s
const ATTRACT_BUBBLE_MS = 5000;

let loader = null;
let generation = 0;
/** { classTsid, sprite, target, clip, lastAttract, near } */
let npcs = [];
let shopOpened = false;
let talking = null;
let last = '';
let demoUsed = false;

function questCtx(engine) {
  const street = engine.street || {};
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    buffs: engine.activeBuffIds?.() || [],
    hub: street.hubId || '',
    street: street.label || '',
    streetTsid: engine.streetTsid,
    now: Date.now(),
    pc: engine.pc,
    addItem,
    removeItem,
    countItem,
    customPrereq: (id, prereq) => engine.questCustomPrereq?.(id, prereq) === true,
  };
}

function sheetsFor(classTsid) {
  return Object.keys(VENDOR_NPC_ART[classTsid]?.states || {}).map((state) => vendorSheet(classTsid, state));
}

function setClip(engine, npc, state) {
  const frames = loader.frames(vendorSheet(npc.classTsid, state));
  if (!frames.length || npc.sprite.destroyed) return;
  npc.clip = state;
  npc.sprite.textures = frames;
  npc.sprite.loop = true;
  npc.sprite.animationSpeed = pixiSpeed(30);
  npc.sprite.gotoAndPlay(0);
}

function spawn(engine, classTsid, point) {
  const { PIXI } = engine;
  const def = VENDOR_NPCS[classTsid];
  const crop = VENDOR_NPC_ART[classTsid].states.idle.crop;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  const anchor = vendorAnchor(classTsid);
  spr.anchor.set(anchor.x, anchor.y);
  spr.x = point.x;
  spr.y = point.y + 2;
  spr.zIndex = itemZ(classTsid, 5);
  spr._worldHitW = Math.round(crop.w * 0.8);
  spr._worldHitH = Math.round(crop.h * 0.9);
  engine.entityLayer.addChild(spr);
  const npc = { classTsid, sprite: spr, target: null, clip: '', lastAttract: 0, near: false };
  npc.target = engine.register({
    classId: classTsid,
    featureId: VENDOR_NPCS_FEATURE_ID,
    label: def.label,
    sprite: spr,
    vendorNpc: classTsid,
  });
  setClip(engine, npc, 'idle');
  npcs.push(npc);
  return npc;
}

/** Street clear destroys the entity layer; only drop references (feature-host onStreetClear). */
function clear() {
  npcs = [];
  talking = null;
}

/** Offers this NPC can make and quests it can take back now. */
function questsFor(engine, classTsid) {
  if (!VENDOR_NPCS[classTsid]?.questVerb) return { offered: [], completable: [] };
  try {
    return npcQuestOffers(engine.questState, classTsid, engine.pc, questCtx(engine));
  } catch {
    return { offered: [], completable: [] };
  }
}

function openShop(engine, classTsid) {
  const profile = vendorNpcStoreProfile(classTsid, VENDOR_PROFILES);
  if (!profile) return false;
  engine.openShop(profile);
  shopOpened = true;
  last = `shop:${profile.key}`;
  engine.setData('vendorNpcShop', profile.key);
  return true;
}

function speak(engine, npc) {
  if (npc) {
    talking = npc;
    setClip(engine, npc, 'talk');
  }
}

function turnIn(engine, npc, row) {
  const def = row.def;
  const finish = () => {
    const done = turnInQuest(engine.questState, row.classTsid, engine.pc, questCtx(engine));
    if (!done.ok) {
      last = `turnin-failed:${row.classTsid}:${done.reason}`;
      return;
    }
    engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
    engine.award(questAwardPayload(def, done.rewards || {}));
    engine.pushActivity(`Quest complete: ${def.title}`);
    engine.refreshPack();
    engine.save();
    last = `turnin:${row.classTsid}`;
  };
  const beats = parseQuestConversation(def.completion || '');
  if (!beats.length) {
    finish();
    return;
  }
  speak(engine, npc);
  engine.scriptedDialogue({ title: def.title, kicker: VENDOR_NPCS[npc.classTsid].label, beats, onComplete: finish });
}

function offer(engine, npc, card) {
  speak(engine, npc);
  last = `offer:${card.classTsid}`;
  engine.offerQuestDialogue({
    title: card.def.title,
    kicker: VENDOR_NPCS[npc.classTsid].label,
    beats: card.beats,
    acceptLabel: card.acceptLabel,
    declineLabel: card.declineLabel,
    onAccept: () => {
      const result = acceptOffer(engine.questState, card.classTsid, questCtx(engine));
      last = result.ok ? `accepted:${card.classTsid}` : `accept-failed:${card.classTsid}`;
      if (result.ok) {
        engine.pushActivity(`New quest: ${card.def.title}`);
        engine.refreshPack();
      }
      engine.save();
    },
    // npc_conversation.js: a declined NPC offer is asked again next talk.
    onDecline: () => {
      declineOffer(engine.questState, card.classTsid, Date.now(), { source: 'npc' });
      last = `declined:${card.classTsid}`;
      engine.save();
    },
  });
}

/** npc_sno_cone_vending_machine.js talk_to + onConversation: Yes, then Yes, please! opens the store. */
function chatter(engine, npc) {
  const def = VENDOR_NPCS[npc.classTsid];
  const lines = def.talk;
  speak(engine, npc);
  last = `chat:${npc.classTsid}`;
  engine.scriptedDialogue({
    title: def.label,
    kicker: def.label,
    beats: [{ text: lines.ask('friend'), response: lines.yes }],
    cancelable: true,
    primaryLabel: lines.yes,
    cancelLabel: lines.no,
    onComplete: () => {
      // A second dialogue opens on the next frame, once this one has closed.
      setTimeout(() => {
        speak(engine, npc);
        engine.scriptedDialogue({
          title: def.label,
          kicker: def.label,
          beats: [{ text: lines.offer, response: lines.offerYes }],
          cancelable: true,
          primaryLabel: lines.offerYes,
          cancelLabel: lines.offerNo,
          onComplete: () => setTimeout(() => openShop(engine, npc.classTsid), 0),
        });
      }, 0);
    },
  });
}

/** npc_quests.js offerQuests: a turn-in first, else the first offer. */
function talk(engine, npc) {
  const quests = questsFor(engine, npc.classTsid);
  if (quests.completable.length) return turnIn(engine, npc, quests.completable[0]);
  if (quests.offered.length) return offer(engine, npc, quests.offered[0]);
  last = 'talk:none';
  return null;
}

function nearestNpc(engine) {
  const p = engine.player;
  if (!p || !npcs.length) return null;
  return npcs.reduce((best, npc) => (!best || Math.abs(npc.sprite.x - p.x) < Math.abs(best.sprite.x - p.x) ? npc : best), null);
}

function tickAttract(engine, now) {
  const p = engine.player;
  if (!p) return;
  for (const npc of npcs) {
    const line = VENDOR_NPCS[npc.classTsid].attract;
    if (!line) continue;
    const near = Math.abs(npc.sprite.x - p.x) <= ATTRACT_RADIUS && Math.abs(npc.sprite.y - p.y) <= ATTRACT_RADIUS;
    // onPlayerCollision -> attract(): once on approach, at most every 5 s.
    if (near && !npc.near && now - npc.lastAttract >= ATTRACT_GAP_MS && !engine.busy()) {
      npc.lastAttract = now;
      // The remake has no player names; quests.js reads {pc_label} as "friend".
      engine.say(npc.target, line('friend'), ATTRACT_BUBBLE_MS);
      last = `attract:${npc.classTsid}`;
    }
    npc.near = near;
  }
}

function setupDemo(engine) {
  const demo = engine.param('vendornpcdemo');
  if (demo && !demoUsed && VENDOR_NPCS[demo]) {
    demoUsed = true;
    const p = engine.player;
    if (p) spawn(engine, demo, { x: p.x + 160, y: p.y });
  }
  const auto = engine.param('vendornpcautoplay');
  if (!auto || !npcs.length) return;
  const npc = demo && VENDOR_NPCS[demo] ? npcs.find((n) => n.classTsid === demo) || npcs[0] : npcs[0];
  const steps = auto.split(',');
  if (steps.includes('goto') && engine.player) {
    // Stand on the vendor's own platform, just right of it.
    engine.player.x = npc.sprite.x + 120;
    engine.player.y = npc.sprite.y - 4;
    engine.player.vx = 0;
    engine.player.vy = 0;
  }
  setTimeout(() => {
    // Frame the vendor left of the centred store panel.
    if (steps.includes('goto') && steps.includes('shop')) engine.setCameraLook?.(300, 0);
    if (steps.includes('shop')) openShop(engine, npc.classTsid);
    else if (steps.includes('talk')) (VENDOR_NPCS[npc.classTsid].talk ? chatter : talk)(engine, npc);
    publish(engine);
  }, Math.max(0, Number(engine.param('vendornpcwait')) || 2500));
}

function publish(engine) {
  engine.setData('vendorNpcs', npcs.map((n) => n.classTsid).join(','));
  engine.setData('vendorNpcLast', last);
}

export const vendorNpcsFeature = {
  id: VENDOR_NPCS_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    loadWildlifeCatalog();
    publish(engine);
  },

  placementGroups(population, street) {
    const catalog = wildlifeCatalog();
    if (!catalog || !street?.tsid) return [];
    return vendorNpcPlacementGroups(vendorNpcsFor(catalog, street.tsid));
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    loadWildlifeCatalog().then((catalog) => {
      if (mine !== generation) return null;
      const list = vendorNpcList(vendorNpcsFor(catalog, engine.streetTsid));
      const demo = engine.param('vendornpcdemo');
      const classes = new Set([...list, ...(VENDOR_NPCS[demo] ? [demo] : [])]);
      return loader.loadAll([...classes].flatMap(sheetsFor)).then(() => {
        if (mine !== generation) return;
        const points = engine.placement(VENDOR_PLACEMENT_KEY);
        list.forEach((classTsid, i) => {
          const p = points[i];
          if (p) spawn(engine, classTsid, p);
        });
        setupDemo(engine);
        publish(engine);
      });
    });
  },

  onStreetClear(engine) {
    generation += 1;
    clear();
    if (shopOpened) {
      shopOpened = false;
      engine?.openShop?.(null);
    }
  },

  onTick(dtMs, now, engine) {
    if (shopOpened && !engine.shopOpen()) {
      shopOpened = false;
      engine.openShop(null);
      engine.setData('vendorNpcShop', '');
    }
    if (talking && !engine.questDialogueOpen()) {
      setClip(engine, talking, 'idle');
      talking = null;
    }
    if (npcs.length) tickAttract(engine, now);
    publish(engine);
  },

  verbsFor(target, engine) {
    const classTsid = target.vendorNpc;
    const def = VENDOR_NPCS[classTsid];
    if (!def) return [];
    const verbs = [{ id: 'buy_sell', label: 'buy/sell', tooltip: def.buyTooltip, enabled: true, reason: '', durationMs: 0 }];
    // make_eye_contact / npc_quests talk: only while there is something to offer or take back.
    const quests = questsFor(engine, classTsid);
    if (def.questVerb && (quests.offered.length || quests.completable.length)) {
      verbs.push({ id: def.questVerb.id, label: def.questVerb.label, tooltip: def.questVerb.tooltip, enabled: true, reason: '', durationMs: 0 });
    }
    if (def.talk) verbs.push({ id: 'talk_to', label: 'talk to', tooltip: def.talk.tooltip, enabled: true, reason: '', durationMs: 0 });
    return verbs;
  },

  runVerb(target, verbId, engine) {
    const npc = npcs.find((n) => n.target === target);
    if (!npc) return true;
    if (verbId === 'buy_sell') openShop(engine, npc.classTsid);
    else if (verbId === VENDOR_NPCS[npc.classTsid].questVerb?.id) talk(engine, npc);
    else if (verbId === 'talk_to' && VENDOR_NPCS[npc.classTsid].talk) chatter(engine, npc);
    publish(engine);
    return true;
  },

  /** QA / tests. */
  _state() {
    return { npcs: npcs.map((n) => ({ classTsid: n.classTsid, x: n.sprite.x, y: n.sprite.y, clip: n.clip })), last, shopOpened };
  },
  _nearest: nearestNpc,
};
