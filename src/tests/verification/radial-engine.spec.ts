// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  radialEngineFixture,
  RADIAL_AXES,
  RADIAL_CRANK,
  RADIAL_CYLINDERS,
  RADIAL_PISTON_IDS,
  RADIAL_ROD,
} from '../../test-utils/verification/slot-fixtures';

// Five sliders on one crank. Nothing else in the suite has more than two, and
// this one stays entirely dyadic while doing it -- the crank pin swings about
// ground and each piston is a circle about that pin meeting its own guide -- so
// it is a scale test for the closed-form path rather than for the simultaneous
// one.
//
// The stroke is exact and worth asserting for that reason: a guide that passes
// through the crank pivot gives a piston travel of exactly twice the crank
// throw, whatever the rod measures. No reference data, no drift.

describe('a five-cylinder radial engine', () => {
  const { mechanism } = buildMechanism(radialEngineFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;
  const PISTONS = RADIAL_PISTON_IDS;

  it('is one degree of freedom and turns a full revolution', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('keeps every rod rigid and the crank on its throw', () => {
    for (let t = 0; t < frames; t++) {
      expect(Math.abs(Math.hypot(at(t, 'A').x, at(t, 'A').y) - RADIAL_CRANK)).toBeLessThan(3e-4);
      for (const piston of PISTONS) {
        const rod = Math.hypot(at(t, 'A').x - at(t, piston).x, at(t, 'A').y - at(t, piston).y);
        expect(Math.abs(rod - RADIAL_ROD)).toBeLessThan(3e-3);
      }
    }
  });

  it('keeps each piston on its own guide', () => {
    // Distance to the line, not a coordinate: two of the three guides are at
    // 210 and 330 degrees, where no single coordinate is the constrained one.
    for (let t = 0; t < frames; t++) {
      PISTONS.forEach((piston, i) => {
        const axis = RADIAL_AXES[i];
        const off = -Math.sin(axis) * at(t, piston).x + Math.cos(axis) * at(t, piston).y;
        expect(Math.abs(off)).toBeLessThan(3e-3);
      });
    }
  });

  it('gives every piston a stroke of exactly twice the crank throw', () => {
    // The closed form, and it does not depend on the rod length: a guide
    // through the crank pivot puts the piston at s = r cos(theta - axis) +
    // sqrt(rod^2 - r^2 sin^2(...)), whose extremes are rod + r and rod - r.
    PISTONS.forEach((piston, i) => {
      const axis = RADIAL_AXES[i];
      const along = Array.from(
        { length: frames },
        (_, t) => Math.cos(axis) * at(t, piston).x + Math.sin(axis) * at(t, piston).y
      );
      const stroke = Math.max(...along) - Math.min(...along);
      expect(Math.abs(stroke - 2 * RADIAL_CRANK)).toBeLessThan(5e-3);
    });
  });

  it('fires its cylinders evenly around the turn', () => {
    // What makes it radial rather than five engines: each piston reaches top
    // dead centre when the crank points down its own axis, so the peaks are
    // one cylinder's share of the cycle apart.
    const peak = (piston: string, axis: number) => {
      const along = Array.from(
        { length: frames },
        (_, t) => Math.cos(axis) * at(t, piston).x + Math.sin(axis) * at(t, piston).y
      );
      return along.indexOf(Math.max(...along)) / frames;
    };
    const peaks = PISTONS.map((piston, i) => peak(piston, RADIAL_AXES[i])).sort((a, b) => a - b);
    expect(peaks).toHaveLength(RADIAL_CYLINDERS);
    for (let i = 1; i < peaks.length; i++) {
      expect(Math.abs(peaks[i] - peaks[i - 1] - 1 / RADIAL_CYLINDERS)).toBeLessThan(0.02);
    }
  });
});
