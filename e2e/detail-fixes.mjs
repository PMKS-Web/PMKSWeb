/**
 * The small things, in a browser.
 *
 * Each of these is a fix a reader reported by pointing at the screen, and each
 * is invisible to a unit test: what a cursor turns into, what colour a warning
 * is in a mode that cannot act on it, whether a panel keeps its scroll.
 *
 *   PMKS_BASE_URL=<origin> node e2e/detail-fixes.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const dev = readFileSync('src/app/component/MODALS/templates/dev-templates.ts', 'utf8');
const payloads = Object.fromEntries(
  [...(source + dev).matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [
    id,
    p.replace(/\\\\/g, '\\'),
  ])
);

/**
 * Three machines in one drawing: a ram, a rocker and a crank, with the ram
 * first. Reported by a reader whose ram had no graphs and whose combined
 * handle ran the whole drawing backwards when dragged.
 */
const THREE_MACHINES =
  '2O.Ay,Fe.5,4x.1011.4O,O,0,0,0.0C,C,YJ,qG,0.4G,G,ku,0,0.0N,N,aM,hl,0.8P,P,ir,8X,0.ZS,S,ir,8X,0,GN,G,N.0T,T,nJ,oD,0.0U,U,1Nd,dn,0.6V,V,1ca,jH,0,,,,1E8.6W,W,J-,1GP,0.0X,X,PF,1dt,0.0Y,Y,rW,1g7,0.4Z,Z,-P,1FX,0.0%5B,%5B,1Tk,16n,0.0%5C,%5C,1ft,1bA,0.0%5E,%5E,1pZ,1Gc,0.0_,_,1_5,_W,0.0%60,%60,2AU,1OV,0.1a,a,2AU,1OV,0..YROC,OC,Fe,Fe,HA,Q8,c5cae9,O,C,,.YRGN,GN,Fe,Fe,fd,Lu,303e9f,G,N,,.YRPC,PC,Fe,Fe,da,UO,0d125a,P,C,,.YPPS,PS,Fe,0,0,0,,P,S,,.YRGT,GT,Fe,Fe,m5,P7,c5cae9,G,T,,.YRTU,TU,Fe,Fe,14T,i-,303e9f,T,U,,.YRUV,UV,Fe,Fe,1V5,gX,0d125a,U,V,,.YRWX,WX,Fe,Fe,Md,1S8,B2DFDB,W,X,,.YRXY,XY,Fe,Fe,dN,1f0,26A69A,X,Y,,.YRYZ,YZ,Fe,Fe,wS,1Sr,00695C,Y,Z,,.YR%5B%5C,%5B%5C,Fe,Fe,1Zp,1Lz,c5cae9,%5B,%5C,,.YR_%60,_%60,Fe,Fe,24I,1BV,B2DFDB,_,%60,,.YP%60a,%60a,Fe,0,0,0,,%60,a,,...N_b';

/** Two joints and a bar: in no mechanism, so nothing about it can be analysed. */
const LONE_BAR =
  '2P.Zz,1E8.5,0.1011.0A,A,2UW,9v,0.0B,B,3E8,1Zn,0..YRAB,AB,Fe,Fe,2sK,sr,303e9f,A,B,,...N_P';

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', (error) => errors.push(String(error)));

const load = async (payload) => {
  await page.goto(`${BASE}/${payload ? '?' + payload : ''}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(500);
};

// --- names run out of letters into more letters ----------------------------
await load(payloads['4-Bar']);
const names = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const taken = [];
  const given = [];
  for (let i = 0; i < 60; i++) {
    const next = srv.determineNextLetter(taken);
    given.push(next);
    taken.push(next);
  }
  return given;
});
record(
  'a drawing that outgrows the alphabet keeps being given letters',
  names.every((name) => /^[A-Za-z]+$/.test(name)),
  names.filter((name) => !/^[A-Za-z]+$/.test(name)).slice(0, 6)
);
record('and never the same name twice', new Set(names).size === names.length, names);

// --- renaming is an edit, and Undo takes it back ---------------------------
await load(payloads['4-Bar']);
await page.locator('#joint_B').first().click({ force: true });
await page.waitForTimeout(600);
const renamed = await page.evaluate(() => {
  const title = ng.getComponent(document.querySelector('editable-title-block'));
  title.gotoEditMode();
  title.newIDForm.patchValue({ newID: 'Elbow' });
  title.saveNewID();
  return ng
    .getComponent(document.querySelector('app-new-grid'))
    .mechanismSrv.joints.map((joint) => joint.name);
});
record('a joint can be renamed', renamed.includes('Elbow'), renamed);
await page.waitForTimeout(700);
await page.locator('.historyButton').first().click();
await page.waitForTimeout(1000);
const afterUndo = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.map((j) => j.name)
);
record('and Undo takes the rename back', !afterUndo.includes('Elbow'), afterUndo);

// --- a long name on a bar is written along it ------------------------------
const tags = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return grid.mechanismSrv.getLinks().map((link) => {
    const tag = grid.linkLabelStyle(link);
    return { id: link.id, name: tag.name, angle: tag.angle, joints: link.joints.length };
  });
});
record(
  'a two-letter name is written level',
  tags.every((tag) => tag.angle === 0),
  tags
);

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const bar = grid.mechanismSrv.links.find((link) => link.joints.length === 2);
  bar.name = 'Coupler';
});
await page.waitForTimeout(400);
const named = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const bar = grid.mechanismSrv.links.find((link) => link.joints.length === 2);
  return grid.linkLabelStyle(bar);
});
record('a longer one runs along the bar', named.angle !== 0, named);
record('and never upside down', Math.abs(named.angle) <= 90, named);

// --- analysis mode: no move cursor, no red on scenery ----------------------
await load(payloads['Dev_All_Mechanism_Types']);
const inkIn = async (mode) => {
  if (mode) await page.locator('.tabButton', { hasText: mode }).click({ force: true });
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = document.querySelector('#jointHolder svg[cursor="move"]');
    return {
      ink: grid.orphanMarkInk,
      cursor: joint ? getComputedStyle(joint).cursor : null,
      locked: grid.geometryLocked,
    };
  });
};
const editing = await inkIn(null);
record('a loose joint is marked in red while it can be fixed', editing.ink === '#F44336', editing);
record('and the parts say they can be dragged', editing.cursor === 'move', editing);

const analysing = await inkIn('Kinematic');
record(
  'the same mark goes grey once the mode cannot act on it',
  analysing.ink !== '#F44336',
  analysing
);
record(
  'and the cursor stops offering a drag that will not happen',
  analysing.cursor === 'pointer',
  analysing
);

// --- a drawing that cannot be analysed sends you back to Edit --------------
await load(payloads['4-Bar']);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(700);
const wasAnalysing = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-top-bar')).tabs.isAnalysisMode()
);
// Through the same call the library and the Open dialog both make.
await page.evaluate((payload) => {
  ng.getComponent(document.querySelector('app-top-bar')).urlProcessor.updateFromURL(
    payload,
    true,
    true,
    true
  );
}, LONE_BAR);
await page.waitForTimeout(2000);
const nowEditing = await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-top-bar'));
  return { analysis: bar.tabs.isAnalysisMode(), valid: bar.mechanism.oneValidMechanismExists() };
});
record(
  'opening a drawing nothing can be analysed in leaves the analysis modes',
  wasAnalysing && !nowEditing.valid && !nowEditing.analysis,
  { wasAnalysing, nowEditing }
);

// --- the legend says what the plot is drawing ------------------------------
await load(payloads['4-Bar']);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(700);
await page.locator('#joint_B').first().click({ force: true });
await page.waitForTimeout(700);
await page.getByText('Velocity of Joint B').first().click({ force: true });
await page.waitForTimeout(1800);
const legend = await page.evaluate(() => {
  const section = [...document.querySelectorAll('app-analysis-graph-section')].find((node) =>
    node.querySelector('.graphSection.open')
  );
  const component = ng.getComponent(section);
  // viewChild is a signal now: the child is behind a call.
  const graph = typeof component.graph === 'function' ? component.graph() : component.graph;
  const lit = [...section.querySelectorAll('.previewSeries')].map(
    (node) => !node.classList.contains('off')
  );
  return {
    lit,
    drawn: ['x', 'y', 'z'].map((key) => graph.isSeriesShown(key)),
    plotted: graph.displayedSeries.length,
  };
});
record(
  'the legend and the plot agree the moment a graph opens',
  legend.lit.filter(Boolean).length === legend.plotted,
  legend
);

// --- toggling a series does not move the panel under the pointer -----------
await page.getByText('Acceleration of Joint B').first().click({ force: true });
await page.waitForTimeout(1500);
const scroller = '.panel';
await page.evaluate((selector) => {
  const node = document.querySelector(selector);
  node.scrollTop = node.scrollHeight;
}, scroller);
await page.waitForTimeout(400);
const before = await page.evaluate((s) => document.querySelector(s).scrollTop, scroller);
const lastLegend = page
  .locator('app-analysis-graph-section')
  .last()
  .locator('.previewSeries')
  .last();
await lastLegend.click({ force: true });
await page.waitForTimeout(900);
const after = await page.evaluate((s) => document.querySelector(s).scrollTop, scroller);
record('turning a line off leaves the panel where it was', Math.abs(after - before) < 12, {
  before,
  after,
});

// --- Export Data ------------------------------------------------------------
// The corner card opens the export drawer rather than writing a file on the
// spot; what the drawer then does is `e2e/export-flow.mjs`.
await load(payloads['4-Bar']);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(700);
record(
  'with a solved mechanism there is something to export, selection or not',
  !(await page.locator('.historyCard button').first().isDisabled()),
  {}
);
await page.locator('.historyCard button').first().click();
await page.waitForTimeout(700);
record(
  'and the corner card opens the drawer that asks what to write',
  (await page.locator('app-export-panel').count()) === 1
);

// --- three machines at once -------------------------------------------------
await load(THREE_MACHINES);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(900);

// Every graph of the first machine, which is cylinder-driven and was solved
// before the other two were solved over the top of its solver state.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((j) => j.id === 'C'));
});
await page.waitForTimeout(800);
await page.evaluate(() =>
  document.querySelector('app-analysis-graph-section .graphHeader')?.click()
);
await page.waitForTimeout(1500);
const firstMachine = await page.evaluate(() => {
  const graph = ng.getComponent(document.querySelector('app-analysis-graph'));
  const plotted = (prop, part) => {
    graph.determineChart('kinematic', 'loop', prop, part);
    const series = graph.chartOptions?.series ?? [];
    return series.map((s) => (s.data ?? []).filter((point) => Number.isFinite(point?.y)).length);
  };
  return {
    velocity: plotted('Linear Joint Vel', 'C'),
    acceleration: plotted('Linear Joint Acc', 'C'),
    linkVelocity: plotted('Angular Link Vel', 'OC'),
    frames: ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0]
      .joints.length,
  };
});
record(
  'the first machine still has rates after the others were solved over it',
  [firstMachine.velocity, firstMachine.acceleration, firstMachine.linkVelocity].every(
    (series) => series.length > 0 && series.every((n) => n === firstMachine.frames)
  ),
  firstMachine
);

// The combined handle measures time, so dragging it never runs anything back.
const swept = await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-playback-bar'));
  if (!bar.synced) bar.toggleSync();
  const srv = bar.mechanism;
  const row = bar.rows.find((r) => r.index === -1);
  if (!row) return null;
  const seen = [];
  for (let value = 0; value <= 1000; value += 5) {
    bar.scrubRow(row, { target: { value: String(value) } });
    seen.push(srv.mechanisms.map((_, i) => srv.secondsOf(i)));
  }
  const period = srv.mechanisms.map((m) => m.cyclePeriod);
  // A shorter cycle legitimately starts again part way along the longest one.
  // Anything else going backwards is the handle disagreeing with itself.
  const backwards = period.map((_, machine) => {
    let count = 0;
    for (let i = 1; i < seen.length; i++) {
      const step = seen[i][machine] - seen[i - 1][machine];
      if (step < -1e-9 && seen[i - 1][machine] < period[machine] - 0.5) count++;
    }
    return count;
  });
  return { backwards, wraps: period.map((p) => Math.round((p / Math.max(...period)) * 200)) };
});
record(
  'dragging the combined handle only ever moves time forwards',
  !!swept && swept.backwards.every((n) => n === 0),
  swept
);

// --- a graph's playhead is on its own machine's clock -----------------------
const playhead = await page.evaluate(async () => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  const bar = ng.getComponent(document.querySelector('app-playback-bar'));
  if (bar.synced) bar.toggleSync();
  // A joint of the second machine, graphed.
  grid.activeObjService.updateSelectedObj(srv.joints.find((joint) => joint.id === 'T'));
  await new Promise((done) => setTimeout(done, 700));
  // Only if nothing is open: the sections remember which quantity was
  // expanded, so a click here would close the one already showing.
  if (!document.querySelector('app-analysis-graph')) {
    document.querySelector('app-analysis-graph-section .graphHeader')?.click();
    await new Promise((done) => setTimeout(done, 1600));
  }
  // Park it, and run the first machine instead.
  srv.seekMechanism(1, 3);
  if (!srv.isMechanismPlaying(0)) srv.toggleMechanismPlaying(0);
  const label = () => document.querySelector('.apexcharts-xaxis-annotation-label')?.textContent;
  const before = { at: label(), running: srv.secondsOf(0), parked: srv.secondsOf(1) };
  await new Promise((done) => setTimeout(done, 1500));
  const after = { at: label(), running: srv.secondsOf(0), parked: srv.secondsOf(1) };
  if (srv.isMechanismPlaying(0)) srv.toggleMechanismPlaying(0);
  // Back to one handle for the checks that follow.
  if (!bar.synced) bar.toggleSync();
  return { before, after };
});
record(
  'the other machine really is running',
  playhead.after.running > playhead.before.running + 0.2,
  playhead
);
record(
  "a paused machine's graph keeps its playhead where the machine is",
  playhead.before.at === playhead.after.at && playhead.after.at === 'T= 3.0',
  playhead
);

// --- the combined row's name is a label, not a control ----------------------
// One handle again, which is the only arrangement that has a combined row.
await page.waitForTimeout(900);
const allChip = await page.evaluate(() => {
  const chip = [...document.querySelectorAll('.mechChip')].find(
    (node) => node.textContent.trim() === 'All'
  );
  if (!chip) return null;
  return {
    tag: chip.tagName,
    selectable: getComputedStyle(chip).userSelect,
    selected: chip.classList.contains('selected'),
  };
});
record(
  'the combined row is named by a label that cannot be pressed or selected',
  !!allChip && allChip.tag === 'SPAN' && allChip.selectable === 'none' && !allChip.selected,
  allChip
);

// --- one switch for every traced path ---------------------------------------
const traces = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const button = [...document.querySelectorAll('.viewControls .viewButton')].find((node) =>
    (node.getAttribute('aria-label') ?? '').includes('traced')
  );
  const drawn = () => document.querySelectorAll('#pathsHolder path').length;
  if (!button) return null;
  const disabledWithNone = button.disabled;
  // Ask two joints to trace, as the Edit panel does.
  grid.mechanismSrv.joints.slice(0, 2).forEach((joint) => (joint.showCurve = true));
  grid.mechanismSrv.updateMechanism();
  return { disabledWithNone, drawn: drawn() };
});
await page.waitForTimeout(900);
const tracesAfter = await page.evaluate(() => {
  const button = [...document.querySelectorAll('.viewControls .viewButton')].find((node) =>
    (node.getAttribute('aria-label') ?? '').includes('traced')
  );
  const drawn = () => document.querySelectorAll('#pathsHolder path').length;
  const withTraces = drawn();
  button.click();
  return { withTraces };
});
await page.waitForTimeout(500);
const hidden = await page.evaluate(() => document.querySelectorAll('#pathsHolder path').length);
record(
  'with nothing tracing, the traces switch is greyed',
  traces?.disabledWithNone === true,
  traces
);
record('two joints asked to trace draw two paths', tracesAfter.withTraces === 2, tracesAfter);
record('and the switch puts every one of them away', hidden === 0, { hidden });

// --- the transport comes and goes; the view controls do not ----------------
const controlsAt = () =>
  page.evaluate(() => {
    const box = document.querySelector('.viewControls').getBoundingClientRect();
    return {
      right: Math.round(innerWidth - box.right),
      bottom: Math.round(innerHeight - box.bottom),
    };
  });
await load(payloads['4-Bar']);
const inEdit = await controlsAt();
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(900);
const inAnalysis = await controlsAt();
record(
  'the view controls sit in the same place in both modes',
  inEdit.right === inAnalysis.right && inEdit.bottom === inAnalysis.bottom,
  { inEdit, inAnalysis }
);

// --- the three view switches say their state the same way -------------------
const buttons = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.viewControls .viewButton')].map((button) => {
      const icon = button.querySelector('mat-icon');
      return {
        name: button.getAttribute('aria-label'),
        glyph: icon?.getAttribute('data-mat-icon-name') ?? icon?.textContent.trim() ?? '',
        on: button.classList.contains('on'),
        disabled: button.disabled,
        tinted: getComputedStyle(button).backgroundColor !== 'rgba(0, 0, 0, 0)',
        ink: getComputedStyle(icon).color,
        // A glyph that names its own colour ignores the button's, which is how
        // the traced-paths switch stayed black in a row that had greyed out.
        // Painted geometry only. A <clipPath> child is used for its shape and
        // never drawn, and the export tool leaves a fill="white" on it that
        // means nothing -- counting those would fail an icon that is fine.
        selfPainted: [...(icon?.querySelectorAll('svg *') ?? [])]
          .filter((node) => !node.closest('defs, clipPath, mask'))
          .some((node) =>
            ['fill', 'stroke'].some((attribute) => {
              const value = node.getAttribute(attribute);
              return value !== null && value !== 'none' && value !== 'currentColor';
            })
          ),
      };
    })
  );
const switches = async () => (await buttons()).slice(0, 3);

await load(payloads['4-Bar']);
await page.evaluate(() => {
  // One joint tracing, so all three switches have something to act on.
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.joints[1].showCurve = true;
  grid.mechanismSrv.updateMechanism();
});
await page.waitForTimeout(700);
const asDrawn = await switches();
record(
  'the switches arrive with marks and paths on and labels off',
  asDrawn[0].on && !asDrawn[1].on && asDrawn[2].on,
  asDrawn.map((s) => `${s.name}=${s.on}`)
);
// The glyph draws what is on the grid, so the crossed-out one means hidden.
// The two icon families spell that differently: com/com_off beside
// show_path/hide_path.
const crossedOut = (glyph) => glyph.endsWith('_off') || glyph.startsWith('hide');
record(
  'each glyph draws the state the grid is in, not the one on offer',
  asDrawn.every((s) => s.on === !crossedOut(s.glyph)),
  asDrawn.map((s) => `${s.glyph}:${s.on}`)
);
record(
  'and the tint alone carries it -- every glyph is the same grey',
  asDrawn.every((s) => s.tinted === s.on) && new Set(asDrawn.map((s) => s.ink)).size === 1,
  asDrawn.map((s) => `${s.name} tint=${s.tinted} ink=${s.ink}`)
);

// Nothing left for any of them to do: no mass to mark, no path being traced,
// and on an empty grid no joint to label either.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.links.forEach((link) => (link.mass = 0));
  grid.mechanismSrv.joints.forEach((joint) => (joint.showCurve = false));
  grid.mechanismSrv.updateMechanism();
});
await page.waitForTimeout(700);
const idle = await switches();
// A slider block has a mass and no centre-of-mass mark, so it must not make
// the switch look useful.
await load(payloads['4-Bar']);
const blockOnly = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  srv.links.forEach((link) => (link.mass = 0));
  const block = srv.links.find((link) => link.constructor.name === 'SliderBlock');
  if (block) block.mass = 5;
  srv.updateMechanism(false);
  const button = [...document.querySelectorAll('.viewControls .viewButton')][0];
  return { hasBlock: !!block, disabled: button.disabled };
});
record(
  'a mass on a slider block does not make the centre-of-mass switch look useful',
  !blockOnly.hasBlock || blockOnly.disabled,
  blockOnly
);

// The state a sighted reader gets from the tint has to reach everyone else.
await load(payloads['4-Bar']);
const pressedState = await page.evaluate(() =>
  [...document.querySelectorAll('.viewControls .viewButton')].map((button) => ({
    name: button.getAttribute('aria-label'),
    pressed: button.getAttribute('aria-pressed'),
    on: button.classList.contains('on'),
  }))
);
record(
  'each switch says whether it is on, and the plain actions say nothing',
  pressedState.slice(0, 3).every((b) => b.pressed === String(b.on)) &&
    pressedState.slice(3).every((b) => b.pressed === null),
  pressedState
);

await load(payloads['4-Bar']);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.links.forEach((link) => (link.mass = 0));
  grid.mechanismSrv.joints.forEach((joint) => (joint.showCurve = false));
  grid.mechanismSrv.updateMechanism();
});
await page.waitForTimeout(700);
const idleAgain = await switches();
record(
  'a switch that would change nothing is greyed',
  idleAgain[0].disabled && idleAgain[2].disabled && !idleAgain[1].disabled,
  idleAgain.map((s) => `${s.name}=${s.disabled}`)
);

// The row carries two kinds of button, and says where one kind ends.
const split = await page.evaluate(() => {
  const kids = [...document.querySelector('.viewControls').children];
  const divider = kids.findIndex((node) => node.classList.contains('viewDivider'));
  return { divider, count: kids.length };
});
record(
  'a divider splits the three switches from the three view actions',
  split.divider === 3 && split.count === 7,
  split
);

// --- an empty grid: nothing for any of the three to act on ------------------
await load();
const onEmpty = await buttons();
record(
  'with nothing drawn, all three switches are greyed and the view actions are not',
  onEmpty.slice(0, 3).every((b) => b.disabled) && onEmpty.slice(3).every((b) => !b.disabled),
  onEmpty.map((b) => `${b.name}=${b.disabled}`)
);
// The check above passes on colour alone; this is the one that catches a glyph
// painting itself, which no computed style on the button would show.
record(
  'and every glyph takes the button ink rather than naming its own colour',
  onEmpty.every((b) => !b.selfPainted) &&
    new Set(onEmpty.slice(0, 3).map((b) => b.ink)).size === 1 &&
    new Set(onEmpty.slice(3).map((b) => b.ink)).size === 1,
  onEmpty.map((b) => `${b.glyph} ink=${b.ink} own=${b.selfPainted}`)
);

// --- the setup drawer keeps one gap all round, whatever the transport does --
const drawerGaps = () =>
  page.evaluate(() => {
    const card = document.querySelector('app-analysis-setup .setup')?.getBoundingClientRect();
    const controls = document.querySelector('.viewControls').getBoundingClientRect();
    const strip = document.querySelector('.historyCard').getBoundingClientRect();
    if (!card) return null;
    return {
      above: Math.round(card.top - strip.bottom),
      below: Math.round(controls.top - card.bottom),
      height: Math.round(card.height),
      edges: [Math.round(card.left - controls.left), Math.round(card.right - controls.right)],
    };
  });

await load(THREE_MACHINES);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(900);
await page.evaluate(() => ng.getComponent(document.querySelector('app-top-bar')).openSetup());
await page.waitForTimeout(900);
// A window too short for the list, so the drawer is at its full extent and the
// gap below it is the one being kept rather than wherever the content ended.
await page.setViewportSize({ width: 1500, height: 700 });
await page.evaluate(() =>
  document.querySelectorAll('app-analysis-setup .sectionHeader').forEach((head) => head.click())
);
await page.waitForTimeout(800);
const gapsSynced = await drawerGaps();
record(
  'the gap under the setup drawer matches the gap over it',
  gapsSynced && gapsSynced.above === gapsSynced.below,
  gapsSynced
);
// The drawer takes its width from the view-controls card it stands over, so
// adding a button or the divider between them cannot knock the two out of line.
record(
  'and the drawer stands exactly over the view controls',
  gapsSynced && gapsSynced.edges[0] === 0 && gapsSynced.edges[1] === 0,
  gapsSynced?.edges
);

await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-playback-bar'));
  if (typeof bar.toggleSync === 'function') bar.toggleSync();
});
await page.waitForTimeout(1000);
const gapsUnsynced = await drawerGaps();
record(
  'and a transport that grows a row per machine does not push it up',
  gapsUnsynced &&
    gapsUnsynced.below === gapsSynced.below &&
    gapsUnsynced.height === gapsSynced.height,
  { gapsSynced, gapsUnsynced }
);
await page.setViewportSize({ width: 1500, height: 950 });

// --- the playhead reads a number, not a float -------------------------------
// The samples leave the solver at full precision, so the label beside the
// playhead printed all seventeen digits of it -- "2.6179937801901527" hanging
// off the plot beside a readout of "2.62" for the same instant.
await load(payloads['4-Bar']);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(700);
await page.locator('#joint_B').first().click({ force: true });
await page.waitForTimeout(700);
for (const card of ['Position of Joint B', 'Velocity of Joint B']) {
  await page.getByText(card).first().click({ force: true });
  await page.waitForTimeout(1200);
}
// Off timestep 0, where there is no playhead to label.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const mech = grid.mechanismSrv;
  mech.animate?.(Math.floor((mech.mechanisms[0]?.joints.length ?? 100) * 0.3), false);
});
await page.waitForTimeout(1500);

const plots = await page.evaluate(() =>
  [...document.querySelectorAll('app-analysis-graph')].map((node) => {
    const graph = ng.getComponent(node);
    return {
      prop: graph.mechProp,
      labels: [...node.querySelectorAll('.apexcharts-point-annotation-label')].map((label) =>
        label.textContent.trim()
      ),
      // Every line the plot draws, and how wide a box each occupies. A
      // constant series is zero high, which is the point -- but it still has
      // to run the width of the plot.
      lines: [...node.querySelectorAll('.apexcharts-line-series path.apexcharts-line')].map(
        (path) => Math.round(path.getBoundingClientRect().width)
      ),
      axis: [graph.chartOptions.yaxis?.min, graph.chartOptions.yaxis?.max],
    };
  })
);
const overlong = plots.flatMap((plot) => plot.labels).filter((text) => /\d\.\d{3,}/.test(text));
record('a playhead label stops at two decimals', plots.length > 0 && overlong.length === 0, {
  overlong,
  labels: plots.map((plot) => plot.labels),
});

// --- a constant series is still a line ---------------------------------------
// The speed of a crank pin never changes, and on its own the axis was fitted
// to what little it does change: a window 1.5e-6 wide in which every label
// read "6.2" and the line was lost in the floating-point noise.
const speed = plots.find((plot) => plot.prop === 'Linear Joint Vel');
record(
  'a graph showing only a constant still draws it',
  speed && speed.lines.length === 1 && speed.lines[0] > 50,
  speed
);
record(
  'and its axis is not fitted to floating-point noise',
  speed && speed.axis[1] - speed.axis[0] > 0.5,
  speed?.axis
);

// --- a drawer's close button does not scroll away ---------------------------
// It is positioned against the drawer frame, so a frame that scrolls carries
// it off its own top edge -- gone from the corner while the half of it still
// showing went on taking the click. The card inside is what scrolls.
await page.setViewportSize({ width: 1400, height: 560 });
await page.waitForTimeout(400);
for (const [tab, name] of [
  [1, 'Settings'],
  [3, 'Help'],
  [4, 'Debug'],
]) {
  await page.evaluate((tab) => {
    const panel = ng.getComponent(document.querySelector('app-right-panel'));
    panel.constructor.openTab = tab;
    panel.constructor.isOpen = true;
  }, tab);
  await page.waitForTimeout(700);
  const frame = await page.locator('#rightPanel').boundingBox();
  if (frame) {
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(500);
  }
  const corner = await page.evaluate(() => {
    const button = document.querySelector('.closeDrawer');
    const panel = document.querySelector('#rightPanel');
    if (!button || !panel) return { missing: true };
    const b = button.getBoundingClientRect();
    const f = panel.getBoundingClientRect();
    return {
      inside: b.top >= f.top - 1 && b.bottom <= f.bottom + 1,
      takesTheClick: button.contains(
        document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      ),
      frameScrolled: panel.scrollTop,
    };
  });
  record(
    `the ${name} drawer keeps its close button in the corner`,
    corner.inside && corner.takesTheClick && corner.frameScrolled === 0,
    corner
  );
}

// --- and it is not the last one in the drawer that keeps it visible ---------
// The button used to beat the sticky title it shares a line with on document
// order alone -- both were z-index 2 -- and document order is the one thing a
// compositor is free to decide differently. In Safari it did: the title's white
// background covered the X while the click still went through. Put the button
// at the FRONT of the drawer, which is the worst order there is, and it has to
// stay visible on its own merits.
await page.evaluate((tab) => {
  const panel = ng.getComponent(document.querySelector('app-right-panel'));
  panel.constructor.openTab = tab;
  panel.constructor.isOpen = true;
}, 1);
await page.waitForTimeout(800);
await page.evaluate(() => {
  const frame = document.querySelector('#rightPanel');
  frame.insertBefore(document.querySelector('.closeDrawer'), frame.firstChild);
});
await page.waitForTimeout(400);
const worstOrder = await page.evaluate(() => {
  const btn = document.querySelector('.closeDrawer');
  const b = btn.getBoundingClientRect();
  const top = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2)[0];
  return {
    onTop: btn.contains(top),
    coveredBy: btn.contains(top) ? null : top?.tagName.toLowerCase(),
  };
});
record('and it does not rely on being last in the drawer to be seen', worstOrder.onTop, worstOrder);
await page.setViewportSize({ width: 1500, height: 950 });

// --- a scrolled panel says there is something above it ----------------------
// The title stays put while the card scrolls under it, so a card scrolled off
// its own top read as a card that simply started there.
await load(payloads['4-Bar']);
await page.setViewportSize({ width: 1400, height: 560 });
await page.waitForTimeout(400);
await page.locator('#joint_B').first().click({ force: true });
await page.waitForTimeout(900);
const headShadow = () =>
  page.evaluate(() => {
    const card = document.querySelector('app-edit-panel #normalPanel');
    const head = card?.querySelector(':scope > editable-title-block, :scope > title-block');
    if (!card || !head) return null;
    const shadow = getComputedStyle(head).boxShadow;
    // "rgba(0, 0, 0, 0)" is the resting state: declared, so it fades in.
    return { cast: !/rgba\(0, 0, 0, 0\)/.test(shadow), scrollTop: card.scrollTop, shadow };
  });
const atTop = await headShadow();
record('a card resting at its top casts no shadow', atTop && !atTop.cast, atTop);
const card = await page.locator('app-edit-panel #normalPanel').boundingBox();
if (card) {
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(700);
}
const scrolled = await headShadow();
record(
  'and once it has scrolled, its title shadows what is passing under it',
  scrolled && scrolled.cast && scrolled.scrollTop > 0,
  scrolled
);
await page.setViewportSize({ width: 1500, height: 950 });

// --- one help mark, one behaviour ------------------------------------------
// The mark beside a field used to be a pale grey glyph that did not answer the
// pointer and waited a full second before saying anything; the export drawer's
// lit up and spoke at once. A reader who has learned what it means in one panel
// has learned it in all of them.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((joint) => !joint.ground));
});
await page.waitForTimeout(900);
const marks = await page.evaluate(() =>
  [...document.querySelectorAll('.label-help')].map((mark) => {
    const style = getComputedStyle(mark);
    return `${style.color} ${style.cursor} ${style.transform}`;
  })
);
record(
  'every help mark on screen is drawn the same way',
  marks.length > 0 && new Set(marks).size === 1,
  marks.slice(0, 3)
);

const help = page.locator('.label-help').first();
const restColour = await help.evaluate((mark) => getComputedStyle(mark).color);
await help.hover();
await page.waitForTimeout(650);
record(
  'and answers the pointer, then says what it is for',
  (await help.evaluate((mark) => getComputedStyle(mark).color)) !== restColour &&
    (await page.locator('.mat-mdc-tooltip').count()) === 1,
  { restColour, hovered: await help.evaluate((mark) => getComputedStyle(mark).color) }
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
