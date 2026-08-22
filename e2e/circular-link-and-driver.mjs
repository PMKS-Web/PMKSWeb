/**
 * The two things brought over from PMKS-Refactor, driven through the app:
 * Make Circular on a crank, and the driver dyad that turns a synthesised
 * four-bar into a six-bar a motor can run.
 *
 *   BASE=http://localhost:4310 node e2e/circular-link-and-driver.mjs
 */
const { chromium } = await import('/tmp/pmks-playwright/node_modules/playwright/index.mjs');
import { waitForReady } from './app-ready.mjs';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4310';
const SHOTS = new URL('../artifacts/screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const source = readFileSync(
  new URL('../src/app/component/MODALS/templates/template-linkages.ts', import.meta.url).pathname,
  'utf8'
);
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
let stage = 'load';
const note = (text) => errors.push(`[${stage}] ${text.split('\n')[0].slice(0, 140)}`);
page.on('pageerror', (e) => note(String(e)));
page.on('console', (m) => m.type() === 'error' && note(m.text()));

const shot = (name) => page.screenshot({ path: `${SHOTS}circdrv-${name}.png` });

// ---------------------------------------------------------------- circular
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const linkState = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const crank = grid.mechanismSrv.links.find((l) => l.canBeCircular?.());
    const box = crank ? document.querySelector(`#linkHolder path#${crank.id}`) : null;
    const rect = box?.getBoundingClientRect();
    return {
      id: crank?.id,
      isCircle: crank?.isCircle,
      arcs: (crank?.d.match(/A /g) ?? []).length,
      // A bar has two arcs too (its end caps); only a disc has no straight edge.
      sides: (crank?.d.match(/ L /g) ?? []).length,
      edges: crank?.externalLines.length,
      box: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
      url: location.search,
    };
  });

stage = 'template-loaded';
const before = await linkState();
check('a grounded crank is eligible for a disc', !!before.id, `link ${before.id}`);

// What the right-click menu actually offers, which is the only way anyone
// reaches this feature.
const menuLabels = (linkId) =>
  page.evaluate((id) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.setLastRightClick(grid.mechanismSrv.links.find((l) => l.id === id));
    grid.updateContextMenuItems();
    return grid.cMenu.groups.flatMap((group) => group.rows).map((row) => row.label);
  }, linkId);

const coupler = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const free = grid.mechanismSrv.links.find((l) => !l.canBeCircular());
  return free ? { id: free.id, can: free.canBeCircular() } : null;
});
check('a coupler is not', coupler !== null && coupler.can === false, `link ${coupler?.id}`);

const crankMenu = await menuLabels(before.id);
const couplerMenu = await menuLabels(coupler.id);
// The row is a state now -- "Drawn as a Disc", ticked or not -- rather than a
// verb whose label flipped between Make Circular and Make Bar. And it is
// greyed with its reason on a link that cannot take one rather than hidden:
// the menu's one availability rule is that a reader is told why.
check('the crank is offered a disc', crankMenu.includes('Drawn as a Disc'), crankMenu.join(', '));
const couplerDisc = await page.evaluate((id) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.setLastRightClick(grid.mechanismSrv.links.find((l) => l.id === id));
  return grid.cMenu.groups
    .flatMap((group) => group.rows)
    .filter((row) => row.label === 'Drawn as a Disc')
    .map((row) => ({ disabled: row.disabled, reason: row.refusal?.short ?? null }))[0];
}, coupler.id);
check(
  'the coupler is told why it cannot have one',
  couplerDisc?.disabled === true && couplerDisc?.reason === 'needs a fixed pin',
  JSON.stringify({ couplerDisc, menu: couplerMenu.join(', ') })
);
check(
  'and no label in either menu flips as it is used',
  ![...crankMenu, ...couplerMenu].some((label) => /^(Make|Add|Remove) /.test(label)),
  [...crankMenu, ...couplerMenu].join(', ')
);

await page.evaluate((id) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.links.find((l) => l.id === id));
  grid.mechanismSrv.toggleLinkCircular();
}, before.id);
await page.waitForTimeout(500);

stage = 'made-circular';
const after = await linkState();
check(
  'the crank is drawn as a disc',
  after.isCircle === true && after.arcs === 2 && after.sides === 0,
  `${after.arcs} arcs, ${after.sides} straight edges`
);
check(
  'the disc is as tall as it is wide',
  after.box && Math.abs(after.box[0] - after.box[1]) <= 2,
  `${after.box}`
);
check('the disc has no edges to hang a joint on', after.edges === 0, `${after.edges} edges`);
check(
  'the disc is bigger than the bar it replaced',
  after.box[0] > before.box[0],
  `${before.box[0]} → ${after.box[0]}`
);
await shot('1-disc');

// The URL has to carry it, and reloading has to bring it back.
const shared = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return grid.saveHistoryService.urlGenerationService.generateUrlQuery();
});
stage = 'share-url';
if (shared) {
  await page.goto(`${BASE}/?${shared}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  const reopened = await linkState();
  check(
    'a shared URL reopens as a disc',
    reopened.isCircle === true && reopened.arcs === 2 && reopened.sides === 0
  );
} else {
  check('a shared URL reopens as a disc', false, 'could not reach the url generator');
}

// It has to survive being animated: every solved frame is a fresh copy.
await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-playback-bar'));
  bar.togglePlay ? bar.togglePlay() : bar.play?.();
});
stage = 'animating';
await page.waitForTimeout(1200);
const running = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const crank = grid.mechanismSrv.links.find((l) => l.isCircle);
  return {
    arcs: (crank?.d.match(/A /g) ?? []).length,
    sides: (crank?.d.match(/ L /g) ?? []).length,
    d: crank?.d.slice(0, 40),
  };
});
check('it is still a disc while running', running.arcs === 2 && running.sides === 0, running.d);
await shot('2-running');

// -------------------------------------------------------------- synthesis
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

// Synthesis tab, then three poses via the panel's own model.
await page.evaluate(() => {
  // TabID.SYNTHESIZE is 0.
  ng.getComponent(document.querySelector('app-left-tabs')).tabs.setTab(0);
});
await page.waitForTimeout(600);
await shot('3-synthesis-tab');

stage = 'synthesis-poses';
const posed = await page.evaluate(() => {
  const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
  if (!panel) return { ok: false };
  const b = panel.design;
  [1, 2, 3].forEach((i) => b.isPoseDefined(i) || b.createPose(i));
  const at = [
    [-2, 1, 20],
    [0, 2.2, 45],
    [2.4, 1.4, 70],
  ];
  [1, 2, 3].forEach((i) => {
    const [x, y, deg] = at[i - 1];
    b.poses[i].position = new b.poses[i].position.constructor(x * 200, y * 200);
    b.poses[i].thetaDegrees = deg;
  });
  b.valueChanges.next(true);
  return {
    ok: true,
    links: panel.mechanismSrv.links.length,
    joints: panel.mechanismSrv.joints.length,
  };
});
check(
  'three poses synthesise a four-bar',
  posed.ok && posed.links === 3,
  `${posed.links} links, ${posed.joints} joints`
);
await page.waitForTimeout(500);
await shot('4-fourbar');

const driverState = () =>
  page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-synthesis-panel'));
    const m = panel.mechanismSrv;
    return {
      links: m.links.length,
      joints: m.joints.length,
      grounds: m.joints.filter((j) => j.ground).length,
      inputs: m.joints.filter((j) => j.input).length,
      refusal: panel.synthesisBuilder.driverRefusal ?? null,
      wanted: panel.synthesisBuilder.driverWanted,
      valid: m.mechanisms[0]?.mechanismValid,
      frames: m.mechanisms[0]?.joints?.length ?? 0,
    };
  });

stage = 'four-bar';
const fourBar = await driverState();
check(
  'the four-bar is driven from one ground pin',
  fourBar.inputs === 1 && fourBar.grounds === 2,
  `${fourBar.inputs} input, ${fourBar.grounds} ground`
);

await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-synthesis-panel')).toggleDriver()
);
await page.waitForTimeout(900);
stage = 'six-bar';
const sixBar = await driverState();
check(
  'adding a driver makes it a six-bar',
  sixBar.links === 5 && sixBar.joints === 6 && sixBar.grounds === 3,
  `${sixBar.links} links, ${sixBar.joints} joints, ${sixBar.grounds} grounds, refusal=${sixBar.refusal}`
);
check('the drive moved to the new pin', sixBar.inputs === 1, `${sixBar.inputs} inputs`);
check('the six-bar solves', sixBar.valid === true, `valid=${sixBar.valid} frames=${sixBar.frames}`);
check(
  'one full turn of the driver, not a stub of one',
  sixBar.frames > 100,
  `${sixBar.frames} frames`
);
await shot('5-sixbar');

await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-synthesis-panel')).swapDrivePin()
);
await page.waitForTimeout(900);
stage = 'swap-pin';
const swapped = await driverState();
check(
  'swapping the drive pin rebuilds it whole',
  swapped.links === 5 && swapped.joints === 6,
  `${swapped.links} links, ${swapped.joints} joints, refusal=${swapped.refusal}`
);
await shot('6-swapped');

await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-synthesis-panel')).toggleDriver()
);
await page.waitForTimeout(900);
stage = 'driver-removed';
const removed = await driverState();
check(
  'removing the driver leaves the four-bar behind',
  removed.links === 3 && removed.joints === 4 && removed.inputs === 1,
  `${removed.links} links, ${removed.joints} joints`
);
await shot('7-driver-removed');

// One console error predates this branch: setting up three synthesis poses
// draws a path the browser rejects for a frame, and it reproduces identically
// on multi-mechanism-redesign at b3f9e08. Named rather than ignored, so that a
// second copy of it — or any other error — still fails this run.
const KNOWN_BEFORE_THIS_BRANCH = /^\[synthesis-poses\] Error: Invalid SVG path number$/;
const unexpected = errors.filter((e) => !KNOWN_BEFORE_THIS_BRANCH.test(e));
check(
  'no page errors beyond the one that predates this work',
  unexpected.length === 0,
  unexpected.slice(0, 6).join('\n        ')
);

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
