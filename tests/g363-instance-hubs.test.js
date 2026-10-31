/**
 * Austin's 2026-10-28 decisions (register G363, G352, G318):
 * - G363: no hub line inside a quest room or any other instance (GSJS
 *   locations/location.js 3311 sends hub_name '' for an instance; the
 *   client's location bar then drew the street name alone).
 * - G352: the two caption lines read off players' snaps, placed as the
 *   source's deco sign text (one-off approval).
 * - G318: the light-perspective room's signs (one-off approval).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const game = read('game.js');
const gsjs = join(here, '../../glitch-GameServerJS');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');

describe('G363: instances show no hub line', () => {
  it('the source sends an instance no hub name', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const loc = readFileSync(join(gsjs, 'locations/location.js'), 'utf8');
    assert.match(loc, /hub_name: is_instance \? '' : config\.data_maps\.hubs\[this\.hubid\]/);
    // Room 23 is a tower_quest instance: its Sentry talks only there.
    assert.match(readFileSync(join(gsjs, 'items/npc_widget.js'), 'utf8'), /this\.container\.isInstance\('tower_quest'\)/);
  });

  it('the client location bar names the street alone', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const ui = readFileSync(join(client, 'view/ui/map/CurrentLocationUI.as'), 'utf8');
    assert.match(ui, /tf_txt \+= StringUtil\.truncate\(model\.worldModel\.location\.label, MAX_CHARS\);/);
  });

  it('quest rooms: the card and the bar have no hub, whatever a room names', () => {
    const qi = read('js/features/quest-instances-feature.js');
    assert.match(qi, /async function withTransition\(engine, label, theme, work\) \{[\s\S]{0,400}?toHub: '',/);
    assert.match(qi, /\/\/ G363: an instance has no hub line \(location\.js 3311\), whatever the room names\.\s*hubName: '',/);
    assert.match(qi, /street\.hubName = '';/);
    assert.doesNotMatch(qi, /room\.hubName \|\| 'Quest'/);
    assert.match(qi, /\n  [a-z_]+: \(\) => import\('\.\.\/quest-rooms\/[a-z-]+\.js\?v=[0-9a-f]{8}'\),\n/);
  });

  it('game.js scenes that are instances carry no hub', () => {
    for (const s of [
      "Mr. Block's Playroom · Quest", "Rooks' Woods · Quest", 'Museum of the Rook · Jethimadh Tower',
      'Eesti Life Catalogue Page 17 · Eesti Life Catalog', '· Ticket to Paradise', 'The Greedy Street Spirit · Storyland',
      "hubName: 'Instance'", "toHub: 'Quest'", "toHub: 'Ticket to Paradise'", "hub: 'Quest'",
    ]) assert.ok(!game.includes(s), s);
    assert.match(game, /return \{ street: 'Winter Walk', hub: '' \};/);
    assert.match(game, /return \{ street: 'A Summer’s Day', hub: '' \};/);
    // A feature's '' is kept, not replaced by the index hub.
    assert.match(game, /const toHub = featureLabel\?\.hub \?\? winterLabel\?\.hub \?\?/);
    // Real streets keep theirs (the G186 bar line is unchanged).
    assert.match(game, /: currentStreet\.hubName \|\| ''\);\s+streetEl\.textContent = hubLabel \? `\$\{streetLabel\} · \$\{hubLabel\}` : streetLabel;/);
  });

  it('feature instances answer labelFor with no hub', async () => {
    const { gwendolynRoom23Feature } = await import('../public/js/features/gwendolyn-room-23-feature.js?v=83aa69ca');
    assert.deepEqual(gwendolynRoom23Feature.labelFor('GCR8MORFJI12IR4'), { street: 'Room 23', hub: '', hubId: '79' });
    assert.equal(gwendolynRoom23Feature.labelFor('GTJ10M515812V0C'), null, 'Corridor Five keeps its hub');
    const street = { tsid: 'GCR8MORFJI12IR4', hubName: 'Tower Quest' };
    gwendolynRoom23Feature.prepareStreet(street);
    assert.equal(street.hubName, '');
    assert.match(read('js/features/purple-journey-feature.js'), /\{ street: VOYAGE_LABEL, hub: '', hubId: 'scene' \}/);
    assert.match(read('js/features/hog-haul-mp-feature.js'), /\{ street: HOG_MP_TEXT\.title, hub: '', hubId: 'scene' \}/);
    assert.match(read('js/features/party-spaces-feature.js'), /street\.hubName = ''; \/\/ G363/);
  });
});

describe('G352: the two snap captions (Austin 2026-10-28: one-off approval)', () => {
  it('Being Watched places its caption as the snap shows it', async () => {
    const src = read('js/quest-rooms/being-watched.js');
    assert.match(src, /Flickr 8270858639/);
    assert.match(src, /Austin 2026-10-28: one-off approval/);
    const { CAPTION, FLOOR } = await import('../public/js/quest-rooms/being-watched.js?v=55341016');
    assert.equal(CAPTION.text, "Ever feel like you're being watched?");
    assert.ok(CAPTION.y < FLOOR && FLOOR - CAPTION.y <= 220);
    assert.match(src, /world\.addChild\(kit\.label\(PIXI, CAPTION\.text, CAPTION\.x, CAPTION\.y, \{ size: 17, fill: 0xffffff/);
  });

  it('Winter Walk places its four lines beside the hollow tree past the camp', async () => {
    const src = read('js/winter-walk-streets.js');
    assert.match(src, /Flickr 8264519059/);
    assert.match(src, /Flickr 8273330942/);
    assert.match(src, /Austin 2026-10-28: one-off approval/);
    const { WINTER_WALK_CAPTION, WINTER_WALK_CAMP, WINTER_WALK_FLOOR_Y, WINTER_WALK_BOUNDS } = await import('../public/js/winter-walk-streets.js?v=615549da');
    assert.equal(WINTER_WALK_CAPTION.lines.join(' '), 'Have you ever heard the ding-a-ling-ling sound icicles make when you tappity-tap them?');
    assert.ok(WINTER_WALK_CAPTION.x > WINTER_WALK_CAMP.tent && WINTER_WALK_CAPTION.x < WINTER_WALK_BOUNDS.r);
    assert.ok(WINTER_WALK_CAPTION.y < WINTER_WALK_FLOOR_Y);
    const feat = read('js/features/rebuilt-rooms-feature.js');
    assert.match(feat, /if \(street\?\.tsid === WINTER_WALK_TSID\) drawCaption\(engine\);/);
    assert.match(feat, /winter-walk-streets\.js\?v=[0-9a-f]{8}/);
  });

  it('the client drew deco sign text at the deco, in the street', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const dr = readFileSync(join(client, 'view/renderer/DecoRenderer.as'), 'utf8');
    assert.match(dr, /_tf\.htmlText = '<p class="'\+_deco\.sign_css_class\+'">'\+_deco\.sign_txt\+'<\/p>';/);
  });

  it('no em-dashes in the captions', async () => {
    const { CAPTION } = await import('../public/js/quest-rooms/being-watched.js?v=55341016');
    const { WINTER_WALK_CAPTION } = await import('../public/js/winter-walk-streets.js?v=615549da');
    assert.ok(!/[—–]/.test(CAPTION.text + WINTER_WALK_CAPTION.lines.join('')));
  });
});

describe('G318: the light-perspective signs (one-off approval)', () => {
  it('their comment records the approval and the footage', () => {
    const src = read('js/quest-rooms/light-perspective.js');
    assert.match(src, /Austin 2026-10-28: one-off approval \(footage Et0RkY43A5Q\)/);
  });
});
