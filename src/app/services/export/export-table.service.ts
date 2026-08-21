import { Injectable, inject } from '@angular/core';
import { angularScale } from '../../model/analysis-series';
import { RealJoint } from '../../model/joint';
import { Mechanism } from '../../model/mechanism/mechanism';
import { AnalysisSampleService } from '../analysis-sample.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { ExportFlowService } from './export-flow.service';
import { ExportColumn, ExportPart, ExportSeries } from './export-model';

/** One quantity of one part over a whole cycle: a graph, and a run of columns. */
export interface ExportPlot {
  /** `Position of Joint B` — what a graph would be titled. */
  title: string;
  /** `Position B` — what a column head opens with. */
  head: string;
  unit: string;
  columnKey: string;
  partKey: string;
  mechanismIndex: number;
  /** X, Y and Mag where there are three; one unnamed series where there is one. */
  series: { name: string; values: number[] }[];
}

/** A whole file or sheet: a time column, and every series beside it. */
export interface ExportTable {
  /** What this one is called as a sheet: always qualified by its machine. */
  name: string;
  /**
   * What is added to the file name to tell this one from the others.
   *
   * Empty when there is only one file, and free of the machine's id unless
   * there are several machines — the name the reader typed usually carries it
   * already, and `M1_kinematics_M1_JointA.csv` says it twice.
   */
  suffix: string;
  mechanismIndex: number;
  times: number[];
  heads: string[];
  /** Column-major, parallel to `heads` after the time column. */
  columns: number[][];
  plots: ExportPlot[];
}

/**
 * One file the export will produce, described without solving it.
 *
 * Everything the drawer needs to say what it is about to write — how many
 * columns, how many rows, how many printed pages — is decided by the selection
 * and by numbers the mechanism already holds. Sampling a cycle to answer that
 * meant every tick of a checkbox re-solved the whole drawing before the count
 * beside it could change.
 */
export interface ExportPlan {
  name: string;
  suffix: string;
  mechanismIndex: number;
  rows: number;
  heads: string[];
  /** How many graphs this file's columns amount to. */
  plots: number;
  /** What each of those graphs is called, for a picture that carries its title. */
  titles: string[];
}

/**
 * The numbers behind a chosen export, sampled once and shared by every format.
 *
 * A CSV, a workbook, a set of graph images and a report all say the same thing
 * about the same cycle; the only difference is how it is written down. Solving
 * it once here is what keeps them from disagreeing.
 */
@Injectable({ providedIn: 'root' })
export class ExportTableService {
  private flow = inject(ExportFlowService);
  private mechanism = inject(MechanismService);
  private samples = inject(AnalysisSampleService);
  private settings = inject(SettingsService);

  /**
   * The last answer, and what was asked to get it.
   *
   * Building these samples every solved position of every chosen series, and
   * the drawer's own footer asks how wide the file is on every change-detection
   * pass. Without this, moving the mouse over the drawer re-solves the cycle.
   */
  private cache?: { key: string; tables: ExportTable[] };

  /**
   * Every file the current selection asks for.
   *
   * One per machine at the very least: two mechanisms run on their own clocks,
   * so their rows cannot share a time column however much a reader would like
   * one file. Beyond that the reader chooses — a sheet per part, or the whole
   * machine in one.
   */
  tables(): ExportTable[] {
    const key = this.signature();
    if (this.cache?.key !== key) {
      this.cache = { key, tables: this.flow.mechanismIndexes().flatMap((i) => this.tablesFor(i)) };
    }
    return this.cache.tables;
  }

  /**
   * The same tables, sampled without holding the page still.
   *
   * `tables()` walks every selected series across every timestep in one
   * uninterrupted loop. On the Jansen leg with everything ticked that is 361
   * rows by 188 columns, and about half a second in which nothing on the page
   * moves -- including the spinner put there to say the export had started,
   * which cannot paint while the loop it is waiting on owns the thread.
   *
   * So the work comes apart at the series, and the thread goes back to the
   * browser whenever a slice has run long enough to be felt. The drawer is
   * inert while this runs (`.busy` takes its pointer events away), so the
   * selection being read cannot change underneath it.
   */
  async tablesAsync(): Promise<ExportTable[]> {
    const key = this.signature();
    if (this.cache?.key === key) return this.cache.tables;
    const tables: ExportTable[] = [];
    for (const index of this.flow.mechanismIndexes()) {
      for (const piece of this.spread(index)) {
        const table = await this.tableAsync(index, piece);
        if (table.heads.length > 1) tables.push(table);
      }
    }
    this.cache = { key, tables };
    return tables;
  }

  /**
   * Hand the thread back if this slice has run long enough to drop a frame.
   *
   * A yield per series would be a task apiece for eighty-odd of them, most of
   * which take under a millisecond; a yield per slice keeps the overhead where
   * the work is.
   */
  private async breathe(since: number): Promise<number> {
    if (performance.now() - since < 8) return since;
    await yieldToBrowser();
    return performance.now();
  }

  /**
   * Everything the numbers depend on, as one string.
   *
   * Decimals are deliberately not in it: rounding happens as a file is written,
   * so changing it cannot change what was sampled.
   */
  private signature(): string {
    return [
      this.flow
        .selectedParts()
        .map((part) => part.key)
        .join(','),
      this.flow
        .selectedColumns()
        .map((column) => column.key)
        .join(','),
      this.flow.format,
      this.flow.splitPerPart,
      this.flow.withMagnitude,
      this.flow.forceMode(),
      this.settings.lengthUnit.value,
      this.settings.angleUnit.value,
      this.settings.forceUnit.value,
      this.mechanism.mechanisms.map((solved) => solved.timeNum.length).join(','),
      // Bumped by every rebuild of the solved cycle, so a change that leaves
      // the shape of the selection alone still re-samples -- and *not* by
      // playback, which moves the pose without touching a single sample.
      this.mechanism.solveRevision,
    ].join('|');
  }

  private tablesFor(index: number): ExportTable[] {
    return this.spread(index)
      .map((piece) => this.table(index, piece.name, piece.suffix, piece.parts, piece.columns))
      .filter((table) => table.heads.length > 1);
  }

  /**
   * How one machine's selection is divided into files, and what goes in each.
   *
   * The one statement of the rule, so a forecast of the export cannot be split
   * differently from the export itself.
   */
  private spread(
    index: number
  ): { name: string; suffix: string; parts: ExportPart[]; columns: ExportColumn[] }[] {
    const id = this.flow.partGroups()[index]?.id ?? `M${index + 1}`;
    const parts = this.flow.selectedParts().filter((part) => part.mechanismIndex === index);
    const columns = this.flow.selectedColumns();
    // Only where there is more than one machine to tell apart.
    const qualify = this.flow.mechanismIndexes().length > 1 ? `${id}_` : '';

    // Per part only where the format offers the choice. A report and a set of
    // graph images are per machine whatever the file step last had ticked, and
    // a report built from a split selection silently kept only the first part.
    if (this.flow.splitPerPart && (this.flow.format === 'csv' || this.flow.format === 'xlsx')) {
      return parts.map((part) => {
        const short = part.label.replace(/\s+/g, '');
        return { name: `${id}_${short}`, suffix: `${qualify}${short}`, parts: [part], columns };
      });
    }
    if (this.flow.format === 'xlsx') {
      // "By analysis": kinematics and forces are different questions about the
      // same cycle, and a sheet each is what lets one be charted without the
      // other's axis running through it.
      return (['kinematics', 'forces'] as const).map((tab) => ({
        name: `${id}_${tab}`,
        suffix: `${qualify}${tab}`,
        parts,
        columns: columns.filter((column) => column.tab === tab),
      }));
    }
    return [{ name: id, suffix: qualify.replace(/_$/, ''), parts, columns }];
  }

  /**
   * What the export will come to, arithmetic only.
   *
   * A forecast rather than a measurement: a series the solver turns out to have
   * nothing for is dropped when the file is written, so the real table can be a
   * column narrower than this says. Everything a reader is told before pressing
   * Export comes from here, and nothing here touches the solver.
   */
  plan(): ExportPlan[] {
    return this.flow.mechanismIndexes().flatMap((index) =>
      this.spread(index)
        .map((piece) => {
          const solved = this.mechanism.mechanisms[index];
          const heads = ['Time (s)'];
          const titles: string[] = [];
          piece.columns.forEach((column) => {
            piece.parts
              .filter((part) => column.appliesTo.includes(part.key))
              .forEach((part) => {
                column.series.forEach((series) => {
                  const kept =
                    series.components === 3 && !this.flow.withMagnitude ? 2 : series.components;
                  const head = series.head || `${series.label} ${this.shortName(part)}`;
                  this.seriesNames(series.components)
                    .slice(0, kept)
                    .forEach((name) =>
                      heads.push(`${head}${name ? ' ' + name : ''} (${series.unit})`)
                    );
                  titles.push(series.head || `${series.label} of ${part.label}`);
                });
              });
          });
          return {
            name: piece.name,
            suffix: piece.suffix,
            mechanismIndex: index,
            rows: solved?.isMechanismValid() ? solved.timeNum.length : 0,
            heads,
            plots: titles.length,
            titles,
          };
        })
        .filter((piece) => piece.heads.length > 1)
    );
  }

  /** One file's table, sampled a slice at a time. See `tablesAsync`. */
  private async tableAsync(
    index: number,
    piece: { name: string; suffix: string; parts: ExportPart[]; columns: ExportColumn[] }
  ): Promise<ExportTable> {
    const solved = this.mechanism.mechanisms[index];
    const times = solved?.isMechanismValid() ? [...solved.timeNum] : [];
    const plots = solved ? await this.plotsAsync(solved, index, piece.parts, piece.columns) : [];
    return { ...this.shapeOf(piece.name, piece.suffix, index, times, plots) };
  }

  private table(
    index: number,
    name: string,
    suffix: string,
    parts: ExportPart[],
    columns: ExportColumn[]
  ): ExportTable {
    const solved = this.mechanism.mechanisms[index];
    const times = solved?.isMechanismValid() ? [...solved.timeNum] : [];
    const plots = solved ? this.plots(solved, index, parts, columns) : [];
    return this.shapeOf(name, suffix, index, times, plots);
  }

  /** The heads and columns a set of sampled graphs comes to, as one table. */
  private shapeOf(
    name: string,
    suffix: string,
    index: number,
    times: number[],
    plots: ExportPlot[]
  ): ExportTable {
    const heads = ['Time (s)'];
    const values: number[][] = [];
    plots.forEach((plot) => {
      plot.series.forEach((series) => {
        heads.push(`${plot.head}${series.name ? ' ' + series.name : ''} (${plot.unit})`);
        values.push(series.values);
      });
    });
    return { name, suffix, mechanismIndex: index, times, heads, columns: values, plots };
  }

  /** Every graph the selection asks for, in the order the columns are listed. */
  plots(
    solved: Mechanism,
    index: number,
    parts: ExportPart[],
    columns: ExportColumn[]
  ): ExportPlot[] {
    return this.plotJobs(solved, parts, columns)
      .map((job) => this.samplePlot(solved, index, job))
      .filter((plot): plot is ExportPlot => plot !== undefined);
  }

  /**
   * The same graphs, with the thread handed back between them.
   *
   * One series at a time is the grain the sampling comes apart at: within a
   * series every timestep is read from the same solved cycle, so stopping
   * partway would be no cheaper to resume.
   */
  private async plotsAsync(
    solved: Mechanism,
    index: number,
    parts: ExportPart[],
    columns: ExportColumn[]
  ): Promise<ExportPlot[]> {
    const plots: ExportPlot[] = [];
    let since = performance.now();
    for (const job of this.plotJobs(solved, parts, columns)) {
      const plot = this.samplePlot(solved, index, job);
      if (plot) plots.push(plot);
      since = await this.breathe(since);
    }
    return plots;
  }

  /**
   * Which series this selection asks for, before any of them are read.
   *
   * Listing the work and doing it are separate so that the two ways of running
   * it -- straight through, or in slices with the browser let back in between
   * -- cannot disagree about what the work was.
   */
  private plotJobs(
    solved: Mechanism,
    parts: ExportPart[],
    columns: ExportColumn[]
  ): { part: ExportPart; column: ExportColumn; series: ExportSeries }[] {
    if (!solved.isMechanismValid()) return [];
    const jobs: { part: ExportPart; column: ExportColumn; series: ExportSeries }[] = [];
    columns.forEach((column) => {
      parts
        .filter((part) => column.appliesTo.includes(part.key))
        .forEach((part) => {
          column.series.forEach((series) => jobs.push({ part, column, series }));
        });
    });
    return jobs;
  }

  /** One series, read across the whole cycle. The expensive step. */
  private samplePlot(
    solved: Mechanism,
    index: number,
    job: { part: ExportPart; column: ExportColumn; series: ExportSeries }
  ): ExportPlot | undefined {
    const { part, column, series } = job;
    const mode = this.flow.forceMode();
    const mechPart = series.mechPart || part.id;
    // The solver hands angles out in degrees and rates in radians, so one or
    // the other is converted on the way to whatever is labelled with the
    // reader's unit -- the same scale the graphs apply.
    const scale = angularScale(series.mechProp, this.settings.angleUnit.value);
    const rows = solved.timeNum.map((_, step) =>
      this.samples.sampleAt(
        solved,
        step,
        series.analysis,
        series.analysis === 'force' ? mode : 'loop',
        series.mechProp,
        mechPart,
        series.reactionLinkId
      )
    );
    const width = rows.reduce((most, row) => Math.max(most, row.length), 0);
    if (width === 0) return undefined;
    const kept = width === 3 && !this.flow.withMagnitude ? 2 : width;
    const names = this.seriesNames(width).slice(0, kept);
    return {
      title: series.head || `${series.label} of ${part.label}`,
      head: series.head || `${series.label} ${this.shortName(part)}`,
      unit: series.unit,
      columnKey: column.key,
      partKey: part.key,
      mechanismIndex: index,
      series: names.map((name, at) => ({
        name,
        values: rows.map((row) => row[at] * scale),
      })),
    };
  }

  /** The names the graphs plot these under, so the file agrees with the screen. */
  private seriesNames(count: number): string[] {
    if (count <= 1) return [''];
    if (count === 2) return ['X', 'Y'];
    return ['X', 'Y', 'Mag'];
  }

  /**
   * What a column head calls a part.
   *
   * The label without the word `Link`, rather than the id: a cylinder answers
   * to the two mounts a reader can see, and a block to the pin it rides on —
   * both of which have ids naming joints that were never drawn.
   */
  private shortName(part: ExportPart): string {
    if (part.kind === 'joint') return (part.part as RealJoint).name || part.id;
    return part.label.replace(/^Link /, '');
  }
}

/**
 * Hand the thread back for one turn of the event loop.
 *
 * `setTimeout(0)` is the obvious way and the wrong one: browsers hold a nested
 * timer to about 4 ms, which over the sixty-odd yields a full export takes
 * added more waiting than sampling -- 800 ms of work to avoid 465 ms of
 * freeze. A message to oneself is delivered on the next turn with no such
 * floor, so the page gets to paint between slices at almost no cost.
 */
function yieldToBrowser(): Promise<void> {
  if (typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}
