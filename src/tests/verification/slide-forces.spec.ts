import '../../app/model/joint';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { scotchYokeFixture } from '../../test-utils/verification/slot-fixtures';

// Phase 3 does not solve statics for a welded assembly, and says so rather than
// producing a number (docs/phase-3-slide-spec.md §3.8, §9).
//
// The physics of why: a prismatic pair transmits a normal force *and* a couple.
// While the block is a free-turning body with only two equations the couple
// never appears; welded to a rider that has a moment equation, the guide has to
// supply one, and there is no column for it.

describe('force analysis of a welded slide assembly', () => {
  it('refuses, and names the joint responsible', () => {
    const built = buildMechanism(scotchYokeFixture());

    const result = ForceSolver.analyzeFrame(built.joints, built.links, 'static', false, 'm');

    expect(result.status).toBe('unsupported-topology');
    expect(result.message).toContain('C');
    expect(result.message).toContain('moment');
  });

  it('refuses for a reason, not because the equation count happens to be off', () => {
    // The count guard catches this too -- eight equations against seven
    // unknowns -- but a count that happens to be wrong is not a reason, and it
    // would fall silent the moment anything else made the numbers balance.
    const built = buildMechanism(scotchYokeFixture());

    const result = ForceSolver.analyzeFrame(built.joints, built.links, 'static', false, 'm');

    expect(result.message).not.toContain('equations');
  });

  it('still analyses the same mechanism once the weld is taken away', () => {
    // The refusal has to be about the weld and nothing else. Without it this is
    // an ordinary DOF 2 linkage, and the force solver treats it as it always
    // did -- so whatever it answers here, it must not be the Slide refusal.
    const unwelded = buildMechanism({ ...scotchYokeFixture(), welds: [] });

    const result = ForceSolver.analyzeFrame(unwelded.joints, unwelded.links, 'static', false, 'm');

    expect(result.message ?? '').not.toContain('welds');
  });
});
