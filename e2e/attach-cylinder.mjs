/**
 * Attach Cylinder, from a link's own context menu.
 *
 * The same gesture as Attach Link with a different member on the end of it: the
 * right-click point is where the ram is bolted, the cursor is where its rod
 * finishes, and the next left-click commits. What this checks is that the mount
 * actually joins the link's body — a ram that merely sits near a bar is not
 * attached to it — and that the whole assembly is one undo step.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/attach-cylinder.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const src = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...src.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);
import { waitForReady } from './app-ready.mjs';

const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-attachcyl', {
  headless: true,
  viewport: { width: 1500, height: 950 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** Everything a user could see change, plus what the model says underneath. */
const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const cylinder = grid.mechanismSrv.sealedStructures()[0];
    const between = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    return {
      joints: [...document.querySelectorAll('[id^="joint_"]')].map((n) => n.id.slice(6)).join(''),
      skins: document.querySelectorAll('.cylinder-mark').length,
      dof: (document.body.textContent.match(/Degrees of Freedom:\s*(-?[\d.]+|—)/) ?? [])[1],
      links: grid.mechanismSrv.links.map((link) => link.id),
      nan: [...document.querySelectorAll('svg *')].filter((node) =>
        [...node.attributes].some((a) => /NaN/.test(a.value))
      ).length,
      ram: cylinder
        ? {
            barrel: between(cylinder.barrelFar, cylinder.barrelNear),
            rod: between(cylinder.pin, cylinder.rodFar),
            span: between(cylinder.barrelFar, cylinder.rodFar),
            pinAlong: between(cylinder.barrelFar, cylinder.pin),
            mountLinks: cylinder.barrelFar.links.map((link) => link.id),
          }
        : undefined,
    };
  });

const before = await state();

// A point actually ON the coupler, taken from the *model*: midway between two
// of the link's own joints is inside the bar whatever width it is drawn at.
// Sampling a point along the drawn outline instead was fragile — it sits on the
// edge rather than in the body, and the templates opening at 0.7 object scale
// made the bars thin enough for that to start missing.
const on = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const link = grid.mechanismSrv.links.find((candidate) => candidate.joints.length >= 2);
  const [first, second] = link.joints;
  const x = (first.x + second.x) / 2;
  const y = (first.y + second.y) / 2;
  const m = document.querySelector('#linkHolder').getScreenCTM();
  return { x: x * m.a + y * m.c + m.e, y: x * m.b + y * m.d + m.f };
});
await page.mouse.move(on.x, on.y);
await page.mouse.click(on.x, on.y, { button: 'right' });
await page.waitForTimeout(600);

const menu = await page.evaluate(() =>
  [...document.querySelectorAll('#contextMenu #menu-item')].map((item) => ({
    label: item.textContent.trim().replace(/\s+/g, ' '),
    disabled: item.classList.contains('disabledItem'),
  }))
);
const entry = menu.find((item) => item.label === 'Attach Cylinder');
record('a link offers Attach Cylinder', !!entry && !entry.disabled, menu);
// Beside Attach Link, not somewhere else in the list: they are the same act.
record(
  'and offers it beside Attach Link',
  menu.findIndex((item) => item.label === 'Attach Cylinder') ===
    menu.findIndex((item) => item.label === 'Attach Link') + 1,
  menu.map((item) => item.label)
);

await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu #menu-item')].find((node) =>
    /Attach Cylinder/.test(node.textContent)
  );
  item.querySelector('button').click();
});
await page.waitForTimeout(400);
await page.mouse.move(on.x + 260, on.y - 170);
await page.waitForTimeout(300);
await page.mouse.click(on.x + 260, on.y - 170);
await page.waitForTimeout(1500);

const after = await state();
record('the gesture builds one cylinder', after.skins === 1 && !!after.ram, after);
record(
  'barrel and rod are equal, and the span is the two of them',
  !!after.ram &&
    Math.abs(after.ram.barrel - after.ram.rod) < 0.01 &&
    Math.abs(after.ram.pinAlong + after.ram.barrel - after.ram.span) < 0.01,
  after.ram
);
// The point of attaching rather than drawing: the mount is a member of the bar
// that was right-clicked, so the ram swings with it.
const grew = after.links.find(
  (id) => !before.links.includes(id) && before.links.some((old) => id.startsWith(old))
);
record(
  "the mount joins the link's own body",
  !!grew && !!after.ram && after.ram.mountLinks.includes(grew),
  { grew, mountLinks: after.ram?.mountLinks, before: before.links, after: after.links }
);
// Two freedoms, because the rod's far end is deliberately left unattached.
record('the free rod end shows as two added freedoms', after.dof === '3', {
  before: before.dof,
  after: after.dof,
});
record('nothing is drawn NaN', after.nan === 0, after.nan);

await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((n) => /Undo/.test(n.textContent));
  if (button && !button.disabled) button.click();
});
await page.waitForTimeout(1200);
const undone = await state();
record(
  'and the whole ram is one undo step',
  undone.skins === 0 && undone.joints === before.joints && undone.dof === before.dof,
  { before, undone }
);

// ---------------------------------------------------------------------------
// The same gesture from a *joint's* menu. The difference worth checking is what
// the mount turns out to be: attaching to a joint has to use that joint, not
// build a second one on top of it. Two joints at one point look like one and
// behave like neither — and a body whose joints are coincident has no angle,
// which is its own class of bug (see driven-slider-block.spec.ts).
// ---------------------------------------------------------------------------

const jointBefore = await state();
const onJoint = await page.evaluate(() => {
  const box = document.querySelector('#joint_B').getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await page.mouse.move(onJoint.x, onJoint.y);
await page.mouse.click(onJoint.x, onJoint.y, { button: 'right' });
await page.waitForTimeout(600);

const jointMenu = await page.evaluate(() =>
  [...document.querySelectorAll('#contextMenu #menu-item')].map((item) => ({
    label: item.textContent.trim().replace(/\s+/g, ' '),
    disabled: item.classList.contains('disabledItem'),
  }))
);
const jointEntry = jointMenu.find((item) => item.label === 'Attach Cylinder');
record('a joint offers Attach Cylinder too', !!jointEntry && !jointEntry.disabled, jointMenu);
record(
  'and offers it beside Attach Link there as well',
  jointMenu.findIndex((item) => item.label === 'Attach Cylinder') ===
    jointMenu.findIndex((item) => item.label === 'Attach Link') + 1,
  jointMenu.map((item) => item.label)
);

await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu #menu-item')].find((node) =>
    /Attach Cylinder/.test(node.textContent)
  );
  item.querySelector('button').click();
});
await page.waitForTimeout(400);
await page.mouse.move(onJoint.x + 240, onJoint.y - 160);
await page.waitForTimeout(300);
await page.mouse.click(onJoint.x + 240, onJoint.y - 160);
await page.waitForTimeout(1500);

const fromJoint = await state();
record('the gesture builds one cylinder from a joint', fromJoint.skins === 1, fromJoint);
const mount = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = grid.mechanismSrv.joints.find((candidate) => candidate.id === 'B');
  return {
    links: joint.links.map((link) => link.id),
    coincident: grid.mechanismSrv.joints
      .filter(
        (other) => other.id !== 'B' && Math.hypot(other.x - joint.x, other.y - joint.y) < 1e-6
      )
      .map((other) => other.id),
  };
});
record('the mount is the joint itself, not a twin beside it', mount.coincident.length === 0, mount);
record('and the joint carries the barrel', mount.links.length === 3, mount);
record('nothing is drawn NaN from a joint either', fromJoint.nan === 0, fromJoint.nan);

await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((n) => /Undo/.test(n.textContent));
  if (button && !button.disabled) button.click();
});
await page.waitForTimeout(1200);
const jointUndone = await state();
record(
  'and that ram is one undo step as well',
  jointUndone.skins === 0 && jointUndone.joints === jointBefore.joints,
  { jointBefore, jointUndone }
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await ctx.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
