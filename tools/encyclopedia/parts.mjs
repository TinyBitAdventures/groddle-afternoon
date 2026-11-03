/**
 * The encyclopedia's shared page parts (docs/encyclopedia.md "Visual design"):
 * tiles, recipe rows, vendor cards, chips and the status badge, drawn at build
 * time for the item pages (tools/catalog/build.mjs) and every encyclopedia
 * page (tools/encyclopedia/build.mjs). Styles: public/encyclopedia/items/catalog.css
 * (".ency-*"), colours only from the site's tokens.
 */

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const fmt = (n) => Number(n).toLocaleString('en-US');
export const andList = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);
export const orList = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} or ${parts.at(-1)}`);
export const article = (name) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

/** Every status an entry can carry, with the badge's words (ours). */
export const STATUS = {
  source: { label: 'In the remake', inRemake: true },
  rebuilt: { label: 'Rebuilt', inRemake: true },
  reimagined: { label: 'Reimagined', inRemake: true },
  solo: { label: 'Adapted for solo', inRemake: true },
  partial: { label: 'Partly in', inRemake: true },
  multiplayer: { label: 'In multiplayer', inRemake: true },
  missing: { label: 'Not yet', inRemake: false },
  lost: { label: 'Lost', inRemake: false },
  unbuilt_original: { label: 'Never finished', inRemake: false },
};
export const statusLabel = (s) => STATUS[s]?.label || s;
export const inRemake = (s) => Boolean(STATUS[s]?.inRemake);
/**
 * A comma or full stop that is read but not seen (".ency-sep" in catalog.css):
 * where the page shows two lines as separate boxes ("Beelzebooze" over
 * "involves it"), copied text, Reader mode and screen readers would join them
 * ("Beelzeboozeinvolves it", ticket 65). It goes at the end of the first line's
 * own span, with a real space after that span, so Chrome copies
 * "Beelzebooze,\ninvolves it" and Firefox and Reader mode "Beelzebooze, involves it".
 */
export const sep = (mark = ',') => `<span class="ency-sep">${mark}</span>`;
/** A chip's label ends in its last <span>: the comma goes inside it (a flex item of its own would add a gap). */
const sepChip = (html) => html.replace(/<\/span>(<\/(?:a|span)>)$/, `${sep()}</span>$1`);

export const badge = (s) => `<span class="pill st-${esc(s)}">${esc(statusLabel(s))}</span>`;

/** The site-root path of an entry key: item:<id> or <section>:<id>. */
export function pathOf(key) {
  const [section, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  return section === 'item' ? `encyclopedia/items/${id}/` : `encyclopedia/${section}/${id}/`;
}

/**
 * Parts bound to a page: `p` is the path from the page to the site root,
 * `info(key)` names any key that has a page ({ name, icon, status } or null),
 * and `nameOf(key)` names one that has none (a blank stub left out,
 * data.mjs isBlankStub), so its tile is its name in plain text.
 */
export function makeParts(p, info, nameOf = () => null) {
  const href = (key) => `${p}${pathOf(key)}`;
  const img = (pic, cls = 'ency-ic', size = 48) => {
    if (!pic) return `<span class="${cls} cat-ph" aria-hidden="true"></span>`;
    const scale = Math.min(pic.hi ? 3 : 2, size / Math.max(pic.w, pic.h));
    const w = Math.max(1, Math.round(pic.w * scale));
    const h = Math.max(1, Math.round(pic.h * scale));
    const srcset = pic.hi ? ` srcset="${p}${esc(pic.src)} 1x, ${p}${esc(pic.hi)} 3x"` : '';
    return `<img class="${cls}" src="${p}${esc(pic.src)}"${srcset} alt="" width="${w}" height="${h}" loading="lazy" decoding="async" />`;
  };
  /** A small picture card for one thing. opts: sub (a short line), n (a count), anchor (#id), title. */
  const tile = (key, opts = {}) => {
    const it = info(key);
    const name = opts.name || it?.name || nameOf(key) || key.slice(key.indexOf(':') + 1);
    const n = opts.n && Number(opts.n) !== 1 ? `<span class="ency-n">×${esc(fmt(opts.n))}</span>` : '';
    const sub = opts.sub ? ` <span class="ency-tile-sub">${opts.sub}</span>` : '';
    const body = `<span class="ency-tile-pic">${img(it?.icon, 'ency-ic', 48)}${n}</span> <span class="ency-tile-name">${esc(name)}${sub ? sep() : ''}</span>${sub}`;
    const st = it?.status && !inRemake(it.status) ? ' ency-tile-out' : '';
    return it
      ? `<li><a class="ency-tile${st}" href="${href(key)}${opts.anchor ? `#${esc(opts.anchor)}` : ''}">${body}</a></li>`
      : `<li><span class="ency-tile ency-tile-plain">${body}</span></li>`;
  };
  const tiles = (list, cls = '') => (list.length ? `<ul class="ency-tiles${cls ? ` ${cls}` : ''}">${list.join('')}</ul>` : '');
  /** A chip: label with an optional picture and link. */
  const chip = (label, { pic = null, link = null, cls = '' } = {}) => {
    const inner = `${pic ? img(pic, 'ency-chip-ic', 20) : ''}<span>${label}</span>`;
    return link ? `<a class="ency-chip${cls ? ` ${cls}` : ''}" href="${link}">${inner}</a>` : `<span class="ency-chip${cls ? ` ${cls}` : ''}">${inner}</span>`;
  };
  /** A row of chips, read as a list: "75 iMG, 10 favor with Pot, Recipe: Tasty Pasta". */
  const chipRow = (list) => list.map((c, i) => (i < list.length - 1 ? sepChip(c) : c)).join(' ');
  const chips = (list, cls = '') => (list.length ? `<p class="ency-chips${cls ? ` ${cls}` : ''}">${chipRow(list)}</p>` : '');
  /** A recipe as ingredients, an arrow and the result, with the tool and skill as chips. */
  const recipeRow = (r, { id = '', note = '' } = {}) => {
    const ins = (r.inputs || []).map((i) => tile(`item:${i.classTsid}`, { n: i.qty }));
    const outs = (r.outputs || []).map((o) => tile(`item:${o.classTsid}`, { n: o.qty }));
    const extras = [];
    if (r.tool) extras.push(chip(`with ${article(info(`item:${r.tool}`)?.name || r.tool)} ${esc(info(`item:${r.tool}`)?.name || r.tool)}`, { pic: info(`item:${r.tool}`)?.icon, link: info(`item:${r.tool}`) ? href(`item:${r.tool}`) : null }));
    else extras.push(chip('by hand'));
    if (r.skill && info(`skills:${r.skill}`)) extras.push(chip(`needs ${esc(info(`skills:${r.skill}`).name)}`, { pic: info(`skills:${r.skill}`).icon, link: href(`skills:${r.skill}`) }));
    if (note) extras.push(chip(note));
    return `<div class="ency-recipe"${id ? ` id="${esc(id)}"` : ''}>
            ${r.name ? `<p class="ency-recipe-name">${esc(r.name)}</p>` : ''}<div class="ency-recipe-row"><ul class="ency-tiles ency-ins">${ins.join('<li class="ency-plus" aria-hidden="true">+</li>')}</ul> <span class="ency-arrow" aria-label="makes">→</span> <ul class="ency-tiles ency-outs">${outs.join('')}</ul></div>
            ${chips(extras)}
          </div>`;
  };
  /** A store card: the keeper's picture, the store's name and the price in currants. */
  const currants = (n, cls = 'ency-price') => `<span class="${cls}">${img(info('item:pile_of_currants')?.icon || null, 'ency-chip-ic', 18)}<span>${esc(fmt(n))} currants</span></span>`;
  const vendorCard = (key, { price, label } = {}) => {
    const it = info(key);
    const body = `${img(it?.icon, 'ency-vendor-ic', 52)}<span class="ency-vendor-text"><span class="ency-vendor-name">${esc(label || it?.name || key)}${price ? sep() : ''}</span>${price ? ` ${currants(price)}` : ''}</span>`;
    return it ? `<li><a class="ency-vendor" href="${href(key)}">${body}</a></li>` : `<li><span class="ency-vendor">${body}</span></li>`;
  };
  const vendors = (list) => (list.length ? `<ul class="ency-vendors">${list.join('')}</ul>` : '');
  return { href, img, tile, tiles, chip, chips, chipRow, recipeRow, vendorCard, vendors, currants };
}

/**
 * Tiny Speck's text with its markup made safe: <b>/<i>, <br>, links to items
 * (<a href="event:item|x"> or <a glitch="item|x">) pointing at the item's or
 * creature's page when there is one, and <split .../> (a pause in a
 * conversation) as a new paragraph. Returns paragraphs of HTML.
 */
export function tsHtml(text, linkFor) {
  const out = [];
  let open = null;
  const re = /<(\/?)([a-z]+)([^>]*)>/gi;
  let at = 0;
  let m;
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  while ((m = re.exec(src))) {
    out.push(esc(src.slice(at, m.index)));
    at = re.lastIndex;
    const [, close, tagRaw, attrs] = m;
    const tag = tagRaw.toLowerCase();
    if (tag === 'i' || tag === 'b') out.push(`<${close}${tag === 'i' ? 'em' : 'strong'}>`);
    else if (tag === 'br') out.push('\n');
    else if (tag === 'split') out.push('\n\n');
    else if (tag === 'a' && !close) {
      const id = /(?:event:|glitch=")item\|([a-z0-9_]+)/.exec(attrs)?.[1];
      const link = id ? linkFor(id) : null;
      if (link) { out.push(`<a href="${link}">`); open = 'a'; } else open = 'skip';
    } else if (tag === 'a' && close) {
      if (open === 'a') out.push('</a>');
      open = null;
      // Tiny Speck's peat text runs a link into the next word ("Shovel</a>or", items/peat_1.js:608).
      if (/^[a-z]/i.test(src.slice(at))) out.push(' ');
    }
  }
  out.push(esc(src.slice(at)));
  return out.join('').trim().split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\n/g, '<br />'));
}

export const plainText = (text) => String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
