// Paint order, the block staying in its channel, and the right-click menu
// agreeing with the Edit panel.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';

const YOKE =
  '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.OC,C,Fe,0VG,0.GD,D,Fe,Fe,0.HE,E,Fe,0,0,CD,C,D.LF,F,Fe,0VG,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,Fe,07q,303e9f,C,D,,.YPBE,BE,Fe,0,0,0,,B,E,,.YPCF,CF,Fe,0,0,0,,C,F,,...N_V';
const COUPLER =
  '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.GC,C,d4,ec,0.KD,D,_W,0,0.KE,E,VG,7q,0.GF,F,bo,cO,0.HP,P,bo,cO,0,BC,B,C..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRBC,BC,Fe,Fe,RM,KJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,oo,KJ,0d125a,C,D,,.YREF,EF,Fe,Fe,YX,N6,B2DFDB,E,F,,.YPFP,FP,Fe,0,0,0,,F,P,,...N_L';

const out = [];
const check = (name, ok, detail = '') =>
  out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const load = async (q) => {
  await page.goto(`${BASE}/${q}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
};
const screenOf = (x, y) =>
  page.evaluate(
    ([mx, my]) => {
      const h = document.querySelector('#linkHolder');
      const p = h.ownerSVGElement.createSVGPoint();
      p.x = mx;
      p.y = my;
      const s = p.matrixTransform(h.getScreenCTM());
      return { x: s.x, y: s.y };
    },
    [x, y]
  );
const jointAt = (id) =>
  page.evaluate((j) => {
    const svg = document.querySelector(`#joint_${j}`)?.closest('svg[x]');
    return svg ? { x: Number(svg.getAttribute('x')), y: Number(svg.getAttribute('y')) } : null;
  }, id);
const clickJoint = async (id) => {
  const b = await page.evaluate((j) => {
    const r = document.querySelector(`#joint_${j}`)?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, id);
  if (!b) return false;
  await page.mouse.move(b.x, b.y);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(600);
  return true;
};

// --- layering ------------------------------------------------------------
await load(YOKE);
const order = await page.evaluate(() =>
  [
    ...document.querySelectorAll(
      '#sliderHolder .slider-block, #sliderHolder .slider-plate, #sliderHolder path[id]'
    ),
  ].map((n) =>
    n.id ? 'rider:' + n.id : n.getAttribute('class').includes('block') ? 'block' : 'plate'
  )
);
check(
  'a carrier that is also a rider draws under the block riding it',
  order.indexOf('plate') < order.lastIndexOf('block') &&
    order.lastIndexOf('block') < order.findIndex((n) => n.startsWith('rider:')),
  JSON.stringify(order)
);

// --- the block stays in its slot when the carrier is dragged --------------
await load(COUPLER);
const slotOf = () =>
  page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const s = c.mechanismSrv.joints.find((j) => j.constructor.name === 'PrisJoint');
    if (!s?.isFloating) return null;
    const a = s.slotJointA;
    const b = s.slotJointB;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const along = (s.x - mx) * ux + (s.y - my) * uy;
    const across = -(s.x - mx) * uy + (s.y - my) * ux;
    const objectScale = c.settings.objectScale;
    const half = Math.max(len / 2 - 2.8 * 0.15 * objectScale, 3.84 * 0.15 * objectScale);
    return { along: Number(along.toFixed(4)), across: Number(across.toFixed(6)), half };
  });

// Model coordinates are user units x 200 (src/app/model/render-scale.ts);
// the drag intents and the on-slot tolerance are user-unit quantities.
const MODEL_SCALE = 200;
let worst = 0;
for (const [dx, dy] of [
  [2.4 * MODEL_SCALE, 1.8 * MODEL_SCALE],
  [-3.1 * MODEL_SCALE, 0.6 * MODEL_SCALE],
  [0.4 * MODEL_SCALE, -2.7 * MODEL_SCALE],
]) {
  await load(COUPLER);
  // Drag a joint that defines the slot, dragging the channel out from under it.
  const from = await jointAt('B');
  const a = await screenOf(from.x, from.y);
  const b = await screenOf(from.x + dx, from.y + dy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 16, a.y + ((b.y - a.y) * i) / 16);
    await page.waitForTimeout(25);
    const s = await slotOf();
    if (s) worst = Math.max(worst, Math.abs(s.along) - s.half, Math.abs(s.across));
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const settled = await slotOf();
  if (settled)
    worst = Math.max(worst, Math.abs(settled.along) - settled.half, Math.abs(settled.across));
}
check(
  'the block never leaves its channel while the slot is dragged',
  worst / MODEL_SCALE < 1e-3,
  `worst overshoot ${worst.toExponential(2)} (model units)`
);

// --- the menu agrees with the panel --------------------------------------
await load(COUPLER);
await clickJoint('F');
const menu = await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = c.mechanismSrv.joints.find((j) => j.id === 'F');
  c.setLastRightClick(joint);
  return c.cMenuItems.map((i) => ({ label: i.label ?? i.name ?? '?', disabled: i.disabled }));
});
const item = (text) => menu.find((m) => String(m.label).includes(text));
check(
  'Ground is offered on a slider, as the panel offers it',
  item('Ground') && !item('Ground').disabled,
  JSON.stringify(menu)
);
check(
  'Weld is offered, and refused with a reason rather than greyed',
  item('Weld') ? !item('Weld').disabled : !!item('Unweld') && !item('Unweld').disabled,
  JSON.stringify(menu)
);
check('Input follows the panel rule on a slider', item('Input') && !item('Input').disabled);

// --- weld is greyed where there is nothing to fuse ------------------------
// E connects exactly one link (EF), so a weld has nothing to restructure; the
// menu item and the panel's toggle both grey out through the same predicate.
await clickJoint('E');
const menuE = await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = c.mechanismSrv.joints.find((j) => j.id === 'E');
  c.setLastRightClick(joint);
  return {
    items: c.cMenuItems.map((i) => ({ label: i.label ?? '?', disabled: i.disabled })),
    links: joint.links.length,
    weldControlDisabled: (() => {
      const panel = document.querySelector('app-edit-panel');
      const cmp = panel ? ng.getComponent(panel) : null;
      return cmp ? cmp.jointForm.get('weld').disabled : null;
    })(),
  };
});
const weldE = menuE.items.find((m) => String(m.label).includes('Weld'));
check(
  'Weld is greyed on a joint with one link',
  menuE.links === 1 && !!weldE && weldE.disabled === true,
  JSON.stringify(menuE)
);
check(
  "and the panel's toggle is disabled by the same rule",
  menuE.weldControlDisabled !== false,
  JSON.stringify(menuE.weldControlDisabled)
);

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
console.log(out.join('\n'));
console.log(`\n${out.filter((l) => l.startsWith('PASS')).length}/${out.length} checks passed`);
await browser.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
