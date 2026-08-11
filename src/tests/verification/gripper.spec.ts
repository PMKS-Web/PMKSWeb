// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism, buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { gripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// §2.7a: the first mechanism in this suite that no chain of dyads can solve.
//
// A cylinder pushes the plate DGHIJ; the plate reaches two arms MQS and TVX
// through four short links; each arm has two points riding two vertical rails.
// There is no joint anywhere in it that two already-known joints locate, so the
// ordering walk places nothing at all and every joint comes back unsolvable.
// The constraints have to be satisfied together or not at all.
//
// What can be checked without a second implementation to check against: that
// every constraint the model states is actually met at every sample, that the
// members keep their lengths, that the blocks stay on their rails, and that the
// thing moves in the way a gripper moves. A solved pose that satisfies all of
// those is the mechanism, whatever route the solver took to it.

const S = MODEL_SCALE;

interface Frame {
  at: (id: string) => Joint;
  span: number;
}

function frames(): Frame[] {
  // objectScale is a process-wide static, and the cylinder's stroke is measured
  // against it — the slot is drawn in mark units. Left to whatever the last
  // spec in the run happened to set, this mechanism's travel changes with the
  // file order, which is exactly how it passed here and failed in CI.
  const { mechanism } = buildMechanismAtScale(gripperFixture(S), 1 * MODEL_SCALE);
  return mechanism.joints.map((joint) => {
    const at = (id: string) => joint.find((candidate) => candidate.id === id)!;
    return { at, span: Math.hypot(at('D').x - at('A').x, at('D').y - at('A').y) / S };
  });
}

const distance = (a: Joint, b: Joint) => Math.hypot(a.x - b.x, a.y - b.y) / S;

/** How far a point sits off the line through two others, in user units. */
function offLine(point: Joint, from: Joint, to: Joint): number {
  const ex = to.x - from.x;
  const ey = to.y - from.y;
  return Math.abs((point.x - from.x) * ey - (point.y - from.y) * ex) / Math.hypot(ex, ey) / S;
}

describe('a cylinder-driven gripper', () => {
  const solved = frames();
  const first = solved[0];

  it('simulates at all', () => {
    // It reported "Degrees of Freedom: -1" and refused, and even once counted
    // correctly the walk emitted zero steps.
    //
    // The linkage is drawn at a limit of its own motion — a toggle clamp is
    // drawn clamped — so the cylinder can only extend from here, and the run is
    // that one-way travel out to the ram's stop and back.
    expect(solved.length).toBeGreaterThan(20);
  });

  it('keeps every member the length it was drawn', () => {
    const bars: [string, string][] = [
      ['A', 'B'],
      ['C', 'D'],
      ['G', 'M'],
      ['H', 'Q'],
      ['I', 'T'],
      ['J', 'V'],
    ];
    const plate: [string, string][] = [
      ['D', 'G'],
      ['D', 'H'],
      ['D', 'I'],
      ['D', 'J'],
      ['G', 'H'],
      ['I', 'J'],
    ];
    const arms: [string, string][] = [
      ['M', 'Q'],
      ['M', 'S'],
      ['Q', 'S'],
      ['T', 'V'],
      ['T', 'X'],
      ['V', 'X'],
    ];
    // Bound rather than decimal places: solved positions are rounded to four
    // decimals in model units, and a length is a difference of two of them, so
    // a few of those quanta is as exact as a member can be.
    const rounding = 1e-4 / MODEL_SCALE;
    for (const frame of solved) {
      for (const [a, b] of [...bars, ...plate, ...arms]) {
        expect(
          Math.abs(distance(frame.at(a), frame.at(b)) - distance(first.at(a), first.at(b)))
        ).toBeLessThan(20 * rounding);
      }
    }
  });

  it('keeps all four blocks on their rails', () => {
    for (const frame of solved) {
      for (const id of ['M', 'T']) {
        expect(offLine(frame.at(id), frame.at('K'), frame.at('L'))).toBeLessThan(1e-6);
      }
      for (const id of ['Q', 'V']) {
        expect(offLine(frame.at(id), frame.at('O'), frame.at('P'))).toBeLessThan(1e-6);
      }
    }
  });

  it('keeps the cylinder straight, with the block on its own slot', () => {
    for (const frame of solved) {
      // The rod, the barrel and the block all on one line is what makes the
      // part a cylinder rather than three bars that happen to touch.
      expect(offLine(frame.at('D'), frame.at('A'), frame.at('B'))).toBeLessThan(1e-6);
      expect(offLine(frame.at('E'), frame.at('A'), frame.at('B'))).toBeLessThan(1e-6);
      expect(distance(frame.at('C'), frame.at('E'))).toBeLessThan(1e-6);
    }
  });

  it('advances the cylinder at the commanded rate', () => {
    const steps = solved.slice(1).map((frame, i) => Math.abs(frame.span - solved[i].span));
    for (const step of steps) {
      expect(Math.abs(step - steps[0])).toBeLessThan(1e-4);
    }
  });

  it('opens and closes its jaws as the cylinder drives', () => {
    // What the machine is for. S and X are the jaw tips; the gap between them
    // has to actually change, and change smoothly rather than jumping when the
    // solver picks a different root.
    const gaps = solved.map((frame) => distance(frame.at('S'), frame.at('X')));
    const travel = Math.max(...gaps) - Math.min(...gaps);
    expect(travel).toBeGreaterThan(0.2);

    const jumps = gaps.slice(1).map((gap, i) => Math.abs(gap - gaps[i]));
    // Smoothness measured against the neighbouring steps rather than against
    // the average of them all. The linkage has a genuine knee — it is drawn on
    // its own toggle, and just off it the jaws move some seven times faster
    // than they do out at full extension — so the mean step over the run is not
    // the scale any single step should be judged by, and the ram now travels
    // far enough to reach that knee. What a Newton solve falling to the mirror
    // assembly looks like is a step with no relation to the ones either side of
    // it, so that is the comparison: the steepest part of the knee grows by
    // under 1.8x from one sample to the next, and a branch jump is orders of
    // magnitude, not a factor of three.
    for (let i = 1; i < jumps.length; i++) {
      expect(jumps[i]).toBeLessThan(Math.max(jumps[i - 1] * 3, 1e-3));
    }
  });

  it('drives both arms from the one cylinder', () => {
    // The plate pushes the upper and lower arms through separate link pairs. If
    // only one arm moved, the constraints would still all be satisfied for the
    // other -- and the mechanism would be wrong in a way lengths cannot see.
    const upper = solved.map((frame) => frame.at('M').y / S);
    const lower = solved.map((frame) => frame.at('T').y / S);
    expect(Math.max(...upper) - Math.min(...upper)).toBeGreaterThan(0.1);
    expect(Math.max(...lower) - Math.min(...lower)).toBeGreaterThan(0.1);
  });
});
