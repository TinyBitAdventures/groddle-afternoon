// Lane art (2026-11-08): Tiny Speck's own CC0 overlays where the remake drew its own or nothing.
// G378 the Jellisac slather's splatter, G382 the clickable click_to_prime, G387 Camera Mode's
// eyeballing bubble (sent to the street online) and the Crown Game Teleporter's pay-50 overlay,
// G398 the subway car's moving windows, and the 33 regional shrines' own art.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERLAY_BUBBLE_URL, OVERLAY_USES, overlayBubbleBox } from '../public/js/overlays.js?v=605c12ff';
import { OVERLAYS, expandMotionObjects } from '../tools/overlays/build.mjs';
import { loadFla } from '../tools/overlay-art/xfl-svg.mjs';
import { SHRINE_SHEETS, shrineClassFor, shrineRegionForHub, shrineSheet, shrineVariantFor } from '../public/js/shrine-variants.js?v=7f11c97d';
import { checkVariants, variantFiles } from '../tools/shrine-variants/build.mjs';
import { SLATHER_VERB, SPLATTER_STAGE_SIDE, splatterDy, slatherVerb } from '../public/js/features/quest-verbs-feature.js?v=6dff3574';
import { OVERLAY_EMOTES, EMOTES } from '../public/js/realtime-client.js?v=cda54c6e';
import {
  GAME_TELEPORTER_DECO,
  GAME_TELEPORTER_PRICE,
  GAME_TELEPORTER_STREET,
  GAME_TELEPORTER_TEXT,
  gameTeleporterFeature,
  payForCrowns,
  teleporterPoint,
} from '../public/js/features/game-teleporter-feature.js?v=cbb2e2ea';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const audit = join(root, '..');
const gsjs = join(audit, 'glitch-GameServerJS');
const hasGsjs = existsSync(join(gsjs, 'items/include/shrines.js'));
const hasOverlays = existsSync(join(audit, 'glitch-overlays/eyeballing.fla'));
const manifest = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays-more.json'), 'utf8'));
const read = (p) => readFileSync(join(pub, p), 'utf8');
const src = (p) => readFileSync(join(gsjs, p), 'utf8');
const NEW = ['jellisac_splatter_on_shrine', 'click_to_prime', 'eyeballing', 'game_teleporter_overlay', 'subway_window'];

describe('the five new overlays are built from their CC0 FLAs', () => {
  it('each is configured, built and has a use row', () => {
    for (const key of NEW) {
      assert.ok(OVERLAYS[key], `${key} configured`);
      assert.ok(manifest[key], `${key} built`);
      assert.ok(OVERLAY_USES[key], `${key} placed`);
      assert.ok(existsSync(join(pub, 'assets/sprites/overlays', manifest[key].file)), `${key} sheet`);
    }
    assert.equal(OVERLAYS.subway_window.fla, 'glitch-overlays/subway_window_overlay.fla');
  });

  it('the sheets animate: the splatter drips, the window slides, the arrow bobs, the pupils wander', () => {
    assert.equal(manifest.jellisac_splatter_on_shrine.frames, 133);
    assert.equal(manifest.subway_window.frames, 20);
    assert.equal(manifest.click_to_prime.frames, 35);
    // eyeballing: one main frame holding 180-frame clips whose pupils move on CS4 motion objects.
    assert.equal(manifest.eyeballing.frames, 180);
    assert.ok(Math.max(...manifest.eyeballing.order) + 1 > 100, 'the pupils move');
  });

  it('expandMotionObjects turns eyeballing\'s motion objects into moving keys', { skip: !hasOverlays && 'glitch-overlays not beside the game' }, () => {
    const file = join(audit, 'glitch-overlays/eyeballing.fla');
    const doc = loadFla(file);
    const before = doc.symbols.get('eyeball1').layers.map((l) => l.frames.length);
    assert.ok(expandMotionObjects(file, doc) >= 4, 'two motion objects in each eyeball');
    const after = doc.symbols.get('eyeball1').layers.map((l) => l.frames.length);
    assert.ok(after.some((n, i) => n > before[i] + 50), 'one key per frame');
    // A plain FLA has none.
    assert.equal(expandMotionObjects(join(audit, 'glitch-overlays/click_to_prime.fla'), loadFla(join(audit, 'glitch-overlays/click_to_prime.fla'))), 0);
  });
});

describe('G378 the slather splatter (shrines.js showSplatterOverlay 822-872)', () => {
  it('4.5 s on the shrine, 1.5 s after the walk to x - 120, SQUISH_GRAPES', () => {
    const u = OVERLAY_USES.jellisac_splatter_on_shrine;
    assert.deepEqual([u.type, u.durationMs, u.delayMs, u.walkDx, u.dy, u.sound], ['itemstack', 4500, 1500, -120, 180, 'SQUISH_GRAPES']);
    assert.equal(splatterDy({ state: { region: 'ix' } }), 275);
    assert.equal(splatterDy({ state: { region: 'firebog' } }), 255);
    assert.equal(splatterDy({ state: { region: 'uralia' } }), 195);
    assert.equal(splatterDy({ state: { region: 'base' } }), 180);
    assert.equal(splatterDy({}), 180);
    // Drawn 1:1 in the source; the remake scales it (and its delta) with the shrine's own 0.78.
    assert.equal(SPLATTER_STAGE_SIDE, Math.max(...manifest.jellisac_splatter_on_shrine.stage));
    assert.match(read('js/features/quest-verbs-feature.js'), /dy: dy \* s \}\),\s+wh: SPLATTER_STAGE_SIDE \* s,/);
  });

  it('the numbers are the source\'s', { skip: !hasGsjs && 'no GSJS' }, () => {
    const t = src('items/include/shrines.js');
    assert.match(t, /x:\s+this\.x - 120,/);
    assert.match(t, /apiSetTimerX\('showSplatterOverlayFinish', 1500, pc\)/);
    assert.match(t, /duration: 4500,\s+swf_url:overlay_key_to_url\('jellisac_splatter_on_shrine'\)/);
    assert.match(t, /npc_shrine_ix_grendaline'\)\{\s+delta_y = 275;/);
    assert.match(t, /npc_shrine_firebog_grendaline'\)\{\s+delta_y = 255;/);
    assert.match(t, /npc_shrine_uralia_grendaline'\)\{\s+delta_y = 195;/);
    assert.match(t, /announce_sound\('SQUISH_GRAPES'\)/);
  });

  it('the slather plays it, on a regional Grendaline shrine too', () => {
    const feature = read('js/features/quest-verbs-feature.js');
    assert.match(feature, /const res = performSlather\(engine\.inv\);\s+showSplatter\(engine, target\);/);
    const qs = { active: { jellisachands_donate_jellisacs: { progress: { super_harvest_jellisac: 1 } } } };
    assert.equal(slatherVerb({ classId: 'npc_shrine_grendaline', state: { giantId: 'grendaline', region: 'ix' } }, qs)?.id, SLATHER_VERB);
  });
});

describe('G382 click_to_prime (shrines.js showPrimeOverlay 750-783)', () => {
  it('on the shrine\'s top, clickable, with the source\'s words 30 px over it', () => {
    const u = OVERLAY_USES.click_to_prime;
    assert.deepEqual([u.type, u.dy, u.durationMs, u.txt, u.txtDy], ['itemstack', 0, 0, 'Click to prime this shrine for attack.', -30]);
  });

  it('the source says so', { skip: !hasGsjs && 'no GSJS' }, () => {
    const t = src('items/include/shrines.js');
    assert.match(t, /swf_url:overlay_key_to_url\('click_to_prime'\),[\s\S]{0,120}delta_y: 0,\s+at_top: true,[\s\S]{0,200}dismiss_on_click: true,\s+txt: "Click to prime this shrine for attack\.",\s+txt_delta_y: -30/);
  });

  it('the Rook feature shows it while stunned and unprimed, and a click primes', () => {
    const f = read('js/features/rook-attack-feature.js');
    assert.match(f, /function primePromptWanted\(engine\) \{\s+const a = here\(engine\);\s+if \(!a \|\| !canStrike\(a\)\) return null;/);
    assert.match(f, /hit\.on\('pointerdown', \(ev\) => \{[\s\S]{0,260}hidePrimePrompt\(\);\s+prime\(engine, shrine\);/);
    assert.match(f, /updatePrimeFx\(engine\);\s+updatePrimePrompt\(engine\);/);
    // Online it needs Piety I unless you are alone (showPrimeOverlay 751-753).
    assert.match(f, /if \(!mpAlone\(\) && !engine\.learnedSkills\?\.includes\(MP_ROOK\.primeSkill\)\) return null;/);
  });
});

describe('G387 Camera Mode\'s eyeballing bubble (main.js 6853-6868, 6896-6899)', () => {
  it('50 px, 110 px up, until it ends, to everyone else', () => {
    const u = OVERLAY_USES.eyeballing;
    assert.deepEqual([u.type, u.wh, u.dy, u.durationMs, u.others], ['pc', 50, -110, 0, true]);
  });

  it('the source says so', { skip: !hasGsjs && 'no GSJS' }, () => {
    const t = readFileSync(join(gsjs, 'main.js'), 'utf8');
    assert.match(t, /function doCameraModeStarted\(pc, msg\) \{\s+pc\.location\.apiSendAnnouncementX\(\{[\s\S]{0,140}overlay_key_to_url\('eyeballing'\)[\s\S]{0,200}delta_y: -110,\s+width: 50,\s+height: 50,/);
    assert.match(t, /function doCameraModeEnded\(pc, msg\) \{\s+pc\.location\.overlay_dismiss\(pc\.tsid\+'-eyeballing'\);/);
  });

  it('it sits in Tiny Speck\'s thought bubble (bubble: true; InLocationAnnouncementOverlay.as 259-342)', () => {
    // 50 px art over the 50.4 x 27.15 stage: a 96 x 124 bubble, the eyes centred in its top 70%.
    assert.deepEqual(overlayBubbleBox(50, 50 * 27.15 / 50.4), { w: 96, h: 124, artBottom: 67 });
    const svg = read(OVERLAY_BUBBLE_URL.replace(/^assets/, 'assets'));
    assert.match(svg, /overlay_bubble\.swf frame 1/);
    assert.match(svg, /<svg [^>]*height="94\.75px" width="74\.1px"/);
    assert.ok(!/ffdec:/.test(svg));
    const swf = join(audit, 'glitch-client/TSEngineAssets/src/assets/swfs/overlay_bubble.swf');
    if (existsSync(swf)) assert.equal(readFileSync(swf).length, 1221);
    assert.match(read('js/features/camera-mode-feature.js'), /bubble = new PIXI\.Sprite\(textureFromUrl\(OVERLAY_BUBBLE_URL/);
  });

  it('online the state rides the emote message, never as an emotion', () => {
    assert.deepEqual([...OVERLAY_EMOTES], ['eyeballing', 'eyeballing_done']);
    for (const e of OVERLAY_EMOTES) assert.ok(!EMOTES.includes(e));
    const client = read('js/realtime-client.js');
    assert.match(client, /if \(p && OVERLAY_EMOTES\.includes\(msg\.e\)\) \{\s+emit\('overlay', \{ id: p\.id, e: msg\.e, player: p \}\);\s+return;\s+\}/);
    const cam = read('js/features/camera-mode-feature.js');
    assert.match(cam, /client\?\.emote\?\.\(on \? 'eyeballing' : 'eyeballing_done'\)/);
    assert.match(cam, /eyeballOff = client\.on\('overlay', \(msg\) => onEyeballing\(engine, msg\)\);/);
    // A /emote command can not send it (realtime-feature's emote() takes EMOTES only).
    assert.match(read('js/features/realtime-feature.js'), /function emote\(e\) \{\s+if \(!EMOTES\.includes\(e\)\) return false;/);
  });
});

describe('G387 the Crown Game Teleporter (game_teleporter.js 177-237)', () => {
  it('stands on The forgotten floor\'s crown_game_teleporter deco', () => {
    assert.equal(GAME_TELEPORTER_STREET, 'GDOOSA8V29J24I3');
    const street = JSON.parse(read(`assets/streets/${GAME_TELEPORTER_STREET}.json`));
    const deco = street.layers.flatMap((l) => l.decos || []).find((d) => d.sprite === 'crown_game_teleporter');
    assert.deepEqual([deco.x, deco.y, deco.w, deco.h], [GAME_TELEPORTER_DECO.x, GAME_TELEPORTER_DECO.y, GAME_TELEPORTER_DECO.w, GAME_TELEPORTER_DECO.h]);
    assert.deepEqual(teleporterPoint(street.bounds), { x: deco.x - street.bounds.l, y: deco.y - street.bounds.t });
  });

  it('the source\'s words, price and timings', { skip: !hasGsjs && 'no GSJS' }, () => {
    const t = src('items/game_teleporter.js');
    assert.ok(t.includes(`"tooltip"			: "${GAME_TELEPORTER_TEXT.tooltip}"`));
    assert.ok(t.includes(`"Do you want to play <b>Game of Crowns</b> for <b>50c</b>?"`));
    assert.ok(t.includes(`txt: '${GAME_TELEPORTER_TEXT.yes}'`) && t.includes(`txt: '${GAME_TELEPORTER_TEXT.no}'`));
    assert.ok(t.includes(GAME_TELEPORTER_TEXT.paid) && t.includes(GAME_TELEPORTER_TEXT.poor));
    assert.match(t, /stats_try_remove_currants\(50,/);
    assert.match(t, /duration: 2000,[\s\S]{0,140}delta_y: 20,\s+width: 300,[\s\S]{0,80}overlay_key_to_url\('game_teleporter_overlay'\)/);
    assert.match(t, /playHitAnimation\('hit1', 3000\);\s+pc\.announce_sound\('PAY_FIFTY_CURRANTS'\);/);
    assert.match(t, /apiSetTimerX\('playerJoinInstance', 1000, pc, 'it_game'\)/);
    assert.equal(GAME_TELEPORTER_PRICE, 50);
    const u = OVERLAY_USES.game_teleporter_overlay;
    assert.deepEqual([u.wh, u.dy, u.durationMs, u.sound], [300, 20, 2000, 'PAY_FIFTY_CURRANTS']);
  });

  it('paying takes 50 currants or refuses', () => {
    const rich = { currants: 120 };
    assert.deepEqual(payForCrowns(rich), { ok: true, currants: 70 });
    const poor = { currants: 49 };
    assert.deepEqual(payForCrowns(poor), { ok: false, currants: 49 });
    assert.equal(poor.currants, 49);
  });

  it('one Activate verb on the teleporter only', () => {
    assert.deepEqual(gameTeleporterFeature.verbsFor({ classId: 'npc_piggy' }), []);
    const [v] = gameTeleporterFeature.verbsFor({ classId: 'game_teleporter' });
    assert.deepEqual([v.id, v.label, v.sort, v.tooltip], ['activate', 'Activate', 50, 'Play a sporrrrrrrrrrrrrrts']);
    assert.match(read('js/features/index.js'), /FEATURES\.push\(gameTeleporterFeature\);\nimport \{ streetObjectsFeature \}/);
  });
});

describe('G398 the subway car\'s moving windows (inc_transit.js 426-470)', () => {
  it('three subway_window overlays at 1:1 while the train moves, over the static pane', () => {
    const u = OVERLAY_USES.subway_window;
    assert.deepEqual([u.type, u.wh, u.xs, u.y], ['location', 275, [-528, -52, 441], -234]);
    assert.deepEqual(manifest.subway_window.stage, [275, 161]);
    const f = read('js/features/subway-feature.js');
    assert.match(f, /w\.handle = playOverlay\(w\.engine\.PIXI, 'subway_window', \{/);
    assert.ok(!/TilingSprite/.test(f), 'the drawn tunnel is gone');
  });

  it('the source says so', { skip: !hasGsjs && 'no GSJS' }, () => {
    const t = src('locations/inc_transit.js');
    assert.match(t, /function transit_start_subway_windows\(\)\{\s+var rsp = \{\s+type: 'location_overlay',\s+swf_url: overlay_key_to_url\('subway_window'\),\s+x: -528,\s+y: -234,\s+width: "275",\s+height: "161",/);
  });
});

describe('Regional shrines wear their own art (33 classes, OGA CC0)', () => {
  it('the region comes from the hub, as the regional Street Spirits do', () => {
    assert.equal(shrineRegionForHub('63'), 'firebog');
    assert.equal(shrineRegionForHub('51'), 'uralia');
    assert.equal(shrineRegionForHub('78'), 'uralia');
    assert.equal(shrineRegionForHub('27'), 'ix');
    assert.equal(shrineRegionForHub('58'), 'base');
    assert.deepEqual(shrineVariantFor({ hubId: '71' }, 'mab'), { region: 'firebog', classTsid: 'npc_shrine_firebog_mab' });
    assert.deepEqual(shrineVariantFor({ hubId: '71' }, 'mab', 'ix'), { region: 'ix', classTsid: 'npc_shrine_ix_mab' });
  });

  it('the classes are GSJS\'s (Tii is tii on Firebog and ti elsewhere)', { skip: !hasGsjs && 'no GSJS' }, () => {
    for (const region of ['firebog', 'ix', 'uralia']) {
      for (const g of ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']) {
        const cls = shrineClassFor(region, g);
        assert.ok(existsSync(join(gsjs, 'items', `${cls}.js`)), cls);
      }
    }
    assert.equal(shrineClassFor('base', 'ti'), 'npc_shrine_ti');
  });

  it('every sheet is present, the region\'s grid, and as recorded', () => {
    assert.deepEqual(checkVariants(), []);
    assert.equal(variantFiles().length, 66);
  });

  it('sheets: the plain one keeps its old path and size', () => {
    assert.deepEqual(shrineSheet('base', 'mab', 'open'), { url: 'assets/sprites/shrines/mab_open.webp', fw: 151, fh: 188, cols: 6, frames: 22 });
    assert.deepEqual(shrineSheet('ix', 'ti', 'close'), { url: 'assets/sprites/shrines/ix/ti_close.webp', fw: 168, fh: 216, cols: 5, frames: 20 });
    assert.deepEqual(Object.keys(SHRINE_SHEETS), ['base', 'firebog', 'ix', 'uralia']);
  });

  it('every regional sheet has its 3x render from the CC0 SWF, swapped in on first draw', async () => {
    const manifest = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/shrines-regional.json'), 'utf8'));
    const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
    assert.equal(manifest.jobs.length, 33);
    assert.equal(manifest.firstDraw, true);
    const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=dd5da64c');
    for (const row of variantFiles()) {
      const job = manifest.jobs.find((j) => j.sheets.some((sh) => sh.path === row.out));
      assert.ok(job, row.out);
      assert.match(job.swf, new RegExp(`/${row.classTsid}/${row.classTsid}\\.swf$`));
      const hi = row.out.replace(/\.webp$/, '@3x.webp');
      assert.ok(existsSync(join(pub, hi)), hi);
      assert.equal(HIRES_SPRITES.get(row.out), hi, row.out);
      assert.equal(results[row.out]?.status, 'ok', row.out);
      assert.ok(results[row.out].score > 0.98, `${row.out} score ${results[row.out].score}`);
    }
  });

  it('game.js draws the street\'s variant and names its class', () => {
    const g = read('game.js');
    assert.match(g, /const variant = shrineVariantFor\(currentStreet, giant\.id, engine\.param\('shrineregion'\) \|\| ''\);/);
    assert.match(g, /state: \{ giantId: giant\.id, region: variant\.region, classTsid: variant\.classTsid \},/);
  });
});
