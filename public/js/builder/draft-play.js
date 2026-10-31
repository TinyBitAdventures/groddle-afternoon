/**
 * LEVEL BUILDER play-test (spec 6.8): /play/?practice=1&autostart=1&draft=<id>&street=<key>
 * [&streetx=&streety=]. Runs in game.js main() before the start street is chosen:
 *
 * 1. fetches the REST nonce and GET groddle/v1/admin/builder/drafts/<id>/play (an administrator's
 *    session only: the site's builder routes are manage_options, and off unless the builder is on);
 * 2. registers the draft's streets (street-loader.js registerDraftStreets), so loadStreetData never
 *    fetches them and signposts between them work;
 * 3. merges their population rows into the ecology catalog (street-ecology.js);
 * 4. answers the start tsid, as ?streetdemo= would.
 *
 * practice-mode.js makes every draft link a practice copy, so the real save never records a GZ
 * street. A multiplayer page never takes a draft (and /play/online/ strips every parameter). A
 * refusal (signed out, not an administrator, no such draft, the builder off) says "That draft is
 * not available." and the game starts on its usual street. A small banner names the draft and its
 * rev, with a link back to the builder.
 */
import { registerDraftStreets } from '../street-loader.js?v=d6cbbd5c';
import { getStreetEcologyCatalog, setStreetEcologyCatalog } from '../street-ecology.js?v=7e30da8f';
import { createBuilderApi } from './api.js?v=3f83c00b';

export const DRAFT_REFUSED = 'That draft is not available.';

/** PURE: the play-test a page address asks for, or null. */
export function draftParams(search) {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''));
  if (!p.has('draft')) return null;
  const draft = p.get('draft') || '';
  return { draft: /^[a-z][a-z0-9-]{2,47}$/.test(draft) ? draft : '', street: p.get('street') || '' };
}

/** PURE: the builder's address for a draft street (the banner's way back). */
export function builderUrl(draft, street = '') {
  return `/console/builder/#draft=${encodeURIComponent(draft)}${street ? `&street=${encodeURIComponent(street)}` : ''}`;
}

/** PURE: the banner's words. */
export function bannerWords({ label, rev }) {
  return `Draft: ${label} (rev ${rev})`;
}

/**
 * Load a draft for a play-test. Resolves { id, rev, tsid, key, label } or { refused } (never throws).
 * @param {URLSearchParams|string} search
 * @param {{ mode?: string, api?: object }} [opts]
 */
export async function startDraftPlay(search, { mode = 'solo', api = createBuilderApi() } = {}) {
  const want = draftParams(search);
  if (!want) return null;
  if (mode === 'multiplayer' || !want.draft) return { refused: DRAFT_REFUSED };
  let bundle;
  try {
    bundle = await api.play(want.draft);
  } catch {
    return { refused: DRAFT_REFUSED };
  }
  const keys = bundle?.keys || {};
  const streets = bundle?.streets || {};
  const tsids = registerDraftStreets(bundle?.index || {}, streets);
  if (!tsids.length) return { refused: DRAFT_REFUSED };
  const eco = getStreetEcologyCatalog();
  setStreetEcologyCatalog({ ...eco, streets: { ...(eco?.streets || {}), ...(bundle.ecology || {}) } });
  const key = want.street && keys[want.street] ? want.street : Object.keys(keys)[0];
  const tsid = keys[key] || tsids[0];
  return { id: want.draft, rev: bundle.draft?.rev ?? 0, tsid, key, label: streets[tsid]?.label || tsid, title: bundle.draft?.title || want.draft };
}

/** The banner (or the refusal), a small status line over the game. */
export function showDraftBanner(doc, info) {
  if (!doc?.body || !info) return null;
  doc.getElementById('draft-banner')?.remove();
  const note = doc.createElement('div');
  note.id = 'draft-banner';
  note.setAttribute('role', 'status');
  note.style.cssText = [
    // Bottom left: clear of the street nameplate, the moment card and the pack row.
    'position:fixed', 'left:12px', 'bottom:12px', 'z-index:9999',
    'display:flex', 'gap:10px', 'align-items:center', 'padding:4px 12px', 'border-radius:999px',
    'font:600 12px/1.4 Nunito,"Trebuchet MS",system-ui,sans-serif', 'background:rgba(48,70,44,0.88)', 'color:#fbfaf2',
    'white-space:nowrap',
  ].join(';');
  const words = doc.createElement('span');
  words.textContent = info.refused ? info.refused : bannerWords(info);
  note.append(words);
  if (!info.refused) {
    const back = doc.createElement('a');
    back.href = builderUrl(info.id, info.key);
    back.textContent = 'Back to the builder';
    back.style.cssText = 'color:#ffe7a0;text-decoration:underline';
    note.append(back);
  }
  doc.body.append(note);
  if (info.refused) setTimeout(() => note.remove(), 8000);
  return note;
}
