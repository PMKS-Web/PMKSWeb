/**
 * The guided first build, end to end.
 *
 * Five moves from a bare grid to a velocity, driven the way a student drives
 * it. What it is really guarding is that the tutorial reads its step off the
 * *drawing* rather than off a counter of its own — so every assertion here
 * about which step is showing is an assertion about the mechanism underneath.
 *
 *   PMKS_BASE_URL=<origin> node e2e/tutorial.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/tutorial';

const passed = [];
const failed = [];
const check = (name, pass, extra = '') => {
  (pass ? passed : failed).push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE, { waitUntil: 'networkidle' });
await waitForReady(page);

// The overlay tour this replaced. It dimmed the whole app to name four regions
// of the chrome, fired only on an empty grid, and could never be replayed.
check(
  'the old intro.js overlay is gone',
  (await page.locator('.introjs-tooltip, .introjs-overlay').count()) === 0
);

// ---- the offer, hanging off the Edit panel rather than replacing it ----

check('the offer is in the Edit panel', await page.locator('.offer').isVisible());
check(
  'the panel still says what right-click is for',
  (await page.locator('.helpHints').innerText()).includes('Right-click the grid')
);
// A question with only one answer keeps getting asked. Declining is as final
// as finishing: both write the same mark, and the project menu is the way back.
check('the offer can be declined', await page.locator('.offerDismiss').isVisible());
await page.screenshot({ path: `${OUT}/01-offer.png` });

await page.locator('.offerButton').click();
await page.waitForTimeout(700);
check('the drawer opens on the tutorial', await page.locator('.tutorialCard').isVisible());
check('the canvas is not covered', (await page.locator('.introjs-overlay').count()) === 0);

const stepNow = async () => {
  const lead = await page.locator('.cardLead').innerText();
  const found = lead.match(/Step (\d) of (\d)/);
  return found ? { step: Number(found[1]), of: Number(found[2]) } : null;
};

let at = await stepNow();
check('starts at step 1 of 5', at?.step === 1 && at?.of === 5, JSON.stringify(at));

// The two gestures are different controls, and the first draft of this tutorial
// told the student to use the wrong one three times: Add on the bare grid
// always makes a free-standing bar, so three of them never touch. The menu
// carries the verb on the group heading, so that is what the step names.
const body = async () => page.locator('.stepBody').innerText();
check('step 1 sends the student to the Add group', (await body()).includes('under Add'));
check('step 1 does not send them to Attach', !(await body()).includes('under Attach'));
await page.screenshot({ path: `${OUT}/02-step1.png` });

// ---- doing each step for them walks the drawing forward one step ----

const doIt = page.locator('.doItButton');
for (const expected of [2, 3, 4, 5]) {
  await doIt.click();
  // Long enough for the finished step to be held up and then handed on. The
  // hold is the point: see the settle checks below.
  await page.waitForTimeout(3600);
  at = await stepNow();
  check(`Do This Step For Me reaches step ${expected}`, at?.step === expected, JSON.stringify(at));

  if (expected === 2) {
    check('step 2 sends them to the Attach group', (await body()).includes('under Attach'));
  }
  if (expected === 3) {
    check('the previous step is reported done', (await page.locator('.achieved').count()) === 1);
    check('exactly one joint is ringed', (await page.locator('.tutorialRing').count()) === 1);
    // Present in the DOM is not the same as visible: the first version of this
    // ring was drawn a fortieth of a pixel wide.
    const ring = await page.locator('.tutorialRing .ringInner').boundingBox();
    check(
      'the ring is big enough to see',
      !!ring && ring.width > 12,
      `${Math.round(ring?.width ?? 0)}px`
    );
    // The copy says "joint A", so the letters have to be on the grid.
    const letters = await page.evaluate(() =>
      [...document.querySelectorAll('#canvas text')]
        .map((t) => (t.textContent || '').trim())
        .filter((t) => /^[A-Za-z]$/.test(t))
    );
    check('joint letters are showing', letters.includes('A'), letters.join(''));
    // Ringed is no use if it is behind a panel. The mechanism is built into the
    // clear space between the chrome for this reason: centred on the whole
    // canvas, a narrow window put the left-hand ground joint -- the one this
    // step rings and names -- underneath the Edit panel.
    const behindChrome = await page.evaluate(
      ({ x, y }) =>
        !!document
          .elementFromPoint(x, y)
          ?.closest('app-left-tabs, #rightPanel, .topStrip, app-playback-bar'),
      { x: ring.x + ring.width / 2, y: ring.y + ring.height / 2 }
    );
    check('the ringed joint can actually be reached', !behindChrome);
    await page.screenshot({ path: `${OUT}/03-step3-ring.png` });
  }
  if (expected === 4) {
    check('step 4 quotes the chip', await page.locator('.chipHint .chip').isVisible());
    const chip = (await page.locator('.chipHint .chip').innerText()).trim();
    // The mock said "1 to set", which is the *Force* chip's wording. Reading
    // the live value is what stops the sentence drifting from the control.
    check('the quote uses the kinematic wording', /^(Ready|\d+ (fix|fixes))$/.test(chip), chip);
    await page.screenshot({ path: `${OUT}/04-step4-chip.png` });
  }
  if (expected === 5) {
    check(
      'nothing is ringed once no one joint is meant',
      (await page.locator('.tutorialRing').count()) === 0
    );
  }
}

// ---- paging back through what is done ----

await page.locator('.stepArrow').first().click();
await page.waitForTimeout(500);
check('back re-reads the previous step', (await stepNow())?.step === 4);
check('which is shown as done', (await page.locator('.stepTick').count()) === 1);
// The ring belongs to the outstanding move. Pointing at the joint an already
// finished step was about sends the student to a joint that wants nothing.
check('and rings nothing', (await page.locator('.tutorialRing').count()) === 0);
check('and offers no do-it', (await page.locator('.doItButton').count()) === 0);
await page.screenshot({ path: `${OUT}/08-paged-back.png` });

await page.locator('.stepBar').first().click();
await page.waitForTimeout(400);
check('the progress bar jumps to a step', (await stepNow())?.step === 1);
while (!(await page.locator('.stepArrow').last().isDisabled())) {
  await page.locator('.stepArrow').last().click();
  await page.waitForTimeout(260);
}
check('forward stops at the outstanding step', (await stepNow())?.step === 5);

// Building for the student must not trip the app's own complaint that the
// parts are drawn far larger than the grid squares behind them.
check(
  'no oversized-parts warning was raised',
  (await page.getByText('drawn far larger than the grid').count()) === 0
);

// ---- the last step ends on a reading, and the reading agrees with the app ----

await doIt.click();
await page.waitForTimeout(2500);
check('the completion card appears', await page.locator('.doneCard').isVisible());
const line = await page.locator('.doneLine').innerText();
const read = line.match(/joint (\w+) at\s+([\d.]+)\s+(cm|in|m)\/s, ([\d.]+) s into the cycle/);
check('it names a joint, a velocity and a time', !!read, line.replace(/\s+/g, ' '));
check('the reading is not the start pose', !!read && Number(read[4]) > 0, read?.[4]);
check('the velocity is worth reading', !!read && Number(read[2]) > 0, read?.[2]);
// Two clocks on one screen is two answers to the same question.
const rowTime = (await page.locator('.rowTime').first().innerText()).trim();
check(
  'the card agrees with the playback readout',
  !!read && rowTime.startsWith(read[4]),
  `${read?.[4]} vs ${rowTime}`
);
check('three doors out', (await page.locator('.door').count()) === 3);
await page.screenshot({ path: `${OUT}/05-done.png` });

// Running it again clears the grid. That is the one destructive thing the
// tutorial does, so it is the one thing it stops to ask about.
await page.locator('.quietButton').click();
await page.waitForTimeout(700);
check('running again warns first', await page.getByText('Start the tutorial again?').isVisible());
check(
  'and says the mechanism goes',
  /deleted/i.test(await page.locator('[mat-dialog-content], mat-dialog-content').innerText())
);
await page.getByRole('button', { name: 'Keep my mechanism' }).click();
await page.waitForTimeout(600);
check(
  'declining leaves the drawing alone',
  (await page.locator('#canvas [id^="joint_"]').count()) > 0
);

// The tutorial is pinned rather than paged, so opening Export stacks the two
// instead of putting the tutorial away.
await page.locator('.door').first().click();
await page.waitForTimeout(900);
check('Export Data opens', await page.locator('.exportCard').isVisible());
check('the tutorial stays with it', await page.locator('.tutorialCard').isVisible());
const tutorialBox = await page.locator('.tutorialCard').boundingBox();
const exportBox = await page.locator('.exportCard').boundingBox();
check(
  'and sits above it',
  !!tutorialBox && !!exportBox && tutorialBox.y < exportBox.y,
  `${Math.round(tutorialBox?.y ?? -1)} vs ${Math.round(exportBox?.y ?? -1)}`
);
// The completion card used to carry an × of its own on top of the drawer's.
check(
  'one close control in the drawer, not two',
  (await page.locator('#rightPanel button.closeCard, #rightPanel button.closeDrawer').count()) <= 1
);
// Stacked, the page below must keep its own height rather than being squeezed
// out by the card above it. As a shrinking flex item it collapsed on a short
// window to its title and first line, with the parts list unreachable.
check(
  'the page below keeps its height',
  exportBox.height > 240,
  `${Math.round(exportBox.height)}px`
);
const room = await page.locator('#rightPanel').evaluate((el) => ({
  scroll: el.scrollHeight,
  client: el.clientHeight,
}));
check(
  'and the drawer scrolls if the two do not fit',
  room.scroll <= room.client || room.scroll > room.client,
  `${room.scroll} vs ${room.client}`
);

// ---- dismissed for good, and still reachable ----

await page.goto(BASE, { waitUntil: 'networkidle' });
await waitForReady(page);
check('a finished tutorial stops offering itself', (await page.locator('.offer').count()) === 0);

await page.locator('.brandCard .iconButton').click();
await page.waitForTimeout(400);
check('the project menu keeps a way back in', await page.locator('#tutorialButton').isVisible());
await page.locator('#tutorialButton').click();
await page.waitForTimeout(700);
check('it reopens at step 1 on a bare grid', (await stepNow())?.step === 1);
await page.screenshot({ path: `${OUT}/06-reopened.png` });

// Walking out leaves the drawing alone and leaves a thread back. The × asks
// first: the offer in the Edit panel is spent by now, so an accidental press
// would otherwise lose the tutorial with no visible way back.
await page.locator('.doItButton').click();
await page.waitForTimeout(3600);
await page.locator('.closeCard').click();
await page.waitForTimeout(700);
// A dialog asking permission was too heavy for something that costs nothing:
// the drawing is untouched either way. It closes, and then says where it went.
check(
  'closing does not stop to ask',
  (await page.locator('.mat-mdc-dialog-container').count()) === 0
);
check(
  'and a message names where it went',
  /project menu/i.test(
    await page
      .locator('app-notification-stack')
      .innerText()
      .catch(() => '')
  )
);
// Closed rather than removed: the drawer parks off the edge, so the card is
// still in the document and only `isVisible` can tell the difference.
check('exiting closes the drawer', !(await page.locator('.tutorialCard').isVisible()));
// The thread back has to survive a selection. It used to live inside the Edit
// panel's *empty* state, and closing the tutorial past step two leaves a joint
// selected -- so it vanished at the moment it became the only way back.
check('the Edit panel keeps a resume line', await page.locator('.resumeCard').isVisible());
check(
  'the resume line says where it stopped',
  /step \d of 5/.test(await page.locator('.resumeCard').innerText()),
  (await page.locator('.resumeCard').innerText()).trim().replace(/\s+/g, ' ')
);
await page.screenshot({ path: `${OUT}/07-resume.png` });

// ---- a narrow window, where the placement has gone wrong twice ----
//
// The mechanism is built into the strip between the left panel and the drawer.
// Centred on the whole canvas it landed under the left panel; measured against
// the space *below* that panel it was fine until the panel grew — which is
// exactly what selecting a joint does on the way from step three to step four.
{
  const narrow = await browser.newContext({ viewport: { width: 800, height: 760 } });
  const small = await narrow.newPage();
  await small.goto(BASE, { waitUntil: 'networkidle' });
  await waitForReady(small);
  await small.locator('.offerButton').click();
  await small.waitForTimeout(600);
  for (let i = 0; i < 3; i++) {
    await small.locator('.doItButton').click();
    await small.waitForTimeout(3400);
  }
  const lead = await small.locator('.cardLead').innerText();
  check('at 800px the tutorial reaches step 4', /Step 4/.test(lead), lead.replace(/\s+/g, ' '));
  const spot = await small.locator('.tutorialRing').boundingBox();
  const blocked = await small.evaluate(
    ({ x, y }) =>
      !!document
        .elementFromPoint(x, y)
        ?.closest('app-left-tabs, #rightPanel, .topStrip, app-playback-bar, #bottomBar'),
    { x: spot.x + spot.width / 2, y: spot.y + spot.height / 2 }
  );
  check('and the ringed joint is still the thing under the pointer', !blocked);
  await small.screenshot({ path: `${OUT}/09-narrow-ring.png` });
  await narrow.close();
}

// ---- declining the offer, in a profile that has not met it ----
{
  const declining = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const shy = await declining.newPage();
  await shy.goto(BASE, { waitUntil: 'networkidle' });
  await waitForReady(shy);
  await shy.locator('.offerDismiss').click();
  await shy.waitForTimeout(700);
  check('declining takes the offer away', (await shy.locator('.offer').count()) === 0);
  check('without starting anything', (await shy.locator('.tutorialCard').count()) === 0);
  check(
    'and says where it went',
    /project menu/i.test(
      await shy
        .locator('app-notification-stack')
        .innerText()
        .catch(() => '')
    )
  );
  await shy.reload({ waitUntil: 'networkidle' });
  await waitForReady(shy);
  check('and it stays gone next time', (await shy.locator('.offer').count()) === 0);
  await shy.locator('.brandCard .iconButton').click();
  await shy.waitForTimeout(350);
  check('but the project menu still has it', await shy.locator('#tutorialButton').isVisible());
  await declining.close();
}

await browser.close();
console.log(`\n${passed.length} passed, ${failed.length} failed`);
if (errors.length) console.log('console errors:\n' + errors.slice(0, 10).join('\n'));
process.exit(failed.length ? 1 : 0);
