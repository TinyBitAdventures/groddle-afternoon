/**
 * #713: the region-change loading card splits into the region you leave (left) and the one you
 * enter (right), meeting in a wavy line (LoadingLocationView.as 457-518). Its colours come from
 * the hub data's top_color / btm_color, which Glitch read through StringUtil.cssHexToUint (266-271:
 * an optional leading '#' dropped). 19 of the 94 hub files store them bare ("98a89a" for Firozi);
 * passed on as-is the card's linear-gradient was invalid, the browser dropped it, and a half kept
 * a stale colour (Alakol to Firozi showed one colour, no split).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hubColour, withHubColours } from '../public/js/hub-colour.js?v=51e3ad0e';
import { cssColor, loadingCardBackgrounds } from '../public/js/screen-fx.js?v=7cd62cca';
import { buildHubMapView, goColour } from '../public/js/map-graph.js?v=803cc6cd';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const index = JSON.parse(readFileSync(join(root, 'assets/maps/index.json'), 'utf8'));
const hubs = Object.values(index.hubs).map((meta) => ({ meta, raw: JSON.parse(readFileSync(join(root, meta.file), 'utf8')) }));
const byName = (name) => hubs.find((h) => h.meta.hubName === name);
const HEX = /^#[0-9a-f]{6}$/;
const GRADIENT = /^linear-gradient\(180deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/;

/** What game.js resolveHubColors hands the card for a hub. */
const cardColours = (raw) => {
  const hub = withHubColours(raw);
  return { top: hub.top_color || null, bottom: hub.btm_color || hub.bottom_color || null };
};

describe('#713 hub colours (StringUtil.cssHexToUint)', () => {
  it('reads a colour with or without its #', () => {
    assert.equal(hubColour('98a89a'), '#98a89a');
    assert.equal(hubColour('#98A89A'), '#98a89a');
    assert.equal(hubColour(' 7c867c '), '#7c867c');
    assert.equal(hubColour('abc'), null);
    assert.equal(cssColor('#111', '#000'), '#111');
    assert.equal(hubColour(0x0a0b0c), '#0a0b0c');
    assert.equal(hubColour('', '#fff'), '#fff');
    assert.equal(hubColour('nope'), null);
    assert.equal(cssColor('98a89a', '#000'), '#98a89a');
    assert.equal(cssColor('#2e332c', '#000'), '#2e332c');
  });

  it('the data still has bare colours (the case this guards)', () => {
    assert.equal(hubs.length, 94);
    const bare = hubs.filter(({ raw }) => ['top_color', 'btm_color'].some((k) => typeof raw[k] === 'string' && !raw[k].startsWith('#')));
    assert.ok(bare.length >= 19, `bare hub colours: ${bare.length}`);
    assert.equal(byName('Firozi').raw.top_color, '98a89a');
  });

  it('every colour the loading card would use, for all 94 regions, is a valid CSS colour', () => {
    const bad = [];
    for (const { meta, raw } of hubs) {
      const c = cardColours(raw);
      for (const [k, v] of Object.entries(c)) {
        if (v != null && !HEX.test(v)) bad.push(`${meta.hubName} ${k}=${v}`);
        // The card's own reader, handed the raw file value, agrees.
        const rawV = k === 'top' ? raw.top_color : raw.btm_color ?? raw.bottom_color;
        if (rawV != null && cssColor(rawV, null) !== v) bad.push(`${meta.hubName} raw ${k}=${rawV}`);
      }
      const card = loadingCardBackgrounds({ fromHub: 'Elsewhere', toHub: meta.hubName, fromTopColor: '#000000', fromBottomColor: '#000000', topColor: c.top, bottomColor: c.bottom });
      if (!GRADIENT.test(card.left) || !GRADIENT.test(card.right)) bad.push(`${meta.hubName} card ${card.left} | ${card.right}`);
    }
    assert.deepEqual(bad, []);
  });

  it('Alakol to Firozi: Alakol on the left, Firozi on the right, a real split', () => {
    const from = cardColours(byName('Alakol').raw);
    const to = cardColours(byName('Firozi').raw);
    for (const opts of [
      { fromTopColor: from.top, fromBottomColor: from.bottom, topColor: to.top, bottomColor: to.bottom },
      // straight from the files, '#' or not
      { fromTopColor: byName('Alakol').raw.top_color, fromBottomColor: byName('Alakol').raw.btm_color, topColor: byName('Firozi').raw.top_color, bottomColor: byName('Firozi').raw.btm_color },
    ]) {
      const card = loadingCardBackgrounds({ fromHub: 'Alakol', toHub: 'Firozi', ...opts });
      assert.equal(card.split, true);
      assert.equal(card.leaving, true);
      assert.match(card.left, GRADIENT);
      assert.match(card.right, GRADIENT);
      assert.equal(card.left, `linear-gradient(180deg, ${from.top} 0%, ${from.bottom} 100%)`);
      assert.equal(card.right, 'linear-gradient(180deg, #98a89a 0%, #7c867c 100%)');
    }
  });

  it('Jal to Samudra and back, twice: both halves valid every time', () => {
    for (const [a, b] of [['Jal', 'Samudra'], ['Samudra', 'Jal'], ['Jal', 'Samudra']]) {
      const from = byName(a).raw;
      const to = byName(b).raw;
      const card = loadingCardBackgrounds({ fromHub: a, toHub: b, fromTopColor: from.top_color, fromBottomColor: from.btm_color, topColor: to.top_color, bottomColor: to.btm_color });
      assert.equal(card.split, true);
      assert.match(card.left, GRADIENT, `${a} -> ${b} left`);
      assert.match(card.right, GRADIENT, `${a} -> ${b} right`);
    }
  });

  it('the map reads hub colours the same way (hub map colour, GO buttons)', () => {
    for (const { meta, raw } of hubs) {
      const view = buildHubMapView({ ...raw, hubId: meta.hubId, hubName: meta.hubName }, '', {});
      assert.match(view.color, HEX, meta.hubName);
    }
    assert.equal(goColour({ color: '954f18' }), '#954f18');
    assert.equal(goColour({ hub_id: '114' }), '#954f18');
    assert.equal(goColour({ color: 'bad', hub_id: 'none' }), '#cc0000');
  });

  it('game.js hub readers normalise once where hub data is read', () => {
    const src = readFileSync(join(root, 'game.js'), 'utf8');
    const fn = (name) => src.slice(src.indexOf(`async function ${name}(`), src.indexOf('\n}\n', src.indexOf(`async function ${name}(`)));
    assert.match(fn('resolveHubColors'), /withHubColours\(await res\.json\(\)\)/);
    assert.match(fn('loadHubMapData'), /withHubColours\(await res\.json\(\)\)/);
  });
});
