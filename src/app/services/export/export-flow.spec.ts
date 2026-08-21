import { inject } from '@angular/core';
import { RealJoint } from '../../model/joint';
import { AngleUnit, ForceUnit } from '../../model/unit-enums';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ActiveObjService } from '../active-obj.service';
import { AnalysisSampleService } from '../analysis-sample.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { withTestInjector } from '../../../test-utils/mechanism-harness';
import {
  buildMechanismFixture,
  LEGACY_FORCE_MECHANISM,
  MechanismFixture,
} from '../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { ExportCatalogService } from './export-catalog.service';
import { ExportColumnsService } from './export-columns.service';
import { ExportFlowService } from './export-flow.service';
import { ExportTableService, ExportTable } from './export-table.service';
import { toCsv } from './csv-writer';
import { toXlsx } from './xlsx-writer';
import { plotSvg } from './graph-svg';
import { reportHtml, reportPages } from './report-html';
import { crc32 } from './zip';

/**
 * Every reaction the solver has for a machine, as `joint@body` pairs.
 *
 * What the drawer offers is checked against this rather than against a list
 * written out by hand: the point of leaving a part off is that nothing is lost
 * by it, and only the solver knows what there was to lose.
 */
function fixtureMechanismOf(flow: ExportFlowService, at: number): string[] | undefined {
  const solved = (flow as unknown as { mechanism: MechanismService }).mechanism.mechanisms[at];
  if (!solved?.isMechanismValid()) return undefined;
  const index = solved.getForceAnalysis(flow.forceMode()).reactionIndex;
  return [...index.linksByJoint].flatMap(([joint, bodies]) =>
    bodies.map((body) => `${joint}@${body}`)
  );
}

/** The drawer's three services, over one fixture's mechanism. */
interface Flow {
  flow: ExportFlowService;
  tables: ExportTableService;
  fixture: MechanismFixture;
}

function flowFor(payload: string, options: { forces?: boolean } = {}): Flow {
  const fixture = buildMechanismFixture(payload);
  // The stub service the fixtures build is the panels' one; these three
  // questions are the export drawer's own, so they are answered here rather
  // than added to every panel's fixture.
  Object.assign(fixture.service, {
    readinessOfEachMechanism: () => [
      {
        id: 'M1',
        ready: true,
        checks: [],
        facts: [{ label: 'Input speed', value: '20.00 RPM CW' }],
      },
    ],
    forceAnalysisReady: () => options.forces === true,
  });

  const built = withTestInjector(
    [
      { provide: MechanismService, useValue: fixture.service },
      { provide: ActiveObjService, useValue: fixture.active },
      { provide: SettingsService, useValue: fixture.settings },
      {
        provide: SelectedTabService,
        useValue: {
          getCurrentTab: () => (options.forces ? TabID.FORCE : TabID.ANALYZE),
          isAnalysisMode: () => true,
        } as unknown as SelectedTabService,
      },
      { provide: AnalysisSampleService, deps: [] },
      { provide: ExportCatalogService, deps: [] },
      { provide: ExportColumnsService, deps: [] },
      { provide: ExportFlowService, deps: [] },
      { provide: ExportTableService, deps: [] },
    ],
    () => ({
      flow: inject(ExportFlowService),
      tables: inject(ExportTableService),
    })
  );
  built.flow.reset();
  return { ...built, fixture };
}

function pick(flow: ExportFlowService, ...labels: string[]): void {
  flow
    .partGroups()
    .flatMap((group) => group.parts)
    .filter((part) => labels.includes(part.label))
    .forEach((part) => flow.togglePart(part));
}

describe('the export drawer', () => {
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  it('lists every part of the mechanism, pinned ones included', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    const parts = flow.partGroups().flatMap((group) => group.parts);
    expect(parts.map((part) => part.label)).toEqual([
      'Joint A',
      'Joint B',
      'Joint C',
      'Joint D',
      'Link AB',
      'Link BC',
      'Link CD',
    ]);
    // A pinned joint says what it is and is offered anyway: it has a position
    // worth writing down and a reaction worth reading, and a list that decided
    // which of those the reader meant was a list hiding parts they came for.
    const grounded = parts.find((part) => part.label === 'Joint D')!;
    expect(grounded.note).toContain('grounded');
    expect(parts.every((part) => part.available)).toBe(true);
  });

  it('offers a grounded joint once force analysis is set up, for its reaction', () => {
    const { flow } = flowFor(LEGACY_FORCE_MECHANISM, { forces: true });
    const grounded = flow
      .partGroups()
      .flatMap((group) => group.parts)
      .find((part) => part.note.includes('grounded'))!;
    expect(grounded.available).toBe(true);
    expect(flow.forcesAvailable()).toBe(true);
  });

  it('asks about the quantities the chosen parts turn out to have', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    expect(flow.columnGroups('kinematics').map((group) => group.title)).toEqual(['Joint B']);

    pick(flow, 'Joint C', 'Link AB');
    const groups = flow.columnGroups('kinematics');
    expect(groups.map((group) => group.title)).toEqual(['Joints B, C', 'Link AB']);
    expect(groups[0].columns.map((column) => column.label)).toEqual([
      'Position',
      'Velocity',
      'Acceleration',
    ]);
    expect(groups[1].columns.map((column) => column.label)).toContain('Center of mass');
  });

  it('writes one row per solved sample, on the mechanism’s own clock', () => {
    const { flow, tables, fixture } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    const [table] = tables.tables();
    expect(table.times).toHaveLength(fixture.mechanism.timeNum.length);
    table.times.forEach((time, at) => expect(time).toBeCloseTo(fixture.mechanism.timeNum[at], 12));
    expect(table.columns.every((column) => column.length === table.times.length)).toBe(true);
  });

  it('heads a column with the quantity, the part, the component and the unit', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B', 'Link AB');
    const [table] = tables.tables();
    expect(table.heads[0]).toBe('Time (s)');
    expect(table.heads).toContain('Position B X (cm)');
    expect(table.heads).toContain('Velocity B Mag (cm/s)');
    expect(table.heads).toContain('Angle AB (deg)');
  });

  it('declares how many numbers a column writes, and the sampler agrees', () => {
    const { flow, tables, fixture } = flowFor(LEGACY_FORCE_MECHANISM, { forces: true });
    flow.setParts(flow.offeredParts(), true);
    flow.withMagnitude = true;
    const solved = fixture.mechanism;
    const parts = flow.selectedParts();

    // What the drawer tells a reader a row will write, against what the solver
    // hands back for it. A declaration that drifts is a row promising `X, Y`
    // and a file carrying three columns.
    flow.allColumns().forEach((column) => {
      const declared = column.series.map((series) => series.components);
      const sampled = tables
        .plots(solved, 0, parts, [column])
        .slice(0, declared.length)
        .map((plot) => plot.series.length);
      expect([column.label, sampled]).toEqual([column.label, declared]);
    });
  });

  it('drops the magnitude series when the reader asks for X and Y alone', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    const withMag = tables.tables()[0].heads.length;
    flow.withMagnitude = false;
    const without = tables.tables()[0].heads;
    expect(without.some((head) => head.includes('Mag'))).toBe(false);
    // Velocity and acceleration each lose one; position never had one.
    expect(without.length).toBe(withMag - 2);
  });

  it('rounds every number to the digits the reader chose', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    flow.decimals = 2;
    const csv = toCsv(tables.tables()[0], flow.decimals);
    const cells = csv.split('\n')[1].split(',');
    cells.filter(Boolean).forEach((cell) => {
      expect((cell.split('.')[1] ?? '').length).toBeLessThanOrEqual(2);
    });
  });

  it('splits a file per part when asked, and one per machine at the very least', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B', 'Joint C');
    expect(tables.tables()).toHaveLength(1);
    flow.splitPerPart = true;
    const split = tables.tables();
    expect(split).toHaveLength(2);
    expect(split.map((table) => table.name)).toEqual(['M1_JointB', 'M1_JointC']);
    // The machine's id is not repeated in the file name: the name the reader
    // typed already carries it, and one machine has nothing to be told from.
    expect(split.map((table) => table.suffix)).toEqual(['JointB', 'JointC']);
  });

  it('puts an angular rate into the unit its head claims', () => {
    const { flow, tables, fixture } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Link AB');
    // The solver records an angle in degrees and a rate in radians, so exactly
    // one of these two is converted whichever unit the reader has chosen.
    const inDegrees = tables.tables()[0];
    const degreeRate = inDegrees.plots.find((plot) => plot.head.startsWith('Angular velocity'))!;
    const degreeAngle = inDegrees.plots.find((plot) => plot.head.startsWith('Angle'))!;

    fixture.settings.angleUnit.next(AngleUnit.RADIAN);
    const inRadians = tables.tables()[0];
    const radianRate = inRadians.plots.find((plot) => plot.head.startsWith('Angular velocity'))!;
    const radianAngle = inRadians.plots.find((plot) => plot.head.startsWith('Angle'))!;

    expect(degreeRate.unit).toBe('deg/s');
    expect(radianRate.unit).toBe('rad/s');
    expect(degreeRate.series[0].values[0]).toBeCloseTo(
      radianRate.series[0].values[0] * (180 / Math.PI),
      9
    );
    expect(radianAngle.series[0].values[0]).toBeCloseTo(
      degreeAngle.series[0].values[0] * (Math.PI / 180),
      9
    );
  });

  it('keys a part by its machine, so a shared joint is two rows and two ticks', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    const parts = flow.partGroups().flatMap((group) => group.parts);
    // A chain bolted to another machine's ground shares that pin and is listed
    // under both. Keyed by its letter alone, ticking it under one machine
    // ticked it under the other, and the export wrote a file for a machine the
    // reader had not asked about.
    expect(parts.every((part) => part.key.startsWith('M1|'))).toBe(true);
    expect(new Set(parts.map((part) => part.key)).size).toBe(parts.length);
  });

  it('reaches both ends of a ram, and the drive buried inside it', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['Cylinder_Boom'], { forces: true });
    const ram = flow.offeredParts().find((part) => part.label.startsWith('Cylinder '))!;
    flow.togglePart(ram);
    const labels = flow
      .columnGroups('forces')
      .flatMap((group) => group.columns)
      .map((column) => column.label);

    // A cylinder is one part to the reader and three links to the solver, and
    // its two mounts sit on different ones — so asking about the rod alone gave
    // the force at one end of a ram and nothing at the end it is pushing. The
    // drive is a joint with no marker, no hitbox and no row of its own, which
    // makes this the only place its effort can be asked for.
    expect(labels.filter((label) => label.startsWith('Force at Joint ')).length).toBe(2);
    expect(labels).toContain('Input force');
  });

  it('lists a slider as the one part a reader can point at', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['Scotch_Yoke'], { forces: true });
    const parts = flow.offeredParts();

    // A slot is a joint to the solver and nothing at all to a reader: a
    // zero-sized marker, no hitbox, no panel. Nor is the block between them,
    // which is a zero-length link binding one to the other.
    expect(parts.map((part) => part.label)).toEqual([
      'Joint A',
      'Joint B',
      'Joint C',
      'Joint D',
      'Link AB',
      'Link CD',
    ]);
  });

  it('gives a pin the force in its bar and the force in its slot, and no more', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['Slider_Crank'], { forces: true });
    const pin = flow.offeredParts().find((part) => part.note.includes('slider'))!;
    flow.togglePart(pin);
    const columns = flow.columnGroups('forces').flatMap((group) => group.columns);

    // Two numbers, not four. The block's force at the pin is the bar's force
    // negated, and its force in the slot is the one thing it has of its own —
    // so a reader is offered the bar and the slot, and nothing named after a
    // joint or a body they have never seen.
    expect(columns.map((column) => column.label)).toEqual([
      'Force on Link BC',
      'Force on the ground',
    ]);
    expect(columns.some((column) => /Block|Joint D/.test(column.label))).toBe(false);
  });

  it('writes a reaction once, however many of its two sides are chosen', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar'], { forces: true });
    // At a pin joining two bodies the solver holds one force and its negative,
    // so a joint's view and a body's view of it are the same column twice.
    flow.setParts(flow.offeredParts(), true);
    const written = flow
      .columnGroups('forces')
      .flatMap((group) => group.columns)
      .map((column) => `${column.series[0].mechPart}@${column.series[0].reactionLinkId}`);
    expect(new Set(written).size).toBe(written.length);
    expect(new Set(tables.tables()[0].heads).size).toBe(tables.tables()[0].heads.length);
  });

  it('stands a sealed cylinder in the list as one part, not as its pieces', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['Cylinder_Boom']);
    const labels = flow.partGroups().flatMap((group) => group.parts.map((part) => part.label));

    // The ram under the two mounts a reader can point at, and none of the
    // barrel, piston or buried pins it is assembled from.
    expect(labels.some((label) => label.startsWith('Cylinder '))).toBe(true);
    expect(labels.some((label) => label.startsWith('Rod '))).toBe(false);
    expect(labels.some((label) => label.startsWith('Barrel '))).toBe(false);
    expect(labels.some((label) => label.startsWith('Piston '))).toBe(false);
    expect(labels.some((label) => label.startsWith('Block '))).toBe(false);
  });

  it('gives each of a link’s reactions its own tick', () => {
    const { flow } = flowFor(LEGACY_FORCE_MECHANISM, { forces: true });
    const link = flow
      .partGroups()
      .flatMap((group) => group.parts)
      .find((part) => part.kind === 'link')!;
    flow.togglePart(link);
    flow.step = 'forces';
    const columns = flow.columnGroups('forces').flatMap((group) => group.columns);
    expect(columns.length).toBeGreaterThan(1);
    expect(new Set(columns.map((column) => column.key)).size).toBe(columns.length);

    flow.toggleColumn(columns[0]);
    expect(flow.isColumnPicked(columns[0])).toBe(false);
    expect(flow.isColumnPicked(columns[1])).toBe(true);
  });

  it('keeps a report whole when the file step was last left splitting per part', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B', 'Joint C');
    flow.splitPerPart = true;
    expect(tables.tables()).toHaveLength(2);
    // A report is per machine whatever that control last said, because the
    // report writer takes one table per machine and would drop the rest.
    flow.format = 'report';
    expect(tables.tables()).toHaveLength(1);
  });

  it('forecasts the same files, names and heads that it goes on to write', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B', 'Joint C', 'Link AB');

    // The counts under a reader's hand are arithmetic over the selection, and
    // the file is the solved cycle. A forecast that disagrees with what gets
    // written is worse than no forecast at all.
    for (const split of [false, true]) {
      flow.splitPerPart = split;
      for (const format of ['csv', 'xlsx'] as const) {
        flow.format = format;
        const planned = tables.plan();
        const written = tables.tables();
        expect(planned.map((piece) => piece.name)).toEqual(written.map((table) => table.name));
        expect(planned.map((piece) => piece.suffix)).toEqual(written.map((table) => table.suffix));
        planned.forEach((piece, at) => {
          expect(piece.heads).toEqual(written[at].heads);
          expect(piece.rows).toBe(written[at].times.length);
          expect(piece.plots).toBe(written[at].plots.length);
        });
      }
    }
  });

  it('drops the lists when the drawing stops solving, without being told to', () => {
    const { flow, fixture } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    expect(flow.offeredParts().length).toBeGreaterThan(0);

    // No refresh(): a rebuild that publishes nothing must not leave a drawer
    // offering parts of a mechanism that no longer has any numbers.
    const solving = vi.spyOn(fixture.mechanism, 'isMechanismValid').mockReturnValue(false);
    expect(flow.offeredParts()).toHaveLength(0);
    expect(flow.canExport()).toBe(false);
    solving.mockRestore();
    expect(flow.offeredParts().length).toBeGreaterThan(0);
  });

  it('un-chooses a part that has stopped having anything to give', () => {
    const { flow, fixture } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    expect(flow.canExport()).toBe(true);

    const solving = vi.spyOn(fixture.mechanism, 'isMechanismValid').mockReturnValue(false);
    expect(flow.selectedParts()).toHaveLength(0);
    expect(flow.canExport()).toBe(false);

    // The tick itself is kept, so a mechanism that comes back brings it along.
    solving.mockRestore();
    expect(flow.selectedParts()).toHaveLength(1);
  });

  it('heads a force column with the analysis it came from, in the reader’s unit', () => {
    const { flow, tables, fixture } = flowFor(LEGACY_FORCE_MECHANISM, { forces: true });
    fixture.settings.forceUnit.next(ForceUnit.LBF);
    flow.refresh();
    const input = flow
      .partGroups()
      .flatMap((group) => group.parts)
      .find((part) => (part.part as RealJoint).input)!;
    flow.togglePart(input);
    flow.step = 'forces';

    const heads = tables.tables()[0].heads;
    expect(heads.some((head) => head.startsWith('Static force at'))).toBe(true);
    expect(heads.some((head) => head.includes('input torque') && head.includes('(lbf·in)'))).toBe(
      true
    );
  });
});

describe('what the export is written as', () => {
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  function sample(): { flow: ExportFlowService; table: ExportTable } {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    return { flow, table: tables.tables()[0] };
  }

  it('quotes a CSV head that carries a comma', () => {
    const { flow, table } = sample();
    const doctored = { ...table, heads: ['Time (s)', 'Force at B, on AB X (N)'] } as ExportTable;
    expect(toCsv(doctored, flow.decimals).split('\n')[0]).toContain('"Force at B, on AB X (N)"');
  });

  it('writes a workbook a reader can open: one sheet per table, every part intact', () => {
    const { flow, table } = sample();
    const bytes = toXlsx([table, { ...table, name: 'M1_forces' }], flow.decimals);
    const entries = readZip(bytes);
    expect(entries.map((entry) => entry.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    entries.forEach((entry) => expect(crc32(entry.data)).toBe(entry.crc));
    const workbook = new TextDecoder().decode(entries[2].data);
    expect(workbook).toContain(`name="${table.name}"`);
    expect(workbook).toContain('name="M1_forces"');
    const sheet = new TextDecoder().decode(entries[4].data);
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Time (s)</t>');
    // One head row and one row per solved sample.
    expect(sheet.match(/<row /g)).toHaveLength(table.times.length + 1);
  });

  it('breaks a graph where the solver had nothing to say, rather than drawing through it', () => {
    const { table } = sample();
    const plot = table.plots.find((candidate) => candidate.head.startsWith('Velocity'))!;
    const gapped = {
      ...plot,
      series: [
        {
          name: 'X',
          values: plot.series[0].values.map((value, at) =>
            at > 100 && at < 140 ? Number.NaN : value
          ),
        },
      ],
    };
    const svg = plotSvg(gapped, table.times, { width: 640, height: 360, standalone: true });
    // Two runs, two lines. Joined into one, the picture drew a straight line
    // through exactly the positions it has no answer for -- where the panel's
    // own chart leaves a hole.
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    const before = gapped.series[0].values.slice(0, 101).filter(Number.isFinite).length;
    expect(before).toBeGreaterThan(0);
  });

  it('draws a graph with a line per series', () => {
    const { table } = sample();
    const plot = table.plots.find((candidate) => candidate.head.startsWith('Velocity'))!;
    const svg = plotSvg(plot, table.times, { width: 640, height: 360, standalone: true });
    expect(svg.match(/<polyline/g)).toHaveLength(plot.series.length);
    expect(svg).toContain(plot.title);
    expect(svg).toContain(`${table.times[table.times.length - 1].toFixed(2)} s`);
  });

  it('fills the first page with graphs before it starts a second', () => {
    const bare = { heads: ['Time (s)'], rows: [] as string[][] };
    // Three rows of three, which is what the page body holds beside the
    // drawing. Nine used to spill onto a page of its own at seven.
    expect(reportPages({ ...bare, plots: 9 })).toBe(1);
    expect(reportPages({ ...bare, plots: 10 })).toBe(2);
  });

  it('spreads a wide table evenly over the pages it needs', () => {
    // Enough columns to need several passes over the rows. Packed greedily,
    // the last page of an eighty-six column export held the time column and
    // one other while the pages before it held fifteen each.
    const heads = ['Time (s)', ...Array.from({ length: 46 }, (_, at) => `Position P${at} X (cm)`)];
    const rows = Array.from({ length: 3 }, () => heads.map(() => '-1234.567890'));
    const html = reportHtml({
      logoUrl: 'assets/PMKS_logo.png',
      sections: [
        {
          title: 'Analysis — M1',
          subtitle: '',
          dataTitle: 'Data — M1',
          graphsTitle: 'Graphs — M1',
          drawing: '',
          facts: [],
          shareUrl: '',
          plots: [],
          heads,
          rows,
          footer: 'M1',
        },
      ],
    });
    const widths = [...html.matchAll(/<thead><tr>(.*?)<\/tr><\/thead>/g)].map(
      (page) => (page[1].match(/<th>/g) ?? []).length
    );
    expect(widths.length).toBeGreaterThan(2);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  it('paginates the report, and prints the way back to the mechanism on every page', () => {
    const { flow, table } = sample();
    const rows = table.times.map((time) => [String(time), '1', '2']);
    const html = reportHtml({
      logoUrl: 'assets/PMKS_logo.png',
      sections: [
        {
          title: 'Kinematic analysis — M1',
          subtitle: '3 links · 20.00 RPM CW',
          dataTitle: 'Data — M1',
          graphsTitle: 'Graphs — M1',
          drawing: '<svg></svg>',
          facts: [{ label: 'Cycle', value: '3.00 s' }],
          shareUrl: 'https://app.pmksplus.com/?abc',
          plots: [],
          heads: ['Time (s)', 'Position B X (cm)', 'Position B Y (cm)'],
          rows,
          footer: 'M1 · 3 links',
        },
      ],
    });
    const pages = html.match(/<section class="page">/g) ?? [];
    // One first page, then as few pages of table as the rows fit into: a page
    // holds sixty-odd rows of this size, and two columns fit across it easily.
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.length).toBeLessThanOrEqual(1 + Math.ceil(rows.length / 60));
    expect(html.match(/Page 1 of /g)).toHaveLength(1);
    expect(html).toContain(`Page ${pages.length} of ${pages.length}`);
    expect(html).toContain('https://app.pmksplus.com/?abc');
    expect(flow.extension()).toBe('.csv');
  });
});

describe('how much paper the report asks for', () => {
  /** A table of `columns` columns and `rows` rows, at a given number width. */
  function report(rows: number, columns: number, digits: number): string {
    const cell = (-1.0618581).toFixed(digits);
    return reportHtml({
      logoUrl: 'assets/PMKS_logo.png',
      sections: [
        {
          title: 'Kinematic analysis — M1',
          subtitle: '3 links',
          dataTitle: 'Data — M1',
          graphsTitle: 'Graphs — M1',
          drawing: '<svg></svg>',
          facts: [],
          shareUrl: 'https://app.pmksplus.com/?abc',
          plots: [],
          heads: ['Time (s)', ...Array.from({ length: columns }, (_, at) => `Column ${at} (cm)`)],
          rows: Array.from({ length: rows }, () => Array(columns + 1).fill(cell)),
          footer: 'M1',
        },
      ],
    });
  }

  const pagesOf = (html: string): number => (html.match(/<section class="page">/g) ?? []).length;

  it('fills a page before it starts another', () => {
    // A cycle's worth of rows and a wide-ish selection: this was twenty-two
    // pages when a page held forty rows and seven columns.
    const html = report(361, 14, 6);
    expect(pagesOf(html)).toBeLessThanOrEqual(8);

    // The pages of table are filled to about the same depth, so the last one
    // is not a single line of numbers under an inch of heading.
    const perPage = [...html.matchAll(/<tbody>(.*?)<\/tbody>/gs)].map(
      (body) => (body[1].match(/<tr>/g) ?? []).length
    );
    expect(Math.min(...perPage)).toBeGreaterThan(Math.max(...perPage) * 0.8);
  });

  it('leaves room for the heads, so no row falls off the bottom of a page', () => {
    const table = (head: (at: number) => string): number => {
      const html = reportHtml({
        logoUrl: '',
        sections: [
          {
            title: 'M1',
            subtitle: '',
            dataTitle: 'Data',
            graphsTitle: 'Graphs',
            drawing: '',
            facts: [],
            shareUrl: '',
            plots: [],
            heads: ['Time (s)', ...Array.from({ length: 20 }, (_, at) => head(at))],
            // Enough rows that a few fewer per page is a page more.
            rows: Array.from({ length: 3000 }, () => Array(21).fill('-1.061858')),
            footer: 'M1',
          },
        ],
      });
      return (html.match(/<section class="page">/g) ?? []).length;
    };

    // A head wraps down the page in a column half an inch wide, and a page laid
    // out by hand does not carry what does not fit -- it loses it. So a long
    // head has to cost rows, and enough rows cost pages.
    const short = table((at) => `F${at}`);
    const long = table((at) => `Static force at Joint ${at} on Link ABCD Mag (N)`);
    expect(long).toBeGreaterThan(short);
  });

  it('carries every column exactly once across the pages it splits them over', () => {
    // The packer takes as many columns as the widest of them allows, which is a
    // different number on every page -- so what it covers is worth stating.
    const heads = ['Time (s)', ...Array.from({ length: 40 }, (_, at) => `Column ${at} (cm)`)];
    const html = reportHtml({
      logoUrl: '',
      sections: [
        {
          title: 'M1',
          subtitle: '',
          dataTitle: 'Data',
          graphsTitle: 'Graphs',
          drawing: '',
          facts: [],
          shareUrl: '',
          plots: [],
          heads,
          // A mix of narrow and wide, so the pages are not all the same width.
          rows: Array.from({ length: 120 }, () =>
            heads.map((_, at) => (at % 3 === 0 ? '-1234.567890' : '0.01'))
          ),
          footer: 'M1',
        },
      ],
    });
    const seen = [...html.matchAll(/<thead><tr>(.*?)<\/tr><\/thead>/gs)].flatMap((head) =>
      [...head[1].matchAll(/<th>(.*?)<\/th>/g)].map((cell) => cell[1])
    );
    const withoutTime = seen.filter((head) => head !== 'Time (s)');
    const distinct = new Set(withoutTime);
    expect(distinct.size).toBe(40);
    // Each page repeats the time column and nothing else.
    expect(withoutTime.length / (seen.length - withoutTime.length)).toBeGreaterThan(1);
    expect(withoutTime.length % distinct.size).toBe(0);
  });

  it('asks for less paper when the numbers are narrower', () => {
    // Two decimals is a narrower column than six, so more of them fit across a
    // page and the table is split into fewer passes over the same rows.
    expect(pagesOf(report(361, 24, 2))).toBeLessThan(pagesOf(report(361, 24, 6)));
  });

  it('has no page of graphs when they fit beside the mechanism', () => {
    const withFive = reportHtml({
      logoUrl: '',
      sections: [
        {
          title: 'M1',
          subtitle: '',
          dataTitle: 'Data',
          graphsTitle: 'Graphs',
          drawing: '',
          facts: [],
          shareUrl: '',
          plots: Array.from({ length: 5 }, (_, at) => ({
            title: `Plot ${at}`,
            unit: 'cm',
            svg: '<svg></svg>',
            legend: [],
          })),
          heads: ['Time (s)'],
          rows: [],
          footer: 'M1',
        },
      ],
    });
    expect(pagesOf(withFive)).toBe(1);
    expect(withFive).toContain('across3');
  });
});

/** Read back a stored zip: enough of the format to prove this one is well formed. */
function readZip(bytes: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: { name: string; data: Uint8Array; crc: number }[] = [];
  for (let n = 0; n < count; n++) {
    const nameLength = view.getUint16(at + 28, true);
    const size = view.getUint32(at + 24, true);
    const crc = view.getUint32(at + 16, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const localNameLength = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLength + extra;
    entries.push({ name, crc, data: bytes.subarray(start, start + size) });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}
