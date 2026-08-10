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
import { waitForReady } from './app-ready.mjs';

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

    // By name, not by position: the slider layer is ordered by how deep each
    // body sits in the stack, so the nth mark in the DOM is not the nth slider.
    sliders.forEach((slider) => {
      const mark = marks.find((node) => node.getAttribute('data-slider') === slider.id);
      if (!mark) return void bad.push(`${slider.id}: no mark`);
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
        const riders = pin.links.filter(
          (l) => l.constructor.name === 'RealLink' && l.constructor.name !== 'SliderBlock'
        );
        const far = riders[0]?.joints.find((j) => j.id !== pin.id);
        if (far) {
          // The plate is one unioned outline, so its point furthest from the
          // pin is the tip of whichever limb reaches furthest -- the rider's.
          // Reading a fixed index would read a capsule that no longer exists.
          const outline = (plate.getAttribute('d') ?? '').split(/(?=M)/)[0] ?? '';
          let tip = null;
          let reach = -1;
          for (const [, body] of outline.matchAll(/[MLQ]([^MLQAZ]*)/g)) {
            const values = (body.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
            if (values.length < 2) continue;
            const at = toModel(plate, values[values.length - 2], values[values.length - 1]);
            const distance = Math.hypot(at[0] - pin.x, at[1] - pin.y);
            if (distance > reach) {
              reach = distance;
              tip = at;
            }
          }
          // The outline traces the bar's edge, so it lands half a bar-width off
          // the joint itself; anything further means it points somewhere else.
          const off = tip ? Math.hypot(tip[0] - far.x, tip[1] - far.y) : Infinity;
          if (off > 0.4 * grid.settings.objectScale) {
            bad.push(
              `${slider.id}: plate tip ${tip?.map((n) => n.toFixed(2))} is ${off.toFixed(2)} from rider end ${far.id}`
            );
          }
        }
      }
    });

    // 3. a floating slot's channel follows the joints that define it
    for (const slider of sliders) {
      if (!slider.isFloating || !slider.isSlotWellFormed) continue;
      // Whichever element is drawing the carrier. A carrier that is also a
      // welded rider is drawn by its own weld plate instead of by the link
      // layer, and the channel is cut into that -- so looking only in the link
      // layer finds an empty path and reads it as a missing channel.
      const inLayer = document.querySelector(`#linkHolder path[id="${slider.carrier.id}"]`);
      const standIn = [
        ...document.querySelectorAll('#sliderHolder .slider-plate path, #sliderHolder path[id]'),
      ].find(
        (node) =>
          node.id === `${slider.carrier.id}__rider` ||
          (node.closest('.slider-plate') && (node.getAttribute('d') ?? '').includes('M'))
      );
      const carrier = inLayer?.getAttribute('d') ? inLayer : standIn;
      if (!carrier) {
        bad.push(`${slider.id}: carrier ${slider.carrier.id} not drawn`);
        continue;
      }
      if (inLayer && Number(inLayer.getAttribute('data-channels')) < 1) {
        bad.push(`${slider.id}: carrier ${slider.carrier.id} has no channel`);
      }
      const a = slider.slotJointA;
      const b = slider.slotJointB;
      const d = (carrier.getAttribute('d') ?? '').split(/(?=M)/).slice(1);
      const sub = d[d.length - 1];
      if (!sub) {
        bad.push(`${slider.id}: no channel subpath on ${slider.carrier.id}`);
        continue;
      }
      const nums = sub.match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) ?? [];
      if (nums.length < 11) continue;
      // orientedCapsulePath: M c0 L c1 A rx ry rot laf sf c2 L c3 A ... Z
      // so the corner opposite c0 is c2, and the arc's five parameters sit
      // between them -- reading indices 4,5 gets the radii, not a point.
      // Through the element's own transform: a plate emits its channels in the
      // slot's frame, so the raw numbers are not model coordinates there.
      const first = toModel(carrier, nums[0], nums[1]);
      const opposite = toModel(carrier, nums[9], nums[10]);
      const centre = [(first[0] + opposite[0]) / 2, (first[1] + opposite[1]) / 2];
      const want = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (Math.hypot(centre[0] - want[0], centre[1] - want[1]) > 0.05) {
        bad.push(
          `${slider.id}: channel centre ${centre.map((n) => n.toFixed(2))} not slot midpoint ${want.map((n) => n.toFixed(2))}`
        );
      }
    }

    // 5. a floating block is ON the line it rides.
    //
    // Distinct from 3: the channel can be drawn perfectly on the carrier while
    // the block sits off it, which is what dragging a slot's defining joint or
    // the carrier body used to leave behind -- the slider is deliberately not a
    // member of its carrier, so nothing that moved the carrier moved it.
    for (const slider of sliders) {
      if (!slider.isFloating || !slider.isSlotWellFormed) continue;
      const a = slider.slotJointA;
      const b = slider.slotJointB;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const off = Math.abs((slider.x - a.x) * (-dy / len) + (slider.y - a.y) * (dx / len));
      // 1e-3 of a *user* unit, not machine epsilon: joint coordinates come
      // back out of the URL at a fixed decimal precision in user units, and
      // the model is user units x 200 (src/app/model/render-scale.ts), so the
      // decode quantization is 200x larger in model units. The breakage this
      // catches measured 0.16 and 0.47 user units -- hundreds of times larger.
      if (off > 1e-3 * 200) {
        bad.push(`${slider.id}: block sits ${off.toFixed(4)} off its own slot line`);
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
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
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

/**
 * A point genuinely on a link's body. A link's bounding-box centre is mostly the
 * empty space inside its hull once it has three joints, so aiming there grabs
 * the canvas instead.
 */
const centreOfLink = (id) =>
  page.evaluate((linkId) => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const link = grid.mechanismSrv.getLinks().find((l) => l.id === linkId);
    if (!link || link.joints.length < 2) return null;
    const [a, b] = link.joints;
    const svg = document.querySelector('#canvas');
    const pt = svg.createSVGPoint();
    pt.x = (a.x + b.x) / 2;
    pt.y = (a.y + b.y) / 2;
    const screen = pt.matrixTransform(document.querySelector('#linkHolder').getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, id);

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
        checkThat(`${name}: joint ${id} dragged ${way}`, false, bad.slice(0, 2).join(' | '));
        await page.screenshot({
          path: `${OUT}/${name}-${id}-${way.replace('+', 'p').replace('-', 'm')}.png`,
        });
      }
    }
  }
  checkThat(
    `${name}: holds through every joint drag`,
    !results.some((r) => !r.ok && r.label.startsWith(`${name}: joint`))
  );

  // Links too: dragging a body translates every joint on it at once, which is a
  // different path through the code from dragging one joint, and a slot's
  // carrier moving wholesale is the case most likely to leave its channel
  // behind.
  const linkIds = await page.evaluate(() =>
    [...document.querySelectorAll('#linkHolder path[data-channels]')].map((n) => n.id)
  );
  for (const id of linkIds) {
    for (const [dx, dy, way] of [
      [70, 0, '+x'],
      [-70, 0, '-x'],
      [0, -70, '+y'],
      [0, 70, '-y'],
    ]) {
      const at = await centreOfLink(id);
      if (!at) continue;
      await drag(at, dx, dy);
      const bad = await violations();
      if (bad.length) {
        checkThat(`${name}: link ${id} dragged ${way}`, false, bad.slice(0, 2).join(' | '));
        await page.screenshot({ path: `${OUT}/${name}-link-${id}-${way.replace(/[+-]/, '')}.png` });
      }
    }
  }
  checkThat(
    `${name}: holds through every link drag`,
    !results.some((r) => !r.ok && r.label.startsWith(`${name}: link `))
  );

  // The reseat has to reach the solved timesteps, not just the pose on screen.
  // updateMechanism copies the current pose into every frame, so reseating after
  // it fixed the canvas and left Play snapping the block straight back off its
  // channel -- correct at rest, wrong the moment it moves.
  await load(query);
  const slotJoint = await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const slider = grid.mechanismSrv
      .getJoints()
      .find((j) => j.constructor.name === 'PrisJoint' && j.isFloating && j.isSlotWellFormed);
    return slider ? `joint_${slider.slotJointA.id}` : null;
  });
  if (slotJoint) {
    const at = await centreOf(`#${slotJoint}`);
    if (at) await drag(at, 110, -80);
    const framed = await page.evaluate(() => {
      const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
      const frames = grid.mechanismSrv.mechanisms[0]?.joints;
      if (!frames?.length) return null;
      const live = grid.mechanismSrv
        .getJoints()
        .find((j) => j.constructor.name === 'PrisJoint' && j.isFloating);
      if (!live) return null;
      const f = frames[0];
      const S = f.find((j) => j.id === live.id);
      const A = f.find((j) => j.id === live.slotJointA.id);
      const B = f.find((j) => j.id === live.slotJointB.id);
      if (!S || !A || !B) return null;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const L = Math.hypot(dx, dy);
      return Math.abs((S.x - A.x) * (-dy / L) + (S.y - A.y) * (dx / L));
    });
    checkThat(
      `${name}: the reseat reaches frame zero, not just the canvas`,
      framed === null || framed < 1e-3,
      framed === null ? 'no frames' : framed.toFixed(6)
    );
  }

  // Independence: dragging something unrelated to a slot must leave that slot's
  // block exactly where it was. Reseating has to be a no-op for every slider
  // whose slot did not move, or "drag one thing" quietly becomes "drag
  // everything a little".
  await load(query);
  const sliderPoseNow = () =>
    page.evaluate(() => {
      const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
      return grid.mechanismSrv
        .getJoints()
        .filter((j) => j.constructor.name === 'PrisJoint')
        .map((j) => `${j.id}:${j.x},${j.y}`)
        .join('|');
    });
  const unrelated = await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const sliders = grid.mechanismSrv.getJoints().filter((j) => j.constructor.name === 'PrisJoint');
    const touched = new Set();
    for (const s of sliders) {
      // A slider's own pin counts as touched whether the slot floats or not --
      // a grounded guide still travels with the joint it sits on, so dragging
      // that joint moving the block is the correct answer, not a violation.
      s.links
        .find((l) => l.constructor.name === 'SliderBlock')
        ?.joints.forEach((j) => touched.add(j.id));
      if (!s.isFloating) continue;
      touched.add(s.slotJointA.id);
      touched.add(s.slotJointB.id);
      s.carrier.joints.forEach((j) => touched.add(j.id));
    }
    return grid.mechanismSrv
      .getJoints()
      .filter((j) => j.constructor.name === 'RevJoint' && !touched.has(j.id))
      .map((j) => `joint_${j.id}`);
  });
  if (unrelated.length) {
    const before = await sliderPoseNow();
    const at = await centreOf(`#${unrelated[0]}`);
    if (at) await drag(at, 80, 0);
    const after = await sliderPoseNow();
    checkThat(
      `${name}: dragging ${unrelated[0]} leaves every slot's block alone`,
      before === after,
      `${before}  ->  ${after}`
    );
  }

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
