import {
  blockPath,
  capsulePath,
  channelPath,
  CYLINDER,
  cylinderArrowPaths,
  cylinderBlockPath,
  MARK,
  railGeometry,
  rodBodyPath,
  slotHalfLength,
  straightArrowPaths,
  motorBodyAt,
  motorBodyPath,
} from '../../app/model/joint-marks';

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

  it('offsets the grounded rails 1.975R and hangs ticks off both', () => {
    const { rails, ticks } = railGeometry(R, 96);

    expect(rails.map((rail) => rail.y1)).toEqual([-19.75, 19.75]);
    expect(rails[0].x1).toBe(-96);
    // slot-grounded.svg starts its ticks at x = -88 and steps by 13.
    expect(ticks[0]).toEqual({ x1: -88, y1: -19.75, x2: -96, y2: -27.75 });
    expect(ticks[2].x1 - ticks[0].x1).toBeCloseTo(13, 9);
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
  it('draws the rod exactly as tall as the block, so the two are one bar', () => {
    // At 1.84 the rod stood proud of the block by 0.315R above and below the
    // place they meet.
    expect(CYLINDER.rodHalf).toBe(MARK.blockAcrossHalf);
    const ys = numbers(rodBodyPath(R, 80)).filter((v) => Math.abs(v) === CYLINDER.rodHalf * R);
    expect(ys.length).toBeGreaterThan(0);
  });

  it('squares the block against the barrel and rounds only the rod side', () => {
    const path = cylinderBlockPath(R);
    const values = numbers(path);

    // Full §2.8 block proportions...
    expect(Math.max(...values.map(Math.abs))).toBeCloseTo(MARK.blockAlongHalf * R, 6);
    expect(values).toContain(MARK.blockAcrossHalf * R);
    // ...but only the two rod-side corners carry the radius: two arcs, and the
    // barrel-side (-x) corners land exactly on the block's own corner points.
    expect(path.match(/A /g)).toHaveLength(2);
    const a = MARK.blockAlongHalf * R;
    const c = MARK.blockAcrossHalf * R;
    expect(path.startsWith(`M ${-a} ${-c}`)).toBe(true);
    expect(path.endsWith(`H ${-a} Z`)).toBe(true);
  });

  it('emphasises the set-off arrow without breaking out of the block', () => {
    // §4.2b: two matched arrows say only "this translates"; the heavier, longer
    // one is what says which way it goes first. Same rule as the unskinned mark.
    const [forward, backward] = cylinderArrowPaths(R, 1);
    expect(forward.emphasised).toBe(true);
    expect(backward.emphasised).toBe(false);
    expect(Math.abs(forward.line.x2)).toBeGreaterThan(Math.abs(backward.line.x2));
    // The grown tip still lands inside the block, where white is guaranteed.
    expect(numbers(forward.head)[0]).toBeLessThanOrEqual(MARK.blockAlongHalf * R);
    expect(numbers(backward.head)[0]).toBeCloseTo(-CYLINDER.arrowTip * R, 6);

    // With no known direction the two stay matched.
    const neutral = cylinderArrowPaths(R);
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
