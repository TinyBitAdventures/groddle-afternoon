/**
 * #570 (G1077): the garden signs were blank. Tiny Speck's sign decos carry their words (`sign_txt`,
 * in a `sign_css_class`), which the client printed inside the deco (glitch-client DecoRenderer.as
 * 287-322). location-xml.js read them, but build-street-layers.mjs dropped them, so the street JSON
 * had no words for 135 signed decos on 37 streets (14 signs on the 7 garden streets). Now the builder
 * carries `signText` and `signClass`, js/deco-sign.js turns them into a text style, and
 * js/street-render.js prints them in the deco, on top of its layer, unless a feature prints that
 * street's words itself (tower rooms) or that sign's (Gentle Island, the practice streets, the
 * forgotten floor).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_SIGN_CLASS, SIGN_CLASS_STYLES, SIGN_WORDS_ELSEWHERE, parseSignMarkup, signWords, signWordsElsewhere } from '../public/js/deco-sign.js?v=e98e50f9';
import { ISLAND_SIGNS } from '../public/js/newxp.js?v=43f8df2c';
import { AK_SIGNS } from '../public/js/skillquest-ak.js?v=397a9d19';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const streetsDir = join(root, 'public/assets/streets');
const GARDENS = ['GA95U14319524O9', 'GA97L62229522GS', 'GA99U5PI39524GN', 'GCR101NQ4BU1SKS', 'GCR101UN0NJ1QPQ', 'GCR202JSVIN1STL', 'GIFGR46M8RE2RC7'];

function signedDecos(tsid) {
  const street = JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
  return (street.layers || []).flatMap((l) => (l.decos || []).filter((d) => d.signText));
}

describe('#570 sign decos keep and print their words', () => {
  it('the street JSON carries every archived sign: 135 on 37 streets, 14 on the 7 garden streets', () => {
    let decos = 0;
    let streets = 0;
    for (const file of readdirSync(streetsDir).filter((f) => /^G[A-Z0-9]+\.json$/.test(f))) {
      const street = JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));
      if (!Array.isArray(street.layers)) continue;
      // The tower rooms the remake rebuilt write their own plaques (no `signClass`, no archive id).
      const archived = street.layers.flatMap((l) => (l.decos || []).filter((d) => d.signText && !d.layer));
      if (!archived.length) continue;
      decos += archived.length;
      streets += 1;
    }
    assert.ok(decos >= 135, `${decos} signed decos`);
    assert.ok(streets >= 37, `${streets} streets`);
    const garden = GARDENS.flatMap((t) => signedDecos(t));
    assert.equal(garden.length, 14);
    const chakra = signedDecos('GA95U14319524O9').map((d) => parseSignMarkup(d.signText).text).sort();
    assert.deepEqual(chakra, ['Plant for everyone,\nharvest what you need.', 'Share these plots,\nshare their bounty.']);
  });

  it('the builder carries sign_txt and sign_css_class (build-street-layers.mjs)', () => {
    const src = read('build-street-layers.mjs');
    assert.match(src, /signText: typeof scalars\.sign_txt === 'string'/);
    assert.match(src, /deco\.signClass = flag\.signClass/);
    // A Corridor's plaques keep their VAG Tan class.
    assert.ok(signedDecos('GIF1QBNPP7123J0').every((d) => d.signClass === 'deco_sign_vag_tan'));
  });

  it("reads a sign's markup: lines at <br>, its <font> colour and size over the class", () => {
    const garden = parseSignMarkup('<font color="#2B1B17" size="19"> Plant for everyone, <br> harvest what you need.</font>');
    assert.deepEqual(garden, { text: 'Plant for everyone,\nharvest what you need.', fill: 0x2b1b17, size: 19 });
    assert.deepEqual(parseSignMarkup("<font size='22'>Click &amp; jump</font>"), { text: 'Click & jump', fill: null, size: 22 });
    assert.deepEqual(parseSignMarkup('EXIT'), { text: 'EXIT', fill: null, size: null });
  });

  it("gives each of the editor's 16 classes a look, the default White", () => {
    const panel = readFileSync(join(root, '..', 'glitch-client/locodeco/lib/src/locodeco/PropertiesPanel.mxml'), 'utf8');
    const names = [...panel.matchAll(/data: '((?:default_)?deco_sign[a-z_]*)'/g)].map((m) => m[1]);
    assert.equal(names.length, 16);
    assert.deepEqual(names.sort(), Object.keys(SIGN_CLASS_STYLES).sort());
    const plain = signWords({ signText: 'Reset', w: 168 });
    assert.equal(plain.style.fill, SIGN_CLASS_STYLES[DEFAULT_SIGN_CLASS].fill);
    assert.equal(plain.style.wordWrapWidth, 168);
    assert.equal(plain.style.align, 'center');
    const tan = signWords({ signText: 'C1E', signClass: 'deco_sign_vag_tan', w: 425 });
    assert.equal(tan.style.fill, SIGN_CLASS_STYLES.deco_sign_vag_tan.fill);
    const garden = signWords(signedDecos('GIFGR46M8RE2RC7')[0]);
    assert.equal(garden.style.fill, 0x382d2c);
    assert.equal(garden.style.fontSize, 19);
  });

  it('leaves the signs a feature prints itself (no words twice)', () => {
    const ids = [...Object.keys(ISLAND_SIGNS), ...Object.keys(AK_SIGNS)];
    for (const id of ids) assert.ok(SIGN_WORDS_ELSEWHERE.has(id), id);
    assert.equal(signWords({ id: ids[0], signText: 'x', w: 100 }), null);
    // The forgotten floor's EXIT (hidden-floors.js EXIT_SIGNS), kept in the JSON without its id.
    const exit = signedDecos('GDOOSA8V29J24I3')[0];
    assert.equal(signWordsElsewhere(exit), true);
    assert.equal(SIGN_WORDS_ELSEWHERE.size, ids.length + 1);
    // Tower rooms print their plaques (tower-rooms-feature drawSigns): the street view leaves them.
    assert.match(read('public/js/features/tower-rooms-feature.js'), /printsSignWords\(street\) \{\s+return anyTowerRoomByTsid\(street\?\.tsid\) \? true : null;/);
    assert.match(read('public/game.js'), /signWords: !features\.query\('printsSignWords', data\),/);
  });

  it('street-render prints them in the deco, turned back on a flip, on top of its layer', () => {
    const src = read('public/js/street-render.js');
    assert.match(src, /if \(opts\.signWords !== false && addSignWords\(PIXI, spr, deco\)\) signed \+= 1;/);
    const fn = src.slice(src.indexOf('function addSignWords'), src.indexOf('function makePlaceholder'));
    assert.match(fn, /label\.scale\.set\(1 \/ sx, 1 \/ sy\);/);
    assert.match(fn, /label\.y = -\(spr\.texture\?\.orig\?\.height \|\| spr\.texture\?\.height \|\| 0\) \/ 2;/);
    assert.match(fn, /spr\.addChild\(label\);/);
    assert.match(fn, /spr\.zIndex = SIGN_DECO_Z \+ \(deco\.z \|\| 0\);/);
  });
});
