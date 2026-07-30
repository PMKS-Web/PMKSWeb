// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here.
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { Link } from '../../app/model/link';
import {
  buildMechanismFixture,
  OVER_CLOSED_COUPLER_MECHANISM,
} from '../fixtures/mechanism-fixtures';

/** Unordered joint-id pairs that share a link, i.e. are pinned a fixed distance apart. */
function pinnedPairs(links: Link[]): [string, string][] {
  const pairs = new Map<string, [string, string]>();
  links.forEach((link) => {
    link.joints.forEach((a, index) => {
      link.joints.slice(index + 1).forEach((b) => {
        const key = [a.id, b.id].sort().join('');
        pairs.set(key, [a.id, b.id]);
      });
    });
  });
  return [...pairs.values()];
}

function distance(joints: Joint[], a: string, b: string): number {
  const first = joints.find((joint) => joint.id === a)!;
  const second = joints.find((joint) => joint.id === b)!;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

describe('four-bar with an over-closed coupler', () => {
  // Both CDF and CDK span joints C and D. Two bodies sharing two pins are one
  // rigid body, so this is an ordinary four-bar (ground-DH-coupler-CJ) that
  // Gruebler's raw count reports as an immobile structure.
  it('is mobile despite the redundant second pin between CDF and CDK', () => {
    const { mechanism } = buildMechanismFixture(OVER_CLOSED_COUPLER_MECHANISM);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.joints.length).toBeGreaterThan(1);
  });

  it('reduces to the single four-bar loop through the merged coupler', () => {
    const { mechanism } = buildMechanismFixture(OVER_CLOSED_COUPLER_MECHANISM);
    expect(mechanism.requiredLoops).toEqual(['HDCJH']);
  });

  it('holds every link rigid and both grounds fixed for the whole motion', () => {
    const { mechanism } = buildMechanismFixture(OVER_CLOSED_COUPLER_MECHANISM);
    const pairs = pinnedPairs(mechanism.links[0]);
    // The redundant pin only stays redundant if the merged bodies actually move
    // together; C-D, C-K and D-K drifting apart would mean the solver quietly
    // tore the coupler in half.
    expect(pairs.map(([a, b]) => [a, b].sort().join(''))).toEqual(
      expect.arrayContaining(['CD', 'CK', 'DK', 'CF', 'DF'])
    );

    for (const [a, b] of pairs) {
      const initial = distance(mechanism.joints[0], a, b);
      for (let t = 1; t < mechanism.joints.length; t++) {
        expect(distance(mechanism.joints[t], a, b), `${a}${b} at t=${t}`).toBeCloseTo(initial, 2);
      }
    }

    for (const groundId of ['H', 'J']) {
      const start = mechanism.joints[0].find((joint) => joint.id === groundId)!;
      for (let t = 1; t < mechanism.joints.length; t++) {
        const current = mechanism.joints[t].find((joint) => joint.id === groundId)!;
        expect(current.x, `${groundId}.x at t=${t}`).toBeCloseTo(start.x, 6);
        expect(current.y, `${groundId}.y at t=${t}`).toBeCloseTo(start.y, 6);
      }
    }
  });
});
