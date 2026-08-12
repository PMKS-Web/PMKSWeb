// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import {
  boundaryJoints,
  Constraint,
  SimultaneousSystem,
} from '../../app/model/mechanism/simultaneous-solver';

// `boundaryJoints` is what tells the branch controller which joints a system
// *reads* without solving for them. For a boundary-driven set those are the
// moving anchors an earlier step already placed, and the controller interpolates
// them to predict which assembly mode the solve is heading for. A reference the
// list does not mention is a piece of the boundary that never moves in the
// prediction — so the prediction is of a different mechanism.
//
// The list is written per constraint kind, and `rigidOffset` was missing from
// it. Nothing in the shipped library caught that, because in all three
// mechanisms that use one its anchors are named by some *other* constraint as
// well. It needs a body reached at its third joint, with both of its first two
// already placed: no distance row is written between two known anchors, so the
// offset's rows are the only ones that mention them.

describe('the joints a simultaneous system reads but does not solve', () => {
  const system = (constraints: Constraint[], unknownIds: string[]): SimultaneousSystem => ({
    unknownIds,
    constraints,
  });

  it('reports a rigid offset’s anchors, when nothing else names them', () => {
    const offsetOnly = system(
      [
        {
          kind: 'rigidOffset',
          point: 'C',
          from: 'A',
          to: 'B',
          along: 2,
          across: 1,
        },
      ],
      ['C']
    );

    expect(boundaryJoints(offsetOnly).sort()).toEqual(['A', 'B']);
  });

  it('leaves the solved point out of it, which is the whole distinction', () => {
    const bothUnknown = system(
      [{ kind: 'rigidOffset', point: 'C', from: 'A', to: 'B', along: 2, across: 1 }],
      ['A', 'B', 'C']
    );

    expect(boundaryJoints(bothUnknown)).toEqual([]);
  });

  it('still reports the kinds it already knew about', () => {
    const mixed = system(
      [
        { kind: 'distance', a: 'P', b: 'Q', length: 3 },
        { kind: 'onLine', point: 'P', from: 'R', to: 'S' },
        { kind: 'drivenAngle', pivot: 'P', reference: 'T', driven: 'U' },
      ],
      ['P']
    );

    expect(boundaryJoints(mixed).sort()).toEqual(['Q', 'R', 'S', 'T', 'U']);
  });
});
