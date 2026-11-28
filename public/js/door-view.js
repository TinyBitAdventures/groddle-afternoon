/**
 * A street door as the street draws it (client DoorView: the door's deco at its source rect,
 * feet on the floor), shared by the game (features/doors-feature.js, which adds it to the entity
 * layer and makes it a door you can enter) and the street's snapshots (R51: js/street-render.js
 * buildStreetEntities, which the loading strip draws; the street map snaps the game's own sprite).
 *
 * - Its recovered deco (assets/decos/groddle, CoU _png-2x), or art rendered at the door's own size
 *   (`src`), or a plain drawn door when the art was never recovered.
 * - A locked door shows only its key's keyhole (the deco's showLock(key_id), DoorView.as 243-244);
 *   any other door of a lock deco shows neither chains nor keyholes (hideLock(), 245-247).
 * - A house shows its For Sale sign only while it is for sale (the deco's `sign`, DoorView.as 228-232).
 */
import { drawnDoorStyle } from './doors.js?v=f815e7c8';
import { isLoaded, onLoaded, textureFromUrl } from './textures.js?v=8bb43102';
import { doorLockArt } from './door-lock-art.js?v=e656851c';
import { doorSaleArt } from './door-sign-art.js?v=69daffff';
import { anchorBottomCentre } from './sprite-feet.js?v=1c6452d9';

export const DOOR_DECO_BASE = 'assets/decos/groddle/';
/** Doors stand at this zIndex among the street's things (the entity layer). */
export const DOOR_Z = 3;

/** A plain door drawn in a canvas, for a door whose art was never recovered. */
function drawnDoorTexture(PIXI, door) {
  const w = Math.max(24, Math.round(door.w || 60));
  const h = Math.max(40, Math.round(door.h || 110));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const style = drawnDoorStyle(door.sprite);
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const r = Math.min(w / 2, h / 3);
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, r);
  g.arc(w / 2, r, w / 2, Math.PI, 0);
  g.lineTo(w, h);
  g.closePath();
  g.fillStyle = hex(style.frame);
  g.fill();
  const inset = Math.max(4, Math.round(w * 0.08));
  g.beginPath();
  g.moveTo(inset, h);
  g.lineTo(inset, r + inset * 0.3);
  g.arc(w / 2, r + inset * 0.3, w / 2 - inset, Math.PI, 0);
  g.lineTo(w - inset, h);
  g.closePath();
  g.fillStyle = hex(style.fill);
  g.fill();
  if (style.kind === 'door') {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = Math.max(1, w * 0.02);
    for (const fx of [0.36, 0.64]) {
      g.beginPath();
      g.moveTo(w * fx, r + inset);
      g.lineTo(w * fx, h - inset);
      g.stroke();
    }
    g.fillStyle = '#e8cf7a';
    g.beginPath();
    g.arc(w * 0.74, h * 0.58, Math.max(2, w * 0.05), 0, Math.PI * 2);
    g.fill();
  }
  return PIXI.Texture.from(canvas);
}

function applyRect(sprite, door) {
  if (door.w > 0) sprite.width = door.w;
  if (door.h > 0) sprite.height = door.h;
  if (door.flip) sprite.scale.x = -Math.abs(sprite.scale.x);
}

/**
 * PURE: which art a door draws: 'src' (its own rendered art), 'lock', 'sale', 'deco' or 'drawn',
 * and the url (null for a drawn door). `available` is the deco manifest (a Set of names).
 */
export function doorArt(door, available = new Set()) {
  if (door?.src) return { art: 'src', url: door.src };
  const hasArt = Boolean(door?.sprite && available.has(door.sprite));
  if (!hasArt) return { art: 'drawn', url: null };
  const lockKey = door.key_id && door.is_locked !== false ? door.key_id : 0;
  const lock = doorLockArt(door.sprite, lockKey);
  if (lock) return { art: 'lock', url: lock };
  const sale = door.for_sale ? doorSaleArt(door.sprite) : null;
  if (sale) return { art: 'sale', url: sale };
  return { art: 'deco', url: `${DOOR_DECO_BASE}${door.sprite}.png` };
}

/** The door's sprite at its place (street px, feet at door.x, door.y), and which art it drew. */
export function buildDoorSprite(PIXI, door, available = new Set()) {
  const { art, url } = doorArt(door, available);
  const tex = url ? textureFromUrl(url) : drawnDoorTexture(PIXI, door);
  const sprite = new PIXI.Sprite(tex);
  anchorBottomCentre(sprite, 'deco');
  sprite.x = door.x;
  sprite.y = door.y;
  sprite.rotation = ((Number(door.r) || 0) * Math.PI) / 180;
  sprite.zIndex = DOOR_Z;
  sprite.roundPixels = true;
  // R51: one of the street's own things, which its snapshots draw (js/street-render.js STREET_DRAWN).
  sprite.streetEntity = 'door';
  applyRect(sprite, door);
  if (tex.source && !isLoaded(tex.source)) onLoaded(tex.source, () => !sprite.destroyed && applyRect(sprite, door));
  return { sprite, art: art === 'src' ? 'deco' : art };
}
