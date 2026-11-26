/**
 * G1237 (the #656 review): on the phone street map the door button stood on the dino entrance art on
 * Teobocci Shasha, centred on the door's foot, so the dino was mostly hidden. Every door and subway
 * mark now stands beside its door's art (ui/street-minimap.js besideArt): its box never overlaps the
 * art's box and stays on the map, on the phone sheet at 384 x 748 upright and on the computer's card.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_WIDTH, STATION_MARK, besideArt, doorMarks, mapGeometry, placeMark, stationMarks, toMap } from '../public/js/ui/street-minimap.js?v=faab9586';
import { phoneMapWidth } from '../public/js/features/street-minimap-feature.js?v=b57b3ccb';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=77386ca9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const streetJson = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
// The phone sheet at 384 x 748: the card's 16 px gutters, the map's share of the height.
const PHONE = { w: 384 - 32, h: Math.round(748 * 0.6) };

function overlap(geom, mark) {
  const mw = STATION_MARK.w * geom.u;
  const mh = STATION_MARK.h * geom.u;
  const at = besideArt(geom, mark, mw);
  const box = placeMark(geom, at.x, at.y, mw, mh);
  const foot = toMap(geom, mark.x, mark.y);
  const half = ((mark.w / geom.W) * geom.w) / 2;
  const art = { l: foot.x - half, r: foot.x + half, t: foot.y - (mark.h / geom.H) * geom.mapH, b: foot.y };
  const ox = Math.min(art.r, box.left + mw) - Math.max(art.l, box.left);
  const oy = Math.min(art.b, box.top + mh) - Math.max(art.t, box.top);
  return { ox, oy, onMap: box.left >= 0 && box.left + mw <= geom.w + 0.5, art, box };
}

describe('door and subway marks beside the art (G1237)', () => {
  it('Teobocci Shasha on the phone: the dino button is beside the dino, not on it', () => {
    const street = streetJson('GA5AAB0VNKR2VRN');
    const geom = mapGeometry(street, { width: phoneMapWidth(street, PHONE.w, PHONE.h) });
    const [mark] = doorMarks(street);
    assert.equal(mark.tip, 'Glutton Greens');
    const o = overlap(geom, mark);
    assert.ok(o.ox <= 0 || o.oy <= 0, `button ${JSON.stringify(o.box)} on the dino ${JSON.stringify(o.art)}`);
    assert.ok(o.onMap);
  });

  it('every street: no door or station mark on its art, on the phone sheet or the card', () => {
    let checked = 0;
    const bad = [];
    for (const file of readdirSync(streetsDir)) {
      if (!file.endsWith('.json') || file === 'index.json') continue;
      const street = JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));
      if (!street.doors?.length) continue;
      subwayFeature.prepareStreet(street);
      const marks = [...doorMarks(street), ...stationMarks(street)].filter((m) => m.w > 0);
      for (const width of [phoneMapWidth(street, PHONE.w, PHONE.h), MAP_WIDTH]) {
        const geom = mapGeometry(street, { width });
        for (const mark of marks) {
          const o = overlap(geom, mark);
          checked += 1;
          // A door as wide as the whole map has no side to stand on.
          if (((mark.w / geom.W) * geom.w) + 2 * STATION_MARK.w * geom.u >= geom.w) continue;
          if ((o.ox > 0.5 && o.oy > 0.5) || !o.onMap) bad.push(`${street.tsid} ${street.label} ${mark.id} at ${width}`);
        }
      }
    }
    assert.ok(checked > 200, `${checked} marks`);
    assert.deepEqual(bad, []);
  });
});
