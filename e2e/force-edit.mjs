/**
 * Editing a force: picking it up, where its anchor may go, and drawing a new one.
 *
 * A force says "this load, at this point, on this body". Two of those three are
 * only editable by dragging, so the rules about where the anchor may land are
 * the rules about what a force can mean:
 *
 *   - the arrow itself is the handle — the little square at its tail is not the
 *     only way to pick one up;
 *   - a pin where several links meet is refused, because a force there does not
 *     say which body it acts on;
 *   - a joint on one link only is fine, and the anchor snaps onto it — that is
 *     how a load goes on the hook at the end of a boom;
 *   - and a snapped anchor has to leave the joint visible, or the two read as
 *     one object.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/force-edit.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, payload]) => [
    id,
    payload,
  ])
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Model-space point to screen, through the layer the mechanism is drawn in. */
const toScreen = (x, y) =>
  page.evaluate(
    ([modelX, modelY]) => {
      const m = document.querySelector('#linkHolder').getScreenCTM();
      return { x: modelX * m.a + modelY * m.c + m.e, y: modelX * m.b + modelY * m.d + m.f };
    },
    [x, y]
  );

const force = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const held = grid.mechanismSrv.forces[0];
    if (!held) return undefined;
    return {
      start: [Math.round(held.startCoord.x), Math.round(held.startCoord.y)],
      end: [Math.round(held.endCoord.x), Math.round(held.endCoord.y)],
      snapped: grid.forceSnappedJoint(held)?.id,
      link: held.link.id,
    };
  });

const jointAt = (id) =>
  page.evaluate((jointId) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === jointId);
    return joint ? { x: joint.x, y: joint.y, links: joint.links.length } : undefined;
  }, id);

await page.goto(`${BASE}/?${payloads['Derrick_Crane']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const start = await force();
record('the crane opens carrying its hook load', !!start, start);
record('and the load reads as snapped to the hook', start?.snapped === 'T', start);

// The ring that keeps the joint visible under the arrow's own anchor.
const ringed = await page.evaluate(
  () =>
    document.querySelectorAll('#forceHolder circle[fill="none"], svg circle[fill="none"]').length
);
record('a snapped anchor draws a ring rather than covering the joint', ringed > 0, ringed);

// --- the arrow itself is the handle ---------------------------------------
const middle = await toScreen(
  (start.start[0] + start.end[0]) / 2,
  (start.start[1] + start.end[1]) / 2
);
const boomFoot = await jointAt('O');
const hook = await jointAt('T');
const alongBoom = await toScreen(
  boomFoot.x + (hook.x - boomFoot.x) * 0.45,
  boomFoot.y + (hook.y - boomFoot.y) * 0.45
);
await page.mouse.move(middle.x, middle.y);
await page.mouse.down();
await page.mouse.move(alongBoom.x, alongBoom.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);

const moved = await force();
record(
  'grabbing the arrow carries the whole force',
  moved.start[0] !== start.start[0] || moved.start[1] !== start.start[1],
  { start, moved }
);
const lengthOf = (f) => Math.hypot(f.end[0] - f.start[0], f.end[1] - f.start[1]);
record('and the arrow keeps its length', Math.abs(lengthOf(moved) - lengthOf(start)) < 3, {
  start,
  moved,
});
record('and it is no longer snapped to anything', moved.snapped === undefined, moved);

// --- a pin where two links meet is refused ---------------------------------
const shared = await jointAt('C');
record('joint C is the shared pin', shared.links === 2, shared);
const onShared = await toScreen(shared.x, shared.y);
const grabAt = await toScreen(moved.start[0], moved.start[1]);
await page.mouse.move(grabAt.x, grabAt.y);
await page.mouse.down();
await page.mouse.move(onShared.x, onShared.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);

const refused = await force();
record(
  'the anchor will not sit on a pin two links share',
  Math.hypot(refused.start[0] - shared.x, refused.start[1] - shared.y) > 1,
  { refused, shared: [Math.round(shared.x), Math.round(shared.y)] }
);

// --- a single-link joint takes it ------------------------------------------
const onHook = await toScreen(hook.x, hook.y);
const grabAgain = await toScreen(refused.start[0], refused.start[1]);
await page.mouse.move(grabAgain.x, grabAgain.y);
await page.mouse.down();
await page.mouse.move(onHook.x, onHook.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(500);

const snapped = await force();
record('and snaps onto a joint only one link holds', snapped.snapped === 'T', snapped);

// --- drawing a new one previews the real arrow -----------------------------
const onBoom = await toScreen(
  boomFoot.x + (hook.x - boomFoot.x) * 0.3,
  boomFoot.y + (hook.y - boomFoot.y) * 0.3
);
await page.mouse.move(onBoom.x, onBoom.y);
await page.mouse.click(onBoom.x, onBoom.y, { button: 'right' });
await page.waitForTimeout(600);
await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu #menu-item')].find((node) =>
    /Attach Force/.test(node.textContent)
  );
  item?.querySelector('button')?.click();
});
await page.waitForTimeout(300);
await page.mouse.move(onBoom.x + 120, onBoom.y - 90, { steps: 8 });
await page.waitForTimeout(200);

const ghost = await page.evaluate(() => {
  const holder = document.querySelector('#forceTempHolder');
  if (!holder) return undefined;
  const paths = [...holder.querySelectorAll('path')].map((node) => node.getAttribute('d') ?? '');
  return { paths: paths.length, drawn: paths.filter((d) => d.length > 4).length };
});
record('drawing a force previews the arrow it will make', !!ghost && ghost.drawn >= 2, ghost);

await page.mouse.click(onBoom.x + 120, onBoom.y - 90);
await page.waitForTimeout(800);
const built = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces.length
);
record('and the click makes it', built === 2, built);
record(
  'the preview is gone once it is made',
  !(await page.evaluate(() => !!document.querySelector('#forceTempHolder')))
);

// --- a welded joint refuses a cylinder -------------------------------------
await page.goto(`${BASE}/?${payloads['Scotch_Yoke']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const welded = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find((candidate) => candidate.isWelded);
  return joint ? { id: joint.id, x: joint.x, y: joint.y } : undefined;
});
record('the yoke has a welded joint', !!welded, welded);
const onWeld = await toScreen(welded.x, welded.y);
await page.mouse.move(onWeld.x, onWeld.y);
await page.mouse.click(onWeld.x, onWeld.y, { button: 'right' });
await page.waitForTimeout(600);
const weldMenu = await page.evaluate(() =>
  [...document.querySelectorAll('#contextMenu #menu-item')].map((item) => ({
    label: item.textContent.trim().replace(/\s+/g, ' '),
    disabled: item.classList.contains('disabledItem'),
  }))
);
const cylinderItem = weldMenu.find((item) => item.label === 'Attach Cylinder');
record(
  'a welded joint will not take a cylinder',
  !cylinderItem || cylinderItem.disabled,
  weldMenu.map((item) => `${item.label}${item.disabled ? ' (off)' : ''}`)
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
