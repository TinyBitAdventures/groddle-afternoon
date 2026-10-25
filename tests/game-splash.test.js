// G299: the multiplayer games' end splash (js/game-splash.js, GameSplashScreenView.as):
// ticket races, quoin races and the Hog Haul. G304: Game of Crowns, the level_up_rays
// art, the client's name placement and the minor buttons.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CROWNS_SPLASH,
  HOG_HAUL_SPLASH,
  QUOIN_GRAB_SPLASH,
  RACE_SPLASH,
  SPLASH_FADE_IN_MS,
  SPLASH_RAYS_KEY,
  createGameSplash,
  splashDoneButton,
  splashFor,
  splashRays,
  splashTextX,
  splashTextY,
} from '../public/js/game-splash.js?v=g309-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const game = read('game.js');
const races = read('js/features/races-feature.js');
const crowns = read('js/features/crowns-feature.js');
const gsjs = join(here, '../../glitch-GameServerJS');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');
const manifest = JSON.parse(read('assets/sprites/overlays/overlays.json'));

describe('the source splash (inc_games.js, GameSplashScreenView.as)', () => {
  it('games_end_race, games_end_quoin_grab and games_end_hogtie_piggy', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'players/inc_games.js'), 'utf8');
    const race = src.slice(src.indexOf('function games_end_race()'), src.indexOf('function games_end_race()') + 3000);
    assert.match(race, /url: overlay_key_to_url\('race_winner'\)/);
    assert.match(race, /label:"Leave the Game",\s*click_payload: \{does_close:true, pc_callback: 'games_leave_instance_overlay', choice: 'leave'\},\s*w: 150,/);
    assert.match(race, /splash\.graphic\.frame_label = 'you_winner';\s*splash\.show_rays = true;/);
    assert.match(race, /splash\.graphic\.frame_label = 'other_winner';\s*splash\.graphic\.text = winner\.label;\s*splash\.graphic\.text_delta_y = 55;/);
    const grab = src.slice(src.indexOf('function games_end_quoin_grab()'), src.indexOf('function games_end_cloudhopolis()'));
    assert.match(grab, /overlay_key_to_url\('grabemgood_winner'\)/);
    assert.match(grab, /splash\.graphic\.text_delta_y = 0;/);
    const hog = src.slice(src.indexOf('function games_end_hogtie_piggy()'));
    assert.match(hog, /url: overlay_key_to_url\('thegreathoghaul_winner'\),\s*text_delta_y: -10,/);
    assert.equal(RACE_SPLASH.key, 'race_winner');
    assert.equal(RACE_SPLASH.textDeltaY, 55);
    assert.equal(RACE_SPLASH.buttonW, 150);
    assert.equal(QUOIN_GRAB_SPLASH.key, 'grabemgood_winner');
    assert.equal(QUOIN_GRAB_SPLASH.textDeltaY, 0);
    assert.equal(HOG_HAUL_SPLASH.key, 'thegreathoghaul_winner');
    assert.equal(HOG_HAUL_SPLASH.textDeltaY, -10);
  });

  it('games_end_it_game (Game of Crowns): Play Again and Leave the Game, text_delta_y 25', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'players/inc_games.js'), 'utf8');
    const goc = src.slice(src.indexOf('function games_end_it_game()'), src.indexOf('function games_end_it_game()') + 5000);
    assert.match(goc, /tsid:'it_game',\s*graphic: \{\s*url: overlay_key_to_url\('game_of_crowns_winner'\)/);
    assert.match(goc, /label:"Play Again",\s*click_payload: \{does_close:true, pc_callback: 'games_leave_instance_overlay', choice: 'again'\},\s*w: 150,/);
    assert.match(goc, /label:"Leave the Game",\s*click_payload: \{does_close:true, pc_callback: 'games_leave_instance_overlay', choice: 'leave'\},\s*w: 150,/);
    assert.match(goc, /splash\.graphic\.text_delta_y = 25;\s*splash\.graphic\.frame_label = 'other_winner';\s*this\.announce_sound\('YOU_LOSE'\);/);
    assert.match(goc, /type: 'minor'/);
    assert.deepEqual(
      [CROWNS_SPLASH.key, CROWNS_SPLASH.textDeltaY, CROWNS_SPLASH.againLabel, CROWNS_SPLASH.leaveLabel, CROWNS_SPLASH.buttonW],
      ['game_of_crowns_winner', 25, 'Play Again', 'Leave the Game', 150],
    );
  });

  it('the rays are level_up_rays combinedSlow at 1.5, centred on the graphic', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const view = readFileSync(join(client, 'view/gameoverlay/GameSplashScreenView.as'), 'utf8');
    assert.match(view, /private const RAYS_SCENE:String = 'combinedSlow';/);
    assert.match(view, /rays\.x = int\(graphic_holder\.width\/2 - 413\);/);
    const rays = readFileSync(join(client, 'view/ui/Rays.as'), 'utf8');
    assert.match(rays, /public static const SCALE_DEFAULT:Number = 1\.5;/);
    assert.match(rays, /new AssetManager\.instance\.assets\.level_up_rays\(\)/);
  });

  it('the name: the middle of ArbitrarySWFView\'s square, lifted by the clip\'s y', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const view = readFileSync(join(client, 'view/gameoverlay/GameSplashScreenView.as'), 'utf8');
    assert.match(view, /graphic_tf\.y = int\(graphic_holder\.y \+ \(graphic_holder\.height\/2 - graphic_tf\.height\/2\) \+ splash_screen\.graphic\.text_delta_y\);/);
    assert.match(view, /graphic_holder\.y = int\(-swf_view\.mc\.y \* graphic_props\.scale\);/);
    const arb = readFileSync(join(client, 'view/gameoverlay/ArbitrarySWFView.as'), 'utf8');
    assert.match(arb, /_wh = \(swf_w > swf_h\) \? swf_w : swf_h;/);
    assert.match(arb, /mc\.y = _wh-\(swf_h\*mc\.scaleX\);/);
  });

  it('fades in over 0.4 s, then plays the label; Enter or Escape takes the does_close button', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const base = readFileSync(join(client, 'view/gameoverlay/BaseSplashScreenView.as'), 'utf8');
    assert.match(base, /TSTweener\.addTween\(this, \{alpha:1, time:\.4, transition:'linear', onComplete:onAnimateComplete\}\);/);
    assert.equal(SPLASH_FADE_IN_MS, 400);
    const view = readFileSync(join(client, 'view/gameoverlay/GameSplashScreenView.as'), 'utf8');
    assert.match(view, /ArbitrarySWFView\(graphic_holder\.getChildAt\(0\)\)\.animate\(splash_screen\.graphic\.frame_label\);/);
    assert.match(view, /if\(bt\.value && 'does_close' in bt\.value && bt\.value\.does_close === true\)\{/);
  });
});

describe('the art (tools/overlay-art, glitch-overlays FLAs)', () => {
  for (const key of ['race_winner', 'grabemgood_winner', 'thegreathoghaul_winner', 'game_of_crowns_winner']) {
    it(`${key} is a sheet with both labels, stopping on their last frames`, () => {
      const m = manifest[key];
      assert.ok(m, key);
      assert.equal(m.kind, 'sheet');
      assert.equal(m.src, `glitch-overlays/${key}.fla`);
      assert.deepEqual(m.states.other_winner, { from: 0, frames: 11, loop: false });
      assert.deepEqual(m.states.you_winner, { from: 11, frames: 10, loop: false });
      assert.ok(existsSync(join(pub, 'assets/sprites/overlays', m.file)), m.file);
    });
  }
  it('the manifest key moved with the new art', () => {
    assert.match(read('js/overlay-art.js'), /overlays\.json\?v=g304-1/);
  });
});

describe('the splash helpers', () => {
  it('you_winner with rays, or other_winner with the name', () => {
    assert.deepEqual(splashFor(true, 'Amp'), { label: 'you_winner', rays: true, text: '' });
    assert.deepEqual(splashFor(false, 'Amp'), { label: 'other_winner', rays: false, text: 'Amp' });
  });
  it('the name centres on the art plus text_delta_y (no stage: the box)', () => {
    assert.equal(splashTextY({ box: [0, 0, 400, 300] }, 55), 205);
    assert.equal(splashTextY({ box: [0, 0, 400, 300] }, -10), 140);
    assert.equal(splashTextY({ box: [0, 0, 400, 300] }, 55, 103), 103, 'nameY overrides');
  });
  it('G304: the client places it at stage y h - max(w, h) / 2 + text_delta_y (box px)', () => {
    // race_winner: 433 x 276 stage, square 433: 276 - 216.5 + 55, less the box's -1: in the orb.
    assert.equal(splashTextY(manifest.race_winner, 55), 115.5);
    // Game of Crowns: 345 x 309: 309 - 172.5 + 25 + 1 = 162.5 (the recording: about 167, above the plate).
    assert.equal(splashTextY(manifest.game_of_crowns_winner, 25), 162.5);
    // Taller than wide (grabemgood 265 x 323): the square is the height, so its middle.
    assert.equal(splashTextY(manifest.grabemgood_winner, 0), 161.5);
    assert.equal(splashTextY(manifest.thegreathoghaul_winner, -10), 339 - 205 - 10 + 1);
    assert.equal(RACE_SPLASH.nameY, undefined, 'no remake override');
    // Across: the stage's middle, not the box's (the hog haul's box starts 43 px in).
    assert.equal(splashTextX(manifest.thegreathoghaul_winner), 205 - 43);
  });
  it('G304: the rays square sits on the stage middle at 1.5 and turns at the tween rates', () => {
    const rays = manifest[SPLASH_RAYS_KEY];
    assert.equal(rays.kind, 'spin');
    assert.equal(rays.src, 'glitch-client/TSEngineAssets/level_up_rays.fla');
    assert.deepEqual(rays.layers.map((l) => l.name), ['thinSlow', 'thickSlow']);
    for (const l of rays.layers) assert.ok(existsSync(join(pub, 'assets/sprites/overlays', l.file)), l.file);
    const plan = splashRays(manifest.race_winner, rays);
    assert.equal(plan.side, rays.box[2] * 1.5);
    assert.deepEqual([plan.cx, plan.cy], [433.2 / 2 + 1, 275.6 / 2 + 1]);
    // 22.31 deg and 59.68 deg over 178 frames at 30 fps.
    assert.deepEqual(plan.layers.map((l) => Math.round(l.turnSec)), [96, 36]);
    assert.equal(splashRays(manifest.race_winner, null), null);
  });
  it('Enter or Escape picks the first does_close button', () => {
    const leave = { label: 'Leave the Game' };
    assert.equal(splashDoneButton([leave]), leave);
    assert.equal(splashDoneButton([{ label: 'x', doesClose: false }]), null);
    assert.equal(splashDoneButton([]), null);
  });
});

/** Just enough DOM to show a splash. */
function fakeDom() {
  const make = (tag) => {
    const node = {
      tagName: tag, style: { setProperty(k, v) { node.style[k] = v; } }, attrs: {}, children: [], handlers: {}, textContent: '', hidden: false,
      classes: new Set(),
      set className(v) { node.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className() { return [...node.classes].join(' '); },
      classList: { add: (c) => node.classes.add(c), remove: (c) => node.classes.delete(c) },
      setAttribute(k, v) { node.attrs[k] = v; },
      appendChild(c) { node.children.push(c); c.parent = node; return c; },
      append(...cs) { cs.forEach((c) => node.appendChild(c)); },
      remove() { if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node); },
      addEventListener(type, fn) { node.handlers[type] = fn; },
      querySelector() { return null; },
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  const listeners = new Map();
  const timers = [];
  const win = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
  };
  const doc = { head, body, defaultView: win, createElement: make, getElementById: () => null };
  return { doc, body, win, listeners, timers };
}

describe('show and leave', () => {
  it('draws the label art and name, and Enter leaves once faded in', async () => {
    const dom = fakeDom();
    const data = {};
    const sounds = [];
    const splash = createGameSplash({
      document: dom.doc,
      win: dom.win,
      mount: () => dom.body,
      setData: (k, v) => { data[k] = v; },
      playSound: (k) => sounds.push(k),
      manifest: async () => manifest,
    });
    let left = 0;
    await splash.show({ key: 'race_winner', ...splashFor(false, 'Amp'), textDeltaY: 55, buttons: [{ label: 'Leave the Game', w: 150, onClick: () => { left += 1; } }] });
    assert.equal(data.gameSplash, 'race_winner:other_winner');
    assert.equal(data.gameSplashFrame, '0');
    const root = dom.body.children[0];
    assert.equal(root.attrs.role, 'dialog');
    const [graphic, row] = root.children[0].children;
    assert.match(graphic.children[1].style.backgroundImage, /race_winner@1\.5x\.webp/);
    assert.equal(graphic.children[2].textContent, 'Amp');
    assert.equal(row.children[0].textContent, 'Leave the Game');
    assert.equal(row.children[0].style.width, '150px');
    assert.equal(row.children[0].className, 'game-splash-minor', "type 'minor'");
    assert.equal(graphic.children[0].hidden, true, 'no rays for other_winner');
    const key = (k) => { const e = { key: k, preventDefault() {}, stopImmediatePropagation() {} }; dom.listeners.get('keydown')(e); };
    key('Enter');
    assert.equal(left, 0, 'not before the fade in (ready_for_input)');
    dom.timers.find((t) => t.ms === SPLASH_FADE_IN_MS).fn();
    assert.equal(data.gameSplash, 'race_winner:other_winner:ready');
    key('Escape');
    assert.equal(left, 1);
    assert.equal(splash.isOpen(), false);
    assert.equal(dom.listeners.has('keydown'), false);
  });

  it('you_winner draws the two ray fans; Game of Crowns: Enter takes Play Again', async () => {
    const dom = fakeDom();
    const data = {};
    const splash = createGameSplash({ document: dom.doc, win: dom.win, mount: () => dom.body, setData: (k, v) => { data[k] = v; }, manifest: async () => manifest });
    const picked = [];
    await splash.show({
      key: CROWNS_SPLASH.key,
      ...splashFor(true),
      textDeltaY: CROWNS_SPLASH.textDeltaY,
      buttons: [
        { label: CROWNS_SPLASH.againLabel, w: 150, value: 'again', onClick: () => picked.push('again') },
        { label: CROWNS_SPLASH.leaveLabel, w: 150, value: 'leave', onClick: () => picked.push('leave') },
      ],
    });
    const [graphic, row] = dom.body.children[0].children[0].children;
    const rays = graphic.children[0];
    assert.equal(rays.hidden, false);
    assert.deepEqual(rays.children.map((img) => img.src), ['assets/sprites/overlays/level_up_rays.thinSlow.svg', 'assets/sprites/overlays/level_up_rays.thickSlow.svg']);
    assert.equal(data.gameSplashRays, '95.75,35.79');
    assert.deepEqual(row.children.map((b) => b.textContent), ['Play Again', 'Leave the Game']);
    dom.timers.find((t) => t.ms === SPLASH_FADE_IN_MS).fn();
    dom.listeners.get('keydown')({ key: 'Enter', preventDefault() {}, stopImmediatePropagation() {} });
    assert.deepEqual(picked, ['again'], 'onDoneClick: the first does_close button');
  });
});

describe('the game uses it', () => {
  it('races-feature: games_end_race / games_end_quoin_grab, and leaving mid-race just goes', () => {
    assert.match(races, /import \{ QUOIN_GRAB_SPLASH, RACE_SPLASH, splashFor \} from '\.\.\/game-splash\.js\?v=g309-1';/);
    assert.match(races, /buttons: \[\{ label: splash\.leaveLabel, w: splash\.buttonW, value: 'leave', onClick: \(\) => leaveRace\(engine\) \}\],/);
    assert.match(races, /\} else setTimeout\(\(\) => leaveRace\(engine\), 0\);/);
    assert.match(races, /if \(splashShown\) engine\.hideGameSplash\?\.\(\);/);
    // G304: the game quoin's mood goes through the gain gate (quoin.js 185); raceResultCopy is not used here.
    assert.match(races, /gainMetabolic\(engine\.pc, 'mood', amount\);/);
    assert.doesNotMatch(races, /raceResultCopy|moodMax/);
  });
  it('crowns-feature: games_end_it_game through engine.gameSplash, no card of its own', () => {
    assert.match(crowns, /import \{ CROWNS_SPLASH, splashFor \} from '\.\.\/game-splash\.js\?v=g309-1';/);
    assert.match(crowns, /engine\.gameSplash\?\.\(\{\s*key: CROWNS_SPLASH\.key,\s*\.\.\.splashFor\(res\.won, res\.winnerName\),\s*textDeltaY: CROWNS_SPLASH\.textDeltaY,/);
    assert.match(crowns, /value: 'again', onClick: \(\) => playAgain\(engine\)/);
    assert.match(crowns, /value: 'leave', onClick: \(\) => leave\(engine\)/);
    assert.match(crowns, /engine\.playSound\('YOU_LOSE'/);
    assert.doesNotMatch(crowns, /crowns-result|data-crowns-again|hud\.result/);
  });
  it('the Hog Haul: games_end_hogtie_piggy, no card left in the page', () => {
    assert.match(game, /gameSplashUi\(\)\.show\(\{\s*key: HOG_HAUL_SPLASH\.key,\s*\.\.\.splashFor\(won, hogHaulState\.rivalLabel\),\s*textDeltaY: HOG_HAUL_SPLASH\.textDeltaY,/);
    assert.match(game, /onClick: \(\) => leaveHogHaulRace\(\)/);
    assert.match(game, /gameSplash: \(opts\) => gameSplashUi\(\)\.show\(opts\),/);
    assert.doesNotMatch(game, /hog-haul-leave-btn|data-hog-result-title/);
    assert.doesNotMatch(read('play/index.html'), /id="hog-haul-result"|hog-haul-leave-btn/);
  });
});
