import { mergedChannels } from '../../app/model/compound-link-path';
import { collinearGuides, orientedCapsulePath, railGeometry } from '../../app/model/joint-marks';

/**
 * Two slots that cross, drawn two ways.
 *
 * A carrier subtracts a channel by appending it to its own path and filling
 * even-odd. That is exactly right for one channel and exactly wrong for two
 * that cross: the crossing lies inside both, so it is wound three times, comes
 * out odd, and fills back in. What renders is a carrier-coloured diamond in the
 * middle of the X with both capsule outlines stroked straight through it.
 *
 * Two grounded guides that cross have the same problem in the hatch layer,
 * where there is nothing to union: solid rails and their ticks simply overpaint
 * each other into a knot.
 */

function rings(path: string): number {
  return (path.match(/M/g) ?? []).length;
}

const crossing = [
  orientedCapsulePath({ x: 0, y: 0 }, 0, 2, 0.2),
  orientedCapsulePath({ x: 0, y: 0 }, Math.PI / 2, 2, 0.2),
];

describe('channels cut into one carrier', () => {
  it('merges a crossing pair into a single hole', () => {
    expect(rings(crossing.join(' '))).toBe(2);
    expect(rings(mergedChannels(crossing))).toBe(1);
  });

  it('leaves two channels that do not touch as two holes', () => {
    const apart = [
      orientedCapsulePath({ x: 0, y: 0 }, 0, 1, 0.2),
      orientedCapsulePath({ x: 0, y: 5 }, 0, 1, 0.2),
    ];

    expect(rings(mergedChannels(apart))).toBe(2);
  });

  it('leaves a single channel exactly as drawn', () => {
    // Unioning one shape would flatten its arcs to a polygon for no gain.
    expect(mergedChannels([crossing[0]])).toBe(crossing[0]);
  });
});

describe('a grounded guide crossed by another', () => {
  const band = {
    x: 0,
    y: 0,
    angle: Math.PI / 2,
    halfLength: 3,
    halfWidth: 0.3,
  };

  it('breaks its rails where the other guide passes', () => {
    const alone = railGeometry(0.15, 3);
    const crossed = railGeometry(0.15, 3, [band]);

    expect(alone.dashedRails.length).toBe(0);
    // Each of the two rails is cut once, leaving two solid pieces and a broken
    // middle -- the drawing convention for the member passing behind.
    expect(crossed.dashedRails.length).toBe(2);
    expect(crossed.rails.length).toBe(4);
  });

  it('drops the hatch that would fall inside the other guide', () => {
    const alone = railGeometry(0.15, 3);
    const crossed = railGeometry(0.15, 3, [band]);

    expect(crossed.ticks.length).toBeLessThan(alone.ticks.length);
    for (const tick of crossed.ticks) {
      for (const [x, y] of [
        [tick.x1, tick.y1],
        [tick.x2, tick.y2],
      ]) {
        // In the band's own frame, since it runs across this one.
        expect(Math.abs(y) <= band.halfLength && Math.abs(x) <= band.halfWidth).toBe(false);
      }
    }
  });

  it('leaves a guide nothing crosses entirely solid', () => {
    const clear = railGeometry(0.15, 3, [{ ...band, x: 100 }]);

    expect(clear.dashedRails.length).toBe(0);
    expect(clear.rails.length).toBe(2);
    expect(clear.ticks.length).toBe(railGeometry(0.15, 3).ticks.length);
  });
});

/**
 * Two grounded guides on one line are not two members crossing. Broken through
 * each other they draw a dashed gap across a rail that is perfectly continuous,
 * which reads as a join that is not there.
 */
describe('a grounded guide sharing a line with another', () => {
  const shared = { x: 0, y: 0, angle: 0, halfLength: 1.5, halfWidth: 0.3, coincident: true };

  it('stays solid instead of breaking for it', () => {
    const merged = railGeometry(0.15, 3, [shared]);

    expect(merged.dashedRails.length).toBe(0);
    expect(merged.rails.length).toBe(2);
    // End to end, so the two together draw one unbroken line.
    expect(merged.rails.map((rail) => [rail.x1, rail.x2])).toEqual([
      [-3, 3],
      [-3, 3],
    ]);
  });

  it('leaves the span the other one hatches to the other one', () => {
    const merged = railGeometry(0.15, 3, [shared]);

    expect(merged.ticks.length).toBeLessThan(railGeometry(0.15, 3).ticks.length);
    for (const tick of merged.ticks) {
      expect(Math.abs(tick.x1)).toBeGreaterThan(shared.halfLength);
    }
  });

  it('recognises the same line however far along it the other guide sits', () => {
    const own = { x: 0, y: 0, angle: 0, halfLength: 3, halfWidth: 0.3 };

    expect(collinearGuides(own, { ...own, x: 40 }, 0.01)).toBe(true);
    // A guide beside it, and a guide turned away from it, are both crossings.
    expect(collinearGuides(own, { ...own, y: 1 }, 0.01)).toBe(false);
    expect(collinearGuides(own, { ...own, angle: 0.5 }, 0.01)).toBe(false);
  });
});
