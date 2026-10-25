/**
 * G206: the Enter chooser, "Choose the thing you want to interact with:".
 *
 * The original client (glitch-client, com/tinyspeck/engine):
 * - view/renderer/LocationInputHandler.as 209-238 (_beginInteractionAfterEnterKey):
 *   Enter takes every sprite the avatar touches (apo._interaction_spV, the same
 *   set that glows and that the one-target case uses), drops ladders ("there is
 *   no point responding to enter key to get on a ladder"), gardens the player
 *   does not own, and other players where the location has no_pc_interactions.
 *   One left opens it directly; two or more open the disambiguator.
 * - control/engine/AvatarController.as 454-482 (_beginInteractionAfterUpKey): the
 *   Up/W path, where a ladder in the set wins outright (it climbs). The remake's
 *   Up already climbs at a ladder, so ladders never reach this chooser.
 * - control/InteractionMenuController.as 68-100 (startLocationDisambiguator):
 *   sortOn disambugate_sort_on, then a trailing 'x' (cancel) choice, then
 *   present('Choose the thing you want to interact with:'); 102-126: a choice
 *   calls startInteractionWith(target), the target's own menu.
 * - view/itemstack/LocationItemstackView.as 342-357: street spirit 10, npc vendor
 *   20, shrine 30, trant 40, patch 50, other npc 60, anything else 100;
 *   LadderView.as 20 (70), SignpostView.as 74 (80), DoorView.as 46 (90),
 *   PCView.as 70 (110). AS3 Array.sortOn is not stable, so ties had no order;
 *   the remake breaks them nearest first.
 * - view/ui/InteractionMenu.as 474-610 (buildTargetItemCUIs): a grid of 50 px icon
 *   buttons, the 'x' tile last; 1957-2003 (updateAfterCUIFocus): the line under
 *   the title names the focused choice ("label (count)", "Signpost to A, B",
 *   "Door to X", "Cancel..."); 1196-1222: the first choice has focus;
 *   1631-1678: Left/A and Right/D step back and forth with wrap, Up/W and
 *   Down/S move a row only when there is more than one row, Enter chooses,
 *   Esc cancels; 1680-1712: hover focuses, a click chooses; 1352-1355: a
 *   choice plays CLICK_SUCCESS. No number keys (key_hash is only filled for
 *   verb menus, 829). 1149-1153: placed in the middle of the location view.
 */

export const ENTER_CHOOSER_TITLE = 'Choose the thing you want to interact with:';

/** disambugate_sort_on, by kind (TSSprite.as 87 returns 0 for anything without an override). */
export const SORT_VALUES = Object.freeze({
  street_spirit: 10,
  vendor: 20,
  shrine: 30,
  trant: 40,
  patch: 50,
  animal: 60,
  ladder: 70,
  signpost: 80,
  door: 90,
  item: 100,
  pc: 110,
});

const DOOR_CLASS = /(^|_)door$/;

/** What kind of thing a remake interactable is, in the client's terms. */
export function choiceKind(target) {
  if (!target) return 'item';
  if (target.chooserKind) return target.chooserKind;
  const id = String(target.classId || '');
  if (/ladder/.test(id)) return 'ladder';
  if (/^pc_/.test(id)) return 'pc';
  if (DOOR_CLASS.test(id)) return 'door';
  return 'item';
}

/** LocationItemstackView.disambugate_sort_on, string tests on the item class tsid. */
export function itemSortValue(classId, { shrine = false } = {}) {
  const id = String(classId || '');
  if (id.indexOf('street_spirit') > -1) return SORT_VALUES.street_spirit;
  if (id.indexOf('npc') === 0 && id.indexOf('vendor') > -1) return SORT_VALUES.vendor;
  // _item.is_shrine: every GSJS shrine class is npc_shrine_*.
  if (shrine || id.indexOf('npc_shrine') === 0) return SORT_VALUES.shrine;
  if (id.indexOf('trant') === 0) return SORT_VALUES.trant;
  if (id.indexOf('patch') === 0) return SORT_VALUES.patch;
  if (id.indexOf('npc') === 0) return SORT_VALUES.animal;
  return SORT_VALUES.item;
}

export function sortValue(choice) {
  const kind = choice?.kind || 'item';
  if (kind === 'item') return itemSortValue(choice.classId, { shrine: Boolean(choice.target?.isShrine) });
  return SORT_VALUES[kind] ?? SORT_VALUES.item;
}

/** The client's order; ties nearest first, then the order they were found. */
export function orderChoices(choices) {
  return choices
    .map((choice, index) => ({ choice, index, value: sortValue(choice) }))
    .sort((a, b) => a.value - b.value
      || (a.choice.distance ?? 0) - (b.choice.distance ?? 0)
      || a.index - b.index)
    .map((row) => row.choice);
}

/**
 * Garden plots are cells of one GardenView in the client (one interaction
 * sprite), so the chooser lists the garden once. Choosing it opens the plot
 * or bed the remake's nearest-first rule picks, as Enter does today.
 */
export function groupHead(target) {
  return target?.state?.gardenEntity || target;
}

/**
 * @param {{ near: { target: any, distance: number }[], signpost?: { signpost: any, distance: number, labels?: string[] } | null }} input
 * @returns {any[]} ordered choices (no cancel tile)
 */
export function buildEnterChoices({ near = [], signpost = null } = {}) {
  const groups = new Map();
  for (const row of near) {
    const target = row?.target;
    if (!target) continue;
    if (choiceKind(target) === 'ladder') continue;
    const head = groupHead(target);
    const have = groups.get(head);
    if (!have) {
      groups.set(head, { target: head, open: target, distance: row.distance });
    } else if (row.distance < have.distance) {
      have.open = target;
      have.distance = row.distance;
    }
  }
  const choices = [];
  for (const g of groups.values()) {
    choices.push({
      kind: choiceKind(g.target),
      classId: g.target.classId || '',
      label: g.target.label || g.target.classId || '',
      target: g.target,
      open: g.open,
      distance: g.distance,
    });
  }
  if (signpost?.signpost) {
    choices.push({
      kind: 'signpost',
      classId: 'signpost',
      label: 'Signpost',
      signpost: signpost.signpost,
      labels: signpost.labels || [],
      distance: signpost.distance ?? 0,
    });
  }
  return orderChoices(choices);
}

/** One target opens directly; two or more need the chooser. */
export function planEnter(choices) {
  if (!choices?.length) return { mode: 'none', choices: [] };
  if (choices.length === 1) return { mode: 'single', choice: choices[0], choices };
  return { mode: 'chooser', choices };
}

/** The line under the title (InteractionMenu.updateAfterCUIFocus, TYPE_LOC_DISAMBIGUATOR). */
export function describeChoice(choice) {
  if (!choice) return '';
  if (choice.kind === 'cancel') return 'Cancel';
  if (choice.kind === 'signpost') {
    const labels = (choice.labels || []).filter(Boolean);
    return labels.length ? `Signpost to ${labels.join(', ')}` : 'Signpost';
  }
  if (choice.kind === 'door') {
    const to = choice.target?.destinationLabel || choice.target?.state?.destinationLabel;
    return to ? `Door to ${to}` : (choice.label || 'Door');
  }
  const count = choice.target?.classId === 'dropped_item' ? Number(choice.target?.state?.count) : 0;
  return count > 1 ? `${choice.label} (${count})` : choice.label;
}

/** buildTargetItemCUIs: up to 7 in one row, more in a wider grid. */
export function clientGridColumns(count) {
  return count > 7 ? Math.max(4, Math.floor(Math.sqrt(count)) + 4) : Math.min(7, count);
}

/**
 * Keyboard focus moves (InteractionMenu.as 1631-1678, 2011-2097). `count`
 * includes the cancel tile; `cols` is the grid as drawn.
 * @returns {number} the new index (unchanged when the key does not move)
 */
export function gridMove(index, key, count, cols) {
  if (count <= 0) return -1;
  const i = Math.max(0, Math.min(count - 1, index));
  const k = String(key || '');
  if (k === 'ArrowRight' || k === 'd' || k === 'D') return i + 1 >= count ? 0 : i + 1;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') return i - 1 < 0 ? count - 1 : i - 1;
  const c = Math.max(1, cols | 0);
  const rows = Math.ceil(count / c);
  if (rows <= 1) return i;
  const row = Math.floor(i / c);
  const col = i % c;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') {
    if (row === 0) {
      let to = (rows - 1) * c + col;
      if (to > count - 1) to -= c;
      return to;
    }
    return i - c;
  }
  if (k === 'ArrowDown' || k === 's' || k === 'S') {
    if (row === rows - 1) return col;
    const to = i + c;
    return to > count - 1 ? col : to;
  }
  return i;
}

/** The box of pixels with any alpha in an RGBA buffer (null when empty). */
export function alphaBox(rgba, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** A drawn thing as a tile icon, cropped to its art (frames carry empty margins). */
export function trimmedIconUrl(canvas) {
  try {
    const ctx = canvas.getContext('2d');
    const box = ctx && alphaBox(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (!box) return null;
    if (box.width === canvas.width && box.height === canvas.height) return canvas.toDataURL('image/png');
    const out = canvas.ownerDocument.createElement('canvas');
    out.width = box.width;
    out.height = box.height;
    out.getContext('2d').drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    return out.toDataURL('image/png');
  } catch (_) {
    return canvas.toDataURL?.('image/png') || null;
  }
}

const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D']);
const CHOOSE_KEYS = new Set(['Enter', ' ', 'e', 'E']);

/**
 * The chooser card, built on the verb menu and target-item picker styles.
 * @param {{
 *   document: Document,
 *   mount?: Element | null,
 *   iconFor?: (choice: any) => string | null,
 *   onChoose?: (choice: any) => void,
 *   onCancel?: () => void,
 *   playSound?: (key: string) => void,
 *   setData?: (key: string, value: string) => void,
 *   yieldKeys?: () => boolean,
 *   win?: Window,
 * }} opts
 */
export function createEnterChooser(opts) {
  const doc = opts.document;
  const win = opts.win || doc.defaultView;
  const setData = opts.setData || (() => {});
  let root = null;
  let grid = null;
  let sub = null;
  let tiles = [];
  let choices = [];
  let index = 0;
  let open = false;

  function build() {
    if (root) return;
    root = doc.createElement('div');
    root.id = 'enter-chooser';
    root.className = 'verb-menu feed-picker enter-chooser';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'enter-chooser-title');
    root.innerHTML = `
      <div class="verb-menu-card feed-picker-card">
        <div class="verb-menu-head">
          <div id="enter-chooser-title" class="verb-menu-title"></div>
          <button type="button" id="enter-chooser-close" class="verb-menu-x" aria-label="Close">×</button>
        </div>
        <p id="enter-chooser-sub" class="verb-menu-sub" aria-live="polite"></p>
        <div id="enter-chooser-grid" class="feed-picker-grid" role="listbox" aria-label="Things in reach"></div>
        <p class="verb-menu-hint">Enter selects · arrow keys move · Esc cancels</p>
      </div>`;
    root.querySelector('#enter-chooser-title').textContent = ENTER_CHOOSER_TITLE;
    grid = root.querySelector('#enter-chooser-grid');
    sub = root.querySelector('#enter-chooser-sub');
    root.querySelector('#enter-chooser-close').addEventListener('click', () => cancel());
    root.addEventListener('click', (e) => {
      if (e.target === root) cancel();
    });
    (opts.mount || doc.body).appendChild(root);
  }

  function columns() {
    try {
      const n = win.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      return Math.max(1, n || 1);
    } catch (_) {
      return 4;
    }
  }

  function focus(i, { sound = false } = {}) {
    if (!tiles.length) return;
    const next = Math.max(0, Math.min(tiles.length - 1, i));
    if (sound && next !== index) opts.playSound?.('CLICK_SUCCESS');
    index = next;
    tiles.forEach((tile, n) => {
      const on = n === index;
      tile.classList.toggle('is-selected', on);
      tile.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (doc.activeElement !== tiles[index]) tiles[index].focus({ preventScroll: true });
    sub.textContent = describeChoice(choices[index]);
    setData('enterChooserFocus', String(index));
  }

  function choose(i = index) {
    const choice = choices[i];
    if (!choice) return;
    if (choice.kind === 'cancel') {
      cancel();
      return;
    }
    opts.playSound?.('CLICK_SUCCESS');
    close('chosen');
    setData('enterChooserChosen', choice.classId || choice.kind);
    opts.onChoose?.(choice);
  }

  function cancel() {
    close('cancelled');
    opts.onCancel?.();
  }

  function onKey(e) {
    if (!open) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // A conversation or picker opened on top (a crab's offer) takes the keys.
    if (opts.yieldKeys?.()) return;
    // The chooser has focus (InteractionMenu.stops_avatar_on_focus): no key reaches the street.
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (CHOOSE_KEYS.has(e.key)) {
      e.preventDefault();
      if (!e.repeat) choose();
      return;
    }
    if (MOVE_KEYS.has(e.key)) {
      e.preventDefault();
      focus(gridMove(index, e.key, tiles.length, columns()), { sound: true });
    }
  }

  function render(list) {
    grid.innerHTML = '';
    tiles = list.map((choice, n) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'feed-picker-choice';
      button.dataset.index = String(n);
      button.dataset.kind = choice.kind;
      button.dataset.classId = choice.classId || '';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      const text = describeChoice(choice);
      button.setAttribute('aria-label', text);
      button.title = text;
      if (choice.kind === 'cancel') {
        const x = doc.createElement('span');
        x.textContent = '×';
        x.setAttribute('aria-hidden', 'true');
        x.style.cssText = 'font-size:2rem;line-height:50px;height:50px;color:#8a7a62;font-weight:700';
        button.append(x);
      } else {
        const url = opts.iconFor?.(choice);
        if (url) {
          const image = doc.createElement('img');
          image.src = url;
          image.alt = '';
          button.append(image);
        }
      }
      const label = doc.createElement('span');
      label.className = 'feed-picker-choice-label';
      label.textContent = choice.kind === 'cancel' ? 'Cancel' : choice.label;
      button.append(label);
      button.addEventListener('pointerenter', () => focus(n));
      button.addEventListener('focus', () => { if (index !== n) focus(n); });
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        choose(n);
      });
      grid.appendChild(button);
      return button;
    });
  }

  function show(list) {
    build();
    choices = [...list, { kind: 'cancel', classId: '', label: 'Cancel' }];
    index = 0;
    render(choices);
    root.hidden = false;
    open = true;
    win.addEventListener('keydown', onKey, { capture: true });
    setData('enterChooser', 'open');
    setData('enterChooserChoices', list.map((c) => c.classId || c.kind).join(','));
    setData('enterChooserChosen', '');
    sub.textContent = describeChoice(choices[0]);
    // Defer focus so the Enter that opened the chooser does not also choose.
    win.requestAnimationFrame(() => { if (open) focus(0); });
  }

  function close(result = 'closed') {
    if (!root) return;
    root.hidden = true;
    if (open) setData('enterChooser', result);
    open = false;
    win.removeEventListener('keydown', onKey, { capture: true });
  }

  return {
    open: show,
    close,
    isOpen: () => open,
    focusIndex: () => index,
    choices: () => choices.slice(),
  };
}
