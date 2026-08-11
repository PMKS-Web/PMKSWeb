// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { readFileSync } from 'node:fs';
import { buildMechanism, buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { motionGenGripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// A second engine, checking the joint types this release adds -- and finding
// the edge of what this one will accept.
//
// This is the MotionGen library's "Gripper" rebuilt joint for joint: a cylinder
// pushes a plate, the plate reaches two jaws through four short links, and each
// jaw rides two fixed vertical rails. MotionGen animates it. PMKS+ refuses it,
// and is not wrong to: the mechanism is over-constrained, and moves only
// because its geometry makes the surplus constraint a dependent one.
//
// Count it by hand. Each jaw has two points on two parallel vertical rails, so
// each jaw can only translate vertically: one freedom apiece. The plate is
// pinned to a block on a horizontal rail, so it has two -- along the rail, and
// turning about that pin. That is four freedoms. The four links from the plate
// to the jaws each fix a length, which is four constraints. Four minus four is
// zero, and PMKS+ reports zero.
//
// It nevertheless moves, because the plate does not in fact turn, so the four
// constraints are not independent. Recognising that needs a rank test on the
// constraint Jacobian rather than a count of joints and bodies, which is a
// different mobility criterion from the one this engine implements (plan
// docs/joint-types-plan.md, the DOF rules in mechanism.ts).
//
// So what is asserted here is the refusal, plus the evidence that the refusal
// is a limitation and not a correct rejection: the captured reference shows the
// jaws closing from 2.371 apart to 0.010 apart, which is a mechanism moving.
// When PMKS+ gains a rank-based mobility test, this spec is the case to turn
// back on -- the comparison it would need is already sitting in the CSV.
//
// Capture, provenance and the reasons it is not a v1 reference case are in the
// PMKS_Verification repository, reference-data/motiongen-library/README.md.

interface Pose {
  [joint: string]: { x: number; y: number };
}

/** MotionGen's solved paths: one row per sampled frame of the stroke. */
function motionGenPoses(): Pose[] {
  const lines = readFileSync('src/test-data/motiongen/gripper-curves.csv', 'utf8')
    .trim()
    .split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map(Number);
    const pose: Pose = {};
    header.forEach((name, i) => {
      const [joint, axis] = name.split('_');
      if (!axis) return;
      pose[joint] ??= { x: 0, y: 0 };
      (pose[joint] as never as Record<string, number>)[axis] = cells[i];
    });
    return pose;
  });
}

// MotionGen's ids are J1.. in capture order; PMKS+ assigns letters. Same joints.
const AS_PMKS: Record<string, string> = {
  J1: 'A',
  J2: 'B',
  J3: 'C',
  J4: 'D',
  J5: 'E',
  J6: 'F',
  J7: 'G',
  J8: 'H',
  J9: 'I',
  J10: 'J',
  J11: 'K',
};

describe('the MotionGen gripper, rebuilt in PMKS+', () => {
  // objectScale is a process-wide static and a driven slider's step is measured
  // against it, so pin it: otherwise the travel depends on spec file order.
  const { mechanism, joints: built } = buildMechanismAtScale(
    motionGenGripperFixture(MODEL_SCALE),
    1 * MODEL_SCALE
  );
  const frames = mechanism.joints.length;

  const reference = motionGenPoses();

  it('is reported as over-constrained rather than animated wrongly', () => {
    // Zero, not one. The failure mode worth preventing is not the refusal --
    // it is a mechanism that comes back "valid" and then draws a linkage
    // tearing itself apart, which is what a solver does when it is handed a
    // constraint set it cannot satisfy and does not check.
    expect((mechanism as unknown as { dof: number }).dof).toBe(0);
    expect(frames).toBeLessThan(3);
  });

  it('has a reference that shows the refusal costs something real', () => {
    // If MotionGen's own solution were static, the refusal would be correct and
    // there would be nothing to fix. It is not: the jaws close through the
    // stroke, monotonically, by more than two units.
    const gap = (pose: Pose) =>
      Math.hypot(pose['J10'].x - pose['J11'].x, pose['J10'].y - pose['J11'].y);
    const gaps = reference.map(gap);
    expect(gaps[0]).toBeGreaterThan(2.3);
    expect(gaps[gaps.length - 1]).toBeLessThan(0.05);
    // Not monotonic, and worth not asserting that it is: the jaws ease open by
    // fifteen thousandths over the first few frames before closing. That is
    // the toggle geometry of the linkage, not noise in the capture.
    expect(Math.max(...gaps)).toBeLessThan(gaps[0] + 0.02);
  });

  it('keeps the reference honest about what it is', () => {
    // The rails really are rails -- each pair of riders holds one x between
    // them across every pose -- and the plate really does only translate. Both
    // are the premises the hand count above rests on, so neither should be
    // taken on trust from a capture.
    for (const [top, bottom] of [
      ['J6', 'J8'],
      ['J7', 'J9'],
    ] as const) {
      for (const pose of reference) {
        expect(Math.abs(pose[top].x - pose[bottom].x)).toBeLessThan(2e-4);
      }
    }
    const angle = (pose: Pose) =>
      Math.atan2(pose['J2'].y - pose['J1'].y, pose['J2'].x - pose['J1'].x);
    const turned = reference.map(angle);
    expect(Math.max(...turned) - Math.min(...turned)).toBeLessThan(1e-3);
  });

  it('places every joint where MotionGen does at the pose it was captured in', () => {
    // The rebuild is checked against the source even though it will not run:
    // a fixture that does not match the model it claims to be would make the
    // mobility finding above about the wrong mechanism. Frame 60 of the
    // reference is the pose the model is stored in.
    // The editable joints, not mechanism.joints[0]: a mechanism this engine
    // refuses precomputes no frames at all.
    const drawn = reference.find((pose) => Math.abs(pose['J1'].x - -1.924786) < 1e-6)!;
    expect(drawn).toBeDefined();
    for (const [theirs, mine] of Object.entries(AS_PMKS)) {
      const joint = built.find((j: Joint) => j.id === mine)!;
      expect(
        Math.hypot(joint.x / MODEL_SCALE - drawn[theirs].x, joint.y / MODEL_SCALE - drawn[theirs].y)
      ).toBeLessThan(1e-4);
    }
    expect(built.length).toBeGreaterThan(10);
  });
});
