/**
 * Mode navigation, after the rail that used to carry it was deleted.
 *
 * The four modes, Undo/Redo and the file menu were spread across a horizontal
 * toolbar and a vertical rail; they are now one strip along the top, with the
 * transport and the view controls floating over the canvas instead of living
 * inside the rail. This checks the navigation that replaced it: pressing a mode
 * changes the mode, the left panel follows it, the sliding highlight lands on
 * the mode you actually chose, each analysis mode carries a chip saying whether
 * it can be entered, the transport belongs to the analysis modes alone, and
 * leaving an analysis mode still rewinds the mechanism — as does the stop
 * button beside play, for a reader who wants the drawn pose without leaving.
 * The removed chrome is asserted absent, because a selector that matches
 * nothing passes every test written against it.
 *
 *   PMKS_BASE_URL=<origin> node e2e/left-nav-modes.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForReady } from './app-ready.mjs';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_BASE_URL || process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'left-nav';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const fourBar =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const issues = [];
const results = [];
const record = (what, ok, detail) => {
  results.push({ what, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
  if (!ok) issues.push({ name: what, severity: 'high', detail });
};

const context = await chromium.launchPersistentContext(`/tmp/pmks-left-nav-${Date.now()}`, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 900 },
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(10000);
page.on('pageerror', (error) =>
  issues.push({ name: 'Uncaught page error', severity: 'high', error: error.message })
);
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/favicon|google-analytics/i.test(msg.text())) {
    issues.push({ name: `Console error: ${msg.text().slice(0, 160)}`, severity: 'medium' });
  }
});

const shot = (name) =>
  page.screenshot({ path: path.join(screenshotDir, `${runPrefix}-${name}`), fullPage: false });

const tab = (label) => page.locator('.tabButton', { hasText: label });
const timeValue = () => page.locator('#playbackTime').innerText();
/** The value carries its own unit, so read the leading number off "0.20 s". */
const timeSeconds = async () => parseFloat(await timeValue());
const currentTab = () =>
  page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).tabService.getCurrentTab()
  );

/** Which mode the sliding highlight is actually sitting on. */
const highlighted = () =>
  page.evaluate(() => {
    const pill = document.querySelector('.activeTabPill');
    const active = document.querySelector('.tabButton.active');
    if (!pill || !active) return null;
    const style = getComputedStyle(pill);
    return {
      label: active.querySelector('.tabLabel')?.innerText ?? '',
      dLeft: Math.round(new DOMMatrix(style.transform).m41 - active.offsetLeft),
      dWidth: Math.round(parseFloat(style.width) - active.offsetWidth),
    };
  });

try {
  await page.goto(`${baseUrl}?${fourBar}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);
  // Nothing to dismiss any more. The intro.js overlay this used to skip past
  // is gone, replaced by the tutorial drawer, which never covers the canvas and
  // only opens when it is asked for -- see e2e/tutorial.mjs. The unguarded
  // click that used to be here now waits out its full timeout on an element
  // that will never exist.
  await page.waitForTimeout(400);

  // --- the rail and the file toolbar are gone, not merely restyled -----------
  const removed = await page.evaluate(() => ({
    toolbar: document.querySelectorAll('app-toolbar, nav.navBar').length,
    rail: document.querySelectorAll('.tabList, .leftButton, .tabGroup').length,
  }));
  record('the file toolbar is gone', removed.toolbar === 0, removed);
  record('the mode rail is gone', removed.rail === 0, removed);
  record('and one strip carries the four modes', (await page.locator('.tabButton').count()) === 4);

  // --- Edit mode -------------------------------------------------------------
  await shot('01-edit.png');
  record('Edit is the mode the app opens in', (await currentTab()) === 1);
  record(
    'the Edit panel is open',
    (await page.locator('app-left-tabs .panel app-edit-panel').count()) === 1
  );
  const editHighlight = await highlighted();
  record(
    'the highlight sits on Edit',
    editHighlight?.label === 'Edit' &&
      Math.abs(editHighlight.dLeft) <= 1 &&
      Math.abs(editHighlight.dWidth) <= 1,
    editHighlight
  );
  record('the transport is absent in Edit', (await page.locator('.playButton').count()) === 0);

  // Undo/Redo left the rail for the strip, where they are reachable from every
  // mode rather than from Edit alone.
  record(
    'Undo and Redo are in the top strip',
    (await page.locator('.historyCard .historyButton').count()) === 2
  );

  // --- Synthesis -------------------------------------------------------------
  await tab('Synthesis').click();
  await page.waitForTimeout(700);
  record('pressing Synthesis switches to it', (await currentTab()) === 0);
  record(
    'and the panel follows the mode',
    (await page.locator('app-left-tabs .panel app-synthesis-panel').count()) === 1 &&
      (await page.locator('app-left-tabs .panel app-edit-panel').count()) === 0
  );
  record('the transport is absent in Synthesis', (await page.locator('.playButton').count()) === 0);

  // --- the chips say whether an analysis can be entered -----------------------
  const kinematicChip = (await tab('Kinematic').locator('.chip').innerText()).trim();
  const forceChip = (await tab('Force').locator('.chip').innerText()).trim();
  record('the Kinematic chip reads Ready for a four-bar that runs', kinematicChip === 'Ready', {
    kinematicChip,
  });
  // Weight counts as a load now: gravity is on by default and the four-bar's
  // links carry mass, so force analysis is ready without a drawn arrow.
  record('the Force chip reads Ready — weight is a load', forceChip === 'Ready', { forceChip });

  // --- Kinematic mode --------------------------------------------------------
  await tab('Kinematic').click();
  await page.waitForTimeout(900);
  await shot('02-kinematic.png');
  record('pressing Kinematic switches to it', (await currentTab()) === 2);
  record(
    'the analysis panel follows',
    (await page.locator('app-left-tabs .panel app-analysis-panel').count()) === 1
  );
  const kinematicHighlight = await highlighted();
  record(
    'the highlight settles exactly on Kinematic, not the mode before it',
    kinematicHighlight?.label.startsWith('Kinematic') &&
      Math.abs(kinematicHighlight.dLeft) <= 1 &&
      Math.abs(kinematicHighlight.dWidth) <= 1,
    kinematicHighlight
  );
  record('the transport appears', (await page.locator('.playButton').count()) === 1);
  // Back, and asked for: leaving the mode rewinds the mechanism, but a reader
  // who wants the drawn pose *without* leaving analysis had no way to it but
  // to scrub until the clock read zero.
  record(
    'with a stop button beside play, for the pose the mechanism was drawn in',
    (await page.locator('.transportCard .stopButton').count()) === 1
  );

  // The scrubber is a plain range input now, laid out across the card.
  const scrubber = await page.evaluate(() => {
    const slider = document.querySelector('#slider');
    if (!slider) return null;
    const box = slider.getBoundingClientRect();
    return { tag: slider.tagName, type: slider.type, width: box.width, height: box.height };
  });
  record(
    'the scrubber is a horizontal range input',
    scrubber?.tag === 'INPUT' && scrubber.type === 'range' && scrubber.width > scrubber.height,
    scrubber
  );

  // The transport floats over the canvas, so nothing may hang off the window.
  const spill = await page.evaluate(() =>
    [...document.querySelectorAll('app-playback-bar .card, .viewControls')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .some(
        (r) =>
          r.left < -0.5 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5
      )
  );
  record('the floating controls stay inside the window', spill === false);

  // --- pressing a mode that cannot be entered -------------------------------
  // Gravity hanging the links' own weight is a load, so the four-bar as it
  // arrives no longer trips the gate. Turn gravity off and the drawing is
  // genuinely unloaded — the refusal has to come back.
  await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    grid.settings.isGravity.next(false);
  });
  await tab('Force').click();
  await page.waitForTimeout(800);
  await shot('03-force-refused.png');
  record(
    'Force refuses to open without a load, and stays out of that mode',
    (await currentTab()) === 2,
    { tab: await currentTab() }
  );
  record(
    'and answers with the setup list instead of nothing',
    (await page.locator('app-analysis-setup').count()) === 1
  );
  await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    grid.settings.isGravity.next(true);
  });

  // --- play, then leave: the mechanism must rewind ---------------------------
  await tab('Kinematic').click();
  await page.waitForTimeout(500);
  await page.locator('.playButton').click();
  await page.waitForTimeout(1600);
  const playing = await timeSeconds();
  record('play advances the animation', playing > 0, { playing });
  await shot('04-playing.png');

  await tab('Edit').click();
  await page.waitForTimeout(1200);
  await tab('Kinematic').click();
  await page.waitForTimeout(1000);
  // Asked of the mechanism and of the readout separately, because they can
  // disagree: the pose is what the other modes edit, the readout is what says
  // where the pose is, and a readout that has drifted off the pose is worse
  // than no readout at all.
  const rewound = await page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return { step: srv.mechanismTimeStep, seconds: srv.currentTimeSeconds() };
  });
  record('switching to Edit rewound the mechanism to time 0', rewound.step === 0, {
    playing,
    rewound,
  });
  const afterSwitch = await timeSeconds();
  record('and the time readout agrees with the mechanism', afterSwitch === 0, {
    playing,
    afterSwitch,
    rewound,
  });
  record(
    'animation is no longer running after the mode switch',
    (await page.locator('app-playback-bar mat-icon', { hasText: 'pause' }).count()) === 0
  );

  // --- the view controls are present in every mode, and still act ------------
  const viewControlsEverywhere = [];
  for (const mode of ['Synthesis', 'Edit', 'Kinematic']) {
    await tab(mode).click();
    await page.waitForTimeout(600);
    viewControlsEverywhere.push([mode, await page.locator('.viewControls').isVisible()]);
  }
  record(
    'the view controls are present in every mode',
    viewControlsEverywhere.every(([, visible]) => visible),
    viewControlsEverywhere
  );

  await tab('Edit').click();
  await page.waitForTimeout(600);
  // These buttons carry tooltips that appear under the cursor and then swallow
  // the next click, so the pointer is parked away from them between presses.
  const restCursor = () => page.mouse.move(700, 450);
  const comMarks = () => page.locator('#comTagHolder path').count();
  // Icon-only squares now, so they are addressed by what they are for rather
  // than by a word that is no longer printed on them.
  const comButton = page.locator('.viewControls .viewButton[aria-label="Show Center of Mass"]');
  // The view defaults to showing centres of mass, but a mark only appears on a
  // link that has mass: take the weight away and the mark goes with it, give
  // it back and the toggle governs it from there.
  const setMasses = (value) =>
    page.evaluate((mass) => {
      const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
      grid.mechanismSrv.links.forEach((link) => (link.mass = mass));
      grid.mechanismSrv.updateMechanism(false);
    }, value);
  const comBefore = await comMarks();
  await setMasses(0);
  await page.waitForTimeout(400);
  const comMassless = await comMarks();
  await setMasses(5);
  await page.waitForTimeout(400);
  await comButton.click();
  await page.waitForTimeout(500);
  const comAfter = await comMarks();
  record(
    'the CoM mark shows by default, waits for mass, and the toggle removes it',
    comBefore > 0 && comMassless === 0 && comAfter === 0,
    { comBefore, comMassless, comAfter }
  );
  await comButton.click();
  await page.waitForTimeout(300);
  await restCursor();
  await page.locator('.viewControls .viewButton[aria-label="Reset View"]').click();
  await page.waitForTimeout(600);
  await restCursor();
  await page.locator('.viewControls .viewButton[aria-label="Zoom In"]').click();
  await page.waitForTimeout(400);
  record('and the marks come back on again', (await comMarks()) > 0);
  await shot('05-view-controls.png');

  // --- the status strip reports the mode rather than acting on it ------------
  const strip = await page.evaluate(() => {
    const bar = document.querySelector('#bottomBar');
    return { text: bar.innerText, pointerEvents: getComputedStyle(bar).pointerEvents };
  });
  record('the status strip names the mode it is in', /Edit/.test(strip.text), strip.text);
  record('and is not clickable', strip.pointerEvents === 'none', strip);

  await tab('Kinematic').click();
  await page.waitForTimeout(600);
  const analysisStrip = await page.locator('#bottomBar').innerText();
  record(
    'and follows the mode into analysis',
    /Kinematic/.test(analysisStrip) && /Geometry locked/.test(analysisStrip),
    analysisStrip
  );

  // --- short viewport: nothing overlaps the status strip ---------------------
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.waitForTimeout(600);
  await shot('06-short-viewport.png');
  const short = await page.evaluate(() => {
    const bar = document.querySelector('#bottomBar').getBoundingClientRect();
    const inView = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight + 0.5 && r.width > 0;
    };
    const clears = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().bottom <= bar.top + 0.5 : false;
    };
    return {
      playVisible: inView('.playButton'),
      timeVisible: inView('#playbackTime'),
      viewControlsVisible: inView('.viewControls'),
      transportClearsStatusStrip: clears('app-playback-bar .scrubCard'),
      viewControlsClearStatusStrip: clears('.viewControls'),
    };
  });
  record(
    'a short window keeps the transport and view controls visible and clear of the status strip',
    Object.values(short).every(Boolean),
    short
  );
  await page.setViewportSize({ width: 1440, height: 900 });
} catch (error) {
  record('the run finished', false, error?.stack || String(error));
} finally {
  await fs.writeFile(
    path.join(screenshotDir, `${runPrefix}-report.json`),
    JSON.stringify({ baseUrl, results, issues }, null, 2)
  );
  await context.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
