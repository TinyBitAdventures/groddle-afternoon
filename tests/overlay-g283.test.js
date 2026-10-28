/**
 * G283: the stun orb and its beam stay in view during a Rook attack (camera
 * headroom, the HUD badge in the top right, the fight's art in front of the
 * hovering Rook). G284: set free for chickens and butterflies you own. G285:
 * the last overlay stand-ins (the Amorous Philtre heart, *poof* text, the
 * race rainbow, letter blocks, the newxp poofs, the Cactus icon). G250: the
 * loneliness fireworks under the bubbles. G280: no chicken Feed.
 * Run: node --test tests/overlay-g283.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../tools/avatar-compositor/xfl.mjs';
import { setMetabolicGainGate } from '../public/js/metabolics.js';
import {
  SET_FREE,
  applySetFree,
  canSetFree,
  setFreeGoneLine,
  setFreePrompt,
  setFreeResponse,
  setFreeTooltip,
  setFreeVerbState,
} from '../public/js/animal-set-free.js';
import { getVerbsFor } from '../public/content.js?v=g414-1';
import { createAnimalState } from '../public/js/animals.js?v=g414-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const audit = join(here, '../..');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const gsjsPath = join(audit, 'glitch-GameServerJS');
const haveGsjs = existsSync(gsjsPath);
const gsjs = (p) => readFileSync(join(gsjsPath, p), 'utf8');
const orbFla = join(audit, 'glitch-overlays/focusing_orb_attack.fla');
const manifest = JSON.parse(read('assets/sprites/overlays/overlays.json'));

afterEach(() => setMetabolicGainGate(null));

describe('G283: the stun orb and the beam in view', () => {
  // Desk ORBERA (G293): the orb moved down to just above the name labels, so
  // the camera no longer looks up for it (tests/desk-decisions.test.js).
  it('the orb (200 px over your feet) sits in the 408 px viewport without the camera looking up', async () => {
    const { ORB_ART, BADGE } = await import('../public/js/features/rook-attack-feature.js?v=g414-1');
    const viewH = 408;
    const feet = viewH * (0.5 + 150 / 600); // movement.js yCamOffsetAnchor(150)
    const orbY = feet - ORB_ART.orbAbove;
    assert.ok(orbY > 60 && orbY < 160, `orb at ${orbY}`);
    // The badge leaves the top centre (where the orb rises) for the top right.
    assert.ok(BADGE.x > 960 - 100 && BADGE.y < 100);
    assert.ok(BADGE.x + BADGE.feedX + 150 <= 960, 'the feed box stays on screen');
  });

  it('the orb, its count, motes and the beams draw in front of the Rook; the camera stays put', () => {
    const f = read('js/features/rook-attack-feature.js');
    assert.match(f, /root\.addChild\(sky, rookLayer, front, fxLayer, tint, textLayer, hud\)/);
    assert.match(f, /layer: frontLayer\(engine\) \|\| engine\.entityLayer/);
    assert.doesNotMatch(f, /headroom|setCameraLook/i);
  });

  it('the source: no keep-in-bounds for the orb or the beam; the client puts the rook head in its header', { skip: !haveGsjs }, () => {
    const rook = gsjs('locations/inc_rook.js');
    assert.match(rook, /overlay_key_to_url\('focusing_orb_attack'\),\s*state: orb_state,\s*delta_y: -163,\s*uid: 'orb_attack_'\+pc_tsid,\s*dont_keep_in_bounds: true/);
    assert.match(rook, /overlay_key_to_url\('focusing_orb_laser_beam'\),[\s\S]{0,120}dont_keep_in_bounds:true/);
    const header = join(audit, 'glitch-client/com/tinyspeck/engine/view/ui/RookIncidentHeaderView.as');
    if (existsSync(header)) assert.match(readFileSync(header, 'utf8'), /x = Math\.round\(ydm\.getHeaderCenterPt\(\)\.x\);[\s\S]{0,200}rook_head\.y = 45;/);
  });

  it("the near-white shape on the orb FLA's main stage is a brush sketch on the orb's own layer, scrubbed from the sheet", { skip: !existsSync(orbFla) }, async () => {
    const doc = readZip(orbFla).read('DOMDocument.xml').toString('utf8');
    const main = doc.slice(doc.indexOf('<DOMTimeline name="Scene 1"'));
    const layer = main.slice(main.indexOf('<DOMLayer name="focusingOrb"'));
    assert.doesNotMatch(layer.slice(0, 200), /layerType="guide"/);
    assert.match(layer.slice(0, 2000), /<DOMShape>[\s\S]*<SolidColor color="#FCFCFC"\/>/);
    const { OVERLAYS } = await import('../tools/overlay-art/build.mjs');
    assert.deepEqual(OVERLAYS.focusing_orb_attack.scrub, [{ symbol: 'main', layer: 'focusingOrb', shapes: true }]);
  });
});

describe('G284: set free', () => {
  it('copy and numbers come from npc_chicken.js / npc_butterfly.js', { skip: !haveGsjs }, () => {
    const chicken = gsjs('items/npc_chicken.js');
    const bfly = gsjs('items/npc_butterfly.js');
    for (const src of [chicken, bfly]) {
      assert.match(src, /"tooltip"\s*: "Costs 5 energy, rewards 20 mood"/);
      assert.match(src, /reason: "You need to know Herdkeeping to set animals free\."/);
      assert.match(src, /metabolics_add_mood\(20\)[\s\S]{0,120}metabolics_lose_energy\(5\)/);
      assert.match(src, /swf_url: overlay_key_to_url\('smoke_puff'\),\s*delay_ms: 2500,[\s\S]{0,80}delta_y: 95,[\s\S]{0,80}duration: 1500/);
    }
    assert.match(chicken, /apiSetTimer\('freeChicken', 3000\)/);
    assert.match(bfly, /apiSetTimer\('freeButterfly', 3000\)/);
    const list = (src) => JSON.parse(src.match(/"set_free_in_pol": (\[[\s\S]*?\]),/)[1].replace(/,\s*\]$/, ']'));
    assert.deepEqual([...SET_FREE.classes.npc_chicken.responses], list(chicken));
    assert.deepEqual([...SET_FREE.classes.npc_butterfly.responses], list(bfly));
    assert.ok(chicken.includes(`"Are you sure you want to let your chicken named "+this.user_name+" out into the wilderness?"`));
    assert.ok(bfly.includes(`"The butterfly named "+this.user_name+" has gone to enjoy its life in the wilderness."`));
    assert.equal(SET_FREE.puff.delayMs, 2500);
    assert.equal(SET_FREE.puff.deltaY, 95);
    assert.equal(SET_FREE.freedMs, 3000);
  });

  it('text', () => {
    assert.equal(setFreeTooltip('npc_chicken'), 'Release this chicken into the wilderness. Costs 5 energy, rewards 20 mood');
    assert.equal(setFreeTooltip('npc_butterfly', 'Flit'), 'Release a Butterfly named Flit into the wilderness. Costs 5 energy, rewards 20 mood');
    assert.equal(setFreePrompt('npc_chicken'), 'Are you sure you want to let your chicken out into the wilderness?');
    assert.equal(setFreePrompt('npc_butterfly', 'Flit'), 'Are you sure you want to let your butterfly named Flit out into the wilderness?');
    assert.equal(setFreeGoneLine('npc_chicken'), 'Your chicken has gone to enjoy its life in the wilderness.');
    assert.equal(setFreeGoneLine('npc_butterfly', 'Flit'), 'The butterfly named Flit has gone to enjoy its life in the wilderness.');
    assert.equal(setFreeResponse('npc_chicken', 0), 'What-what? Freedom? FREEDOM!');
    assert.equal(setFreeResponse('npc_butterfly', 0.999), 'l8r g8r!!!');
    assert.equal(canSetFree('npc_piggy'), false);
  });

  it('only where you own the place; Herdkeeping or a reason', () => {
    assert.equal(setFreeVerbState('npc_chicken', {}, { ownYard: false, learned: ['herdkeeping_1'] }), null);
    assert.equal(setFreeVerbState('npc_piggy', {}, { ownYard: true, learned: ['herdkeeping_1'] }), null);
    const no = setFreeVerbState('npc_chicken', {}, { ownYard: true, learned: [] });
    assert.equal(no.enabled, false);
    assert.equal(no.reason, SET_FREE.noSkill);
    const yes = setFreeVerbState('npc_butterfly', {}, { ownYard: true, learned: ['herdkeeping_1'] });
    assert.equal(yes.enabled, true);
    assert.equal(yes.sort, 53);
  });

  it('content.js lists it in the back yard only', () => {
    const pc = { energy: 50, mood: 20, xp: 0, imagination: 0 };
    const chicken = { classId: 'npc_chicken', state: createAnimalState('npc_chicken') };
    const ids = (ctx) => getVerbsFor(chicken, { pc, inv: {}, learned: ['herdkeeping_1'], ...ctx }).map((v) => v.id);
    assert.equal(ids({ streetTsid: 'RH_HOME_EXT' }).includes('set_free'), true);
    assert.equal(ids({ streetTsid: 'LHFRK14DDU53RQQ' }).includes('set_free'), false);
  });

  it('+20 mood through the metabolic gate, -5 energy down to 0', () => {
    const pc = { energy: 3, mood: 10 };
    assert.deepEqual(applySetFree('npc_chicken', pc, 0).slugs, { mood: 20, energy: 3 });
    assert.equal(pc.energy, 0);
    setMetabolicGainGate(() => ({ ok: false, msg: 'dead' }));
    const dead = { energy: 50, mood: 10 };
    assert.deepEqual(applySetFree('npc_butterfly', dead, 0).slugs, { mood: 0, energy: 5 });
  });

  it('the husbandry feature asks, then puffs and frees on the source clock', () => {
    const f = read('js/features/animal-husbandry-feature.js');
    assert.match(f, /if \(verbId === 'set_free' && canSetFree\(target\.classId\)\) \{\n\s*askSetFree\(engine, target\);/);
    assert.match(f, /delayMs: SET_FREE\.puff\.delayMs,\n\s*durationMs: SET_FREE\.puff\.durationMs,/);
    assert.match(f, /later\(SET_FREE\.freedMs, \(\) => \{\n\s*engine\.pushActivity\(setFreeGoneLine\(cls, name\)\);/);
    // engine.say passes the slugs on to the bubble.
    assert.match(read('game.js'), /say\(target, text, durationMs = 4000, extra = null\) \{\n\s*return showSpeechBubble\(target, \{ \.\.\.\(extra \|\| \{\}\), text, durationMs \}\);/);
  });
});

describe('G285: the last overlay stand-ins', () => {
  it("Feeling Called Love's heart is amorous_philtre_heart, a pc_overlay at delta_y -120", { skip: !haveGsjs }, async () => {
    assert.match(gsjs('items/catalog_buffs.js'), /pc\.announce_add_indicator\('feeling_called_love', 'amorous_philtre_heart'\);/);
    assert.match(gsjs('players/inc_announcements.js'), /delta_y: indicator\.delta_y \? indicator\.delta_y : -120,/);
    const { LOVE_HEART } = await import('../public/js/features/potions-feature.js?v=g414-1');
    assert.deepEqual({ ...LOVE_HEART }, { key: 'amorous_philtre_heart', dy: -120 });
    assert.equal(manifest.amorous_philtre_heart.kind, 'sheet');
  });

  it('potions poof with proto_puff, not *poof* text', () => {
    const f = read('js/features/potions-feature.js');
    assert.doesNotMatch(f, /'\*poof\*'/);
    assert.match(f, /return playPoofIn\(engine\.PIXI, \{ layer, x, bottom, itemH \}\);/);
    assert.doesNotMatch(f, /bezierCurveTo/);
  });

  it('ticket races show no rainbow (desk RAINBOW, tests/desk-decisions.test.js); G299: the end splash shows at once (tests/game-splash.test.js)', () => {
    const f = read('js/features/races-feature.js');
    assert.doesNotMatch(f, /drawWinnerRainbow|followWinnerRainbow/);
    assert.doesNotMatch(f, /resultRevealTimer|armLeavePrompt/);
    assert.match(f, /splashShown = true;\s*engine\.gameSplash\?\.\(\{/);
  });

  it('letter blocks poof in (letter_block_2.js, letter_block_3.js createItemStackWithPoof)', { skip: !haveGsjs }, () => {
    assert.equal((gsjs('quests/letter_block_2.js').match(/createItemStackWithPoof\('letter_block'/g) || []).length, 4);
    assert.equal((gsjs('quests/letter_block_3.js').match(/createItemStackWithPoof\('letter_block'/g) || []).length, 3);
    assert.match(read('game.js'), /playPoofIn\(PIXI, \{ layer: entityLayer, x: spr\.x, bottom: spr\.y, itemH: Math\.round\(197 \* 0\.74\), zIndex: 46 \}\);/);
    assert.match(read('js/quest-rooms/kids-room.js'), /for \(const b of ctx\.data\.blocks\) playPoofIn\(PIXI, \{ layer: puffs, x: b\.sprite\.x, bottom: b\.sprite\.y, itemH: BLOCK_H \}\);/);
  });

  it('the newxp quoin poofs in on smoke_puff_overlay (the same FLA as smoke_puff); the flamingo and the sloth poof out', { skip: !haveGsjs }, () => {
    const t1 = gsjs('locations/newxp_training1.js');
    assert.match(t1, /createItemStackWithPoof\('quoin', 1, [^;]*'smoke_puff_overlay'\);/);
    assert.match(t1, /flamingo\.deleteWithPoof\(10, 170\);/);
    assert.match(t1, /sloth\.deleteWithPoof\(-50, 250\);/);
    const sha = (n) => createHash('sha1').update(readFileSync(join(audit, `glitch-overlays/${n}.fla`))).digest('hex');
    if (existsSync(join(audit, 'glitch-overlays/smoke_puff_overlay.fla'))) assert.equal(sha('smoke_puff_overlay'), manifest.smoke_puff.fla);
    const f = read('js/features/newxp-feature.js');
    assert.match(f, /poofInQuoin\(engine, addQuoin\(engine, 'img_pickup_walk'/);
    assert.match(f, /deleteWithPoof\(engine, fl\.sprite, 10, 170\);/);
    // G303: delta 250 measured from npc_sloth.swf's drawn rect (slothPoofBase), delta_x mirrored for right-facing art.
    assert.match(f, /deleteWithPoof\(engine, sloth, base\.dx, 250, \{ holdMs, x: base\.x, top: base\.top \}\);/);
  });

  it('the Cactus has a pack icon (cut from its OGA idle frame)', () => {
    assert.ok(existsSync(join(pub, 'assets/sprites/icons/npc_cactus.png')));
  });
});

describe('G250 and G280', () => {
  it('the fireworks go to the bottom of the fx layer, under bubbles and prompts', () => {
    const f = read('js/features/spirit-loneliness-feature.js');
    assert.match(f, /layer\.addChildAt\(sprite, 0\);/);
    assert.doesNotMatch(f, /playVectorOverlay\(/);
  });

  it('npc_chicken.js has no feed verb, and nor does the remake', { skip: !haveGsjs }, () => {
    assert.doesNotMatch(gsjs('items/npc_chicken.js'), /verbs\.feed = /);
    assert.doesNotMatch(read('content.js'), /classId === 'npc_chicken' && verbBase === 'feed'/);
  });
});
