/**
 * Wait for the app, rather than for the clock.
 *
 * Every suite here used to load a mechanism and then sleep a flat 4.2 or 5
 * seconds. The app is actually ready in 0.65 to 2.0 — so most of that wait was
 * pure cost, paid once per load, and the sweeps load a mechanism dozens of
 * times. That is where the minutes went.
 *
 * The flat sleep was not simply lazy, though, and replacing it with "the joints
 * exist" would trade slow tests for flaky ones. Three separate things have to
 * have happened before a suite may click at a coordinate:
 *
 *   1. the mechanism is built — joints exist and are drawn;
 *   2. it has been solved, if it is solvable at all — several suites read the
 *      solved frames immediately;
 *   3. **nothing on screen is still moving.** The canvas is re-framed to fit
 *      whatever arrived, and the joints land in their final places a moment
 *      after that — measured too early, a joint that ends up at (660, 177)
 *      reads as (-13500, -393775). Either one lands a drag somewhere the suite
 *      never meant to click.
 *
 * So readiness is polled on all three, and the third is what usually decides it.
 * A mechanism that cannot be solved is still ready — some templates are
 * deliberately invalid — so the solve is given a short grace period and then
 * stops being waited for.
 *
 * "Has not moved lately" is not enough on its own, and the first cut of this
 * helper learned that the hard way: five drag suites began clicking at
 * coordinates that were about to move out from under them, and failed in ways
 * that looked like app bugs. The canvas holds perfectly still between a decode
 * and the fit that follows it, and a joint can hold a wrong pose for longer
 * than any stillness window. So the settled picture includes where the joints
 * are, and a joint hundreds of thousands of pixels off-screen is not accepted
 * as settled however long it has sat there.
 *
 * The re-frame used to be on a fixed one-second timer, which this had to mirror
 * and wait out. It now happens as soon as Angular has drawn the thing being
 * fitted, so there is nothing left to wait out.
 */

const READY_TIMEOUT_MS = 12000;
const POLL_MS = 40;
/** How long the picture must hold still to count as settled. */
const STILL_MS = 160;

/**
 * Load a mechanism and return when the app is ready to be measured or clicked.
 *
 * Returns how long it took, so a suite can report it and a regression in load
 * time shows up as a number rather than as a mysteriously slower run.
 */
export async function openMechanism(page, url, { timeout = READY_TIMEOUT_MS } = {}) {
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForReady(page, { timeout: timeout - (Date.now() - started) });
  return Date.now() - started;
}

/** The same wait, for a suite that navigates or rebuilds by its own means. */
export async function waitForReady(page, { timeout = READY_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeout;
  let stillSince = null;
  let lastFrame = null;
  /** When a mechanism first appeared, for the give-up below to measure from. */
  let builtSince = null;

  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const host = document.querySelector('app-new-grid');
        if (!host || !window.ng) return null;
        const grid = window.ng.getComponent(host);
        const mech = grid?.mechanismSrv;
        if (!mech) return null;
        const svg = document.querySelector('svg');
        const holder = svg?.querySelector('g');
        return {
          built: mech.joints.length > 0,
          drawn: document.querySelectorAll('[id^="joint_"]').length > 0,
          solvedFrames: mech.mechanisms?.[0]?.joints?.length ?? 0,
          // The whole picture in one string: what pan/zoom is applying, and
          // where the joints actually landed under it. This only has to answer
          // "did it change", not "to what" — so a rounded join is enough, and
          // it has to be the joints too, because they settle after the canvas.
          frame:
            (holder?.getAttribute('transform') ?? svg?.getAttribute('viewBox') ?? '') +
            '|' +
            [...document.querySelectorAll('[id^="joint_"]')]
              .map((node) => {
                const box = node.getBoundingClientRect();
                return `${node.id}:${Math.round(box.x)},${Math.round(box.y)}`;
              })
              .join(' '),
          // Are the joints anywhere a user could point at? The pre-settle pose
          // is not merely a little off — it is hundreds of thousands of pixels
          // away — and it can hold that pose for longer than the stillness
          // window, so "has not moved lately" alone believes it.
          onScreen: [...document.querySelectorAll('[id^="joint_"]')].every((node) => {
            const box = node.getBoundingClientRect();
            return (
              box.x > -window.innerWidth &&
              box.x < window.innerWidth * 2 &&
              box.y > -window.innerHeight &&
              box.y < window.innerHeight * 2
            );
          }),
        };
      })
      .catch(() => null);

    // A blank project is a legitimate ready state — it simply has nothing in it.
    // Requiring joints would spin here for the whole budget on every suite that
    // starts from an empty grid, which is the opposite of the point.
    if (state) {
      if (state.built && state.drawn && builtSince === null) builtSince = Date.now();
      if (state.frame === lastFrame) {
        if (stillSince === null) stillSince = Date.now();
        const settled = Date.now() - stillSince >= STILL_MS;
        // An empty grid has nothing to solve, and an unsolvable mechanism never
        // gets frames; do not wait for ones that will never arrive.
        const solvedOrGivenUp =
          !state.built || state.solvedFrames > 1 || Date.now() - stillSince >= 900;
        // A mechanism can legitimately sit off-screen — an invalid one is never
        // fitted to the view — so this is given up on rather than waited for.
        const placed = !state.built || state.onScreen || Date.now() - builtSince >= 2500;
        if (settled && solvedOrGivenUp && placed) return;
      } else {
        stillSince = null;
      }
      lastFrame = state.frame;
    }
    await page.waitForTimeout(POLL_MS);
  }
  // Not a throw: a suite that has waited its whole budget should go on and fail
  // on what it was actually checking, with its own message, rather than here.
  console.warn(`  (app not ready within ${timeout}ms — continuing)`);
}
