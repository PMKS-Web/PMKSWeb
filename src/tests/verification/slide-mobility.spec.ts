import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { teachingLabSliderCrankFixture } from '../../test-utils/verification/fixtures';
import {
  invertedSliderCrankFixture,
  scotchYokeFixture,
} from '../../test-utils/verification/slot-fixtures';

// A weld at a slider's pin removes a freedom no joint count can see: the rider
// and its block share exactly one joint, so the shared-joint rule that
// groupRigidBodies applies cannot reach it (docs/phase-3-slide-spec.md §3.3).

describe('mobility of a welded slide assembly', () => {
  it('brings the Scotch yoke to one degree of freedom', () => {
    expect(buildMechanism(scotchYokeFixture()).mechanism.dof).toBe(1);
  });

  it('still reports two without the weld', () => {
    // Unwelded the yoke can turn about its guide as well as slide along it, so
    // the crank pin riding its slot leaves two freedoms rather than one. This
    // is the measurement the weld exists to change.
    expect(buildMechanism({ ...scotchYokeFixture(), welds: [] }).mechanism.dof).toBe(2);
  });

  it('counts a welded slider-crank as rigid rather than refusing to count it', () => {
    // Welding a slider-crank's coupler to its block really is rigid: the crank
    // pin would have to sit both on a circle and at a fixed offset from a fixed
    // line. DOF 0 is the right answer, and it is reported rather than crashed.
    const welded = { ...teachingLabSliderCrankFixture(), welds: ['C'] };

    expect(buildMechanism(welded).mechanism.dof).toBe(0);
  });

  it('leaves an unwelded slot alone', () => {
    // Phase 2's inverted slider-crank has a block whose pin is free to turn in
    // it. Nothing here may reach that.
    expect(buildMechanism(invertedSliderCrankFixture()).mechanism.dof).toBe(1);
  });

  it('ignores a weld that carries no slider', () => {
    // D is an ordinary joint of the yoke. An ordinary weld already collapses
    // its links into one compound, so the assembly merge must find nothing to
    // do -- if it fired on plain welds it would hide real freedoms right across
    // the existing suite.
    const alsoWeldedAtD = { ...scotchYokeFixture(), welds: ['C', 'D'] };

    expect(buildMechanism(alsoWeldedAtD).mechanism.dof).toBe(1);
  });
});
