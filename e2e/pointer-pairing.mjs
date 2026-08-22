/**
 * A press that arrives as a bare `mousedown`, with no `pointerdown` before it.
 *
 * Safari does this exactly once after a native `<select>` popup is dismissed.
 * The canvas is driven by pointer events and svg-pan-zoom by mouse events, so
 * the unpaired press went to the library alone: the canvas panned under a
 * cursor that was holding a link, and the drag did nothing. The gesture after
 * it is paired again, which is why clicking once "fixes" it and hides the cause.
 *
 * The sequence below is the one traced from the failing gesture in Safari, so
 * this reproduces it in any engine — no native popup required.
 *
 *   BASE=http://127.0.0.1:4310 node e2e/pointer-pairing.mjs
 */
const { chromium, webkit } = await import('/tmp/pmks-playwright/node_modules/playwright/index.mjs');
import { waitForReady } from './app-ready.mjs';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4310';
const source = readFileSync(
  new URL('../src/app/component/MODALS/templates/template-linkages.ts', import.meta.url).pathname,
  'utf8'
);
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Grabs a third of the way along B→C, clear of the CoM handle at the midpoint. */
const GRAB = () => {
  const at = (id) => {
    const r = document.querySelector(`#joint_${id}`).closest('svg[x]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const B = at('B');
  const C = at('C');
  return { x: B.x + (C.x - B.x) / 3, y: B.y + (C.y - B.y) / 3 };
};

for (const engine of [chromium, webkit]) {
  const name = engine === chromium ? 'chromium' : 'webkit';
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.links.find((l) => l.id === 'BC'));
  });
  await page.waitForTimeout(600);

  const unpaired = await page.evaluate((grabSource) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joints = () =>
      JSON.stringify(grid.mechanismSrv.joints.map((j) => [j.id, Math.round(j.x), Math.round(j.y)]));
    const pan = () => JSON.stringify(grid.svgGrid.panZoomObject.getPan());
    const before = joints();
    const panBefore = pan();
    const p = new Function('return ' + grabSource)()();
    const target = document.elementFromPoint(p.x, p.y);
    const at = (x, y, buttons) => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons,
    });
    // The press with nothing before it — what Safari sends after its popup.
    target.dispatchEvent(new MouseEvent('mousedown', at(p.x, p.y, 1)));
    for (let i = 1; i <= 10; i++) {
      const x = p.x + i * 5;
      const y = p.y + i * 3;
      const move = { ...at(x, y, 1), pointerId: 1, pointerType: 'mouse' };
      target.dispatchEvent(new PointerEvent('pointermove', move));
      target.dispatchEvent(new MouseEvent('mousemove', at(x, y, 1)));
    }
    const up = { ...at(p.x + 50, p.y + 30, 0), pointerId: 1, pointerType: 'mouse' };
    target.dispatchEvent(new PointerEvent('pointerup', up));
    target.dispatchEvent(new MouseEvent('mouseup', at(p.x + 50, p.y + 30, 0)));
    return { target: target.tagName, linkMoved: joints() !== before, panned: pan() !== panBefore };
  }, GRAB.toString());

  check(`${name}: an unpaired mousedown drags the link`, unpaired.linkMoved, unpaired.target);
  check(`${name}: and does not pan the canvas instead`, !unpaired.panned);

  // The ordinary paired gesture must still work, and must not act twice.
  const paired = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    window.__downs = 0;
    document.addEventListener('pointerdown', () => (window.__downs += 1), true);
    return grid.mechanismSrv.joints.map((j) => [j.id, Math.round(j.x), Math.round(j.y)]);
  });
  const p = await page.evaluate(GRAB);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p.x + i * 5, p.y + i * 3);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterPaired = await page.evaluate(() => ({
    joints: ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.map((j) => [j.id, Math.round(j.x), Math.round(j.y)]),
    downs: window.__downs,
  }));
  check(
    `${name}: a normal drag still works`,
    JSON.stringify(paired) !== JSON.stringify(afterPaired.joints)
  );
  check(
    `${name}: and the browser's own pointerdown is not doubled`,
    afterPaired.downs === 1,
    `${afterPaired.downs} pointerdown(s)`
  );

  await browser.close();
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
