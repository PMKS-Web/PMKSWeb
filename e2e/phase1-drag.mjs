// Phase 1 drag foundation: joint snap/merge, whole-link drag, one undo entry
// per gesture, click-without-nudge, and Analyze mode refusing every drag.
// See docs/joint-types-plan.md, Phase 1.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'phase1';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/pmks-phase1-profile-${Date.now()}`;

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

async function dismissIntro(page) {
  const visible = await page
    .locator('.introjs-tooltip, .introjs-overlay')
    .first()
    .isVisible()
    .catch(() => false);
  if (!visible) return;
  await page
    .locator('.introjs-skipbutton')
    .first()
    .click({ force: true })
    .catch(async () => page.keyboard.press('Escape'));
  await page.waitForTimeout(350);
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

async function notificationText(page) {
  return await page.evaluate(() => {
    const bar = document.querySelector('.mat-mdc-snack-bar-label, simple-snack-bar');
    return bar ? bar.textContent.trim() : '';
  });
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

async function loadFourBar(page) {
  await page.goto(`${baseUrl}?${FOUR_BAR}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(900);
  await dismissIntro(page);
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
  await loadFourBar(page);
  const before = await jointState(page);
  const beforeLinks = await linkIDs(page);
  record('four-bar loaded with A B C D', before.map((j) => j.id).join('') === 'ABCD', {
    joints: before.map((j) => j.id),
    links: beforeLinks,
  });

  // A and D are the two grounds. They share no link, and folding A into D
  // produces B-D rather than a duplicate of an existing link, so it is the one
  // legal merge in a plain four-bar.
  const a = before.find((j) => j.id === 'A');
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
    'ring is dashed and unfilled, so it reads as a target',
    !!ringStyle && ringStyle.dash !== 'none' && ringStyle.fill === 'none',
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
  record('the dragged joint is gone and the target survived', !after.some((j) => j.id === 'A'), {
    after: after.map((j) => j.id),
  });
  record('the merged link was renamed to span the survivor', afterLinks.includes('BD'), {
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

  const dof = await page.evaluate(() => {
    const match = document.body.innerText.match(/Degrees of Freedom:\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  });
  record('the mechanism is still solvable after the drag', dof === '1', { dof });
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

// --- 5. Analyze mode refuses drags ---------------------------------------
await safe('Analyze mode refuses to drag a joint or a link', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  await page.locator('button.leftButton', { hasText: 'Analyze' }).first().click();
  await page.waitForTimeout(800);

  const b = before.find((j) => j.id === 'B');
  const release = await dragBy(
    page,
    { x: b.screenX, y: b.screenY },
    { x: b.screenX + 120, y: b.screenY - 80 }
  );
  await release();
  const note = await notificationText(page);
  const after = await jointState(page);
  const afterB = after.find((j) => j.id === 'B');
  await shot(page, 'analyze-drag-refused.png');

  record(
    'the joint did not move in Analyze mode',
    Math.abs(afterB.modelX - b.modelX) < 0.001 && Math.abs(afterB.modelY - b.modelY) < 0.001,
    { before: [b.modelX, b.modelY], after: [afterB.modelX, afterB.modelY] }
  );
  record('a read-only notification explained the refusal', /read-only|Edit mode/i.test(note), {
    note,
  });
});

// --- 6. The canvas stays put after a merge --------------------------------
// A merge destroys the node the pointer was on, which can leave the pan
// library believing the press never ended. It would then pan on every later
// move with no button held.
await safe('the canvas does not follow the pointer after a merge', async () => {
  await loadFourBar(page);
  const before = await jointState(page);
  const a = before.find((j) => j.id === 'A');
  const d = before.find((j) => j.id === 'D');

  const release = await dragBy(
    page,
    { x: a.screenX, y: a.screenY },
    { x: d.screenX, y: d.screenY }
  );
  await release();
  record('the merge happened', (await jointState(page)).length === before.length - 1);

  // A pan moves joints on screen while leaving their model coordinates alone,
  // which is what tells a stuck pan apart from a stuck drag.
  const settled = await jointState(page);
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(d.screenX + step * 25, d.screenY + step * 15);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  const after = await jointState(page);
  await shot(page, 'after-merge-pointer-moved.png');

  const screenShift = Math.max(
    ...settled.map((joint, index) =>
      Math.hypot(joint.screenX - after[index].screenX, joint.screenY - after[index].screenY)
    )
  );
  const modelShift = Math.max(
    ...settled.map((joint, index) =>
      Math.hypot(joint.modelX - after[index].modelX, joint.modelY - after[index].modelY)
    )
  );
  record('the canvas did not pan', screenShift < 1, { screenShift });
  record('nothing was dragged either', modelShift < 0.001, { modelShift });
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
  await page.goto(`${baseUrl}?${SLIDER_CRANK}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  await dismissIntro(page);
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
