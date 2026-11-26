/**
 * R51 (G1231, #656): the street map's snapshot and the loading strip draw from the street
 * renderer's own list of what a street draws (js/street-render.js STREET_DRAWN), so a kind the
 * street draws can never be missing from them again: the dino entrances and the subway entrances
 * (doors on the entity layer) were. Glitch's getSnapshot kept the doors and signposts and hid only
 * the players and the itemstacks (LocationRenderer.as 618-660).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREET_DRAWN, STREET_ENTITY_KINDS, markStreetEntity, streetEntityRows } from '../public/js/street-render.js?v=9a889516';
import { doorArt } from '../public/js/door-view.js?v=5aa64a59';
import { snapshotEntities, streetEntities } from '../public/js/features/street-minimap-feature.js?v=e4652ce2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const streetJson = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));

/** A Pixi-shaped node. */
function node(props = {}) {
  return { x: 0, y: 0, visible: true, destroyed: false, children: [], parent: null, ...props };
}
function layerWith(children) {
  const layer = node();
  for (const c of children) {
    layer.children.push(c);
    c.parent = layer;
  }
  return layer;
}
/** A real street's view (street-render: it has parallax layers). */
const streetView = () => node({ parallaxLayers: [], street: {} });

describe('R51: the street renderer lists everything a street draws', () => {
  it('the view draws its layers, decos and signposts; the entity layer its doors', () => {
    assert.deepEqual([...STREET_DRAWN.view], ['layer', 'deco', 'signpost']);
    assert.deepEqual([...STREET_DRAWN.entities], ['door']);
    assert.equal(STREET_ENTITY_KINDS, STREET_DRAWN.entities);
    const src = read('public/js/street-render.js');
    // The view kinds are buildStreetView's own: its signposts are in the view the snapshot draws.
    assert.match(src, /buildSignpostSprite\(PIXI, s, pos\);[\s\S]*?root\.addChild\(g\);/);
  });

  it('every entity the street draws from its JSON is a listed kind: Teobocci Shasha\'s dino, Gregarious Grange\'s subway entrance', () => {
    const dino = streetEntityRows(streetJson('GA5AAB0VNKR2VRN'));
    assert.deepEqual(dino.map((r) => [r.kind, r.door.sprite]), [['door', 'door_dino_006']]);
    const grange = streetEntityRows(streetJson('GLI32G3NUTD100I'));
    assert.ok(grange.some((r) => r.door.sprite === 'door_asset_subway_meadow_1'), 'the subway entrance');
    assert.ok(grange.some((r) => r.door.sprite === 'door_asset_bureaucratic_hall_ext'), 'the hall door');
    for (const r of [...dino, ...grange]) assert.ok(STREET_ENTITY_KINDS.includes(r.kind), r.kind);
  });

  it('a hidden door is not drawn (DoorView, getSnapshot hide_hidden_doors)', () => {
    const rows = streetEntityRows({ doors: [{ id: 'a', x: 1, y: 2 }, { id: 'b', x: 3, y: 4, hidden: true }] });
    assert.deepEqual(rows.map((r) => r.door.id), ['a']);
  });

  it('the game draws its doors through the same builder, marked as the street\'s', () => {
    assert.match(read('public/js/features/doors-feature.js'), /buildDoorSprite\(PIXI, door, available\)/);
    assert.match(read('public/js/door-view.js'), /sprite\.streetEntity = 'door';/);
    assert.equal(doorArt({ sprite: 'door_dino_006' }, new Set(['door_dino_006'])).url, 'assets/decos/groddle/door_dino_006.png');
    assert.equal(doorArt({ sprite: 'lost_art' }, new Set()).art, 'drawn');
    assert.equal(markStreetEntity(node(), 'door').streetEntity, 'door');
    assert.equal(markStreetEntity(node(), 'npc').streetEntity, undefined, 'only a listed kind');
  });
});

describe('R51: the snapshots draw every kind the street draws', () => {
  it('the street map keeps every listed entity kind on a real street, and never a player, an NPC or an item', () => {
    const kept = STREET_ENTITY_KINDS.map((kind) => node({ streetEntity: kind, x: 3236, y: 1129 }));
    const player = node();
    const piggy = node();
    const item = node();
    const engine = { entityLayer: layerWith([...kept, player, piggy, item]), player, streetView: streetView(), interactables: [] };
    const ents = streetEntities(engine);
    for (const k of kept) assert.equal(ents.keep(k), true, k.streetEntity);
    for (const other of [player, piggy, item]) assert.equal(ents.keep(other), false);
    assert.deepEqual(ents.rows, ['door:809:282']);
    // The snapshot asks for them on a real street (it drew none before R51).
    assert.equal(snapshotEntities(engine).keep(kept[0]), true);
  });

  it('a live scene still keeps its own things (sceneEntities)', () => {
    const fixture = node();
    const engine = { entityLayer: layerWith([fixture]), streetView: node(), interactables: [{ classId: 'garden_new', sprite: fixture }] };
    assert.equal(snapshotEntities(engine).keep(fixture), true);
  });

  it('the snapshot draws the kept things over the view, and a door off camera too', () => {
    const view = read('public/js/ui/street-minimap.js');
    assert.match(view, /else if \(child\.culled\) set\(child, 'culled', false\);/);
    assert.match(view, /passes: \[view, layer, front\]/);
    const feature = read('public/js/features/street-minimap-feature.js');
    assert.match(feature, /entities: snapshotEntities\(engine\),/);
    // A door that comes in after the snap (the doors feature waits for the deco manifest) snaps again.
    assert.match(feature, /function syncLiveScene\(engine\) \{\n  if \(snapKey && liveKey\(engine\) !== snapKey\) requestResnap\(engine\);/);
  });

  it('the loading strip draws the street\'s entities between the view and its front layers', () => {
    const html = read('tools/loading-strips/render.html');
    assert.match(html, /const entities = buildStreetEntities\(PIXI, street, available\);/);
    const order = ['app.stage.addChild(view);', 'app.stage.addChild(entities);', 'app.stage.addChild(front);'].map((s) => html.indexOf(s));
    assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'view, entities, front');
  });
});
