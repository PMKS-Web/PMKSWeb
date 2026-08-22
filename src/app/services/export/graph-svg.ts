import { ANALYSIS_SERIES_COLORS } from '../../model/analysis-series';
import { ExportPlot } from './export-table.service';
import { escapeXml } from './xml';

export interface PlotSvgOptions {
  width: number;
  height: number;
  /** Whether the picture carries its own title and legend, or a page does. */
  standalone: boolean;
  /**
   * The PMKS+ mark, as a data URI.
   *
   * Embedded rather than linked: a graph leaves here as a file of its own and
   * lands in a report or a slide deck with nothing around it to say what drew
   * it, and a picture that reaches for a URL is a picture with a hole in it.
   */
  logo?: string;
}

const COLORS = [ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Y, ANALYSIS_SERIES_COLORS.Z];

/**
 * One solved quantity, drawn.
 *
 * Written out rather than taken from the panel's chart library: the panel draws
 * whatever the reader has opened, and an export is asked for graphs that were
 * never on screen. Vector all the way through, so the same picture serves a
 * printed page, an .svg download, and — via a canvas — a .png.
 */
export function plotSvg(plot: ExportPlot, times: number[], options: PlotSvgOptions): string {
  const { width, height, standalone } = options;
  const top = standalone ? 54 : 12;
  const left = 62;
  const right = 14;
  const bottom = 34;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;

  const finite = plot.series.flatMap((series) => series.values.filter(Number.isFinite));
  const lowest = finite.length > 0 ? Math.min(...finite) : 0;
  const highest = finite.length > 0 ? Math.max(...finite) : 0;
  const [low, high] = pad(lowest, highest);
  const span = high - low || 1;
  const lastTime = times.length > 0 ? times[times.length - 1] : 0;

  const x = (index: number) =>
    left + (times.length < 2 ? innerWidth / 2 : (index / (times.length - 1)) * innerWidth);
  const y = (value: number) => top + innerHeight - ((value - low) / span) * innerHeight;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => high - fraction * span);
  const digits = tickDigits(span);
  const grid = ticks
    .map(
      (value) =>
        `<line x1="${left}" y1="${round(y(value))}" x2="${left + innerWidth}" y2="${round(
          y(value)
        )}" stroke="#eceef5" stroke-width="1"/>`
    )
    .join('');
  const yLabels = ticks
    .map(
      (value) =>
        `<text x="${left - 8}" y="${round(y(value) + 4)}" text-anchor="end" font-size="11" fill="rgba(0,0,0,0.55)">${axisNumber(
          value,
          digits
        )}</text>`
    )
    .join('');

  // A line per unbroken run, not one line through every point there is. Where
  // the solver has nothing to say -- a position a force analysis could not
  // balance -- the panel's own chart breaks, and a picture that joined the two
  // ends drew a straight line through the very positions it has no answer for.
  const curves = plot.series
    .map((series, at) => {
      const colour = COLORS[at] ?? COLORS[0];
      return runsOf(series.values)
        .map((run) => {
          const points = run
            .map((index) => `${round(x(index))},${round(y(series.values[index]))}`)
            .join(' ');
          // A run of one has no line in it; a dot is what the panel leaves.
          return run.length === 1
            ? `<circle cx="${round(x(run[0]))}" cy="${round(
                y(series.values[run[0]])
              )}" r="1.4" fill="${colour}"/>`
            : `<polyline points="${points}" fill="none" stroke="${colour}" stroke-width="1.8" stroke-linejoin="round"/>`;
        })
        .join('');
    })
    .join('');

  const axis =
    `<line x1="${left}" y1="${top + innerHeight}" x2="${left + innerWidth}" y2="${
      top + innerHeight
    }" stroke="#d5d7e0" stroke-width="1"/>` +
    `<text x="${left}" y="${top + innerHeight + 20}" font-size="11" fill="rgba(0,0,0,0.55)">0 s</text>` +
    `<text x="${left + innerWidth}" y="${
      top + innerHeight + 20
    }" text-anchor="end" font-size="11" fill="rgba(0,0,0,0.55)">${lastTime.toFixed(2)} s</text>`;

  // On the top line, ahead of the title. The bottom right is where the last
  // axis label is, and a mark parked there sat on top of it.
  const markWidth = 74;
  const mark =
    standalone && options.logo
      ? `<image href="${options.logo}" x="12" y="8" width="${markWidth}" height="18" preserveAspectRatio="xMinYMid meet"/>`
      : '';
  const titleAt = standalone && options.logo ? 12 + markWidth + 12 : left;
  const heading = standalone
    ? `<text x="${titleAt}" y="22" font-size="15" font-weight="500" fill="#2c2c2c">${escapeXml(
        plot.title
      )}</text>` +
      `<text x="${width - right}" y="22" text-anchor="end" font-size="12" fill="rgba(0,0,0,0.45)">${escapeXml(
        plot.unit
      )}</text>` +
      legend(plot, left) +
      mark
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Roboto, Helvetica, Arial, sans-serif">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    grid +
    yLabels +
    curves +
    axis +
    heading +
    `</svg>`
  );
}

/** The series names, in their own colours, under the title. */
function legend(plot: ExportPlot, left: number): string {
  let at = left;
  return plot.series
    .map((series, index) => {
      const name = series.name || plot.head;
      const swatch = `<rect x="${at}" y="32" width="10" height="10" rx="2" fill="${
        COLORS[index] ?? COLORS[0]
      }"/><text x="${at + 15}" y="41" font-size="12" fill="rgba(0,0,0,0.65)">${escapeXml(
        name
      )}</text>`;
      at += 15 + Math.max(14, name.length * 7) + 14;
      return swatch;
    })
    .join('');
}

/** The stretches of a series the solver actually answered for, as index runs. */
function runsOf(values: number[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  values.forEach((value, index) => {
    if (Number.isFinite(value)) {
      run.push(index);
      return;
    }
    if (run.length > 0) runs.push(run);
    run = [];
  });
  if (run.length > 0) runs.push(run);
  return runs;
}

/** A little air above and below, so a flat line is not drawn on the frame. */
function pad(low: number, high: number): [number, number] {
  if (low === high) {
    const margin = Math.abs(low) > 1e-9 ? Math.abs(low) * 0.1 : 1;
    return [low - margin, high + margin];
  }
  const margin = (high - low) * 0.08;
  return [low - margin, high + margin];
}

/**
 * How many decimals an axis label needs, read off the range rather than the tick.
 *
 * Per tick, a value that is float noise beside its neighbours -- 9.2e-6 on an
 * axis running to 7 -- came out in scientific notation, which read as a real
 * quantity of its own. What matters is how far apart the labels are.
 */
function tickDigits(span: number): number {
  if (span >= 100) return 0;
  if (span >= 10) return 1;
  if (span >= 1) return 2;
  if (span >= 0.01) return 4;
  return -1;
}

function axisNumber(value: number, digits: number): string {
  if (digits < 0) return value === 0 ? '0' : value.toExponential(1);
  if (Math.abs(value) >= 1e5) return value.toExponential(1);
  return String(Number(value.toFixed(digits)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
