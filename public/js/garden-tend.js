/**
 * Tending a garden from the keyboard (bug report #5, 2026-10-30: "pressing enter at a crop garden
 * only brings up the crop garden and not the stuff in it").
 *
 * The original client (glitch-client, com/tinyspeck/engine):
 * - view/renderer/LocationInputHandler.as 209-238: Enter takes the garden as one thing (its plots
 *   are cells of one GardenView, not sprites of their own), leaving out gardens you do not own.
 * - control/TSFrontController.as 3727-3733 tryAOneClickActionOnALIS: a garden you own, reached
 *   by a key and not a click, starts tending (port/GardenManager.as 133-148 startEditing), not a
 *   menu. GardenView.as 690-695 setOwners: a garden with no owner (a street's) is everyone's.
 * - view/ui/garden/GardenView.as 713-722 is_tending: the garden takes the keys and the first
 *   plot glows with its details (highlightPlot 394-427); the first plot is the last child
 *   placed (108-158 lay the plots out backwards), plot 0, the front row's left end.
 * - GardenView.as 588-672 onKeyDown: Up/W, Down/S, Left/A and Right/D move between plots with the
 *   wraps below; Enter acts on the plot (onPlotClick, its menu). GardenManager.as 176-181: Esc
 *   stops tending, as does a click off the garden (165-174).
 *
 * Plot ids there are row * cols + col, row 0 at the front (GardenView.as 155: y = (rows-1-row)
 * steps down from the back). The remake's plot keys are "c-r" with c from 1 at the left and r
 * from 1 at the back (garden.js createGarden, game.js spawnGarden), so r = rows - row.
 */

/** The remake's plot key for the client's plot id. */
export function plotKeyForId(id, cols, rows) {
  const col = id % cols;
  const row = Math.floor(id / cols);
  return `${col + 1}-${rows - row}`;
}

/** The client's plot id for a remake plot key ("c-r"). */
export function plotIdForKey(key, cols, rows) {
  const [c, r] = String(key).split('-').map(Number);
  return (rows - r) * cols + (c - 1);
}

/** The plot that glows when tending starts: plot 0 (GardenView.as is_tending 718). */
export function firstTendKey(cols, rows) {
  return plotKeyForId(0, cols, rows);
}

/** GardenView.as onKeyDown 594-656: the next plot id for a direction, with the client's wraps. */
export function stepPlotId(id, dir, cols, rows) {
  const last = cols * rows;
  if (dir === 'up') {
    if (id === last - cols) return cols - 1;
    if (id >= last - cols) return (id % cols) - 1;
    return id + cols;
  }
  if (dir === 'right') {
    if (id === cols - 1) return cols * (rows - 1);
    if (id % cols === cols - 1) return id - (cols * 2 - 1);
    return id + 1;
  }
  if (dir === 'down') {
    if (id === cols - 1) return cols * (rows - 1);
    if (id < cols) return last - (cols - 1 - (id % cols));
    return id - cols;
  }
  if (dir === 'left') {
    if (id === last - cols) return cols - 1;
    if (id % cols === 0) return id + cols * 2 - 1;
    return id - 1;
  }
  return id;
}

/** The next plot key for a direction. */
export function stepTendKey(key, dir, cols, rows) {
  return plotKeyForId(stepPlotId(plotIdForKey(key, cols, rows), dir, cols, rows), cols, rows);
}

/** What a keydown does while tending: a direction, 'tend' (Enter or E), or null. */
export function tendKeyAction(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': return 'up';
    case 'ArrowDown': case 's': case 'S': return 'down';
    case 'ArrowLeft': case 'a': case 'A': return 'left';
    case 'ArrowRight': case 'd': case 'D': return 'right';
    case 'Enter': case 'e': case 'E': return 'tend';
    default: return null;
  }
}
