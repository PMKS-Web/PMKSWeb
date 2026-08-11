// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, PrisJoint } from '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  cylinderBoomFixture,
  scotchYokeFixture,
  YOKE_CRANK,
} from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';

// A slot cut into a link is a channel between two of that link's joints, and it
// ends where they do. Nothing said so, so a block could run out past the end of
// its own channel and the mechanism carried on — drawn outside the bar it is
// captive in, and reported as working.
//
// The refusal is the same answer a cylinder gives at the end of its stroke: the
// mechanism runs to the limit and reverses there.

/** How far along its slot a block sits, as a fraction of the slot's length. */
function travel(mechanism: { joints: Joint[][] }, sliderId: string): number[] {
  const at = (t: number, id: string) => mechanism.joints[t].find((joint) => joint.id === id);
  const slider = mechanism.joints[0].find((joint) => joint.id === sliderId) as PrisJoint;
  const fractions: number[] = [];
  for (let t = 0; t < mechanism.joints.length; t++) {
    const from = at(t, slider.slotJointA!.id)!;
    const to = at(t, slider.slotJointB!.id)!;
    const block = at(t, sliderId)!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    fractions.push(((block.x - from.x) * dx + (block.y - from.y) * dy) / lengthSquared);
  }
  return fractions;
}

describe('a block held inside the slot it rides', () => {
  it('runs the whole cycle when the slot is long enough for it', () => {
    const { mechanism } = buildMechanism(scotchYokeFixture());
    const along = travel(mechanism as unknown as { joints: Joint[][] }, 'E');

    // The yoke's own slot comfortably contains its travel, so nothing here
    // changes: a full revolution, and the block always in the channel.
    expect(mechanism.joints.length).toBeGreaterThan(300);
    expect(Math.min(...along)).toBeGreaterThan(0);
    expect(Math.max(...along)).toBeLessThan(1);
  });

  it('reverses where a slot runs out, instead of carrying on past the end', () => {
    // The same yoke with its slot cut down until the crank pin would leave it.
    // The line the block rides is identical — only the far end of the channel
    // moves — so anything that changes is the limit doing its work.
    const short: MechanismFixture = {
      ...scotchYokeFixture(),
      joints: scotchYokeFixture().joints.map((joint) =>
        joint.id === 'D' ? { ...joint, y: YOKE_CRANK * 0.35 } : joint
      ),
    };
    const { mechanism } = buildMechanism(short);
    const along = travel(mechanism as unknown as { joints: Joint[][] }, 'E');

    expect(Math.max(...along)).toBeLessThanOrEqual(1.01);
    // It still moves, and it still comes back: a limit, not a refusal to solve.
    expect(mechanism.joints.length).toBeGreaterThan(20);
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(0.1);
  });

  it('leaves a cylinder alone, which is bounded by its own stroke', () => {
    // A sealed cylinder's slot is the barrel's interior, and its block
    // legitimately travels past the buried joint the slot is measured from —
    // so the rule above must not apply to it. The boom is the case: its rider
    // reaches about 1.14 of the slot segment and always has.
    const { mechanism } = buildMechanism(cylinderBoomFixture(MODEL_SCALE));
    const along = travel(mechanism as unknown as { joints: Joint[][] }, 'S');

    expect(mechanism.joints.length).toBeGreaterThan(100);
    expect(Math.max(...along)).toBeGreaterThan(1.05);
  });
});
