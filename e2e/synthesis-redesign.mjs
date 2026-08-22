/**
 * Synthesis, end to end: place, generate, browse, preview, insert.
 *
 * The redesign changed what the mode *is*. It used to build a four-bar onto the
 * grid on every nudge of a coordinate, which made comparing two solutions
 * impossible -- looking at the second destroyed the first. Now three positions
 * are placed, an explicit search offers every four-bar that passes through
 * them, and exactly one of them reaches the drawing, when Insert says so.
 *
 * Most of what is checked here is the machinery around that promise: that the
 * canvas gestures do not fight svg-pan-zoom, that the preview stops being drawn
 * once it is real, and that the design survives a shared link.
 *
 *   PMKS_BASE_URL=<origin> node e2e/synthesis-redesign.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';

const checks = [];
const check = (what, ok, detail) => {
  checks.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const panel = (fn, arg) =>
  page.evaluate(
    ([body, value]) =>
      new Function('panel', 'arg', body)(
        ng.getComponent(document.querySelector('app-synthesis-panel')),
        value
      ),
    [`return (${fn})(panel, arg);`, arg ?? null]
  );

const grid = (fn) =>
  page.evaluate(
    (body) => new Function('grid', body)(ng.getComponent(document.querySelector('app-new-grid'))),
    `return (${fn})(grid);`
  );

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Synthesis' }).click();
await page.waitForTimeout(700);

const status = () => page.locator('#bottomBar .status').innerText();

/**
 * Wait for the search rather than for a clock: its progress state has a floor
 * under how briefly it may flash past, so a fixed sleep would race it.
 */
const settled = async () => {
  await page.waitForFunction(
    () => !ng.getComponent(document.querySelector('app-synthesis-panel')).solution.generating,
    null,
    { timeout: 15000 }
  );
  await page.waitForTimeout(200);
};

// --- the chooser --------------------------------------------------------
check(
  'Synthesis opens on the question of what is being synthesised',
  await page.locator('#synthesisPanel .kindCard--on').isVisible()
);
check(
  'and says what it cannot do yet rather than hiding it',
  (await page.locator('#synthesisPanel .kindCard--off').innerText()).includes('Coming soon')
);
check(
  'the panel is as wide as the analysis panel, not as wide as Edit',
  (await page.evaluate(() =>
    Math.round(document.querySelector('#synthesisPanel').getBoundingClientRect().width)
  )) === 400
);

await page.locator('#synthesisPanel .kindCard--on').click();
await page.waitForTimeout(400);

// --- placing ------------------------------------------------------------
check(
  "the Positions buttons live in that section's heading, not in a row of their own",
  (await page.locator('#synthesisPanel .panel-header__actions .pill').count()) === 1
);
check(
  'one button at the foot carries whatever the next step is',
  (await page.locator('#synthesisPanel .cta').count()) === 1
);
check(
  'and it names the search before there is anything to search',
  (await page.locator('#synthesisPanel .cta').innerText()).includes('Generate') &&
    (await page.locator('#synthesisPanel .cta').isDisabled())
);
check(
  'section dividers are a single rule, as they are everywhere else in the app',
  await page.evaluate(() =>
    [...document.querySelectorAll('#synthesisPanel collapsible-subseciton')].every((section) => {
      // The header draws the rule; the section must not draw a second one
      // against it, or every boundary comes out at twice the weight.
      const own = getComputedStyle(section).borderBottomWidth;
      const header = getComputedStyle(section.querySelector('.panel-header')).borderTopWidth;
      return own === '0px' && header === '1px';
    })
  )
);
check(
  "a section's header, and its hit area, run the full width of the panel",
  await page.evaluate(() => {
    const panel = document.querySelector('#synthesisPanel').getBoundingClientRect();
    const section = [...document.querySelectorAll('#synthesisPanel collapsible-subseciton')].find(
      (s) => s.querySelector('.panel-header')?.textContent.includes('Requirements')
    );
    const toggle = section.querySelector('.panel-header__toggle').getBoundingClientRect();
    // And the far edge is the toggle, not a dead strip beside it.
    const atEdge = document.elementFromPoint(panel.right - 4, toggle.top + toggle.height / 2);
    return (
      Math.abs(toggle.left - panel.left) < 1 &&
      Math.abs(toggle.right - panel.right) < 1 &&
      atEdge.classList.contains('panel-header__toggle')
    );
  })
);
check(
  'the strictest requirement is the one offered first',
  (await page.locator('#synthesisPanel .req__label').first().innerText()).includes(
    'Reaches all 3 positions'
  )
);
check(
  'the design is laid out as sections that can be folded away',
  (await page.locator('#synthesisPanel collapsible-subseciton').count()) === 3
);

check(
  'all three positions have a row before any is placed',
  (await page.locator('#synthesisPanel .poseRow').count()) === 3
);
check(
  'and none of them is selected until one is asked for',
  (await page.locator('#synthesisPanel .poseRow--sel').count()) === 0
);
check(
  'and every one of the nine boxes can be typed into before anything is placed',
  (await page.locator('.poseRow input:disabled').count()) === 0 &&
    (await page.locator('.poseRow input').count()) === 9
);

// Arming from an empty row, before the suite arms from the button: both are
// advertised as ways to place a position, and only the button used to prepare
// the scale, so a ghost armed from the row was drawn at the old one. Left
// disarmed, which is the state the next step expects.
check(
  'an empty position row arms placing, and fits the scale as the button does',
  await (async () => {
    await page.evaluate(() => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      grid.settings.objectScale = 140;
    });
    await page.waitForTimeout(200);
    await page.locator('#synthesisPanel .poseRow__n').first().click();
    await page.waitForTimeout(300);
    const armed = await panel('(p) => p.design.armed');
    const fitted = await page.evaluate(() => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      return Math.abs(grid.settings.objectScale - 60 / grid.svgGrid.getZoom()) < 0.02;
    });
    await panel('(p) => p.design.setArmed(false)');
    await page.waitForTimeout(200);
    return armed && fitted;
  })()
);

// Typing is the other way in, and it is live at the same time as the placer
// rather than instead of it: a row becomes a position at the moment it says
// where and which way, which is the same moment a dropped one does.
{
  const row = (axis) => page.locator(`input[aria-label="Position 1 ${axis}"]`);
  await row('X').click();
  await row('X').fill('3');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  check(
    'typing into a row points the panel at it, without placing anything',
    (await panel('(p) => p.design.getAllPoses().length')) === 0 &&
      (await page.locator('#synthesisPanel .poseRow--sel').count()) === 1
  );
  await row('Y').fill('2');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  check('and a row with no angle yet is still not a position', (await panel('(p) => p.design.getAllPoses().length')) === 0);
  await row('angle').fill('15');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const typed = await page.evaluate(() => {
    const d = ng.getComponent(document.querySelector('app-synthesis-panel')).design;
    const pose = d.isPoseDefined(1) ? d.getPose(1) : undefined;
    return pose && { x: +(pose.position.x / 200).toFixed(2), y: +(pose.position.y / 200).toFixed(2), t: Math.round(pose.thetaDegrees) };
  });
  check(
    'and the row becomes a position once it says where and which way',
    JSON.stringify(typed) === JSON.stringify({ x: 3, y: 2, t: 15 }),
    typed
  );
  // Back to nothing, so the placing checks below start where they always did.
  await page.locator('#synthesisPanel .poseRow').first().locator('.poseRow__remove').click();
  await page.waitForTimeout(400);
  check('and it can be taken off again', (await panel('(p) => p.design.getAllPoses().length')) === 0);
}


await page.locator('#synthesisPanel .pill', { hasText: 'Add position' }).click();
await page.waitForTimeout(250);
await page.mouse.move(900, 560);
await page.waitForTimeout(200);
const angleBefore = await panel('(p) => p.design.placeAngleDeg');
await page.mouse.wheel(0, -120);
await page.waitForTimeout(200);
const angleAfter = await panel('(p) => p.design.placeAngleDeg');
check(
  'the ghost is drawn at the size the position will be, not resized by the click',
  await page.evaluate(() => {
    // Object scale decides how big parts are drawn, and it used to be fitted on
    // the first click -- so the ghost was drawn small and the position it
    // turned into was drawn large, which looked like clicking had grown it.
    const ghost = document.querySelector('.synthGhost path');
    return !!ghost && ghost.getBoundingClientRect().width > 20;
  })
);
check('the wheel turns the position that is about to be dropped', angleAfter !== angleBefore, {
  angleBefore,
  angleAfter,
});
const zoomWhileArmed = await grid('(g) => g.svgGrid.panZoomObject.getZoom()');
await page.mouse.wheel(0, -120);
await page.waitForTimeout(200);
check(
  'and does not zoom the canvas while it is doing so',
  (await grid('(g) => g.svgGrid.panZoomObject.getZoom()')) === zoomWhileArmed
);

await page.mouse.down();
// Held well past the tenth of a second the old gate allowed: aiming at a spot
// takes as long as it takes, and every slower click used to be thrown away.
await page.waitForTimeout(500);
await page.mouse.up();
await page.waitForTimeout(350);
check(
  'a click on the grid drops it, however long it is held',
  (await panel('(p) => p.design.getAllPoses().length')) === 1
);
check('and placing stays armed for the next one', await panel('(p) => p.design.armed'));

// A press that travels is a drag, and must not drop anything.
await page.mouse.move(1180, 300);
await page.mouse.down();
await page.mouse.move(1260, 250, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
check(
  'but a press that travels is a drag, and drops nothing',
  (await panel('(p) => p.design.getAllPoses().length')) === 1
);

// The remaining two, so there is a design to search.
for (const [x, y] of [
  [1000, 470],
  [1120, 330],
]) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
}
check(
  'three placed, and placing disarms itself',
  (await panel('(p) => p.design.getAllPoses().length')) === 3
);
check('placing disarmed', !(await panel('(p) => p.design.armed')));
// With all three placed there is no button left to put in the Positions
// header, and the empty row it left behind was a gap under the heading.
check(
  'the first position sits under its heading, with no empty row between',
  (await page.evaluate(() => {
    const section = [...document.querySelectorAll('#synthesisPanel collapsible-subseciton')].find(
      (s) => s.querySelector('.panel-header')?.textContent.includes('Positions')
    );
    const head = section.querySelector('.panel-header').getBoundingClientRect();
    const row = section.querySelector('.poseRow').getBoundingClientRect();
    return Math.round(row.top - head.bottom);
  })) <= 8
);
check(
  'the status strip follows the design rather than the empty drawing',
  (await status()).includes('positions placed'),
  await status()
);
check(
  'the wheel is the canvas zoom again',
  await grid('(g) => g.svgGrid.panZoomObject.isMouseWheelZoomEnabled()')
);

// --- dragging a position on the grid ------------------------------------
const panBefore = await grid('(g) => JSON.stringify(g.svgGrid.panZoomObject.getPan())');
const posBefore = await panel('(p) => p.design.getPose(1).position.x');
const bar = await page.evaluate(() => {
  const box = document.querySelector('.synthPose').getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await page.mouse.move(bar.x, bar.y);
await page.mouse.down();
await page.mouse.move(bar.x + 60, bar.y + 20, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
check(
  'a position can be dragged on the grid',
  (await panel('(p) => p.design.getPose(1).position.x')) !== posBefore
);
check(
  'and the canvas does not pan under the drag',
  (await grid('(g) => JSON.stringify(g.svgGrid.panZoomObject.getPan())')) === panBefore
);

// --- a design that actually has solutions -------------------------------
await panel(`(p) => {
  p.design.applyDecoded({
    length: 1000, reference: 'CENTER', endsOnly: true, allowDefect: false,
    constrain: false, stage: 'working',
    poses: [
      { at: { x: 0, y: 0 }, thetaDegrees: 0 },
      { at: { x: 800, y: 400 }, thetaDegrees: 25 },
      { at: { x: 1400, y: 1400 }, thetaDegrees: 50 },
    ],
  });
}`);
await page.waitForTimeout(400);

check(
  'nothing is on the grid before Generate',
  (await grid('(g) => g.mechanismSrv.joints.length')) === 0
);
check(
  'and no candidates are offered',
  (await panel('(p) => p.solution.candidates().length')) === 0
);

// Where the panel is looking before the search, so the scroll can be measured.
await page.evaluate(() => document.querySelector('#synthesisPanel .work__scroll').scrollTo(0, 0));
await page.waitForTimeout(200);
const scrollBefore = await page.evaluate(() =>
  Math.round(document.querySelector('#synthesisPanel .work__scroll').scrollTop)
);
await page.locator('#synthesisPanel .cta', { hasText: 'Generate solutions' }).click();
await page.waitForTimeout(400);
check(
  'a search in progress is a bar, with no prose nobody has time to read',
  await page.evaluate(() => {
    const box = document.querySelector('#synthesisPanel .foot__progress');
    return !!box && box.innerText.trim() === '' && box.querySelectorAll('.sweep').length === 1;
  })
);
await settled();
await page.waitForTimeout(1200);
check(
  'and when it finishes the panel goes to meet its answer',
  await page.evaluate((was) => {
    const box = document.querySelector('#synthesisPanel .work__scroll');
    const bottom = Math.round(box.scrollHeight - box.clientHeight);
    return bottom === 0 || (Math.round(box.scrollTop) >= bottom - 4 && box.scrollTop > was);
  }, scrollBefore)
);
const strict = await panel('(p) => p.solution.candidates().length');
check('Generate finds four-bars through the three positions', strict > 0, strict);
check(
  'a lone candidate is not given a gallery of one to be compared against',
  (await page.locator('#synthesisPanel .card').count()) === (strict > 1 ? strict : 0),
  { strict, cards: await page.locator('#synthesisPanel .card').count() }
);
check(
  'nor a heading counting it',
  (await page.locator('#synthesisPanel .sect__head .sect__title').count()) === (strict > 1 ? 1 : 0)
);
check(
  'and is called simply the solution, with no letter to go looking past',
  (await panel('(p) => p.solutionHeading')) === (strict > 1 ? 'Solution A' : 'Solution'),
  await panel('(p) => p.solutionHeading')
);
check(
  'the positions are marked as reached',
  (await panel('(p) => JSON.stringify([1,2,3].map(i => p.reached(i)))')) === '[true,true,true]'
);
check(
  'and the linkage is previewed on the grid',
  (await grid('(g) => g.synthCanvas.previewLinks().length')) > 0
);
check(
  'drawn broken, because it is still only an offer',
  await page.evaluate(() => {
    const bars = [...document.querySelectorAll('#synthesisPreview path.synthBar')];
    // Rendered at all, first. Asking only whether every bar is dashed is a
    // question an empty canvas answers yes to, so losing the class -- or the
    // paths -- would have read as a pass.
    return (
      bars.length >= 3 &&
      bars.every(
        (bar) =>
          bar.classList.contains('synthBar--proposed') && bar.getAttribute('stroke-dasharray')
      )
    );
  })
);
check(
  'but still nothing has been added to the drawing',
  (await grid('(g) => g.mechanismSrv.joints.length')) === 0
);

// Unpinning the coupler from the link's ends finds more machines through the
// same three positions.
await page
  .locator('#synthesisPanel .req', { hasText: "Coupler pinned at the link's ends" })
  .locator('.req__line')
  .click();
await page.waitForTimeout(300);
await page.locator('#synthesisPanel .cta', { hasText: 'Generate solutions' }).click();
await settled();
const loose = await panel('(p) => p.solution.candidates().length');
check('letting the pins slide finds more of them', loose > strict, { strict, loose });
check(
  'and now there is a gallery to compare them in',
  (await page.locator('#synthesisPanel .card').count()) > 1
);

// --- a nudge is a different answer, not a different question -------------
await panel(`(p) => {
  const pose = p.design.getPose(2);
  pose.position = { x: pose.position.x + 40, y: pose.position.y + 40, applyMatrix() {} };
  p.design.valueChanges.next(true);
}`);
await page.waitForTimeout(500);
check(
  'nudging a position does not send the reader back to Generate',
  await panel('(p) => p.solution.generated')
);
check(
  'and the search keeps up with it by itself',
  (await panel('(p) => p.solution.candidates().length')) > 0
);

// --- "Driven from" has to change something the reader can see -------------
const onPinA = await grid('(g) => JSON.stringify(g.synthCanvas.previewGrounds())');
await page.locator('#synthesisPanel .seg__opt', { hasText: 'Pin D' }).click();
await page.waitForTimeout(600);
const onPinD = await grid('(g) => JSON.stringify(g.synthCanvas.previewGrounds())');
check('changing the drive pin moves the input mark on the grid', onPinA !== onPinD);
await page.locator('#synthesisPanel .seg__opt', { hasText: 'Pin A' }).click();
await page.waitForTimeout(500);

// --- comparing --------------------------------------------------------
if ((await page.locator('#synthesisPanel .card').count()) > 1) {
  await page.locator('#synthesisPanel .card').nth(1).hover();
  await page.waitForTimeout(300);
  check(
    'hovering another candidate keeps the chosen one on screen to compare against',
    (await grid('(g) => g.synthCanvas.hoverGhostLinks().length')) === 3
  );
  await page.locator('#synthesisPanel .card').nth(1).click();
  await page.waitForTimeout(300);
  check('and clicking it takes it', (await panel('(p) => p.solutionName')) === 'B');
  await page.locator('#synthesisPanel .card').first().click();
  await page.waitForTimeout(300);
}

// --- the driver -------------------------------------------------------
await page.locator('#synthesisPanel .row', { hasText: 'Add driver' }).locator('.switch').click();
await page.waitForTimeout(500);
const withDriver = await panel(
  '(p) => JSON.stringify({ dyad: !!p.solution.dyad(), refusal: p.solution.driverRefusal ?? null, rows: p.dimensionRows().length })'
);
const driver = JSON.parse(withDriver);
// A six-bar is driven by its own crank, so its preview must turn through a
// whole revolution without the driver's links dropping out.
if (driver.dyad) {
  const steady = await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const range = panel.solution.drivenRange();
    const held = panel.solution.phase;
    const counts = new Set();
    for (let k = 0; k <= 120; k++) {
      panel.solution.phase = range.from + ((range.to - range.from) * k) / 120;
      counts.add(grid.synthCanvas.previewLinks().length);
    }
    panel.solution.phase = held;
    return { counts: [...counts], span: Math.round(range.to - range.from) };
  });
  check(
    'the six-bar preview holds together across the whole of its travel',
    steady.counts.length === 1 && steady.counts[0] === 5,
    steady
  );
  check('and that travel is a revolution, not a sliver of one', steady.span >= 180, steady);
}

check(
  'every pin the panel names by letter is lettered on the drawing',
  await page.evaluate(() => {
    const drawn = new Set(
      [...document.querySelectorAll('#synthesisPreviewTags .synthPreviewTag')].map((t) =>
        t.textContent.trim()
      )
    );
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    // Every letter the panel uses -- "Pin A", "Ground A–D", "Coupler B–C" --
    // has to name something the reader can find on the grid.
    const named = new Set();
    panel.pinOptions().forEach((o) => (o.label.match(/[A-F]/g) ?? []).forEach((l) => named.add(l)));
    panel
      .dimensionRows()
      .forEach((r) => (r.label.match(/\b[A-F]\b/g) ?? []).forEach((l) => named.add(l)));
    return [...named].every((letter) => drawn.has(letter));
  })
);
check(
  'and a length given in words still puts its unit beside the number',
  await panel(`(p) => {
    const rows = p.dimensionRows();
    // Every length carries a unit, and none of them carries it at the end of a
    // phrase. Rejecting only the phrase let "no unit anywhere" through, which
    // is the more obvious way for this to be wrong.
    const lengths = rows.filter((r) => /\\d/.test(r.value) && r.label !== 'Coupler pinned');
    return (
      lengths.length > 0 &&
      lengths.every((r) => / (cm|m|in)$/.test(r.value)) &&
      !rows.some((r) => /[a-z]{3,} (cm|m|in)$/.test(r.value))
    );
  }`)
);
check(
  'Space activates a focused button, as Space does',
  await (async () => {
    // A real key press on a real button, judged by whether the button did its
    // job. The old check dispatched a synthetic event and asked only whether
    // anything called preventDefault on it -- which a synthetic event proves
    // nothing about, since it cannot trigger the native activation the global
    // shortcut was suppressing in the first place.
    const toggle = page.locator('#synthesisPanel .panel-header__toggle').first();
    if (!(await toggle.count())) return false;
    const openState = () =>
      page.evaluate(
        () =>
          !!document
            .querySelector('#synthesisPanel .panel-header__toggle mat-icon')
            ?.classList.contains('rotate180')
      );
    const before = await openState();
    await toggle.focus();
    await page.keyboard.press(' ');
    await page.waitForTimeout(350);
    const after = await openState();
    // Put the section back the way it was found.
    await page.keyboard.press(' ');
    await page.waitForTimeout(350);
    const restored = await openState();
    return after !== before && restored === before;
  })()
);
check(
  'driving from the far pin is no slower to draw than driving from the near one',
  await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const held = panel.solution.driveOnFarPin;
    const timeIt = () => {
      const range = panel.solution.drivenRange();
      const started = performance.now();
      for (let k = 0; k < 20; k++) {
        panel.solution.phase = range.from + ((range.to - range.from) * k) / 20;
        grid.synthCanvas.previewLinks();
        grid.synthCanvas.couplerTrace();
      }
      panel.solution.phase = null;
      return performance.now() - started;
    };
    panel.solution.setDriveOnFarPin(false);
    const near = timeIt();
    panel.solution.setDriveOnFarPin(true);
    const far = timeIt();
    panel.solution.setDriveOnFarPin(held);
    // Reading the linkage from the far pin re-assesses it, which walks a whole
    // revolution. Done per call, that was hundreds of thousands of solves a
    // frame and the preview crawled.
    return far < Math.max(60, near * 4);
  })
);
check(
  'a driver is only offered when it can turn a whole revolution',
  await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    const held = panel.solution.driverWanted;
    const bad = [];
    for (const candidate of panel.solution.candidates()) {
      panel.solution.pick(candidate.key);
      const refused = !!panel.driverRefusal;
      panel.solution.driverWanted = true;
      const range = panel.solution.drivenRange();
      const fitted = !!panel.solution.dyad();
      panel.solution.driverWanted = held;
      // Offered, sized, and yet unable to complete a turn is the combination
      // that breaks the "one full turn" promise the panel makes. So is offered
      // and not sized at all: the panel raised no objection and then produced
      // no driver, which leaves the switch on over a linkage that has none.
      if (!refused && fitted && !range.full) bad.push(candidate.key + ' jams');
      if (!refused && !fitted) bad.push(candidate.key + ' offered but unsized');
    }
    return panel.solution.candidates().length > 0 && bad.length === 0;
  })
);
check(
  'a drag released off the canvas still ends the gesture',
  await (async () => {
    const bar = await page.evaluate(() => {
      const box = document.querySelector('.synthPose')?.getBoundingClientRect();
      return box
        ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
        : null;
    });
    // No bar to drag is a broken check, not a passing one -- and the gesture
    // has to be seen to start, or "it ended" is true of a drag that never was.
    if (!bar) return false;
    // Remember where it was: this drag deliberately ends over the panel, and a
    // position parked under the panel is one nothing later can right-click.
    const before = await panel(
      '(p) => JSON.stringify(p.design.getAllPoses().map((q) => [q.position.x, q.position.y, q.thetaDegrees]))'
    );
    await page.mouse.move(bar.x, bar.y);
    await page.mouse.down();
    await page.mouse.move(bar.x - 40, bar.y + 40, { steps: 4 });
    const began = await grid('(g) => !!g.synthCanvas.dragging');
    await page.mouse.move(200, 500, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const ended =
      began && (await grid('(g) => !g.synthCanvas.dragging && !g.synthSolution.interactive'));
    await page.evaluate((was) => {
      const design = ng.getComponent(document.querySelector('app-synthesis-panel')).design;
      JSON.parse(was).forEach(([x, y, theta], index) => {
        const pose = design.getPose(index + 1);
        pose.position = { x, y, applyMatrix() {} };
        pose.thetaDegrees = theta;
      });
      design.valueChanges.next(true);
    }, before);
    await page.waitForTimeout(400);
    return ended;
  })()
);
check(
  'the driver switch agrees with the panel on every candidate and both drive ends',
  await (async () => {
    /*
      Named for what it establishes, which is agreement across this design --
      not the greying, because this design never refuses a driver and so never
      turns the switch off. It was called "a driver that cannot be fitted is
      greyed" while comparing two values that were both false on every sample.
      A design that does refuse is checked at the end of this file, where one
      is built for the purpose.
    */
    const seen = await page.evaluate(() => {
      const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
      const row = [...document.querySelectorAll('#synthesisPanel .row')].find((r) =>
        r.textContent.includes('Add driver')
      );
      if (!row) return null;
      const button = row.querySelector('.switch');
      if (!button) return null;
      const held = panel.solution.driveOnFarPin;
      const out = { agreed: true, enabled: 0, disabled: 0 };
      for (const candidate of panel.solution.candidates()) {
        panel.solution.pick(candidate.key);
        for (const far of [false, true]) {
          panel.solution.setDriveOnFarPin(far);
          const refused = !!panel.driverRefusal;
          if (button.disabled !== refused) out.agreed = false;
          refused ? out.disabled++ : out.enabled++;
        }
      }
      panel.solution.setDriveOnFarPin(held);
      return out;
    });
    return !!seen && seen.agreed && seen.enabled > 0;
  })()
);
check(
  'a driver is either fitted or refused in words',
  driver.dyad || typeof driver.refusal === 'string',
  driver
);
if (driver.dyad) {
  check('and its two lengths are listed with the rest', driver.rows === 7, driver);
}

// --- the transport ----------------------------------------------------
const phaseBefore = await panel('(p) => p.solution.currentPhase()');
await page.locator('#synthesisPanel .iconBtn--sm').first().click();
await page.waitForTimeout(600);
const phaseAfter = await panel('(p) => p.solution.currentPhase()');
check('the preview can be played', phaseAfter !== phaseBefore, { phaseBefore, phaseAfter });
await page.locator('#synthesisPanel .iconBtn--sm').first().click();
await page.waitForTimeout(200);
check('and paused', !(await panel('(p) => p.solution.playing')));
check(
  'the three positions are marked along its travel',
  (await page.locator('#synthesisPanel .track__tick').count()) === 3
);
check(
  'the transport buttons are big enough for the glyphs in them',
  await page.evaluate(() =>
    [...document.querySelectorAll('#synthesisPanel .iconBtn--sm')].every((button) => {
      const outer = button.getBoundingClientRect();
      const glyph = button.querySelector('mat-icon').getBoundingClientRect();
      return glyph.height <= outer.height + 0.5 && glyph.width <= outer.width + 0.5;
    })
  )
);

// --- inserting ---------------------------------------------------------
await page.locator('#synthesisPanel .cta--insert').click();
await page.waitForTimeout(900);
const inserted = JSON.parse(
  await grid(
    '(g) => JSON.stringify({ joints: g.mechanismSrv.joints.map(j => j.id), links: g.mechanismSrv.links.map(l => l.id), valid: g.mechanismSrv.mechanisms.map(m => m.isMechanismValid()) })'
  )
);
check(
  'Insert puts the solution on the grid',
  inserted.joints.length === (driver.dyad ? 6 : 4),
  inserted
);
check(
  'with no two joints sharing an id',
  new Set(inserted.joints).size === inserted.joints.length,
  inserted
);
check('and it solves', inserted.valid.length > 0 && inserted.valid.every(Boolean), inserted);
check(
  'the preview stops being drawn once the real thing is there',
  (await grid('(g) => g.synthCanvas.previewLinks().length')) === 0
);
check(
  'the positions stay for reference',
  (await panel('(p) => p.design.getAllPoses().length')) === 3
);
check(
  'and the strip says what was left on the grid',
  (await status()).startsWith('Inserted as a'),
  await status()
);

// --- the positions outlive the mode -------------------------------------
await page.locator('.tabButton', { hasText: 'Kinematic Analysis' }).click();
await page.waitForTimeout(900);
check(
  'the positions are still drawn once the reader goes to look at the motion',
  (await page.locator('#synthesis .synthPose').count()) === 3,
  await page.locator('#synthesis .synthPose').count()
);
check(
  'as a shadow rather than as controls',
  (await page.locator('#synthesis.shadow').count()) === 1,
  await page.evaluate(
    () => document.querySelector('#synthesis')?.getAttribute('class') ?? 'no #synthesis'
  )
);
check(
  'and the verdict on each is not repeated there',
  (await page.locator('#synthesisChips').count()) === 0
);
// Back to Synthesis for the rest of the suite.
await page.locator('.tabButton', { hasText: 'Synthesis' }).click();
await page.waitForTimeout(800);
await page.mouse.click(700, 820, { button: 'right' });
await page.waitForTimeout(500);
check(
  'the canvas menu can clear them away from any mode',
  (await page.locator('#contextMenu .cm-row__label').allInnerTexts()).some((t) =>
    /Delete \d+ Synthesis Positions?/.test(t)
  ),
  await page.locator('#contextMenu .cm-row__label').allInnerTexts()
);
await page.keyboard.press('Escape');
const poseBar = await page.evaluate(() => {
  const box = document.querySelector('.synthPose').getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await page.mouse.click(poseBar.x, poseBar.y, { button: 'right' });
await page.waitForTimeout(500);
check(
  'and one position can be taken away on its own',
  (await page.locator('#contextMenu .cm-row__label').allInnerTexts()).some((t) =>
    /Delete Position \d/.test(t)
  ),
  await page.locator('#contextMenu .cm-row__label').allInnerTexts()
);
await page.keyboard.press('Escape');

// --- inserting again revises, rather than accumulating ------------------
//
// The loop the mode is for: try a solution, look at it, try the next. Insert
// replaces the machine this design put there, and never anything else.
const ownedFirst = await panel('(p) => JSON.stringify(p.design.ownedJointIds)');
check(
  'the design knows which joints it put on the grid',
  JSON.parse(ownedFirst).length > 0,
  ownedFirst
);
if ((await page.locator('#synthesisPanel .card').count()) > 1) {
  await page.locator('#synthesisPanel .card').nth(1).click();
  await page.waitForTimeout(400);
  check(
    'a different solution offers to replace what is there, not to add to it',
    (await panel('(p) => p.insertLabel')) === 'Replace on grid',
    await panel('(p) => p.insertLabel')
  );
  await page.locator('#synthesisPanel .cta--insert').click();
  await page.waitForTimeout(900);
  const again = JSON.parse(
    await grid('(g) => JSON.stringify(g.mechanismSrv.joints.map(j => j.id))')
  );
  check('and inserting it leaves one machine, not two', again.length === inserted.joints.length, {
    first: inserted.joints,
    again,
  });
}

// A joint moved by hand is work the reader may still want. Insert says so and
// changes nothing until they answer.
await panel(`(p) => {
  const id = p.design.ownedJointIds[1];
  const joint = p.mechanismSrv.joints.find((j) => j.id === id);
  joint.x += 600;
  joint.y += 600;
}`);
await page.waitForTimeout(200);
check('a hand-moved joint is noticed', (await panel('(p) => p.solution.ownership()')) === 'edited');
const beforeAsking = await grid('(g) => g.mechanismSrv.joints.length');
await page.locator('#synthesisPanel .cta--insert').click();
await page.waitForTimeout(500);
check(
  'and Insert asks instead of overwriting it',
  (await grid('(g) => g.mechanismSrv.joints.length')) === beforeAsking
);
check(
  'offering both of the things the reader could mean',
  (await page.locator('button', { hasText: 'Replace it' }).count()) === 1 &&
    (await page.locator('button', { hasText: 'Keep it, insert a new one' }).count()) === 1
);
await page.locator('button', { hasText: 'Replace it' }).first().click();
await page.waitForTimeout(900);
check('and replaces it when told to', (await panel('(p) => p.solution.ownership()')) === 'ours');

await page.locator('#synthesisPanel .note__undo').click();
await page.waitForTimeout(700);
check(
  'Open and Crossed are one solution with a switch, not two solutions',
  await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    const shown = panel.solution.candidates();
    const constructions = new Set(panel.solution.allAssemblies().map((c) => c.pair));
    // One card per construction, and never two cards for the same one.
    return (
      shown.length === new Set(shown.map((c) => c.pair)).size && shown.length <= constructions.size
    );
  })
);
check(
  'a position says which way round it is without changing its silhouette',
  await page.evaluate(() => {
    const bar = document.querySelector('.synthPose path.synthBar');
    const arrows = document.querySelectorAll('.synthBarArrow').length;
    // Two round caps, as every other link on this canvas has, plus a chevron.
    return (bar.getAttribute('d').match(/A /g) || []).length === 2 && arrows > 0;
  })
);
check(
  'the gallery keeps its three columns when it is opened out',
  await (async () => {
    // Opened out, which is the only state the claim is about. The old check
    // never opened it, asked whether the closed gallery's columns were "not
    // two", and passed because a flex row has no columns at all -- so the one
    // thing it was named for was the one thing it did not look at.
    const more = page.locator('#synthesisPanel .linkBtn').first();
    if (!(await more.count())) return false;
    await more.click();
    await page.waitForTimeout(250);
    const opened = await page.evaluate(() => {
      const gallery = document.querySelector('#synthesisPanel .gallery--all');
      if (!gallery) return null;
      return getComputedStyle(gallery).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
    });
    await more.click();
    await page.waitForTimeout(250);
    return opened === 3;
  })()
);
check(
  'a flurry of presses on Insert commits once, and one Undo takes it back',
  await (async () => {
    await panel(`(p) => {
      const range = p.solution.drivenRange();
      p.solution.setPhase(range.from + (range.to - range.from) * 0.6);
      window.__inserts = 0;
      const real = p.solution.insert.bind(p.solution);
      p.solution.insert = (...args) => { window.__inserts += 1; return real(...args); };
    }`);
    const button = page.locator('#synthesisPanel .cta--insert');
    await button.click();
    await button.click({ force: true });
    await button.click({ force: true });
    await page.waitForTimeout(1200);
    const committed = await page.evaluate(() => window.__inserts);
    // And measured where it actually shows: one press must be one step of
    // history. Counting calls missed that inserting saved twice -- once through
    // the rebuild and once again afterwards -- so a single Undo stepped back
    // over the second save and left the linkage on the grid.
    const joints = await grid('(g) => g.mechanismSrv.joints.length');
    await page.evaluate(() => ng.getComponent(document.querySelector('app-top-bar')).undo());
    await page.waitForTimeout(1200);
    const afterOneUndo = await grid('(g) => g.mechanismSrv.joints.length');
    await panel('(p) => { p.solution.releaseOwnership(); }');
    await page.waitForTimeout(300);
    return committed === 1 && joints > 0 && afterOneUndo === 0;
  })()
);
check('and Undo takes exactly it back', (await grid('(g) => g.mechanismSrv.joints.length')) === 0);
check('leaving the design alone', (await panel('(p) => p.design.getAllPoses().length')) === 3);

// --- the design survives undo -------------------------------------------
//
// The real test of the design being in the URL: undo and redo are a stack of
// those strings, so a design that is not written into them cannot survive one.
const beforeUndo = await panel(
  '(p) => JSON.stringify(p.design.getAllPoses().map(q => [Math.round(q.position.x), Math.round(q.position.y)]))'
);
await page
  .locator('#synthesisPanel .pill--square')
  .count()
  .catch(() => 0);
await page.locator('#synthesisPanel .poseRow').nth(2).locator('.poseRow__remove').click();
await page.waitForTimeout(600);
check('a position can be removed', (await panel('(p) => p.design.getAllPoses().length')) === 2);
check(
  'and that, unlike a nudge, does send the reader back to Generate',
  !(await panel('(p) => p.solution.generated'))
);

await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-top-bar'));
  bar.undo();
});
await page.waitForTimeout(900);
check(
  'and Undo brings it back, in the place it was',
  (await panel(
    '(p) => JSON.stringify(p.design.getAllPoses().map(q => [Math.round(q.position.x), Math.round(q.position.y)]))'
  )) === beforeUndo,
  {
    beforeUndo,
    now: await panel(
      '(p) => JSON.stringify(p.design.getAllPoses().map(q => [Math.round(q.position.x), Math.round(q.position.y)]))'
    ),
  }
);

await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-top-bar')).redo();
});
await page.waitForTimeout(900);
check('and Redo takes it away again', (await panel('(p) => p.design.getAllPoses().length')) === 2);

/*
  The four things the fifth review found, each on its own page.

  They run last and in isolation because every one of them is about state --
  what is on the grid, what has been chosen, what is mid-flight -- and a check
  that leaves any of that behind is a check that breaks the next one. That has
  happened twice in this file already.
*/

const SOLVED =
  BASE + '/?2P.VC,1E8.5,0.1011....N_.SD~1uT~1~8,SP~01lk~g_~1z0,SP~DT~1e5~087a,SP~59p~0I0~0OBHJ';

/** A page showing that design with its solutions already worked out. */
async function solvedPage() {
  const p = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', (error) => errors.push(String(error)));
  await p.goto(SOLVED, { waitUntil: 'domcontentloaded' });
  await waitForReady(p);
  // The app does not open on Synthesis, and a design in the URL does not send
  // it there either. The tour's overlay eats the click if it is still up.
  await p.locator('.tabButton', { hasText: 'Synthesis' }).click();
  await p.waitForTimeout(700);
  await p.locator('#synthesisPanel .cta', { hasText: 'Generate solutions' }).click();
  await p.waitForFunction(
    () => !ng.getComponent(document.querySelector('app-synthesis-panel')).solution.generating,
    null,
    { timeout: 20000 }
  );
  return p;
}

/** Asks the grid, which outlives the panel when the reader leaves Synthesis. */
const askGrid = (p, fn) =>
  p.evaluate(
    (body) => new Function('grid', body)(ng.getComponent(document.querySelector('app-new-grid'))),
    `return (${fn})(grid);`
  );

const ask = (p, fn) =>
  p.evaluate(
    (body) =>
      new Function('panel', 'grid', body)(
        ng.getComponent(document.querySelector('app-synthesis-panel')),
        ng.getComponent(document.querySelector('app-new-grid'))
      ),
    `return (${fn})(panel, grid);`
  );

{
  // A pin keeps its name when you change which end drives it. The ground pins
  // are the ones to ask: they are the two the control names, and unlike the
  // coupler pins they do not move when the linkage is re-posed.
  const p = await solvedPage();
  const groundsAt = () =>
    ask(
      p,
      `(panel, grid) =>
        JSON.stringify(
          grid.synthCanvas
            .previewGrounds()
            .filter((j) => j.id === 'A' || j.id === 'D')
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .map((j) => [j.id, Math.round(j.x), Math.round(j.y)])
        )`
    );
  await ask(p, '(panel) => panel.solution.setDriveOnFarPin(false)');
  await p.waitForTimeout(250);
  const near = await groundsAt();
  await ask(p, '(panel) => panel.solution.setDriveOnFarPin(true)');
  await p.waitForTimeout(400);
  const far = await groundsAt();
  check('the letter on a pin does not move when the other end drives', near === far, {
    near,
    far,
  });
  check(
    'and the motor moves to the pin the control names',
    await ask(
      p,
      `(panel, grid) => {
        const input = grid.synthCanvas.previewGrounds().find((j) => j.input);
        return !!input && input.id === 'D';
      }`
    )
  );
  await p.close();
}

{
  // Insert one, then look at another: the panel offers to replace, so the one
  // being offered has to be the one on screen.
  const p = await solvedPage();
  const outcome = await ask(
    p,
    `(panel, grid) => {
      const all = panel.solution.candidates();
      if (all.length < 2) return { few: all.length };
      panel.solution.pick(all[0].key);
      panel.insert();
      const afterInsert = grid.synthCanvas.previewLinks().length;
      panel.solution.pick(all[1].key);
      return {
        few: 0,
        afterInsert,
        afterChoosingAnother: grid.synthCanvas.previewLinks().length,
        offersToReplace: panel.primaryLabel === 'Replace on grid',
      };
    }`
  );
  check(
    'the one on the grid stops being previewed, and a different choice starts being',
    outcome.few === 0 &&
      outcome.afterInsert === 0 &&
      outcome.afterChoosingAnother > 0 &&
      outcome.offersToReplace,
    outcome
  );
  await p.close();
}

{
  // Insert waits 220ms to wind the preview home. Choosing something else
  // during that time is a change of mind, not a redirection of the press.
  const p = await solvedPage();
  const setup = await ask(
    p,
    `(panel) => {
      const all = panel.solution.candidates();
      if (all.length < 2) return { few: all.length };
      panel.solution.pick(all[0].key);
      const range = panel.solution.drivenRange();
      panel.solution.setPhase(range.from + (range.to - range.from) * 0.6);
      panel.insert();
      return { few: 0, second: all[1].key, joints: panel.mechanismSrv.joints.length };
    }`
  );
  if (setup.few === 0) {
    await p.waitForTimeout(40);
    await ask(p, `(panel) => panel.solution.pick(${JSON.stringify(setup.second)})`);
    await p.waitForTimeout(600);
  }
  const after = await ask(p, '(panel) => panel.mechanismSrv.joints.length');
  check(
    'changing the choice mid-press cancels it rather than building the new one',
    setup.few === 0 && setup.joints === 0 && after === 0,
    { setup, after }
  );
  await p.close();
}

{
  // And the letters go onto the grid with the pins. Naming the preview
  // honestly is only half of it: what gets built has to agree with what was
  // shown, or the fix has moved the mismatch rather than removed it.
  const p = await solvedPage();
  const outcome = await ask(
    p,
    `(panel, grid) => {
      panel.solution.setDriveOnFarPin(true);
      const shown = grid.synthCanvas
        .previewGrounds()
        .map((j) => [j.id, Math.round(j.x), Math.round(j.y), !!j.input]);
      panel.solution.insert();
      const built = panel.mechanismSrv.joints.map((j) => [
        j.id.toUpperCase(),
        Math.round(j.x),
        Math.round(j.y),
      ]);
      const at = (x, y) =>
        built.find((b) => Math.abs(b[1] - x) < 2 && Math.abs(b[2] - y) < 2)?.[0] ?? null;
      return {
        // An empty list satisfies every(), and satisfying it is what this
        // check was reporting as agreement.
        agrees: shown.length >= 2 && shown.every(([id, x, y]) => at(x, y) === id),
        shown,
        built,
        links: panel.mechanismSrv.links.map((l) => l.id),
      };
    }`
  );
  check('the letters the preview showed are the letters that get built', outcome.agrees, outcome);
  check(
    'and every link is still named by its ends in order',
    outcome.links.length > 0 &&
      outcome.links.every((id) => [...id].join('') === [...id].sort().join('')),
    outcome.links
  );
  await p.close();
}

{
  // And beside work that is already there, where A-D are taken and the pins
  // have to be drawn under whatever letters are actually free. Labelling the
  // preview A-D regardless meant it promised D/C/B/A over pins that arrived
  // as E/D/C/B -- every one of the four renamed between being shown and being
  // built.
  const p = await solvedPage();
  const outcome = await ask(
    p,
    `(panel, grid) => {
      grid.mechanismSrv.mergeToJoints([grid.mechanismSrv.createRevJoint('0', '0')]);
      grid.mechanismSrv.updateMechanism();
      panel.solution.setDriveOnFarPin(true);
      const shown = grid.synthCanvas
        .previewJoints()
        .map((j) => [j.id, Math.round(j.x), Math.round(j.y)]);
      panel.solution.insert();
      const built = panel.mechanismSrv.joints.map((j) => [j.id, Math.round(j.x), Math.round(j.y)]);
      const at = (x, y) =>
        built.find((b) => Math.abs(b[1] - x) < 2 && Math.abs(b[2] - y) < 2)?.[0] ?? null;
      return {
        shown,
        built,
        agrees: shown.length >= 4 && shown.every(([id, x, y]) => at(x, y) === id),
        usedLaterLetters: shown.some(([id]) => id > 'D'),
      };
    }`
  );
  check(
    'and they still agree when the letters have to start after existing work',
    outcome.agrees && outcome.usedLaterLetters,
    outcome
  );
  await p.close();
}

{
  // Loose joints are geometry too. Fitting the scale to the zoom resizes
  // whatever is already drawn, so "empty" has to mean empty.
  const p = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', (error) => errors.push(String(error)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(p);
  await p.locator('.tabButton', { hasText: 'Synthesis' }).click();
  await p.waitForTimeout(700);
  await p.locator('#synthesisPanel .kindCard--on').click();
  await p.waitForTimeout(200);
  const before = await ask(
    p,
    `(panel, grid) => {
      grid.mechanismSrv.mergeToJoints([grid.mechanismSrv.createRevJoint('0', '0')]);
      grid.mechanismSrv.updateMechanism();
      grid.settings.objectScale = 140;
      return { scale: grid.settings.objectScale, joints: grid.mechanismSrv.joints.length };
    }`
  );
  await p.waitForTimeout(200);
  await p.locator('#synthesisPanel .poseRow__n').first().click();
  await p.waitForTimeout(300);
  const after = await ask(p, '(panel, grid) => grid.settings.objectScale');
  check(
    'arming leaves the scale alone when the drawing holds a loose joint',
    before.joints === 1 && after === 140,
    { before, after }
  );
  await p.close();
}

{
  // Fitting a driver changes what would be built, so the drawing no longer
  // holds what is being looked at -- and the preview has to come back to show
  // the difference.
  const p = await solvedPage();
  const outcome = await ask(
    p,
    `(panel, grid) => {
      panel.solution.driverWanted = false;
      panel.solution.insert();
      const asFourBar = {
        joints: panel.mechanismSrv.joints.length,
        stale: panel.solution.needsReinsert(),
        preview: grid.synthCanvas.previewLinks().length,
      };
      panel.solution.toggleDriver();
      const withDriver = {
        dyad: !!panel.solution.dyad(),
        stale: panel.solution.needsReinsert(),
        preview: grid.synthCanvas.previewLinks().length,
        label: panel.primaryLabel,
      };
      return { asFourBar, withDriver };
    }`
  );
  check(
    'adding a driver to an inserted four-bar is a change the panel notices',
    outcome.asFourBar.joints === 4 &&
      outcome.asFourBar.stale === false &&
      outcome.asFourBar.preview === 0 &&
      outcome.withDriver.dyad === true &&
      outcome.withDriver.stale === true &&
      outcome.withDriver.preview > 0 &&
      outcome.withDriver.label === 'Replace on grid',
    outcome
  );
  await p.close();
}

{
  // Inserting saves once. Leaving for Edit used to save again, identically,
  // so the first Undo stepped onto the state it was already in.
  const p = await solvedPage();
  await ask(p, '(panel) => panel.solution.insert()');
  await p.waitForTimeout(500);
  const afterInsert = await askGrid(p, '(g) => g.mechanismSrv.joints.length');
  await p.locator('.tabButton', { hasText: 'Edit' }).click();
  await p.waitForTimeout(600);
  await p.evaluate(() => ng.getComponent(document.querySelector('app-top-bar')).undo());
  await p.waitForTimeout(900);
  // Asked of the grid: the panel is gone, which is the whole point of the check.
  const afterUndo = await askGrid(p, '(g) => g.mechanismSrv.joints.length');
  check(
    'one Undo takes the linkage back even after leaving Synthesis',
    afterInsert > 0 && afterUndo === 0,
    { afterInsert, afterUndo }
  );
  await p.close();
}

{
  // A design that put four joints on the grid and has since lost one has been
  // cut into, and a reload must not forget that: the joints that survived are
  // the reader's now, and replacing them without asking loses their work.
  const p = await solvedPage();
  const before = await ask(
    p,
    `(panel) => {
      panel.solution.insert();
      const ids = panel.design.ownedJointIds.slice();
      // Through the app's own delete, which works on the selection.
      const victim = panel.mechanismSrv.joints.find((j) => j.id === ids[1]);
      panel.mechanismSrv.activeObjService.updateSelectedObj(victim);
      panel.mechanismSrv.deleteJoint(true);
      return { ids, ownership: panel.solution.ownership() };
    }`
  );
  const link = await p.evaluate(() =>
    ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
  );
  const reloaded = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  reloaded.on('pageerror', (error) => errors.push(String(error)));
  await reloaded.goto(BASE + '/?' + link, { waitUntil: 'domcontentloaded' });
  await waitForReady(reloaded);
  await reloaded.locator('.tabButton', { hasText: 'Synthesis' }).click();
  await reloaded.waitForTimeout(700);
  const after = await ask(reloaded, '(panel) => panel.solution.ownership()');
  check(
    'a linkage cut into before the link was written is still cut into after it is opened',
    before.ownership === 'entangled' && after === 'entangled',
    { before, after }
  );
  await reloaded.close();
  await p.close();
}

{
  // Replacing, which is where the letters went wrong last time. Insert takes
  // the old linkage away before it builds, so the ids it was holding come back
  // -- and counting them as taken made the preview promise E-J over pins that
  // arrived as A-F. Also checked straight after an insert, where the same
  // arithmetic used to rename the labels off the linkage they describe.
  const p = await solvedPage();
  const outcome = await ask(
    p,
    `(panel, grid) => {
      panel.solution.driverWanted = false;
      panel.solution.insert();
      const afterFirst = grid.synthCanvas.previewJoints().map((j) => j.id);
      const onGrid = panel.design.ownedJointIds.slice();
      const labelledAfterInsert = panel.dimensionRows().map((r) => r.label);
      // Now ask for a driver, which makes this a replacement.
      panel.solution.toggleDriver();
      const promised = grid.synthCanvas.previewJoints().map((j) => j.id);
      panel.solution.insert();
      const built = panel.design.ownedJointIds.slice();
      return { onGrid, afterFirst, labelledAfterInsert, promised, built };
    }`
  );
  check(
    'a replacement is built under the letters it was shown under',
    outcome.promised.length === 6 &&
      outcome.built.length === 6 &&
      outcome.promised.join(',') === outcome.built.join(','),
    outcome
  );
  check(
    'and the labels do not rename themselves the moment a linkage is inserted',
    outcome.onGrid.length === 4 &&
      outcome.labelledAfterInsert.some((l) => l.includes(outcome.onGrid[0])) &&
      outcome.labelledAfterInsert.some((l) => l.includes(outcome.onGrid[3])),
    { onGrid: outcome.onGrid, labels: outcome.labelledAfterInsert }
  );
  await p.close();
}

{
  // Ids come round again. Delete one of ours and draw a joint, and the new
  // joint takes the letter we just lost -- so the count comes back up, every
  // id is present, and the linkage would read as wholly ours with somebody
  // else's joint standing in it. A later replace would take that joint away
  // without asking, so being cut into has to stick.
  const p = await solvedPage();
  const outcome = await ask(
    p,
    `(panel, grid) => {
      panel.solution.driverWanted = false;
      panel.solution.insert();
      const ids = panel.design.ownedJointIds.slice();
      const victim = panel.mechanismSrv.joints.find((j) => j.id === ids[3]);
      panel.mechanismSrv.activeObjService.updateSelectedObj(victim);
      panel.mechanismSrv.deleteJoint(true);
      const cutInto = panel.solution.ownership();
      // A joint of the reader's own, which takes the freed letter back.
      const replacement = grid.mechanismSrv.createRevJoint('3', '3');
      grid.mechanismSrv.mergeToJoints([replacement]);
      grid.mechanismSrv.updateMechanism(true);
      const afterwards = panel.solution.ownership();
      const was = { id: replacement.id, x: replacement.x, y: replacement.y };
      // And then actually replace, which is the moment the reader's joint
      // would be taken away. Reporting "still entangled" and stopping there
      // left the deletion itself untested.
      panel.solution.insert(true);
      // By where it is, not by what it is called. Removing it frees its letter
      // and the very next insert hands that letter straight back out, so a
      // joint called D exists either way -- somewhere else, belonging to
      // somebody else. Asking only for the name reported the deletion as a
      // survival.
      const survivor = panel.mechanismSrv.joints.find(
        (j) => Math.hypot(j.x - was.x, j.y - was.y) < 1
      );
      return {
        ids,
        cutInto,
        reusedTheLetter: replacement.id === ids[3],
        afterwards,
        was,
        survivedTheReplace: !!survivor,
        survivorId: survivor ? survivor.id : null,
      };
    }`
  );
  check(
    'a joint that takes back a deleted id does not become ours to delete',
    outcome.cutInto === 'entangled' &&
      outcome.reusedTheLetter &&
      outcome.afterwards === 'entangled' &&
      outcome.survivedTheReplace,
    outcome
  );
  await p.close();
}

{
  /*
    A design that really does refuse a driver, so the greyed switch is tested
    against both answers.

    The sweep earlier in this file only ever meets designs that accept one, so
    it can say the switch agrees with the panel without ever seeing the switch
    turned off -- removing the binding would not have failed it. These three
    positions need the input to swing more than half a turn between them, which
    is the refusal `driverDyadFor` exists to give.
  */
  const p = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', (error) => errors.push(String(error)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(p);
  await p.locator('.tabButton', { hasText: 'Synthesis' }).click();
  await p.waitForTimeout(600);
  await p.locator('#synthesisPanel .kindCard--on').click();
  await p.waitForTimeout(400);
  await ask(
    p,
    `(panel) => {
      const S = 200;
      [[0, 0, 0], [1, 2, 5], [2, 4, 60]].forEach(([x, y]) =>
        panel.design.placePose({ x: x * S, y: y * S, applyMatrix() {} })
      );
      [0, 5, 60].forEach((t, i) => (panel.design.getPose(i + 1).thetaDegrees = t));
      panel.design.valueChanges.next(true);
    }`
  );
  await p.waitForTimeout(300);
  await p.locator('#synthesisPanel .cta', { hasText: 'Generate solutions' }).click();
  await p.waitForFunction(
    () => !ng.getComponent(document.querySelector('app-synthesis-panel')).solution.generating,
    null,
    { timeout: 20000 }
  );
  const present = await ask(
    p,
    `(panel) => {
      const wanted = panel.solution.candidates().find((c) => c.key === '0:1:-1');
      if (!wanted) return { missing: panel.solution.candidates().map((c) => c.key) };
      panel.solution.pick(wanted.key);
      return {};
    }`
  );
  // Read after Angular has drawn it: asking in the same turn as the change
  // reports the switch as it was before, which is how this first "found" a
  // binding that was never broken.
  const read = () =>
    ask(
      p,
      `(panel) => {
        const row = [...document.querySelectorAll('#synthesisPanel .row')].find((r) =>
          r.textContent.includes('Add driver')
        );
        const button = row && row.querySelector('.switch');
        return { refused: !!panel.driverRefusal, disabled: !!(button && button.disabled) };
      }`
    );
  await ask(p, '(panel) => panel.solution.setDriveOnFarPin(true)');
  await p.waitForTimeout(400);
  const far = await read();
  await ask(p, '(panel) => panel.solution.setDriveOnFarPin(false)');
  await p.waitForTimeout(400);
  const near = await read();
  const outcome = { ...present, far, near };
  check(
    'the switch is actually greyed on a design whose driver is refused',
    !outcome.missing &&
      outcome.far.refused &&
      outcome.far.disabled &&
      !outcome.near.refused &&
      !outcome.near.disabled,
    outcome
  );
  await p.close();
}

{
  /*
    A joint moved by hand stays moved, across a shared link.

    The record of where insert put each joint was held in memory, so opening a
    link produced a design that believed nothing had been touched -- and
    Replace put the moved joint back where synthesis had wanted it, silently,
    because "untouched" is the one state that needs no warning. Nothing in the
    session that made the link is available to check this: it has to survive
    the URL.
  */
  const p = await solvedPage();
  const moved = await ask(
    p,
    `(panel) => {
      panel.solution.driverWanted = false;
      panel.solution.insert();
      const ids = panel.design.ownedJointIds.slice();
      const joint = panel.mechanismSrv.joints.find((j) => j.id === ids[1]);
      joint.x += 900;
      joint.y -= 700;
      panel.mechanismSrv.updateMechanism(true);
      return { ids, at: [Math.round(joint.x), Math.round(joint.y)], says: panel.solution.ownership() };
    }`
  );
  const link = await p.evaluate(() =>
    ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
  );
  const opened = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  opened.on('pageerror', (error) => errors.push(String(error)));
  await opened.goto(BASE + '/?' + link, { waitUntil: 'domcontentloaded' });
  await waitForReady(opened);
  await opened.locator('.tabButton', { hasText: 'Synthesis' }).click();
  await opened.waitForTimeout(700);
  // A reopened link has the design but not the search, and Insert with nothing
  // chosen refuses for that reason rather than the one being tested.
  await opened.locator('#synthesisPanel .cta', { hasText: 'Generate solutions' }).click();
  await opened.waitForFunction(
    () => !ng.getComponent(document.querySelector('app-synthesis-panel')).solution.generating,
    null,
    { timeout: 20000 }
  );
  const after = await ask(
    opened,
    `(panel) => {
      const ids = panel.design.ownedJointIds.slice();
      const joint = panel.mechanismSrv.joints.find((j) => j.id === ids[1]);
      return {
        says: panel.solution.ownership(),
        at: joint ? [Math.round(joint.x), Math.round(joint.y)] : null,
        // 'edited' is the answer that makes Insert ask first rather than act.
        wouldAsk: panel.solution.insert() === 'edited',
        stillThere: (() => {
          const now = panel.mechanismSrv.joints.find((j) => j.id === ids[1]);
          return now ? [Math.round(now.x), Math.round(now.y)] : null;
        })(),
      };
    }`
  );
  check(
    'a joint moved by hand is still known to have been moved after a reload',
    moved.says === 'edited' &&
      after.says === 'edited' &&
      after.wouldAsk &&
      JSON.stringify(after.at) === JSON.stringify(moved.at) &&
      JSON.stringify(after.stillThere) === JSON.stringify(moved.at),
    { moved, after }
  );
  await opened.close();
  await p.close();
}

{
  /*
    The other half of the same fact, and the half that tells the two apart.

    Without a baseline the safest answer to "has this been moved" is "ask" --
    which is what an unmoved linkage would also get, so a design that has
    forgotten everything looks exactly like one that remembers a move. This is
    the case that separates them: nothing was touched, so nothing should be
    asked.
  */
  const p = await solvedPage();
  await ask(p, '(panel) => { panel.solution.driverWanted = false; panel.solution.insert(); }');
  await p.waitForTimeout(400);
  const link = await p.evaluate(() =>
    ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
  );
  await p.close();
  const opened = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  opened.on('pageerror', (error) => errors.push(String(error)));
  await opened.goto(BASE + '/?' + link, { waitUntil: 'domcontentloaded' });
  await waitForReady(opened);
  await opened.locator('.tabButton', { hasText: 'Synthesis' }).click();
  await opened.waitForTimeout(700);
  await opened.locator('#synthesisPanel .cta', { hasText: 'Generate solutions' }).click();
  await opened.waitForFunction(
    () => !ng.getComponent(document.querySelector('app-synthesis-panel')).solution.generating,
    null,
    { timeout: 20000 }
  );
  const untouched = await ask(
    opened,
    `(panel) => ({
      says: panel.solution.ownership(),
      replacedWithoutAsking: panel.solution.insert() === 'done',
    })`
  );
  check(
    'a linkage nobody touched is still known to be untouched after a reload',
    untouched.says === 'ours' && untouched.replacedWithoutAsking,
    untouched
  );
  await opened.close();
}

{
  // Insert one, replace it with another, undo. What comes back is the first
  // linkage exactly as it was written, so it is ours and not an edit -- which
  // it could not be while the baseline described whatever had been inserted
  // most recently rather than what is actually on the grid.
  const p = await solvedPage();
  const outcome = await ask(
    p,
    `(panel) => {
      panel.solution.driverWanted = false;
      panel.solution.insert();
      const first = panel.design.ownedJointIds.slice();
      panel.solution.toggleDriver();
      panel.solution.insert();
      return { first, second: panel.design.ownedJointIds.slice() };
    }`
  );
  await p.evaluate(() => ng.getComponent(document.querySelector('app-top-bar')).undo());
  await p.waitForTimeout(900);
  const restored = await ask(p, '(panel) => panel.solution.ownership()');
  check(
    'undoing a replacement gives back a linkage that is ours, not one that looks edited',
    outcome.first.length === 4 && outcome.second.length === 6 && restored === 'ours',
    { ...outcome, restored }
  );
  await p.close();
}

{
  /*
    The switch offered instead of a second card has to do the second card's job.

    Collapsing Open and Crossed into one solution is only right if the control
    that replaced the extra card actually reaches the other assembly -- and the
    check that they are not two cards says nothing about that. Run on a
    construction that really has both: on one where the second assembly cannot
    be built, the switch is correctly stuck, which would prove nothing either
    way.
  */
  const p = await solvedPage();
  const picked = await ask(
    p,
    `(panel) => {
      // With defects allowed, which is a setting the panel offers. Held to the
      // strict list, this design's constructions each have one assembly that
      // can be built, so the switch is correctly stuck and proves nothing.
      panel.design.allowDefect = true;
      panel.solution.changed.next();
      const both = panel.solution
        .candidates()
        .find((c) => panel.solution.allAssemblies().filter((a) => a.pair === c.pair).length === 2);
      if (!both) return null;
      panel.solution.pick(both.key);
      return both.key;
    }`
  );
  await p.waitForTimeout(400);
  const row = p
    .locator('#synthesisPanel .row', { hasText: 'Assembly branch' })
    .locator('.seg__opt');
  const labels = () =>
    ask(p, '(panel) => JSON.stringify(panel.branchOptions().map((o) => [o.label, o.active]))');
  const before = picked ? await labels() : null;
  let moved = null;
  let restored = null;
  if (picked && (await row.count()) === 2) {
    const off = (await row.nth(0).getAttribute('class')).includes('--on') ? 1 : 0;
    await row.nth(off).click();
    await p.waitForTimeout(400);
    moved = await labels();
    await row.nth(off === 1 ? 0 : 1).click();
    await p.waitForTimeout(400);
    restored = await labels();
  }
  check(
    'the Open/Crossed switch reaches the assembly it replaced a card for',
    !!picked && (await row.count()) === 2 && moved !== before && restored === before,
    { picked, before, moved, restored }
  );
  await p.close();
}

check('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
