import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const map = JSON.parse(fs.readFileSync(path.join(root, 'tools/sound/archiveorg-sfx-map.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(pub, 'assets/content/sound-keys.json'), 'utf8')).keys;
const SFX_DIR = path.join(pub, 'assets/audio/sfx');

const tokens = (s) => new Set(s.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean));

describe('archive.org sound mapping', () => {
  test('every mapped file is installed, MPEG, and catalogued with its archive.org source', () => {
    assert.ok(map.files.length >= 200, `${map.files.length} mapped files`);
    for (const entry of map.files) {
      const item = map.items[entry.item];
      assert.ok(item, `${entry.file}: unknown item ${entry.item}`);
      const rel = `assets/audio/sfx/${entry.key}.mp3`;
      const abs = path.join(pub, rel);
      assert.ok(fs.existsSync(abs), `${entry.key} not installed (run tools/sound/install-archiveorg-sfx.mjs)`);
      const head = fs.readFileSync(abs).subarray(0, 3);
      assert.ok(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), `${entry.key} is not MPEG audio`);
      const row = catalog[entry.key];
      assert.ok(row, `${entry.key} is not a catalogued key`);
      assert.equal(row.file, rel, entry.key);
      assert.equal(row.origin, 'archiveorg-sfx', entry.key);
      assert.equal(row.source, `https://archive.org/download/${item.id}/${encodeURIComponent(entry.file)}`);
      assert.equal(SOUND_FILES[entry.key], rel);
    }
  });

  test('every installed sfx file is mapped (Wayback c2 or archive.org)', () => {
    for (const name of fs.readdirSync(SFX_DIR).filter((f) => f.endsWith('.mp3'))) {
      const key = name.replace(/\.mp3$/, '');
      const row = catalog[key];
      assert.ok(row, `${name} has no catalog key`);
      assert.equal(row.file, `assets/audio/sfx/${name}`, `${name} is installed but not mapped`);
      assert.ok(['wayback-c2', 'archiveorg-sfx'].includes(row.origin), `${name} origin ${row.origin}`);
    }
  });

  test('no key maps to a missing file and no key is mapped twice', () => {
    const seen = new Map();
    for (const entry of map.files) {
      for (const key of [entry.key, ...(entry.aliases || [])]) {
        assert.ok(!seen.has(key), `${key} mapped by ${seen.get(key)} and ${entry.file}`);
        seen.set(key, entry.file);
        assert.ok(catalog[key], `${key} is not catalogued`);
      }
      for (const alias of entry.aliases || []) {
        assert.equal(SOUND_ALIASES[alias], entry.key, alias);
        assert.ok(!SOUND_FILES[alias], `${alias} has its own file and an alias`);
      }
    }
    for (const [key, file] of Object.entries(SOUND_FILES)) assert.ok(fs.existsSync(path.join(pub, file)), `${key} → missing ${file}`);
    for (const [alias, target] of Object.entries(SOUND_ALIASES)) assert.ok(SOUND_FILES[target], `${alias} → ${target} has no file`);
  });

  test('every source file is accounted for once, and non-obvious matches say why', () => {
    const seen = new Set();
    for (const section of ['files', 'duplicates', 'unmatched']) {
      for (const entry of map[section]) {
        const id = `${entry.item}/${entry.file}`;
        assert.ok(!seen.has(id), `${id} listed twice`);
        seen.add(id);
      }
    }
    for (const entry of map.unmatched) assert.ok(entry.why, `${entry.file}: unmatched without a reason`);
    for (const entry of map.duplicates) assert.ok((entry.sameAs && catalog[entry.sameAs]?.file) || entry.sameAsFile, `${entry.file}: duplicate of nothing shipped`);
    for (const entry of map.files) {
      const overlap = [...tokens(entry.file.replace(/\.mp3$/, ''))].some((t) => tokens(entry.key).has(t));
      if (!overlap || entry.aliases?.length || entry.item !== 'sfx') assert.ok(entry.why, `${entry.file} → ${entry.key} needs a why`);
    }
  });
});
