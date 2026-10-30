/**
 * QA panel for the sound catalog: `?soundtest=1` (add `&autostart=1` to skip
 * the start gate). Lists every key in assets/content/sound-keys.json with its
 * moment, source and what plays (recovered file or synth recipe), with a Play
 * button per row, a category filter and a search box.
 */

import { resolveSound } from './sound-board.js?v=g393-1';

const CSS = `
.sound-test{position:fixed;inset:12px 12px auto auto;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);
  display:flex;flex-direction:column;z-index:calc(var(--z-dev) + 51);background:var(--surface-card);color:var(--c-sand-33);border:2px solid var(--c-gold-75);border-radius:var(--radius-2xl);
  box-shadow:0 12px 40px color-mix(in srgb, var(--c-sand-24) 35%, transparent);font:var(--fs-md)/var(--lh-normal) var(--font-system)}
.sound-test header{display:flex;gap:var(--sp-4);align-items:center;padding:var(--sp-5) var(--sp-6);border-bottom:1px solid var(--c-gold-87b)}
.sound-test header h2{font-size:var(--fs-base);margin:0;flex:1}
.sound-test .st-tools{display:flex;gap:var(--sp-3);flex-wrap:wrap;padding:var(--sp-4) var(--sp-6);border-bottom:1px solid var(--c-cream-91)}
.sound-test input,.sound-test select{font:inherit;padding:var(--sp-2) var(--sp-3);border:1px solid var(--c-gold-80);border-radius:var(--radius-sm);background:var(--surface-bright)}
.sound-test input{flex:1;min-width:120px}
.sound-test button{font:inherit;border:1px solid var(--c-gold-75);background:var(--c-gold-93);border-radius:var(--radius-sm);padding:3px 9px;cursor:pointer}
.sound-test button:hover{background:var(--c-gold-89c)}
.sound-test ol{list-style:none;margin:0;padding:var(--sp-2) var(--sp-4) var(--sp-5);overflow:auto}
.sound-test li{display:grid;grid-template-columns:auto 1fr;gap:var(--sp-1) var(--sp-4);padding:var(--sp-3) var(--sp-2);border-bottom:1px dashed var(--c-gold-89b)}
.sound-test li b{font-family:var(--font-mono);font-size:var(--fs-sm)}
.sound-test .st-meta{grid-column:2;color:var(--c-sand-48);font-size:var(--fs-sm)}
.sound-test .st-tag{display:inline-block;border-radius:var(--radius-md);padding:0 var(--sp-3);margin-left:var(--sp-3);font-size:var(--fs-xs);background:var(--surface-moss);color:var(--c-lime-43)}
.sound-test .st-tag.synth{background:var(--c-mauve-93);color:var(--c-violet-38)}
.sound-test .st-tag.none{background:var(--c-mauve-92);color:var(--c-red-43)}
.sound-test footer{padding:var(--sp-3) var(--sp-6);border-top:1px solid var(--c-gold-87b);color:var(--c-sand-48);font-size:var(--fs-sm)}
`;

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/**
 * @param {{ document: Document, playSound: (key: string, opts?: object) => unknown,
 *   board: () => any, unmute: () => Promise<void> }} host
 */
export async function openSoundTest(host) {
  const doc = host.document;
  if (doc.getElementById('sound-test')) return;
  const style = el(doc, 'style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const res = await fetch('assets/content/sound-keys.json');
  const catalog = res.ok ? await res.json() : { keys: {}, counts: {} };
  const rows = Object.entries(catalog.keys).map(([key, row]) => ({ key, ...row, play: resolveSound(key) }));

  const panel = el(doc, 'section', { id: 'sound-test', class: 'sound-test', role: 'dialog', 'aria-label': 'Sound test' });
  const header = el(doc, 'header');
  header.appendChild(el(doc, 'h2', {}, 'Sound test'));
  const enable = el(doc, 'button', { type: 'button' }, 'Enable sound');
  enable.addEventListener('click', () => host.unmute());
  const close = el(doc, 'button', { type: 'button', 'aria-label': 'Close sound test' }, 'Close');
  close.addEventListener('click', () => panel.remove());
  header.append(enable, close);

  const tools = el(doc, 'div', { class: 'st-tools' });
  const search = el(doc, 'input', { type: 'search', placeholder: 'Search keys or moments', 'aria-label': 'Search sounds' });
  const category = el(doc, 'select', { 'aria-label': 'Category' });
  const cats = ['all-sfx', 'all', ...[...new Set(rows.map((r) => r.category))].sort()];
  for (const c of cats) category.appendChild(el(doc, 'option', { value: c }, c === 'all-sfx' ? 'all except music' : c));
  const kind = el(doc, 'select', { 'aria-label': 'What plays' });
  for (const k of ['any', 'file', 'synth', 'silent']) kind.appendChild(el(doc, 'option', { value: k }, k));
  const playShown = el(doc, 'button', { type: 'button' }, 'Play shown');
  tools.append(search, category, kind, playShown);

  const list = el(doc, 'ol');
  const footer = el(doc, 'footer');
  panel.append(header, tools, list, footer);
  doc.body.appendChild(panel);

  let shown = [];
  const ORIGIN_TAGS = { 'wayback-c2': 'recovered', 'archiveorg-sfx': 'archive.org', 'downloads-best-fit': 'downloads' };
  function fileTag(row) {
    const owner = row.alias ? catalog.keys[row.alias] : row;
    const tag = ORIGIN_TAGS[owner?.origin] || 'recovered';
    return row.alias ? `${tag} · as ${row.alias}` : tag;
  }
  function what(row) {
    if (row.play.file) return 'file';
    if (row.play.recipe) return 'synth';
    return 'silent';
  }
  function render() {
    const q = search.value.trim().toLowerCase();
    const c = category.value;
    const k = kind.value;
    shown = rows.filter((r) => {
      if (c === 'all-sfx' && r.category === 'music') return false;
      if (!c.startsWith('all') && r.category !== c) return false;
      if (k !== 'any' && what(r) !== k) return false;
      if (q && !`${r.key} ${r.moment} ${r.play.recipe || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list.replaceChildren();
    for (const r of shown.slice(0, 400)) {
      const li = el(doc, 'li');
      const btn = el(doc, 'button', { type: 'button', 'data-sound-key': r.key }, 'Play');
      btn.addEventListener('click', () => host.playSound(r.key, { volume: 0.8, allowMultiple: true }));
      const name = el(doc, 'div');
      name.appendChild(el(doc, 'b', {}, r.key));
      const w = what(r);
      name.appendChild(el(doc, 'span', { class: `st-tag ${w === 'file' ? '' : w === 'synth' ? 'synth' : 'none'}` },
        w === 'file' ? fileTag(r) : w === 'synth' ? `synth: ${r.play.recipe}` : 'not recovered'));
      const meta = el(doc, 'div', { class: 'st-meta' }, `${r.category} · ${r.moment || ''}${r.url ? ` · ${r.url.replace('http://c2.glitch.bz/sounds/', 'c2:')}` : ''}`);
      li.append(btn, name, meta);
      list.appendChild(li);
    }
    const counts = catalog.counts || {};
    footer.textContent = `${shown.length} shown · ${counts.keys || rows.length} keys · ${rows.filter((r) => r.play.file).length} play a recording (${counts.withFile || 0} files) · ${rows.filter((r) => !r.play.file && r.play.recipe).length} synthesized`;
    const view = doc.querySelector('canvas');
    if (view) {
      view.dataset.soundTestShown = String(shown.length);
      view.dataset.soundTestKeys = String(rows.length);
    }
  }
  search.addEventListener('input', render);
  category.addEventListener('change', render);
  kind.addEventListener('change', render);
  playShown.addEventListener('click', () => {
    shown.slice(0, 40).forEach((r, i) => setTimeout(() => host.playSound(r.key, { volume: 0.7, allowMultiple: true, maxSeconds: 1.5 }), i * 700));
  });
  render();
  const want = new URLSearchParams(location.search).get('soundtest');
  if (want && want !== '1') {
    search.value = want;
    render();
  }
}
