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
const skip = page.locator('.introjs-skipbutton').first();
if (await skip.isVisible().catch(() => false)) await skip.click({ force: true });
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
  await page.evaluate(() =>
    [...document.querySelectorAll('#synthesisPreview path.synthBar')].every(
      (bar) => bar.classList.contains('synthBar--proposed') && bar.getAttribute('stroke-dasharray')
    )
  )
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
      // that breaks the "one full turn" promise the panel makes.
      if (!refused && fitted && !range.full) bad.push(candidate.key);
    }
    return bad.length === 0;
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
    if (!bar) return true;
    // Remember where it was: this drag deliberately ends over the panel, and a
    // position parked under the panel is one nothing later can right-click.
    const before = await panel(
      '(p) => JSON.stringify(p.design.getAllPoses().map((q) => [q.position.x, q.position.y, q.thetaDegrees]))'
    );
    await page.mouse.move(bar.x, bar.y);
    await page.mouse.down();
    await page.mouse.move(200, 500, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const ended = await grid('(g) => !g.synthCanvas.dragging && !g.synthSolution.interactive');
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
  'a driver that cannot be fitted is greyed rather than merely explained',
  await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    const row = [...document.querySelectorAll('#synthesisPanel .row')].find((r) =>
      r.textContent.includes('Add driver')
    );
    const button = row.querySelector('.switch');
    // Whichever way this design falls, the switch's state must match the fact.
    return button.disabled === !!panel.driverRefusal;
  })
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
  (await page.locator('#contextMenu #menu-item').allInnerTexts()).some((t) =>
    t.includes('Delete Synthesis Positions')
  ),
  await page.locator('#contextMenu #menu-item').allInnerTexts()
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
  (await page.locator('#contextMenu #menu-item').allInnerTexts()).some((t) =>
    /Delete Position \d/.test(t)
  ),
  await page.locator('#contextMenu #menu-item').allInnerTexts()
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
  await page.evaluate(() => {
    const gallery = document.querySelector('#synthesisPanel .gallery');
    return !gallery || getComputedStyle(gallery).gridTemplateColumns.split(' ').length !== 2;
  })
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

check('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
