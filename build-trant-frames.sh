#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRANT_DIR="${SCRIPT_DIR}/public/assets/sprites/trants"
FRAME_DIR="${TRANT_DIR}/frames"

mkdir -p "${FRAME_DIR}"

# The OGA files are animation atlases even though their filenames describe one
# maturity/fruit state. Each row below selects the last populated, fully
# fruited source cell. Never alpha-trim or resize the complete atlas.
while read -r species cell_w cell_h maturity column row; do
  source="${TRANT_DIR}/trant_${species}_m${maturity}.png"
  target="${FRAME_DIR}/trant_${species}_m${maturity}.png"
  x=$((column * cell_w))
  y=$((row * cell_h))

  magick "${source}" \
    -crop "${cell_w}x${cell_h}+${x}+${y}" \
    +repage \
    "${target}"
done <<'FRAMES'
fruit 271 249 1 0 3
fruit 271 249 3 0 3
fruit 271 249 5 2 10
fruit 271 249 7 10 3
fruit 271 249 10 14 3
egg 296 278 1 2 0
egg 296 278 3 1 1
egg 296 278 5 0 6
egg 296 278 7 0 11
egg 296 278 10 10 4
bean 198 270 1 3 1
bean 198 270 3 3 1
bean 198 270 5 0 10
bean 198 270 7 3 11
bean 198 270 10 2 13
bubble 167 277 1 3 1
bubble 167 277 3 4 1
bubble 167 277 5 0 12
bubble 167 277 7 23 2
bubble 167 277 10 18 3
gas 276 258 1 0 3
gas 276 258 3 0 3
gas 276 258 5 2 7
gas 276 258 7 2 14
gas 276 258 10 10 3
spice 318 250 1 0 3
spice 318 250 3 0 3
spice 318 250 5 2 14
spice 318 250 7 8 4
spice 318 250 10 10 5
FRAMES

echo "Rebuilt 30 exact living-trant cells in ${FRAME_DIR}"
