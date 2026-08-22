import { Coord } from 'src/app/model/coord';
import { driverDyadFor, DriverDyad } from './driver-dyad';

/**
 * The claim under test is not "a dyad came back" but "the dyad that came back
 * drives the thing" — so every case here checks the delivered motion rather
 * than the numbers the construction happened to produce.
 *
 * The driven pin rides a circle about the four-bar's ground pin, so its
 * distance from the driver's ground is what the driver has to be able to
 * match. A dyad reaches a pin position exactly when that distance lies between
 * `coupler − crank` and `coupler + crank`, and it turns around where the
 * distance stops climbing. Both are read straight off the geometry below.
 */

const pivot = new Coord(0, 0);
const RADIUS = 4;

function pinAt(degrees: number): Coord {
  const radians = (degrees * Math.PI) / 180;
  return new Coord(RADIUS * Math.cos(radians), RADIUS * Math.sin(radians));
}

function unwrap(result: ReturnType<typeof driverDyadFor>): DriverDyad {
  if ('refusal' in result) throw new Error(`expected a dyad, got refusal: ${result.refusal}`);
  return result.dyad;
}

/** How far the driven pin sits from the driver's ground, at that crank angle. */
function reachTo(dyad: DriverDyad, degrees: number): number {
  const pin = pinAt(degrees);
  return Math.hypot(pin.x - dyad.ground.x, pin.y - dyad.ground.y);
}

describe('sizing the driver dyad for a synthesised four-bar', () => {
  it('reaches every pose, and carries past the outer ones', () => {
    const poses = [10, 55, 80];
    const dyad = unwrap(driverDyadFor(pivot, poses.map(pinAt)));

    const shortest = dyad.couplerLength - dyad.crankLength;
    const longest = dyad.couplerLength + dyad.crankLength;
    for (const pose of poses) {
      const reach = reachTo(dyad, pose);
      // Strictly inside, not merely within: a pose sitting on a turning point
      // is reached at dead centre, where the six-bar has no velocity.
      expect(reach).toBeGreaterThan(shortest);
      expect(reach).toBeLessThan(longest);
    }
  });

  it('turns around outside the poses rather than between them', () => {
    // The failure this rules out: a driver whose stroke ends partway along the
    // swing, so the four-bar reverses before reaching the last pose. It shows
    // up as the reach climbing and then falling again inside the arc.
    const dyad = unwrap(driverDyadFor(pivot, [10, 55, 80].map(pinAt)));

    let previous = reachTo(dyad, 10);
    for (let degrees = 10.5; degrees <= 80; degrees += 0.5) {
      const reach = reachTo(dyad, degrees);
      expect(reach).toBeLessThan(previous);
      previous = reach;
    }
  });

  it('assembles in the pose the linkage is drawn in', () => {
    const dyad = unwrap(driverDyadFor(pivot, [10, 55, 80].map(pinAt)));
    const first = pinAt(10);

    expect(Math.hypot(dyad.elbow.x - dyad.ground.x, dyad.elbow.y - dyad.ground.y)).toBeCloseTo(
      dyad.crankLength,
      6
    );
    expect(Math.hypot(dyad.elbow.x - first.x, dyad.elbow.y - first.y)).toBeCloseTo(
      dyad.couplerLength,
      6
    );
  });

  it('gives the crank a full turn to make, not a swing of its own', () => {
    // A dyad only works as a driver if its own crank goes all the way round,
    // which needs the crank shorter than the coupler by more than nothing.
    const dyad = unwrap(driverDyadFor(pivot, [10, 55, 80].map(pinAt)));

    expect(dyad.crankLength).toBeGreaterThan(0);
    expect(dyad.couplerLength).toBeGreaterThan(dyad.crankLength);
    const groundGap = Math.hypot(dyad.ground.x - pivot.x, dyad.ground.y - pivot.y);
    expect(groundGap).toBeGreaterThan(dyad.crankLength);
  });

  it('handles poses given in any order, and across the wrap at zero', () => {
    // The arc is found from the widest empty gap, so neither the order the
    // poses arrive in nor where they straddle 0° should matter.
    const jumbled = unwrap(driverDyadFor(pivot, [80, 10, 55].map(pinAt)));
    const straight = unwrap(driverDyadFor(pivot, [10, 55, 80].map(pinAt)));
    expect(jumbled.ground.x).toBeCloseTo(straight.ground.x, 9);
    expect(jumbled.ground.y).toBeCloseTo(straight.ground.y, 9);

    const wrapped = unwrap(driverDyadFor(pivot, [350, 20, 5].map(pinAt)));
    const shortest = wrapped.couplerLength - wrapped.crankLength;
    const longest = wrapped.couplerLength + wrapped.crankLength;
    for (const pose of [350, 5, 20]) {
      expect(reachTo(wrapped, pose)).toBeGreaterThan(shortest);
      expect(reachTo(wrapped, pose)).toBeLessThan(longest);
    }
  });

  it('says why when the swing is too wide for any one crank', () => {
    // Past half a turn the two turning points cannot both be kept off the arc,
    // whatever the placement — so this is a refusal, not a worse answer.
    const tooWide = driverDyadFor(pivot, [0, 100, 200].map(pinAt));
    expect('refusal' in tooWide).toBe(true);
    if ('refusal' in tooWide) {
      expect(tooWide.refusal).toContain('°');
      expect(tooWide.refusal).toContain('swapping which pin drives');
    }
  });

  it('says why when there is no crank to drive', () => {
    const collapsed = driverDyadFor(pivot, [new Coord(0, 0), new Coord(0, 0)]);
    expect('refusal' in collapsed).toBe(true);
  });

  it('builds the swings between the overtravel clamp and the ceiling', () => {
    // The ceiling is 170°, and overtravel adds 8% of the span to it. Clamping
    // that addition to what is left under the ceiling used to produce exactly
    // the ceiling, which the check then refused -- so everything above
    // 170/1.08 = 157.4° was turned away, including this 160° swing that the
    // construction handles perfectly well.
    const wide = unwrap(driverDyadFor(pivot, [0, 80, 160].map(pinAt)));

    const shortest = wide.couplerLength - wide.crankLength;
    const longest = wide.couplerLength + wide.crankLength;
    for (const pose of [0, 80, 160]) {
      expect(reachTo(wide, pose)).toBeGreaterThanOrEqual(shortest);
      expect(reachTo(wide, pose)).toBeLessThanOrEqual(longest);
    }
    // And it still runs the whole way one way, which is the thing a driver is
    // for: the ground is placed past the far end of the arc, so the reach
    // falls from the first pose to the last without turning back.
    let previous = reachTo(wide, 0);
    for (let angle = 1; angle <= 160; angle += 1) {
      const next = reachTo(wide, angle);
      expect(next).toBeLessThan(previous);
      previous = next;
    }
  });

  it('refuses poses that stand still for standing still, not for turning', () => {
    // Every pose at one angle leaves the whole circle empty. Measured modulo a
    // turn that read as no gap at all, so the arc came back as a full turn and
    // the reader was told the input had to swing 360°.
    const still = driverDyadFor(pivot, [20, 20, 20].map(pinAt));
    expect('refusal' in still).toBe(true);
    if ('refusal' in still) {
      expect(still.refusal).toContain('no motion');
      expect(still.refusal).not.toContain('360');
    }
  });
});
