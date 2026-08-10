// Sticky slot release + axis snapping, driven by mouse.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';

const YOKE =
  '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.OC,C,Fe,0VG,0.GD,D,Fe,Fe,0.HE,E,Fe,0,0,CD,C,D.LF,F,Fe,0VG,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,Fe,07q,303e9f,C,D,,.YPBE,BE,Fe,0,0,0,,B,E,,.YPCF,CF,Fe,0,0,0,,C,F,,...N_V';
const COUPLER =
  '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.GC,C,d4,ec,0.KD,D,_W,0,0.KE,E,VG,7q,0.GF,F,bo,cO,0.HP,P,bo,cO,0,BC,B,C..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRBC,BC,Fe,Fe,RM,KJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,oo,KJ,0d125a,C,D,,.YREF,EF,Fe,Fe,YX,N6,B2DFDB,E,F,,.YPFP,FP,Fe,0,0,0,,F,P,,...N_L';

const out = [];
const check = (name, ok, detail = '') => {
  out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const load = async (query) => {
  await page.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
};
const screenOf = (x, y) =>
  page.evaluate(
    ([mx, my]) => {
      const holder = document.querySelector('#linkHolder');
      const svg = holder.ownerSVGElement;
      const p = svg.createSVGPoint();
      p.x = mx;
      p.y = my;
      const s = p.matrixTransform(holder.getScreenCTM());
      return { x: s.x, y: s.y };
    },
    [x, y]
  );
const jointAt = (id) =>
  page.evaluate((jid) => {
    const el = document.querySelector(`#joint_${jid}`);
    if (!el) return null;
    const svg = el.closest('svg[x]');
    return { x: Number(svg.getAttribute('x')), y: Number(svg.getAttribute('y')) };
  }, id);
const drag = async (from, to, steps = 20) => {
  const a = await screenOf(from.x, from.y);
  const b = await screenOf(to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    await page.waitForTimeout(20);
  }
  return { a, b };
};
const state = () =>
  page.evaluate(() => ({
    dangling: document.querySelectorAll('.dangling-block').length,
    guides: document.querySelectorAll('.axisSnapGuide').length,
    marks: document.querySelectorAll('#sliderHolder .slider-mark').length,
  }));

// Model coordinates are user units x 200 (src/app/model/render-scale.ts);
// the drag intents and position thresholds below are user-unit quantities.
const MS = 200;

// --- 6. sticky, then release ---------------------------------------------
await load(YOKE);
let before = await state();
check('yoke starts with no dangling block', before.dangling === 0, JSON.stringify(before));

// A modest sideways nudge must NOT drop the block out of its slot.
let block = await jointAt('B');
await drag(block, { x: block.x + 0.25 * MS, y: block.y + 0.4 * MS });
let mid = await state();
await page.mouse.up();
await page.waitForTimeout(400);
check(
  'a small sideways wobble keeps the block in its slot',
  mid.dangling === 0,
  JSON.stringify(mid)
);
let after = await jointAt('B');
check(
  'the block still slid along the slot',
  Math.abs(after.x - block.x) < 0.05 * MS && Math.abs(after.y - block.y) > 0.1 * MS,
  JSON.stringify(after)
);

// Pulling clear of the bar releases it.
await load(YOKE);
block = await jointAt('B');
await drag(block, { x: block.x + 2.2 * MS, y: block.y + 0.3 * MS }, 24);
mid = await state();
await page.mouse.up();
await page.waitForTimeout(500);
after = await state();
check('pulling the block clear of the bar releases it', mid.dangling === 1, JSON.stringify(mid));
check('and it stays released after the drop', after.dangling === 1, JSON.stringify(after));
const pos = await jointAt('B');
check('the released block follows the cursor off the slot', pos.x > 2.4 * MS, JSON.stringify(pos));

// --- 12. axis snapping ----------------------------------------------------
await load(COUPLER);
const target = await jointAt('C');
const moving = await jointAt('D');
// Aim just off C's x axis; the snap should close the gap exactly.
await drag(moving, { x: target.x + 0.02 * MS, y: moving.y - 0.6 * MS }, 24);
const guiding = await state();
const landed = await jointAt('D');
await page.mouse.up();
await page.waitForTimeout(300);
check(
  'a near-vertical drag lands exactly on the other joint x',
  landed.x === target.x,
  `D.x=${landed.x} C.x=${target.x}`
);
check('and says which joint it squared against', guiding.guides >= 1, JSON.stringify(guiding));

const cleared = await state();
check('the guide goes away on release', cleared.guides === 0, JSON.stringify(cleared));

// Far from any axis, nothing snaps.
await load(COUPLER);
const free = await jointAt('D');
await drag(free, { x: free.x + 1.37 * MS, y: free.y + 0.83 * MS }, 20);
const nothing = await state();
await page.mouse.up();
check('an unaligned drag snaps to nothing', nothing.guides === 0, JSON.stringify(nothing));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(out.join('\n'));
console.log(
  `\n${out.filter((line) => line.startsWith('PASS')).length}/${out.length} checks passed`
);
await browser.close();
process.exit(out.some((line) => line.startsWith('FAIL')) ? 1 : 0);
