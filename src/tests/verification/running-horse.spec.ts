// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { runningHorseFixture } from '../../test-utils/verification/slot-fixtures';

// The scale case. 45 joints and 27 moving links off one grounded crank, five
// times anything else in the suite, and it earns its place by being ordinary:
// no sliders, no cylinders, no welds. What it exercises is the ordering walk,
// the per-timestep cloning and the closed-form primitives at a width nothing
// else reaches, where an error that is invisible on a four-bar has 27 links to
// accumulate across.

// It is not in FIXTURE_GALLERY, alone among the mechanisms here, and that is
// the finding rather than an oversight: 45 joints do not survive the URL codec,
// so there is no link to publish. The app cannot name a linkage this size
// either -- `determineNextLetter` is `String.fromCharCode(last + 1)`, which
// walks into punctuation after Z. The solver holds it; nothing around the
// solver does.

describe('the Running Horse Automata, at 45 joints', () => {
  const { mechanism, links } = buildMechanism(runningHorseFixture());
  const frames = mechanism.joints.length;
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;

  it('is one degree of freedom and turns a full revolution', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('holds every one of the 27 links rigid, every frame', () => {
    // The assertion the size is for. Each link's own joint pairs, across the
    // whole cycle -- roughly forty thousand distances.
    let checked = 0;
    for (const link of links) {
      const ids = link.joints.map((j) => j.id);
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const was = Math.hypot(
            at(0, ids[a]).x - at(0, ids[b]).x,
            at(0, ids[a]).y - at(0, ids[b]).y
          );
          for (let t = 1; t < frames; t++) {
            const now = Math.hypot(
              at(t, ids[a]).x - at(t, ids[b]).x,
              at(t, ids[a]).y - at(t, ids[b]).y
            );
            expect(Math.abs(now - was)).toBeLessThan(5e-3);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });

  it('leaves every grounded joint exactly where it was', () => {
    const grounded = mechanism.joints[0]
      .filter((j): j is RealJoint => j instanceof RealJoint && j.ground)
      .map((j) => j.id);
    expect(grounded.length).toBeGreaterThan(3);
    for (let t = 0; t < frames; t++) {
      // Bounded by the rounding, not by decimal places: solved positions are
      // kept to four decimals and a ground joint is re-cloned from them.
      for (const id of grounded) {
        expect(Math.hypot(at(t, id).x - at(0, id).x, at(t, id).y - at(0, id).y)).toBeLessThan(1e-3);
      }
    }
  });

  it('comes home after one turn, with no accumulated drift', () => {
    // 27 links solved 360 times over: if the walk leaked error anywhere, the
    // last frame would not land on the first.
    for (const joint of mechanism.joints[0]) {
      const drift = Math.hypot(
        at(frames - 1, joint.id).x - at(0, joint.id).x,
        at(frames - 1, joint.id).y - at(0, joint.id).y
      );
      expect(drift).toBeLessThan(0.05);
    }
  });

  it('actually gallops', () => {
    // Something has to move, and by a lot: a mechanism that solved but stood
    // still would satisfy every assertion above.
    const travel = mechanism.joints[0].map((joint) =>
      Math.max(
        ...Array.from({ length: frames }, (_, t) =>
          Math.hypot(at(t, joint.id).x - at(0, joint.id).x, at(t, joint.id).y - at(0, joint.id).y)
        )
      )
    );
    expect(Math.max(...travel)).toBeGreaterThan(1);
  });
});
