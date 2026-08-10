import {
  blockPath,
  capsulePath,
  channelPath,
  CYLINDER,
  cylinderArrowPaths,
  cylinderBlockPath,
  GROUND_STROKE,
  MARK,
  railGeometry,
  rodBodyPath,
  slotHalfLength,
  straightArrowPaths,
  motorBodyAt,
  motorBodyPath,
} from '../../app/model/joint-marks';
import { cylinderHeadHalf } from '../../app/model/cylinder';

// The design package authors every mark at R = 10, so the shipped SVGs are a
// numeric reference this module has to reproduce rather than approximate.
const R = 10;

/** Every number in a path string, in order. */
function numbers(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
}

/**
 * Where each drawing command ends up. An arc carries seven numbers and a line
 * two, so counting numbers to find a point reads the radii as coordinates.
 */
function endpoints(path: string): [number, number][] {
  const found: [number, number][] = [];
  for (const [, , body] of path.matchAll(/([MLA])([^MLAZ]*)/g)) {
    const values = numbers(body);
    if (values.length >= 2) found.push([values[values.length - 2], values[values.length - 1]]);
  }
  return found;
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

describe('the mark system, against the delivered SVGs', () => {
  it('draws the block 7.68R by 3.05R', () => {
    const values = numbers(blockPath(R));

    expect(Math.max(...values.map(Math.abs))).toBeCloseTo(38.4, 6);
    // Corner radius appears as the arc radii.
    expect(values).toContain(MARK.blockCorner * R);
  });

  it('draws the channel as a 2.3R capsule, both caps round', () => {
    // slot-floating.svg: M 0 -11.5 H 116 A 11.5 11.5 0 0 1 116 11.5 ...
    expect(channelPath(R, 58)).toBe(capsulePath(-58, 58, 11.5));
    expect(capsulePath(0, 116, 11.5)).toContain('M 0 -11.5 H 116 A 11.5 11.5 0 0 1 116 11.5');
  });

  it('insets the slot 2.8R from each defining joint', () => {
    // Two joints 200 apart leave 200/2 - 28 = 72 each way from the midpoint.
    expect(slotHalfLength(R, 200)).toBeCloseTo(72, 9);
  });

  it('never lets the slot be shorter than the block inside it', () => {
    // A block hanging out past the end of its own guide reads as an escape, so
    // the floor wins on a short carrier even though it then reaches nearer the
    // defining joints than 1.8R.
    expect(slotHalfLength(R, 100)).toBe(MARK.blockAlongHalf * R);
    expect(slotHalfLength(R, 10)).toBe(MARK.blockAlongHalf * R);
  });

  it('offsets the grounded rails 1.85R and hangs ticks off both', () => {
    const { rails, ticks } = railGeometry(R, 96);

    expect(rails.map((rail) => rail.y1)).toEqual([-18.5, 18.5]);
    expect(rails[0].x1).toBe(-96);
    expect(ticks[2].x1 - ticks[0].x1).toBeCloseTo(13, 9);
  });

  it('overlaps every tick into the rail without piercing it', () => {
    // A round cap is centred on its own point, so where the tick's line ends is
    // not where its ink does. Rooted on the rail's centreline it hung half the
    // hatch's width over the block's side and read as piercing its own rail;
    // held far enough out to be tangent to the edge it read as floating clear.
    // Ground.svg does neither -- its hatch starts on the far edge of the
    // baseline and its cap reaches back past the middle.
    const { ticks } = railGeometry(R, 96);
    const outer = MARK.railOffset * R + (GROUND_STROKE.rail * R) / 2;
    const inner = MARK.railOffset * R - (GROUND_STROKE.rail * R) / 2;
    const capReach = (GROUND_STROKE.hatch * R) / 2;

    for (const tick of ticks) {
      const reaches = Math.abs(tick.y1) - capReach;
      expect(reaches).toBeLessThan(outer);
      expect(reaches).toBeGreaterThan(inner);
    }
  });

  it('keeps the whole hatch inside the length the rail runs', () => {
    // The tick roots moved outward along their own 45 degrees, which moves them
    // along the rail as well -- so a first tick placed the old way now hangs
    // its tip off the end of the line it is hatching.
    const { ticks } = railGeometry(R, 96);

    for (const tick of ticks) {
      expect(Math.min(tick.x1, tick.x2)).toBeGreaterThanOrEqual(-96);
      expect(Math.max(tick.x1, tick.x2)).toBeLessThanOrEqual(96);
    }
  });

  it('leans every tick the same way, whatever the rail length', () => {
    // Hatching says "the world is on this side", and the world does not rotate
    // -- so no tick may depend on anything that varies per frame.
    const short = railGeometry(R, 40).ticks;
    const long = railGeometry(R, 200).ticks;

    for (const set of [short, long]) {
      for (const tick of set) {
        expect(tick.x2 - tick.x1).toBeCloseTo(-8, 9);
        expect(Math.abs(tick.y2) - Math.abs(tick.y1)).toBeCloseTo(8, 9);
      }
    }
  });

  it('points the two driven-slider arrows opposite ways', () => {
    const [forward, backward] = straightArrowPaths(R);

    expect(forward.line).toEqual({ x1: 14, y1: 0, x2: 26, y2: 0 });
    expect(backward.line).toEqual({ x1: -14, y1: 0, x2: -26, y2: 0 });
    // Tips at ±3R, which is clear of the 1.47R welded marker between them.
    expect(numbers(forward.head)[0]).toBeCloseTo(30, 6);
    expect(numbers(backward.head)[0]).toBeCloseTo(-30, 6);
  });

  it('measures a bar half-width as the width links are actually drawn at', () => {
    // Everything derived from barHalf assumed a bar 10% wider than the one on
    // screen: the weld plate stood proud of its own rider all the way round,
    // and the drop radius for cutting a slot reached past the bar's edge.
    // objectScale / 4 is the link half-width, so barHalf is that in units of R.
    const objectScale = 4;
    expect(MARK.barHalf * 0.15 * objectScale).toBeCloseTo(objectScale / 4, 12);
  });

  it('leaves a margin of bar between a slot and the joint it stops short of', () => {
    // A channel that reaches the joint circle reads as a bar cut through rather
    // than slotted, which is what 1.8R drew: 0.27 objectScale against a joint
    // drawn at 0.2.
    const objectScale = 1;
    const jointRadius = 0.2 * objectScale;
    expect(MARK.slotInset * 0.15 * objectScale).toBeGreaterThan(jointRadius * 1.5);
  });
});

describe('the cylinder skin (§2.7)', () => {
  /** A head on a barrel with room for the whole block, which is the usual case. */
  const FULL_HEAD = cylinderHeadHalf(40 * R, R);

  it('draws the rod exactly as tall as the block, so the two are one bar', () => {
    // At 1.84 the rod stood proud of the block by 0.315R above and below the
    // place they meet.
    expect(CYLINDER.rodHalf).toBe(MARK.blockAcrossHalf);
    const ys = numbers(rodBodyPath(R, 80, FULL_HEAD)).filter(
      (v) => Math.abs(v) === CYLINDER.rodHalf * R
    );
    expect(ys.length).toBeGreaterThan(0);
  });

  it('squares the head against the barrel and rounds only the rod side', () => {
    const path = cylinderBlockPath(R, FULL_HEAD);
    const values = numbers(path);

    // Full §2.8 block proportions: on any ram with room for it the head is
    // exactly the block a bare slider wears.
    expect(Math.max(...values.map(Math.abs))).toBeCloseTo(MARK.blockAlongHalf * R, 6);
    expect(values).toContain(MARK.blockAcrossHalf * R);
    // ...but only the two rod-side corners carry the radius: two arcs, and the
    // barrel-side (-x) corners land exactly on the block's own corner points.
    expect(path.match(/A /g)).toHaveLength(2);
    const a = FULL_HEAD;
    const c = MARK.blockAcrossHalf * R;
    expect(path.startsWith(`M ${-a} ${-c}`)).toBe(true);
    expect(path.endsWith(`H ${-a} Z`)).toBe(true);
  });

  it('grows the head back to full size the moment the barrel has room', () => {
    // The head is a function of the barrel only because it has to fit inside it
    // at full retraction. Anywhere above that it is the block, unchanged.
    expect(cylinderHeadHalf(40 * R, R)).toBeCloseTo(MARK.blockAlongHalf * R, 9);
    // Halfway down it follows the barrel...
    expect(cylinderHeadHalf(4 * R, R)).toBeCloseTo(2 * R, 9);
    // ...and stops when it would be shorter than it is wide.
    expect(cylinderHeadHalf(0.2 * R, R)).toBeCloseTo(MARK.blockAcrossHalf * R, 9);
  });

  it('emphasises the set-off arrow without breaking out of the head', () => {
    // §4.2b: two matched arrows say only "this translates"; the heavier, longer
    // one is what says which way it goes first. Same rule as the unskinned mark.
    const [forward, backward] = cylinderArrowPaths(R, FULL_HEAD, 1);
    expect(forward.emphasised).toBe(true);
    expect(backward.emphasised).toBe(false);
    expect(Math.abs(forward.line.x2)).toBeGreaterThan(Math.abs(backward.line.x2));
    // The grown tip still lands inside the head, where white is guaranteed --
    // and the pair is scaled together, so the quiet arrow shrinks with it
    // rather than overtaking the loud one.
    expect(numbers(forward.head)[0]).toBeLessThanOrEqual(FULL_HEAD);
    expect(numbers(backward.head)[0]).toBeCloseTo(-MARK.arrowTip * R, 6);
    expect(Math.abs(numbers(forward.head)[0])).toBeGreaterThan(Math.abs(numbers(backward.head)[0]));

    // With no known direction the two stay matched.
    const neutral = cylinderArrowPaths(R, FULL_HEAD);
    expect(neutral.every((arrow) => !arrow.emphasised)).toBe(true);
    expect(neutral[0].line.x2).toBeCloseTo(-neutral[1].line.x2, 9);
  });
});

describe('the motor case in world coordinates', () => {
  it('places the same shape, turned and moved', () => {
    // Unrotated at the origin it is the local path, expanded but congruent:
    // same extent, so nothing has been sheared or scaled on the way.
    const local = motorBodyPath(R);
    const placed = motorBodyAt(R, { x: 0, y: 0 }, 0);
    const extent = (path: string) => {
      const values = (path.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      return Math.max(...values.map(Math.abs));
    };
    expect(extent(placed)).toBeCloseTo(extent(local), 6);
  });

  it('turns the case with the body it is bolted to', () => {
    // A quarter turn takes the case's far edge from +x to +y.
    const turned = motorBodyAt(R, { x: 0, y: 0 }, Math.PI / 2);
    const first = (turned.match(/M\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/) ?? []).slice(1).map(Number);
    const straight = motorBodyAt(R, { x: 0, y: 0 }, 0);
    const flat = (straight.match(/M\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/) ?? []).slice(1).map(Number);
    expect(first[0]).toBeCloseTo(-flat[1], 6);
    expect(first[1]).toBeCloseTo(flat[0], 6);
  });

  it('moves the case to the joint it belongs to', () => {
    const here = motorBodyAt(R, { x: 100, y: -40 }, 0);
    const values = (here.match(/M\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/) ?? []).slice(1).map(Number);
    const origin = (
      motorBodyAt(R, { x: 0, y: 0 }, 0).match(/M\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/) ?? []
    )
      .slice(1)
      .map(Number);
    expect(values[0]).toBeCloseTo(origin[0] + 100, 6);
    expect(values[1]).toBeCloseTo(origin[1] - 40, 6);
  });
});
