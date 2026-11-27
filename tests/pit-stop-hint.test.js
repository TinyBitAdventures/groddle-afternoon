/**
 * Machine Shop Pit Stop (GSJS quests/engineering_assemble_machine.js, G443) asks you to fully
 * assemble and disassemble a machine in 2 minutes. A player tried it on a Community Machine Room
 * machine and could not: those machines can't be taken apart, as in Glitch (machine_base
 * isInCraftingAltar hides disassemble there: fuelmaker.js:64, :310; js/machine-rooms.js 11-16), and
 * Glitch never said so. Austin 2026-11-27 (trace calls, "quest"): one plain line of ours on the
 * Machine Stand encyclopedia page and in the quest log help; Tiny Speck's quest text stays as written.
 * Run: node --test tests/pit-stop-hint.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PIT_STOP_HINT, PIT_STOP_QUEST } from '../public/js/machine-rooms.js?fresh=pit-stop-hint';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const LINE = "Use a machine you've built and set down yourself; machine room machines can't be taken apart.";

describe('Machine Shop Pit Stop says a machine room machine will not do', () => {
  it('the line, plain and ours', () => {
    assert.equal(PIT_STOP_QUEST, 'engineering_assemble_machine');
    assert.equal(PIT_STOP_HINT, LINE);
    assert.doesNotMatch(PIT_STOP_HINT, /—|–/);
  });

  it('Tiny Speck\'s quest words stay as they were', () => {
    const quest = JSON.parse(read('public/assets/content/quests.json'))[PIT_STOP_QUEST];
    assert.equal(quest.title, 'Machine Shop Pit Stop');
    assert.match(quest.desc, /^Fully Assemble and Disassemble any Machine in 2 minutes\./);
    assert.doesNotMatch(JSON.stringify(quest), /machine room machines/);
  });

  it('the quest log card shows it while the quest is active, as the other hints', () => {
    assert.match(read('public/game.js'), /if \(p\.active && p\.def\.classTsid === PIT_STOP_QUEST\) \{\n\s+const hint = document\.createElement\('div'\);\n\s+hint\.className = 'q-req q-hint';\n\s+hint\.textContent = PIT_STOP_HINT;/);
  });

  it('the Machine Stand encyclopedia page says it under What it is for', () => {
    const uses = JSON.parse(read('tools/catalog/uses.json'));
    assert.ok(uses.machine_stand?.lines?.includes(LINE), 'uses.json machine_stand');
    assert.ok(uses.machine_stand.evidence.some((e) => e.startsWith('public/js/machine-rooms.js:')));
    const page = read('public/encyclopedia/items/machine_stand/index.html');
    assert.ok(page.includes(`<li>${LINE.replace(/'/g, '&#39;')}</li>`) || page.includes(`<li>${LINE}</li>`), 'on the built page');
  });

  it('is in the inventions register', () => {
    const inv = JSON.parse(read('tools/inventions/inventions.json'));
    assert.ok(inv.entries.some((e) => e.id === 'pit-stop-machine-room-hint'));
  });
});
