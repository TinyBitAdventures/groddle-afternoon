/**
 * "I love you <Giant>" in local chat (G94), against glitch-GameServerJS
 * main.js 1798-1824, config_base.js 165-177, players/player.js
 * findCloseStack and the client's GiantView.as / Giants.as.
 * Run: node --test tests/giant-love.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GIANT_SCREEN,
  GIANT_SCREEN_ALPHA,
  GIANT_SCREEN_FADE_MS,
  LOVE_GIANTS,
  LOVE_RADIUS,
  closestShrine,
  giantLoveResponse,
  loveYouGiant,
  loveYouLine,
} from '../public/js/giant-love.js?v=aa9ea315';
import { GIANTS } from '../public/js/shrines.js?v=01b185bc';
import { sayLoveLine } from '../public/js/features/shrine-hint-feature.js?v=a06ac8ab';

const ROOT = join(import.meta.dirname, '..');
const AUDIT = join(ROOT, '..');
const GSJS = join(AUDIT, 'glitch-GameServerJS');
const CLIENT = join(AUDIT, 'glitch-client', 'com', 'tinyspeck', 'engine');

describe('which lines say "I love you <Giant>" (main.js 1798-1802)', () => {
  it('reads the Giant after the 11th character, lowercased, letters only', () => {
    assert.equal(loveYouGiant('I love you Mab'), 'mab');
    assert.equal(loveYouGiant('i LOVE YOU ALPH'), 'alph');
    assert.equal(loveYouGiant('I love you, Zille!'), 'zille');
    assert.equal(loveYouGiant('I love you  Lem'), 'lem');
    assert.equal(loveYouGiant('  I love you Pot.  '), 'pot', 'trimmed like doLocalChat (utils.trim)');
    assert.equal(loveYouGiant('I love you Gren-da-line'), 'grendaline');
    assert.equal(loveYouGiant('I love you Spriggan <3'), 'spriggan', 'digits and symbols are dropped too');
    assert.equal(loveYouGiant('I love you Spriggan forever'), null, '"sprigganforever"');
  });

  it('takes Tii as Ti and nothing that is not one of the eleven', () => {
    assert.equal(loveYouGiant('I love you Tii'), 'ti');
    assert.equal(loveYouGiant('I love you Ti'), 'ti');
    assert.equal(loveYouGiant('I love you'), null);
    assert.equal(loveYouGiant('I love you Groddle'), null);
    assert.equal(loveYouGiant('I love you all'), null);
    assert.equal(loveYouGiant('I love you Lady Mab'), null, 'every letter counts: "ladymab"');
    assert.equal(loveYouGiant('I love youMab'), null, 'the 11th character is skipped: "ab"');
    assert.equal(loveYouGiant('I adore you Mab'), null);
    assert.equal(loveYouGiant('Mab, I love you'), null);
    assert.equal(loveYouGiant(''), null);
  });

  it('names the same eleven Giants as the shrines', () => {
    assert.deepEqual([...LOVE_GIANTS].sort(), Object.keys(GIANTS).sort());
  });
});

describe('the shrine (findCloseStack(is_shrine, 200), get_giant)', () => {
  const mab = { giant: 'mab', x: 1000, y: 500 };
  const lem = { giant: 'lem', x: 1150, y: 500 };

  it('finds the closest shrine within 200 px, straight-line', () => {
    assert.equal(LOVE_RADIUS, 200);
    assert.equal(closestShrine([mab], 1200, 500), mab);
    assert.equal(closestShrine([mab], 1201, 500), null);
    assert.equal(closestShrine([mab], 1120, 340), mab, 'hypot(120, 160) = 200');
    assert.equal(closestShrine([mab], 1121, 340), null);
    assert.equal(closestShrine([mab, lem], 1075, 500), mab, 'a tie keeps the first');
    assert.equal(closestShrine([mab, lem], 1076, 500), lem);
  });

  it('opens the screen only at that Giant\'s shrine', () => {
    const ok = giantLoveResponse('I love you Mab', { shrines: [mab], x: 1050, y: 500 });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.screen, {
      tsid: 'mab',
      title: 'Mab says...',
      tipTitle: 'A Message:',
      tipBody: 'I love you too, friend',
      sound: 'GONG_GIANTS',
      startWithTip: true,
      bg: '#4d5f43',
      alpha: 0.75,
    });
    assert.deepEqual(giantLoveResponse('I love you Alph', { shrines: [mab], x: 1050, y: 500 }), { ok: false, reason: 'wrong-shrine', giant: 'alph', shrineGiant: 'mab' });
    assert.deepEqual(giantLoveResponse('I love you Mab', { shrines: [mab], x: 1300, y: 500 }), { ok: false, reason: 'no-shrine', giant: 'mab' });
    assert.equal(giantLoveResponse('I love you Mab', { shrines: [mab, lem], x: 1140, y: 500 }).reason, 'wrong-shrine', 'the closest shrine decides');
    assert.equal(giantLoveResponse('hello', { shrines: [mab], x: 1000, y: 500 }).reason, 'not-love');
  });

  it('shows Tii as the client\'s "tii"', () => {
    const r = giantLoveResponse('I love you tii', { shrines: [{ giant: 'ti', x: 0, y: 0 }] });
    assert.equal(r.screen.tsid, 'tii');
    assert.equal(r.screen.title, 'Tii says...');
    assert.equal(r.screen.bg, '#2e3548');
  });

  it('has a colour and a label for every Giant', () => {
    for (const g of LOVE_GIANTS) {
      const info = GIANT_SCREEN[g === 'ti' ? 'tii' : g];
      assert.ok(info, g);
      assert.equal(info.label, GIANTS[g].name);
      assert.match(info.bg, /^#[0-9a-f]{6}$/);
      assert.ok(existsSync(join(ROOT, 'public', 'assets', 'sprites', 'icons', `emblem_${g}@3x.png`)), `emblem art for ${g}`);
    }
    assert.equal(GIANT_SCREEN_ALPHA, 0.75);
    assert.equal(GIANT_SCREEN_FADE_MS, 800);
    assert.equal(loveYouLine(), 'I love you too, friend');
  });
});

describe('the shrine-hint feature hears the Local chat box', () => {
  const engine = (x, shrines) => {
    const data = {};
    return {
      data,
      player: { x, y: 500 },
      interactables: shrines.map((giant, i) => ({ classId: `npc_shrine_${giant}`, state: { giantId: giant }, sprite: { x: 1000 + i * 600, y: 500, visible: true, destroyed: false } })),
      setData: (k, v) => { data[k] = v; },
    };
  };

  it('records what happened for QA, and leaves ordinary chat alone', () => {
    let e = engine(1100, ['mab']);
    assert.equal(sayLoveLine(e, 'I love you Mab').ok, true);
    assert.equal(e.data.giantLove, 'screen:mab');
    e = engine(1100, ['mab']);
    sayLoveLine(e, 'I love you Lem');
    assert.equal(e.data.giantLove, 'wrong-shrine:lem');
    e = engine(1300, ['mab']);
    sayLoveLine(e, 'I love you mab');
    assert.equal(e.data.giantLove, 'no-shrine:mab');
    e = engine(1100, ['mab']);
    sayLoveLine(e, 'hello there');
    assert.equal(e.data.giantLove, undefined);
  });

  it('reads the chat box in the capture phase, like the hi signs', () => {
    const src = readFileSync(join(ROOT, 'public', 'js', 'features', 'shrine-hint-feature.js'), 'utf8');
    assert.match(src, /document\.addEventListener\('submit', onChatSubmit, true\)/);
    assert.match(src, /giant-love\.js\?v=[0-9a-f]{8}/);
    assert.match(src, /el\.id = 'giant-screen-panel'/);
  });
});

describe('source copy', () => {
  it('matches main.js, config_base.js and player.js', { skip: !existsSync(GSJS) && 'GSJS not present' }, () => {
    const main = readFileSync(join(GSJS, 'main.js'), 'utf8');
    assert.match(main, /if \(txt\.toLowerCase\(\)\.substr\(0,10\) == 'i love you'\)\{/);
    assert.match(main, /var giant_name = txt\.toLowerCase\(\)\.substr\(11\)\.replace\(\/\[\^a-z\]\/g, ""\);/);
    assert.match(main, /if \(giant_name == 'tii'\) giant_name = 'ti';/);
    assert.match(main, /var shrine = pc\.findCloseStack\(is_shrine, 200\);/);
    assert.match(main, /tip_title: 'A Message:',\s*tip_body: "I love you too, "\+pc\.getLabel\(\),\s*sound: 'GONG_GIANTS',\s*start_with_tip: true/);
    const cfg = readFileSync(join(GSJS, 'config_base.js'), 'utf8');
    const list = /var giants = \[([^\]]*)\]/.exec(cfg)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1));
    assert.deepEqual(list, [...LOVE_GIANTS]);
  });

  it('matches the client\'s Giant screen', { skip: !existsSync(CLIENT) && 'glitch-client not present' }, () => {
    const view = readFileSync(join(CLIENT, 'view', 'gameoverlay', 'GiantView.as'), 'utf8');
    assert.match(view, /DEFAULT_ALPHA:Number = \.75/);
    assert.match(view, /fade_in_secs = \.8/);
    assert.match(view, /\(start_with_tip \? ' says\.\.\.' : ''\)/);
    const giants = readFileSync(join(CLIENT, 'data', 'giant', 'Giants.as'), 'utf8');
    for (const [tsid, info] of Object.entries(GIANT_SCREEN)) {
      const re = new RegExp(`${tsid}: \\{\\s*sex: [A-Z_]+,\\s*label: '${info.label}',\\s*bg_color: 0x${info.bg.slice(1)}`);
      assert.match(giants, re, tsid);
    }
  });
});
