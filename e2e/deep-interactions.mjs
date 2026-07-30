const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'deep';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/pmks-deep-profile-${Date.now()}`;

const mechanisms = {
  fourBar:
    '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq',
  wattI:
    '0P.TY.K,0.101.MA,A,0Qh,0Kn,0.GB,B,0e1,9i,0.GC,C,bT,LF,0.GD,D,0G5,tZ,0.GE,E,V5,1_z,0.GF,F,1mM,1Gv,0.KG,G,1rt,0ey,0..YRAB,AB,Fe,Fe,0XM,05Z,c5cae9,A,B,,.YRBCD,BCD,Fe,Fe,06D,Sr,303e9f,B,C,D,,.YRDE,DE,Fe,Fe,7W,1RG,0d125a,D,E,,.YREF,EF,Fe,Fe,17j,1dx,B2DFDB,E,F,,.YRFCG,FCG,Fe,Fe,1PE,KQ,26A69A,F,C,G,,...JAp',
  wattII:
    '0P.TY.K,0.101.MA,A,0Vf,0Vd,0.GB,B,0mZ,08A,0.GC,C,06Y,LC,0.GD,D,1MR,J2,0.KE,E,rw,0j2,0.GF,F,2ic,ID,0.KG,G,2lk,0Zt,0..YRAB,AB,Fe,Fe,0e6,0Ju,c5cae9,A,B,,.YRBC,BC,Fe,Fe,0RY,6X,303e9f,B,C,,.YRCDE,CDE,Fe,Fe,ic,01d,0d125a,C,D,E,,.YRDF,DF,Fe,Fe,21X,Id,B2DFDB,D,F,,.YRFG,FG,Fe,Fe,2kA,08r,26A69A,F,G,,...JBm',
  stephensonIII:
    '0P.TY.K,0.101.MA,A,0YP,0ce,0.GB,B,0cQ,0FI,0.GC,C,lC,1-,0.KD,D,ow,0U1,0.GE,E,033,D-,0.GF,F,Dc,nj,0.KG,G,1M0,GJ,0..YRAB,AB,Fe,Fe,0aP,0Qz,c5cae9,A,B,,.YRBCE,BCE,Fe,Fe,1w,E,303e9f,B,C,E,,.YRCD,CD,Fe,Fe,n3,0E1,0d125a,C,D,,.YREF,EF,Fe,Fe,5H,Vs,B2DFDB,E,F,,.YRFG,FG,Fe,Fe,np,X0,26A69A,F,G,,...JBe',
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

async function shot(page, name) {
  const file = path.join(screenshotDir, `${runPrefix}-${name}`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
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
    events.push({ action: 'dismiss-intro' });
  }
}

async function snapshot(page, label) {
  return await page.evaluate((name) => {
    const text = document.body.innerText;
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    return {
      label: name,
      url: location.href,
      text: text.slice(0, 2500),
      dof: (text.match(/Degrees of Freedom:\s*([^\n]+)/i) || [])[1],
      bodyScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.documentElement.clientWidth,
      contextMenuItems: [...document.querySelectorAll('#contextMenu #menu-item')]
        .filter(visible)
        .map((el) => el.innerText.trim()),
      selectedPanelTitle: [...document.querySelectorAll('h1,h2,h3,.title,.label')]
        .filter(visible)
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .slice(0, 20),
      links: [...document.querySelectorAll('#linkHolder path')]
        .filter(visible)
        .map((el) => ({ id: el.id, cls: String(el.getAttribute('class') || ''), rect: rectOf(el) }))
        .slice(0, 30),
      joints: [...document.querySelectorAll('#jointHolder svg')]
        .filter(visible)
        .map((el) => ({ rect: rectOf(el), html: el.outerHTML.slice(0, 160) }))
        .slice(0, 30),
      forces: [...document.querySelectorAll('#forcesHolder')]
        .filter(visible)
        .map((el) => ({ rect: rectOf(el), id: el.querySelector('[id]')?.id || '' }))
        .slice(0, 10),
      tooltips: [...document.querySelectorAll('.mat-mdc-tooltip, .mdc-tooltip, [role="tooltip"]')]
        .filter(visible)
        .map((el) => el.textContent?.trim()),
      modals: [...document.querySelectorAll('.mat-mdc-dialog-container')]
        .filter(visible)
        .map((el) => el.innerText.slice(0, 500)),
    };
  }, label);
}

async function checkCommon(page, label) {
  const s = await snapshot(page, label);
  if (/NaN/.test(s.text))
    issue('Visible NaN in UI', {
      severity: 'medium',
      label,
      excerpt: s.text.match(/.{0,30}NaN.{0,60}/)?.[0],
    });
  if (s.bodyScrollWidth > s.bodyClientWidth + 2)
    issue('Horizontal overflow', {
      severity: s.bodyClientWidth < 600 ? 'high' : 'medium',
      label,
      scrollWidth: s.bodyScrollWidth,
      clientWidth: s.bodyClientWidth,
    });
  return s;
}

async function safe(name, fn) {
  try {
    events.push({ action: 'step-start', name });
    const result = await fn();
    events.push({ action: 'step-ok', name });
    await flushReport();
    return result;
  } catch (error) {
    issue(`Step failed: ${name}`, {
      severity: 'high',
      error: error?.stack || error?.message || String(error),
    });
    events.push({ action: 'step-failed', name });
    await flushReport().catch(() => {});
  }
}

async function flushReport() {
  await fs.writeFile(
    path.join(screenshotDir, `${runPrefix}-workflow-report.json`),
    JSON.stringify({ baseUrl, userDataDir, issues, events, snapshots }, null, 2)
  );
}

async function canvasBox(page) {
  const box = await page.locator('#canvas').boundingBox();
  if (!box) throw new Error('No #canvas bounding box');
  return box;
}

async function rightClickAt(page, x, y, label) {
  await page.mouse.click(x, y, { button: 'right' });
  await page.waitForTimeout(350);
  const items = await page.locator('#contextMenu #menu-item').evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && r.height;
      })
      .map((el) => el.innerText.trim())
  );
  events.push({ action: 'right-click', label, x: Math.round(x), y: Math.round(y), items });
  return items;
}

async function loadMechanism(page, name, query) {
  await page.goto(`${baseUrl}?${query}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(900);
  await dismissIntro(page);
  await page.waitForTimeout(500);
  await shot(page, `mechanism-${name}-loaded.png`);
  return await checkCommon(page, `mechanism ${name}`);
}

async function firstJointCenter(page, index = 0) {
  const joints = await snapshot(page, 'joint-center');
  const j = joints.joints[index] || joints.joints[0];
  if (!j) throw new Error('No visible joints');
  return { x: j.rect.x + j.rect.w / 2, y: j.rect.y + j.rect.h / 2, rect: j.rect };
}

async function firstLinkCenter(page, index = 0) {
  const links = await snapshot(page, 'link-center');
  const l = links.links.find((link) => link.rect.w > 15 && link.rect.h > 15) || links.links[index];
  if (!l) throw new Error('No visible links');
  return { x: l.rect.x + l.rect.w / 2, y: l.rect.y + l.rect.h / 2, rect: l.rect, id: l.id };
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});

const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(8000);

page.on('console', (msg) => {
  const text = msg.text();
  events.push({ action: 'console', type: msg.type(), text });
  if (
    ['error', 'warning'].includes(msg.type()) &&
    !/Angular is running in development mode|favicon|google-analytics/i.test(text)
  ) {
    issue(`Console ${msg.type()}: ${text.slice(0, 180)}`, {
      severity: msg.type() === 'error' ? 'medium' : 'low',
    });
  }
});
page.on('pageerror', (error) =>
  issue('Uncaught page error', { severity: 'high', error: error.stack || error.message })
);
page.on('requestfailed', (request) => {
  if (!/google-analytics|google\.com\/g\/collect/.test(request.url())) {
    issue(`Request failed: ${request.url()}`, {
      severity: 'medium',
      failure: request.failure()?.errorText,
    });
  }
});

await safe('empty grid right-click creates link', async () => {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await dismissIntro(page);
  const box = await canvasBox(page);
  const x1 = box.x + box.width * 0.45;
  const y1 = box.y + box.height * 0.48;
  const items = await rightClickAt(page, x1, y1, 'empty grid');
  if (!items.includes('Add Link'))
    issue('Grid context menu missing Add Link', { severity: 'high', items });
  await page.locator('#contextMenu #menu-item', { hasText: 'Add Link' }).click();
  await page.waitForTimeout(300);
  await page.mouse.move(x1 + 170, y1 + 70);
  await page.waitForTimeout(250);
  await shot(page, 'grid-add-link-preview.png');
  await page.mouse.click(x1 + 170, y1 + 70);
  await page.waitForTimeout(800);
  const s = await checkCommon(page, 'after grid add link');
  snapshots.push(s);
  if (s.links.length < 1 || s.joints.length < 2)
    issue('Add Link did not create a visible link with two joints', {
      severity: 'high',
      links: s.links.length,
      joints: s.joints.length,
    });
  await shot(page, 'grid-add-link-created.png');
});

await safe('joint right-click, hover tooltip, drag joint', async () => {
  const before = await firstJointCenter(page, 1);
  await page.mouse.move(before.x, before.y);
  await page.waitForTimeout(1200);
  await shot(page, 'joint-hover.png');
  const hover = await snapshot(page, 'joint hover');
  snapshots.push(hover);
  const items = await rightClickAt(page, before.x, before.y, 'created joint');
  for (const expected of ['Delete Joint', 'Attach Link', 'Add Ground', 'Add Slider']) {
    if (!items.includes(expected))
      issue(`Joint context menu missing ${expected}`, { severity: 'medium', items });
  }
  await page.keyboard.press('Escape');
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + 55, { steps: 12 });
  await page.waitForTimeout(250);
  await shot(page, 'joint-drag-mid.png');
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await firstJointCenter(page, 1);
  events.push({ action: 'drag-joint', before, after });
  if (Math.abs(after.x - before.x) < 20 && Math.abs(after.y - before.y) < 20)
    issue('Joint drag did not visibly move selected joint', { severity: 'high', before, after });
  await shot(page, 'joint-drag-after.png');
});

await safe('load and stress built-in mechanism types', async () => {
  for (const [name, query] of Object.entries(mechanisms)) {
    const s = await loadMechanism(page, name, query);
    snapshots.push(s);
    if (!s.links.length || !s.joints.length)
      issue(`Mechanism ${name} loaded with no visible links/joints`, { severity: 'high' });
    const link = await firstLinkCenter(page).catch(() => null);
    const joint = await firstJointCenter(page, Math.min(2, Math.max(0, s.joints.length - 1))).catch(
      () => null
    );
    if (link) {
      await page.mouse.move(link.x, link.y);
      await page.waitForTimeout(300);
      const linkItems = await rightClickAt(page, link.x, link.y, `${name} link ${link.id}`);
      if (!linkItems.includes('Delete Link') || !linkItems.includes('Attach Link'))
        issue(`Link context menu incomplete for ${name}`, { severity: 'medium', items: linkItems });
      await page.keyboard.press('Escape');
    }
    if (joint) {
      await page.mouse.move(joint.x, joint.y);
      await page.mouse.down();
      await page.mouse.move(joint.x + 35, joint.y - 25, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await shot(page, `mechanism-${name}-after-joint-drag.png`);
      await checkCommon(page, `${name} after joint drag`);
    }
  }
});

await safe('force mechanism force context and force drag', async () => {
  await loadMechanism(page, 'force-repeat', mechanisms.force);
  const s = await snapshot(page, 'force loaded');
  if (!s.forces.length) {
    issue('Force mechanism did not show a force element', { severity: 'high' });
    return;
  }
  const f = s.forces[0];
  const x = f.rect.x + f.rect.w / 2;
  const y = f.rect.y + f.rect.h / 2;
  const items = await rightClickAt(page, x, y, 'force');
  for (const expected of ['Delete Force', 'Make Force Local', 'Switch Force Direction']) {
    if (!items.includes(expected))
      issue(`Force context menu missing ${expected}`, { severity: 'medium', items });
  }
  await page.keyboard.press('Escape');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y - 50, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await shot(page, 'force-drag-after.png');
  await checkCommon(page, 'force drag after');
});

await safe('pan, wheel zoom, buttons, and animation slider', async () => {
  await loadMechanism(page, 'sliderCrank-panzoom', mechanisms.sliderCrank);
  const before = await snapshot(page, 'before pan zoom');
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.45);
  await page.mouse.down({ button: 'middle' }).catch(async () => page.mouse.down());
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -450);
  await page.waitForTimeout(500);
  await shot(page, 'pan-wheel-zoom.png');
  await page
    .locator('button:has-text("zoom_in")')
    .click()
    .catch(() => {});
  await page
    .locator('button:has-text("zoom_out")')
    .click()
    .catch(() => {});
  const slider = page.locator('#slider');
  if (await slider.isVisible().catch(() => false)) {
    const r = await slider.boundingBox();
    await page.mouse.move(r.x + r.width * 0.1, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.75, r.y + r.height / 2, { steps: 10 });
    await page.mouse.up();
  } else {
    issue('Animation slider not visible', { severity: 'medium' });
  }
  await page
    .locator('button:has-text("play_arrow")')
    .click()
    .catch(() => issue('Play button click failed', { severity: 'medium' }));
  await page.waitForTimeout(900);
  await shot(page, 'animation-slider-after.png');
  const after = await checkCommon(page, 'after pan zoom animation');
  snapshots.push(before, after);
});

await safe('template hover and new-tab behavior', async () => {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await dismissIntro(page);
  await page.locator('button:has-text("Templates")').click();
  await page.waitForTimeout(500);
  const card = page.locator('.mat-mdc-dialog-container panel-section').first();
  await card.hover();
  await page.waitForTimeout(700);
  await shot(page, 'template-card-hover.png');
  const popup = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
  await card.click();
  const newPage = await popup;
  if (!newPage) {
    issue('Template card click did not open a new page/tab', { severity: 'medium' });
  } else {
    await newPage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await newPage.waitForTimeout(1000);
    await dismissIntro(newPage);
    await shot(newPage, 'template-new-tab-loaded.png');
    const s = await checkCommon(newPage, 'template new tab');
    snapshots.push(s);
    if (!s.links.length)
      issue('Template new tab loaded without visible mechanism links', {
        severity: 'high',
        url: newPage.url(),
      });
  }
});

await safe('mobile deep layout', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await shot(page, 'mobile-deep.png');
  snapshots.push(await checkCommon(page, 'mobile deep'));
});

await flushReport();
await context.close().catch(() => {});

console.log(
  JSON.stringify(
    {
      baseUrl,
      userDataDir,
      issueCount: issues.length,
      issues,
      screenshots: (await fs.readdir(screenshotDir)).filter((f) => f.startsWith(`${runPrefix}-`)),
    },
    null,
    2
  )
);
