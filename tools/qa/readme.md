# QA helpers

Shared tools for checking the game by hand, in lanes and before a release. No dependencies
beyond the repo's own Playwright.

## serve.mjs: a static server that keeps up

    node tools/qa/serve.mjs public 8940

`python3 -m http.server` drops connections under the game's burst of module and asset loads,
and the game stalls at the loading card. This one has a deep listen backlog and keep-alive,
sends nothing cached, redirects `/play` to `/play/`, never serves outside the folder, binds
127.0.0.1 only and refuses 8793 (the realtime server). Ctrl-C closes it cleanly.
`tools/serve-static.mjs` is the same server under its old name.

## browser-lock.mjs: one browser at a time

Groddle tabs take 1.5 to 2 GB each, so every lane shares one headless Chrome. The lock is a
folder made with `mkdir`, the same lock the lanes' shell scripts take by hand.

    export GRODDLE_BROWSER_LOCK=<scratch>/locks/browser   # share it with the lanes (default ~/.cache/groddle/locks/browser)
    node tools/qa/browser-lock.mjs run -- node my-shots.mjs   # wait, take it, run, release
    node tools/qa/browser-lock.mjs status                     # who holds it
    node tools/qa/browser-lock.mjs wait --wait=600            # wait until it is free

- Release only removes a lock that carries our own token: never someone else's.
- A waiter breaks a lock only when its owner pid on this machine has exited, or when a shell
  script's bare lock (no owner file) is older than `--stale` (default 3600 s). A lock whose
  owner is still running is never broken.
- The lock is released on exit, on Ctrl-C, SIGTERM and SIGHUP.

In a script, `openBrowser()` from `browser.mjs` takes the lock and launches Chrome with the
project's flags (`--use-angle=metal --enable-gpu`, plus
`--disable-features=LocalNetworkAccessChecks` with `online: true`); `close()` closes Chrome and
releases the lock.
