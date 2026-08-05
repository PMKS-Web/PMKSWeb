// The atomic cylinder, end to end: created from the grid's right-click menu,
// re-posed by a parametric mount drag that holds collinearity by construction,
// grounded at a mount, driven through its hidden prismatic pin, sped up from
// the body panel, deleted as one part, and round-tripped through undo/redo.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase4-cylinder.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase4-cylinder';

const results = [];
const consoleErrors = [];

function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// Dismiss the intro tour if it came up.
await page.evaluate(() => document.querySelector('.introjs-skipbutton')?.click());
await page.waitForTimeout(300);

/** The model joints, read straight out of the running app (dev-mode ng). */
function model() {
  return page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      joints: c.mechanismSrv.joints.map((j) => ({
        id: j.id,
        x: j.x,
        y: j.y,
        ground: !!j.ground,
        input: !!j.input,
        sealed: !!j.isSealed,
        kind: j.constructor?.name,
      })),
      links: c.mechanismSrv.links.map((l) => l.id),
      marks: document.querySelectorAll('.cylinder-mark').length,
    };
  });
}

/** Screen centre of a rendered joint circle. */
async function jointOnScreen(id) {
  return page.evaluate((jointId) => {
    const node = document.querySelector(`#joint_${jointId}`);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);
}

/** Perpendicular distance of P from the line through A and B, in model units. */
function offAxis(a, b, p) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return Infinity;
  return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}

// ------------------------------------------------------------- 1. creation
console.log('\ncreate a cylinder from the grid menu');
const created = await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const canvas = document.querySelector('#canvas').getBoundingClientRect();
  c.lastRightClickCoord.x = canvas.x + canvas.width / 2;
  c.lastRightClickCoord.y = canvas.y + canvas.height / 2;
  c.setLastRightClick('grid');
  const labels = c.cMenuItems.map((i) => i.label);
  const item = c.cMenuItems.find((i) => i.label === 'Add Cylinder');
  if (item) item.action();
  return labels;
});
await page.waitForTimeout(600);
checkThat('the grid menu offers Add Cylinder beside Add Link', created.includes('Add Cylinder'), created.join(', '));

let state = await model();
checkThat(
  'one menu click stamps the complete assembly',
  state.joints.length === 5 && state.links.length === 3 && state.marks === 1,
  JSON.stringify({ joints: state.joints.map((j) => j.id), links: state.links, marks: state.marks })
);
const sealedSlider = state.joints.find((j) => j.kind === 'PrisJoint');
checkThat('the slider is sealed', !!sealedSlider?.sealed);
checkThat(
  'only the two mounts are selectable joints',
  !!(await jointOnScreen('A')) &&
    !!(await jointOnScreen('D')) &&
    !(await jointOnScreen('B')) &&
    !(await jointOnScreen('C')),
  'A,D visible; B,C hidden'
);
await page.screenshot({ path: `${OUT}/01-created.png` });

// ------------------------------------------- 2. parametric drag of a mount
console.log('\ndrag mount D through a rotation about mount A');
const before = await model();
const byId = (s, id) => s.joints.find((j) => j.id === id);
const lengthAB0 = Math.hypot(
  byId(before, 'B').x - byId(before, 'A').x,
  byId(before, 'B').y - byId(before, 'A').y
);
const lengthCD0 = Math.hypot(
  byId(before, 'D').x - byId(before, 'C').x,
  byId(before, 'D').y - byId(before, 'C').y
);
const angle0 = Math.atan2(
  byId(before, 'D').y - byId(before, 'A').y,
  byId(before, 'D').x - byId(before, 'A').x
);

const dScreen = await jointOnScreen('D');
const aScreen = await jointOnScreen('A');
let worstOffAxis = 0;
if (checkThat('both mounts are on screen to drag', !!dScreen && !!aScreen)) {
  // Swing D about A by ~55 degrees (screen y grows downward, so this rotates
  // the model counter-clockwise), sampling collinearity the whole way.
  const radius = Math.hypot(dScreen.x - aScreen.x, dScreen.y - aScreen.y);
  const start = Math.atan2(dScreen.y - aScreen.y, dScreen.x - aScreen.x);
  await page.mouse.move(dScreen.x, dScreen.y);
  await page.mouse.down();
  const steps = 26;
  for (let i = 1; i <= steps; i++) {
    const theta = start - (0.96 * i) / steps;
    await page.mouse.move(aScreen.x + radius * Math.cos(theta), aScreen.y + radius * Math.sin(theta));
    await page.waitForTimeout(12);
    const during = await model();
    worstOffAxis = Math.max(
      worstOffAxis,
      offAxis(byId(during, 'A'), byId(during, 'D'), byId(during, 'B')),
      offAxis(byId(during, 'A'), byId(during, 'D'), byId(during, 'C'))
    );
    if (i === Math.floor(steps / 2)) {
      await page.screenshot({ path: `${OUT}/02-mid-rotation.png` });
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const after = await model();
worstOffAxis = Math.max(
  worstOffAxis,
  offAxis(byId(after, 'A'), byId(after, 'D'), byId(after, 'B')),
  offAxis(byId(after, 'A'), byId(after, 'D'), byId(after, 'C'))
);
const angle1 = Math.atan2(
  byId(after, 'D').y - byId(after, 'A').y,
  byId(after, 'D').x - byId(after, 'A').x
);
checkThat(
  'the drag actually rotated the cylinder',
  Math.abs(angle1 - angle0) > 0.35,
  `${(((angle1 - angle0) * 180) / Math.PI).toFixed(1)} deg`
);
checkThat(
  'collinearity held through every sampled frame (by construction)',
  worstOffAxis < 1e-3,
  `worst off-axis ${worstOffAxis.toExponential(2)} model units`
);
const lengthAB1 = Math.hypot(
  byId(after, 'B').x - byId(after, 'A').x,
  byId(after, 'B').y - byId(after, 'A').y
);
const lengthCD1 = Math.hypot(
  byId(after, 'D').x - byId(after, 'C').x,
  byId(after, 'D').y - byId(after, 'C').y
);
checkThat(
  'barrel and rod stayed rigid through the rotation',
  Math.abs(lengthAB1 - lengthAB0) < 1e-3 && Math.abs(lengthCD1 - lengthCD0) < 1e-3,
  `dAB ${(lengthAB1 - lengthAB0).toExponential(2)}, dCD ${(lengthCD1 - lengthCD0).toExponential(2)}`
);
checkThat('mount A did not move', (() => {
  const a0 = byId(before, 'A');
  const a1 = byId(after, 'A');
  return Math.hypot(a1.x - a0.x, a1.y - a0.y) < 1e-6;
})());
await page.screenshot({ path: `${OUT}/03-rotated.png` });

// -------------------------------------------------------- 3. ground a mount
console.log('\nground mount A from its context menu');
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const mount = c.mechanismSrv.joints.find((j) => j.id === 'A');
  c.setLastRightClick(mount);
  c.cMenuItems.find((i) => i.label === 'Add Ground')?.action();
});
await page.waitForTimeout(500);
state = await model();
checkThat('mount A is grounded', !!byId(state, 'A').ground);
const mountMenu = await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.setLastRightClick(c.mechanismSrv.joints.find((j) => j.id === 'A'));
  return c.cMenuItems.map((i) => ({ label: i.label, disabled: i.disabled }));
});
checkThat(
  'the mount menu cascades Delete and greys Slider',
  mountMenu.some((i) => i.label === 'Delete Cylinder') &&
    mountMenu.find((i) => i.label === 'Add Slider')?.disabled === true &&
    !mountMenu.some((i) => i.label === 'Delete Joint'),
  JSON.stringify(mountMenu)
);

// -------------------------------------- 4. drive it through the body's menu
console.log('\nmake the cylinder the input from the body menu');
const bodyMenu = await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const barrel = c.mechanismSrv.links.find((l) =>
    l.joints.some((j) => j.id === 'A')
  );
  c.setLastRightClick(barrel);
  const labels = c.cMenuItems.map((i) => i.label);
  c.cMenuItems.find((i) => i.label === 'Make Input')?.action();
  return labels;
});
await page.waitForTimeout(500);
checkThat(
  'the body menu is exactly Delete Cylinder + Make Input',
  JSON.stringify(bodyMenu) === JSON.stringify(['Delete Cylinder', 'Make Input']),
  bodyMenu.join(', ')
);
state = await model();
checkThat('the hidden prismatic pin is the input joint', !!state.joints.find((j) => j.kind === 'PrisJoint')?.input);
checkThat(
  'the skin shows the driven arrows',
  (await page.locator('.cylinder-mark line').count()) >= 2
);

// ------------------------------------------- 5. set the speed from the panel
console.log('\nset the expansion speed on the body panel');
await page.evaluate(() => {
  // Select the body, as a click on the skin would.
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const barrel = c.mechanismSrv.links.find((l) => l.joints.some((j) => j.id === 'A'));
  c.setLastLeftClick(barrel);
});
await page.waitForTimeout(500);
checkThat(
  'selecting the body opens the Edit Cylinder panel',
  (await page.getByText('Edit Cylinder').count()) >= 1
);
const speedInput = page
  .locator('input-block')
  .filter({ hasText: 'Expansion Speed' })
  .locator('input')
  .first();
if (checkThat('the panel offers an Expansion Speed field', (await speedInput.count()) === 1)) {
  await speedInput.fill('25');
  await speedInput.blur();
  await page.waitForTimeout(400);
  const speed = await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-edit-panel'));
    return panel.settingsService.inputSpeed.value;
  });
  checkThat('the speed reaches the solver settings', speed === 25, `inputSpeed=${speed}`);
}
await page.screenshot({ path: `${OUT}/04-driven-body-panel.png` });

// -------------------------------------------------- 6. delete the whole part
console.log('\ndelete the cylinder as one part, then undo/redo');
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const barrel = c.mechanismSrv.links.find((l) => l.joints.some((j) => j.id === 'A'));
  c.setLastRightClick(barrel);
  c.cMenuItems.find((i) => i.label === 'Delete Cylinder')?.action();
});
await page.waitForTimeout(600);
state = await model();
checkThat(
  'the whole assembly is gone in one step',
  state.joints.length === 0 && state.links.length === 0 && state.marks === 0,
  JSON.stringify({ joints: state.joints.length, links: state.links.length })
);
await page.screenshot({ path: `${OUT}/05-deleted.png` });

// ------------------------------------------------------------ 7. undo / redo
await page.click('text=Undo');
await page.waitForTimeout(700);
state = await model();
checkThat(
  'one undo brings the whole cylinder back',
  state.joints.length === 5 && state.links.length === 3 && state.marks === 1,
  JSON.stringify({ joints: state.joints.length, marks: state.marks })
);
checkThat(
  'the restored cylinder is still sealed and still driven',
  (() => {
    const slider = state.joints.find((j) => j.kind === 'PrisJoint');
    return !!slider?.sealed && !!slider?.input;
  })(),
  JSON.stringify(state.joints.find((j) => j.kind === 'PrisJoint'))
);
checkThat('the restored mount is still grounded', !!byId(state, 'A')?.ground);

await page.click('text=Redo');
await page.waitForTimeout(700);
state = await model();
checkThat('redo deletes it again', state.joints.length === 0 && state.marks === 0);

await page.click('text=Undo');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/06-restored.png` });

await browser.close();

const failed = results.filter((r) => !r.ok);
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, consoleErrors, failed: failed.length }, null, 2)
);
console.log(`\nconsole errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 6).forEach((e) => console.log(`  ${e}`));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
