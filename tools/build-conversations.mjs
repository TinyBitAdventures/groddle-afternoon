#!/usr/bin/env node
/**
 * Build public/js/conversations-data.js: every conversation an animal,
 * tree, rock, peat bog, barnacle, patch, shrine or Icon tells, verbatim
 * from Tiny Speck's GameServerJS (CC0). Register rows G189 and G202 (the
 * Icons).
 *
 *   node tools/build-conversations.mjs [path/to/glitch-GameServerJS]
 *
 * Source shape (the "conversation auto-builder" output in each item file):
 * - `var conversations = [...]`: the class's offer order.
 * - conversation_canoffer_<id>(pc): `var chain = null | { id, level,
 *   max_level }`, then `pc.conversations_can_do_chain(chain)`, then one
 *   `if (...) return true;` of `pc.stats.level >= N`,
 *   `pc.getQuestStatus("donate_to_all_shrines") == 'done'` and
 *   `pc.conversations_has_completed(null, "<id>")` terms joined by &&.
 * - conversation_run_<id>(pc, msg, replay): `var conversation_title`, one
 *   conversation_start / conversation_reply line per step with exactly one
 *   choice, the last choice calling pc.conversations_complete, and
 *   optional `if ((msg.choice == "<value>") && (!replay))` reward blocks.
 *
 * The Icons (icon_*.js) are built the same way: their canoffer and run
 * functions are in the class file, their onPlayerCollision offer in
 * items/include/icon.js 565-575 (the same pc.conversations_offer loop).
 * Street spirits keep their own table (js/street-spirit-talks.js); test
 * classes (npc_test, test_item3) and
 * the Heli Kitty (npc_kitty_chicken: it offers but its talk_to is always
 * hidden) are left out. The build throws on any shape it does not know.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(ROOT, '..', 'glitch-GameServerJS');
const OUT = join(ROOT, 'public/js/conversations-data.js');

/** Teller classes the remake builds, with the source's teller notes. */
export const TELLER_CLASSES = [
  'npc_chicken', 'npc_piggy', 'npc_butterfly', 'npc_batterfly',
  'trant_fruit', 'trant_bean', 'trant_bubble', 'trant_egg', 'trant_gas', 'trant_spice',
  'wood_tree', 'wood_tree_enchanted',
  'rock_beryl_1', 'rock_beryl_2', 'rock_beryl_3',
  'rock_dullite_1', 'rock_dullite_2', 'rock_dullite_3',
  'rock_sparkly_1', 'rock_sparkly_2', 'rock_sparkly_3',
  'rock_metal_1', 'rock_metal_2', 'rock_metal_3',
  'peat_1', 'peat_2', 'peat_3',
  'mortar_barnacle',
  'patch', 'patch_dark',
];
const SHRINE_RE = /^npc_shrine_/;
const ICON_RE = /^icon_[a-z]+\.js$/;
/** The Icons' onPlayerCollision lives in their shared include (icon_base). */
const ICON_OFFER_FILE = 'items/include/icon.js';

function fail(msg) {
  throw new Error(`build-conversations: ${msg}`);
}

const str = (raw) => JSON.parse(`"${raw}"`);

function fnBody(lines, name) {
  const start = lines.findIndex((l) => l.startsWith(`function ${name}(`));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && lines[end] !== '}') end++;
  return { start: start + 1, end: end + 1, text: lines.slice(start, end + 1).join('\n') };
}

function parseGate(id, body) {
  const chainM = body.match(/var chain = (null|\{\s*id: "(\w+)",\s*level: (\d+),\s*max_level: (\d+)\s*\});/);
  if (!chainM) fail(`${id}: chain`);
  const chain = chainM[1] === 'null' ? null : { id: chainM[2], level: Number(chainM[3]), max: Number(chainM[4]) };
  if (!/if \(!pc\.conversations_can_do_chain\(chain\)\) return false;/.test(body)) fail(`${id}: can_do_chain`);
  const conds = [...body.matchAll(/\n\t+if \((.*)\)\{\n\t+return true;/g)];
  if (conds.length !== 1) fail(`${id}: ${conds.length} offer conditions`);
  const gate = { level: 0, quest: '', after: [] };
  for (const raw of conds[0][1].split(' && ')) {
    const t = raw.replace(/^\((.*)\)$/, '$1');
    let m;
    if ((m = t.match(/^pc\.stats\.level >= (\d+)$/))) gate.level = Number(m[1]);
    else if ((m = t.match(/^pc\.getQuestStatus\("(\w+)"\) == 'done'$/))) gate.quest = m[1];
    else if ((m = t.match(/^pc\.conversations_has_completed\(null, "(\w+)"\)$/))) gate.after.push(m[1]);
    else fail(`${id}: unknown offer term ${t}`);
  }
  return { chain, gate };
}

function parseRun(id, body) {
  const title = body.match(/var conversation_title = "((?:[^"\\]|\\.)*)";/)?.[1];
  if (title == null) fail(`${id}: title`);
  const steps = [];
  const blocks = [...body.matchAll(/\n\t(?:if \(!msg\.choice\)\{|if \(msg\.choice == "([\w-]+)"\)\{)([\s\S]*?)\n\t\}/g)];
  let completeAt = '';
  for (const b of blocks) {
    const on = b[1] || null;
    const inner = b[2];
    if (/conversations_complete\(this\.class_tsid, conversation_id, chain\);/.test(inner)) {
      completeAt = on;
      continue;
    }
    const choices = [...inner.matchAll(/choices\['(\d+)'\]\['([\w-]+)'\] = \{txt: "((?:[^"\\]|\\.)*)", value: '([\w-]+)'\};/g)];
    if (choices.length !== 1) fail(`${id}: ${choices.length} choices in one step`);
    const call = inner.match(/this\.conversation_(start|reply)\(pc, (?:msg, )?"((?:[^"\\]|\\.)*)", choices\['(\d+)'\], null, null, null, \{title: conversation_title\}\);/);
    if (!call) fail(`${id}: step line`);
    const index = steps.length;
    if (Number(call[3]) !== index || Number(choices[0][1]) !== index) fail(`${id}: step order`);
    if ((index === 0) !== (call[1] === 'start')) fail(`${id}: start/reply`);
    const expectOn = index === 0 ? null : `${id}-${index - 1}-2`;
    if (on !== expectOn) fail(`${id}: step ${index} keyed ${on}`);
    if (choices[0][4] !== `${id}-${index}-2`) fail(`${id}: choice value`);
    steps.push({ text: str(call[2]), choice: str(choices[0][3]) });
  }
  const calls = (body.match(/this\.conversation_(?:start|reply)\(/g) || []).length;
  if (calls !== steps.length) fail(`${id}: ${calls} calls, ${steps.length} steps`);
  if (completeAt !== `${id}-${steps.length - 1}-2`) fail(`${id}: completes at ${completeAt}`);
  // Rewards: `if ((msg.choice == "<id>-<n>-2") && (!replay))` fires on answering step n.
  for (const r of body.matchAll(/\n\tif \(\(msg\.choice == "([\w-]+)"\) && \(!replay\)\)\{([\s\S]*?)\n\t\}/g)) {
    const n = Number(r[1].slice(id.length + 1).split('-')[0]);
    if (!steps[n] || r[1] !== `${id}-${n}-2`) fail(`${id}: reward key ${r[1]}`);
    const item = r[2].match(/pc\.createItemFromSource\("(\w+)", (\d+) \* msg\.count, this\);[\s\S]*pc\.createItem\("\1", \2 \* msg\.count\);/);
    const xp = r[2].match(/pc\.stats_add_xp\((\d+) \* msg\.count, false, context\);/);
    if (item) steps[n].reward = { item: item[1], count: Number(item[2]) };
    else if (xp) steps[n].reward = { xp: Number(xp[1]) };
    else fail(`${id}: unknown reward`);
  }
  const extra = body.replace(/\n\tif \(\(msg\.choice == "[\w-]+"\) && \(!replay\)\)\{[\s\S]*?\n\t\}/g, '');
  if (/stats_add|createItem|achievements_|apiGive|quests_/.test(extra)) fail(`${id}: unparsed side effect`);
  return { title, steps };
}

export function buildConversations(gsjs = GSJS) {
  const items = join(gsjs, 'items');
  const shrineClasses = readdirSync(items).filter((f) => SHRINE_RE.test(f) && f.endsWith('.js')).map((f) => f.slice(0, -3))
    // The plain shrine class first (the one the remake spawns), then the regional ones.
    .sort((a, b) => Number(/_(firebog|uralia|ix)_/.test(a)) - Number(/_(firebog|uralia|ix)_/.test(b)) || a.localeCompare(b));
  const iconClasses = readdirSync(items).filter((f) => ICON_RE.test(f)).map((f) => f.slice(0, -3)).sort();
  const iconOffer = readFileSync(join(gsjs, ICON_OFFER_FILE), 'utf8').split('\n').findIndex((l) => l.includes('pc.conversations_offer(this, conversations[i])')) + 1;
  if (iconOffer < 1) fail(`${ICON_OFFER_FILE}: offer`);
  const classes = [...TELLER_CLASSES, ...shrineClasses, ...iconClasses];
  const tellers = {};
  const convos = {};
  for (const cls of classes) {
    const file = `items/${cls}.js`;
    const src = readFileSync(join(gsjs, file), 'utf8');
    const lines = src.split('\n');
    const listM = src.match(/^var conversations = \[([\s\S]*?)\];/m);
    if (!listM) fail(`${cls}: no conversations list`);
    const list = [...listM[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    if (!list.length) continue;
    const icon = iconClasses.includes(cls);
    const offerLine = icon ? iconOffer : lines.findIndex((l) => l.includes('pc.conversations_offer(this, conversations[i])')) + 1;
    const talkStart = lines.findIndex((l) => l.startsWith('verbs.talk_to = {'));
    if (offerLine < 1 || talkStart < 0) fail(`${cls}: offer/talk_to`);
    const talkText = lines.slice(talkStart, lines.indexOf('};', talkStart) + 1).join('\n');
    const byItem = /conversations_offered_for_item\(this\)/.test(talkText);
    if (!byItem && !/conversations_offered_for_class\(this\.class_tsid\)/.test(talkText)) fail(`${cls}: talk_to lookup`);
    const offerAt = icon ? `offer ${ICON_OFFER_FILE} ${offerLine}` : `offer ${offerLine}`;
    tellers[cls] = { list, talk: byItem ? 'item' : 'class', source: `${file} ${offerAt}, talk_to ${talkStart + 1}` };
    for (const id of list) {
      const co = fnBody(lines, `conversation_canoffer_${id}`);
      const ru = fnBody(lines, `conversation_run_${id}`);
      if (!co || !ru) fail(`${cls}: ${id} missing`);
      const def = { id, ...parseRun(id, ru.text), ...parseGate(id, co.text) };
      const prev = convos[id];
      if (prev) {
        const same = JSON.stringify([prev.title, prev.steps, prev.chain, prev.gate]) === JSON.stringify([def.title, def.steps, def.chain, def.gate]);
        if (!same) fail(`${id}: differs between ${prev.tellers[0]} and ${cls}`);
        prev.tellers.push(cls);
        continue;
      }
      convos[id] = { id, title: def.title, tellers: [cls], chain: def.chain, gate: def.gate, steps: def.steps, source: `${file} ${co.start}-${ru.end}` };
    }
  }
  return { tellers, convos };
}

function render({ tellers, convos }) {
  const head = `/**
 * GENERATED by tools/build-conversations.mjs from Tiny Speck GameServerJS
 * (CC0): every conversation an animal, tree, rock, peat bog, barnacle,
 * patch, shrine or Icon tells (register G189, the Icons G202). Do not edit
 * by hand.
 *
 * CONVERSATIONS[id]: title, tellers (the source classes that list it),
 * chain (conversation chain: id, level, max), gate (conversation_canoffer:
 * level, quest done, conversations completed first), steps (the teller's
 * line and the one answer; reward is given on answering that step), and
 * source (canoffer start to run end in the first teller's file).
 * TELLERS[class]: list (the class's offer order) and talk ('class': the
 * Talk to verb runs conversations offered by this class; 'item': by any
 * class whose list has them, the shrines).
 */
`;
  const lines = [head, `export const CONVERSATIONS_SOURCE = 'tinyspeck/glitch-GameServerJS items/{npc_*,trant_*,wood_tree*,rock_*,peat_*,mortar_barnacle,patch*,npc_shrine_*,icon_*}.js (CC0)';\n`];
  lines.push('export const TELLERS = Object.freeze({');
  for (const [cls, t] of Object.entries(tellers)) {
    lines.push(`  ${cls}: Object.freeze({ list: Object.freeze(${JSON.stringify(t.list)}), talk: '${t.talk}', source: ${JSON.stringify(t.source)} }),`);
  }
  lines.push('});\n');
  lines.push('export const CONVERSATIONS = Object.freeze({');
  for (const c of Object.values(convos)) {
    lines.push(`  ${c.id}: Object.freeze({`);
    lines.push(`    id: '${c.id}',`);
    lines.push(`    title: ${JSON.stringify(c.title)},`);
    lines.push(`    tellers: Object.freeze(${JSON.stringify(c.tellers)}),`);
    lines.push(`    chain: ${c.chain ? `Object.freeze(${JSON.stringify(c.chain)})` : 'null'},`);
    lines.push(`    gate: Object.freeze({ level: ${c.gate.level}, quest: '${c.gate.quest}', after: Object.freeze(${JSON.stringify(c.gate.after)}) }),`);
    lines.push(`    source: '${c.source}',`);
    lines.push('    steps: Object.freeze([');
    for (const s of c.steps) {
      const reward = s.reward ? `, reward: Object.freeze(${JSON.stringify(s.reward)})` : '';
      lines.push(`      Object.freeze({ text: ${JSON.stringify(s.text)}, choice: ${JSON.stringify(s.choice)}${reward} }),`);
    }
    lines.push('    ]),');
    lines.push('  }),');
  }
  lines.push('});\n');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const built = buildConversations();
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== render(built)) {
      console.error(`${OUT} is stale: run node tools/build-conversations.mjs`);
      process.exit(1);
    }
    console.log(`conversations-data.js is current (${Object.keys(built.convos).length} conversations)`);
  } else {
    writeFileSync(OUT, render(built));
    console.log(`${Object.keys(built.convos).length} conversations from ${Object.keys(built.tellers).length} teller classes -> ${OUT}`);
  }
}
