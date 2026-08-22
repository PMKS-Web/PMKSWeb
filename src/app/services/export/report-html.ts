import { escapeXml } from './xml';

export interface ReportPlot {
  title: string;
  unit: string;
  /** The chart itself, without a title of its own — the page supplies one. */
  svg: string;
  legend: { name: string; color: string }[];
}

/** One mechanism's worth of report: its drawing, its graphs and its table. */
export interface ReportSection {
  title: string;
  subtitle: string;
  /** The drawing, as it stands at the start of the cycle. */
  drawing: string;
  facts: { label: string; value: string }[];
  shareUrl: string;
  plots: ReportPlot[];
  heads: string[];
  rows: string[][];
  /** `Four-bar test · M1` — what every page of this section is footed with. */
  footer: string;
  /** What the data pages are headed with: `Data — M1`. */
  dataTitle: string;
  /** What the graph pages after the first are headed with. */
  graphsTitle: string;
}

/**
 * How wide a string is, in the type the table is set in.
 *
 * Passed in so the page can be laid out against the browser's own measurement
 * rather than against a table of glyph widths that is right for one font and a
 * few per cent out for the next one down the stack. The estimate below is the
 * fallback for anywhere without a canvas to ask.
 */
export type Measure = (text: string, bold?: boolean) => number;

export interface ReportContext {
  logoUrl: string;
  /**
   * What the document is called.
   *
   * The print dialog offers this as the PDF's file name, which is the only way
   * the name typed in the drawer can reach a file the app never writes itself.
   */
  documentTitle?: string;
  sections: ReportSection[];
  /** Omitted where there is nothing to measure with; estimated instead. */
  measure?: Measure;
}

/**
 * What one printed page holds, measured rather than guessed.
 *
 * A Letter page at half-inch margins leaves 960px of content at 96dpi; the
 * heading and the footer take about 88 of them. A table row is set in 8.5px
 * type with a pixel of padding either side, which measures 12px.
 */
const BODY_HEIGHT = 860;
const ROW_HEIGHT = 13;
const BODY_WIDTH = 720;
/**
 * How wide the characters of a number are in this type, measured at 8.5px.
 *
 * A digit, a point and a minus sign are three different widths, and counting
 * characters instead of measuring them over-estimates a signed decimal by about
 * a tenth — which is the difference between fifteen columns on a page and
 * fourteen, and so between six pages of table and twelve.
 *
 * Taken from the browser, not from a rule of thumb: `-1234.567890` measures
 * 52.3px, which is ten digits at 4.78, a point at 2.25 and a sign at 2.36.
 */
const DIGIT_WIDTH = 4.78;
const POINT_WIDTH = 2.25;
const SIGN_WIDTH = 2.36;
/** Padding either side of a cell, and a little over on the measurement. */
const COLUMN_PADDING = 4;
const WIDTH_MARGIN = 1.02;
/** However narrow the numbers are, a head needs room to be read. */
const MOST_COLUMNS = 24;
/**
 * A letter *averages* narrower than a digit — the digits of this type are all
 * one width and most letters are less — and a head is set on 11px lines.
 * `Position B X (cm)` measures 65.7px across seventeen characters.
 */
const LETTER_WIDTH = 3.95;
const HEAD_LINE = 11;
const HEAD_PADDING = 14;
const MOST_HEAD_LINES = 14;
/**
 * How many graphs a page carries.
 *
 * Four on the first page, in two columns, beside the drawing and the settings —
 * the size the design draws them at. Nine is what fits when they are set three
 * across, which is what a first page holds when that is all of them: three
 * rows of three end 105px inside the page body, and a fourth row does not fit
 * however few graphs are on it. Eight is what a page of nothing but graphs
 * holds.
 */
const GRAPHS_ON_FIRST_PAGE = 4;
const GRAPHS_ON_FIRST_PAGE_TIGHT = 9;
const GRAPHS_PER_PAGE = 8;

/**
 * How many rows fit under the heads a page of this many columns carries.
 *
 * Not a constant, because the heads are not. `Static force at Joint B on Link
 * AB Mag (N)` in a column half an inch wide is nine lines, and a head band nine
 * lines deep is nine rows of numbers that no longer fit — which, on a page laid
 * out by hand rather than reflowed, means rows clipped off the bottom.
 */
function rowsPerPage(heads: string[], columns: number, measure: Measure): number {
  const columnWidth = Math.max(12, BODY_WIDTH / (columns + 1) - COLUMN_PADDING);
  const lines = heads.reduce(
    (most, head) => Math.max(most, headLines(head, columnWidth, measure)),
    1
  );
  const headBand = Math.min(lines, MOST_HEAD_LINES) * HEAD_LINE + HEAD_PADDING;
  return Math.max(10, Math.floor((BODY_HEIGHT - headBand) / ROW_HEIGHT));
}

/**
 * How many lines a head takes in a column of a given width.
 *
 * Word by word, because that is how the browser does it: a head only breaks
 * inside a word when the word alone will not fit. Dividing the head's whole
 * width by the column's assumes a perfect packing nothing achieves, and every
 * line it under-counts is a row clipped off the bottom of the page.
 */
function headLines(head: string, columnWidth: number, measure: Measure): number {
  let lines = 1;
  let used = 0;
  const space = measure(' ', true);
  for (const word of head.split(' ')) {
    const width = measure(word, true);
    if (width > columnWidth) {
      if (used > 0) lines++;
      const pieces = Math.ceil(width / columnWidth);
      lines += pieces - 1;
      used = width - (pieces - 1) * columnWidth;
      continue;
    }
    const gap = used === 0 ? 0 : space;
    if (used + gap + width > columnWidth) {
      lines++;
      used = width;
    } else {
      used += gap + width;
    }
  }
  return lines;
}

/**
 * How many columns of a given width fit across the page.
 *
 * Every column is drawn the same width, so what fits is decided by the widest
 * number among them — and one fewer than that, because the time column rides
 * every page beside them. Capped, because a column narrower than its own head
 * sets that head wrapping down the page a letter at a time.
 */
function capacityFor(widest: number): number {
  const width = (widest + COLUMN_PADDING) * WIDTH_MARGIN;
  return Math.min(MOST_COLUMNS, Math.max(3, Math.floor(BODY_WIDTH / width) - 1));
}

/**
 * Which columns go on which page, packed by what they are actually as wide as.
 *
 * Sizing every page from the widest number anywhere in the table charged a page
 * of positions in the tens for the one reaction that ran to five figures. Taken
 * a column at a time, a run of narrow columns packs tighter — on an eighty-six
 * column export that is one pass over the rows fewer, which is six pages.
 */
function columnChunks(heads: string[], rows: string[][], measure: Measure): number[][] {
  const columns = heads.slice(1).map((_, at) => at + 1);
  if (columns.length === 0) return [];
  const widthOf = (at: number): number =>
    rows.reduce((most, row) => Math.max(most, measure(row[at] ?? '', false)), 4 * DIGIT_WIDTH);
  // Time rides every chunk: a column of numbers with nothing to line it up
  // against is not data anyone can use, so its width is charged to every page.
  const time = widthOf(0);
  const widths = columns.map(widthOf);

  /**
   * Walk the columns, taking as many as fit — but never more than `wanted`
   * says, which is how the same number of pages can be packed evenly instead
   * of greedily.
   */
  const pack = (wanted: (left: number, pagesLeft: number) => number, pages: number): number[][] => {
    const chunks: number[][] = [];
    let at = 0;
    while (at < columns.length) {
      const cap = Math.max(1, wanted(columns.length - at, Math.max(1, pages - chunks.length)));
      let widest = time;
      let take = 1;
      for (let end = at; end < columns.length && end - at + 1 <= cap; end++) {
        const next = Math.max(widest, widths[end]);
        if (end - at + 1 > capacityFor(next)) break;
        widest = next;
        take = end - at + 1;
      }
      chunks.push(columns.slice(at, at + take));
      at += take;
    }
    return chunks;
  };

  const greedy = pack(() => Number.POSITIVE_INFINITY, 1);
  if (greedy.length <= 1) return greedy;
  // The same pages, filled evenly. Greedily packed, an eighty-six column export
  // ended on a page holding the time column and one other, because the three
  // before it had taken fifteen each.
  const balanced = pack((left, pagesLeft) => Math.ceil(left / pagesLeft), greedy.length);
  return balanced.length <= greedy.length ? balanced : greedy;
}

/**
 * What a string measures, when there is no browser to ask.
 *
 * Only the fallback: every glyph here was measured once in one browser, and the
 * whole point of `Measure` is not to have to trust that anywhere it matters.
 */
export function estimateWidth(text: string, bold = false): number {
  let width = 0;
  for (const character of text) {
    width +=
      character === '.'
        ? POINT_WIDTH
        : character === '-'
          ? SIGN_WIDTH
          : /[0-9]/.test(character)
            ? DIGIT_WIDTH
            : LETTER_WIDTH;
  }
  // A head is set in medium, which is a shade wider than the numbers under it.
  return bold ? width * 1.03 : width;
}

/**
 * Split into pages that are as full as each other rather than as full as
 * possible.
 *
 * Nine pages of forty and a tenth holding one is the same paper as six pages of
 * sixty; spread evenly it is six pages of sixty and no orphan at all. Taking
 * the most each time is not enough on its own — fifty-eight graphs eight to a
 * page is seven full pages and one holding two — so the remainder is shared out
 * a page at a time.
 */
function spread<T>(items: T[], most: number): T[][] {
  if (items.length === 0) return [];
  const pages = Math.max(1, Math.ceil(items.length / most));
  const base = Math.floor(items.length / pages);
  const over = items.length % pages;
  const out: T[][] = [];
  let at = 0;
  for (let page = 0; page < pages; page++) {
    const size = base + (page < over ? 1 : 0);
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}

/**
 * The Report format: the mechanism, what it was solved under, its graphs, and
 * every row the CSV would have held.
 *
 * Written as a printable HTML document rather than assembled with a PDF
 * library. The browser already has a typesetter and a PDF writer in it, the
 * pages are laid out here rather than left to reflow, and a reader who wanted
 * paper instead of a file gets that from the same command.
 */
export function reportHtml(context: ReportContext): string {
  const bodies: { body: string; footer: string }[] = [];
  context.sections.forEach((section) => {
    const plan = planSection(
      { ...section, plots: section.plots.length },
      context.measure ?? estimateWidth
    );
    plan.graphPages.forEach((graphs, at) => {
      const plots = section.plots.slice(graphs.from, graphs.from + graphs.count);
      bodies.push({
        body:
          at === 0
            ? firstPageBody(context, section, { plots, across: graphs.across })
            : `${sectionHead(context, section.graphsTitle, section.subtitle)}
              <div class="graphs across${graphs.across}">${plots.map(graphBlock).join('')}</div>`,
        footer: section.footer,
      });
    });
    plan.tablePages.forEach((page) => {
      bodies.push({ body: dataPageBody(context, section, page), footer: section.footer });
    });
  });

  const pages = bodies.map((entry, at) => page(entry.body, entry.footer, at + 1, bodies.length));
  const title = context.documentTitle || context.sections[0]?.title || 'PMKS+ report';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title><style>${styles()}</style></head><body>${pages.join('')}</body></html>`;
}

/**
 * How long the report will be, before anyone waits for it to be built.
 *
 * The table is every row the CSV would hold, which is the point of the format
 * and also how a wide selection becomes a hundred pages. Counted from the same
 * plan that lays the report out, because a promise made by different arithmetic
 * from the one that keeps it is a promise that drifts.
 */
export function reportPages(
  section: { plots: number; rows: string[][]; heads: string[] },
  measure: Measure = estimateWidth
): number {
  const plan = planSection(section, measure);
  return plan.graphPages.length + plan.tablePages.length;
}

/** Which graphs and which numbers land on which page. */
function planSection(
  section: { plots: number; rows: string[][]; heads: string[] },
  measure: Measure
): {
  graphPages: { from: number; count: number; across: 2 | 3 }[];
  tablePages: { columns: number[]; rows: string[][] }[];
} {
  const tablePages = columnChunks(section.heads, section.rows, measure).flatMap((chunkOfColumns) =>
    // Paginated per chunk, because a chunk whose heads are short leaves room
    // for more rows than one whose heads wrap down half the page.
    spread(
      section.rows,
      rowsPerPage(
        [section.heads[0], ...chunkOfColumns.map((at) => section.heads[at])],
        chunkOfColumns.length,
        measure
      )
    ).map((rows) => ({ columns: chunkOfColumns, rows }))
  );
  return { graphPages: planGraphs(section.plots), tablePages };
}

/**
 * Which graphs go on which page, and how many across.
 *
 * A fifth graph used to go on a page of its own, nine tenths of it white. Set
 * three across instead, the first page takes six — so a report with no more
 * graphs than that has no graph page at all.
 */
function planGraphs(plots: number): { from: number; count: number; across: 2 | 3 }[] {
  if (plots === 0) return [{ from: 0, count: 0, across: 2 }];
  if (plots <= GRAPHS_ON_FIRST_PAGE) return [{ from: 0, count: plots, across: 2 }];
  if (plots <= GRAPHS_ON_FIRST_PAGE_TIGHT) return [{ from: 0, count: plots, across: 3 }];
  // Three across on the first page too, where the two it makes room for are the
  // two that would otherwise start a page of their own.
  const pagesAfter = (first: number): number => Math.ceil((plots - first) / GRAPHS_PER_PAGE);
  const onFirst =
    pagesAfter(GRAPHS_ON_FIRST_PAGE_TIGHT) < pagesAfter(GRAPHS_ON_FIRST_PAGE)
      ? GRAPHS_ON_FIRST_PAGE_TIGHT
      : GRAPHS_ON_FIRST_PAGE;
  const across: 2 | 3 = onFirst === GRAPHS_ON_FIRST_PAGE_TIGHT ? 3 : 2;
  let from = onFirst;
  const rest = spread(
    Array.from({ length: plots - onFirst }, (_, at) => at),
    GRAPHS_PER_PAGE
  ).map((page) => {
    const entry = { from, count: page.length, across: 2 as const };
    from += page.length;
    return entry;
  });
  return [{ from: 0, count: onFirst, across }, ...rest];
}

function sectionHead(context: ReportContext, title: string, subtitle: string): string {
  return `<div class="head"><div><div class="title">${escapeHtml(
    title
  )}</div><div class="subtitle">${escapeHtml(
    subtitle
  )}</div></div><img class="logo" src="${escapeHtml(context.logoUrl)}" alt="PMKS+"></div>`;
}

function graphBlock(plot: ReportPlot): string {
  return `<div class="graph"><div class="graphTitle">${escapeHtml(
    plot.title
  )}</div><div class="graphLegend">${plot.legend
    .map(
      (entry) =>
        `<span><span class="swatch" style="background:${entry.color}"></span>${escapeHtml(
          entry.name
        )}</span>`
    )
    .join('')}<span class="spacer"></span><span class="graphUnit">${escapeHtml(
    plot.unit
  )}</span></div>${plot.svg}</div>`;
}

function firstPageBody(
  context: ReportContext,
  section: ReportSection,
  graphs: { plots: ReportPlot[]; across: 2 | 3 }
): string {
  const facts = section.facts
    .map(
      (fact) =>
        `<span class="factLabel">${escapeHtml(fact.label)}</span><span class="factValue">${escapeHtml(
          fact.value
        )}</span>`
    )
    .join('');
  return `${sectionHead(context, section.title, section.subtitle)}
    <div class="topRow"><div class="drawing">${section.drawing}</div>
    <div class="solvedUnder"><div class="panelTitle">Solved under</div><div class="factGrid">${facts}</div>
    <div class="shareNote">Every graph and every row below comes from this one solve. Reopen the mechanism at <span class="shareUrl">${escapeHtml(
      section.shareUrl
    )}</span></div></div></div>
    ${
      graphs.plots.length > 0
        ? `<div class="panelTitle graphsTitle">Graphs</div><div class="graphs across${
            graphs.across
          }">${graphs.plots.map(graphBlock).join('')}</div>`
        : ''
    }`;
}

function dataPageBody(
  context: ReportContext,
  section: ReportSection,
  table: { columns: number[]; rows: string[][] }
): string {
  const heads = [0, ...table.columns]
    .map((at) => `<th>${escapeHtml(section.heads[at])}</th>`)
    .join('');
  const body = table.rows
    .map(
      (row) =>
        `<tr>${[0, ...table.columns].map((at) => `<td>${escapeHtml(row[at])}</td>`).join('')}</tr>`
    )
    .join('');
  const split = table.columns.length < section.heads.length - 1;
  const note = split
    ? `<div class="tableNote">Columns ${table.columns[0]}–${
        table.columns[table.columns.length - 1]
      } of ${section.heads.length - 1}. The rest are on their own pages.</div>`
    : '';
  return `${sectionHead(
    context,
    section.dataTitle,
    `${section.heads.length - 1} columns, ${section.rows.length} rows, one row per solved position`
  )}
    <table class="dataTable"><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table>${note}`;
}

function page(body: string, footer: string, number: number, total: number): string {
  return `<section class="page"><div class="pageBody">${body}</div><div class="pageFoot"><span>PMKS+ · app.pmksplus.com</span><span class="spacer"></span><span>${escapeHtml(
    footer
  )}</span><span class="pageNumber">Page ${number} of ${total}</span></div></section>`;
}

function escapeHtml(text: string): string {
  return escapeXml(text ?? '');
}

function styles(): string {
  return `
@page { size: letter; margin: 0.5in; }
* { box-sizing: border-box; }
/* A printer drops backgrounds unless it is told not to, which took the colour
   out of every legend swatch on the page and left the reader three unnamed
   lines. */
body { margin: 0; font-family: Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2c2c2c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page {
  width: 7.5in;
  /* A shade under the 10in a Letter page leaves at half-inch margins. A block
     exactly the height of the printable area rounds over it in some printers
     and lays a blank page after every real one, which is where the empty pages
     in the first cut of this came from. */
  height: 9.85in;
  display: flex;
  flex-direction: column;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; }
.pageBody { flex: 1 1 auto; min-height: 0; }
.head { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid #eceef5; }
.title { font-size: 19px; font-weight: 500; }
.subtitle { font-size: 12px; color: rgba(0,0,0,0.55); }
.logo { margin-left: auto; height: 34px; }
.topRow { display: flex; gap: 18px; padding: 14px 0; }
.drawing { flex: 0 0 auto; }
.solvedUnder { flex: 1 1 auto; min-width: 0; }
.panelTitle { font-size: 12px; font-weight: 500; color: #5f6368; text-transform: uppercase; letter-spacing: 0.06em; }
.factGrid { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; padding-top: 6px; font-size: 12px; }
.factLabel { color: rgba(0,0,0,0.55); }
.factValue { color: #2c2c2c; }
.shareNote { padding-top: 10px; font-size: 11px; line-height: 15px; color: rgba(0,0,0,0.55); }
.shareUrl { font-family: 'Roboto Mono', Menlo, monospace; word-break: break-all; color: #3f51b5; }
.graphsTitle { padding-top: 6px; }
.graphs { display: grid; gap: 8px; padding-top: 8px; }
.graphs.across2 { grid-template-columns: 1fr 1fr; }
.graphs.across3 { grid-template-columns: 1fr 1fr 1fr; }
.graph { border: 1px solid #eceef5; border-radius: 4px; padding: 6px; }
.graph svg { width: 100%; height: auto; }
.graphTitle { font-size: 12px; font-weight: 500; }
.graphLegend { display: flex; align-items: center; gap: 10px; font-size: 11px; color: rgba(0,0,0,0.55); padding: 2px 0 4px; }
.graphLegend .spacer { flex: 1 1 auto; }
.swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; border: 0.5px solid rgba(0,0,0,0.15); }
.dataTable { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8.5px; font-variant-numeric: tabular-nums; margin-top: 8px; }
/* A head is several words and a column is one number wide, so the head wraps
   rather than setting the width of everything under it. */
.dataTable th { text-align: right; font-weight: 500; color: #5f6368; border-bottom: 1px solid #d5d7e0; padding: 2px; line-height: 11px; word-break: break-word; }
.dataTable td { text-align: right; padding: 1px 2px; border-bottom: 1px solid #f7f8fc; line-height: 10px; }
/* Time is the column every page repeats, and the one a reader scans down. */
.dataTable th:first-child, .dataTable td:first-child { text-align: left; }
.tableNote { padding-top: 8px; font-size: 10px; color: rgba(0,0,0,0.5); }
.pageFoot { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid #eceef5; font-size: 10px; color: rgba(0,0,0,0.5); }
.pageFoot .spacer { flex: 1 1 auto; }
.pageNumber { font-variant-numeric: tabular-nums; }
`;
}
