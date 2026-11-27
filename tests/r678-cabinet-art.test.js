// #678: the cabinet's storage window showed the plain cabinet art under an upgraded style's name.
// Glitch's CabinetDialog.as 276 draws the cabinet's own swf_url, so a restyled cabinet shows its style.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FURNITURE_UPGRADES, pieceLabel } from '../public/js/furniture-upgrades.js?v=f563b304';
import { furnitureDef, pieceArt } from '../public/js/home-decor.js?v=c63e5e16';

const src = readFileSync(join(import.meta.dirname, '../public/js/features/home-storage-feature.js'), 'utf8');

it('an Onyx Black Small Cabinet window shows the Onyx Black art its title names', () => {
  const cls = 'bag_furniture_smallcabinet';
  const [id] = Object.entries(FURNITURE_UPGRADES[cls].upgrades).find(([, r]) => /Onyx Black/.test(r.name));
  assert.match(pieceLabel({ classTsid: cls, upgradeId: id }, 'Small Cabinet'), /Onyx Black/);
  assert.notEqual(pieceArt(cls, id).path, furnitureDef(cls).art.path);
  const open = src.slice(src.indexOf('function openCabinet('), src.indexOf('async function refreshVisitCabinet'));
  assert.match(open, /art: pieceArt\(row\.classTsid, row\.upgradeId\)\?\.path/);
  assert.doesNotMatch(open, /art: furnitureDef\(/);
});

it("a visitor's window reads the same placed row, upgrade included", () => {
  // homeStorageVisit keeps the owner's placed rows whole (info.spots.pieces[].item), so upgradeId rides along.
  const open = src.slice(src.indexOf('function openCabinet('), src.indexOf('async function refreshVisitCabinet'));
  assert.match(open, /owner \? \(visit\?\.pieces \|\| \[\]\)\.map\(\(p\) => p\.item\)/);
});
