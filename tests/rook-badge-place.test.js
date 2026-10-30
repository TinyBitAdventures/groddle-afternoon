/**
 * ROOKHUD (Austin 2026-10-30): the Rook attack's badge sat half under the top bar's right pill and
 * ran under the Social drawer's rail. js/rook-badge-place.js places it in the free play area
 * (Modern) or at the 2012 header centre (Classic), in view px through the live stage scale.
 * Run: node --test tests/rook-badge-place.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BADGE_PARTS, FEED_X, badgeExtent, feedZone, placeRookBadge, unionBox } from '../public/js/rook-badge-place.js?v=g479-1';
import { ZOOM_EVENT } from '../public/js/world-zoom.js?v=g486-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (p) => readFileSync(join(pub, p), 'utf8');

/** A Modern page: the three pills (44 tall, 4 down, 8 in), the drawer's inset, the pack row at the foot. */
function modern({ w, h, scale = 1, insetR = 0, insetL = 0 }) {
  const pill = (left, right) => ({ left, right, top: 4, bottom: 48 });
  return {
    view: { w: w / scale, h: (h - 132 * scale) / scale },
    scale,
    root: { w, h },
    insetR,
    insetL,
    gap: 8,
    // The bar's whole row (the feature passes .top-bar itself) and its three pills.
    blockers: [pill(8, w - 8), pill(8, 600), pill(w / 2 - 180, w / 2 + 180), pill(w - 440, w - 8)],
    floor: h - 72,
  };
}

/** The badge's whole box (stamp and feed included) in root CSS px. */
function fullBox(p, scale, mode = 'dock') {
  const e = badgeExtent(mode);
  return { left: (p.x + e.left) * scale, right: (p.x + e.right) * scale, top: (p.y + e.top) * scale, bottom: (p.y + e.bottom) * scale };
}

describe('ROOKHUD: the Rook badge in the free play area', () => {
  it('sits under the pills and left of the drawer at each size, drawer state and zoom', () => {
    for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      for (const insetR of [316, 60, 0]) {
        for (const scale of [1, w / 1000]) {
          const o = modern({ w, h, scale, insetR });
          const p = placeRookBadge(o);
          const box = fullBox(p, scale);
          const tag = `${w}x${h} inset ${insetR} scale ${scale.toFixed(2)}`;
          assert.equal(p.mode, 'dock');
          assert.ok(box.top >= 48 + 8, `${tag}: under the pills (top ${box.top})`);
          assert.ok(box.right <= w - insetR - 8 + 1, `${tag}: left of the drawer (right ${box.right})`);
          assert.ok(box.left >= 0 && box.right <= w, `${tag}: inside the view`);
          assert.ok(box.bottom + BADGE_PARTS.feedRoom * scale <= h - 72, `${tag}: above the pack`);
          // Snug: in the top right of what is free, not drifting.
          assert.ok(w - insetR - 8 - box.right < 2 * scale, `${tag}: on the free area's right edge`);
          assert.ok(box.top - 56 < 2 * scale, `${tag}: just under the bar`);
          // The core box (the zone) is the disc, stars, phase and clock in CSS px.
          assert.ok(p.box.right <= w - insetR - 8 + 1 && p.box.top >= 56 - 1, `${tag}: zone box in the free area`);
        }
      }
    }
  });

  it('the old fixed spot (VIEW_W - 70, 66) ran under the pill and the rail; the new one does not', () => {
    const o = modern({ w: 1920, h: 1080, scale: 1.5, insetR: 60 });
    const oldRight = (o.view.w - 70 + 66) * 1.5;
    const oldTop = (66 - 64) * 1.5;
    assert.ok(oldTop < 48 && oldRight > 1920 - 60, 'the report: under the pill and the rail');
    const box = fullBox(placeRookBadge(o), 1.5);
    assert.ok(box.top >= 56 && box.right <= 1920 - 68);
  });

  it('keeps clear of a left sheet, and the drawer wins when both cannot be met', () => {
    // Classic's header spot moves right of a sheet that reaches the centre.
    const c = placeRookBadge({ mode: 'header', view: { w: 1000, h: 600 }, scale: 1, root: { w: 1000, h: 732 }, insetL: 560 });
    assert.ok(c.x + badgeExtent('header').left >= 568 - 1, `right of the sheet (x ${c.x})`);
    // Modern, too narrow for both: never under the drawer.
    const p = placeRookBadge(modern({ w: 1024, h: 640, insetR: 316, insetL: 420 }));
    assert.ok(fullBox(p, 1).right <= 1024 - 316 - 8);
  });

  it('never rises into a gap between the pills: the bar row blocks', () => {
    const o = modern({ w: 1920, h: 1080, scale: 1.27, insetR: 316 });
    // The page at 1920: the right pill 1620..1912, the nameplate 780..1140.
    o.blockers = [{ left: 8, right: 1912, top: 4, bottom: 48 }, { left: 8, right: 600, top: 4, bottom: 48 }, { left: 780, right: 1140, top: 4, bottom: 48 }, { left: 1620, right: 1912, top: 4, bottom: 48 }];
    const pillsOnly = { ...o, blockers: o.blockers.slice(1) };
    // The drawer pushes the badge left of the right pill, into the gap beside the nameplate.
    assert.ok(fullBox(placeRookBadge(pillsOnly), 1.27).top < 48, 'pills alone leave the gap open');
    assert.ok(fullBox(placeRookBadge(o), 1.27).top >= 56, 'the row keeps it under the bar');
  });

  it('falls under a nameplate or GPS that hangs below the bar in its columns, and ignores ones elsewhere', () => {
    const o = modern({ w: 1280, h: 800 });
    const base = placeRookBadge(o);
    const gps = { left: 1280 - 300, right: 1280 - 8, top: 56, bottom: 100 };
    const under = placeRookBadge({ ...o, blockers: [...o.blockers, gps] });
    assert.ok(fullBox(under, 1).top >= 108, 'below the GPS');
    const far = placeRookBadge({ ...o, blockers: [...o.blockers, { left: 10, right: 200, top: 56, bottom: 300 }] });
    assert.deepEqual([far.x, far.y], [base.x, base.y]);
  });

  it('follows the canvas offset (a band above the canvas) and stays in the view when nothing fits', () => {
    const p = placeRookBadge({ view: { w: 960, h: 408 }, scale: 1, origin: { x: 0, y: 100 }, root: { w: 960, h: 640 }, blockers: [{ left: 0, right: 960, top: 4, bottom: 48 }] });
    assert.equal(p.y, -BADGE_PARTS.core.top + 8, 'the bar sits above the canvas: only the gap');
    const tiny = placeRookBadge({ view: { w: 320, h: 140 }, scale: 1, root: { w: 320, h: 140 }, insetR: 400 });
    const e = badgeExtent();
    assert.ok(tiny.x + e.left >= 0 && tiny.x + e.right <= 320 && tiny.y + e.top >= 0 && tiny.y + e.bottom <= 140);
  });

  it('Classic: the 2012 header centre, the feed centred under it, the top just under the header band', () => {
    // A Classic world view of 1000 x 600 at u = 1 under a 40 px header: #game-root starts under the band.
    const p = placeRookBadge({ mode: 'header', view: { w: 1000, h: 600 }, scale: 1, root: { w: 1000, h: 732 }, blockers: [{ left: 0, right: 1313, top: -40, bottom: 0 }], floor: 600 });
    assert.equal(p.mode, 'header');
    assert.equal(p.x, 500, 'getHeaderCenterPt: gutter + loc_vp_w / 2, the view centre');
    assert.equal(p.feedX, FEED_X.header);
    assert.equal(p.y, 8 - BADGE_PARTS.core.top, 'as near the header as the canvas reaches');
    // Scaled by u with the world.
    const big = placeRookBadge({ mode: 'header', view: { w: 1440, h: 720 }, scale: 1.2, root: { w: 1728, h: 1022 } });
    assert.equal(big.x, 720);
  });

  it('the feed zone and the union box', () => {
    const p = placeRookBadge(modern({ w: 1280, h: 800 }));
    const f = feedZone(p, 1, { x: 0, y: 0 }, 40);
    assert.equal(f.right - f.left, BADGE_PARTS.feedW);
    assert.equal(f.top, p.y + BADGE_PARTS.feedTop);
    const u = unionBox(p.box, f);
    assert.ok(u.left <= f.left && u.bottom >= f.bottom && u.top === p.box.top);
    assert.equal(unionBox(p.box, null), p.box);
  });

  it('the feature wires it: measured on a change, a notify zone released when the attack ends', () => {
    const f = read('js/features/rook-attack-feature.js');
    assert.match(f, /from '\.\.\/rook-badge-place\.js\?v=g479-1'/);
    assert.match(f, /export const ROOK_BADGE_ZONE = 'rook-badge';/);
    assert.match(f, /engine\.reserveZone\(ROOK_BADGE_ZONE, box\)/);
    assert.match(f, /reserveZone\?\.\(ROOK_BADGE_ZONE, null\)/);
    assert.match(f, /if \(!badgeDirty && key === badgeKey && badgePlace && t - badgeMeasuredAt < BADGE_REMEASURE_MS\) return;/);
    // The events it listens for are the zoom's and the skin's own names.
    assert.match(f, new RegExp(`'resize', '${ZOOM_EVENT}', 'groddle:ui-mode'`));
    assert.match(read('js/classic/ui-mode.js'), /export const UI_MODE_EVENT = 'groddle:ui-mode';/);
    assert.doesNotMatch(f, /VIEW_W - 70/);
  });

  it('the source: the client hung the rook head from its header centre', { skip: !existsSync(join(here, '../../glitch-client')) }, () => {
    const client = join(here, '../../glitch-client/com/tinyspeck/engine');
    const header = readFileSync(join(client, 'view/ui/RookIncidentHeaderView.as'), 'utf8');
    assert.match(header, /x = Math\.round\(ydm\.getHeaderCenterPt\(\)\.x\);[\s\S]{0,200}rook_head\.y = 45;/);
    assert.match(header, /msg_holder\.x = int\(-MSG_WIDTH\/2\);/);
    const ydm = readFileSync(join(client, 'view/gameoverlay/YouDisplayManager.as'), 'utf8');
    assert.match(ydm, /return new Point\(lm\.gutter_w \+ lm\.loc_vp_w\/2, lm\.header_h\);/);
  });
});
