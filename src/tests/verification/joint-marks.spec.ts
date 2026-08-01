import {
  blockPath,
  capsulePath,
  channelPath,
  curvedArrowPath,
  MARK,
  railGeometry,
  riderCapsulePath,
  slotHalfLength,
  straightArrowPaths,
} from '../../app/model/joint-marks';
import { weldPlateFillets } from '../../app/model/weld-plate';

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

  it('insets the slot 1.8R from each defining joint', () => {
    // Two joints 200 apart leave 200/2 - 18 = 82 each way from the midpoint.
    expect(slotHalfLength(R, 200)).toBeCloseTo(82, 9);
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

  it('keeps a rider the same width at both ends', () => {
    // The failure this exists for draws a wedge: anchoring the near end on the
    // frame's normal instead of the rider's own tapers the plate from the block
    // down to the far joint. It animates, it looks like a link, and it is a
    // different link -- so width is asserted rather than eyeballed.
    for (const deg of [0, 31, 58.9, 90, 137, 180, 244, 300]) {
      const angle = (deg * Math.PI) / 180;
      const [nearA, farA, farB, nearB] = endpoints(riderCapsulePath(120, 18.4, angle));

      expect(distance(nearA, nearB), `near end at ${deg} deg`).toBeCloseTo(36.8, 6);
      expect(distance(farA, farB), `far end at ${deg} deg`).toBeCloseTo(36.8, 6);
    }
  });

  it('starts a rider at its joint and ends it at the far one', () => {
    for (const deg of [0, 58.9, 137, 244]) {
      const angle = (deg * Math.PI) / 180;
      const [nearA, farA, farB, nearB] = endpoints(riderCapsulePath(120, 18.4, angle));
      const nearMid = midpoint(nearA, nearB);
      const farMid = midpoint(farA, farB);

      expect(Math.hypot(nearMid[0], nearMid[1]), `near at ${deg} deg`).toBeCloseTo(0, 6);
      expect(farMid[0], `far x at ${deg} deg`).toBeCloseTo(120 * Math.cos(angle), 6);
      expect(farMid[1], `far y at ${deg} deg`).toBeCloseTo(120 * Math.sin(angle), 6);
    }
  });

  it('sweeps the driven-pin arc the long way round', () => {
    // A short arc reads as a wobble rather than as a revolution.
    expect(curvedArrowPath(R).arc).toContain('A 15.5 15.5 0 1 1');
  });
});

describe('the weld plate', () => {
  it('fillets both internal angles where the reference does', () => {
    // slide-floating-driven.svg, rider at 58.9 degrees:
    //   Q -12.289 15.25  and  Q 30.688 15.25
    const fillets = weldPlateFillets(R, (58.9 * Math.PI) / 180);

    expect(fillets.length).toBe(2);
    const corners = fillets.map((path) => numbers(path).slice(2, 4));
    expect(corners[0][0]).toBeCloseTo(-12.289, 2);
    expect(corners[0][1]).toBeCloseTo(15.25, 6);
    expect(corners[1][0]).toBeCloseTo(30.688, 2);
    expect(corners[1][1]).toBeCloseTo(15.25, 6);
  });

  it('turns each fillet away from the rider, not both the same way', () => {
    // Both leaning one way would read as a fold rather than as two welds.
    const fillets = weldPlateFillets(R, (58.9 * Math.PI) / 180);
    const [left, right] = fillets.map((path) => numbers(path));

    expect(left[0]).toBeCloseTo(-24.789, 2);
    expect(right[0]).toBeCloseTo(43.188, 2);
  });

  it('draws no fillet where there is no corner on screen', () => {
    // A rider along its own slot is 3.68R wide against a block 3.05R across, so
    // it swallows the block rather than meeting it at an angle. Filleting there
    // would soften a corner nobody can see.
    expect(weldPlateFillets(R, 0)).toEqual([]);
  });

  it('fillets a rider square across its slot', () => {
    const fillets = weldPlateFillets(R, Math.PI / 2);

    expect(fillets.length).toBe(2);
    for (const path of fillets) {
      expect(numbers(path).every(Number.isFinite)).toBe(true);
    }
  });

  it('stays finite all the way round', () => {
    for (let deg = 0; deg < 360; deg += 1) {
      for (const path of weldPlateFillets(R, (deg * Math.PI) / 180)) {
        expect(numbers(path).every(Number.isFinite), `rider at ${deg} deg`).toBe(true);
      }
    }
  });
});
