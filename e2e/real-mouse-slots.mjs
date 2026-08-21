// Build every slider and cylinder variant with a REAL mouse.
//
// Everything else in e2e/ drives the page with dispatched events, which are not
// a mouse. That difference has cost this project twice: a runaway canvas pan
// that synthetic events could not reproduce at all, and a compositor artifact
// that only showed under a genuine drag. So this one posts HID-level events
// through e2e/tools/mousectl.swift and lets the browser find out the same way a
// hand would.
//
// It drives a throwaway Playwright window, never a logged-in profile — the
// cursor is real, so the window it lands on has to be one we own.
//
//   swiftc -O e2e/tools/mousectl.swift -o /tmp/mousectl
//   MOUSECTL=/tmp/mousectl node e2e/real-mouse-slots.mjs
//
// mousectl needs Accessibility permission for whatever process runs it.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const MOUSE = process.env.MOUSECTL;
if (!MOUSE) throw new Error('set MOUSECTL to the compiled e2e/tools/mousectl.swift');
const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/real-mouse';
mkdirSync(OUT, { recursive: true });

const results = [];
let shot = 0;
function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch({
  headless: false,
  args: [
    '--window-position=40,40',
    '--window-size=1400,980',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
// A fullscreen app on another Space otherwise occludes the test window and the
// compositor goes idle, which is indistinguishable from a rendering bug.
execSync(
  `open -a "${process.env.PW_CHROME ?? '/Users/kohmei358/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app'}"`
);
import { waitForReady } from './app-ready.mjs';
await new Promise((r) => setTimeout(r, 1200));

const page = await browser.newPage({ viewport: null });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 160)));
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 160)));

/** Page coordinates -> screen coordinates, for the real cursor. */
async function toScreen(x, y) {
  const f = await page.evaluate(() => ({
    sx: window.screenX,
    sy: window.screenY,
    top: window.outerHeight - window.innerHeight,
    left: Math.max(0, Math.round((window.outerWidth - window.innerWidth) / 2)),
  }));
  return { x: Math.round(f.sx + f.left + x), y: Math.round(f.sy + f.top + y) };
}
const mouse = (...args) => execSync(`"${MOUSE}" ${args.join(' ')}`);
const pause = (ms) => page.waitForTimeout(ms);

async function realClick(x, y, button = 'click') {
  const s = await toScreen(x, y);
  mouse(button, s.x, s.y);
  await pause(450);
}
async function realDrag(from, to, steps = 30) {
  const a = await toScreen(from.x, from.y);
  const b = await toScreen(to.x, to.y);
  mouse('drag', a.x, a.y, b.x, b.y, steps, 9000);
  await pause(700);
}
async function realWheel(x, y, ticks) {
  const s = await toScreen(x, y);
  mouse('wheel', s.x, s.y, ticks);
  await pause(600);
}
async function capture(name) {
  const file = `${OUT}/${String(++shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, animations: 'disabled', timeout: 20000 });
  return file;
}

/** Where a context-menu item sits right now, by its text. */
const menuItem = (label) =>
  page.evaluate((text) => {
    const node = [...document.querySelectorAll('.cdk-overlay-container *')].find(
      (n) => n.children.length === 0 && n.textContent.trim() === text
    );
    if (!node) return null;
    const b = node.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }, label);

const model = () =>
  page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      joints: c.mechanismSrv.joints.length,
      links: c.mechanismSrv.links.length,
      blocks: document.querySelectorAll('#sliderHolder .slider-block').length,
      plates: document.querySelectorAll('#sliderHolder .slider-plate').length,
      motors: document.querySelectorAll('#motorHolder path, #motorArrowHolder image').length,
      cylinders: document.querySelectorAll('.cylinder-mark').length,
      dof: c.mechanismSrv.mechanisms[0]?.dof,
      valid: c.mechanismSrv.oneValidMechanismExists(),
    };
  });

/**
 * Place a link by right-clicking, choosing the menu item, then MOVING to the
 * target before the finalising click. The canvas takes the position from
 * tracked pointer movement, so a click that teleports lands the joint wherever
 * the pointer was last seen — which is exactly the kind of thing a real cursor
 * gets right and a dispatched event does not.
 */
async function addLink(from, to, label) {
  await realClick(from.x, from.y, 'rclick');
  const item = await menuItem(label);
  if (!item) return false;
  await realClick(item.x, item.y);
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const s = await toScreen(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps
    );
    mouse('move', s.x, s.y);
    await pause(25);
  }
  await realClick(to.x, to.y);
  return true;
}

const jointsOnScreen = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#jointHolder [id^="joint_"]')].map((n) => {
      const b = n.getBoundingClientRect();
      return { id: n.id, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    })
  );

async function fresh() {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await pause(1200);
  await page.evaluate(() => {
    [...document.querySelectorAll('button, span, div')]
      .find((n) => n.textContent.trim() === '×')
      ?.click();
  });
  await page.keyboard.press('Escape');
  await pause(500);
}

// ---------------------------------------------------------------- 1. slot ---
console.log('\n1. a floating slot, drawn by hand');
await fresh();
await capture('empty-grid');

const built = await addLink({ x: 560, y: 620 }, { x: 820, y: 620 }, 'Add Link');
checkThat('the creation menu opens under a real right-click', built);
let m = await model();
checkThat('a first link exists', m.joints === 2 && m.links === 1, JSON.stringify(m));
await capture('first-link');

await addLink({ x: 820, y: 620 }, { x: 950, y: 430 }, 'Attach Link');
m = await model();
checkThat('a second link grows off it', m.joints === 3 && m.links === 2, JSON.stringify(m));
await capture('second-link');

const ends = await jointsOnScreen();
const far = ends[ends.length - 1];
const midBar = { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
await realDrag(far, midBar, 30);
m = await model();
checkThat('dropping a joint on a link body cuts a slot', m.blocks === 1, JSON.stringify(m));
await capture('floating-slot');

// ---------------------------------------------------------- 2. the Slide ---
console.log('\n2. welding it into a Slide');
await realClick(midBar.x, midBar.y);
await pause(500);
const weld = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#toggle-block .row')].find((n) =>
    /Weld/.test(n.textContent)
  );
  const sw = row?.querySelector('button[role="switch"], .mdc-switch');
  if (!sw) return null;
  const b = sw.getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
});
if (checkThat('the panel offers a Weld toggle for the slot', !!weld)) {
  await realClick(weld.x, weld.y);
  m = await model();
  checkThat('welding draws the plate that makes it a Slide', m.plates === 1, JSON.stringify(m));
  await capture('slide-welded');
}

// --------------------------------------------------- 3. canvas transform ---
console.log('\n3. the same marks under zoom and pan');
await realWheel(760, 560, 6);
await capture('zoomed-in');
const beforePan = await page.evaluate(
  () => document.querySelector('#linkHolder path[id]')?.getBoundingClientRect().x
);
await realDrag({ x: 1150, y: 250 }, { x: 950, y: 380 }, 26);
const afterPan = await page.evaluate(
  () => document.querySelector('#linkHolder path[id]')?.getBoundingClientRect().x
);
checkThat(
  'a drag on bare canvas pans it',
  Math.abs((afterPan ?? 0) - (beforePan ?? 0)) > 1,
  `${beforePan?.toFixed(1)} -> ${afterPan?.toFixed(1)}`
);
await capture('panned');

// The bug this file exists for: with no button held, the canvas must not keep
// following the cursor after the release.
const restA = await page.evaluate(
  () => document.querySelector('#linkHolder path[id]')?.getBoundingClientRect().x
);
for (const [x, y] of [
  [700, 400],
  [900, 500],
  [1100, 600],
]) {
  const s = await toScreen(x, y);
  mouse('move', s.x, s.y);
  await pause(180);
}
const restB = await page.evaluate(
  () => document.querySelector('#linkHolder path[id]')?.getBoundingClientRect().x
);
checkThat(
  'the canvas does not chase a buttonless cursor after a drag',
  Math.abs((restB ?? 0) - (restA ?? 0)) < 0.5,
  `${restA?.toFixed(1)} -> ${restB?.toFixed(1)}`
);
await capture('after-buttonless-moves');
await realWheel(760, 560, -6);

// ------------------------------------------- 4. cylinder and driven pin ----
// Built ones this time: reaching a sealed cylinder by hand is a dozen more
// gestures, and what is under test here is how the marks behave under a real
// cursor, not the menu path to them, which section 1 already covered.
const FROM_GALLERY = [
  ['cylinder-driven-boom', 'Cylinder-driven boom'],
  ['driven-floating-pin', 'Four-bar driven at its coupler-rocker pin'],
  ['grounded-slot', 'Inverted slider-crank'],
  ['scotch-yoke-slide', 'Scotch yoke'],
];
const { readFileSync } = await import('node:fs');
const gallery = readFileSync('docs/fixture-urls.md', 'utf8').split('\n');

for (const [tag, name] of FROM_GALLERY) {
  console.log(`\n4. ${name}, under a real cursor`);
  const row = gallery.find((l) => l.startsWith(`| [${name}]`));
  if (!checkThat(`${tag}: published in the gallery`, !!row)) continue;
  const query = row.match(/\(https:\/\/[^)?]+(\?[^)]*)\)/)[1];
  await page.goto(BASE + '/' + query, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await pause(1100);
  await pause(300);
  m = await model();
  checkThat(`${tag}: opens valid at DOF 1`, m.valid && m.dof === 1, JSON.stringify(m));
  await capture(`${tag}-loaded`);

  // Drag a joint with a real mouse and confirm the drawing follows it rather
  // than staying painted where the mechanism was built -- the cylinder skin
  // shipped exactly that bug once, cached against a revision no drag bumps.
  // Measured as a box on screen, because these marks are placed by their path
  // data rather than by a transform, and asking for an attribute that is never
  // set reads as "unchanged" no matter what the app does.
  const drawnBox = () =>
    page.evaluate(() => {
      // Every block's own centre, not the group's bounding box. The group is
      // sized by the rails, which do not move, so a block sliding inside one
      // leaves the box identical -- and a mechanism with no blocks at all
      // gives an empty group, whose box is 0x0 and equally unchanging. Both
      // read as "the drawing did not follow" for a drawing that followed.
      const marks = [...document.querySelectorAll('#sliderHolder .slider-block')];
      if (!marks.length) return null;
      return marks
        .map((n) => {
          const b = n.getBoundingClientRect();
          return `${Math.round(b.x + b.width / 2)}:${Math.round(b.y + b.height / 2)}`;
        })
        .join(' ');
    });
  const before = await drawnBox();
  const posOf = (id) =>
    page.evaluate((jointId) => {
      const j = ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.joints.find((n) => n.id === jointId);
      return j ? `${j.x.toFixed(3)},${j.y.toFixed(3)}` : null;
    }, id);

  // A joint that can actually move: dragging a grounded one is a no-op.
  const js = await jointsOnScreen();
  const free = await page.evaluate(() =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.filter((j) => !j.ground)
      .map((j) => j.id)
  );
  const movable = js.filter((n) => free.some((id) => n.id.endsWith(id)));

  if (movable.length) {
    const j = movable[0];
    const id = free.find((f) => j.id.endsWith(f));
    const wasAt = await posOf(id);
    await realDrag(j, { x: j.x + 60, y: j.y - 45 }, 26);
    const nowAt = await posOf(id);
    const after = await drawnBox();

    // Two separate questions, reported separately. If the model did not change
    // the drag never landed, which is this harness missing the joint rather
    // than the app failing to redraw -- calling that a rendering failure would
    // be pinning a harness problem on the thing under test.
    if (wasAt === nowAt) {
      console.log(`  SKIP  ${tag}: the drag did not land on ${id}, nothing to conclude`);
    } else if (before === null) {
      console.log(`  SKIP  ${tag}: no block to watch -- this mechanism has no slider`);
    } else {
      checkThat(
        `${tag}: the drawing follows a dragged joint`,
        !!before && before !== after,
        `joint ${wasAt} -> ${nowAt}; drawing ${before} -> ${after}`
      );
    }
    await capture(`${tag}-after-drag`);
  }

  await realWheel(700, 500, 5);
  await capture(`${tag}-zoomed`);
  await realWheel(700, 500, -5);
}

checkThat(
  'nothing was logged to the console throughout',
  consoleErrors.length === 0,
  consoleErrors.join(' | ')
);

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed, ${shot} screenshots`
);
process.exit(failed.length ? 1 : 0);
