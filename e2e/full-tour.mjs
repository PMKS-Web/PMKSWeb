const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/pmks-playwright-profile-${Date.now()}`;
const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const verificationQuery =
  '0P.SS.K,0.101.MA,A,0wS,0bg,0.GB,B,0gW,EE,0.GC,C,Oi,6k,0.GD,D,03m,_g,0.GE,E,1FO,1I_,0.GF,F,1-C,qM,0.KG,G,1oO,0ss,0..YRAB,AB,Fe,Fe,0oU,0Bk,c5cae9,A,B,,.YRBCD,BCD,Fe,Fe,07C,Rt,303e9f,B,C,D,,.YRDE,DE,Fe,Fe,bq,18q,0d125a,D,E,,.YREF,EF,Fe,Fe,1dI,13g,B2DFDB,E,F,,.YRFCG,FCG,Fe,Fe,1Om,1Q,26A69A,F,C,G,,...JGp';
const runPrefix = process.env.RUN_PREFIX || 'tour';
const issues = [];
const events = [];

function recordIssue(title, details = {}) {
  issues.push({ title, ...details });
}

async function shot(page, name, fullPage = true) {
  const file = path.join(screenshotDir, `${runPrefix}-${name}`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

async function appSnapshot(page, label) {
  return await page.evaluate((snapshotLabel) => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    };
    return {
      label: snapshotLabel,
      title: document.title,
      url: location.href,
      hash: location.hash,
      bodyText: document.body.innerText.slice(0, 3500),
      buttons: [...document.querySelectorAll('button,[role=button]')]
        .filter(visible)
        .slice(0, 120)
        .map((el, i) => ({
          i,
          text: el.innerText.trim(),
          aria: el.getAttribute('aria-label'),
          title: el.getAttribute('title'),
          id: el.id,
          className: String(el.className).slice(0, 180),
          rect: (() => {
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            };
          })(),
        })),
      inputs: [...document.querySelectorAll('input, textarea, select')]
        .filter(visible)
        .slice(0, 120)
        .map((el, i) => ({
          i,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type'),
          value: el.value,
          placeholder: el.getAttribute('placeholder'),
          aria: el.getAttribute('aria-label'),
          id: el.id,
          className: String(el.className).slice(0, 180),
        })),
      svgs: [...document.querySelectorAll('svg')].slice(0, 30).map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          i,
          id: el.id,
          className: String(el.className).slice(0, 120),
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
        };
      }),
    };
  }, label);
}

async function clickFirst(page, candidates, label) {
  for (const candidate of candidates) {
    const loc = page.locator(candidate);
    if (await loc.count()) {
      const first = loc.first();
      if (await first.isVisible().catch(() => false)) {
        await first.click({ timeout: 5000 });
        events.push({ action: 'click', label, selector: candidate });
        return true;
      }
    }
  }
  recordIssue(`Could not find control: ${label}`, { severity: 'test-blocker', candidates });
  return false;
}

async function dismissIntro(page) {
  const intro = page.locator('.introjs-tooltip, .introjs-overlay').first();
  if (await intro.isVisible().catch(() => false)) {
    const closeButton = page
      .locator('.introjs-skipbutton, .introjs-tooltipbuttons [role=button]')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true });
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
    events.push({ action: 'dismiss-intro' });
  }
}

async function clickByText(page, re, label) {
  const loc = page.locator('button,[role=button],a', { hasText: re }).first();
  if (await loc.isVisible().catch(() => false)) {
    await loc.click({ timeout: 5000 });
    events.push({ action: 'clickText', label, text: String(re) });
    return true;
  }
  return false;
}

async function clickToolbar(page, labelText) {
  return await clickFirst(
    page,
    [
      `button:has-text("${labelText}")`,
      `[role=button]:has-text("${labelText}")`,
      `text="${labelText}"`,
    ],
    labelText
  );
}

async function checkLayout(page, label) {
  const state = await page.evaluate(
    (snapshotLabel) => ({
      label: snapshotLabel,
      text: document.body.innerText,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth,
      visibleModal: !!document.querySelector('.mat-mdc-dialog-container, .introjs-tooltip'),
    }),
    label
  );
  if (/Degrees of Freedom:\s*NaN/i.test(state.text)) {
    recordIssue('Degrees of Freedom displays NaN', { severity: 'medium', label });
  }
  if (state.scrollWidth > state.clientWidth + 2) {
    recordIssue('Page has horizontal overflow', {
      severity: state.clientWidth < 600 ? 'high' : 'medium',
      label,
      scrollWidth: state.scrollWidth,
      clientWidth: state.clientWidth,
    });
  }
  return state;
}

async function safeStep(name, fn) {
  try {
    events.push({ action: 'step-start', name });
    await fn();
    events.push({ action: 'step-ok', name });
  } catch (error) {
    recordIssue(`Workflow step failed: ${name}`, {
      severity: 'high',
      error: error?.stack || error?.message || String(error),
    });
    events.push({ action: 'step-failed', name });
  }
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});

const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(8000);

page.on('console', (msg) => {
  const text = msg.text();
  events.push({ action: 'console', type: msg.type(), text });
  if (
    ['error', 'warning'].includes(msg.type()) &&
    !/favicon|Angular is running in development mode/i.test(text)
  ) {
    recordIssue(`Console ${msg.type()}: ${text.slice(0, 180)}`, {
      severity: msg.type() === 'error' ? 'medium' : 'low',
    });
  }
});
page.on('pageerror', (error) =>
  recordIssue('Uncaught page error', { severity: 'high', error: error.stack || error.message })
);
page.on('requestfailed', (request) => {
  const failure = request.failure();
  recordIssue(`Request failed: ${request.url()}`, {
    severity: 'medium',
    failure: failure?.errorText,
  });
});

await safeStep('initial load', async () => {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, '01-initial-load.png');
  await checkLayout(page, 'first load with intro');
  await dismissIntro(page);
  await shot(page, '01b-after-intro-dismissed.png');
  await checkLayout(page, 'empty project');
});

const snapshots = [await appSnapshot(page, 'initial')];

await safeStep('open templates/library', async () => {
  await clickToolbar(page, 'Templates');
  await page.waitForTimeout(700);
  await shot(page, '02-template-or-library.png');
  snapshots.push(await appSnapshot(page, 'template/library'));
  const firstTemplateOpen = page
    .locator('.mat-mdc-dialog-container button:has-text("Open")')
    .first();
  if (await firstTemplateOpen.isVisible().catch(() => false)) {
    await firstTemplateOpen.click();
    events.push({
      action: 'click',
      label: 'open first template',
      selector: '.mat-mdc-dialog-container button:has-text("Open")',
    });
  } else {
    recordIssue('Template library opened but no template Open button was visible', {
      severity: 'high',
    });
  }
  await page.waitForTimeout(1000);
  await shot(page, '02b-template-opened.png');
  if (
    await page
      .locator('.mat-mdc-dialog-container')
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    recordIssue('Template Open did not dismiss the Linkage Library modal', { severity: 'high' });
  }
  await checkLayout(page, 'template opened');
  await page.keyboard.press('Escape').catch(() => {});
});

await safeStep('toolbar controls and project actions', async () => {
  await clickToolbar(page, 'Share Project');
  await page.waitForTimeout(500);
  await shot(page, '03-share-url.png');
  await page.keyboard.press('Escape').catch(() => {});

  const downloadPromise = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await clickToolbar(page, 'Save');
  const download = await downloadPromise;
  if (download) {
    events.push({ action: 'download', suggestedFilename: download.suggestedFilename() });
  } else {
    recordIssue('Save did not start a download within 3 seconds', { severity: 'medium' });
  }
  await page.waitForTimeout(500);
  snapshots.push(await appSnapshot(page, 'toolbar actions'));
});

await safeStep('load verification mechanism from shared URL', async () => {
  await page.goto(`${baseUrl}?${verificationQuery}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await dismissIntro(page);
  await shot(page, '03b-verification-mechanism.png');
  await checkLayout(page, 'verification mechanism');
  snapshots.push(await appSnapshot(page, 'verification mechanism'));
});

await safeStep('left panels edit analysis synthesis', async () => {
  const leftButtons = page.locator('button.leftButton');
  for (const [name, index] of [
    ['analysis', 0],
    ['edit', 1],
    ['synthesis', 2],
  ]) {
    await leftButtons.nth(index).click();
    await page.waitForTimeout(700);
    await shot(page, `04-panel-${name}.png`);
    snapshots.push(await appSnapshot(page, `panel ${name}`));
  }
});

await safeStep('settings and equations panels', async () => {
  for (const name of ['Settings', 'Help / Feedback']) {
    await clickToolbar(page, name);
    await page.waitForTimeout(700);
    await shot(page, `05-right-${name.toLowerCase().replace(/[^a-z]+/g, '-')}.png`);
    snapshots.push(await appSnapshot(page, `right ${name}`));
  }
});

await safeStep('canvas interaction', async () => {
  const svg = page.locator('svg').first();
  const box = await svg.boundingBox();
  if (!box) throw new Error('No visible SVG canvas found');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);
  await page.waitForTimeout(300);
  await page.mouse.dblclick(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.waitForTimeout(500);
  await shot(page, '06-canvas-interaction.png');
  snapshots.push(await appSnapshot(page, 'canvas interaction'));
});

await safeStep('animation controls', async () => {
  await clickFirst(
    page,
    ['button:has-text("play_arrow")', 'button:has-text("pause")', 'button >> text=play_arrow'],
    'play/pause'
  );
  await page.waitForTimeout(1100);
  await shot(page, '07-animation-controls.png');
  snapshots.push(await appSnapshot(page, 'animation'));
});

await safeStep('mobile viewport smoke', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await shot(page, '08-mobile-load.png');
  await checkLayout(page, 'mobile');
  snapshots.push(await appSnapshot(page, 'mobile'));
});

await fs.writeFile(
  path.resolve(`artifacts/screenshots/${runPrefix}-workflow-report.json`),
  JSON.stringify({ baseUrl, userDataDir, issues, events, snapshots }, null, 2)
);

await context.close();
console.log(
  JSON.stringify(
    {
      baseUrl,
      userDataDir,
      issueCount: issues.length,
      issues,
      screenshots: await fs.readdir(screenshotDir),
    },
    null,
    2
  )
);
