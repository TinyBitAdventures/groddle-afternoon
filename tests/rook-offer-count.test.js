/**
 * Ticket 70 (Friendly, Hell One): "donating toward rook attacks only gives the option of all or
 * nothing". The shrine's donate verb has requires_target_item_count (GSJS items/npc_shrine_zille.js
 * 352), so Glitch asked how many of the chosen stack: All, 1 and a quantity picker that opened at half
 * the stack (glitch-client InteractionMenuController.as 1338-1343, getCountChoices 1724-1765), and the
 * damage was the count's (items/include/shrines.js 1007, 1034). The remake's offering panel had only
 * 1 and All. Each row now keeps 1 and All as quick picks and opens the game's one How many chooser
 * (js/ui/count-chooser.js) at half the stack, with the damage the count will do; solo strikes with
 * that count, online the rook_strike message carries it (the server takes 1-999, rook.go 1183).
 * Run: node --test tests/rook-offer-count.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeEl, FakeText } from './social-fake-dom.js';
import { offerDefaultCount, strikeDamageFor } from '../public/js/rook-attack.js?v=c12e825f';
import { strikeDamage as mpStrikeDamage } from '../public/js/rook-mp.js?v=0b9056b1';
import { donationValueFor } from '../public/js/shrines.js?v=56ae73be';

const src = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');

/** FakeEl that parses the markup it is given (tags, attributes, text), enough for the offering panel. */
class HtmlEl extends FakeEl {
  get disabled() { return 'disabled' in this.attrs; }
  set disabled(v) { if (v) this.attrs.disabled = ''; else delete this.attrs.disabled; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  set innerHTML(html) {
    this.children = [];
    this._text = '';
    const stack = [this];
    const re = /<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
    for (const m of String(html).matchAll(re)) {
      const top = stack[stack.length - 1];
      if (m[1]) {
        stack.pop();
      } else if (m[2]) {
        const el = new HtmlEl(m[2]);
        for (const a of m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.attrs[a[1]] = (a[2] ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        if (el.tagName === 'INPUT') el.value = el.attrs.value ?? '';
        top.append(el);
        if (!m[4] && !['IMG', 'INPUT', 'BR'].includes(el.tagName)) stack.push(el);
      } else if (m[5].trim()) {
        top.append(new FakeText(m[5].trim()));
      }
    }
  }
  appendChild(child) { this.append(child); return child; }
  removeChild(child) { this.children = this.children.filter((c) => c !== child); child.parentElement = null; return child; }
  after(node) {
    const p = this.parentElement;
    if (node.parentElement) node.parentElement.removeChild(node);
    p.children.splice(p.children.indexOf(this) + 1, 0, node);
    node.parentElement = p;
  }
  key(key) { return this.dispatch('keydown', { key }); }
}

const saved = {};
before(() => {
  for (const k of ['document', 'requestAnimationFrame']) saved[k] = globalThis[k];
  const body = new HtmlEl('body');
  globalThis.document = {
    body,
    activeElement: null,
    createElement: (t) => new HtmlEl(t),
    getElementById: (id) => body.all().find((n) => n.id === id) || null,
  };
  globalThis.requestAnimationFrame = (fn) => fn(0);
});
after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

const panel = () => document.getElementById('rook-offer-panel');
const row = (cls) => panel()?.querySelectorAll('li').find((li) => li.getAttribute('data-rook-offer') === cls);
const chooser = () => panel()?.querySelector('[data-rook-count]');
const shown = (sel) => chooser().querySelector(sel);

function baseEngine(extra) {
  return {
    started: true,
    interactables: [],
    player: { x: 400, y: 800 },
    pc: { energy: 500, mood: 500, imaginationUpgrades: [] },
    camera: { x: 0, y: 0, w: 1280 },
    platforms: [],
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    busy: () => false,
    acting: () => false,
    param: () => null,
    setData: () => {},
    say: () => {},
    save: () => {},
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    updateHud: () => {},
    refreshPack: () => {},
    achievement: () => {},
    floatText: () => {},
    nudgeCamera: () => {},
    streetSlot: () => ({}),
    learnedSkills: [],
    ...extra,
  };
}

const shrine = () => ({ classId: 'npc_shrine_zille', label: 'Shrine to Zille', state: { giantId: 'zille' }, sprite: { x: 600, y: 800, destroyed: false } });

describe('ticket 70: how many of an offering', () => {
  it('opens at half the stack, rounded, as the client\'s quantity picker did', () => {
    assert.deepEqual([1, 2, 3, 7, 40, 41, 999].map(offerDefaultCount), [1, 1, 2, 4, 20, 21, 500]);
    assert.equal(offerDefaultCount(0), 1);
    assert.equal(offerDefaultCount('x'), 1);
  });

  it('the panel uses the one How many chooser on its own hooks, and both skins style its OK', () => {
    const feature = src('js/features/rook-attack-feature.js');
    assert.match(feature, /import \{ bindCountField, countKeyValue, countStepMarkup \} from '\.\.\/ui\/count-chooser\.js/);
    assert.match(feature, /countStepMarkup\(\{ value: n, max: o\.count, verb: 'Give', attrs: OFFER_COUNT_ATTRS \}\)/);
    assert.match(feature, /const n = offerDefaultCount\(o\.count\);/);
    assert.match(src('style.css'), /\.count-pop :is\(\.feed-picker-qty-go, \.qty-row \.btn-glitch-primary, \[data-v-go\], \[data-rook-count-give\]\) \{/);
    assert.match(src('css/classic.css'), /\.count-pop :is\(\[data-pack-drop-confirm\], \[data-pack-eat-confirm\], \[data-pack-count-confirm\], \.feed-picker-qty-go, \[data-v-go\], \[data-rook-count-give\]\) \{/);
  });

  it('solo: 1, All and How many each strike with their count, and the chooser shows the damage', async () => {
    const { rookAttackFeature: f } = await import('../public/js/features/rook-attack-feature.js?fresh=rook-offer-count-solo');
    const TSID = 'GLI2V0UN7RD1T2J';
    const engine = baseEngine({ mode: 'solo', street: { tsid: TSID }, streetTsid: TSID, inv: { plank: 40, cherry: 2 } });
    const s = shrine();
    const health = 100000;
    f.restore({ active: { tsid: TSID, phase: 'stunned', health, maxHealth: health, stun: 1000, maxStun: 1000, startedAt: Date.now() } });
    f.runVerbOverride(s, 'rook_prime', engine);
    f.runVerbOverride(s, 'rook_strike', engine);
    assert.ok(panel(), 'the offering panel opens');
    // A stack of two is 1 or All; three or more ask how many.
    assert.equal(row('cherry').querySelector('[data-rook-some]'), null);
    const plank = row('plank');
    assert.ok(plank.querySelector('[data-rook-give="1"]') && plank.querySelector('[data-rook-give="all"]'), '1 and All stay as quick picks');
    plank.querySelector('[data-rook-some]').click();
    assert.equal(plank.querySelector('[data-rook-some]').getAttribute('aria-expanded'), 'true');
    const dmg = (n) => strikeDamageFor({ baseCost: donationValueFor('plank'), count: n });
    assert.equal(shown('[data-rook-count-num]').value, '20', 'half of 40');
    assert.equal(document.activeElement, shown('[data-rook-count-num]'), 'the field takes the focus');
    assert.equal(shown('.count-pop-of').textContent, `20 of 40 · ${dmg(20)} damage`);
    assert.equal(shown('[data-rook-count-give]').textContent, 'Give 20');
    assert.equal(shown('.count-pop-title').textContent, 'Strike with how many Planks?');
    // Mouse: − and +, Max; keys on the step row: Page Down, Home, End.
    shown('[data-rook-count-inc]').click();
    assert.equal(shown('[data-rook-count-num]').value, '21');
    shown('[data-rook-count-max]').click();
    assert.equal(shown('[data-rook-count-num]').value, '40');
    assert.equal(shown('[data-rook-count-inc]').disabled, true);
    assert.equal(shown('[data-rook-count-max]').getAttribute('aria-pressed'), 'true');
    shown('[data-rook-count-dec]').key('PageDown');
    assert.equal(shown('[data-rook-count-num]').value, '30');
    shown('[data-rook-count-dec]').key('Home');
    assert.equal(shown('[data-rook-count-num]').value, '1');
    assert.equal(shown('[data-rook-count-dec]').disabled, true);
    // Keyboard in the field: arrows step, Esc goes back to the offerings (the panel stays).
    shown('[data-rook-count-num]').key('ArrowUp');
    assert.equal(shown('[data-rook-count-num]').value, '2');
    shown('[data-rook-count-num]').key('Escape');
    assert.equal(chooser(), null);
    assert.ok(panel(), 'Esc in the chooser leaves the offering panel open');
    assert.equal(document.activeElement, plank.querySelector('[data-rook-some]'));
    // Typed and Enter: gives what was typed.
    plank.querySelector('[data-rook-some]').click();
    shown('[data-rook-count-num]').value = '13';
    shown('[data-rook-count-num]').key('Enter');
    assert.equal(panel(), null, 'giving closes the panel');
    assert.equal(engine.inv.plank, 27);
    assert.match(f._state().lastAction, new RegExp(`^strike:${dmg(13)}:`));
    // The quick picks: 1, then (after the shrine recharges) All.
    const strikeAgain = (pick) => {
      f.runVerbOverride(s, 'rook_prime', engine);
      f.runVerbOverride(s, 'rook_strike', engine);
      row('plank').querySelector(pick).click();
    };
    strikeAgain('[data-rook-give="1"]');
    assert.equal(engine.inv.plank, 26);
    strikeAgain('[data-rook-give="all"]');
    assert.equal(engine.inv.plank || 0, 0);
  });

  /** An online player on a street whose Rook is stunned and whose shrine they primed. */
  async function online(name, inv) {
    const { rookAttackFeature: f } = await import(`../public/js/features/rook-attack-feature.js?fresh=rook-offer-count-${name}`);
    const TSID = 'LIF12PMQ5121D68';
    const handlers = {};
    const sent = [];
    const client = { me: { id: 7 }, state: 'online', street: TSID, players: [], on: (k, fn) => { (handlers[k] ||= []).push(fn); }, send: (k, p) => { sent.push([k, p]); return true; } };
    const slots = {};
    const engine = baseEngine({
      mode: 'multiplayer', street: { tsid: TSID, hubId: '27' }, streetTsid: TSID, inv,
      streetSlot: (id) => (slots[id] ||= {}), query: (k) => (k === 'realtimeClient' ? client : null),
    });
    f.onStreetClear(engine);
    let t = 10000;
    for (let i = 0; i < 10; i++) { t += 500; f.onTick(500, t, engine); }
    for (const fn of handlers['msg:rook'] || []) fn({ street: TSID, attack: { phase: 'stunned', health: 5000, maxHealth: 5000, stun: 125, maxStun: 125, crowd: 1, clock: 120000, orbs: [], primed: { by: 7, name: 'Me', in: 10000 } }, rooked: {} });
    f.runVerbOverride(shrine(), 'rook_strike', engine);
    return { strikes: () => sent.filter(([k]) => k === 'rook_strike') };
  }

  it('online: the rook_strike message carries the chosen count, half the stack by default', async () => {
    const { strikes } = await online('mp', { meat: 9 });
    assert.ok(panel(), 'the offering panel opens online');
    row('meat').querySelector('[data-rook-some]').click();
    assert.equal(shown('[data-rook-count-num]').value, '5', 'half of 9, rounded');
    const meat = donationValueFor('meat');
    assert.equal(shown('.count-pop-of').textContent, `5 of 9 · ${mpStrikeDamage({ baseCost: meat, count: 5 })} damage`);
    shown('[data-rook-count-dec]').click();
    shown('[data-rook-count-give]').click();
    assert.equal(panel(), null);
    assert.deepEqual(strikes(), [['rook_strike', { item: 'meat', count: 4 }]]);
  });

  it('online: a stack past the server\'s 999 stops there, and opens at half of it', async () => {
    const { strikes } = await online('mp999', { plank: 1500 });
    assert.equal(row('plank').querySelector('span').textContent, 'Plank ×999');
    row('plank').querySelector('[data-rook-some]').click();
    assert.equal(shown('[data-rook-count-num]').value, '500');
    shown('[data-rook-count-max]').click();
    assert.equal(shown('[data-rook-count-num]').value, '999');
    shown('[data-rook-count-num]').key('Enter');
    assert.deepEqual(strikes(), [['rook_strike', { item: 'plank', count: 999 }]]);
  });
});
