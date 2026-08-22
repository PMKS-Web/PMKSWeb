/**
 * A ZIP container, stored rather than compressed.
 *
 * An .xlsx is a zip of XML parts, and writing one is the whole reason this
 * exists — a spreadsheet is the second thing every reader of this app asks
 * for, and a dependency that pulls in a compressor to save a few kilobytes of
 * text is a poor trade against a hundred lines that can be read in full.
 *
 * Deflate is deliberately not implemented: method 0 (stored) is part of the
 * format and every unzipper accepts it, and Excel does not care.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** A fixed timestamp, so the same selection writes byte-identical files. */
const DOS_TIME = 0;
const DOS_DATE = 0x5021; // 1 January 2020, in the packed form the header expects.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** The archive, ready to be handed to the browser as one download. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const local = block(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true); // Names are UTF-8.
    local.view.setUint16(8, 0, true); // Stored.
    local.view.setUint16(10, DOS_TIME, true);
    local.view.setUint16(12, DOS_DATE, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, entry.data.length, true);
    local.view.setUint32(22, entry.data.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    locals.push(local.bytes, entry.data);

    const central = block(46 + name.length);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint16(12, DOS_TIME, true);
    central.view.setUint16(14, DOS_DATE, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, entry.data.length, true);
    central.view.setUint32(24, entry.data.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, offset, true);
    central.bytes.set(name, 46);
    centrals.push(central.bytes);

    offset += local.bytes.length + entry.data.length;
  });

  const directory = concat(centrals);
  const end = block(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, directory.length, true);
  end.view.setUint32(16, offset, true);
  return concat([...locals, directory, end.bytes]);
}

function block(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return out;
}
