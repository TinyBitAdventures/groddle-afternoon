/**
 * G254: the client's keys (TSMainView.as startListeningtoKeys 639-661, the
 * hotkey sheet hotkeys.png) that the remake answers, and the client's hotkey
 * sheet itself.
 *
 * KeyBeacon.as _keyDownFire 278-303 sends a letter pressed with Shift as
 * SHIFT_PLUS_KEY_DOWN_ only (287-295), so a plain-key handler never hears its
 * Shift twin: M is the map and Shift+M the chat map, never both.
 *
 * The sheet (view/ui/Hotkeys.as; its art is TSEngineAssets/src/assets/graphics/
 * hotkeys.png): holding ? shows it and letting go of ? or Shift hides it
 * (TSMainView.as 656-657, shiftSlashKeyHandler 942-960), over a 40% black shade
 * (Hotkeys.as refresh 89-101: beginFill(0, .4)), fading in over 0.1 s
 * (ANI_TIME, 26). The client's sheet listed the client's keys. This one keeps
 * the sheet's title, sections, labels and footer and lists the keys the remake
 * answers, so it never names a key that does nothing here.
 */

/**
 * Every client key the coverage row G254 named, with the remake's answer:
 * `action` is what clientKeyAction returns, or null with `why` when the remake
 * has no panel for it.
 */
export const CLIENT_KEY_TABLE = Object.freeze([
  { key: 'M', handler: 'mKeyHandler', action: 'map' },
  { key: 'Shift+L', handler: 'shiftLKeyHandler', action: 'looks' },
  { key: 'Shift+D', handler: 'shiftDKeyHandler', action: 'decorate' },
  { key: 'Shift+F', handler: 'shiftFKeyHandler', action: null, why: 'no inventory search in the pack' },
  { key: '`', handler: 'shiftFKeyHandler', action: null, why: 'no inventory search in the pack' },
  { key: 'Shift+K', handler: 'shiftKKeyHandler', action: 'keyring' },
  { key: 'Shift+M', handler: 'shiftMKeyHandler', action: null, why: 'no chat map (the right-hand minimap tab)' },
  { key: 'Shift+/', handler: 'shiftSlashKeyHandler', action: 'hotkeys' },
  { key: 'I', handler: 'iKeyHandler', action: null, why: 'no info mode' },
  { key: 'Z', handler: 'zKeyHandler', action: 'player-menu' },
  { key: ',', handler: 'commaKeyHandler', action: null, why: 'no preferences dialog' },
]);

/**
 * The remake's answer to a keydown, or null. Ctrl, Alt and Cmd combinations are
 * the browser's (Cmd+, Cmd+Z), never the game's.
 * @param {{ key: string, code?: string, shiftKey?: boolean, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean }} e
 * @returns {'map'|'player-menu'|'looks'|'keyring'|'decorate'|'hotkeys'|null}
 */
export function clientKeyAction(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (isHotkeySheetKey(e)) return 'hotkeys';
  const k = String(e.key || '').toLowerCase();
  if (!e.shiftKey) {
    if (k === 'm') return 'map';
    if (k === 'z') return 'player-menu';
    return null;
  }
  if (k === 'l') return 'looks';
  if (k === 'k') return 'keyring';
  if (k === 'd') return 'decorate';
  return null;
}

/** A letter with no modifier, either case (caps lock), as KeyBeacon's plain KEY_DOWN_. */
export function isPlainKey(e, letter) {
  return Boolean(e) && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && String(e.key || '').toLowerCase() === letter;
}

export const HOTKEYS_TITLE = 'Hotkeys and Shortcuts';
export const HOTKEYS_FOOTER = "Open this list by holding the '?' Key.";

/**
 * The sheet's sections in the client's order (hotkeys.png: Menus, Interface,
 * Modes, Emotions, View). Each row is [label, alternatives, note?]; each
 * alternative is a key combination such as ['Shift', 'S'].
 * @param {{ keyring?: boolean }} opts keyring: the multiplayer keyring is there
 */
export function hotkeySections({ keyring = false } = {}) {
  return [
    {
      title: 'Menus',
      rows: [
        ['Player Menu', [['Z']]],
        ['Imagination Menu', [['X']]],
        ['Quest Log', [['Q']]],
        ['Skills', [['K'], ['Shift', 'S']]],
        ['Upgrades', [['U']]],
        ['Looks', [['L'], ['Shift', 'L']]],
        ['Badges', [['B']]],
        ['Feat', [['H']]],
        ['Buffs', [['Y']]],
        ['Vendor', [['V']]],
      ],
    },
    {
      title: 'Interface',
      rows: [
        ['Show Map', [['M'], ['G']]],
        ['Teleport', [['Shift', 'T']]],
        ...(keyring ? [['Key Ring', [['Shift', 'K']]]] : []),
        ['Verbs', [['Enter'], ['E']]],
      ],
    },
    {
      title: 'Modes',
      rows: [
        ['Cultivation Mode', [['Shift', 'C']], '(Only on home streets and yards)'],
        ['Decorate Mode', [['Shift', 'D']], '(Only inside your house or tower)'],
      ],
    },
    { title: 'Emotions', rows: [['Say Hi!', [['5']]]] },
    { title: 'View', rows: [['Camera Mode', [['C']]]] },
  ];
}

/** "Shift+S or K" style text for one row's keys. */
export function hotkeyText(alternatives) {
  return alternatives.map((combo) => combo.join('+')).join(' or ');
}

/** True for the keydown that opens the sheet (Shift+/ is "?" on most layouts). */
export function isHotkeySheetKey(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return false;
  return e.key === '?' || (e.shiftKey && (e.code === 'Slash' || e.key === '/'));
}

/** True for the keyup that hides it: ? or / or Shift let go (shiftSlashKeyHandler 952-959). */
export function isHotkeySheetRelease(e) {
  return e?.key === '?' || e?.key === '/' || e?.key === 'Shift' || e?.code === 'Slash';
}

/**
 * The sheet's DOM, built once on first show.
 * @param {Document} doc
 * @param {{ keyring?: () => boolean }} opts
 */
export function createHotkeysSheet(doc, { keyring = () => false } = {}) {
  let shade = null;
  const build = () => {
    shade = doc.createElement('div');
    shade.id = 'hotkeys-shade';
    shade.className = 'hotkeys-shade';
    shade.hidden = true;
    const card = doc.createElement('section');
    card.className = 'hotkeys-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'hotkeys-title');
    shade.append(card);
    doc.body.append(shade);
  };
  const render = () => {
    const card = shade.firstChild;
    card.replaceChildren();
    const badge = doc.createElement('span');
    badge.className = 'hotkeys-badge';
    badge.textContent = '?';
    const title = doc.createElement('h2');
    title.id = 'hotkeys-title';
    title.textContent = HOTKEYS_TITLE;
    const cols = doc.createElement('div');
    cols.className = 'hotkeys-cols';
    for (const section of hotkeySections({ keyring: keyring() })) {
      const box = doc.createElement('div');
      box.className = 'hotkeys-section';
      const h = doc.createElement('h3');
      h.textContent = `${section.title}:`;
      const list = doc.createElement('ul');
      for (const [label, alternatives, note] of section.rows) {
        const li = doc.createElement('li');
        li.append(doc.createTextNode(`${label}: `));
        alternatives.forEach((combo, i) => {
          if (i) li.append(doc.createTextNode(' or '));
          const b = doc.createElement('b');
          b.textContent = combo.join('+');
          li.append(b);
        });
        if (note) {
          const small = doc.createElement('small');
          small.textContent = note;
          li.append(small);
        }
        list.append(li);
      }
      box.append(h, list);
      cols.append(box);
    }
    const foot = doc.createElement('p');
    foot.className = 'hotkeys-foot';
    foot.textContent = HOTKEYS_FOOTER;
    card.append(badge, title, cols, foot);
  };
  return {
    show() {
      if (!shade) build();
      render();
      shade.hidden = false;
    },
    hide() {
      if (shade) shade.hidden = true;
    },
    isOpen() {
      return Boolean(shade && !shade.hidden);
    },
  };
}
