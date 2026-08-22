import { roundNumber } from '../../model/utils';
import { Decimals } from './export-model';
import { ExportTable } from './export-table.service';

/**
 * A number as a file should carry it.
 *
 * Rounded here rather than at the source: a graph wants every digit the solver
 * produced, and a spreadsheet wants a number a person can read instead of
 * 0.30000000000000004. `full` is the escape hatch for anyone who would rather
 * do their own rounding downstream.
 */
export function formatCell(value: number | undefined, decimals: Decimals): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return String(decimals === 'full' ? value : roundNumber(value, decimals));
}

/** A column head carries commas and apostrophes; a CSV field has to take them. */
export function quoteCsv(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One table, as a comma-separated file with a single time column. */
export function toCsv(table: ExportTable, decimals: Decimals): string {
  const head = table.heads.map(quoteCsv).join(',');
  const body = table.times.map((time, row) =>
    [
      formatCell(time, decimals),
      ...table.columns.map((column) => formatCell(column[row], decimals)),
    ].join(',')
  );
  return [head, ...body].join('\n') + '\n';
}
