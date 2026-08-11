// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism, buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { RATE_TOLERANCE, velocityAgreesWithPositions } from '../../test-utils/verification/rates';
import { SCISSOR, scissorLiftFixture } from '../../test-utils/verification/library-fixtures';
import { sealedCylinders } from '../../app/model/cylinder';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// A single-stage scissor lift: two equal arms pinned at their midpoints, one
// pinned to the base and the other's foot on a rail along it, a ram between the
// base and a point up the pinned arm, and a platform that rides the top of the
// pair the same way the base carries the bottom.
//
// It is the only mechanism in the suite that uses all three of the new parts at
// once, in three different jobs: the ram drives, the foot block supports, and
// the platform's block rides a slot cut into the platform -- a bar that is
// itself moving, so the platform's angle is not solved from its own pins but
// from where the arm underneath it has reached.
//
// What that arrangement is *for* is the closed form asserted below: a scissor
// keeps its platform level at every height, with nothing holding it level. The
// reason is the reflection -- the far arm is the near arm turned through the
// crossing pin -- so the two tops are always the same height and the platform
// between them is always horizontal.

const S = MODEL_SCALE;
const DEG = 180 / Math.PI;

interface Sample {
  /** Ram length, mount to mount, in user units. */
  ram: number;
  /** The driven arm's angle above the base rail. */
  arm: number;
  /** Platform height, taken at its own pin. */
  height: number;
  /** How far out along the rail the loose foot sits, and how far off it. */
  foot: number;
  footOffRail: number;
  /** Height difference between the platform's pin and the block riding its slot. */
  outOfLevel: number;
  /** The platform pin's horizontal drift; a scissor holds it over the base pin. */
  pinDrift: number;
  /** The four half-arms, which are what makes the reflection hold. */
  halves: number[];
  barrel: number;
  rod: number;
}

function sampleMotion(): { samples: Sample[]; cylinders: number; frames: number; dof: number } {
  // Pinned: a ram's stroke is measured against the process-wide objectScale.
  const { mechanism } = buildMechanismAtScale(scissorLiftFixture(S), 1 * MODEL_SCALE);
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [a, b, c, d, g, m, k, s, t] = ['A', 'B', 'C', 'D', 'G', 'M', 'K', 'S', 'T'].map(at);
    const length = (from: Joint, to: Joint) => Math.hypot(to.x - from.x, to.y - from.y) / S;
    return {
      ram: length(a, d),
      arm: Math.atan2(m.y - g.y, m.x - g.x) * DEG,
      height: t.y / S,
      foot: s.x / S,
      footOffRail: s.y / S,
      outOfLevel: (k.y - t.y) / S,
      pinDrift: (t.x - g.x) / S,
      halves: [length(g, m), length(m, k), length(s, m), length(m, t)],
      barrel: length(a, b),
      rod: length(c, d),
    };
  });
  return {
    samples,
    cylinders: sealedCylinders(mechanism.joints[0]).length,
    frames: mechanism.joints.length,
    dof: (mechanism as unknown as { dof: number }).dof,
  };
}

describe('a scissor lift raised by its ram', () => {
  const { samples, cylinders, frames, dof } = sampleMotion();
  const drawn = samples[0];

  it('is one degree of freedom, and the ram is drawn as a ram', () => {
    expect(dof).toBe(1);
    expect(cylinders).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('keeps all four half-arms equal, which is what a scissor is', () => {
    for (const sample of samples) {
      for (const half of sample.halves) {
        expect(half).toBeCloseTo(SCISSOR.half, 3);
      }
    }
  });

  it('keeps the cylinder a cylinder', () => {
    for (const sample of samples) {
      expect(sample.barrel).toBeCloseTo(drawn.barrel, 5);
      expect(sample.rod).toBeCloseTo(drawn.barrel, 5);
    }
  });

  it('keeps the loose foot on the base rail', () => {
    // The foot's whole freedom is along the rail, so its height is the
    // constraint: a rider that drifts off its guide would still draw plausibly.
    for (const sample of samples) {
      expect(Math.abs(sample.footOffRail)).toBeLessThan(3e-3);
      expect(sample.foot).toBeGreaterThan(0);
    }
  });

  it('holds the platform level at every height, with nothing holding it level', () => {
    // The reflection through the crossing pin puts both arm tops at the same
    // height, so the platform is horizontal without being told to be. The bound
    // is the solver's residual on the slot, not a property of the geometry.
    for (const sample of samples) {
      expect(Math.abs(sample.outOfLevel)).toBeLessThan(1e-2);
    }
  });

  it('keeps the platform pin over the base pin', () => {
    // The other half of the reflection, and the reason a scissor platform rises
    // straight up instead of swinging out over its own base.
    for (const sample of samples) {
      expect(Math.abs(sample.pinDrift)).toBeLessThan(1e-2);
    }
  });

  it('keeps the arms clear of both of their own stops', () => {
    // Pinned as an angle, not inferred from the height: a scissor flat on its
    // base and a scissor stood upright are both singular — the first because
    // the foot's circle meets the rail tangentially, the second because the
    // arms have nowhere further to go — and the ram's travel is what decides
    // how near either the mechanism comes. That travel is set by the model's
    // own rule for how much barrel a ram's head costs, so it moves when that
    // rule moves, and the margin has to be asserted rather than assumed.
    const arms = samples.map((sample) => sample.arm);
    expect(Math.min(...arms)).toBeGreaterThan(15);
    expect(Math.max(...arms)).toBeLessThan(70);
  });

  it('lifts, and draws the feet in as it does', () => {
    const heights = samples.map((sample) => sample.height);
    const feet = samples.map((sample) => sample.foot);
    expect(Math.min(...heights)).toBeGreaterThan(5);
    expect(Math.max(...heights)).toBeGreaterThan(13);
    // Rising and closing are the same motion: the span the arms stand on is
    // what the height is bought with.
    expect(Math.max(...feet) - Math.min(...feet)).toBeGreaterThan(6);
    samples.forEach((sample) => {
      expect(sample.height).toBeCloseTo(2 * SCISSOR.half * Math.sin(sample.arm / DEG), 2);
      expect(sample.foot).toBeCloseTo(2 * SCISSOR.half * Math.cos(sample.arm / DEG), 2);
    });
  });

  it('travels the whole of the ram stroke, out and back to where it started', () => {
    const reversals = samples
      .slice(1)
      .map((sample, i) => Math.sign(sample.ram - samples[i].ram))
      .filter((direction, i, all) => i > 0 && direction !== all[i - 1]).length;
    expect(reversals).toBe(2);
    expect(samples[samples.length - 1].ram).toBeCloseTo(drawn.ram, 6);
    // The commanded length closes exactly; the height it produces comes back a
    // thousandth short, because the platform's pose is the residual of a slot
    // solve rather than a length that was handed to it.
    expect(samples[samples.length - 1].height).toBeCloseTo(drawn.height, 2);
  });

  it('moves every joint at the rate its own motion implies', () => {
    // The check no assertion about positions can make. The crossing pin, the
    // foot block and the platform once graphed a flat zero while the lift
    // visibly rose. Positions and rates leave the solver by different routes,
    // so differencing one against the other is a real cross-check; the arms are
    // straight bars, so this is also what holds the collinear cases honest.
    // RATE_TOLERANCE carries why one percent.
    const agreement = velocityAgreesWithPositions(buildMechanism(scissorLiftFixture(S)));
    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(1000);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });
});
