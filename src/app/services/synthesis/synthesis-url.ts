import { Coord } from 'src/app/model/coord';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { BaseNConverter } from '../transcoding/base64-converter';
import { FlagPacker } from '../transcoding/flag-packer';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { COR, SynthesisPose } from './synthesis-util';

/**
 * The synthesis design, in and out of the URL.
 *
 * It rides in the trailing section the lock marks opened, under the tag 'S',
 * so a document with no design in progress is byte-identical to one written
 * before this existed. Entries:
 *
 *   SD~[length]~[reference]~[flags]   the design as a whole
 *   SP~[x]~[y]~[angle]                one position, in the order they were placed
 *   SR~[x]~[y]~[width]~[height]       the ground-pivot region, only when required
 *   SO~[id]~[id]...                   the joints this design put on the grid
 *   SW~[x]~[y]~[x]~[y]...             where it put each of them, in that order
 *
 * Numbers are base-N to three decimals, like every other number in this format,
 * and lengths are in the user's own units -- the internal world is MODEL_SCALE
 * times those, and the codec is the boundary where that is undone.
 */

/** The order the flags pack in. Appending is safe; reordering is not. */
const FLAGS = 6;

function num(value: number): string {
  return BaseNConverter.toUrlSafeBaseN(Math.round(value * 1000));
}

function unnum(text: string): number {
  return BaseNConverter.fromUrlSafeBaseN(text) / 1000;
}

function length(model: number): string {
  return num(model / MODEL_SCALE);
}

function unlength(text: string): number {
  return unnum(text) * MODEL_SCALE;
}

const REFERENCES = [COR.BACK, COR.CENTER, COR.FRONT];

/**
 * What this design is, as trailing entries -- or nothing at all.
 *
 * A design with no positions and nothing asked of it is not a design, and
 * writing one would make every URL in the app longer for a panel most readers
 * never open.
 */
export function encodeSynthesisDesign(design: SynthesisBuilderService): string[] {
  const poses = design.getAllPoses();
  const untouched =
    poses.length === 0 &&
    design.stage === 'chooser' &&
    design.endsOnly &&
    !design.allowDefect &&
    !design.constrain &&
    design.ownedJointIds.length === 0 &&
    !design.ownershipPartial;
  if (untouched) return [];

  const marks = [
    'SD~' +
      length(design.length) +
      '~' +
      BaseNConverter.toUrlSafeBaseN(REFERENCES.indexOf(design.COR)) +
      '~' +
      FlagPacker.pack([
        design.endsOnly,
        design.allowDefect,
        design.constrain,
        design.stage === 'working',
        design.ownershipPartial,
        false,
      ]),
  ];

  poses.forEach((pose: SynthesisPose) => {
    marks.push(
      'SP~' + length(pose.position.x) + '~' + length(pose.position.y) + '~' + num(pose.thetaDegrees)
    );
  });

  if (design.constrain) {
    const r = design.region;
    marks.push('SR~' + length(r.x) + '~' + length(r.y) + '~' + length(r.w) + '~' + length(r.h));
  }

  // What this design owns on the grid, and where it put each of them, so undo
  // and a reload both come back holding it and knowing whether it has been
  // moved since. Ids are letters, which nothing here needs to encode.
  if (design.ownedJointIds.length) {
    marks.push('SO~' + design.ownedJointIds.join('~'));
    // The baseline rides in its own entry rather than beside the ids: an id is
    // a letter and a number is base-N over an alphabet that includes letters,
    // so one entry holding both cannot be read back without guessing.
    if (design.ownedAt.length === design.ownedJointIds.length) {
      marks.push('SW~' + design.ownedAt.map((at) => length(at.x) + '~' + length(at.y)).join('~'));
    }
  }

  return marks;
}

/**
 * Put a decoded design back, exactly as it was written.
 *
 * Everything is replaced rather than merged: the entries are the whole of the
 * design, so a URL with fewer positions than the panel currently holds means
 * the reader undid one, not that two designs should be combined.
 */
export function applySynthesisDesign(marks: string[], design: SynthesisBuilderService): void {
  const header = marks.find((entry) => entry.startsWith('SD~'));
  if (!header) {
    // No design in this URL. Undo can step back to before there was one, so
    // that has to clear the panel rather than leave the last one standing.
    design.clearDesign();
    return;
  }

  const [lengthText, referenceText, flagsText] = header.substring(3).split('~');
  const [endsOnly, allowDefect, constrain, working, ownershipPartial] = FlagPacker.unpack(
    flagsText,
    FLAGS
  );

  design.applyDecoded({
    length: unlength(lengthText),
    reference: REFERENCES[BaseNConverter.fromUrlSafeBaseN(referenceText, true)] ?? COR.CENTER,
    endsOnly,
    allowDefect,
    constrain,
    stage: working ? 'working' : 'chooser',
    poses: marks
      .filter((entry) => entry.startsWith('SP~'))
      .map((entry) => {
        const [x, y, theta] = entry.substring(3).split('~');
        return { at: new Coord(unlength(x), unlength(y)), thetaDegrees: unnum(theta) };
      }),
    region: (() => {
      const entry = marks.find((mark) => mark.startsWith('SR~'));
      if (!entry) return undefined;
      const [x, y, w, h] = entry.substring(3).split('~');
      return { x: unlength(x), y: unlength(y), w: unlength(w), h: unlength(h) };
    })(),
    ownedJointIds: (marks.find((mark) => mark.startsWith('SO~')) ?? '').split('~').slice(1),
    ownedAt: (() => {
      const entry = marks.find((mark) => mark.startsWith('SW~'));
      if (!entry) return [];
      const parts = entry.substring(3).split('~');
      const out: { x: number; y: number }[] = [];
      for (let i = 0; i + 1 < parts.length; i += 2) {
        out.push({ x: unlength(parts[i]), y: unlength(parts[i + 1]) });
      }
      return out;
    })(),
    // Whether some of what this design put on the grid has since been taken
    // away. The ids alone cannot say so after a reload -- the missing ones get
    // dropped, and a shortened list looks exactly like a shorter linkage.
    ownershipPartial,
  });
}
