/**
 * The Lock feature, exercised the way a hand would: lock a link and watch its
 * drag refuse with an Unlock in the message; lock one joint and watch a link
 * drag become a swing about it; undo a lock, which proves the mark rides the
 * URL; leave Edit and watch the black marks stand down.
 *
 *   PMKS_BASE_URL=<origin> node e2e/locking.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4700';

const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

// An inverted slider-crank: block P rides a slot cut into the grounded lever
// CD, and pin B on the crank is the block's other half. The three trailing
// tokens on joint P are the carrier and the two joints that cut its slot.
const INVERTED_SLIDER_CRANK =
  '2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,0,Fe,0.KC,C,ku,0,0.GD,D,0RF,Oj,0.HP,P,0,Fe,0,CD,C,D..' +
  'YRAB,AB,Fe,Fe,0,7q,555555,A,B,,.YRCD,CD,Fe,Fe,Fe,Fe,555555,C,D,,.YPBP,BP,Fe,0,0,0,,B,P,,...N_r';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const grid = () => `ng.getComponent(document.querySelector('app-new-grid'))`;

const jointOnScreen = (id) =>
  page.evaluate((jointId) => {
    const el = document.querySelector(`#joint_${jointId}`)?.closest('svg[x]');
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, id);

const jointModel = (id) =>
  page.evaluate((jointId) => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = c.mechanismSrv.joints.find((j) => j.id === jointId);
    return { x: joint.x, y: joint.y };
  }, id);

const dragBy = async (from, dx, dy, steps = 10) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + (dx * step) / steps, from.y + (dy * step) / steps);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
};

await page.goto(`${BASE}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitForReady(page);
await page.waitForTimeout(400);

// --- Lock a link from the service, as the menu item does -------------------

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.links.find((l) => l.id === 'BC'));
});
await page.waitForTimeout(200);

record(
  'a locked link puts a padlock badge on each of its joints',
  await page.evaluate(() => document.querySelectorAll('#jointHolder .lockBadge').length === 2)
);
record(
  'the held joints carry the state class for tooling',
  await page.evaluate(
    () =>
      document.querySelector('#joint_B').classList.contains('joint-locked') &&
      document.querySelector('#joint_C').classList.contains('joint-locked')
  )
);

// --- A plain click is a selection, not an offence ---------------------------

const bClick = await jointOnScreen('B');
await page.mouse.click(bClick.x, bClick.y);
await page.waitForTimeout(400);
record(
  'a plain click on a held joint selects it without a scolding',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    // The zoom warning may legitimately stand; what must NOT appear is a
    // lock refusal for a gesture that never tried to move anything.
    return (
      c.notify.live.every((one) => !one.id.startsWith('lock.')) &&
      c.activeObjService.getSelectedObj()?.id === 'B'
    );
  })
);

// --- A drag on a held joint refuses, and the message carries the way out ---

const bBefore = await jointModel('B');
await dragBy(await jointOnScreen('B'), 90, -60);
const bAfter = await jointModel('B');
record('dragging a held joint moves nothing', bBefore.x === bAfter.x && bBefore.y === bAfter.y, {
  bBefore,
  bAfter,
});
record(
  'the refusal stands in the stack with an Unlock button',
  await page.evaluate(() => {
    const action = [...document.querySelectorAll('.notificationAction')].find(
      (b) => b.textContent.trim() === 'Unlock'
    );
    return !!action;
  })
);

// --- The Unlock button clears exactly the mark that held the gesture -------
// One lock layer: "lock link BC" marked joints B and C, and freeing B is all
// this refusal's Unlock does — C stays held, which is the whole point of the
// marks living on joints.

await page.locator('.notificationAction', { hasText: 'Unlock' }).first().click();
await page.waitForTimeout(200);
record(
  'Unlock frees the refused joint and only it',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = (id) => c.mechanismSrv.joints.find((j) => j.id === id);
    return !joint('B').locked && joint('C').locked;
  })
);
await dragBy(await jointOnScreen('B'), 60, -40);
const bMoved = await jointModel('B');
record('the same drag now moves the joint', bMoved.x !== bBefore.x || bMoved.y !== bBefore.y, {
  bBefore,
  bMoved,
});

// --- Undo takes a lock back: the mark rides the URL ------------------------

const cBeforeToggle = await page.evaluate(
  () =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.find((j) => j.id === 'C').locked
);
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'C'));
});
await page.waitForTimeout(200);
const cAfterToggle = await page.evaluate(
  () =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.find((j) => j.id === 'C').locked
);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
const cAfterUndo = await page.evaluate(
  () =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.find((j) => j.id === 'C').locked
);
record(
  'Ctrl+Z undoes a lock toggle, so the mark is really in the URL',
  cAfterToggle !== cBeforeToggle && cAfterUndo === cBeforeToggle,
  { cBeforeToggle, cAfterToggle, cAfterUndo }
);

// --- One held joint turns a link drag into a swing about it ----------------
// From a clean slate: exactly one mark, on B.

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.setAllLocks(false);
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'B'));
});
await page.waitForTimeout(200);

const before = { b: await jointModel('B'), c: await jointModel('C') };
const lengthBefore = Math.hypot(before.c.x - before.b.x, before.c.y - before.b.y);
// Grab the middle of the coupler BC and pull sideways.
const bScreen = await jointOnScreen('B');
const cScreen = await jointOnScreen('C');
// A third of the way along, not the middle: a selected link wears its
// centre-of-mass handle at its centroid, which for a two-joint bar is exactly
// the middle -- so a grab there takes hold of the centre of mass rather than
// the body. Anywhere else on the bar is the body.
const grab = {
  x: bScreen.x + (cScreen.x - bScreen.x) / 3,
  y: bScreen.y + (cScreen.y - bScreen.y) / 3,
};
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.activeObjService.updateSelectedObj(c.mechanismSrv.links.find((l) => l.id === 'BC'));
});
await dragBy(grab, 0, 120, 14);
const after = { b: await jointModel('B'), c: await jointModel('C') };
const lengthAfter = Math.hypot(after.c.x - after.b.x, after.c.y - after.b.y);

record(
  'the held joint stays exactly still through the swing',
  before.b.x === after.b.x && before.b.y === after.b.y,
  {
    before: before.b,
    after: after.b,
  }
);
record(
  'the free end actually swung',
  Math.hypot(after.c.x - before.c.x, after.c.y - before.c.y) > 1,
  {
    before: before.c,
    after: after.c,
  }
);
record('the body kept its length through the swing', Math.abs(lengthAfter - lengthBefore) < 1e-3, {
  lengthBefore,
  lengthAfter,
});

// --- Two held joints leave the body nowhere to go --------------------------

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'C'));
});
await page.waitForTimeout(200);
const pinned = { b: await jointModel('B'), c: await jointModel('C') };
await dragBy(grab, 60, 60);
const pinnedAfter = { b: await jointModel('B'), c: await jointModel('C') };
record(
  'two held joints refuse the whole drag',
  pinned.b.x === pinnedAfter.b.x && pinned.c.x === pinnedAfter.c.x,
  { pinned, pinnedAfter }
);

// --- No back door: dragJoint itself holds a held joint ---------------------
// The canvas gate and the panel's greyed fields are UI; every route to "move
// this joint" — a neighbour's distance field, the linkage table — lands on
// dragJoint, so dragJoint is where the lock has to hold whoever asks.

const cHeld = await jointModel('C');
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.gridUtils.dragJoint(
    c.mechanismSrv.joints.find((j) => j.id === 'C'),
    { x: 999, y: 999 }
  );
});
const cStill = await jointModel('C');
record(
  'dragJoint itself refuses a held joint, whoever calls it',
  cHeld.x === cStill.x && cHeld.y === cStill.y,
  { cHeld, cStill }
);

// --- A lock on a block is parametric: it holds a place on the slot ---------
// The one mark that is not about a point on the drawing. A block has exactly
// one freedom -- where it sits along its slot -- and that is what its mark
// spends. The channel stays free to move and takes the block with it.

await page.goto(`${BASE}/?${INVERTED_SLIDER_CRANK}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(400);
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'B'));
});
await page.waitForTimeout(200);

record(
  'locking a block holds it and its pin, and nothing else',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return [...c.gridUtils.frozenJointIds()].sort().join('') === 'BP';
  }),
  await page.evaluate(() =>
    [...ng.getComponent(document.querySelector('app-new-grid')).gridUtils.frozenJointIds()].sort()
  )
);

// The block is drawn on the pin, so the two are one target; whichever the
// canvas hands the drag, the refusal has to speak about the slot.
const blockBefore = await jointModel('P');
await dragBy(await jointOnScreen('B'), 70, 40);
const blockAfter = await jointModel('P');
record(
  'dragging the block itself moves nothing',
  blockBefore.x === blockAfter.x && blockBefore.y === blockAfter.y,
  { blockBefore, blockAfter }
);
record(
  'and the refusal says what is actually held: its place in the slot',
  await page.evaluate(() =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .notify.live.some((one) => one.id === 'lock.joint' && /place in the slot/.test(one.text))
  ),
  await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).notify.live.map((one) => one.text)
  )
);

// The joints that cut the slot are not held by the block's mark. Dragging one
// swings the channel, and the reseat carries the block along it.
const slotBefore = { c: await jointModel('C'), p: await jointModel('P') };
await dragBy(await jointOnScreen('C'), 0, -70);
const slotAfter = { c: await jointModel('C'), p: await jointModel('P') };
record(
  'a joint that cuts the slot still moves with the block locked',
  Math.hypot(slotAfter.c.x - slotBefore.c.x, slotAfter.c.y - slotBefore.c.y) > 1,
  { slotBefore: slotBefore.c, slotAfter: slotAfter.c }
);
record(
  'and the block rides along rather than staying behind on the grid',
  Math.hypot(slotAfter.p.x - slotBefore.p.x, slotAfter.p.y - slotBefore.p.y) > 1,
  { slotBefore: slotBefore.p, slotAfter: slotAfter.p }
);

// A locked block is no reason to refuse a drag of the link it rides, and no
// reason to pivot that link about it: the body translates, both ends equally.
// Grabbed at the middle of the bar, which is the middle of the slot -- the one
// place a hand naturally aims at and the one place a hole would swallow.
const carrierBefore = { c: await jointModel('C'), d: await jointModel('D') };
const cSlot = await jointOnScreen('C');
const dSlot = await jointOnScreen('D');
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.activeObjService.updateSelectedObj(c.mechanismSrv.links.find((l) => l.id === 'CD'));
});
await dragBy({ x: (cSlot.x + dSlot.x) / 2, y: (cSlot.y + dSlot.y) / 2 }, 50, 0, 12);
const carrierAfter = { c: await jointModel('C'), d: await jointModel('D') };
const moved = {
  c: { x: carrierAfter.c.x - carrierBefore.c.x, y: carrierAfter.c.y - carrierBefore.c.y },
  d: { x: carrierAfter.d.x - carrierBefore.d.x, y: carrierAfter.d.y - carrierBefore.d.y },
};
record(
  'the link the block rides drags by its slot, as a body rather than a swing',
  Math.hypot(moved.c.x, moved.c.y) > 1 &&
    Math.abs(moved.c.x - moved.d.x) < 1e-6 &&
    Math.abs(moved.c.y - moved.d.y) < 1e-6,
  moved
);

// --- The marks are an Edit affordance: Analysis paints clean ---------------

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.tabService.setTab(2); // TabID.ANALYZE
});
await page.waitForTimeout(300);
record(
  'lock badges stand down outside Edit',
  await page.evaluate(
    () => document.querySelectorAll('.lockBadge, .joint-locked, .link-locked').length === 0
  )
);

record('no page errors the whole way through', errors.length === 0, errors);

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
