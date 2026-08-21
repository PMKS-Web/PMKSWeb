// Phase 1 drag foundation: joint snap/merge, whole-link drag, one undo entry
// per gesture, click-without-nudge, and the analysis modes refusing every drag.
// See docs/joint-types-plan.md, Phase 1.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForReady } from './app-ready.mjs';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'phase1';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/pmks-phase1-profile-${Date.now()}`;

/**
 * A four-bar with a spare grounded bar beside it, for the sections about
 * merging.
 *
 * A plain four-bar has no legal merge left. Every pair either shares a link or
 * would tie two joints together twice, and the one pair that does not — the two
 * grounds — now runs into the rule that a driven joint may only join two
 * bodies (§2.9), which arrived long after this file did. So those sections were
 * asserting a merge against a mechanism that correctly refuses every one, and
 * failing for a reason that has nothing to do with dragging.
 *
 * Folding the spare ground E into the four-bar's ground D shares no link,
 * duplicates nothing, and touches no driven joint.
 */
const MERGEABLE =
  '2P.Fe,1E8.K,0.1011.MA,A,0VG,0,0.GB,B,0NS,NS,0.GC,C,VG,VG,0.KD,D,d4,0,0.KE,E,1E8,0,0.GF,F,1Tm,VG,0..YRAB,AB,Fe,Fe,0RM,Bk,c5cae9,A,B,,.YRBC,BC,Fe,Fe,3w,RM,303e9f,B,C,,.YRCD,CD,Fe,Fe,ZA,Fe,0d125a,C,D,,.YREF,EF,Fe,Fe,1Ly,Fe,B2DFDB,E,F,,...N_p';

const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const SLIDER_CRANK =
  '0P.TY.K,0.101.MA,A,0mA,0c,0.GB,B,0Yt,bK,0.GC,C,il,H-,0.LD,D,il,H-,0..YRAB,AB,Fe,Fe,0fW,IN,c5cae9,A,B,,.YRBC,BC,Fe,Fe,4y,Rf,303e9f,B,C,,.YPCD,CD,Fe,0,0,0,,C,D,,...JAe';

const issues = [];
const events = [];
const checks = [];

function issue(title, details = {}) {
  issues.push({ title, ...details });
}

function record(name, pass, details = {}) {
  checks.push({ name, pass, ...details });
  if (!pass) issue(`Check failed: ${name}`, { severity: 'high', ...details });
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(screenshotDir, `${runPrefix}-${name}`),
    fullPage: false,
  });
}

async function flushReport() {
  await fs.writeFile(
    path.join(screenshotDir, `${runPrefix}-report.json`),
    JSON.stringify({ baseUrl, userDataDir, checks, issues, events }, null, 2)
  );
}

/**
 * Joint ids with both their model coordinates (the `x`/`y` attributes on the
 * wrapper svg are joint.x/joint.y) and their screen centres, so a drag can aim
 * in screen space and be checked in model space.
 */
async function jointState(page) {
  return await page.evaluate(() => {
    return [...document.querySelectorAll('#jointHolder > svg')]
      .map((el) => {
        const marker = el.querySelector('[id^="joint_"]');
        const rect = el.getBoundingClientRect();
        return {
          id: marker ? marker.id.replace('joint_', '') : null,
          modelX: Number(el.getAttribute('x')),
          modelY: Number(el.getAttribute('y')),
          screenX: rect.x + rect.width / 2,
          screenY: rect.y + rect.height / 2,
        };
      })
      .filter((joint) => joint.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  });
}

async function linkIDs(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll('#linkHolder path[id]')]
      .map((el) => el.id)
      .filter((id) => id && !id.includes('__'))
      .sort()
  );
}

async function snapRingCount(page) {
  return await page.evaluate(() => document.querySelectorAll('#jointHolder .snapTarget').length);
}

/**
 * What the app has just said about what the reader just did.
 *
 * The notification stack, not a Material snackbar: the app moved off
 * MatSnackBar when NotificationService took over, and this kept reading the
 * empty snackbar — so a check here reported the app silent while it was saying
 * exactly what the check was asking for.
 *
 * Warnings are left out. They report a state the drawing is in rather than an
 * answer to a gesture, they wait to be dismissed rather than leaving on their
 * own, and one of them ("drawn far larger than the grid") stands through this
 * whole file — so counting it would make every "said nothing" check false.
 */
async function notificationText(page) {
  return await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'app-notification-stack .notification:not(.notification--warning) .notificationText'
      ),
    ]
      .map((one) => one.textContent.trim())
      .join(' | ')
  );
}

/** Press, move in steps, and optionally pause on the last point before release. */
async function dragBy(page, from, to, { steps = 12, holdBeforeRelease = 0 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / steps,
      from.y + ((to.y - from.y) * step) / steps
    );
    await page.waitForTimeout(20);
  }
  if (holdBeforeRelease) await page.waitForTimeout(holdBeforeRelease);
  return async () => {
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
}

async function loadMergeable(page) {
  await page.goto(`${baseUrl}?${MERGEABLE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  await page.waitForTimeout(400);
}

async function loadFourBar(page) {
  await page.goto(`${baseUrl}?${FOUR_BAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  await page.waitForTimeout(400);
}

async function safe(name, fn) {
  try {
    events.push({ action: 'step-start', name });
    await fn();
    events.push({ action: 'step-ok', name });
  } catch (error) {
    issue(`Step threw: ${name}`, { severity: 'high', error: error?.stack || error?.message });
    events.push({ action: 'step-failed', name });
  }
  await flushReport().catch(() => {});
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 1000 },
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(10000);

page.on('pageerror', (error) =>
  issue('Uncaught page error', { severity: 'high', error: error.stack || error.message })
);
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (/favicon|google-analytics|development mode/i.test(text)) return;
  issue(`Console error: ${text.slice(0, 200)}`, { severity: 'medium' });
});

// --- 1. Joint snap ring and merge -----------------------------------------
await safe('joint dragged onto another shows a ring and merges', async () => {
  await loadMergeable(page);
  const before = await jointState(page);
  const beforeLinks = await linkIDs(page);
  record(
    'the mergeable rig loaded with A B C D E F',
    before.map((j) => j.id).join('') === 'ABCDEF',
    { joints: before.map((j) => j.id), links: beforeLinks }
  );

  // E, the spare bar's ground, folded into D, the four-bar's. They share no
  // link, the result duplicates nothing, and neither is the driven joint --
  // which is what makes this the legal merge a plain four-bar no longer has.
  const a = before.find((j) => j.id === 'E');
  const d = before.find((j) => j.id === 'D');
  const release = await dragBy(
    page,
    { x: a.screenX, y: a.screenY },
    { x: d.screenX, y: d.screenY },
    { holdBeforeRelease: 400 }
  );

  const rings = await snapRingCount(page);
  await shot(page, 'snap-ring-visible.png');
  record('snap ring is drawn while hovering the target joint', rings === 1, { rings });

  const ringStyle = await page.evaluate(() => {
    const ring = document.querySelector('#jointHolder .snapTarget');
    if (!ring) return null;
    const style = getComputedStyle(ring);
    return { stroke: style.stroke, dash: style.strokeDasharray, fill: style.fill };
  });
  record(
    'ring is solid and unfilled, so it reads as a claim on the target',
    !!ringStyle && ringStyle.dash === 'none' && ringStyle.fill === 'none',
    { ringStyle }
  );

  await release();
  const after = await jointState(page);
  const afterLinks = await linkIDs(page);
  await shot(page, 'after-merge.png');

  record('joint count dropped by one', after.length === before.length - 1, {
    beforeCount: before.length,
    afterCount: after.length,
    after: after.map((j) => j.id),
  });
  record(
    'the dragged joint is gone and the target survived',
    !after.some((j) => j.id === 'E') && after.some((j) => j.id === 'D'),
    { after: after.map((j) => j.id) }
  );
  record('the merged link was renamed to span the survivor', afterLinks.includes('DF'), {
    beforeLinks,
    afterLinks,
  });
  record('the snap ring is cleared after release', (await snapRingCount(page)) === 0);
});

// --- 2. Undo returns the whole gesture ------------------------------------
await safe('one undo returns the pre-drag state', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  const b = before.find((j) => j.id === 'B');
  const release = await dragBy(
    page,
    { x: b.screenX, y: b.screenY },
    { x: b.screenX + 130, y: b.screenY - 90 }
  );
  await release();

  const moved = await jointState(page);
  const movedB = moved.find((j) => j.id === 'B');
  record('the joint actually moved', Math.abs(movedB.modelX - b.modelX) > 0.5, {
    from: [b.modelX, b.modelY],
    to: [movedB.modelX, movedB.modelY],
  });

  await page.locator('button', { hasText: 'Undo' }).first().click();
  await page.waitForTimeout(700);
  const undone = await jointState(page);
  const undoneB = undone.find((j) => j.id === 'B');
  await shot(page, 'after-single-undo.png');
  record(
    'a single undo restores the pre-drag position, not an intermediate pose',
    Math.abs(undoneB.modelX - b.modelX) < 0.05 && Math.abs(undoneB.modelY - b.modelY) < 0.05,
    { expected: [b.modelX, b.modelY], got: [undoneB.modelX, undoneB.modelY] }
  );
});

// --- 3. Whole-link drag ---------------------------------------------------
await safe('dragging a link body translates all of its joints', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  const coupler = await page.evaluate(() => {
    const el = document.querySelector('#linkHolder path#BC');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  record('the coupler link BC is on screen', !!coupler, { coupler });
  if (!coupler) return;

  const release = await dragBy(page, coupler, { x: coupler.x + 60, y: coupler.y + 40 });
  await release();
  const after = await jointState(page);
  await shot(page, 'after-link-drag.png');

  const delta = (id) => {
    const from = before.find((j) => j.id === id);
    const to = after.find((j) => j.id === id);
    return [to.modelX - from.modelX, to.modelY - from.modelY];
  };
  const [bdx, bdy] = delta('B');
  const [cdx, cdy] = delta('C');
  const [adx, ady] = delta('A');
  const [ddx, ddy] = delta('D');

  record('both joints of the dragged link moved', Math.hypot(bdx, bdy) > 0.5, {
    B: [bdx, bdy],
    C: [cdx, cdy],
  });
  record(
    'they moved by the same offset, so the link translated rigidly',
    Math.abs(bdx - cdx) < 0.05 && Math.abs(bdy - cdy) < 0.05,
    { B: [bdx, bdy], C: [cdx, cdy] }
  );
  record(
    'the grounded joints of neighbouring links stayed put',
    Math.hypot(adx, ady) < 0.05 && Math.hypot(ddx, ddy) < 0.05,
    { A: [adx, ady], D: [ddx, ddy] }
  );

  // The status strip stopped printing the mobility, so it comes off the machine
  // the drag left behind.
  const dof = await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0]?.dof ??
      null
  );
  record('the mechanism is still solvable after the drag', dof === 1, { dof });
});

// --- 4. A click selects without nudging -----------------------------------
await safe('a plain click selects without moving anything', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  const b = before.find((j) => j.id === 'B');

  await page.mouse.click(b.screenX, b.screenY);
  await page.waitForTimeout(600);
  const after = await jointState(page);
  const afterB = after.find((j) => j.id === 'B');
  await shot(page, 'after-click-select.png');

  record(
    'the clicked joint did not move',
    Math.abs(afterB.modelX - b.modelX) < 0.001 && Math.abs(afterB.modelY - b.modelY) < 0.001,
    { before: [b.modelX, b.modelY], after: [afterB.modelX, afterB.modelY] }
  );
  const undoEnabled = await page
    .locator('button', { hasText: 'Undo' })
    .first()
    .isEnabled()
    .catch(() => null);
  record('the click earned no undo entry', undoEnabled === false, { undoEnabled });
});

// --- 5. An analysis mode refuses drags ------------------------------------
await safe('an analysis mode refuses to drag a joint or a link', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
  await page.waitForTimeout(800);

  const b = before.find((j) => j.id === 'B');
  const release = await dragBy(
    page,
    { x: b.screenX, y: b.screenY },
    { x: b.screenX + 120, y: b.screenY - 80 }
  );
  await release();
  const after = await jointState(page);
  const afterB = after.find((j) => j.id === 'B');
  await shot(page, 'analyze-drag-refused.png');

  record(
    'the joint did not move in an analysis mode',
    Math.abs(afterB.modelX - b.modelX) < 0.001 && Math.abs(afterB.modelY - b.modelY) < 0.001,
    { before: [b.modelX, b.modelY], after: [afterB.modelX, afterB.modelY] }
  );
  // The refusal is silent by design: the mode is stated in the strip above and
  // in the tab that is lit, and a message per attempted drag would repeat it.
  // A joint that does not move is the answer.
});

// --- 6. A bare cursor never pans the canvas -------------------------------
// svg-pan-zoom enters a pan on mousedown and leaves it only on mouseup, so a
// release it never sees leaves the canvas following the cursor with no button
// held. The release that goes missing in the field is not reproducible through
// CDP — Chrome re-aims a release whose target was deleted at the nearest
// surviving ancestor, which still reaches the canvas — so the stuck state is
// entered directly, by a synthetic mousedown on #canvas. That drives the
// library exactly as a real press does, which is what makes this discriminate:
// with the guard removed the assertion below fails.
await safe('a bare cursor never pans the canvas', async () => {
  await loadFourBar(page);
  const viewport = () =>
    page.evaluate(() =>
      document.querySelector('#canvas > g[id^="viewport-"]')?.getAttribute('transform')
    );
  const box = await page.locator('#canvas').boundingBox();
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };

  // A companion check that a button-held drag still pans was dropped: real
  // panning is driven by Hammer's panBy, which is a separate path from the
  // svg-pan-zoom state this guard clears, so no over-firing of the guard can
  // make that assertion fail. Verified by mutation — it passed with the button
  // test removed from the guard entirely.
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(150);

  // Strand the library mid-gesture, then move having released nothing.
  await page.evaluate(
    (point) =>
      document.querySelector('#canvas').dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientX: point.x,
          clientY: point.y,
        })
      ),
    start
  );
  const stranded = await viewport();
  for (let step = 1; step <= 6; step++) {
    await page.mouse.move(start.x + step * 30, start.y + step * 20);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  const roamed = await viewport();
  await shot(page, 'bare-cursor-no-pan.png');
  record('a move with no button held leaves the canvas alone', stranded === roamed, {
    stranded,
    roamed,
  });
});

// --- 7. A merge that would over-constrain the linkage is refused ----------
// A is on link AB and C is on BC, so folding A into C would leave a second bar
// spanning B and C alongside the one already there.
await safe('a merge that would double an existing pair is refused', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  const beforeLinks = await linkIDs(page);
  const a = before.find((j) => j.id === 'A');
  const c = before.find((j) => j.id === 'C');

  const release = await dragBy(
    page,
    { x: a.screenX, y: a.screenY },
    { x: c.screenX, y: c.screenY },
    { holdBeforeRelease: 300 }
  );
  const ringed = await snapRingCount(page);
  await release();
  const after = await jointState(page);
  const note = await notificationText(page);
  await shot(page, 'over-constraining-merge-refused.png');

  record('no snap ring appears over an illegal target', ringed === 0, { ringed });
  record('every joint is still there', after.length === before.length, {
    after: after.map((j) => j.id),
    note,
  });
  record(
    'the links are unchanged',
    JSON.stringify(await linkIDs(page)) === JSON.stringify(beforeLinks),
    {
      beforeLinks,
      afterLinks: await linkIDs(page),
    }
  );
});

// --- 8. Merging onto the pin of a slider ---------------------------------
await safe('a joint can be dropped onto the pin of a slider', async () => {
  await page.goto(`${baseUrl}?${SLIDER_CRANK}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  await page.waitForTimeout(400);

  const loaded = await jointState(page);
  record('the slider-crank loaded with a prismatic joint', loaded.length === 4, {
    joints: loaded.map((j) => j.id),
  });

  // Build a free bar to drag from: the slider-crank has no spare joint.
  const box = await page.locator('#canvas').boundingBox();
  const originX = box.x + box.width * 0.3;
  const originY = box.y + box.height * 0.78;
  await page.mouse.click(originX, originY, { button: 'right' });
  await page.waitForTimeout(400);
  await page.locator('#contextMenu #menu-item', { hasText: 'Add Link' }).first().click();
  await page.waitForTimeout(300);
  await page.mouse.move(originX + 120, originY + 40);
  await page.waitForTimeout(200);
  await page.mouse.click(originX + 120, originY + 40);
  await page.waitForTimeout(700);

  const withBar = await jointState(page);
  record('a free bar was added to drag from', withBar.length === loaded.length + 2, {
    joints: withBar.map((j) => j.id),
  });

  // C is the revolute half of the slider; the prismatic half sits on top of it.
  const pin = withBar.find((j) => j.id === 'C');
  const spare = withBar.find((j) => !loaded.some((existing) => existing.id === j.id));
  const release = await dragBy(
    page,
    { x: spare.screenX, y: spare.screenY },
    { x: pin.screenX, y: pin.screenY },
    { holdBeforeRelease: 300 }
  );
  const ringed = await snapRingCount(page);
  await release();
  const after = await jointState(page);
  await shot(page, 'merged-onto-slider.png');

  record("the slider's pin offered itself as a drop target", ringed === 1, { ringed });
  record('the merge went through', !after.some((j) => j.id === spare.id), {
    spare: spare.id,
    after: after.map((j) => j.id),
  });
  const prismaticOnPin = await page.evaluate(() => {
    const joints = [...document.querySelectorAll('#jointHolder > svg')].map((el) => ({
      x: Number(el.getAttribute('x')),
      y: Number(el.getAttribute('y')),
      prismatic: !!el.querySelector('[id^="joint_"]')?.closest('svg')?.querySelector('rect'),
    }));
    return joints;
  });
  record('the slot stayed coincident with the pin it rides', prismaticOnPin.length > 0, {
    joints: prismaticOnPin.length,
  });
});

// --- 9. Capture, refusal and the animations that report them --------------
// The snap treatment: amber ring plus capture on a legal target, red ring plus
// a shake and an explanation on a refused one, and silence when a merge simply
// works.
async function ringInfo(page, selector) {
  return await page.evaluate((sel) => {
    const rings = [...document.querySelectorAll(`#jointHolder ${sel}`)];
    if (rings.length === 0) return { count: 0 };
    const style = getComputedStyle(rings[0]);
    return {
      count: rings.length,
      stroke: style.stroke,
      dash: style.strokeDasharray,
      fill: style.fill,
      cx: Number(rings[0].getAttribute('cx')),
      cy: Number(rings[0].getAttribute('cy')),
    };
  }, selector);
}

async function effectCount(page, className) {
  return await page.evaluate(
    (name) => document.querySelectorAll(`#jointHolder g.${name}`).length,
    className
  );
}

await safe('a legal target captures the dragged joint under an amber ring', async () => {
  await loadMergeable(page);
  const before = await jointState(page);
  const a = before.find((j) => j.id === 'E');
  const d = before.find((j) => j.id === 'D');

  // Deliberately short of D: what puts the joint on the target has to be the
  // capture, not the cursor.
  await dragBy(
    page,
    { x: a.screenX, y: a.screenY },
    { x: d.screenX + 6, y: d.screenY + 6 },
    { holdBeforeRelease: 350 }
  );

  const amber = await ringInfo(page, '.snapTarget');
  const refused = await ringInfo(page, '.snapRefused');
  const held = await jointState(page);
  const heldA = held.find((j) => j.id === 'E');
  await shot(page, 'capture-ring.png');

  // Both names land on the same point once captured, so one label naming the
  // merge replaces them — and it is the only place the survivor is stated.
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('#canvas text')]
      .map((el) => el.textContent.trim())
      .filter(Boolean)
  );
  // Survivor first, then the joint being folded in, with the arrow reading in
  // the direction of travel: E sits to the right of D, so it comes in leftward.
  record(
    'the capture is labelled with the merge, not two overlapping names',
    labels.includes('D \u2190 E'),
    {
      merge: labels.filter((l) => /[\u2190\u2192]/.test(l)),
    }
  );
  record('neither joint is still labelled on its own', !labels.includes('A'), {
    labels: labels.filter((l) => l.length <= 2),
  });

  record(
    'the capture ring is amber, solid and unfilled',
    amber.count === 1 && amber.stroke === 'rgb(255, 193, 7)' && amber.fill === 'none',
    { amber }
  );
  record(
    'the capture ring sits on the target joint',
    Math.abs(amber.cx - d.modelX) < 1e-6 && Math.abs(amber.cy - d.modelY) < 1e-6,
    { ring: [amber.cx, amber.cy], target: [d.modelX, d.modelY] }
  );
  record('no refusal ring is drawn for a legal target', refused.count === 0, { refused });
  record(
    'the dragged joint jumped onto the target instead of following the cursor',
    Math.abs(heldA.modelX - d.modelX) < 1e-6 && Math.abs(heldA.modelY - d.modelY) < 1e-6,
    { dragged: [heldA.modelX, heldA.modelY], target: [d.modelX, d.modelY] }
  );

  await page.mouse.up();
  await page.waitForTimeout(90);
  const popping = await effectCount(page, 'jointPop');
  await shot(page, 'merge-pop.png');
  record('the surviving joint pops when the merge lands', popping === 1, { popping });

  await page.waitForTimeout(600);
  const note = await notificationText(page);
  record('a merge that goes as expected says nothing', note === '', { note });
  record('the pop is a one-shot', (await effectCount(page, 'jointPop')) === 0);
});

await safe('a refused target is ringed red, shakes on release, and explains itself', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  // B rather than A: A is the driven joint, and driving is refused before
  // over-constraining is even considered (§2.9), so dragging it here tested a
  // different rule than the one this section is named for.
  const a = before.find((j) => j.id === 'B');
  const c = before.find((j) => j.id === 'D');

  // B sits on AB and BC, D on CD, so folding one into the other would leave two
  // bars spanning the same pair of joints.
  await dragBy(
    page,
    { x: a.screenX, y: a.screenY },
    { x: c.screenX, y: c.screenY },
    { holdBeforeRelease: 350 }
  );

  const red = await ringInfo(page, '.snapRefused');
  const amber = await ringInfo(page, '.snapTarget');
  await shot(page, 'refused-ring.png');

  record('a red ring marks the joint that will not take the merge', red.count === 1, { red });
  record('the red ring is red and unfilled', red.stroke === 'rgb(244, 67, 54)', { red });
  record(
    'the red ring sits on the refused joint',
    Math.abs(red.cx - c.modelX) < 1e-6 && Math.abs(red.cy - c.modelY) < 1e-6,
    { ring: [red.cx, red.cy], refused: [c.modelX, c.modelY] }
  );
  record('no amber capture ring is offered alongside it', amber.count === 0, { amber });

  await page.mouse.up();
  await page.waitForTimeout(90);
  const shaking = await effectCount(page, 'jointShake');
  await shot(page, 'refused-shake.png');
  record('the dropped joint shakes', shaking === 1, { shaking });

  await page.waitForTimeout(700);
  const note = await notificationText(page);
  record('the snackbar says why the merge was refused', /over-constrain/i.test(note), { note });
  record('the shake is a one-shot', (await effectCount(page, 'jointShake')) === 0);
  const after = await jointState(page);
  record('nothing was merged', after.length === before.length, { after: after.map((j) => j.id) });
});

await safe('holding Alt suppresses snapping entirely', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  const a = before.find((j) => j.id === 'A');
  const d = before.find((j) => j.id === 'D');

  await page.keyboard.down('Alt');
  await dragBy(
    page,
    { x: a.screenX, y: a.screenY },
    { x: d.screenX, y: d.screenY },
    { holdBeforeRelease: 350 }
  );
  const amber = await ringInfo(page, '.snapTarget');
  const red = await ringInfo(page, '.snapRefused');
  await shot(page, 'alt-suppresses-snap.png');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(600);
  const after = await jointState(page);

  record('no capture ring while Alt is held', amber.count === 0, { amber });
  record('no refusal ring while Alt is held', red.count === 0, { red });
  record('the drop merged nothing', after.length === before.length, {
    after: after.map((j) => j.id),
  });
});

// --- Dragging one end of a bar onto the other ----------------------------
// Self-explanatory from the drawing, so it gets no mark at all rather than a
// red one: not a target, not a refusal, nothing to explain.
await safe('the other end of your own link is not a target', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  const b = before.find((j) => j.id === 'B');
  const c = before.find((j) => j.id === 'C');

  const release = await dragBy(
    page,
    { x: b.screenX, y: b.screenY },
    { x: c.screenX, y: c.screenY },
    { holdBeforeRelease: 350 }
  );
  const rings = await page.evaluate(() => ({
    amber: document.querySelectorAll('#jointHolder .snapTarget').length,
    red: document.querySelectorAll('#jointHolder .snapRefused').length,
  }));
  await shot(page, 'same-link-no-ring.png');
  await release();
  const note = await notificationText(page);
  const after = await jointState(page);

  record('no red ring for the far end of the same link', rings.red === 0, rings);
  record('no amber ring either', rings.amber === 0, rings);
  record('the drop says nothing', note === '', { note });
  record('nothing merged', after.length === before.length, {
    after: after.map((j) => j.id),
  });
});

// --- Welding into a statically indeterminate assembly ---------------------
// Clicking Weld on a named joint is deliberate, so it goes through and warns.
// Only a drag onto the same geometry is refused, because a drop is far more
// easily done by accident. The kinematics stay valid either way.
await safe('welding a pair that is already pinned goes through with a warning', async () => {
  await loadMergeable(page);
  // Bring the spare bar onto the four-bar first: fold its free end F into C, so
  // C is held by BC, CD and the arriving EC. A weld there fuses all three into
  // one body that already holds B and D through the rest of the chain, which is
  // the redundant pin this is about.
  //
  // It used to close the four-bar into a triangle by merging A into D. That is
  // refused now -- A is the driven joint (§2.9) -- and in fact a plain four-bar
  // has no legal merge left at all, which is why this file works on a rig with
  // a spare bar beside it.
  const before = await jointState(page);
  const a = before.find((j) => j.id === 'F');
  const d = before.find((j) => j.id === 'C');
  const release = await dragBy(
    page,
    { x: a.screenX, y: a.screenY },
    { x: d.screenX, y: d.screenY }
  );
  await release();
  const closed = await linkIDs(page);
  record('the spare bar joined the chain', closed.length === 4, { links: closed });

  const withB = await jointState(page);
  const c = withB.find((j) => j.id === 'C');
  await page.mouse.click(c.screenX, c.screenY);
  await page.waitForTimeout(500);

  // Phase 4 replaced the Weld/Unweld button pair with a toggle: a pair of
  // buttons cannot show which side of the axis the joint is currently on.
  const weld = page.locator('toggle-block', { hasText: 'Weld' }).locator('button').first();
  const enabled = await weld.isEnabled().catch(() => null);
  record('the Weld toggle is still clickable', enabled === true, { enabled });

  if (enabled) {
    await weld.click();
    await page.waitForTimeout(700);
    const note = await notificationText(page);
    const after = await linkIDs(page);
    await shot(page, 'weld-warned.png');
    record('the weld went through', JSON.stringify(after) !== JSON.stringify(closed), {
      before: closed,
      after,
    });
    const dof = await page.evaluate(
      () =>
        ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0]?.dof ??
        null
    );
    // Fusing the three bars at C ties D to E, and ground already ties them, so
    // this weld costs the mechanism its freedom -- it comes back at -2.
    record('the weld over-constrains, as this pairing should', Number(dof) < 0, { dof });
    // And the app has to say so somewhere a user will meet it. The check this
    // replaced wanted a snackbar about a redundant pin; there is none, and the
    // standing footer that used to print the number has been deleted. What is
    // left is the Analysis setup drawer, which is what pressing an analysis
    // mode now opens when the mechanism will not run -- so that is where the
    // number is read back from.
    //
    // In the blocker itself rather than in a table of facts: the drawer lists
    // what has to change, and the count is the thing that has to change. The
    // table it used to be read from went with the mechanism panel, which is a
    // page about a machine that runs.
    await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
    await page.waitForTimeout(800);
    const drawer = await page
      .locator('app-analysis-setup')
      .innerText()
      .catch(() => '');
    record(
      'the app reports it rather than leaving the reader at one',
      drawer.includes(`${dof} degrees of freedom`),
      { dof, drawer: drawer.slice(0, 300), note }
    );
  }
});

// --- Alt pressed after the ring is acquired -------------------------------
// A modifier emits no pointermove, so the drop has to read Alt from the release
// itself. Reading only the target cached by the last move merges a drag the
// user had already called off.
await safe('Alt pressed without moving still calls off the merge', async () => {
  await loadMergeable(page);
  const before = await jointState(page);
  const a = before.find((j) => j.id === 'E');
  const d = before.find((j) => j.id === 'D');

  await page.mouse.move(a.screenX, a.screenY);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(
      a.screenX + ((d.screenX - a.screenX) * step) / 10,
      a.screenY + ((d.screenY - a.screenY) * step) / 10
    );
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(250);
  record('the ring was acquired first', (await snapRingCount(page)) === 1);

  // Down, and released, without the pointer moving at all in between.
  await page.keyboard.down('Alt');
  await page.waitForTimeout(250);
  record('the ring clears the moment Alt goes down', (await snapRingCount(page)) === 0);

  // And comes back on release of the key, still without moving.
  await page.keyboard.up('Alt');
  await page.waitForTimeout(250);
  record('the ring returns when Alt is let go', (await snapRingCount(page)) === 1);

  await page.keyboard.down('Alt');
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.keyboard.up('Alt');

  const after = await jointState(page);
  await shot(page, 'alt-on-release.png');
  record('nothing merged', after.length === before.length, { after: after.map((j) => j.id) });
  record('the ring is gone', (await snapRingCount(page)) === 0);
});

// --- The merge label points the way the joint travelled --------------------
await safe('a joint arriving from the right reverses the arrow', async () => {
  await loadMergeable(page);
  const before = await jointState(page);
  const a = before.find((j) => j.id === 'D');
  const d = before.find((j) => j.id === 'E');
  record('E really is to the right of D', d.screenX > a.screenX, {
    d: a.screenX,
    e: d.screenX,
  });

  // Same pair, dragged the other way: D into E rather than E into D.
  await dragBy(page, { x: a.screenX, y: a.screenY }, { x: d.screenX, y: d.screenY });
  await page.waitForTimeout(250);
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('#canvas text')]
      .map((el) => el.textContent.trim())
      .filter(Boolean)
  );
  await shot(page, 'merge-label-reversed.png');
  record('the arrow points back the way it came', labels.includes('D \u2192 E'), {
    merge: labels.filter((l) => /[\u2190\u2192]/.test(l)),
  });

  // Latched: wandering across the target must not flip it back and forth.
  await page.mouse.move(d.screenX - 6, d.screenY);
  await page.waitForTimeout(150);
  const wandered = await page.evaluate(() =>
    [...document.querySelectorAll('#canvas text')]
      .map((el) => el.textContent.trim())
      .filter(Boolean)
  );
  record('the direction holds while the cursor wanders', wandered.includes('D \u2192 E'), {
    merge: wandered.filter((l) => /[\u2190\u2192]/.test(l)),
  });
  await page.mouse.up();
  await page.waitForTimeout(300);
});

await flushReport();
await context.close();

const failed = checks.filter((check) => !check.pass);
console.log(
  `\n${failed.length === 0 ? 'PASS' : 'FAIL'} — ${checks.length - failed.length}/${checks.length} checks`
);
checks.forEach((check) => console.log(`  ${check.pass ? 'ok  ' : 'FAIL'} ${check.name}`));
if (failed.length) console.log('\n' + JSON.stringify(failed, null, 2));
const blocking = issues.filter((entry) => entry.severity === 'high');
if (blocking.length)
  console.log(`\n${blocking.length} high-severity issues:\n` + JSON.stringify(blocking, null, 2));
process.exit(failed.length || blocking.length ? 1 : 0);
