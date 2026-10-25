// No animation sheet plays a blank cell (Austin, 2026-10-25: the Spinning Wheel and the
// Bureaucratic Hall clerks blinked out once a loop). A sheet that ends in nothing on purpose is listed.
// The first test reads game.js's SHEETS table; the second every sheet the js/ modules slice (G276).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The wheel's disappear clip ends blank: the wheel is gone (its sprite is removed after it).
const ENDS_EMPTY = new Set(['wheelDisappear']);
// The Phantom's appear clip (played once) starts from nothing as it fades in.
const ALLOWED = new Set(['phantomAppear cell 0']);

test('every game.js sheet plays only cells with art', async () => {
  // G281: read from game.js's syntax tree (tests/sheet-sources.js gameSheetTable), as the module test is.
  const { gameSheetTable } = await import('./sheet-sources.js');
  const table = gameSheetTable();
  for (const name of ENDS_EMPTY) assert.ok(table.some((r) => r.name === name), `unused allowance ${name}`);
  const rows = table
    .filter((r) => !ENDS_EMPTY.has(r.name))
    .map((r) => ({ ...r, path: join(root, 'public', r.path) }));
  assert.ok(rows.length > 40, `found ${rows.length} sheets`);
  // Pillow does the pixel work (python3.11 has it); the test skips if it is missing.
  const py = `import json,sys
from PIL import Image
out=[]
for r in json.load(sys.stdin):
    im=Image.open(r['path']).convert('RGBA')
    for i in range(r['n']):
        c,w=i%r['cols'],i//r['cols']; b=(c*r['fw'],w*r['fh'],c*r['fw']+r['fw'],w*r['fh']+r['fh'])
        if b[2]>im.width or b[3]>im.height or not im.crop(b).getchannel('A').getbbox(): out.append(f"{r['name']} cell {i}")
print(json.dumps(out))`;
  let blank;
  try {
    blank = JSON.parse(execFileSync('python3.11', ['-I', '-c', py], { input: JSON.stringify(rows), encoding: 'utf8' }));
  } catch (err) {
    if (/ENOENT|No module named/.test(String(err))) return;
    throw err;
  }
  assert.deepEqual(blank.filter((b) => !ALLOWED.has(b)), []);
});

// G276: the same check for every sheet the js/ modules slice (tests/sheet-sources.js reads their
// definitions), their 3x twins (js/sprite-hires.js), and the opposite fault: a count that stops
// before the last cell with art. Clips that start or end on nothing on purpose are listed here.
const MODULE_ALLOWED = [
  [/^juju (green|red|yellow) \w+ spawn( @3x)? cell 0$/, 'the spawn sparkle (played once) starts from nothing'],
  [/^juju camp bandit \w+ spawn( @3x)? cell 0$/, 'the same Juju spawn sparkle in the camp'],
  [/^rube spawn_in( rube_spawn_in\.p1@3x\.webp)? cell [0-2]$/, 'The Rube spawns in from nothing (played once)'],
  [/^esquibeth ghost appear cell [01]$/, "Esquibeth's ghost appears from nothing (played once)"],
  [/^spirit \w+ \w+ lonely_in cell 0$/, 'the loneliness portrait fades in from nothing (played once)'],
  [/^party teleporter_visible_disappear\.png cell 1[234]$/, 'the teleporter is gone at the end of its disappear clip'],
  [/^potion-art\.js POTION_ART\.scion_of_purple_fade cell 31$/, 'the Scion of Purple fades out to nothing'],
  [/^hi \w+ hi cell (5[4-9]|6[0-4])$/, 'hi_overlay.swf hi state (played once, 2 s) ends after its burst'],
  [/^hi \w+ bonus cell 3[3-6]$/, 'the 2x bonus state (played once) ends after its burst'],
  [/^features\/rook-attack-feature\.js ROOK_SHEETS\.balm cell 0$/, 'the balm tool loop starts empty (loaded, not played yet)'],
];
const TAIL_ALLOWED = [
  [/^juju camp grandma angry:/, 'cell 126 repeats cell 0; the loop stops before it'],
];

test('every js/ module sheet plays only cells with art, and no count cuts off its art', async () => {
  const { collectSheets, hiresRows, kitCalls, KIT_TABLE_CALLS } = await import('./sheet-sources.js');
  // Kit calls whose numbers come from a table are read from that table in sheet-sources.js.
  const unread = [...new Set(kitCalls().filter((c) => !c.args).map((c) => c.rel))].sort();
  assert.deepEqual(unread, [...KIT_TABLE_CALLS].sort(), 'a new kit sheet call with table-driven numbers needs a reader in tests/sheet-sources.js');
  const rows = await collectSheets();
  assert.ok(rows.length > 600, `found ${rows.length} module sheets`);
  const all = [...rows, ...(await hiresRows(rows))];
  const py = `import json,sys,os
from PIL import Image
root=sys.argv[1]
out={'blank':[],'tail':[],'missing':[]}
cur=[None,None]
for r in sorted(json.load(sys.stdin), key=lambda r: r['path']):
    p=os.path.join(root,r['path'])
    if not os.path.exists(p):
        out['missing'].append(r['name']+' ('+r['path']+')'); continue
    if cur[0]!=p: cur[:]=[p,Image.open(p).convert('RGBA')]
    im=cur[1]; W,H=im.size; a=im.getchannel('A')
    if r['derive']: fw,fh=W//r['derive']['cols'],H//r['derive']['rows']
    else: fw,fh=round(r['fw']*r['density']),round(r['fh']*r['density'])
    cols=r['cols']
    box=lambda i:((i%cols)*fw,(i//cols)*fh,(i%cols)*fw+fw,(i//cols)*fh+fh)
    art=lambda b: b[2]<=W and b[3]<=H and a.crop(b).getbbox() is not None
    cells=r['cells'] if r['cells'] is not None else range(r['first'],r['first']+r['n'])
    for i in cells:
        if not art(box(i)): out['blank'].append(f"{r['name']} cell {i-r['first']}")
    if r['tail'] and r['cells'] is None:
        extra=[i for i in range(r['first']+r['n'],cols*(H//fh)) if art(box(i))]
        if extra: out['tail'].append(f"{r['name']}: {len(extra)} cell(s) with art after its {r['n']}, first {extra[0]-r['first']}")
print(json.dumps(out))`;
  let found;
  try {
    found = JSON.parse(execFileSync('python3.11', ['-I', '-c', py, join(root, 'public')], { input: JSON.stringify(all), encoding: 'utf8', maxBuffer: 1 << 26 }));
  } catch (err) {
    if (/ENOENT|No module named/.test(String(err))) return;
    throw err;
  }
  // Overlay timelines (overlays.json order) may open and close on empty frames: a blank overlay
  // cell passes when every frame that shows it sits in the empty run at the start or the end.
  const blankSet = new Set(found.blank);
  const edgeOnly = (b) => {
    const m = /^(overlay \S+) cell (\d+)$/.exec(b);
    const r = m && all.find((x) => x.name === m[1] && x.order);
    if (!r) return false;
    const empty = (c) => blankSet.has(`${r.name} cell ${c}`);
    let lo = 0;
    while (lo < r.order.length && empty(r.order[lo])) lo += 1;
    let hi = r.order.length - 1;
    while (hi >= 0 && empty(r.order[hi])) hi -= 1;
    return r.order.every((c, pos) => c !== +m[2] || pos < lo || pos > hi);
  };
  const allowed = (list, s) => list.some(([re]) => re.test(s));
  assert.deepEqual(found.missing, []);
  assert.deepEqual(found.blank.filter((b) => !allowed(MODULE_ALLOWED, b) && !edgeOnly(b)), []);
  assert.deepEqual(found.tail.filter((t) => !allowed(TAIL_ALLOWED, t)), []);
  // Every allowance still matches something (a fixed sheet drops its entry).
  for (const [re, why] of MODULE_ALLOWED) assert.ok(found.blank.some((b) => re.test(b)), `unused allowance ${re} (${why})`);
  for (const [re, why] of TAIL_ALLOWED) assert.ok(found.tail.some((t) => re.test(t)), `unused allowance ${re} (${why})`);
});
