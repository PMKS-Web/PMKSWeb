import { outlineSweepFlag, withoutCollinearVertices } from '../../app/model/outline-winding';

/**
 * Every corner of a link outline turns the same way, and which way is decided
 * by the winding of the outline being traced -- not by the joint count, and not
 * by one coordinate of the first corner. With the flag wrong the arc is still
 * the short way round, but round the other circle of that radius through the
 * same two points, so it bulges inward and bites a notch out of the corner.
 */

const WIDTH = 0.25;

function sweepOf(order: string, joints: { id: string; x: number; y: number }[]): string {
  const indexOf = new Map(joints.map((joint, index) => [joint.id, index]));
  return outlineSweepFlag(order, joints, indexOf, WIDTH);
}

/** Twice the signed area: positive when the ring is traced counter-clockwise. */
function winding(ring: { x: number; y: number }[]): number {
  return ring.reduce((total, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return total + (point.x * next.y - next.x * point.y);
  }, 0);
}

describe('which joints are corners of the outline', () => {
  const keep = (order: string, joints: { id: string; x: number; y: number }[]) =>
    withoutCollinearVertices(
      order,
      joints,
      new Map(joints.map((joint, index) => [joint.id, index])),
      WIDTH
    );

  it('drops a joint sitting on the line between its neighbours', () => {
    // Drag any joint of a three-joint link onto the line of the other two and
    // this is what `hull` hands back. Kept as a corner, the offset edge arrives
    // at it, turns through a semicircle, and leaves along the same line -- the
    // outline folds over itself, and even-odd fill renders the doubled part
    // white. That sliver is what flickers in and out during a drag.
    const flat = [
      { id: 'A', x: 0, y: 0 },
      { id: 'H', x: 1.1975, y: 0 },
      { id: 'B', x: 1.52, y: 0 },
    ];

    expect(keep('AHB', flat)).toBe('AB');
  });

  it('drops a fold too thin to see, on the same grounds', () => {
    const almost = [
      { id: 'A', x: 0, y: 0 },
      { id: 'H', x: 1.1975, y: WIDTH * 1e-6 },
      { id: 'B', x: 1.52, y: 0 },
    ];

    expect(keep('AHB', almost)).toBe('AB');
  });

  it('keeps a corner that is a corner', () => {
    const triangle = [
      { id: 'A', x: 0, y: 0 },
      { id: 'H', x: 0.76, y: 1.028 },
      { id: 'B', x: 1.52, y: 0 },
    ];

    expect(keep('AHB', triangle)).toBe('AHB');
  });

  it('never reduces an outline below two ends', () => {
    const coincident = [
      { id: 'A', x: 1, y: 1 },
      { id: 'B', x: 1, y: 1 },
    ];

    expect(keep('AB', coincident)).toBe('AB');
  });
});

describe('which way a link outline turns its corners', () => {
  it('follows the hull it is given, counter-clockwise', () => {
    const joints = [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 4, y: 0 },
      { id: 'C', x: 2, y: 3 },
    ];
    expect(winding(joints)).toBeGreaterThan(0);
    expect(sweepOf('ABC', joints)).toBe('1');
  });

  it('follows the hull it is given, clockwise', () => {
    const joints = [
      { id: 'A', x: 0, y: 0 },
      { id: 'C', x: 2, y: 3 },
      { id: 'B', x: 4, y: 0 },
    ];
    expect(winding(joints)).toBeLessThan(0);
    expect(sweepOf('ACB', joints)).toBe('0');
  });

  it('does not change answer with the number of joints', () => {
    // The rule it replaced flipped itself whenever a link had more than three
    // joints, so a four-joint link whose hull is a triangle got the opposite
    // answer to the identical three-joint one.
    const triangle = [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 4, y: 0 },
      { id: 'C', x: 2, y: 3 },
    ];
    const withInterior = [...triangle, { id: 'D', x: 2, y: 1 }];

    expect(sweepOf('ABC', withInterior)).toBe(sweepOf('ABC', triangle));
  });

  it('reads a hull with no area as the bar it has collapsed to', () => {
    // Three joints in a line have no winding to take a sign from. The outline
    // is still a rectangle, wound the way a two-joint link's is.
    const flat = [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 1.52, y: 0 },
      { id: 'H', x: 1.1975, y: 0 },
    ];

    expect(sweepOf('ABH', flat)).toBe(sweepOf('AB', flat));
  });

  it('holds where three hull points are almost collinear', () => {
    // The configuration an adversarial pass found for the old rule: `hull`
    // returns I -> E -> D -> C with I, E and D on the same slope, so the first
    // corner's exterior point sits barely off the first edge. The old guess read
    // that one coordinate, the joint-count flip inverted it, and all four
    // corners took the wrong side at once -- the near-straight corner at E
    // turning into a semicircular bite.
    const joints = [
      { id: 'I', x: 2.8, y: 1.0 },
      { id: 'E', x: 0, y: 1.7 },
      { id: 'D', x: -4.4, y: 2.8 },
      { id: 'C', x: 2.5, y: 0.5 },
    ];

    expect(winding(joints)).toBeGreaterThan(0);
    expect(sweepOf('IEDC', joints)).toBe('1');
  });

  it('agrees with the winding at every orientation of a two-joint link', () => {
    // A bar has no hull area to read, so its winding comes from which side the
    // first edge is offset to. `hull` happens to order a pair left to right
    // today; asserting all the way round means a change there cannot quietly
    // invert every cap.
    for (let deg = 0; deg < 360; deg += 5) {
      const angle = (deg * Math.PI) / 180;
      const joints = [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: Math.cos(angle), y: Math.sin(angle) },
      ];
      const slope = (joints[1].y - joints[0].y) / (joints[1].x - joints[0].x);
      const normal = Math.atan(slope === 0 ? 99999 : -1 / slope);
      const negative = { x: Math.cos(normal + Math.PI), y: Math.sin(normal + Math.PI) };
      const rectangle = [
        { x: WIDTH * negative.x, y: WIDTH * negative.y },
        { x: joints[1].x + WIDTH * negative.x, y: joints[1].y + WIDTH * negative.y },
        { x: joints[1].x - WIDTH * negative.x, y: joints[1].y - WIDTH * negative.y },
        { x: -WIDTH * negative.x, y: -WIDTH * negative.y },
      ];

      expect(sweepOf('AB', joints), `bar at ${deg} deg`).toBe(winding(rectangle) > 0 ? '1' : '0');
    }
  });
});
