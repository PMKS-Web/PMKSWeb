/**
 * What the app says out loud, and when it stops saying it.
 *
 * The old snackbar had one timestamp for every message in the app, armed at the
 * moment the canvas was built. That made two things untestable and both wrong:
 * a second, different refusal within a second was swallowed, and a message
 * asking for a long quiet period was silent for that period from page load
 * rather than from the last time it had spoken. Both are checked here.
 *
 *   PMKS_BASE_URL=<origin> node e2e/notifications.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4600';

const templates = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const FOUR_BAR = Object.fromEntries(
  [...templates.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
)['4-Bar'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Every message that actually reached the stack since the last drain. */
const watch = () =>
  page.evaluate(() => {
    window.__said = [];
    const notify = ng.getComponent(document.querySelector('app-new-grid')).notify;
    for (const kind of ['success', 'refusal', 'warning', 'failure']) {
      const original = notify[kind].bind(notify);
      notify[kind] = (id, text, options) => {
        const before = notify.live.length;
        original(id, text, options);
        // Only if it was really added: a suppressed message is absent here
        // rather than present and invisible.
        if (notify.live.length > before) window.__said.push({ kind, id });
      };
    }
  });

const drain = () =>
  page.evaluate(() => {
    const said = window.__said ?? [];
    window.__said = [];
    return said;
  });

const say = (kind, id, text, options) =>
  page.evaluate(
    ({ kind, id, text, options }) =>
      ng.getComponent(document.querySelector('app-new-grid')).notify[kind](id, text, options),
    { kind, id, text, options }
  );

const showing = () => page.locator('.notification').count();
const clear = async () => {
  await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).notify.dismissAll()
  );
  await page.waitForTimeout(350);
};

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('app-new-grid svg', { timeout: 30000 });
await waitForReady(page);
await watch();

// ---- the four kinds are told apart on screen -------------------------------

for (const [kind, cls] of [
  ['success', 'notification--success'],
  ['refusal', 'notification--refusal'],
  ['warning', 'notification--warning'],
  ['failure', 'notification--failure'],
]) {
  await say(kind, `probe.${kind}`, `A ${kind}.`);
  await page.waitForTimeout(500);
  const marked = await page.locator(`.${cls}`).count();
  const iconed = await page.locator('.notificationIcon').count();
  record(`a ${kind} is marked as one, with its own glyph`, marked === 1 && iconed === 1, {
    marked,
    iconed,
  });
  await clear();
}

// ---- who waits, and who does not -------------------------------------------

await say('success', 'probe.brief', 'Gone shortly.');
await page.waitForTimeout(3200);
record('a success takes itself away', (await showing()) === 0);

await say('refusal', 'probe.refusal-2', 'Also gone shortly.');
await page.waitForTimeout(4600);
record('so does a refusal', (await showing()) === 0);

await say('warning', 'probe.patient', 'Still here.');
await page.waitForTimeout(6000);
record('a warning waits to be dismissed', (await showing()) === 1);
await page.locator('.notificationClose').first().click();
await page.waitForTimeout(400);
record('and the close button takes it away', (await showing()) === 0);

await say('failure', 'probe.failure-2', 'Still here too.');
await page.waitForTimeout(6000);
record('a failure waits as well', (await showing()) === 1);
await clear();

// ---- the rate limit is per message, not per app ----------------------------

await drain();
await say('refusal', 'rate.one', 'The first rule.');
await page.waitForTimeout(200);
await clear();
await say('refusal', 'rate.two', 'A different rule, a moment later.');
await page.waitForTimeout(300);
const both = await drain();
record(
  'a second, different refusal within a second is still said',
  both.length === 2 && both[0].id === 'rate.one' && both[1].id === 'rate.two',
  both
);
await clear();

await drain();
await say('refusal', 'rate.same', 'The same rule.');
await page.waitForTimeout(200);
await clear();
await say('refusal', 'rate.same', 'The same rule.');
await page.waitForTimeout(300);
const repeated = await drain();
record('but the same one twice in a second is said once', repeated.length === 1, repeated);
await clear();

// A long cooldown is measured from when the message last spoke, not from when
// the page loaded -- the fault that kept the zoom warnings quiet for the first
// twenty seconds of every session.
await drain();
await say('warning', 'rate.patient', 'Rare, but not on page load.', { cooldownMs: 20000 });
await page.waitForTimeout(400);
const rare = await drain();
record('a message with a long cooldown can still speak at once', rare.length === 1, rare);
await clear();

// ---- more than one at a time ------------------------------------------------

await clear();
await drain();
await say('warning', 'stack.a', 'The first, waiting.');
await say('failure', 'stack.b', 'The second, waiting.');
await say('refusal', 'stack.c', 'The third, leaving by itself.');
await page.waitForTimeout(500);
record('three messages stand together', (await showing()) === 3, await showing());

// A fourth pushes out the one that was going to leave anyway, not a warning
// the reader has not dealt with.
await say('warning', 'stack.d', 'The fourth, waiting.');
await page.waitForTimeout(500);
const stacked = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).notify.live.map((one) => one.id)
);
record(
  'a fourth displaces the one that was leaving anyway',
  stacked.length === 3 && !stacked.includes('stack.c') && stacked.includes('stack.d'),
  stacked
);
await clear();

// ---- a message that can fix the thing it is about ---------------------------

await drain();
const ran = await page.evaluate(async () => {
  const notify = ng.getComponent(document.querySelector('app-new-grid')).notify;
  let done = false;
  notify.warning('act.probe', 'Something is off.', {
    actions: [{ label: 'Put it right', run: () => (done = true) }],
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const button = document.querySelector('.notificationAction');
  const label = button?.textContent?.trim();
  button?.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { label, done, left: notify.live.length };
});
record('a message can carry the fix for what it is about', ran.label === 'Put it right', ran);
record('pressing it does the thing, and takes the message away', ran.done && ran.left === 0, ran);

// ---- the zoom warning is the real one that carries them ----------------------

// With a linkage on the grid: "Reset view" fits the view to the drawing, and an
// empty grid has nothing to fit to -- the same as the Reset View button.
await page.goto(`${BASE}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await watch();

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  for (let i = 0; i < 60; i++) grid.svgGrid.zoomOut();
  grid.svgGrid.handleZoom(grid.svgGrid.getZoom());
});
await page.waitForTimeout(500);
const zoomed = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const one = grid.notify.live.find((n) => n.id.startsWith('zoom.'));
  return { id: one?.id, labels: (one?.actions ?? []).map((a) => a.label) };
});
record(
  'zooming past the band warns, with both ways out',
  !!zoomed.id && zoomed.labels.join('|') === 'Fit to zoom|Reset view',
  zoomed
);

// Fit to zoom keeps the view and resizes the drawing.
const fitted = await page.evaluate(async () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const zoomBefore = grid.svgGrid.getZoom();
  document.querySelectorAll('.notificationAction')[0]?.click();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const zoom = grid.svgGrid.getZoom();
  return {
    zoomHeld: Math.abs(zoom - zoomBefore) < zoomBefore * 0.01,
    drawnAt: zoom * grid.settings.objectScale,
  };
});
record(
  'Fit to zoom resizes the drawing and leaves the view alone',
  fitted.drawnAt > 5 && fitted.drawnAt < 200 && fitted.zoomHeld,
  fitted
);
await clear();

// Reset view keeps the drawing and moves the view. Zooming the *other* way, so
// this raises `zoom.links-huge` -- `zoom.links-tiny` asked for a minute of quiet
// when it spoke above, and per-message cooldowns are the point of them.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  for (let i = 0; i < 120; i++) grid.svgGrid.zoomIn();
  grid.svgGrid.handleZoom(grid.svgGrid.getZoom());
});
await page.waitForTimeout(500);
const scaleBefore = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).settings.objectScale
);
const zoomBefore = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).svgGrid.getZoom()
);
// A real click, not a synthetic one. `scaleToFitLinkage` finishes in an
// `afterNextRender`, so it needs a change-detection pass behind it -- calling
// the method from the console leaves the fit permanently pending.
await page.locator('.notificationAction', { hasText: 'Reset view' }).click();
await page.waitForTimeout(1500);
const reset = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return {
    scale: grid.settings.objectScale,
    zoom: grid.svgGrid.getZoom(),
    left: grid.notify.live.length,
  };
});
record(
  'Reset view moves the view and leaves the drawing alone',
  reset.scale === scaleBefore && reset.zoom !== zoomBefore && reset.left === 0,
  { scaleBefore, zoomBefore, ...reset }
);
await clear();

// ---- Ctrl+Z undoes -----------------------------------------------------------

const joints = () =>
  page.evaluate(
    () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.length
  );

// A four-bar, then an edit worth undoing. A drag, because it is the gesture
// that reliably writes an undo entry -- deleting a joint does not, which is a
// separate fault and not this suite's business.
await page.goto(`${BASE}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await watch();

const jointX = () =>
  page.evaluate(
    () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints[0].x
  );
const canUndo = () =>
  page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).saveHistoryService.canUndo()
  );

const before = await jointX();
const box = await page.locator('[id^="joint_"]').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 70, box.y + 45, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(900);
const moved = await jointX();
record('a joint was dragged, and the drag is undoable', moved !== before && (await canUndo()), {
  before,
  moved,
});

await drain();
await page.keyboard.press('Control+z');
await page.waitForTimeout(1000);
record('Ctrl+Z undoes rather than asking a question', (await jointX()) === before, {
  before,
  after: await jointX(),
});
record('and says nothing while doing it', (await drain()).length === 0);

await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(1000);
// Near, not equal: a redone state is replayed through the URL codec, which
// rounds. What is under test is that the joint went back, not that it
// round-tripped to the last decimal.
const redone = await jointX();
record('Ctrl+Shift+Z puts the drag back', Math.abs(redone - moved) < 1, { moved, redone });

// A keystroke aimed at a text field belongs to the field.
await page.evaluate(() => {
  const field = document.querySelector('input:not([type="file"]):not([type="checkbox"])');
  field?.focus();
});
const parked = await jointX();
await page.keyboard.press('Control+z');
await page.waitForTimeout(800);
record('Ctrl+Z in a text field leaves the mechanism alone', (await jointX()) === parked, {
  parked,
  after: await jointX(),
});

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
