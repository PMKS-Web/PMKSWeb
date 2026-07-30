import './joint';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { groupRigidBodies, redundantlyHeldJointSets, sharedJointCount } from './rigid-bodies';

const at = (id: string) => new RevJoint(id, 0, 0);

describe('rigid bodies', () => {
  it('leaves links that share one joint as separate bodies', () => {
    const [a, b, c] = ['A', 'B', 'C'].map(at);
    const bodies = groupRigidBodies([new RealLink('AB', [a, b]), new RealLink('BC', [b, c])]);

    expect(new Set(bodies.values()).size).toBe(2);
  });

  // Two bodies pinned at two points cannot move relative to each other, so the
  // second pin constrains nothing the first did not already.
  it('merges links that share two joints into one body', () => {
    const [a, b, c] = ['A', 'B', 'C'].map(at);
    const bodies = groupRigidBodies([new RealLink('ABC', [a, b, c]), new RealLink('AB', [a, b])]);

    expect(new Set(bodies.values()).size).toBe(1);
  });

  it('merges transitively, so a chain of overlaps is one body', () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(at);
    const bodies = groupRigidBodies([
      new RealLink('AB', [a, b]),
      new RealLink('ABC', [a, b, c]),
      new RealLink('ACD', [a, c, d]),
    ]);

    expect(new Set(bodies.values()).size).toBe(1);
  });

  // Keyed by joint ids rather than by body, so the same redundancy is still
  // recognisable after an edit that renames or fuses the bodies holding it.
  it('reports which joints are held twice, and nothing when none are', () => {
    const [a, b, c] = ['A', 'B', 'C'].map(at);
    const twice = new RealLink('AB', [a, b]);
    const ternary = new RealLink('ABC', [a, b, c]);

    expect([...redundantlyHeldJointSets([twice, ternary])]).toEqual(['A|B']);
    expect(redundantlyHeldJointSets([new RealLink('BC', [b, c]), twice]).size).toBe(0);
  });

  it('names the same joints whether or not the bodies holding them were renamed', () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(at);
    const before = redundantlyHeldJointSets([
      new RealLink('AB', [a, b]),
      new RealLink('ABC', [a, b, c]),
    ]);
    const after = redundantlyHeldJointSets([
      new RealLink('AB', [a, b]),
      new RealLink('ABCD', [a, b, c, d]),
    ]);

    expect([...after].every((held) => before.has(held))).toBe(true);
  });

  it('counts shared joints by id rather than by object identity', () => {
    const first = new RealLink('AB', [at('A'), at('B')]);
    const second = new RealLink('BC', [at('B'), at('C')]);

    expect(sharedJointCount(first, second)).toBe(1);
  });
});
