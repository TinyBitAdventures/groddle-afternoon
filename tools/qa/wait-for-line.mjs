/**
 * Waiting for a chat line in the online smoke check (register G536). A line can take seconds to
 * reach the other player when the realtime server or the machine is busy: at the v0.19.0 gate
 * A's line was stamped by A's page at 16:23:31.836, handled by the server at 16:23:36.088 (its
 * chat log) and shown in B's Local after B's own reply, so a fixed wait read an empty list. The
 * check now waits up to LINE_WAIT_MS for the line, and says how long it took, so a slow delivery
 * is on the record and only a line that never comes fails.
 */
export const LINE_WAIT_MS = 15000;
export const LINE_STEP_MS = 250;

/**
 * PURE (its clock and its pause are passed in): reads the list with `read()` until a line's text
 * matches `re` or `timeoutMs` has gone. Returns { found, ms, lines }: the last list read.
 */
export async function waitForLine(read, re, { timeoutMs = LINE_WAIT_MS, stepMs = LINE_STEP_MS, now = Date.now, pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const started = now();
  for (;;) {
    const lines = (await read()) || [];
    if (lines.some((l) => re.test(String(l?.text ?? '')))) return { found: true, ms: now() - started, lines };
    if (now() - started >= timeoutMs) return { found: false, ms: now() - started, lines };
    await pause(stepMs);
  }
}
