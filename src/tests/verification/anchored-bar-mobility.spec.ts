// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { anchoredBarFixture, gripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// A bar pinned to ground at both ends cannot move, so it is part of the ground
// rather than a body in its own right. Gruebler has no way to know that: it
// counts a body with two lower pairs, 3(1) - 2(2) = -1, and quietly subtracts a
// degree of freedom for every guide rail somebody draws.
//
// This is the same class of exception `determineRigidBodies` already handles for
// links sharing two joints, and it arrives the same way — by drawing something
// perfectly ordinary. A rail is how you say "this block runs in a fixed track".

describe('a bar pinned to ground at both ends', () => {
  it('costs a four-bar nothing', () => {
    // The rail here touches nothing else at all, so no count that understood
    // what it was could possibly change: whatever the four-bar was, it stays.
    expect(buildMechanism(anchoredBarFixture(false)).mechanism.dof).toBe(1);
    expect(buildMechanism(anchoredBarFixture(true)).mechanism.dof).toBe(1);
  });

  it('leaves a gripper built on two rails at one degree of freedom', () => {
    // Shared as a URL by a user, reported -1, and refused to simulate. Two
    // rails, so two degrees of freedom subtracted from a mechanism that has
    // exactly one.
    // objectScale is a process-wide static and a cylinder's stroke is measured
    // against it, so pin it: otherwise the travel depends on file order.
    SettingsService._objectScale.next(1 * MODEL_SCALE);
    expect(buildMechanism(gripperFixture(MODEL_SCALE)).mechanism.dof).toBe(1);
  });
});
