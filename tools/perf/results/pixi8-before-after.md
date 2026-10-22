# Pixi 7.4.2 → Pixi 8.22.0

`before-pixi7.4.2` (main at 46566e0, vendored 7.4.2) and `after-pixi8.22.0` (branch pixi8) ran back to back on 2026-10-22, Metal GPU, 1280x860, uncapped frame rate (`node tools/perf/perf.mjs`). The machine was busy (load 12-17), so the absolute numbers are noisy; `baseline-pixi7.4.2-cdn` is a quieter Pixi 7 run (Hechey DPR 2: 247 fps, CPU p95 7.1 ms) for scale. Frame CPU is time inside the frame's rAF callbacks (game update + Pixi render submission). GPU tex is level-0 texture bytes at the end of the 9 s walk.

| Route | DPR | fps 7 → 8 | frame CPU p95 ms 7 → 8 | interval p99 ms 7 → 8 | draws 7 → 8 | GPU tex MB 7 → 8 | heap MB 7 → 8 | WebGPU fps / CPU p95 |
|---|---|---|---|---|---|---|---|---|
| hechey | 1 | 314.5 → 606.1 | 8.3 → 2.8 | 16.1 → 8.9 | 17 → 16 | 210.4 → 186.9 | 20.2 → 20.7 | 1388.9 / 1 |
| hechey | 2 | 214.6 → 403.2 | 10 → 3.6 | 17 → 10.4 | 17 → 16 | 418.5 → 278.3 | 19.7 → 20.9 | 404.9 / 3.2 |
| marrakesh | 1 | 383.1 → 628.9 | 7.8 → 2.6 | 14.8 → 8.2 | 18 → 14 | 100.1 → 101.1 | 19.8 → 20.6 | 1063.8 / 1 |
| marrakesh | 2 | 271.7 → 591.7 | 8.8 → 2.3 | 16.1 → 7.4 | 18 → 13 | 160.9 → 162.4 | 19.6 → 20.7 | 490.2 / 2.9 |
| room | 1 | 159.7 → 746.3 | 16.8 → 2.1 | 24.7 → 4.3 | 36 → 14 | 171.2 → 96.5 | 20.5 → 21.2 | 574.7 / 1 |
| room | 2 | 138.9 → 724.6 | 17.1 → 2.1 | 33.7 → 5.1 | 36 → 14 | 311.2 → 197.8 | 20.4 → 21.2 | 606.1 / 1 |
| rook | 1 | 205.3 → 591.7 | 15.4 → 2.2 | 21.3 → 7 | 26 → 24 | 313.8 → 202.9 | 20.8 → 22 | 490.2 / 2.1 |
| rook | 2 | 118.5 → 271 | 17.5 → 5.6 | 35 → 12.1 | 26 → 24 | 541.8 → 378.3 | 20.4 → 22.4 | 187.3 / 13 |
| builder | 1 | 340.1 → 709.2 | 3.2 → 2 | 14.7 → 4.1 | 17 → 16 | 207.4 → 164.9 | 26.7 → 27.5 | - |
| builder | 2 | 205.3 → 438.6 | 4.7 → 2.5 | 15.4 → 6.7 | 17 → 16 | 424 → 248.1 | 26.2 → 27.5 | - |

- Steady state, Hechey Track DPR 2 after 25 s standing still: 212 MB of GPU textures on Pixi 8 (decos culled, unused images freed by Pixi's GC, far recoloured textures freed) vs 418 MB on Pixi 7.
- Boot to first frame with vsync (3 runs each, `--capped`): Pixi 7 2.4-3.4 s, Pixi 8 2.2-2.9 s. In the uncapped harness Pixi 8 shows 0.5-1.5 s more, an artifact of the unthrottled render loop competing with loading (boot-cover frames).
- Network: about +5 MB per route on Pixi 8; the bundle accounts for 0.4 MB (841 KB vs 456 KB). The rest is not attributed yet (likely 3x first-draw sheets finishing inside the measuring window as frames come faster).
- WebGPU (`?renderer=webgpu`, `--webgpu --extra=renderer=webgpu`): renders the same pixels (≤1.5 % pixel diff, moving animals), faster at DPR 1 but slower on the rook attack at DPR 2 (187 vs 271 fps, CPU p95 13 vs 5.6 ms), and one 12 s boot outlier; WebGL 2 stays the default.
