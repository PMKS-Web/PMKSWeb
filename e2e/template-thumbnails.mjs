// Card images for the linkage library, taken from the running app.
//
// The dialog shows a picture of each template. Drawing those by hand goes stale
// the moment a payload is regenerated, so they are captured instead: open each
// library template's own URL, let the app fit the view the way it does for any
// shared link, and clip the canvas. The image is therefore always the mechanism
// the card actually opens.
//
// Both <img> slots on a card use the same PNG. The five original templates have
// an animated GIF and a still; these have one still, because a GIF that is not
// animated is a lie about what the file is.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/template-thumbnails.mjs

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const SOURCE = 'src/app/component/MODALS/templates/template-linkages.ts';
const ASSETS = 'src/assets/gifs';

/** The existing cards' images, matched so the grid stays even. */
const WIDTH = 828;
const HEIGHT = 520;

/** Template id -> asset basename, matching templates.component.html. */
const FILENAMES = {
  Whitworth_Quick_Return: 'whitworth',
  Scotch_Yoke: 'scotch-yoke',
  Cylinder_Boom: 'cylinder-boom',
  Cylinder_Gripper: 'cylinder-gripper',
  Radial_Engine: 'radial-engine',
  Chebyshev_Straight_Line: 'chebyshev',
  Windshield_Wiper: 'windshield-wiper',
  Elliptical_Crank: 'elliptical-crank',
  Jansen_Leg: 'jansen-leg',
  Backhoe_Bucket: 'backhoe-bucket',
  Toggle_Press: 'toggle-press',
  Scissor_Lift: 'scissor-lift',
  Shaper_Quick_Return: 'shaper-quick-return',
  Pedaling_Leg: 'pedaling-leg',
  Oscillating_Fan: 'oscillating-fan',
  Pumpjack: 'pumpjack',
  Punch_Press: 'punch-press',
  Derrick_Crane: 'derrick-crane',
  Toggle_Clamp: 'toggle-clamp',
  Offset_Load_Rocker: 'offset-load-rocker',
};

/** The generated block of template-linkages.ts, read as id/payload pairs. */
function libraryTemplates() {
  const source = readFileSync(SOURCE, 'utf8');
  const block = source.slice(source.indexOf('<generated'), source.indexOf('</generated>'));
  return [...block.matchAll(/^ {2}(\w+):\n {4}'([^']+)',$/gm)].map(([, id, payload]) => ({
    id,
    payload,
  }));
}

async function open(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForReady(page);
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(1500);
    }
  }
  await page.waitForTimeout(900);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 950 },
  deviceScaleFactor: 2,
});
const scratch = mkdtempSync(join(tmpdir(), 'pmks-thumbs-'));
const captured = [];

for (const { id, payload } of libraryTemplates()) {
  const name = FILENAMES[id];
  if (!name) throw new Error(`No thumbnail filename for template ${id}`);
  await open(`${BASE}/?${payload}`);

  const readModel = () =>
    page
      .evaluate(() => {
        const grid = ng.getComponent(document.querySelector('app-new-grid'));
        return {
          joints: grid?.mechanismSrv.joints.length ?? 0,
          dof: grid?.mechanismSrv.mechanisms[0]?.dof,
        };
      })
      .catch(() => ({ joints: 0 }));

  // Bounded wait: the decode happens in a service constructor, so the model can
  // land a frame or two after the page settles.
  let model = await readModel();
  for (let attempt = 0; attempt < 20 && !model.joints; attempt++) {
    await page.waitForTimeout(500);
    model = await readModel();
  }
  if (!model.joints) throw new Error(`${id} decoded to nothing`);

  // The same fit a shared link gets; re-run because the first one races the
  // initial layout, and an off-centre thumbnail is the usual result.
  await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).svgGrid.scaleToFitLinkage()
  );
  await page.waitForTimeout(800);

  // Grid, ruling and axes off, the way the five original cards were shot: at
  // card size the ruling reads as noise and the mechanism is the subject. This
  // is the app's own flag for it, the one `fit` already uses.
  await page.evaluate(() => {
    ng.getComponent(document.querySelector('app-new-grid')).settings.tempGridDisable = true;
  });
  // The flag is read straight from the template, and a value set from outside
  // Angular schedules no change detection. A real pointer event does, because
  // zone.js patches the listener.
  await page.mouse.move(750, 500);
  // ...but a pointer resting on a link highlights it, and a highlighted link
  // draws its name. The oscillating fan's head is a wide triangle across the
  // middle of the canvas, so its card came out with "ACN" printed on it. Move
  // off into the corner: the second move schedules change detection just as
  // well and leaves nothing under the cursor.
  await page.mouse.move(4, 4);
  // The panels float over the canvas, so a clip centred on the mechanism can
  // still catch a corner of one. They are overlays and hiding them moves
  // nothing.
  await page.addStyleTag({
    content:
      'app-top-bar, app-bottombar, app-left-tabs, app-right-panel, app-playback-bar,' +
      ' app-view-controls { display: none !important }',
  });
  await page.waitForTimeout(800);

  // Clip to what was drawn, not to the window. #canvas is the full viewport,
  // so screenshotting it would put the toolbar and the side panels on the card;
  // the union of the holders is the mechanism and nothing else.
  const drawn = await page.evaluate(() => {
    const holders = [
      '#linkHolder',
      '#jointHolder',
      '#sliderHolder',
      '#railHolder',
      '#motorHolder',
      '#motorArrowHolder',
    ];
    const rects = holders
      .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      .filter((rect) => rect && rect.width > 0 && rect.height > 0);
    return {
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
  });

  // A margin off the longer side, then grown to the card's aspect so sips only
  // has to scale and never crops something back off.
  const pad = 0.14 * Math.max(drawn.right - drawn.left, drawn.bottom - drawn.top);
  const cx = (drawn.left + drawn.right) / 2;
  const cy = (drawn.top + drawn.bottom) / 2;
  let width = drawn.right - drawn.left + 2 * pad;
  let height = drawn.bottom - drawn.top + 2 * pad;
  if (width / height < WIDTH / HEIGHT) width = (height * WIDTH) / HEIGHT;
  else height = (width * HEIGHT) / WIDTH;

  const view = page.viewportSize();
  const shot = join(scratch, `${name}.png`);
  await page.screenshot({
    path: shot,
    animations: 'disabled',
    clip: {
      x: Math.max(0, Math.min(cx - width / 2, view.width - width)),
      y: Math.max(0, Math.min(cy - height / 2, view.height - height)),
      width: Math.min(width, view.width),
      height: Math.min(height, view.height),
    },
  });

  captured.push({ id, name, shot });
  console.log(`${id}: dof ${model.dof}, ${model.joints} joints`);
}

await browser.close();

// Only now: anything written under src/ makes the dev server reload the page
// mid-run, which lands on the query-stripped URL and decodes an empty grid.
// That failure looks exactly like a bad payload, so the writes wait for the end.
for (const { name, shot } of captured) {
  // Down to card size, which also strips the metadata Playwright writes, so
  // nine images together cost less than one of the existing GIFs.
  execFileSync('sips', [
    '-s',
    'format',
    'png',
    '-s',
    'formatOptions',
    'best',
    '-z',
    String(HEIGHT),
    String(WIDTH),
    shot,
    '--out',
    join(ASSETS, `${name}.png`),
  ]);
  console.log(`wrote ${ASSETS}/${name}.png`);
}
rmSync(scratch, { recursive: true, force: true });
