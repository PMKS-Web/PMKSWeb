import { AngleUnit } from './unit-enums';

/**
 * The colour of each analysis series, in one place.
 *
 * A graph, its legend and the collapsed header that previews its values all
 * have to agree about which colour means X, so the answer lives beside the
 * model rather than inside whichever component happened to need it first.
 */
export const ANALYSIS_SERIES_COLORS = {
  X: '#313aa7',
  Y: '#ea2b29',
  Z: '#fdb50e',
} as const;

/**
 * A solved value as a reader should see it.
 *
 * Two decimals, which is what the readout row above every plot uses and what
 * the axes beside it are lettered in. The values themselves leave the solver at
 * full precision, so a label printing one straight ran to seventeen digits --
 * "2.6179937801901527" hanging off the plot beside a readout of "2.62" for the
 * same instant.
 *
 * Below the point where two decimals would round to nothing, two significant
 * figures instead, so a small reaction reads as small rather than as zero.
 */
export function formatAnalysisValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0.00';
  return Math.abs(value) < 0.005 ? Number(value.toPrecision(2)).toString() : value.toFixed(2);
}

/**
 * What an angular series has to be multiplied by to be in the unit it is labelled with.
 *
 * The solver does not hand these out in one unit. A link's angle is converted
 * to degrees as it is recorded; its angular velocity and acceleration are left
 * in radians, because that is what the equations are written in. So the panel
 * has always converted one or the other on its way to the screen, depending on
 * which unit the reader has chosen — and an export that skipped it wrote
 * radians per second under a head saying degrees per second.
 *
 * Stated once, here, because a graph and a file of the same series that
 * disagree are worse than either being wrong on its own.
 */
export function angularScale(mechProp: string, unit: AngleUnit): number {
  if (mechProp === 'Angular Link Pos') {
    return unit === AngleUnit.RADIAN ? Math.PI / 180 : 1;
  }
  if (mechProp === 'Angular Link Vel' || mechProp === 'Angular Link Acc') {
    return unit === AngleUnit.DEGREE ? 180 / Math.PI : 1;
  }
  return 1;
}
