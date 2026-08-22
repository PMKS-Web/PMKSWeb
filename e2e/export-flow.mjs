/**
 * Export Data, end to end.
 *
 * The old command wrote one CSV of whatever the analysis panel happened to be
 * showing. This drives the drawer that replaced it: parts, then columns, then
 * the file — and, because an export is only worth anything if the file is,
 * opens what comes down and reads it.
 *
 *   PMKS_BASE_URL=<origin> node e2e/export-flow.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
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
const context = await browser.newContext({
  viewport: { width: 1500, height: 950 },
  acceptDownloads: true,
});
const page = await context.newPage();
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

const drawer = () => page.locator('app-export-panel');
const rowNamed = (name) => drawer().locator('.pickRow', { hasText: name }).first();

/** Press Export and hand back the file that comes down. */
async function grab(action) {
  const wait = page.waitForEvent('download', { timeout: 20000 });
  await action();
  const download = await wait;
  const path = await download.path();
  return { name: download.suggestedFilename(), path };
}

/**
 * Press Next until the file step is showing.
 *
 * How many questions the drawer asks depends on the drawing — a mechanism with
 * force analysis set up is asked about forces and one without is not — so a
 * fixed number of presses lands somewhere different in each.
 */
async function goToFile() {
  for (let at = 0; at < 5; at++) {
    if ((await drawer().locator('.formatBlock').count()) > 0) return;
    await page.locator('.nextButton').click();
    await page.waitForTimeout(450);
  }
}

/** And back again, however many questions lie between here and the parts. */
async function goToParts() {
  for (let at = 0; at < 5; at++) {
    if ((await drawer().locator('.mechHead').count()) > 0) return;
    await drawer().locator('.backButton').click();
    await page.waitForTimeout(350);
  }
}

async function openDrawer() {
  await page.locator('.historyButton', { hasText: 'Export Data' }).click();
  await page.waitForTimeout(600);
}

// --- one machine, the whole flow --------------------------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);

record(
  'Export Data is offered with nothing selected on the grid',
  !(await page.locator('.historyButton', { hasText: 'Export Data' }).isDisabled())
);

await openDrawer();
record('it opens a drawer rather than writing a file', (await drawer().count()) === 1);
record(
  'which lists every part of the machine, under the machine',
  (await drawer().locator('.mechHead').count()) === 1 &&
    (await drawer().locator('.pickRow').count()) === 7,
  await drawer().innerText()
);
record(
  'and refuses to go on until something is chosen',
  await page.locator('.nextButton').isDisabled()
);

await drawer().locator('.linkButton', { hasText: 'Select all' }).click();
await page.waitForTimeout(200);
const allOn = await drawer().locator('.box.ticked').count();
await drawer().locator('.linkButton', { hasText: 'Select none' }).click();
await page.waitForTimeout(200);
record(
  'Select all and Select none reach every row',
  allOn === 7 && (await drawer().locator('.box.ticked').count()) === 0,
  { allOn }
);

await rowNamed('Joint B').click();
await rowNamed('Link AB').click();
await page.waitForTimeout(200);
record(
  'the count and the footer follow what is ticked',
  (await drawer().locator('.count').innerText()).startsWith('2 of') &&
    (await drawer().locator('.footNote').innerText()).includes('2 parts'),
  {
    count: await drawer().locator('.count').innerText(),
    foot: await drawer().locator('.footNote').innerText(),
  }
);

await page.locator('.nextButton').click();
await page.waitForTimeout(400);
const step2 = await drawer().innerText();
// Forces are a step of their own now, not a tab inside the columns.
record(
  'the drawer asks a question per rule mark, with no tabs inside one of them',
  (await drawer().locator('.stepName').allInnerTexts())
    .map((mark) => mark.replace(/^check\s*/, '').trim())
    .join(' | ') === '1. Parts | 2. Kinematics | 3. Forces | 4. File' &&
    (await drawer().locator('.tabs').count()) === 0,
  await drawer().locator('.stepName').allInnerTexts()
);
record(
  'the kinematics step asks only about the quantities those parts have',
  step2.includes('Joint B') &&
    step2.includes('Link AB') &&
    step2.includes('Position') &&
    step2.includes('Angular velocity'),
  step2
);

await drawer().getByRole('button', { name: 'X, Y', exact: true }).click();
await page.waitForTimeout(200);
const withoutMag = await drawer().locator('.footNote').innerText();
await drawer().getByRole('button', { name: 'X, Y, Magnitude', exact: true }).click();
await page.waitForTimeout(200);
const withMag = await drawer().locator('.footNote').innerText();
record('dropping the magnitude narrows the file', number(withoutMag) < number(withMag), {
  withoutMag,
  withMag,
});
record(
  'and every row says which of the two it will write',
  (await drawer().locator('.rowComponents').allInnerTexts()).some((text) => text === 'X, Y, Mag') &&
    (await drawer().locator('.pickRow', { hasText: 'Angle' }).locator('.rowComponents').count()) ===
      0,
  await drawer().locator('.rowComponents').allInnerTexts()
);

await goToFile();
record(
  'the file step names the file it is about to write',
  (await drawer().locator('.summaryName').innerText()).endsWith('.csv'),
  await drawer().locator('.summaryName').innerText()
);

// --- the CSV ----------------------------------------------------------------
const csv = await grab(() => page.locator('.nextButton').click());
const text = readFileSync(csv.path, 'utf8');
const lines = text.trim().split('\n');
record('the CSV comes down under the name the drawer showed', csv.name.endsWith('.csv'), csv.name);
record(
  'with one time column, a head per series, and a row per solved position',
  lines[0].startsWith('Time (s)') &&
    lines[0].includes('Position B X (cm)') &&
    lines[0].includes('Angle AB (deg)') &&
    lines.length > 100,
  { head: lines[0], rows: lines.length }
);
record(
  'and every row as wide as the head',
  lines.every((line) => splitCsv(line).length === splitCsv(lines[0]).length),
  { head: splitCsv(lines[0]).length, second: splitCsv(lines[1]).length }
);

// The one column whose right answer is known without solving anything: the
// input crank turns at the speed the drive is set to. The solver keeps angles
// in degrees and rates in radians, so a file that skipped the conversion writes
// 2.09 here under a head saying deg/s.
const speed = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return srv.settingsService.inputSpeed.value * 6; // rpm -> deg/s
});
const rateColumn = splitCsv(lines[0]).findIndex((head) =>
  head.startsWith('Angular velocity AB (deg/s)')
);
record(
  'and an angular rate in the unit its head claims',
  rateColumn > 0 && Math.abs(Math.abs(Number(splitCsv(lines[1])[rateColumn])) - speed) < 0.5,
  { speed, column: rateColumn, value: rateColumn > 0 && splitCsv(lines[1])[rateColumn] }
);

// --- the workbook -----------------------------------------------------------
await drawer().locator('.formatRow', { hasText: 'Excel workbook' }).click();
await page.waitForTimeout(200);
const xlsx = await grab(() => page.locator('.nextButton').click());
const bytes = readFileSync(xlsx.path);
record(
  'the workbook is a real zip, named .xlsx',
  xlsx.name.endsWith('.xlsx') && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.length > 1000,
  { name: xlsx.name, size: bytes.length }
);
record(
  'holding a worksheet part',
  bytes.includes(Buffer.from('xl/worksheets/sheet1.xml')) &&
    bytes.includes(Buffer.from('spreadsheetml'))
);

// --- graph images -----------------------------------------------------------
await drawer().locator('.formatRow', { hasText: 'Graph images' }).click();
await page.waitForTimeout(200);
await drawer().locator('.segmented button', { hasText: 'SVG' }).click();
await page.waitForTimeout(200);
// What the card promised, before it was pressed.
const promised = await drawer().locator('.summaryName').innerText();
const pictures = await grab(() => page.locator('.nextButton').click());
record(
  'the card names the file that actually arrives, archive and all',
  promised === pictures.name,
  { promised, arrived: pictures.name }
);
const inside = readStoredZip(readFileSync(pictures.path));
const drawing = inside.find((entry) => entry.name.endsWith('.svg'))?.text ?? '';
record(
  'a graph comes down as a drawing with a line in it, and the mark on it',
  pictures.name.endsWith('.zip') &&
    inside.length > 2 &&
    drawing.includes('<polyline') &&
    drawing.includes('<image href="data:image/png'),
  { name: pictures.name, files: inside.length, bytes: drawing.length }
);

// --- the report -------------------------------------------------------------
// Nothing comes down: the report is handed to the browser's own printer, so
// what is checked is the document it builds.
await page.evaluate(() => {
  window.__printed = [];
  const open = HTMLIFrameElement.prototype.__lookupGetter__('contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const win = open.call(this);
      if (win && !win.__patched) {
        win.__patched = true;
        win.print = () => window.__printed.push(win.document.documentElement.outerHTML);
      }
      return win;
    },
  });
});
await drawer().locator('.formatRow', { hasText: 'Report' }).click();
await page.waitForTimeout(200);
await page.locator('.nextButton').click();
await page.waitForTimeout(1500);
const printed = await page.evaluate(() => window.__printed?.[0] ?? '');
record(
  'the report is a paginated document: the drawing, the settings, the graphs and the table',
  printed.includes('Solved under') &&
    printed.includes('Page 1 of ') &&
    printed.includes('dataTable') &&
    (printed.match(/class="page"/g) ?? []).length > 2,
  { length: printed.length, pages: (printed.match(/class="page"/g) ?? []).length }
);
record(
  'named as the drawer said, so the print dialog offers that name for the PDF',
  printed.includes('<title>M1_') || /<title>[^<]+<\/title>/.test(printed),
  printed.match(/<title>[^<]*<\/title>/)?.[0]
);
record(
  'and prints the way back to the mechanism on it',
  printed.includes('shareUrl') && printed.includes('?'),
  printed.slice(0, 200)
);

// The report is laid out page by page rather than left to reflow, so how full
// those pages are is something only measuring can answer.
const layout = await (async () => {
  const viewer = await context.newPage();
  await viewer.setContent(printed);
  await viewer.waitForTimeout(400);
  const measured = await viewer.evaluate(() => {
    const pages = [...document.querySelectorAll('section.page')];
    const use = pages.map((page) => {
      const body = page.querySelector('.pageBody');
      const kids = [...body.children];
      const used = kids.length
        ? Math.max(...kids.map((kid) => kid.getBoundingClientRect().bottom)) -
          body.getBoundingClientRect().top
        : 0;
      return Math.round((used / body.getBoundingClientRect().height) * 100);
    });
    return {
      pages: pages.length,
      leastFull: Math.min(...use),
      // A page taller than the box it is drawn in has lost rows off the bottom.
      clipped: pages.filter((page) => {
        const body = page.querySelector('.pageBody');
        return body.scrollHeight > body.clientHeight + 1;
      }).length,
      // A number wider than its column overlaps the one beside it.
      overflowing: [...document.querySelectorAll('.dataTable td')].filter(
        (cell) => cell.scrollWidth > cell.clientWidth + 0.5
      ).length,
    };
  });
  await viewer.close();
  return measured;
})();
// Two parts and every column they have, over a 361-position cycle: forty-two
// pages when a page held forty rows and seven columns of it.
record(
  'and fills the pages it asks for, without losing a row or a digit off one',
  layout.pages <= 16 && layout.leastFull >= 60 && layout.clipped === 0 && layout.overflowing === 0,
  layout
);

// --- watching the mechanism run does not rebuild the export -----------------
// The table cache used to key on the pose, which playback moves every frame:
// leaving Report chosen and pressing play re-sampled every column of every
// selected part sixty times a second.
await page.evaluate(() => {
  const panel = ng.getComponent(document.querySelector('app-export-panel'));
  const samples = panel.writer.tables.samples;
  const original = samples.sampleAt.bind(samples);
  window.__sampled = 0;
  samples.sampleAt = (...args) => {
    window.__sampled++;
    return original(...args);
  };
});
// Ask a question the cache has not been asked before, so there is a real
// sampling pass to compare playback against.
await page.evaluate(() => {
  ng.getComponent(document.querySelector('app-export-panel')).flow.withMagnitude = false;
});
await drawer().locator('.formatRow', { hasText: 'Report' }).click();
await page.waitForTimeout(900);
const sampledOnce = await page.evaluate(() => window.__sampled);
await page.locator('.playButton').click();
await page.waitForTimeout(1500);
await page.locator('.playButton').click();
await page.waitForTimeout(300);
record(
  'watching the mechanism run does not re-sample a single column',
  sampledOnce > 0 && (await page.evaluate(() => window.__sampled)) === sampledOnce,
  { sampledOnce, after: await page.evaluate(() => window.__sampled) }
);
await page.locator('.stopButton').click();
await page.waitForTimeout(800);

// --- the list is a way into the drawing -------------------------------------
const lit = () =>
  page.evaluate(() => document.querySelectorAll('.joint-pointed, .link-pointed').length);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(600);
await openDrawer();
const dark = await lit();
await drawer().locator('.pickRow').nth(1).hover();
await page.waitForTimeout(300);
const pointed = await lit();
await page.mouse.move(700, 500);
await page.waitForTimeout(300);
record(
  'pointing at a row lights that one part on the grid, and lets it go again',
  dark === 0 && pointed === 1 && (await lit()) === 0,
  { dark, pointed }
);

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((joint) => !joint.ground));
});
await page.waitForTimeout(600);
record(
  'and the part picked on the canvas says so in the list, and stops when it is let go',
  (await drawer().locator('.pickRow.onGrid').innerText()).includes('currently selected'),
  await drawer().locator('.pickRow.onGrid').innerText()
);
record(
  'and the part picked on the canvas is marked in the list',
  (await drawer().locator('.pickRow.onGrid').count()) === 1 &&
    (await drawer()
      .locator('.pickRow.onGrid')
      .first()
      .evaluate((row) => getComputedStyle(row).backgroundColor)) === 'rgb(255, 248, 225)'
);
await drawer().locator('.pickRow').first().hover();
await page.waitForTimeout(300);
record('a selection on the canvas is not painted over by a hover in the list', (await lit()) === 0);

// Letting go of a part leaves the old one remembered, so a list reading the
// selection's fields alone went on marking a row nobody had chosen.
await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).activeObjService.updateSelectedObj(null)
);
await page.waitForTimeout(500);
record(
  'and letting go of it clears the mark',
  (await drawer().locator('.pickRow.onGrid').count()) === 0
);

// --- a slot is not a part, because a reader cannot point at one -------------
await page.goto(`${BASE}/?${payloads['Scotch_Yoke']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);
await openDrawer();
const yokeParts = await drawer().locator('.pickRow .rowName').allInnerTexts();
const invisible = await page.evaluate(() =>
  [...document.querySelectorAll('[id^="joint_"]')]
    .filter((marker) => marker.getBoundingClientRect().width === 0)
    .map((marker) => 'Joint ' + marker.id.replace('joint_', ''))
);
record(
  'a joint the canvas draws nothing for is not offered as a part',
  invisible.length > 0 && invisible.every((name) => !yokeParts.includes(name)),
  { invisible, yokeParts }
);
record(
  'and every joint it does draw is',
  (
    await page.evaluate(() =>
      [...document.querySelectorAll('[id^="joint_"]')]
        .filter((marker) => marker.getBoundingClientRect().width > 0)
        .map((marker) => 'Joint ' + marker.id.replace('joint_', ''))
    )
  ).every((name) => yokeParts.includes(name)),
  yokeParts
);

// A slider is one thing to a reader: a pin, its block and its slot are three
// bodies to the solver, and the block's force at the pin is the bar's force
// negated. So the pin carries both numbers, and nothing is named after a body
// or a joint nobody has seen.
await drawer().locator('.linkButton', { hasText: 'Select all' }).click();
await page.waitForTimeout(300);
await page.locator('.nextButton').click();
await page.waitForTimeout(500);
await page.locator('.nextButton').click();
await page.waitForTimeout(500);
const yokeForces = await drawer().locator('.pickRow .rowName').allInnerTexts();
record(
  'a slider is one row, with the force in its bar and the force in its slot',
  yokeForces.length > 0 &&
    !yokeForces.some((name) => /Block|Joint E|Joint F/.test(name)) &&
    yokeForces.some((name) => name.includes('the ground') || name.includes('the slider')),
  yokeForces
);
record(
  'and no reaction is offered twice',
  new Set(yokeForces).size === yokeForces.length ||
    yokeForces.length === (await drawer().locator('.pickRow').count()),
  yokeForces
);
await goToParts();

// --- a sealed cylinder is one part, not the pieces it is assembled from ------
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);
await openDrawer();
const cylinderParts = await drawer().locator('.pickRow .rowName').allInnerTexts();
record(
  'a sealed cylinder stands in the list as one part',
  cylinderParts.some((name) => name.startsWith('Cylinder ')) &&
    !cylinderParts.some((name) => /^(Rod|Barrel|Piston|Block) /.test(name)),
  cylinderParts
);

// A ram is picked on the canvas by whichever of its pieces the pointer was
// over, and stands in this list as one part, so the row has to answer for all
// three of them.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.sealedStructures()[0].barrel);
});
await page.waitForTimeout(500);
record(
  'and picking any piece of it on the canvas marks that one row',
  (await drawer().locator('.pickRow.onGrid').count()) === 1 &&
    (await drawer().locator('.pickRow.onGrid .rowName').innerText()).startsWith('Cylinder')
);
await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).activeObjService.updateSelectedObj(null)
);
await page.waitForTimeout(400);

// A ram is drawn as one silhouette over a barrel, a block and a rod, so
// pointing at its row has to light that silhouette rather than one piece.
await drawer().locator('.pickRow', { hasText: 'Cylinder' }).first().hover();
await page.waitForTimeout(400);
record(
  'and pointing at it lights the whole ram on the grid',
  (await page.evaluate(() => document.querySelectorAll('.link-pointed').length)) > 0
);
await page.mouse.move(700, 500);
await page.waitForTimeout(300);

// --- a joint two machines share is two rows, and two ticks ------------------
// A chain bolted to another machine's ground shares that pin. Keyed by its
// letter alone, ticking it under one machine ticked it under the other, and
// the export wrote a file for a machine nobody had asked about.
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const JointClass = Object.getPrototypeOf(srv.joints[0]).constructor;
  const LinkClass = Object.getPrototypeOf(srv.links[0]).constructor;
  const scale = Math.abs(srv.joints[0].x) / 3 || 200;
  const shared = srv.joints.find((joint) => joint.id === 'D');
  const made = [
    ['E', 6, 1],
    ['F', 8, 2],
    ['G', 9, 0],
  ].map(([id, x, y]) => new JointClass(id, x * scale, y * scale));
  made[2].ground = true;
  made[2].input = true;
  const chain = [shared, ...made];
  const links = [0, 1, 2].map((at) => {
    const link = new LinkClass(chain[at].id + chain[at + 1].id, [chain[at], chain[at + 1]]);
    chain[at].links.push(link);
    chain[at + 1].links.push(link);
    chain[at].connectedJoints.push(chain[at + 1]);
    chain[at + 1].connectedJoints.push(chain[at]);
    return link;
  });
  srv.joints.push(...made);
  srv.links.push(...links);
  srv.updateMechanism(true);
});
await page.waitForTimeout(1400);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);
await openDrawer();
const shownNames = await drawer().locator('.pickRow .rowName').allInnerTexts();
record(
  'a joint two machines share is listed under each of them',
  shownNames.filter((name) => name === 'Joint D').length === 2,
  shownNames
);
await drawer().locator('.pickRow', { hasText: 'Joint D' }).first().click();
await page.waitForTimeout(400);
record(
  'and ticking it under one leaves the other alone',
  (await drawer().locator('.pickRow.on').count()) === 1 &&
    (await drawer().locator('.footNote').innerText()).includes('M1'),
  await drawer().locator('.footNote').innerText()
);
await goToFile();
record(
  'so the export is one file, for the machine that was asked about',
  (await drawer().locator('.summaryCard').innerText()).includes('One file'),
  await drawer().locator('.summaryCard').innerText()
);

// Both machines' copies of the shared joint, as pictures. `Position of Joint D`
// is the title under either of them, and two entries of one name in one archive
// is one picture quietly writing over the other.
await goToParts();
await drawer().locator('.pickRow', { hasText: 'Joint D' }).nth(1).click();
await page.waitForTimeout(300);
await goToFile();
await drawer().locator('.formatRow', { hasText: 'Graph images' }).click();
await page.waitForTimeout(200);
await drawer().locator('.segmented button', { hasText: 'SVG' }).click();
await page.waitForTimeout(300);
const shared = await grab(() => page.locator('.nextButton').click());
const inArchive = readStoredZip(readFileSync(shared.path)).map((entry) => entry.name);
record(
  'and a joint exported from both machines gives a picture each, under names of their own',
  inArchive.length > 2 && new Set(inArchive).size === inArchive.length,
  inArchive
);

// Back to the parts, and back to CSV, for the next question — this drawing has
// two machines and enough parts between them to need an archive.
await drawer().locator('.formatRow', { hasText: 'CSV' }).click();
await page.waitForTimeout(300);
await goToParts();

// --- more than two files arrive as one download -----------------------------
await drawer().locator('.linkButton', { hasText: 'Select all' }).click();
await page.waitForTimeout(300);
await goToFile();
await drawer().locator('.segmented button', { hasText: 'Per part' }).click();
await page.waitForTimeout(400);
const archive = await grab(() => page.locator('.nextButton').click());
const zipped = readFileSync(archive.path);
record(
  'more than two files come down as one archive, not one prompt each',
  archive.name.endsWith('.zip') && zipped[0] === 0x50 && zipped.includes(Buffer.from('.csv')),
  archive.name
);

// --- a long list scrolls, and its decisions do not --------------------------
await page.goto(`${BASE}/?${TWO_FOUR_BARS}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);
await openDrawer();

record(
  'two machines in the drawing get a section each',
  (await drawer().locator('.mechHead').count()) === 2,
  await drawer().innerText()
);

// Short enough that fourteen parts do not fit, which is the case the three
// bands exist for.
await page.setViewportSize({ width: 1500, height: 620 });
await page.waitForTimeout(400);

const geometry = await drawer().evaluate((panel) => {
  const body = panel.querySelector('.exportBody');
  const head = panel.querySelector('.exportHead');
  const foot = panel.querySelector('.exportFoot');
  body.scrollTop = 120;
  return {
    scrollable: body.scrollHeight > body.clientHeight + 4,
    headBottom: head.getBoundingClientRect().bottom,
    firstStickyTop: panel.querySelector('.mechHead').getBoundingClientRect().top,
    footTop: foot.getBoundingClientRect().top,
    footBottom: foot.getBoundingClientRect().bottom,
    bodyBottom: body.getBoundingClientRect().bottom,
    window: window.innerHeight,
  };
});
record(
  'the list scrolls under a head that stays put, above a footer that does too',
  geometry.scrollable &&
    Math.abs(geometry.firstStickyTop - geometry.headBottom) < 2 &&
    Math.abs(geometry.footTop - geometry.bodyBottom) < 2,
  geometry
);
await page.waitForTimeout(300);
record(
  'and the footer it holds stays on screen, however long the list is',
  geometry.footBottom > 0 && geometry.footBottom <= geometry.window,
  geometry
);
// One mark, one colour: this used to be a grey pip inside the mass table's
// lavender ring, because both were called `.dot`.
const separator = await drawer()
  .locator('.pickSep')
  .first()
  .evaluate((mark) => ({
    border: getComputedStyle(mark).borderTopWidth,
    fill: getComputedStyle(mark).backgroundColor,
  }));
record(
  'and the mark between Select all and Select none is one solid dot',
  separator.border === '0px' && separator.fill.startsWith('rgba(0, 0, 0'),
  separator
);
record(
  'and the head says so, with the shadow the panels already use',
  await drawer().evaluate((panel) => {
    const head = panel.querySelector('.exportHead');
    return getComputedStyle(head).boxShadow.includes('rgba(0, 0, 0, 0.35)');
  })
);

// One file each: two machines on two clocks cannot share a time column.
await drawer().locator('.linkButton', { hasText: 'Select all' }).click();
await page.waitForTimeout(200);
await goToFile();
record(
  'two machines are written as two files, because they run on two clocks',
  (await drawer().locator('.summaryCard').innerText()).includes('2 files'),
  await drawer().locator('.summaryCard').innerText()
);

// Two files arrive as two downloads under two names. The card used to show the
// bare stem, promising a `results.csv` that nothing was ever going to write.
const twoUp = await drawer().locator('.summaryName').innerText();
const firstOfTwo = await grab(() => page.locator('.nextButton').click());
record('and the name on the card is one a file actually lands under', firstOfTwo.name === twoUp, {
  promised: twoUp,
  arrived: firstOfTwo.name,
});

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);

/** The first number in a phrase like `26 columns · 361 rows`. */
function number(text) {
  return Number((text.match(/\d+/) ?? [0])[0]);
}

/**
 * Read back an archive of stored entries.
 *
 * Enough of the zip format to open what this app writes, which never
 * compresses — so an entry's bytes are its bytes, at the offset its local
 * header names.
 */
function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = [];
  for (let n = 0; n < count; n++) {
    const nameLength = view.getUint16(at + 28, true);
    const size = view.getUint32(at + 24, true);
    const offset = view.getUint32(at + 42, true);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const start =
      offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    entries.push({ name, text: bytes.subarray(start, start + size).toString('utf8') });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}

/** Split a CSV line, respecting the quotes a head may carry. */
function splitCsv(line) {
  return line
    .match(/("([^"]|"")*"|[^,]*)(,|$)/g)
    .slice(0, -1)
    .map((field) => field.replace(/,$/, ''));
}
