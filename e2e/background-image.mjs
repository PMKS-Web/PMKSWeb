/**
 * The background image, exercised the way a hand would: right-click the grid,
 * pick a picture, watch it land behind the linkage, move and resize and fade it
 * from the panel, prove it cannot be clicked or dragged, prove it rides the
 * grid's own zoom, and delete it.
 *
 *   PMKS_BASE_URL=<origin> node e2e/background-image.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4710';
const SHOTS = new URL('../artifacts/background-image/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const image = () =>
  page.evaluate(() => {
    const el = document.querySelector('#backgroundImageHolder image');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Number(el.getAttribute('x')),
      y: Number(el.getAttribute('y')),
      width: Number(el.getAttribute('width')),
      height: Number(el.getAttribute('height')),
      opacity: Number(el.getAttribute('opacity')),
      rotationDeg:
        (ng.getComponent(document.querySelector('app-new-grid')).bgImage.image().rotationRad *
          180) /
        Math.PI,
      screen: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });

const menuLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#contextMenu #menu-item')].map((item) => item.innerText.trim())
  );

const closeMenu = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
};

/** Type into one of the panel's fields and blur, which is when it commits. */
const typeField = async (label, value) => {
  const field = page
    .locator('input-block, dual-input-block')
    .filter({ hasText: label })
    .locator('input')
    .first();
  await field.click();
  await field.fill(value);
  await field.blur();
  await page.waitForTimeout(350);
};

/**
 * A picture with a shape and a handedness: 2:1, red on the left half, blue on
 * the right. Both matter — the aspect proves the height follows the width, and
 * the asymmetry would expose a mirrored draw, which is the mistake waiting in a
 * layer that lives in SVG coordinates while the model has y up.
 */
const pngBuffer = async () => {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(200, 0, 200, 200);
    // A stripe along the top edge only, so an up/down flip is visible too.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 400, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
};

await page.goto(`${BASE}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitForReady(page);
await page.waitForTimeout(400);

const emptyGrid = { x: 1150, y: 720 };

// --- The menu offers the picture before there is one ------------------------

await page.mouse.click(emptyGrid.x, emptyGrid.y, { button: 'right' });
await page.waitForTimeout(300);
const before = await menuLabels();
record(
  'the grid menu offers Add background image',
  before.some((label) => label === 'Add background image'),
  before
);
await closeMenu();

// --- Picking a file places it and opens its panel ---------------------------

const buffer = await pngBuffer();
const filePath = SHOTS + 'rig.png';
writeFileSync(filePath, buffer);

await page.setInputFiles('input.offscreenFileInput', {
  name: 'rig.png',
  mimeType: 'image/png',
  buffer,
});
await page.waitForTimeout(600);

const placed = await image();
record('the picture is drawn behind the grid', placed !== null, placed);
record(
  'it keeps the file’s own proportions',
  placed && Math.abs(placed.height / placed.width - 0.5) < 1e-6,
  placed
);
record(
  'the panel opens on it',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return (
      c.activeObjService.objType === 'BackgroundImage' &&
      !!document.querySelector('app-edit-panel .bgTitle')
    );
  })
);
record(
  'the panel names the file it came from',
  (await page.locator('app-edit-panel .bgFileName').innerText()).trim() === 'rig.png'
);
record(
  'the panel says the picture is not in the share link',
  (await page.locator('app-edit-panel .bgNote').innerText()).includes('not saved in the share link')
);
record(
  'its edges are outlined while the panel has it',
  await page.evaluate(() => !!document.querySelector('.bgImageOutline'))
);
await page.screenshot({ path: SHOTS + '01-placed.png' });

// --- It is behind the linkage and cannot be touched -------------------------

record(
  'it is drawn inside the grid group, under the ruling on it',
  await page.evaluate(() => {
    const holder = document.querySelector('#backgroundImageHolder');
    const group = holder.parentElement;
    if (group.id !== 'backgroundAndGrid') return false;
    // After the white paper, before the first grid line drawn on it.
    const kids = [...group.children];
    const line = kids.findIndex((node) => node.tagName === 'line');
    return kids.indexOf(holder) > 0 && (line === -1 || kids.indexOf(holder) < line);
  }),
  await page.evaluate(() => document.querySelector('#backgroundImageHolder').parentElement.id)
);
record(
  'and the grid group itself is under every part of the mechanism',
  // svg-pan-zoom moves every layer into a viewport group of its own, so the
  // layer order lives one level down from the canvas.
  await page.evaluate(() => {
    const layers = document.querySelector('#backgroundAndGrid').parentElement;
    const order = [...layers.children].map((node) => node.id);
    const bg = order.indexOf('backgroundAndGrid');
    return bg > -1 && bg < order.indexOf('linkHolder') && bg < order.indexOf('jointHolder');
  }),
  await page.evaluate(() =>
    [...document.querySelector('#backgroundAndGrid').parentElement.children].map((n) => n.id)
  )
);
record(
  'its outline and drag surface sit above the ruling and below the parts',
  await page.evaluate(() => {
    const layers = document.querySelector('#backgroundImageHandles').parentElement;
    const order = [...layers.children].map((node) => node.id);
    const handles = order.indexOf('backgroundImageHandles');
    return handles > order.indexOf('backgroundAndGrid') && handles < order.indexOf('linkHolder');
  }),
  await page.evaluate(() =>
    [...document.querySelector('#backgroundImageHandles').parentElement.children].map((n) => n.id)
  )
);
record(
  'its corners and turn knob sit above the parts, so a link cannot cover one',
  await page.evaluate(() => {
    const layers = document.querySelector('#backgroundImageGrips').parentElement;
    const order = [...layers.children].map((node) => node.id);
    return order.indexOf('backgroundImageGrips') > order.indexOf('jointHolder');
  }),
  await page.evaluate(() =>
    [...document.querySelector('#backgroundImageGrips').parentElement.children].map((n) => n.id)
  )
);
record(
  'the whole layer is deaf to the pointer',
  await page.evaluate(() => {
    const holder = document.querySelector('#backgroundImageHolder');
    return getComputedStyle(holder).pointerEvents === 'none';
  })
);

// A click that lands on the picture but on no part: the grid answers, not the
// picture, and dragging there pans as it always did rather than moving it.
const overPicture = await page.evaluate(() => {
  const rect = document.querySelector('#backgroundImageHolder image').getBoundingClientRect();
  return { x: rect.x + 24, y: rect.y + 24 };
});
await page.mouse.click(overPicture.x, overPicture.y);
await page.waitForTimeout(400);
record(
  'clicking the picture selects the grid, not the picture',
  await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.objType === 'Grid'
  )
);

const beforeDrag = await image();
await page.mouse.move(overPicture.x, overPicture.y);
await page.mouse.down();
for (let step = 1; step <= 8; step++) {
  await page.mouse.move(overPicture.x + step * 12, overPicture.y + step * 8);
  await page.waitForTimeout(15);
}
await page.mouse.up();
await page.waitForTimeout(400);
const afterDrag = await image();
record(
  'dragging on the picture never moves the picture',
  beforeDrag.x === afterDrag.x && beforeDrag.y === afterDrag.y,
  { beforeDrag, afterDrag }
);

// --- The menu's second half: edit the one already there ---------------------

await page.mouse.click(overPicture.x, overPicture.y, { button: 'right' });
await page.waitForTimeout(300);
const withPicture = await menuLabels();
record(
  'a right-click on the picture opens the grid menu, now offering Edit',
  withPicture.some((label) => label === 'Edit background image') &&
    !withPicture.some((label) => label === 'Add background image'),
  withPicture
);
await page.locator('#contextMenu #menu-item', { hasText: 'Edit background image' }).first().click();
await page.waitForTimeout(400);
record(
  'that item opens the panel again',
  await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.objType ===
      'BackgroundImage'
  )
);

// --- The placement fields -------------------------------------------------

const atOpen = await image();
await typeField('Image Center', '3');
const movedX = await image();
record(
  'typing an X slides the picture across the grid',
  Math.abs(movedX.x - atOpen.x - 3 * 200) < 1,
  { atOpen, movedX }
);

await typeField('Image Width', '8');
const resized = await image();
record('typing a width resizes the picture', Math.abs(resized.width - 8 * 200) < 1, resized);
record(
  'the height follows, so the proportions hold',
  Math.abs(resized.height / resized.width - 0.5) < 1e-6,
  resized
);

await typeField('Opacity', '25');
const faded = await image();
record('the opacity field fades the picture', Math.abs(faded.opacity - 0.25) < 1e-6, faded);
await page.screenshot({ path: SHOTS + '02-placed-and-faded.png' });

// --- Values the picture cannot have are refused, not quietly adjusted -------
// A number left in the field that is not the number that took effect is the
// panel lying about where the picture is.

const refusals = [
  [
    'Opacity',
    '400',
    'an opacity over 100 is refused',
    () => image().then((i) => i.opacity === 0.25),
  ],
  [
    'Opacity',
    '',
    'a blank opacity is refused rather than read as zero',
    () => image().then((i) => i.opacity === 0.25),
  ],
  [
    'Image Width',
    '-2',
    'a negative width is refused',
    () => image().then((i) => Math.abs(i.width - 8 * 200) < 1),
  ],
  [
    'Image Width',
    '0',
    'a width the picture cannot have is refused',
    () => image().then((i) => Math.abs(i.width - 8 * 200) < 1),
  ],
];
for (const [label, entry, what, stillTrue] of refusals) {
  await typeField(label, entry);
  const held = await stillTrue();
  const shown = await page
    .locator('input-block, dual-input-block')
    .filter({ hasText: label })
    .locator('input')
    .first()
    .inputValue();
  record(`${what}, and the field is put back`, held && shown !== entry, { shown, entry });
}

await typeField('Opacity', '55');

// --- Moved and resized by hand, while its panel is open ---------------------

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

const boxOnScreen = async () => (await image()).screen;

/** The four corner grips and the turn knob, in screen coordinates. */
const gripsOnScreen = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#backgroundImageGrips rect.bgImageHandle')].map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })
  );
const knobOnScreen = () =>
  page.evaluate(() => {
    const box = document.querySelector('#backgroundImageGrips circle').getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });

// Park it small and low on the canvas: every grip has to be inside the viewport
// for a real pointer to reach it, and the checks below grab actual grips rather
// than the picture's own corners.
const park = () =>
  page.evaluate(() => {
    ng.getComponent(document.querySelector('app-new-grid')).bgImage.place({
      centerX: 0,
      centerY: -600,
      width: 800,
      rotationRad: 0,
    });
  });
await park();
await page.waitForTimeout(300);

const beforeMove = await image();
const middle = await boxOnScreen();
// The drag surface is under the parts on purpose, so a press over a link
// belongs to the link — parked below the linkage, the middle is clear.
await dragBy({ x: middle.x + middle.width / 2, y: middle.y + middle.height / 2 }, 120, 70);
const afterMove = await image();
record(
  'dragging the picture slides it, without changing its size',
  Math.abs(afterMove.width - beforeMove.width) < 1e-6 &&
    Math.abs(afterMove.x - beforeMove.x) > 10 &&
    Math.abs(afterMove.y - beforeMove.y) > 5,
  { beforeMove, afterMove }
);
record(
  'the panel’s own numbers follow the drag',
  await page.evaluate(() => {
    const shown = [...document.querySelectorAll('app-edit-panel dual-input-block input')]
      .slice(0, 2)
      .map((input) => parseFloat(input.value));
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const bg = c.bgImage.image();
    return (
      Math.abs(shown[0] - bg.centerX / 200) < 0.02 && Math.abs(shown[1] - bg.centerY / 200) < 0.02
    );
  })
);
await page.screenshot({ path: SHOTS + '11-dragged.png' });

// A corner keeps the opposite corner where it is, and keeps the proportions.
await park();
await page.waitForTimeout(300);
const beforeResize = await image();
const corners = await gripsOnScreen();
await dragBy(corners[3], 140, 0);
const afterResize = await image();
record('dragging a corner resizes the picture', afterResize.width > beforeResize.width + 10, {
  beforeResize,
  afterResize,
});
record(
  'and it keeps the file’s proportions while doing it',
  Math.abs(afterResize.height / afterResize.width - 0.5) < 1e-6,
  afterResize
);
record(
  'the opposite corner stays exactly where it was',
  Math.abs(afterResize.x - beforeResize.x) < 1 && Math.abs(afterResize.y - beforeResize.y) < 1,
  { beforeResize, afterResize }
);
await page.screenshot({ path: SHOTS + '12-resized.png' });

// Pulled back through its own anchor, the picture shrinks and stays the right
// way round rather than flipping to the other side of the corner it pivots on.
await park();
await page.waitForTimeout(300);
const beforePull = await image();
const spread = await gripsOnScreen();
await dragBy(spread[3], -(spread[3].x - spread[0].x) - 120, -(spread[3].y - spread[0].y) - 120);
const pulled = await image();
record(
  'a corner pulled back through its anchor shrinks the picture without flipping it',
  pulled.width > 0 && pulled.width < beforePull.width,
  { beforePull, pulled }
);

// --- Turned, by the knob and by the field -----------------------------------

await park();
await page.waitForTimeout(300);
const knobAt = knobOnScreen;

// The knob has to be reachable: it sits at the picture's own top-centre, which
// at the default placement is exactly on the y axis — and an axis line drawn
// over it took the press and panned the canvas instead.
record(
  'the turn knob is the thing under the pointer, not the grid drawn over it',
  await page.evaluate(
    async (at) => {
      const hit = document.elementFromPoint(at.x, at.y);
      return hit?.classList.contains('bgImageRotateKnob') ?? false;
    },
    await knobAt()
  )
);

const squareOn = await image();
await dragBy(await knobAt(), 150, 120);
const turned = await image();
record(
  'dragging the knob turns the picture, and lands on a whole 15°',
  Math.abs(turned.rotationDeg) > 1 && Math.abs(turned.rotationDeg % 15) < 1e-6,
  turned
);
record(
  'turning changes nothing but the angle',
  Math.abs(turned.width - squareOn.width) < 1e-6 &&
    Math.abs(turned.x - squareOn.x) < 1e-6 &&
    Math.abs(turned.y - squareOn.y) < 1e-6,
  { squareOn, turned }
);
await page.screenshot({ path: SHOTS + '15-turned.png' });

// A turned picture still resizes by the corner the hand is holding: the maths
// runs in the picture's own frame, so the opposite corner stays put on screen.
const beforeTurnedResize = await gripsOnScreen();
await dragBy(beforeTurnedResize[3], 90, 90);
const afterTurnedResize = await image();
const anchorNow = (await gripsOnScreen())[0];
record(
  'a turned picture resizes about its opposite corner, which does not move',
  Math.abs(anchorNow.x - beforeTurnedResize[0].x) < 3 &&
    Math.abs(anchorNow.y - beforeTurnedResize[0].y) < 3,
  { was: beforeTurnedResize[0], now: anchorNow }
);
record(
  'and it holds its proportions and its angle through the resize',
  Math.abs(afterTurnedResize.height / afterTurnedResize.width - 0.5) < 1e-6 &&
    Math.abs(afterTurnedResize.rotationDeg - turned.rotationDeg) < 1e-6,
  afterTurnedResize
);

await typeField('Rotation', '30');
record('typing an angle turns the picture', Math.abs((await image()).rotationDeg - 30) < 0.01);
await typeField('Rotation', 'sideways');
record(
  'a nonsense angle is refused and the field put back',
  Math.abs((await image()).rotationDeg - 30) < 0.01
);
await typeField('Rotation', '0');
await typeField('Image Width', '8');

// A picture drag is not a mechanism edit, so it must not enter the history.
record(
  'moving and resizing the picture left no undo entries behind',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return !c.saveHistoryService.canUndo();
  })
);

// --- It rides the grid ------------------------------------------------------

const jointSpan = () =>
  page.evaluate(() => {
    const box = (id) =>
      document.querySelector(`#joint_${id}`).closest('svg[x]').getBoundingClientRect();
    return Math.abs(box('B').x - box('C').x);
  });

const spanBefore = await jointSpan();
const screenBefore = (await image()).screen.width;
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.svgGrid.zoomIn();
});
await page.waitForTimeout(500);
const spanAfter = await jointSpan();
const screenAfter = (await image()).screen.width;
record(
  'the picture zooms with the grid, by the same factor the linkage does',
  Math.abs(screenAfter / screenBefore - spanAfter / spanBefore) < 0.02,
  { screenBefore, screenAfter, spanBefore, spanAfter }
);

// Fit to zoom frames the LINKAGE. A picture ten times its size counted towards
// the bounding box, and the mechanism came back too small to work on -- 59px of
// joint span against the ~300 a fit gives it with no picture there. A threshold
// rather than an equality: the grid's own hiding races the render, so the exact
// figure moves between the two legitimate answers.
await typeField('Image Width', '100');
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).svgGrid.scaleToFitLinkage(false);
});
await page.waitForTimeout(1200);
const spanFitted = await jointSpan();
record('Fit to zoom frames the linkage, not the scenery behind it', spanFitted > 150, {
  spanFitted,
});
await page.screenshot({ path: SHOTS + '13-fitted.png' });
await typeField('Image Width', '8');

// --- A change of length unit keeps picture and linkage in step --------------

const alignment = async () => {
  const span = await jointSpan();
  const width = (await image()).screen.width;
  return { span, width, ratio: width / span };
};
const inCm = await alignment();

// Through the settings panel's own path, which is the one a user goes through:
// it rescales the mechanism's stored geometry and compensates the viewport, and
// the picture has to be carried along by the same factor or it is left the
// conversion's worth of wrong size against the very linkage it is under.
const openSettings = async () => {
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.menuItem', { hasText: 'Settings' }).first().click();
  await page.waitForTimeout(600);
};
const setLengthUnit = async (value) => {
  await openSettings();
  await page.evaluate((unit) => {
    const panel = ng.getComponent(document.querySelector('app-settings-panel'));
    panel.settingsForm.controls.lengthunit.setValue(unit);
  }, value);
  await page.waitForTimeout(1200);
};
await setLengthUnit('2'); // METER
const inMeters = await alignment();
record(
  'switching cm to m leaves the picture the same size against the linkage',
  Math.abs(inMeters.ratio - inCm.ratio) / inCm.ratio < 0.02,
  { inCm, inMeters }
);
record(
  'and the panel restates the width in the new unit rather than renaming it',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    // Whatever it was in centimetres, it is a hundredth of that in metres.
    return c.bgImage.image().width > 0;
  })
);
await page.screenshot({ path: SHOTS + '14-meters.png' });
await setLengthUnit('1'); // back to CM
await page.locator('.tabButton, .modeTab', { hasText: 'Edit' }).first().click();
await page.waitForTimeout(600);

// --- Nothing about it reaches the URL or the undo history -------------------

record(
  'the picture is nowhere in the share URL',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const url = c.saveHistoryService.urlGenerationService.generateUrlQuery();
    return !url.includes('data:image') && url.length < 4000;
  })
);

// A real undoable edit, made with the picture's panel open. `getSelectedObj()`
// answers for a joint, a link or a force and throws for anything else, so a
// deny-list in the history's selection-holding threw on Undo and left the
// mechanism edited with the history index already moved past it.
const undone = await page.evaluate(async () => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  const joint = c.mechanismSrv.joints.find((candidate) => !candidate.ground);
  const before = joint.x;
  joint.x += 60;
  // updateMechanism(true) is the save; calling save() too would make one edit
  // into two entries, and one Undo would only walk half of it back.
  c.mechanismSrv.updateMechanism(true);
  c.activeObjService.selectBackgroundImage();
  let threw = null;
  try {
    c.saveHistoryService.undo();
  } catch (error) {
    threw = String(error);
  }
  return { before, edited: before + 60, id: joint.id, threw };
});
await page.waitForTimeout(700);
record('Undo works with the picture’s panel open', undone.threw === null, undone);
record(
  'and it puts the mechanism back',
  await page.evaluate(
    (state) =>
      Math.abs(
        ng
          .getComponent(document.querySelector('app-new-grid'))
          .mechanismSrv.joints.find((j) => j.id === state.id).x - state.before
      ) < 1,
    undone
  ),
  undone
);
record('an undo of the mechanism leaves the picture where it is', (await image()) !== null);

// --- Save closes the editor, Delete removes the picture ---------------------

await page.mouse.click(emptyGrid.x, emptyGrid.y, { button: 'right' });
await page.waitForTimeout(300);
await page.locator('#contextMenu #menu-item', { hasText: 'Edit background image' }).first().click();
await page.waitForTimeout(400);
await page.locator('app-edit-panel button-block', { hasText: 'Save' }).locator('button').click();
await page.waitForTimeout(500);
record(
  'Save closes the editor and takes the outline with it',
  await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.objType !==
        'BackgroundImage' && !document.querySelector('.bgImageOutline')
  )
);
record('Save leaves the picture behind the grid', (await image()) !== null);
await page.screenshot({ path: SHOTS + '03-saved.png' });

// --- Scenery in the analysis modes too --------------------------------------

await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).tabService.setTab(2); // ANALYZE
});
await page.waitForTimeout(500);
record('the picture stays put in an analysis mode', (await image()) !== null);
record(
  'and nothing is outlined there, because nothing is being edited',
  await page.evaluate(() => !document.querySelector('.bgImageOutline'))
);
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-new-grid')).tabService.setTab(1); // EDIT
});
await page.waitForTimeout(400);

// --- Delete -----------------------------------------------------------------

await page.mouse.click(emptyGrid.x, emptyGrid.y, { button: 'right' });
await page.waitForTimeout(300);
await page.locator('#contextMenu #menu-item', { hasText: 'Edit background image' }).first().click();
await page.waitForTimeout(400);
await page.locator('app-edit-panel button-block', { hasText: 'Delete' }).locator('button').click();
await page.waitForTimeout(500);
record('Delete takes the picture off the canvas', (await image()) === null);

await page.mouse.click(emptyGrid.x, emptyGrid.y, { button: 'right' });
await page.waitForTimeout(300);
const after = await menuLabels();
record(
  'and the menu goes back to offering Add',
  after.some((label) => label === 'Add background image'),
  after
);
await closeMenu();
await page.screenshot({ path: SHOTS + '04-deleted.png' });

record('no page errors the whole way through', errors.length === 0, errors);

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${SHOTS}`);
await browser.close();
process.exit(failed.length ? 1 : 0);
