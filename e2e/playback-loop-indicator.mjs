/**
 * The transport row, rebuilt: two lines a machine, an end-of-cycle reading, and
 * a selection the row's own surface carries.
 *
 * Three things this has to hold that a screenshot alone will not. The reading
 * has to be right -- a crank comes round again, a driven ram turns back -- and
 * it has to be one sentence about the group when the machines are synced. The
 * handle has to get the card's whole width. And the selection has to sit under
 * the whole row without any control crossing its edge, which is the thing the
 * old filled chip could not do.
 *
 *   PMKS_BASE_URL=<origin> node e2e/playback-loop-indicator.mjs
 */

import { readFileSync, mkdirSync } from 'node:fs';

const playwright = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const { chromium } = playwright;
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/playback-loop-indicator';
mkdirSync(OUT, { recursive: true });

const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

/** Two four-bars side by side, each with its own drive: one drawing, two clocks. */
const TWO_FOUR_BARS =
  '2P.Ay,1E8.K,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0.6E,E,2Y_,0,0.' +
  '0F,F,2Y_,GJ,0.0G,G,3Jt,Wc,0.4H,H,3aA,0,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.' +
  'YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,.' +
  'AREF,EF,0,0,2Y_,8A,555555,E,F,,.ARFG,FG,0,0,2xQ,OS,555555,F,G,,.' +
  'ARGH,GH,0,0,3S0,GJ,555555,G,H,,...N_L';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const kinematic = async () => {
  await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
  await page.waitForTimeout(900);
};

const rowText = () => page.locator('.scrubCard').innerText();

/** Every box the row draws, in page coordinates, for the geometry checks. */
const boxes = () =>
  page.evaluate(() => {
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
      };
    };
    return [...document.querySelectorAll('.mechRow')].map((row) => ({
      row: rect(row),
      head: rect(row.querySelector('.rowHead')),
      track: rect(row.querySelector('.rowScrubber')),
      readout: rect(row.querySelector('.rowReadout')),
      play: rect(row.querySelector('.rowPlay')),
      flip: rect(row.querySelector('.dirButton')),
      fill: getComputedStyle(row).backgroundColor,
      selected: row.classList.contains('selected'),
    }));
  });

// --- a continuously driven crank comes round again --------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await kinematic();

let text = await rowText();
record('a crank says it loops', /Loops/.test(text) && !/Reverses/.test(text), text);
await page.screenshot({
  path: `${OUT}/01-one-crank.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

let geometry = (await boxes())[0];
// The handle runs the row's whole width, inset only by the row's own 12px,
// rather than sharing a line with the label as it used to.
record(
  'the handle gets the width the row has, under the line rather than beside it',
  geometry.track.left - geometry.row.left === 8 &&
    geometry.row.right - geometry.track.right === 8 &&
    geometry.track.top > geometry.head.bottom,
  geometry
);
record(
  'and the buttons sit inside the row rather than on its edge',
  geometry.flip.right <= geometry.row.right - 4 && geometry.flip.top >= geometry.row.top,
  geometry
);

// --- a driven ram turns round -----------------------------------------------
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await kinematic();

text = await rowText();
record('a driven ram says it reverses', /Reverses/.test(text) && !/Loops/.test(text), text);
await page.screenshot({
  path: `${OUT}/02-one-ram.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

// --- selection is the row's own surface -------------------------------------
await page.goto(`${BASE}/?${TWO_FOUR_BARS}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await kinematic();

record(
  'synced, the two machines collapse to one row',
  (await page.locator('.mechRow').count()) === 1,
  {
    rows: await rowText(),
  }
);
record(
  'and the row speaks for both at once, in one reading',
  (await rowText()).match(/Loops/g)?.length === 1,
  await rowText()
);
await page.screenshot({
  path: `${OUT}/03-synced.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

await page.locator('.syncToggle').click();
await page.waitForTimeout(700);
record('unsynced, the transport lists both', (await page.locator('.mechRow').count()) === 2);

const before = await boxes();
record(
  'nothing is filled until a machine is chosen',
  before.every((row) => !row.selected),
  before.map((row) => row.fill)
);
record(
  'and the two readout columns line up, whatever the numbers are',
  before[0].readout.left === before[1].readout.left,
  before.map((row) => row.readout)
);

await page.locator('.mechRow').first().click();
await page.waitForTimeout(500);
const after = await boxes();
record('clicking a row selects that machine', after[0].selected && !after[1].selected, {
  fills: after.map((row) => row.fill),
});
record(
  'the fill is the row and only the row',
  after[0].fill !== after[1].fill && after[0].row.left === before[0].row.left,
  { selected: after[0].fill, other: after[1].fill }
);
const card = await page.locator('.scrubCard').boundingBox();
record(
  'and it sits inside the card, one padding in on every side',
  Math.round(after[0].row.left - card.x) === 4 &&
    Math.round(card.x + card.width - after[0].row.right) === 4,
  { row: after[0].row, card }
);
record(
  'and choosing it moved nothing on the line',
  after[0].readout.left === before[0].readout.left &&
    after[0].play.left === before[0].play.left &&
    after[0].flip.left === before[0].flip.left,
  { before: before[0], after: after[0] }
);
await page.screenshot({
  path: `${OUT}/04-selected.png`,
  clip: { x: 300, y: 700, width: 1180, height: 240 },
});

// The panel is what proves the click reached the mechanism, not just the CSS.
const panel = await page
  .locator('app-right-panel, app-analysis-panel')
  .first()
  .innerText()
  .catch(() => '');
record('the selection reaches the analysis panel', /Mechanism M1/.test(panel), panel.slice(0, 160));

// --- the handle's bar is drawn, not themed ----------------------------------
// The reported defect: left to the browser the track keeps a 1px rim, a grey
// line above and below the bar. Read out of the composited pixels rather than
// out of the CSS, because what was wrong was what the browser painted.
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await kinematic();

// The element holds the handle, so the bar is the 8px centred inside it. One
// row above and one below are taken too, which is where the rim used to be.
const bar = await page.locator('.rowScrubber').boundingBox();
const strip = await page.screenshot({
  clip: {
    x: Math.round(bar.x),
    y: Math.round(bar.y) + 5,
    width: Math.round(bar.width),
    height: 10,
  },
});
const columns = await page.evaluate(async (encoded) => {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const column = (x) => {
    const { data } = context.getImageData(x, 0, 1, bitmap.height);
    const rows = [];
    for (let y = 0; y < bitmap.height; y++) {
      rows.push(`${data[y * 4]},${data[y * 4 + 1]},${data[y * 4 + 2]}`);
    }
    return rows;
  };
  return { travelled: column(8), ahead: column(bitmap.width - 8) };
}, strip.toString('base64'));
// Row 0 and row 9 are the row's own fill; rows 1-8 are the bar. A rim would
// show as a colour of its own at the top or the bottom of the bar.
const bandOf = (column) => new Set(column.slice(1, 9));
record(
  'the bar is one colour top to bottom, with no rim above or below it',
  bandOf(columns.travelled).size === 1 &&
    bandOf(columns.ahead).size === 1 &&
    columns.travelled[0] === columns.ahead[0],
  columns
);
record(
  'and the part already travelled is the part that is filled',
  columns.travelled[3] !== columns.ahead[3],
  columns
);

// The fill is drawn from the same number the handle is placed by, so the two
// have to agree -- at rest, part way through a cycle, and after a drag.
const agrees = () =>
  page.$eval('.rowScrubber', (el) => {
    const along = parseFloat(getComputedStyle(el).getPropertyValue('--along'));
    return { along, value: Number(el.value) / 10, width: el.getBoundingClientRect().width };
  });
const atRest = await agrees();
await page.locator('.playButton').click();
await page.waitForTimeout(900);
await page.locator('.playButton').click();
await page.waitForTimeout(400);
const playing = await agrees();
await page.locator('.rowScrubber').click({ position: { x: 120, y: 10 } });
await page.waitForTimeout(500);
const dragged = await agrees();
record(
  'the fill and the handle read the same place along the track',
  [atRest, playing, dragged].every((s) => Math.abs(s.along - s.value) < 0.5),
  { atRest, playing, dragged }
);
record('and the drag actually moved it', Math.abs(dragged.value - atRest.value) > 1, {
  atRest,
  dragged,
});

// --- one drawing, two kinds of ending ---------------------------------------
// A driven ram beside a crank, so the combined row has two facts to carry and
// has to name which machines each one is about.
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

/**
 * Draw a four-bar beside the ram, using the app's own object model.
 *
 * Cloning the prototypes of the joints and links already on the grid rather
 * than importing the classes: this runs in the page, where the modules are not
 * addressable by name.
 */
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const seedJoint = srv.joints[0];
  const seedLink = srv.links.find((link) => link.joints.length === 2);
  const JointClass = Object.getPrototypeOf(seedJoint).constructor;
  const LinkClass = Object.getPrototypeOf(seedLink).constructor;
  const S = seedJoint.x === 0 ? 200 : Math.abs(seedJoint.x) / 3;

  const at = [
    [10, 0],
    [10, 1],
    [13, 2],
    [14, 0],
  ];
  const made = at.map(([x, y], i) => new JointClass('W' + i, x * S, y * S));
  made[0].ground = true;
  made[3].ground = true;
  made[0].input = true;

  const links = [0, 1, 2].map((i) => {
    const link = new LinkClass(made[i].id + made[i + 1].id, [made[i], made[i + 1]]);
    made[i].links.push(link);
    made[i + 1].links.push(link);
    made[i].connectedJoints.push(made[i + 1]);
    made[i + 1].connectedJoints.push(made[i]);
    return link;
  });

  srv.joints.push(...made);
  srv.links.push(...links);
  srv.updateMechanism(true);
});
await page.waitForTimeout(1400);
await kinematic();

const mixed = await rowText();
record(
  'synced over two kinds of machine, the row names which does which',
  /M1 reverses/.test(mixed) && /M2 loops/.test(mixed),
  mixed
);
await page.screenshot({
  path: `${OUT}/05-mixed.png`,
  clip: { x: 300, y: 760, width: 1180, height: 180 },
});

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();

// --- and the same bar in every engine ---------------------------------------
// The point of drawing the track rather than letting the platform theme it:
// what a reader sees should not depend on which browser they opened. Run the
// same row through all three and compare the pixels down the bar.
const engines = ['chromium', 'firefox', 'webkit'];
const painted = {};
for (const engine of engines) {
  let engineBrowser;
  try {
    engineBrowser = await playwright[engine].launch();
  } catch (error) {
    record(`${engine} is installed to compare against`, false, String(error).split('\n')[0]);
    continue;
  }
  const enginePage = await engineBrowser.newPage({ viewport: { width: 1500, height: 950 } });
  await enginePage.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(enginePage);
  await enginePage.locator('.tabButton', { hasText: 'Kinematic' }).click();
  await enginePage.waitForTimeout(1200);
  // Wait for the stylesheet to have reached the control, not for the clock.
  // A range input the app has not styled yet is the platform's own 4px bar,
  // and Firefox lays this out later than the others -- so a fixed wait
  // measured one engine's finished work and another's default.
  const styled = await enginePage
    .waitForFunction(
      () => {
        const bar = document.querySelector('.rowScrubber');
        return !!bar && bar.getBoundingClientRect().height > 12;
      },
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);
  // Said out loud rather than swallowed: measuring the platform's own bar and
  // reporting it as a painting difference is how this check lied twice.
  record(`${engine} has the app's bar to measure, not the platform's`, styled, {
    engine,
    scrubber: await enginePage.evaluate(() => {
      const bar = document.querySelector('.rowScrubber');
      const style = bar && getComputedStyle(bar);
      return bar
        ? {
            height: bar.getBoundingClientRect().height,
            css: style.height,
            appearance: style.appearance,
          }
        : 'missing';
    }),
  });
  const engineBar = await enginePage.locator('.rowScrubber').boundingBox();
  // Halfway along, so the shot holds both what is travelled and what is ahead.
  await enginePage.mouse.click(engineBar.x + engineBar.width / 2, engineBar.y + 10);
  await enginePage.waitForTimeout(600);
  const shot = await enginePage.screenshot({
    clip: {
      x: Math.round(engineBar.x),
      y: Math.round(engineBar.y) + 5,
      width: Math.round(engineBar.width),
      height: 10,
    },
  });
  painted[engine] = {
    height: Math.round(engineBar.height),
    // Read in the page that took the shot, so no image library is needed.
    band: await enginePage.evaluate(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const column = (x) => {
        const { data } = context.getImageData(x, 0, 1, bitmap.height);
        const rows = [];
        for (let y = 0; y < bitmap.height; y++) {
          rows.push(`${data[y * 4]},${data[y * 4 + 1]},${data[y * 4 + 2]}`);
        }
        return rows.join(' / ');
      };
      return { travelled: column(8), ahead: column(bitmap.width - 8) };
    }, shot.toString('base64')),
  };
  await engineBrowser.close();
}
const seen = Object.values(painted);
record(
  'every engine paints the same bar, and none of them puts a rim on it',
  seen.length === engines.length &&
    new Set(seen.map((one) => JSON.stringify(one))).size === 1 &&
    seen[0].band.travelled !== seen[0].band.ahead,
  painted
);

process.exit(results.every(([, ok]) => ok) ? 0 : 1);
