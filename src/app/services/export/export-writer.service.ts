import { Injectable, inject } from '@angular/core';
import { ANALYSIS_SERIES_COLORS } from '../../model/analysis-series';
import { RealJoint } from '../../model/joint';
import { MechanismService } from '../mechanism.service';
import { NumberUnitParserService } from '../number-unit-parser.service';
import { SettingsService } from '../settings.service';
import { UrlGenerationService } from '../url-generation.service';
import { ExportCatalogService } from './export-catalog.service';
import { ExportFlowService } from './export-flow.service';
import { ExportFile } from './export-model';
import { ExportPlot, ExportTable, ExportTableService } from './export-table.service';
import { formatCell, toCsv } from './csv-writer';
import { toXlsx, sheetNames } from './xlsx-writer';
import { utf8, zipStore } from './zip';
import { plotSvg } from './graph-svg';
import { mechanismSvg } from './mechanism-svg';
import { canvasSnapshot } from './canvas-svg';
import { Measure, ReportSection, reportHtml, reportPages } from './report-html';

const SERIES_COLORS: Record<string, string> = {
  X: ANALYSIS_SERIES_COLORS.X,
  Y: ANALYSIS_SERIES_COLORS.Y,
  Mag: ANALYSIS_SERIES_COLORS.Z,
};

/**
 * The chosen export, written out.
 *
 * One entry point for four formats, because they differ only in how the same
 * solved cycle is spelled: a CSV per machine, a workbook of sheets, a picture
 * per graph, or a report a reader can hand in.
 */
@Injectable({ providedIn: 'root' })
export class ExportWriterService {
  private flow = inject(ExportFlowService);
  private tables = inject(ExportTableService);
  private catalog = inject(ExportCatalogService);
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private urls = inject(UrlGenerationService);

  /** What the export would produce, for the summary the drawer shows. */
  /**
   * What the export would produce, forecast rather than measured.
   *
   * Read off the plan, which is arithmetic over the selection — so the counts
   * under a reader's hand keep up with a checkbox instead of re-solving every
   * chosen series before the number beside it can change.
   */
  summary(): { files: number; columns: number; rows: number; pages: number } {
    const plan = this.tables.plan();
    return {
      files: this.flow.format === 'xlsx' || this.flow.format === 'report' ? 1 : plan.length,
      columns: plan.reduce((most, piece) => Math.max(most, piece.heads.length), 0),
      rows: plan.reduce((most, piece) => Math.max(most, piece.rows), 0),
      // The one number that cannot be forecast: a page holds as many columns as
      // its numbers are wide, and how wide they are is a property of the values
      // themselves. Paid for only where it is shown, which is the Report format.
      pages: this.flow.format === 'report' ? this.printedPages() : 0,
    };
  }

  /** How many printed pages the chosen selection comes to. Samples the cycle. */
  private printedPages(): number {
    const tables = this.tables.tables();
    return tables
      .filter(
        (table, at) => tables.findIndex((one) => one.mechanismIndex === table.mechanismIndex) === at
      )
      .reduce(
        (total, table) =>
          total +
          reportPages(
            { plots: table.plots.length, rows: this.rowsOf(table), heads: table.heads },
            textMeasure()
          ),
        0
      );
  }

  /**
   * Write the chosen export, and say whether anything came of it.
   *
   * A selection can empty itself out from under the reader — a mechanism that
   * stops solving takes its parts with it — and an export that writes nothing
   * must not be reported as one that worked.
   */
  /** Every row of a table, formatted the way a file or a page would carry it. */
  private rowsOf(table: ExportTable): string[][] {
    const decimals = this.flow.decimals;
    return table.times.map((time, row) => [
      formatCell(time, decimals),
      ...table.columns.map((column) => formatCell(column[row], decimals)),
    ]);
  }

  async run(): Promise<boolean> {
    // Sampled in slices rather than in one go, so the page keeps drawing --
    // the spinner on the button that started this among other things.
    const tables = await this.tables.tablesAsync();
    if (tables.length === 0) return false;
    switch (this.flow.format) {
      case 'xlsx':
        this.writeWorkbook(tables);
        return true;
      case 'images':
        return this.writeImages(tables);
      case 'report':
        return this.writeReport(tables);
      default:
        this.writeCsv(tables);
        return true;
    }
  }

  private writeCsv(tables: ExportTable[]): void {
    const stem = this.flow.name();
    this.deliver(
      tables.map((table) => ({
        name: `${this.fileStem(stem, table)}.csv`,
        mime: 'text/csv;charset=utf-8',
        text: toCsv(table, this.flow.decimals),
      })),
      stem
    );
  }

  /**
   * What the export will actually put in the downloads folder.
   *
   * The drawer says this before the reader presses Export, so it has to be the
   * name the file lands under rather than the name it was built from: a set of
   * pictures is an archive of its own, and one picture carries the graph's
   * title.
   */
  arrivingName(): string {
    const stem = this.flow.name();
    if (this.flow.format === 'report') return `${stem}.pdf`;
    if (this.flow.format === 'images') {
      const plan = this.tables.plan();
      const pictures = plan.reduce((total, piece) => total + piece.plots, 0);
      if (pictures > 2) return `${stem}_graphs.zip`;
      const machine = plan.length > 1 ? `${plan[0].name}_` : '';
      const title = plan[0]?.titles[0];
      return title
        ? `${stem}_${machine}${safe(title)}.${this.flow.imageFormat}`
        : `${stem}.${this.flow.imageFormat}`;
    }
    const files = this.summary().files;
    if (files > 2 && this.flow.format !== 'xlsx') return `${stem}.zip`;
    // Two files arrive as two downloads, each carrying the suffix that tells
    // them apart -- so name the first of them rather than the bare stem, which
    // promised a `results.csv` where `results_M1.csv` and `results_M2.csv`
    // landed. How many are coming is the line underneath.
    const suffix = files > 1 ? this.tables.plan()[0]?.suffix : undefined;
    const named = suffix ? `${stem}_${safe(suffix)}` : stem;
    return `${named}${this.flow.extension()}`;
  }

  /**
   * Hand the files over, as one download where there are more than two.
   *
   * A browser asks before it will take a second file and stops after a handful,
   * so an export of a part each arrived as one CSV and a permission prompt the
   * reader had to answer for the rest. One archive is one download.
   */
  private deliver(files: ExportFile[], stem: string): void {
    const named = distinctNames(files);
    if (named.length <= 2) {
      named.forEach((file) => this.hand(file));
      return;
    }
    this.hand({
      name: `${stem}.zip`,
      mime: 'application/zip',
      bytes: zipStore(
        named.map((file) => ({
          name: file.name,
          data: file.bytes ?? utf8(file.text ?? ''),
        }))
      ),
    });
  }

  private writeWorkbook(tables: ExportTable[]): void {
    this.hand({
      name: `${this.flow.name()}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: toXlsx(tables, this.flow.decimals),
    });
  }

  private async writeImages(tables: ExportTable[]): Promise<boolean> {
    const width = 720;
    const height = 420;
    // Read once, before the first await. Drawing forty graphs takes long enough
    // for a reader to change their mind about PNG or SVG, or to rename the
    // export -- and the settings were being read afresh per picture, so half an
    // archive came out under the old answers and half under the new.
    const stem = this.flow.name();
    const kind = this.flow.imageFormat;
    const logo = await logoDataUrl();
    const files: ExportFile[] = [];
    for (const table of tables) {
      for (const plot of table.plots) {
        const svg = plotSvg(plot, table.times, { width, height, standalone: true, logo });
        // The machine, where there is more than one: a joint shared by two of
        // them is `Position of Joint D` in both, and two entries of one name in
        // one archive is one picture that quietly replaces the other.
        const machine = tables.length > 1 ? `${table.name}_` : '';
        const name = `${stem}_${machine}${safe(plot.title)}`;
        files.push(
          kind === 'svg'
            ? { name: `${name}.svg`, mime: 'image/svg+xml', text: svg }
            : {
                name: `${name}.png`,
                mime: 'image/png',
                bytes: await rasterize(svg, width, height),
              }
        );
      }
    }
    this.deliver(files, `${stem}_graphs`);
    return files.length > 0;
  }

  /** Every selected machine, one section each, in one printable document. */
  private writeReport(tables: ExportTable[]): boolean {
    const sections = this.flow
      .mechanismIndexes()
      .map((index) =>
        this.section(
          index,
          tables.filter((table) => table.mechanismIndex === index)
        )
      )
      .filter((section): section is ReportSection => !!section);
    if (sections.length === 0) return false;
    const logo = new URL('assets/PMKS_logo.png', document.baseURI).href;
    // The name the reader typed reaches the file through the document's title:
    // the app never writes this one, the print dialog does, and the title is
    // what it offers as the name.
    print(
      reportHtml({
        logoUrl: logo,
        documentTitle: this.flow.name(),
        sections,
        measure: textMeasure(),
      })
    );
    return true;
  }

  private section(index: number, tables: ExportTable[]): ReportSection | undefined {
    const table = tables[0];
    const solved = this.mechanism.mechanisms[index];
    const group = this.flow.partGroups()[index];
    if (!table || !solved || !group) return undefined;
    // The canvas itself where there is one, so a slot, a piston and a sealed
    // cylinder reach the page as the reader drew them; the skeleton is the
    // fallback for a report built without a canvas to copy.
    const jointIds = (this.mechanism.partitions[index]?.ownJoints ?? []).map((joint) => joint.id);
    const drawing =
      canvasSnapshot(330, 250, jointIds) ??
      mechanismSvg(solved.joints[0] ?? [], solved.links[0] ?? [], 330, 230);
    const decimals = this.flow.decimals;
    return {
      title: `${this.flow.selectedColumns('forces').length > 0 ? 'Analysis' : 'Kinematic analysis'} — ${group.id}`,
      subtitle: `${group.note} · ${today()}`,
      dataTitle: `Data — ${group.id}`,
      graphsTitle: `Graphs — ${group.id}`,
      drawing,
      facts: this.facts(index, table),
      shareUrl: this.urls.generateFullUrl(),
      plots: table.plots.map((plot) => ({
        title: plot.title,
        unit: plot.unit,
        svg: plotSvg(plot, table.times, { width: 320, height: 150, standalone: false }),
        legend: plot.series.map((series) => ({
          name: series.name || plot.head,
          color: SERIES_COLORS[series.name] ?? ANALYSIS_SERIES_COLORS.X,
        })),
      })),
      heads: table.heads,
      rows: this.rowsOf(table),
      footer: `${group.id} · ${group.note}`,
    };
  }

  /** What a reader needs in order to trust the numbers on the pages after it. */
  private facts(index: number, table: ExportTable): { label: string; value: string }[] {
    const solved = this.mechanism.mechanisms[index];
    const group = this.flow.partGroups()[index];
    const readiness = this.mechanism.readinessOfEachMechanism()[index];
    const driven = this.mechanism.partitions[index]?.joints.find(
      (joint) => joint instanceof RealJoint && joint.input
    ) as RealJoint | undefined;
    const speed = readiness?.facts.find((fact) => fact.label === 'Input speed')?.value ?? '—';
    const parts = this.flow
      .selectedParts()
      .filter((part) => part.mechanismIndex === index)
      .map((part) => part.label)
      .join(', ');
    const length = this.catalog.unitStr(this.settings.lengthUnit.value);
    const mass = this.nup.unitLabel(this.nup.massUnitFor(this.settings.lengthUnit.value));
    const angle = this.catalog.unitStr(this.settings.angleUnit.value);
    return [
      { label: 'Mechanism', value: `${group.id}, ${group.note}, ${solved.dof} DoF` },
      {
        label: 'Input',
        value: driven ? `Joint ${driven.name || driven.id}, ${speed}` : 'Not set',
      },
      {
        label: 'Cycle',
        value: `${solved.cyclePeriod.toFixed(2)} s, ${table.times.length} solved positions`,
      },
      { label: 'Units', value: `${length}, ${mass}, ${this.catalog.forceUnit()}, ${angle}` },
      { label: 'Parts', value: parts || '—' },
      { label: 'Decimals', value: String(this.flow.decimals) },
    ];
  }

  /** One file gets the plain name; several get what tells them apart. */
  private fileStem(stem: string, table: ExportTable): string {
    return table.suffix ? `${stem}_${safe(table.suffix)}` : stem;
  }

  private hand(file: ExportFile): void {
    const blob = file.bytes
      ? new Blob([file.bytes as BlobPart], { type: file.mime })
      : new Blob([file.text ?? ''], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  /** Exposed so a spec can name the sheets without opening a workbook. */
  sheetNamesFor(tables: ExportTable[]): string[] {
    return sheetNames(tables);
  }

  plotsOf(table: ExportTable): ExportPlot[] {
    return table.plots;
  }
}

/** The type the report's table is set in, for measuring a string against. */
const TABLE_FONT = "8.5px Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * How wide a string will actually be, asked of the browser that will draw it.
 *
 * The report is laid out here rather than reflowed, so how many columns fit
 * across a page is arithmetic — and arithmetic done against a table of glyph
 * widths is right for the font it was measured in and a few per cent out for
 * whichever one the reader's machine falls back to. A canvas knows exactly.
 * Memoised per string, because a table of 361 rows asks the same questions
 * thousands of times.
 */
function textMeasure(): Measure | undefined {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return undefined;
  const seen = new Map<string, number>();
  return (text: string, bold = false): number => {
    const key = bold ? `b:${text}` : text;
    const known = seen.get(key);
    if (known !== undefined) return known;
    context.font = `${bold ? '500 ' : ''}${TABLE_FONT}`;
    const width = context.measureText(text).width;
    seen.set(key, width);
    return width;
  };
}

/**
 * Make sure no two files going out together share a name.
 *
 * A zip will hold two entries of one name quite happily, and every unzipper
 * then writes one over the other -- so a picture goes missing with nothing
 * anywhere saying it did. The last resort rather than the plan: the names are
 * built to differ, and this is what catches the case nobody thought of.
 */
function distinctNames(files: ExportFile[]): ExportFile[] {
  const used = new Set<string>();
  return files.map((file) => {
    if (!used.has(file.name)) {
      used.add(file.name);
      return file;
    }
    const dot = file.name.lastIndexOf('.');
    const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
    const suffix = dot > 0 ? file.name.slice(dot) : '';
    let at = 2;
    while (used.has(`${stem}_${at}${suffix}`)) at++;
    const name = `${stem}_${at}${suffix}`;
    used.add(name);
    return { ...file, name };
  });
}

/**
 * The PMKS+ mark as a data URI, for a picture that has to stand on its own.
 *
 * Read once per export and given to every graph in it. A failure here is not
 * worth refusing an export over: the graph goes out without the mark.
 */
async function logoDataUrl(): Promise<string | undefined> {
  try {
    const response = await fetch(new URL('assets/PMKS_logo.png', document.baseURI).href);
    const blob = await response.blob();
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** A picture the browser will draw, as PNG bytes. */
async function rasterize(svg: string, width: number, height: number): Promise<Uint8Array> {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('The graph could not be drawn.'));
    element.src = source;
  });
  const canvas = document.createElement('canvas');
  // Twice the drawn size: a chart printed or pasted at full width should not be
  // the one blurred thing on the page.
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext('2d')!;
  context.scale(2, 2);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await (blob ?? new Blob()).arrayBuffer());
}

/**
 * Hand a document to the browser's own printer.
 *
 * An off-screen frame rather than a new window: a popup blocker stops the
 * window, and the frame is torn down as soon as the dialog closes.
 */
function print(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  if (doc.readyState === 'complete') setTimeout(go, 100);
  else frame.onload = () => setTimeout(go, 100);
}

/** A name a file system will take, from a title a person wrote. */
function safe(text: string): string {
  return text.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
}

function today(): string {
  return new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
