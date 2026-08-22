import { Decimals } from './export-model';
import { ExportTable } from './export-table.service';
import { formatCell } from './csv-writer';
import { utf8, zipStore } from './zip';
import { escapeXml } from './xml';

/**
 * A workbook, written by hand.
 *
 * The minimum an .xlsx can be: a content-type map, two relationship files, a
 * workbook naming the sheets, and a sheet per table with its strings inline.
 * No styles, no shared strings, no calc chain — a reader opens this to chart
 * columns of numbers, and every part beyond these is one Excel supplies itself.
 */
export function toXlsx(tables: ExportTable[], decimals: Decimals): Uint8Array {
  const names = sheetNames(tables);
  const parts = [
    { name: '[Content_Types].xml', data: utf8(contentTypes(tables.length)) },
    { name: '_rels/.rels', data: utf8(rootRels()) },
    { name: 'xl/workbook.xml', data: utf8(workbook(names)) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels(tables.length)) },
    ...tables.map((table, at) => ({
      name: `xl/worksheets/sheet${at + 1}.xml`,
      data: utf8(sheet(table, decimals)),
    })),
  ];
  return zipStore(parts);
}

/**
 * Sheet names Excel will actually accept: 31 characters, no `[]:*?/\`, unique.
 *
 * A name it refuses is not a warning but a file that will not open at all, so
 * this is cleaned rather than trusted.
 */
export function sheetNames(tables: ExportTable[]): string[] {
  const used = new Set<string>();
  return tables.map((table, at) => {
    const cleaned = table.name.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || `Sheet${at + 1}`;
    let name = cleaned;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = `_${n++}`;
      name = cleaned.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function contentTypes(sheets: number): string {
  const overrides = Array.from(
    { length: sheets },
    (_, at) =>
      `<Override PartName="/xl/worksheets/sheet${at + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbook(names: string[]): string {
  const sheets = names
    .map((name, at) => `<sheet name="${escapeXml(name)}" sheetId="${at + 1}" r:id="rId${at + 1}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRels(sheets: number): string {
  const rels = Array.from(
    { length: sheets },
    (_, at) =>
      `<Relationship Id="rId${at + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${at + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function sheet(table: ExportTable, decimals: Decimals): string {
  const rows: string[] = [
    `<row r="1">${table.heads
      .map(
        (head, at) =>
          `<c r="${cellRef(at, 1)}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            head
          )}</t></is></c>`
      )
      .join('')}</row>`,
  ];
  table.times.forEach((time, row) => {
    const cells = [
      formatCell(time, decimals),
      ...table.columns.map((c) => formatCell(c[row], decimals)),
    ]
      .map((value, at) =>
        value === '' ? '' : `<c r="${cellRef(at, row + 2)}"><v>${value}</v></c>`
      )
      .join('');
    rows.push(`<row r="${row + 2}">${cells}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join(
    ''
  )}</sheetData></worksheet>`;
}

/** `A1`, `Z1`, `AA1` — the address a cell has to carry to be read back. */
export function cellRef(column: number, row: number): string {
  let name = '';
  let at = column;
  do {
    name = String.fromCharCode(65 + (at % 26)) + name;
    at = Math.floor(at / 26) - 1;
  } while (at >= 0);
  return `${name}${row}`;
}
