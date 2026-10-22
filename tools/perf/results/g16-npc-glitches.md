# Other Glitches as vector avatars (G16): before / after

2026-10-22, viewport 1280x860, uncapped frame rate, headless Chromium on the Metal GPU.
Before = HEAD (raster Wayback crowd sheets), after = the vector NPC looks
(js/npc-glitch.js, 1x sheets at DPR 1, 2x at DPR 2). Runs back to back:
`g16-before2.json`, `g16-after2.json`.

`NPC tex` is exact: the renderer's managed textures labelled `avatar/npc/`
(after) or `avatar/crowd/` (before). The total GPU figure swings with texture
GC timing (Hechey has no NPCs and still reads 187 to 304 MB across runs), and the
machine's load average was 100 to 200 from other work, so read fps and boot
with that in mind.

| Route | DPR | NPC tex MB before → after | Total GPU tex MB before → after | fps before → after | CPU p95 ms before → after | Boot ms before → after |
|---|---|---|---|---|---|---|
| companions | 1 | 1.6 → 8.6 | 188.4 → 179.8 | 574.7 → 574.7 | 3.4 → 2.7 | 3427 → 3540 |
| companions | 2 | 1.6 → 34.3 | 221.8 → 270 | 389.1 → 389.1 | 2.5 → 2.9 | 3793 → 3896 |
| party | 1 | 2.4 → 2.7 | 150.2 → 80.3 | 552.5 → 565 | 2.8 → 1.8 | 4792 → 4961 |
| party | 2 | 2.4 → 10.8 | 130.1 → 223.1 | 375.9 → 377.4 | 2 → 3.7 | 3806 → 5306 |
| crowns | 1 | 2.1 → 15.8 | 174.2 → 187.9 | 662.3 → 653.6 | 2.3 → 2.8 | 5848 → 3803 |
| crowns | 2 | 2.1 → 68.7 | 215.8 → 169.4 | 617.3 → 653.6 | 1.9 → 1.6 | 5237 → 3506 |
| hechey | 1 | 0 → 0 | 186.9 → 186.9 | 598.8 → 552.5 | 2.1 → 2.8 | 4736 → 6275 |
| hechey | 2 | 0 → 0 | 304.4 → 304.8 | 406.5 → 406.5 | 2.6 → 2.6 | 4658 → 4003 |

Per Glitch at DPR 2: base (walk/stand) 3.9 MB + idle4 (the stand loop) 8.6 MB;
a Game of Crowns rival also draws jump (8.5 MB) and climb (3.2 MB). At the
player's 3x the same three crowns rivals would hold about 155 MB, so NPC
sheets are 2x (4/9 of the memory). Random idle sheets load a few seconds
before they play and are freed 20 s after; a look with no Glitch left is
freed after 30 s. Nothing is baked in the browser, so street loads do no
compositing work.
