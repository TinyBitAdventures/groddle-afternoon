/**
 * Door keys lying on their streets again (#157). Pure data and rules (no DOM/Pixi).
 *
 * The original: each keyed door's key lay on the ground of its street, or of a street near it,
 * and came back a while after someone picked it up. The December 2012 location files still list a
 * `spawner` item on every one of those streets (items/spawner.js 22-32: spawn class, interval and
 * max count), but the spawners' settings were lost (register G44b). So where each key lay comes from
 * the fan wiki (research/community/raw/glitchen/wikitext-main.json: "Key" (its "Key spawn locations"
 * table and its list of keyed doors), the street pages, "Umbra" and "The Seams") and the forum
 * (research/community/raw/glitch-forum/threads.jsonl: general/19862, general/17581); each row cites
 * its words and the street's spawner line (streets/mnt/stos/location_data/L<tsid>.xml).
 *
 * Remake rules (Austin 2026-11-09, "shared key, 5 minutes"):
 * - one key at a time on each spot, back 5 minutes after it is picked up, on every street (the wiki's
 *   times ran from 30 s to 40 min); it never piles up while nobody is there;
 * - solo: the key is an ordinary ground stack (game.js dropWorldStack, createItemStack);
 * - multiplayer: one key per spot shared by everyone on the street, held by the realtime server
 *   (groddle-afternoon-server keys.go, data/door-keys.json from tools/build-realtime-door-keys.mjs):
 *   the first to pick it up has it, it comes back 5 minutes later for everyone.
 *
 * Positions are screen space (x - bounds.l, y - bounds.t, as street.doors), the feet on the floor
 * the words name. Where the words give no spot (`at: 'ours'`) the key lies near the door or behind
 * the street's nearest tree. A door the wiki gives no key spot for gets a spot on its own street, by
 * its door (the brief's rule); `spawner: null` marks those streets, whose location file lists none.
 */

/** Austin 2026-11-09: every key comes back 5 minutes after it is picked up. */
export const KEY_RESPAWN_MS = 5 * 60 * 1000;

const W = 'wiki Key, Key spawn locations';

/**
 * One row per spot: street, its name, key id, feet x/y, the words that place it, where they come
 * from, the street's spawner line in its 2012-12 location file (null: none listed).
 */
export const KEY_SPAWNS = Object.freeze([
  // Groddle Meadow, Groddle Forest, Groddle Heights.
  { street: 'GCR12NU45AM12BB', label: 'Thornfad Layers', key: 1, x: 130, y: 1253, words: 'bottom left, partially behind column; every 10 minutes', from: `${W}; wiki Thornfad Layers`, spawner: 2942 },
  { street: 'GCR169OSLQL13JR', label: 'Rookthills Lay', key: 2, x: 3920, y: 627, words: 'Upper level, all the way to the right, in plain site on the ground', from: `${W}; wiki Rookthills Lay ("in the very upper right")`, spawner: 2011 },
  { street: 'GCR1664750O1D23', label: 'Twickenrill Grotto', key: 3, x: 1400, y: 635, words: 'upper middle, a few steps to the right of the Bonelington Hole signpost; directly above the keyed door', from: `wiki Twickenrill Grotto; ${W}`, spawner: 2457 },
  { street: 'GCRHITPKONL1T7J', label: 'Balcam Stacks', key: 3, x: 3200, y: 1233, words: 'Lower level, behind a berm just to the right of the Egg Plant on the right; every 5 minutes', from: `${W}; wiki Groddle Forest`, spawner: 1829 },
  { street: 'GCR11SBEGQL13D9', label: 'Shillrigg Tiers', key: 4, x: 300, y: 1263, words: 'Lower level, far left, slightly obscured by berm; every 4 minutes', from: `${W}; wiki Shillrigg Tiers ("in the bottom left corner"); wiki Groddle Forest`, spawner: 2063 },
  { street: 'GCR17BAC6OL11L8', label: 'Coldthorp Lam', key: 4, x: 3650, y: 1276, words: 'Bottom Right, obscured by some rock; every 5 minutes', from: `${W}; wiki Coldthorp Lam`, spawner: 1948 },
  { street: 'GCRHJHOFQNL1PHP', label: 'Newcot Close', key: 5, x: 3650, y: 1265, words: 'Lower level, right-side behind column', from: `${W}; wiki Newcot Close ("in the bottom right corner, behind a cave pillar")`, spawner: 2473 },
  // Ilmenskie Caverns and Deeps.
  { street: 'GLI107JLRU11EM2', label: 'Level 3 West', key: 7, x: 3900, y: 842, words: 'On a lower platform to the left of the right sign', from: `${W}; forum general/19862 ("in level 3 west, just to the left of the door on a lower platform")`, spawner: 1286 },
  { street: 'GM1TS65LBN12EIV', label: 'Gori Blear', key: 9, x: 300, y: 183, words: 'upper left-hand corner, accessible with Spinach', from: W, spawner: 1376 },
  { street: 'GA9DNT3I2U22RS7', label: 'Nandak Intention', key: 9, x: 4300, y: 1293, words: 'bottom right tunnel, accessible with Spinach', from: W, spawner: 1815 },
  // Jethimadh (the wiki: keys for the Tower's doors lie on the streets around it).
  { street: 'GIF15S7VPRV1DIP', label: 'Kiehiman Course', key: 1, x: 2500, y: 1069, words: 'behind small bottle tree in the middle', from: W, spawner: 1200 },
  { street: 'GIF126GSMBU1V2Q', label: 'Tadaa Track', key: 1, x: 4550, y: 934, words: 'far right, behind bottle tree root', from: W, spawner: 1456 },
  { street: 'GIF1609JRKV151E', label: 'Svarta Swale', key: 5, x: 250, y: 946, words: 'bottom of the ledges at the far left', from: W, spawner: 701 },
  { street: 'GIF1AUQNSDU1UFL', label: 'Konemaen Jaunt', key: 6, x: 4700, y: 1106, words: 'behind bottle tree on the far right', from: W, spawner: 1107 },
  { street: 'GIFNIC9JFOU1B2S', label: 'Raudan Rasp', key: 2, x: 4700, y: 1050, words: 'behind the bottle tree on the bottom, far right', from: W, spawner: 1096 },
  { street: 'GIF10O20NQU1B2P', label: 'Oulanka End', key: 2, x: 2800, y: 520, words: 'upper right side, behind cave support', from: W, spawner: 611 },
  { street: 'GIF113PVOQU1UE5', label: 'Simo Steer', key: 4, x: 1000, y: 986, words: 'Far left, behind bottle tree', from: W, spawner: 1509 },
  // Jethimadh Tower: Base.
  { street: 'GIF1Q48RM712F87', label: 'Corridor Three', key: 2, x: 3400, y: 852, words: 'behind column', from: W, spawner: 585 },
  { street: 'GIF1Q3IQM7122SP', label: 'Corridor Two', key: 1, x: 2230, y: 951, words: 'the door\'s own street (the wiki names the key, not its spot)', from: 'wiki Key, Keyed doors in Jethimadh Tower: Base', spawner: 508, at: 'ours' },
  { street: 'GTJ10K7P3812R8F', label: 'Corridor Four', key: 3, x: 1400, y: 1035, words: 'the door\'s own street, by the door to Room 8 (the wiki\'s other spot, Corridor One\'s secret room, is not built)', from: 'wiki Key, Keyed doors in Jethimadh Tower: Base', spawner: 450, at: 'ours' },
  { street: 'GTJ10M515812V0C', label: 'Corridor Five', key: 5, x: 2230, y: 951, words: 'the door\'s own street (the wiki names the key, not its spot)', from: 'wiki Key, Keyed doors in Jethimadh Tower: Base', spawner: 476, at: 'ours' },
  { street: 'GTJ110817812KO4', label: 'Corridor Six', key: 6, x: 3080, y: 1050, words: 'the door\'s own street (the wiki names the key, not its spot)', from: 'wiki Key, Keyed doors in Jethimadh Tower: Base', spawner: 322, at: 'ours' },
  // Callopee, Pollokoo, Fenneq, Tamila.
  { street: 'GNVCJKCAHCD2660', label: 'Gomen Grap', key: 9, x: 3850, y: 277, words: 'upper right corner', from: W, spawner: 1140 },
  { street: 'GDOOD6S77DD228S', label: 'Keywot Whot', key: 9, x: 3850, y: 239, words: 'upper right corner', from: W, spawner: 1091 },
  { street: 'GHFL23QTC2D21SF', label: 'Sinig Safes', key: 8, x: 1800, y: 1407, words: 'lower right, obscured by stalagmites; every 6 minutes', from: `${W}; forum general/17581 ("every 5-7 minutes or so in Sinig Safes")`, spawner: 700 },
  { street: 'GNV9O6NVFCD2SFS', label: 'Luump Yasa', key: 8, x: 1200, y: 1386, words: 'lower level', from: `${W}; forum general/19862`, spawner: 784 },
  { street: 'GA5O4SAUO5T2GEB', label: 'Dingal Lin', key: 8, x: 2000, y: 885, words: 'behind a tree in the middle of Dingal Lin in Fenneq', from: `${W}; forum general/19862 ("The blue/white key spawns on Dingal Lin in Fenneq")`, spawner: 1015 },
  { street: 'GIF1502CV8729RP', label: 'Kifti Crown', key: 8, x: 4109, y: 895, words: 'the closest key to Sheba Shales\' door (no spot given: behind the big tree)', from: 'wiki The Seams, Closest Keys', spawner: 1617, at: 'ours' },
  // Salatu, Kajuu, Cauda, Andra, Sura.
  { street: 'GIFJ9M178082JAO', label: 'Seeyam Far', key: 2, x: 200, y: 2211, words: 'bottom left of the street', from: `${W}; wiki Umbra ("found on the same street")`, spawner: 1248 },
  { street: 'GHV15B8HEQ32SN0', label: 'Kanji Sink', key: 10, x: 1250, y: 2346, words: 'bottom right corner, behind stalagmite', from: W, spawner: 1101 },
  { street: 'GUVCIGHLKKR2J0V', label: 'Pannaa Marrim', key: 10, x: 2000, y: 875, words: 'middle-left, behind plant', from: W, spawner: 986 },
  { street: 'GA513ALBNM623UJ', label: 'Bangala Bristles', key: 12, x: 300, y: 853, words: 'Far left, obscured by some grass', from: W, spawner: 1848 },
  { street: 'GA5VFMEIT8S2PPV', label: 'Dorajii Nakji', key: 5, x: 2700, y: 918, words: 'the key for Gimbap Bop\'s door, back every one to five minutes (no spot given: behind the big tree)', from: 'wiki Umbra; wiki The Seams, Closest Keys', spawner: 1147, at: 'ours' },
  // Doors whose key the wiki places nowhere: the door's own street, by the door (no spawner listed).
  { street: 'GA94GCF7H3D30IM', label: 'Doonboggle Trail', key: 1, x: 1650, y: 1393, words: 'by the door to Ethereal Endeavour', from: 'door', spawner: null, at: 'ours' },
  { street: 'GA9EBPF8M2031HB', label: 'Hauki Seeks Manor Basement', key: 1, x: 2020, y: 495, words: 'by the door', from: 'door', spawner: null, at: 'ours' },
  { street: 'GHV6HOCAH203RMF', label: 'Hakusan Heaps Towers Basement', key: 2, x: 2130, y: 497, words: 'by the door', from: 'door', spawner: null, at: 'ours' },
  { street: 'GHVEI9NVJ203LRO', label: 'Egret Taun Towers Basement', key: 3, x: 2470, y: 514, words: 'by the door', from: 'door', spawner: null, at: 'ours' },
  { street: 'GIF84CCRN203N7P', label: 'Sabudana Drama Towers Basement', key: 4, x: 980, y: 502, words: 'by the door', from: 'door', spawner: null, at: 'ours' },
  { street: 'GDONEDVHC4030KF', label: 'Gregarious Towers Basement', key: 5, x: 490, y: 506, words: 'by the door', from: 'door', spawner: null, at: 'ours' },
].map((row) => Object.freeze(row)));

/**
 * Every keyed door (the 32 in street.doors with a key_id) and the streets whose spot holds its key:
 * where the wiki says (its "Closest Keys" and key table), else the door's own street. Mazza'la
 * Gala's key lies in the Party Space itself (js/party-spaces.js); the Tower's challenge rooms hold
 * keys of their own (js/tower-challenge-rooms.js), not counted here.
 */
export const KEY_DOORS = Object.freeze([
  { street: 'GCR12NU45AM12BB', key: 1, to: "Vicar's Peak", from: ['GCR12NU45AM12BB'] },
  { street: 'GA94GCF7H3D30IM', key: 1, to: 'Ethereal Endeavour', from: ['GA94GCF7H3D30IM'] },
  { street: 'GA9EBPF8M2031HB', key: 1, to: 'Hauki Seeks Manor', from: ['GA9EBPF8M2031HB'] },
  { street: 'GIF1Q3IQM7122SP', key: 1, to: 'Room 4', from: ['GIF1Q3IQM7122SP', 'GIF15S7VPRV1DIP', 'GIF126GSMBU1V2Q'] },
  { street: 'GHV6HOCAH203RMF', key: 2, to: 'Hakusan Heaps Towers', from: ['GHV6HOCAH203RMF'] },
  { street: 'GCR169OSLQL13JR', key: 2, to: 'Martleby Hare', from: ['GCR169OSLQL13JR'] },
  { street: 'GIF1Q48RM712F87', key: 2, to: 'Corridor Four', from: ['GIF1Q48RM712F87', 'GIFNIC9JFOU1B2S', 'GIF10O20NQU1B2P'] },
  { street: 'GIFJ9M178082JAO', key: 2, to: 'Umbra', from: ['GIFJ9M178082JAO'] },
  { street: 'GTJ10K7P3812R8F', key: 3, to: 'Room 8', from: ['GTJ10K7P3812R8F'] },
  { street: 'GCR1664750O1D23', key: 3, to: 'Palindrone', from: ['GCR1664750O1D23'] },
  { street: 'GHVEI9NVJ203LRO', key: 3, to: 'Egret Taun Towers', from: ['GHVEI9NVJ203LRO'] },
  { street: 'GCRHITPKONL1T7J', key: 3, to: 'Palindrone', from: ['GCRHITPKONL1T7J', 'GCR1664750O1D23'] },
  { street: 'GCR17BAC6OL11L8', key: 4, to: 'Snool', from: ['GCR17BAC6OL11L8'] },
  { street: 'GCR11SBEGQL13D9', key: 4, to: 'Snool', from: ['GCR11SBEGQL13D9'] },
  { street: 'GTJ10K7P3812R8F', key: 4, to: 'Room 15', from: ['GIF113PVOQU1UE5'] },
  { street: 'GIF84CCRN203N7P', key: 4, to: 'Sabudana Drama Towers', from: ['GIF84CCRN203N7P'] },
  { street: 'GCRHJHOFQNL1PHP', key: 5, to: 'Wintry Place', from: ['GCRHJHOFQNL1PHP'] },
  { street: 'GTJ10M515812V0C', key: 5, to: 'Room 23', from: ['GTJ10M515812V0C', 'GIF1609JRKV151E'] },
  { street: 'GA54VETILKR26N1', key: 5, to: 'Umbra', from: ['GA5VFMEIT8S2PPV'] },
  { street: 'GDONEDVHC4030KF', key: 5, to: 'Gregarious Towers', from: ['GDONEDVHC4030KF'] },
  { street: 'GTJ110817812KO4', key: 6, to: 'Room 16', from: ['GTJ110817812KO4', 'GIF1AUQNSDU1UFL'] },
  { street: 'GHH1011JSO11ORS', key: 7, to: 'Oppidan Avenue', from: ['GLI107JLRU11EM2'] },
  { street: 'GDO5CC4R1FD2SQG', key: 8, to: 'Kristel Kaos', from: ['GNV9O6NVFCD2SFS'] },
  { street: 'GHFKT1LK83D2BAF', key: 8, to: 'Kristel Kaos', from: ['GHFL23QTC2D21SF'] },
  { street: 'GA55B5RDL7T2F00', key: 8, to: 'Autumn Lodge', from: ['GA5O4SAUO5T2GEB'] },
  { street: 'GIF16CPE89723EI', key: 8, to: 'Autumn Lodge', from: ['GIF1502CV8729RP'] },
  { street: 'GDO1OPGDSCD29NF', key: 9, to: 'Neva Neva', from: ['GNVCJKCAHCD2660', 'GDOOD6S77DD228S'] },
  { street: 'GA9B6PJ3NM22M0D', key: 9, to: 'Ajaya Bliss', from: ['GM1TS65LBN12EIV', 'GA9DNT3I2U22RS7'] },
  { street: 'GUVQCRVPBKR2T5H', key: 10, to: 'Oppidan Avenue', from: ['GUVCIGHLKKR2J0V'] },
  { street: 'GHV15B8HEQ32SN0', key: 10, to: 'Plexus', from: ['GHV15B8HEQ32SN0'] },
  { street: 'GDOE67MFL6E2FBR', key: 11, to: "Mazza'la Gala", from: [], partySpace: true },
  { street: 'GA5DVVGJQQ5237U', key: 12, to: 'Plexus', from: ['GA513ALBNM623UJ'] },
].map((row) => Object.freeze(row)));

/** The spots on a street, each with its index in KEY_SPAWNS (the id the server shares). */
export function keySpawnsOn(street) {
  const out = [];
  KEY_SPAWNS.forEach((row, i) => {
    if (row.street === street) out.push({ ...row, i });
  });
  return out;
}

/** The spot ids: index in KEY_SPAWNS (the server's data keeps the same order). */
export function keySpotId(i) {
  return `dkey-${Number(i)}`;
}

const SPOT_ID = /^dkey-(\d{1,3})$/;
export function keySpotIndex(id) {
  const m = SPOT_ID.exec(String(id || ''));
  if (!m) return -1;
  const i = Number(m[1]);
  return i < KEY_SPAWNS.length ? i : -1;
}

/** Solo state: per spot index, the ground stack lying there now and when the last one was taken. */
export function normalizeKeySpawnState(raw = {}) {
  const spots = {};
  const src = raw && typeof raw === 'object' && raw.spots && typeof raw.spots === 'object' ? raw.spots : {};
  for (const [k, v] of Object.entries(src)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= KEY_SPAWNS.length || !v || typeof v !== 'object') continue;
    const stack = typeof v.stack === 'string' ? v.stack.slice(0, 64) : '';
    const takenAt = Number.isFinite(v.takenAt) && v.takenAt > 0 ? Math.floor(v.takenAt) : 0;
    if (stack || takenAt) spots[i] = { stack, takenAt };
  }
  return { spots };
}

/**
 * What a solo spot needs now: 'lie' (the key is on the ground), 'taken' (the stack it put down is
 * gone: record the pickup), 'drop' (put one down: first visit, or the respawn has run out),
 * 'wait' (taken, not back yet).
 * @param {{stack?: string, takenAt?: number}|undefined} spot
 * @param {{ present: boolean, now: number, respawnMs?: number }} ctx present: spot.stack is still on the ground
 */
export function soloKeyStep(spot, { present, now, respawnMs = KEY_RESPAWN_MS }) {
  if (spot?.stack) return present ? 'lie' : 'taken';
  const takenAt = Number(spot?.takenAt) || 0;
  if (!takenAt || now - takenAt >= respawnMs) return 'drop';
  return 'wait';
}

/** Milliseconds until a taken spot's key is back (0 when it is due). */
export function keyBackIn(spot, now, respawnMs = KEY_RESPAWN_MS) {
  const takenAt = Number(spot?.takenAt) || 0;
  if (!takenAt || spot?.stack) return 0;
  return Math.max(0, takenAt + respawnMs - now);
}
