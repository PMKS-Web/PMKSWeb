// The marks, checked against the mechanism rather than against a screenshot.
//
// Four things have to be true of every slider mark, in every pose, at every
// object scale. They are cheap to state and they catch the whole family of
// "it looks weird" defects at once -- a mark drawn in the wrong frame, a block
// that stops following its slot when the joints defining it move, geometry that
// stops tracking when the scale changes:
//
//   1. the block sits on its pin
//   2. the block's long axis runs along the slot
//   3. a floating slot's channel is centred between the joints that define it,
//      and points the same way
//   4. a weld plate reaches the joint its rider reaches
//
// Then the same four are re-checked after dragging every joint in four
// directions and after changing the object scale, because the failures reported
// by hand were all "fine at rest, wrong once you touch it".
//
//   PMKS_PLAYWRIGHT_DIR=<dir> node e2e/phase4-invariants.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const OUT = 'artifacts/phase4-invariants';

const MECHANISMS = {
  'scotch-yoke':
    '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.OC,C,Fe,0VG,0.GD,D,Fe,Fe,0.HE,E,Fe,0,0,CD,C,D.LF,F,Fe,0VG,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,Fe,07q,303e9f,C,D,,.YPBE,BE,Fe,0,0,0,,B,E,,.YPCF,CF,Fe,0,0,0,,C,F,,...N_V',
  'inverted-slider-crank':
    '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,0,Fe,0.KC,C,ku,0,0.GD,D,0RF,Oj,0.HP,P,0,Fe,0,CD,C,D..YRAB,AB,Fe,Fe,0,7q,c5cae9,A,B,,.YRCD,CD,Fe,Fe,9q,CN,303e9f,C,D,,.YPBP,BP,Fe,0,0,0,,B,P,,...N_r',
  'four-bar-slotted-coupler':
    '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.GC,C,d4,ec,0.KD,D,_W,0,0.KE,E,VG,7q,0.GF,F,bo,cO,0.HP,P,bo,cO,0,BC,B,C..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRBC,BC,Fe,Fe,RM,KJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,oo,KJ,0d125a,C,D,,.YREF,EF,Fe,Fe,YX,N6,B2DFDB,E,F,,.YPFP,FP,Fe,0,0,0,,F,P,,...N_L',
  'elliptical-trammel':
    '?2P.Fe.K,0.1011.GA,A,Fe,0,0.GB,B,0,Fe,0.LC,C,Fe,0,0.LD,D,0,Fe,OZ..YRAB,AB,Fe,Fe,7q,7q,c5cae9,A,B,,.YPAC,AC,Fe,0,0,0,,A,C,,.YPBD,BD,Fe,0,0,0,,B,D,,...N_Q',
};

const results = [];
const consoleErrors = [];

function checkThat(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });

/**
 * Every way the drawing currently disagrees with the mechanism.
 *
 * Marks are measured by mapping points out of their own group and into the
 * holder's frame, so this tests the transform the browser actually applied
 * rather than the numbers that went into it.
 */
const violations = () =>
  page.evaluate(() => {
    const holder = document.querySelector('#sliderHolder');
    const svg = document.querySelector('#canvas');
    const grid = window.ng?.getComponent?.(document.querySelector('app-new-grid'));
    if (!grid || !holder) return ['no component'];
    const joints = grid.mechanismSrv.getJoints();
    const TOL = 1e-3;
    const bad = [];

    const toModel = (el, x, y) => {
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const m = pt.matrixTransform(holder.getScreenCTM().inverse().multiply(el.getScreenCTM()));
      return [m.x, m.y];
    };
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < TOL;
    const unit = (v) => {
      const n = Math.hypot(v[0], v[1]);
      return n < 1e-12 ? [0, 0] : [v[0] / n, v[1] / n];
    };

    const marks = [...document.querySelectorAll('#sliderHolder .slider-mark')];
    const sliders = joints.filter((j) => j.constructor.name === 'PrisJoint');
    if (marks.length !== sliders.length) {
      bad.push(`mark count ${marks.length} != slider count ${sliders.length}`);
      return bad;
    }

    marks.forEach((mark, i) => {
      const slider = sliders[i];
      const block = mark.querySelector('.slider-block path');
      if (!block) return void bad.push(`${slider.id}: no block`);

      const pin = slider.links
        .find((l) => l.constructor.name === 'SliderBlock')
        ?.joints.find((j) => j.constructor.name !== 'PrisJoint');
      if (!pin) return void bad.push(`${slider.id}: no pin`);

      // 1. the block sits on its pin
      const origin = toModel(block, 0, 0);
      if (!near(origin, [pin.x, pin.y])) {
        bad.push(
          `${slider.id}: block at ${origin.map((n) => n.toFixed(3))} not pin ${[pin.x, pin.y]}`
        );
      }

      // 2. the block's long axis runs along the slot
      const along = unit([
        toModel(block, 1, 0)[0] - origin[0],
        toModel(block, 1, 0)[1] - origin[1],
      ]);
      const want = [Math.cos(slider.slotAngle), Math.sin(slider.slotAngle)];
      const parallel = Math.abs(along[0] * want[0] + along[1] * want[1]);
      if (Math.abs(parallel - 1) > 1e-3) {
        bad.push(
          `${slider.id}: block axis ${along.map((n) => n.toFixed(3))} not along slot ${want.map((n) => n.toFixed(3))}`
        );
      }

      // 4. a weld plate reaches the joint its rider reaches
      const plate = mark.querySelector('.slider-plate path');
      if (plate) {
        const riders = pin.links.filter((l) => l.constructor.name === 'RealLink');
        const far = riders[0]?.joints.find((j) => j.id !== pin.id);
        if (far) {
          const nums =
            (plate.getAttribute('d') ?? '').match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) ?? [];
          const tip = toModel(plate, nums[2], nums[3]);
          // The path traces the capsule edge, so it lands half a bar-width off
          // the joint itself; anything further means it points somewhere else.
          const off = Math.hypot(tip[0] - far.x, tip[1] - far.y);
          if (off > 0.4 * grid.settings.objectScale) {
            bad.push(
              `${slider.id}: plate tip ${tip.map((n) => n.toFixed(2))} is ${off.toFixed(2)} from rider end ${far.id}`
            );
          }
        }
      }
    });

    // 3. a floating slot's channel follows the joints that define it
    for (const slider of sliders) {
      if (!slider.isFloating || !slider.isSlotWellFormed) continue;
      const carrier = document.querySelector(`#linkHolder path[id="${slider.carrier.id}"]`);
      if (!carrier) {
        bad.push(`${slider.id}: carrier ${slider.carrier.id} not drawn`);
        continue;
      }
      if (Number(carrier.getAttribute('data-channels')) < 1) {
        bad.push(`${slider.id}: carrier ${slider.carrier.id} has no channel`);
      }
      const a = slider.slotJointA;
      const b = slider.slotJointB;
      const d = (carrier.getAttribute('d') ?? '').split(/(?=M)/).slice(1);
      const sub = d[d.length - 1];
      const nums = sub.match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) ?? [];
      if (nums.length < 11) continue;
      // orientedCapsulePath: M c0 L c1 A rx ry rot laf sf c2 L c3 A ... Z
      // so the corner opposite c0 is c2, and the arc's five parameters sit
      // between them -- reading indices 4,5 gets the radii, not a point.
      const centre = [(nums[0] + nums[9]) / 2, (nums[1] + nums[10]) / 2];
      const want = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (Math.hypot(centre[0] - want[0], centre[1] - want[1]) > 0.05) {
        bad.push(
          `${slider.id}: channel centre ${centre.map((n) => n.toFixed(2))} not slot midpoint ${want.map((n) => n.toFixed(2))}`
        );
      }
    }

    // Nothing may render a NaN.
    for (const node of document.querySelectorAll(
      '#sliderHolder path, #railHolder line, #linkHolder path'
    )) {
      const value = node.getAttribute('d') ?? node.getAttribute('x1') ?? '';
      if (/NaN|Infinity/.test(String(value)))
        bad.push(`NaN in ${node.getAttribute('class') ?? node.tagName}`);
    }
    return bad;
  });

async function load(query) {
  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sliderHolder', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(600);
}

const centreOf = (selector) =>
  page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, selector);

async function drag(from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(from.x + (dx * i) / 14, from.y + (dy * i) / 14);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

for (const [name, query] of Object.entries(MECHANISMS)) {
  console.log(`\n${name}`);
  await load(query);
  checkThat(
    `${name}: holds at rest`,
    (await violations()).length === 0,
    (await violations()).join(' | ')
  );

  // Every joint, every direction. The failures reported by hand were all
  // "fine at rest, wrong once you touch it" -- and dragging a joint that
  // *defines* a slot is the case most likely to leave the block behind.
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('#jointHolder [id^="joint_"]')].map((n) => n.id)
  );
  for (const id of ids) {
    for (const [dx, dy, way] of [
      [90, 0, '+x'],
      [-90, 0, '-x'],
      [0, 90, '-y'],
      [0, -90, '+y'],
    ]) {
      const at = await centreOf(`#${id}`);
      if (!at) continue;
      await drag(at, dx, dy);
      const bad = await violations();
      if (bad.length) {
        checkThat(`${name}: ${id} dragged ${way}`, false, bad.slice(0, 2).join(' | '));
        await page.screenshot({
          path: `${OUT}/${name}-${id}-${way.replace('+', 'p').replace('-', 'm')}.png`,
        });
      }
    }
  }
  checkThat(
    `${name}: holds through every joint drag`,
    !results.some((r) => !r.ok && r.label.startsWith(`${name}: `) && r.label.includes('dragged'))
  );

  // Object scale is a global setting; slotted links were reported to break when
  // it changes. Everything here is a multiple of R = 0.15 * objectScale, so a
  // scale change must move every mark together.
  await load(query);
  for (const scale of [0.5, 2, 4]) {
    await page.evaluate((s) => {
      const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
      // Through the BehaviorSubject the Settings panel writes to. `objectScale`
      // is a getter with no setter, so assigning to it silently does nothing --
      // which is how this check came to pass without changing anything.
      grid.settings.constructor._objectScale.next(s);
      window.ng.applyChanges(grid);
    }, scale);
    await page.waitForTimeout(400);
    const bad = await violations();
    if (
      !checkThat(
        `${name}: holds at object scale ${scale}`,
        bad.length === 0,
        bad.slice(0, 2).join(' | ')
      )
    ) {
      await page.screenshot({ path: `${OUT}/${name}-scale-${scale}.png` });
    }
  }
}

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
