/**
 * Build the sound-key catalog from Tiny Speck's GameServerJS and Flash client.
 *
 * Reads:
 *   glitch-GameServerJS/**.js   announce_sound*('KEY'), sound: 'KEY', use_sound,
 *                               class-named tool/musicblock sounds, music_map
 *   glitch-client/**.as         SoundMaster.playSound('KEY'), sound_id = 'KEY',
 *                               tween onStartParams:['KEY']
 *
 * Writes:
 *   public/assets/content/sound-keys.json   every key: category, in-game moment,
 *                                           source call sites, CDN url, local file
 *   public/js/sound-keys.js                 small ES module: recovered files,
 *                                           aliases, and counts for the runtime
 *
 * The production sounds XML (c2.glitch.bz/sounds/2012-12/sounds_1354665929.xml)
 * that mapped SFX keys to files is not archived, so CDN urls are only known for
 * music_map keys and for the files recovered by name from the Wayback CDX index
 * (see RECOVERED). Everything else gets a Web Audio recipe in js/synth-sfx.js.
 *
 * Run from spike root:
 *   node build-sound-keys.mjs
 */

import vm from 'node:vm';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(process.env.HOME || '', 'Documents/glitch-audit');
const GSJS = process.env.GLITCH_GSJS || join(AUDIT, 'glitch-GameServerJS');
const CLIENT = process.env.GLITCH_CLIENT || join(AUDIT, 'glitch-client');
const OUT_JSON = join(root, 'public/assets/content/sound-keys.json');
const OUT_JS = join(root, 'public/js/sound-keys.js');
const PUBLIC = join(root, 'public');

/**
 * Files recovered from the Wayback CDX index of c2.glitch.bz/sounds/ (38
 * captures, all from a 2023-03 crawl). Keys come from music_map where the url
 * matches exactly, from GSJS where the filename names the key (HARVEST,
 * PETRIFIED_ROCK, STEWARTDOLL1-14), and otherwise from the filename itself.
 */
const C2 = 'http://c2.glitch.bz/sounds/';
const RECOVERED = {
  HERE_YOU_GO_LIGHTER: { url: `${C2}2010-05/here_you_go_lighter.mp3`, keyFrom: 'filename' },
  FIREFLY_WHISTLE_1: { url: `${C2}2011-01/1296255471-Firefly_Whistle_1.3.mp3`, keyFrom: 'music_map' },
  FIREFLY_WHISTLE_2: { url: `${C2}2011-01/1296255489-Firefly_Whistle_2.2.mp3`, keyFrom: 'music_map' },
  FIREFLY_WHISTLE_3: { url: `${C2}2011-01/1296255520-Firefly_Whistle_3.3.mp3`, keyFrom: 'music_map' },
  MOONWALK: { url: `${C2}2011-09/1316194089-Moonwalk_1.1.mp3`, keyFrom: 'music_map' },
  TOXIC_MOON: { url: `${C2}2011-11/1322689572-Also_Sprach_Zarathustra_Loop_3.2_fades.mp3`, keyFrom: 'music_map' },
  HARVEST: { url: `${C2}2012-03/1333032669-Harvest_2.1.mp3`, keyFrom: 'gsjs-filename' },
  WATER_SPLASH: { url: `${C2}2012-06/1339778251-Water_Splash_1.1.mp3`, keyFrom: 'filename' },
  CLOUD_DROP_2: { url: `${C2}2012-06/1340390601-Rainbow_Run_A_Capella_8s_2.3.mp3`, keyFrom: 'music_map' },
  CLOUD_DROP_2_INTRO: { url: `${C2}2012-06/1340390619-Rainbow_Run_A_Cappella_Intro_1.1.mp3`, keyFrom: 'music_map' },
  PIANO_THEME1: { url: `${C2}2012-07/1341549958-Dreamy_Theme_Loop_1.1.mp3`, keyFrom: 'music_map' },
  BW_A1: { url: `${C2}2012-08/1346434794-BW_A1.mp3`, keyFrom: 'filename' },
  BW_C2: { url: `${C2}2012-08/1346434795-BW_C2.mp3`, keyFrom: 'filename' },
  BW_D2: { url: `${C2}2012-08/1346434795-BW_D2.mp3`, keyFrom: 'filename' },
  BW_E2: { url: `${C2}2012-08/1346434795-BW_E2.mp3`, keyFrom: 'filename' },
  BW_G2: { url: `${C2}2012-08/1346434796-BW_G2.mp3`, keyFrom: 'filename' },
  AMBIENT_WATERFALL: { url: `${C2}2012-09/1346892406-Waterfall_Background_1.1.mp3`, keyFrom: 'music_map' },
  AMBIENT_WATERFALL_LEVEL3: { url: `${C2}2012-09/1347325991-Waterfall_Background_No_Gurgle_1.1.mp3`, keyFrom: 'music_map' },
  ROCKS_DISAPPEAR: { url: `${C2}2012-09/1347481186-Rocks_Disappear_2.2.mp3`, keyFrom: 'filename' },
  WATERFALL_SUCCESS: { url: `${C2}2012-09/1347572925-Waterfall_3.3_more_throaght.mp3`, keyFrom: 'music_map' },
  CONCH: { url: `${C2}2012-09/1347572925-Waterfall_For_Conch_1.1.mp3`, keyFrom: 'music_map' },
  WATERFALL_SYMBOL_GLOW: { url: `${C2}2012-09/1347576005-Waterfall_Symbol_Glow_1.1.mp3`, keyFrom: 'filename' },
  PETRIFIED_ROCK: { url: `${C2}2012-10/1350083646-Petrified_Rock_1.1.mp3`, keyFrom: 'gsjs-filename' },
  AUTUMN_DAY: { url: `${C2}2012-10/1350096123-Autumn_Day_2.5.mp3`, keyFrom: 'music_map' },
};
const DOLL_STAMPS = [578, 578, 578, 579, 579, 579, 579, 580, 580, 580, 698, 698, 698, 699];
DOLL_STAMPS.forEach((stamp, i) => {
  RECOVERED[`STEWARTDOLL${i + 1}`] = { url: `${C2}2012-11/1353539${stamp}-Stewart_Doll_${i + 1}.mp3`, keyFrom: 'gsjs-filename' };
});
for (const [key, row] of Object.entries(RECOVERED)) {
  row.file = `assets/audio/sfx/${key}.mp3`;
  row.origin = 'wayback-c2';
}

/**
 * Tiny Speck's public downloads page (ringtones and alerts, c1.glitch.bz/misc)
 * published a few named SFX. Their production keys are not recorded, so these
 * are best-fit assignments by name.
 */
const DOWNLOADS = {
  QUEST_COMPLETE: { file: 'assets/audio/quest_complete.mp3', name: 'quest_complete.mp3', fit: 'exact name' },
  TRIPLE_JUMP: { file: 'assets/audio/triple_jump.mp3', name: 'triple_jump.mp3', fit: 'exact name' },
  SLOTH_ARRIVES: { file: 'assets/audio/sloth_arrives.mp3', name: 'sloth_arrives.mp3', fit: 'exact name' },
  LEVEL_UP: { file: 'assets/audio/level_up_kazoo.mp3', name: 'level_up_kazoo.mp3', fit: 'Level Up Kazoo' },
  DISCOVER_USEFUL_NEW_ITEM: { file: 'assets/audio/discover_new_item.mp3', name: 'discover_new_item.mp3', fit: 'Discover New Item' },
  QUORAZY_QUOIN: { file: 'assets/audio/qurazy_quoin.mp3', name: 'qurazy_quoin.mp3', fit: 'Quarazy Quoin' },
  QUEST_ADDED: { file: 'assets/audio/new_quest_alert.mp3', name: 'new_quest_alert.mp3', fit: 'New Quest Alert' },
  CLIENT_LOADED: { file: 'assets/audio/game_loaded.mp3', name: 'game_loaded.mp3', fit: 'Game Loaded' },
  STREET_LOADED: { file: 'assets/audio/game_loaded_2.mp3', name: 'game_loaded_2.mp3', fit: 'Game Loaded (second take)' },
  CAULDRON: { file: 'assets/audio/cauldron.mp3', name: 'cauldron.mp3', fit: 'Cauldron (tool class sound)' },
  TINCTURING_KIT: { file: 'assets/audio/tincture.mp3', name: 'tincture.mp3', fit: 'Tincture (tool class sound)' },
  IMAGINATION_PURCHASE: { file: 'assets/audio/imagination_upgrade.mp3', name: 'imagination_upgrade.mp3', fit: 'Imagination Upgrade' },
  FLITTERBUG_COLLISION: { file: 'assets/audio/flitterbug_collision.mp3', name: 'flitterbug_collision.mp3', fit: 'Flitterbug Collision' },
  PIGGY_PLOP: { file: 'assets/audio/piggy_plop.mp3', name: 'piggy_plop.mp3', fit: 'Piggy Plop' },
  SPINNING_WHEEL: { file: 'assets/audio/ambient/Spinning-Wheel_1292034939.mp3', name: 'Spinning-Wheel_1292034939.mp3', fit: 'Spinning Wheel' },
  METALMAKER: { file: 'assets/audio/ambient/metalmaker_1344997841.mp3', name: 'metalmaker_1344997841.mp3', fit: 'metalmaker (music_map METALMAKER)' },
  NEWDAY: { file: 'assets/audio/new_day_fanfare.mp3', name: 'new_day_fanfare.mp3', fit: 'stand-in fanfare until the rooster is recovered' },
};

/** Keys that borrow another key's recovered file (best fit, documented). */
const ALIASES = {
  ITEM_GIVE: 'HERE_YOU_GO_LIGHTER',
  ITEM_GIVEN_TO_YOU: 'HERE_YOU_GO_LIGHTER',
  PET_PIGGY: 'PIGGY_PLOP',
};

/** Hand-written in-game moments for the keys the remake plays. */
const MOMENTS = {
  CLICK_SUCCESS: 'Any enabled button in a dialog (client UI)',
  CLICK_FAILURE: 'A disabled button, or a verb that cannot run (garden, trants)',
  OPEN_HUB_MAP: 'Map opens',
  CLOSE_HUB_MAP: 'Map closes',
  QUEST_DIALOGUE_BOX: 'Quest log opens',
  QUEST_DIALOGUE_BOX_CLOSE: 'Quest log closes',
  IMAGINATION_OPEN: 'Imagination menu opens (remake: skills panel)',
  IMAGINATION_CLOSE: 'Imagination menu closes',
  QUEST_ADDED: 'A new quest lands in the quest log',
  COMPLETE_QUEST_REQUIREMENT: 'One quest requirement is met',
  QUEST_COMPLETE: 'Quest complete overlay',
  LEVEL_UP: 'Level up overlay',
  ACHIEVEMENT_UNLOCKED: 'Badge earned overlay',
  SKILL_ACHIEVED: 'A skill finishes learning',
  BEGIN_LEARNING_SKILL: 'Start learning a skill',
  DISCOVER_USEFUL_NEW_ITEM: 'First time an item class enters the pack',
  ITEM_PICKUP: 'Pick up an item from the street',
  ITEM_DROP: 'Drop an item on the street',
  ITEM_GIVE: 'Give an item to another player',
  ITEM_GIVEN_TO_YOU: 'Someone gives you an item',
  PACK_FULL: 'Pickup refused: pack is full',
  ITEM_EAT: 'Eat a food item',
  ITEM_DRINK: 'Drink a drink item',
  BURP: 'Overeating burp',
  QUOIN_GOT: 'Touch a quoin (all types)',
  QUORAZY_QUOIN: 'Touch a Qurazy quoin',
  TRIPLE_JUMP: 'Third jump of a Triple Jump chain',
  NEWDAY: 'A new game day begins',
  PET_PIGGY: 'Pet a Piggy',
  NIBBLE_PIGGY: 'Nibble a Piggy',
  FEED_PIGGY: 'Feed a Piggy',
  RECEIVE_MEAT_FROM_PIGGY: 'Meat drops from a nibbled Piggy',
  PIGGY_SCOFFS: 'Piggy refuses food',
  CHICKEN_SQUEEZED: 'Squeeze a Chicken',
  HAPPY_CHICKEN: 'Chicken is happy after care',
  BUTTERFLY_SING: 'Sing to / milk a Butterfly',
  PET_TRANT: 'Pet a trant (any tree)',
  HARVEST: 'Harvest a trant or Wood Tree',
  WATERING_CAN: 'Water a trant or garden plot',
  HOE: 'Hoe a garden plot',
  PICK: 'Mining with a Pick (looped while the action runs)',
  FANCY_PICK: 'Mining with a Fancy Pick (looped)',
  HATCHET: 'Chopping a Wood Tree with a Hatchet (looped)',
  TOOL_BREAKS: 'A tool wears out',
  TINKERTOOL: 'Repair a tool with the Tinkertool',
  PURCHASE_ITEM: 'Buy from a vendor or furniture store',
  DONATE_TO_SHRINE: 'Donate to a Giant shrine',
  DONATION_RECIEVE_EMBLEM: 'Shrine favor fills: emblem',
  HAS_MAIL: 'Mailbox has new mail',
  INTERACT_MAILBOX: 'Open the mailbox',
  MAILBOX_ALL_DONE: 'Mailbox emptied',
  PACKAGE_SENT: 'Send a mail package',
  DOOR_OPEN: 'Walk through a door (client)',
  DOOR_CLOSE: 'Door closes behind you, 600 ms after entering (client)',
  STREET_LOADED: 'A street finishes loading',
  CLIENT_LOADED: 'Game loaded',
  TELEPORT_AWAY: 'Teleport away (Teleportation skill)',
  TELEPORT_AWAY_HUB: 'Teleport to a hub',
  SQUISH_GRAPES: 'Squish grapes in Hell',
  CROAK: 'Your Glitch croaks (energy hits zero)',
  SPINNING_WHEEL: 'Gameshow Ticket wheel spins',
  STEWARTDOLL1: 'Stoot pull-string doll line 1 (quotes 29-42 map to STEWARTDOLL1-14)',
  COUNT_DOWN: 'Race / Game of Crowns countdown',
  READY: 'Race ready',
  YOU_WIN: 'Win a race or game',
  YOU_LOSE: 'Lose a race or game',
  CROWN_CHANGES_HANDS: 'Game of Crowns: crown changes hands',
  YOU_TAKE_CROWN: 'Game of Crowns: you take the crown',
  YOU_LOSE_CROWN: 'Game of Crowns: you lose the crown',
  SLOTH_ARRIVES: 'A sloth arrives on the street',
  HI_FLOWERS: 'Hi signs thrown between players',
  FLIP_BACK: 'Imagination card flips back',
  FLIP_OVER: 'Imagination card flips over',
  HERE_YOU_GO_LIGHTER: 'Recovered c2 file with no surviving key; a "here you go" hand-over, so ITEM_GIVE and ITEM_GIVEN_TO_YOU borrow it',
  WATER_SPLASH: 'Recovered c2 file with no surviving key; a water splash (2012-06, the Paradise / Summer\'s Day era)',
  BW_A1: 'Recovered c2 bell note (2012-08 waterfall puzzle bells, Blue & White set)',
  BW_C2: 'Recovered c2 bell note (2012-08 waterfall puzzle bells, Blue & White set)',
  BW_D2: 'Recovered c2 bell note (2012-08 waterfall puzzle bells, Blue & White set)',
  BW_E2: 'Recovered c2 bell note (2012-08 waterfall puzzle bells, Blue & White set)',
  BW_G2: 'Recovered c2 bell note (2012-08 waterfall puzzle bells, Blue & White set)',
  ROCKS_DISAPPEAR: 'Recovered c2 file with no surviving key; rocks vanish in the 2012-09 waterfall puzzle',
  WATERFALL_SYMBOL_GLOW: 'Recovered c2 file with no surviving key; a waterfall puzzle symbol lights up',
  PETRIFIED_ROCK: 'Mine a petrified rock (remake: a rock mining action finishes)',
};

function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

function contextName(lines, index) {
  for (let i = index; i >= 0 && i > index - 400; i -= 1) {
    const line = lines[i];
    let m = line.match(/^\s*(?:public |private |protected |override |static )*function\s+([A-Za-z0-9_]+)/);
    if (m) return m[1];
    m = line.match(/verbs\[['"]([a-z0-9_]+)['"]\]\s*=/);
    if (m) return `verb ${m[1]}`;
  }
  return '';
}

const keys = new Map();
function note(key, { category = '', where, context = '', via }) {
  if (!key || !/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) return;
  const row = keys.get(key) || { key, category, uses: 0, sources: [], via: new Set() };
  row.uses += 1;
  row.via.add(via);
  if (category && !row.category) row.category = category;
  if (row.sources.length < 6) row.sources.push(context ? `${where} (${context})` : where);
  keys.set(key, row);
}

// —— GSJS ——
const gsjsFiles = walk(GSJS, '.js');
const toolFiles = new Set();
const PATTERNS = [
  { re: /announce_sound(?:_to_all|_delayed)?\(\s*['"]([A-Za-z0-9_]+)['"]/g, via: 'announce_sound' },
  { re: /\bsound\w*['"]?\s*[:=]\s*['"]([A-Z][A-Z0-9_]+)['"]/g, via: 'sound field' },
];
for (const file of gsjsFiles) {
  const rel = relative(GSJS, file);
  if (rel === 'inc_data_sounds.js') continue;
  const text = readFileSync(file, 'utf8');
  if (!/sound/i.test(text)) continue;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const { re, via } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        let key = m[1];
        if (/_$/.test(key)) continue; // concatenated families are expanded below
        note(key, { where: `gsjs:${rel}:${i + 1}`, context: contextName(lines, i), via });
      }
    }
  });
  if (/announce_sound\('TOOL_BREAKS'/.test(text) && rel.startsWith('items/')) toolFiles.add(rel);
}
// Concatenated families.
for (let n = 2; n <= 9; n += 1) note(`QUOIN_SHARD_${n}`, { where: 'gsjs:items/quoin.js:94', context: 'onPlayerCollision (shared quoin)', via: 'family' });
for (let n = 1; n <= 3; n += 1) note(`FIREFLY_WHISTLE_${n}`, { where: 'gsjs:items/firefly_jar.js:204', context: 'whistle', via: 'family' });
// Tools announce their own class name while a skill package or making job runs
// (players/inc_skill_packages.js:388, players/inc_making.js:478, items/include/jobs.js:308).
for (const rel of toolFiles) {
  const cls = rel.replace(/^items\//, '').replace(/\.js$/, '');
  note(cls.toUpperCase(), { category: 'tool', where: `gsjs:${rel}`, context: 'tool class sound while working', via: 'tool class' });
}
// Musicblocks and the conch announce their own class name on play.
for (const rel of gsjsFiles.map((f) => relative(GSJS, f))) {
  const m = rel.match(/^items\/(musicblock_[a-z0-9_]+|conch)\.js$/);
  if (m) note(m[1].toUpperCase(), { category: 'music', where: `gsjs:${rel}`, context: 'play', via: 'class sound' });
}
// Powders carry use_sound class props.
for (const file of gsjsFiles) {
  const text = readFileSync(file, 'utf8');
  const m = text.match(/"use_sound"\s*:\s*"([A-Z0-9_]+)"/);
  if (m) note(m[1], { category: 'powder', where: `gsjs:${relative(GSJS, file)}`, context: 'use_sound', via: 'use_sound' });
}

// —— music_map ——
const musicCtx = {};
vm.createContext(musicCtx);
vm.runInContext(readFileSync(join(GSJS, 'inc_data_sounds.js'), 'utf8') + '\nthis.music_map = music_map;', musicCtx);
const musicMap = musicCtx.music_map || {};
for (const [key, url] of Object.entries(musicMap)) {
  note(key, { category: 'music', where: 'gsjs:inc_data_sounds.js', context: 'music_map', via: 'music_map' });
  keys.get(key).url = url;
}

// —— Flash client ——
const CLIENT_PATTERNS = [
  /playSound(?:AllowMultiples)?\(\s*['"]([A-Za-z0-9_]+)['"]/g,
  /playSound\([^)]*\?\s*['"]([A-Z0-9_]+)['"]\s*:\s*['"]([A-Z0-9_]+)['"]/g,
  /sound_id\s*=\s*['"]([A-Z0-9_]+)['"]/g,
  /onStartParams:\s*\[\s*['"]([A-Z0-9_]+)['"]/g,
];
for (const file of walk(CLIENT, '.as')) {
  const text = readFileSync(file, 'utf8');
  if (!/playSound|sound_id|onStartParams/.test(text)) continue;
  const rel = relative(CLIENT, file);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const re of CLIENT_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        if (line.slice(m.index + m[0].length).startsWith('+')) continue; // CARD_DEAL'+n family
        for (const key of m.slice(1).filter(Boolean)) {
          note(key, { category: 'ui', where: `client:${rel}:${i + 1}`, context: contextName(lines, i), via: 'client' });
        }
      }
    }
  });
}
for (let n = 1; n <= 7; n += 1) note(`CARD_DEAL${n}`, { category: 'ui', where: 'client:com/tinyspeck/engine/view/ui/imagination/ImaginationHandUI.as:199', context: 'deal cards', via: 'family' });
note('FLIP_OVER', { category: 'ui', where: 'client:com/tinyspeck/engine/view/ui/imagination/ImgCardUI.as:540', context: 'flip', via: 'client' });
note('Prisencolinensinainciusol', { category: 'ui', where: 'client:TSEngineAssets/src/Assets.as:8', context: 'embedded easter egg', via: 'embedded' });
note('trumpet', { category: 'ui', where: 'client:TSEngineAssets/src/Assets.as:10', context: 'embedded', via: 'embedded' });

// —— Remake-only keys (moments the remake has that never had their own key) ——
const REMAKE = {
  UI_PANEL_OPEN: 'Any side panel or dialog opens',
  UI_PANEL_CLOSE: 'Any side panel or dialog closes',
  UI_TOGGLE: 'Mute and other small toggles',
  VERB_MENU_OPEN: 'Verb menu pops up over a target',
  QUOIN_XP: 'iMG quoin',
  QUOIN_MOOD: 'Mood quoin',
  QUOIN_ENERGY: 'Energy quoin',
  QUOIN_CURRANTS: 'Currant quoin',
  QUOIN_MYSTERY: 'Mystery quoin',
  QUOIN_FAVOR: 'Favor quoin',
  QUOIN_TIME: 'Time quoin',
  VENDOR_SELL: 'Sell an item to a vendor',
  SIGNPOST_TRAVEL: 'Walk through a signpost or map travel',
  TELEPORT_ARRIVE: 'Arrive after a teleport',
  DOOR_CREAK: 'Doors and house entrances',
  FOOTSTEP: 'Soft step (slides, crafting ticks)',
  JUMP: 'Ordinary jump',
  CRAFT_DONE: 'A making job finishes',
  CRAFT_TICK: 'Making progress tick',
  MINE_HIT: 'One pick strike on a rock',
  CHOP_HIT: 'One hatchet strike on a Wood Tree',
  GARDEN_PLANT: 'Plant seeds in a garden plot',
  GARDEN_CLEAR: 'Clear a garden plot',
  BADGE_FANFARE: 'Badge overlay (synth stand-in for ACHIEVEMENT_UNLOCKED)',
  ROOK_CAW: 'Rook caw during attacks',
  RAIN: 'Rain and weather patter',
  QUEST_OFFER: 'Magic Rock offers a quest',
  QUEST_ACCEPT: 'Accept a quest',
  SHRINE_EMBLEM: 'Claim a Giant emblem',
  FOX_YIP: 'Fox bark',
  KITTY_MEW: 'Heli kitty mew',
  NEIGHBOUR_WAVE: 'Neighbour chore greeting',
};
for (const [key, moment] of Object.entries(REMAKE)) {
  note(key, { category: 'remake', where: 'remake', context: moment, via: 'remake' });
  keys.get(key).moment = moment;
}

// —— Recovered files ——
for (const [key, row] of Object.entries(RECOVERED)) {
  if (!keys.has(key)) {
    const doll = key.startsWith('STEWARTDOLL');
    note(key, {
      category: doll ? 'voice' : 'recovered',
      where: doll ? 'gsjs:items/stoot_barfield_pullstring_doll.js:217' : `wayback:${row.url}`,
      context: doll ? 'getSound' : 'filename',
      via: doll ? 'return key' : 'wayback',
    });
  }
  const entry = keys.get(key);
  entry.url = row.url;
  entry.file = row.file;
  entry.origin = 'wayback-c2';
  entry.keyFrom = row.keyFrom;
  if (!existsSync(join(PUBLIC, row.file))) throw new Error(`missing recovered file ${row.file}`);
}
for (const [key, row] of Object.entries(DOWNLOADS)) {
  if (!keys.has(key)) note(key, { category: 'downloads', where: 'downloads.html', context: row.fit, via: 'downloads' });
  const entry = keys.get(key);
  entry.file ||= row.file;
  entry.origin ||= 'downloads-best-fit';
  entry.downloadName = row.name;
  entry.fit = row.fit;
  if (!existsSync(join(PUBLIC, row.file))) throw new Error(`missing downloads file ${row.file}`);
}

function categorize(key, row) {
  if (row.category) return row.category;
  if (/^STEWARTDOLL/.test(key)) return 'voice';
  if (/^QUOIN|QUORAZY/.test(key)) return 'quoin';
  if (/^(CLICK_|OPEN_|CLOSE_|FLIP|CARD_|CLOUD\d|IMAGINATION|HAND_|TOGGLE|INCOMING_CHAT|QUEST_DIALOGUE)/.test(key)) return 'ui';
  if (/PIGGY|CHICKEN|BUTTERFLY|FOX|KITTY|FROG|SLOTH|SALMON|BARNACLE|JELLISAC|ROOK|CRAB|BAT|SQUIRREL|DEER/.test(key)) return 'animal';
  if (/TREE|TRANT|HARVEST|WATERING|HOE|GARDEN|PLANT|PETRIFIED/.test(key)) return 'nature';
  if (/^ITEM_|PACK_|PURCHASE|PAY_|DROP|PICKUP/.test(key)) return 'item';
  if (/QUEST|ACHIEVEMENT|LEVEL|SKILL|BADGE|TROPHY|RAINBOW_|DONAT|EMBLEM|GIANT|GONG/.test(key)) return 'reward';
  if (/TELEPORT|DOOR|TRAIN|SUBWAY|ELEVATOR|STREET|LOADED|TRAVEL/.test(key)) return 'travel';
  if (/CRAFT|MAKING|FUELMAKER|CHASSIS|ENGINE|PLATES|STAND|COLLECT|METAL|TOOL|STILL/.test(key)) return 'making';
  return 'event';
}

const catalog = {};
for (const key of [...keys.keys()].sort((a, b) => a.localeCompare(b))) {
  const row = keys.get(key);
  const category = categorize(key, row);
  const fallbackMoment = row.sources[0]?.replace(/^(gsjs|client):/, '') || '';
  catalog[key] = {
    category,
    moment: row.moment || MOMENTS[key] || (key.startsWith('STEWARTDOLL') ? `Stoot pull-string doll voice line ${key.slice(11)}` : fallbackMoment),
    uses: row.uses,
    via: [...row.via].sort(),
    sources: row.sources,
    ...(row.url ? { url: row.url } : {}),
    ...(row.file ? { file: row.file, origin: row.origin } : {}),
    ...(row.keyFrom ? { keyFrom: row.keyFrom } : {}),
    ...(row.fit ? { fit: row.fit } : {}),
    ...(ALIASES[key] ? { alias: ALIASES[key] } : {}),
  };
}
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!catalog[alias]) throw new Error(`alias ${alias} is not catalogued`);
  if (!catalog[target]?.file) throw new Error(`alias target ${target} has no file`);
}

const files = {};
for (const [key, row] of Object.entries(catalog)) if (row.file) files[key] = row.file;
const counts = {
  keys: Object.keys(catalog).length,
  original: Object.values(catalog).filter((r) => r.category !== 'remake').length,
  music: Object.values(catalog).filter((r) => r.category === 'music').length,
  remake: Object.values(catalog).filter((r) => r.category === 'remake').length,
  recoveredWayback: Object.keys(RECOVERED).length,
  downloadsBestFit: Object.keys(DOWNLOADS).length,
  withFile: Object.keys(files).length,
  aliases: Object.keys(ALIASES).length,
};

writeFileSync(
  OUT_JSON,
  `${JSON.stringify({ generatedBy: 'build-sound-keys.mjs', soundsXml: 'http://c2.glitch.bz/sounds/2012-12/sounds_1354665929.xml (not archived)', counts, keys: catalog }, null, 1)}\n`
);

const js = `/**
 * GENERATED by build-sound-keys.mjs. Do not edit by hand; re-run the builder.
 * ${counts.keys} catalogued keys (${counts.original} from GSJS/client, ${counts.remake} remake-only),
 * ${counts.withFile} with a recovered file. Full catalog: assets/content/sound-keys.json.
 */

export const SOUND_KEY_COUNTS = Object.freeze(${JSON.stringify(counts)});

/** Key → recovered audio file (relative to public/). */
export const SOUND_FILES = Object.freeze(${JSON.stringify(files, null, 2)});

/** Keys that borrow another key's recovered file. */
export const SOUND_ALIASES = Object.freeze(${JSON.stringify(ALIASES, null, 2)});

/** Key → catalog category, for synth recipe selection without the JSON. */
export const SOUND_CATEGORIES = Object.freeze(${JSON.stringify(Object.fromEntries(Object.entries(catalog).map(([k, r]) => [k, r.category])))});
`;
writeFileSync(OUT_JS, js);
console.log(JSON.stringify(counts));
