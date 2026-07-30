const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'focused';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const mechanisms = {
  fourBar:
    '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq',
  sliderCrank:
    '0P.TY.K,0.101.MA,A,0mA,0c,0.GB,B,0Yt,bK,0.GC,C,il,H-,0.LD,D,il,H-,0..YRAB,AB,Fe,Fe,0fW,IN,c5cae9,A,B,,.YRBC,BC,Fe,Fe,4y,Rf,303e9f,B,C,,.YPCD,CD,Fe,0,0,0,,C,D,,...JAe',
  force:
    '0v.cc.K,0.101.Ma,a,0,0,0.Gb,b,fk,1Jz,0.Gc,c,2o7,1sD,0.Kd,d,3Qm,0,0..YRab,Crank,Fe,Fe,Kt,f-,c5cae9,a,b,,.YRbc,Coupler,Fe,Fe,1jw,1b5,303e9f,b,c,,.YRcd,Follower,Fe,Fe,36S,x7,c5cae9,c,d,,..2F1,bc,F1,1AR,1SH,1AR,JF,Fe.R',
};

const issues = [];
const events = [];
const snapshots = [];

function issue(title, details = {}) {
  issues.push({ title, ...details });
}

async function launch(label) {
  const context = await chromium.launchPersistentContext(
    `/tmp/pmks-focused-${label}-${Date.now()}`,
    {
      executablePath: chromePath,
      headless: !process.env.PMKS_HEADED,
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
    }
  );
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(8000);
  page.on('console', (msg) => {
    const text = msg.text();
    events.push({ action: 'console', label, type: msg.type(), text });
    if (
      ['error', 'warning'].includes(msg.type()) &&
      !/Angular is running in development mode|favicon|google-analytics/i.test(text)
    ) {
      issue(`Console ${msg.type()}: ${text.slice(0, 180)}`, {
        severity: msg.type() === 'error' ? 'medium' : 'low',
        label,
      });
    }
  });
  page.on('pageerror', (error) =>
    issue('Uncaught page error', { severity: 'high', label, error: error.stack || error.message })
  );
  return { context, page };
}

async function shot(page, name) {
  const file = path.join(screenshotDir, `${runPrefix}-${name}`);
  await page.screenshot({ path: file, fullPage: true });
}

async function dismissIntro(page) {
  if (
    await page
      .locator('.introjs-tooltip, .introjs-overlay')
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await page
      .locator('.introjs-skipbutton')
      .first()
      .click({ force: true })
      .catch(async () => page.keyboard.press('Escape'));
    await page.waitForTimeout(350);
  }
}

// Playback lives in the Analyze group of the left nav rail, so it only exists
// while that mode is open. The rail buttons toggle their own panel, so clicking
// blindly would close Analyze when it is already open — check first.
async function openAnalyze(page) {
  const playback = page.locator('.playbackControls');
  if ((await playback.count()) === 0) {
    await page.locator('.leftButton', { hasText: 'Analyze' }).click();
    await playback.waitFor({ state: 'visible' });
    await page.waitForTimeout(600); // the tools grow open over 200ms
  }
  return playback;
}

async function menuItems(page) {
  return await page.locator('#contextMenu #menu-item').evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      })
      .map((el) => el.innerText.trim())
  );
}

async function snap(page, label) {
  const s = await page.evaluate((snapshotLabel) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    return {
      label: snapshotLabel,
      url: location.href,
      text: document.body.innerText.slice(0, 2000),
      links: [...document.querySelectorAll('#linkHolder path')]
        .filter(visible)
        .map((el) => ({ id: el.id, rect: rect(el), cls: el.getAttribute('class') || '' })),
      joints: [...document.querySelectorAll('#jointHolder svg')]
        .filter(visible)
        .map((el) => ({ rect: rect(el) })),
      forces: [...document.querySelectorAll('#forcesHolder')]
        .filter(visible)
        .map((el) => ({ rect: rect(el), text: el.outerHTML.slice(0, 250) })),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  }, label);
  snapshots.push(s);
  if (/NaN/.test(s.text))
    issue('Visible NaN in UI', {
      severity: 'medium',
      label,
      excerpt: s.text.match(/.{0,30}NaN.{0,60}/)?.[0],
    });
  if (s.scrollWidth > s.clientWidth + 2)
    issue('Horizontal overflow', {
      severity: s.clientWidth < 600 ? 'high' : 'medium',
      label,
      scrollWidth: s.scrollWidth,
      clientWidth: s.clientWidth,
    });
  return s;
}

async function runCase(name, fn) {
  const { context, page } = await launch(name);
  try {
    events.push({ action: 'case-start', name });
    await fn(page, context);
    events.push({ action: 'case-ok', name });
  } catch (error) {
    issue(`Case failed: ${name}`, {
      severity: 'high',
      error: error?.stack || error?.message || String(error),
    });
    events.push({ action: 'case-failed', name });
  } finally {
    await fs.writeFile(
      path.join(screenshotDir, `${runPrefix}-workflow-report.json`),
      JSON.stringify({ baseUrl, issues, events, snapshots }, null, 2)
    );
    await context.close().catch(() => {});
  }
}

await runCase('link-context', async (page) => {
  await page.goto(`${baseUrl}?${mechanisms.fourBar}`, { waitUntil: 'networkidle', timeout: 60000 });
  await dismissIntro(page);
  await shot(page, 'link-context-loaded.png');
  const s = await snap(page, 'link context loaded');
  if (!s.links.length) throw new Error('No link paths');

  const link = page.locator('#linkHolder path').first();
  await link.hover({ force: true });
  await page.waitForTimeout(400);
  await shot(page, 'link-hover.png');
  await link.click({ button: 'right', force: true });
  await page.waitForTimeout(400);
  const items = await menuItems(page);
  events.push({ action: 'element-right-click', target: 'first link path', items });
  if (!items.includes('Delete Link') || !items.includes('Attach Link')) {
    issue('Right-clicking a visible link path did not show link context menu', {
      severity: 'high',
      items,
    });
  }
  await shot(page, 'link-context-menu.png');
});

await runCase('force-load-context-drag', async (page) => {
  await page.goto(`${baseUrl}?${mechanisms.force}`, { waitUntil: 'networkidle', timeout: 60000 });
  await dismissIntro(page);
  await page.waitForTimeout(800);
  await shot(page, 'force-loaded.png');
  const s = await snap(page, 'force loaded');
  if (!s.forces.length) {
    issue('Force example loaded without visible force group', { severity: 'high' });
    return;
  }
  const force = page.locator('#forcesHolder').first();
  await force.click({ button: 'right', force: true });
  await page.waitForTimeout(400);
  const items = await menuItems(page);
  events.push({ action: 'element-right-click', target: 'force group', items });
  for (const expected of ['Delete Force', 'Make Force Local', 'Switch Force Direction']) {
    if (!items.includes(expected))
      issue(`Force context menu missing ${expected}`, { severity: 'medium', items });
  }
  await page.keyboard.press('Escape');
  const box = await force.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 - 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await shot(page, 'force-drag-after.png');
  await snap(page, 'force drag after');
});

await runCase('pan-zoom-slider', async (page) => {
  await page.goto(`${baseUrl}?${mechanisms.sliderCrank}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await dismissIntro(page);
  await page.waitForTimeout(700);
  await shot(page, 'panzoom-loaded.png');
  const canvas = await page.locator('#canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * 0.7, canvas.y + canvas.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.78, canvas.y + canvas.height * 0.55, {
    steps: 12,
  });
  await page.mouse.up();
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(500);
  await page.locator('button:has-text("zoom_in")').click();
  await page.locator('button:has-text("zoom_out")').click();
  await openAnalyze(page);
  const slider = page.locator('#slider');
  const beforeValue = await slider.inputValue().catch(() => null);
  // The scrubber is a horizontal Material slider rotated 90deg, so it is dragged
  // down its height (min at the top) rather than across its width.
  const r = await page.locator('.verticalSlider').boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * 0.82, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterValue = await slider.inputValue().catch(() => null);
  events.push({ action: 'slider-drag', beforeValue, afterValue });
  if (beforeValue === afterValue)
    issue('Animation slider drag did not change slider value', {
      severity: 'medium',
      beforeValue,
      afterValue,
    });
  await page.locator('.playbackControls .playButton').click();
  await page.waitForTimeout(1000);
  await shot(page, 'panzoom-slider-after.png');
  await snap(page, 'pan zoom slider after');
});

await runCase('template-new-tab', async (page, context) => {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await dismissIntro(page);
  await page.locator('button:has-text("Templates")').click();
  await page.waitForTimeout(600);
  const card = page.locator('.mat-mdc-dialog-container panel-section').first();
  await card.hover();
  await page.waitForTimeout(700);
  await shot(page, 'template-hover.png');
  const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await card.click();
  const newPage = await popup;
  if (!newPage) {
    issue('Template card click did not open a new page/tab', { severity: 'high' });
    return;
  }
  await newPage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await newPage.waitForTimeout(1000);
  await dismissIntro(newPage);
  await shot(newPage, 'template-new-tab.png');
  const s = await snap(newPage, 'template new tab');
  if (!s.links.length)
    issue('Template new tab has no visible links', { severity: 'high', url: newPage.url() });
});

await runCase('mobile-layout', async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}?${mechanisms.sliderCrank}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await dismissIntro(page);
  await page.waitForTimeout(800);
  await shot(page, 'mobile-slidercrank.png');
  await snap(page, 'mobile slider crank');
});

await fs.writeFile(
  path.join(screenshotDir, `${runPrefix}-workflow-report.json`),
  JSON.stringify({ baseUrl, issues, events, snapshots }, null, 2)
);
console.log(
  JSON.stringify(
    {
      baseUrl,
      issueCount: issues.length,
      issues,
      screenshots: (await fs.readdir(screenshotDir)).filter((f) => f.startsWith(`${runPrefix}-`)),
    },
    null,
    2
  )
);
