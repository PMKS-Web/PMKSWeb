import { MechanismFixture } from './fixture';

// The Phase 2 mechanisms, in one place so the specs that assert on them and the
// gallery that publishes them as URLs cannot drift apart. See
// docs/joint-types-plan.md §4.1 for what each case is meant to isolate.

export const CRANK = 1;
/** Ground offset between the crank pivot and the lever pivot. */
export const OFFSET = 3;
export const LEVER = 5;
export const INPUT_SPEED = 1;
/** Crank angle at t = 0, chosen so the lever starts clear of the crank. */
export const START_ANGLE = Math.PI / 2;

/** Whitworth proportions: crank longer than the ground offset, so the lever spins. */
export const WHITWORTH_CRANK = 3;
export const WHITWORTH_OFFSET = 1;

/**
 * Inverted slider-crank, also read as the oscillating cylinder: crank AB drives
 * a block riding in a slot along the grounded lever CD.
 *
 * D is placed on the ray from the lever pivot through the crank pin, which is
 * what makes the slot pass through the block at t = 0 — a linkage that does not
 * start assembled has no solution to check against.
 */
export function invertedSliderCrankFixture(
  offset: number = OFFSET,
  crank: number = CRANK
): MechanismFixture {
  const bx = crank * Math.cos(START_ANGLE);
  const by = crank * Math.sin(START_ANGLE);
  const span = Math.hypot(bx - offset, by);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: bx, y: by },
      { id: 'C', x: offset, y: 0, ground: true },
      { id: 'D', x: offset + (LEVER * (bx - offset)) / span, y: (LEVER * by) / span },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [{ at: 'B', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } }],
    inputAngVel: INPUT_SPEED,
  };
}

/** Where the lever tip sits at t = 0 for the default proportions. */
export const LEVER_TIP: [number, number] = (() => {
  const fixture = invertedSliderCrankFixture();
  const d = fixture.joints.find((joint) => joint.id === 'D')!;
  return [d.x, d.y];
})();

/** The same linkage carrying a load at the lever tip, for the force case. */
export function loadedInvertedSliderCrankFixture(): MechanismFixture {
  return {
    ...invertedSliderCrankFixture(),
    load: { onLink: 'CD', at: LEVER_TIP, vector: [0, -10] },
  };
}

// --- Forward direction -----------------------------------------------------

export const COUPLER = 3;
export const ROCKER = 3;
export const GROUND = 4;
/** Ground pivot of the lever whose pin rides in the coupler's slot. */
export const LEVER_PIVOT: [number, number] = [2, 0.5];
export const RIDER_LEVER = 2;

/** Coupler pin C at the starting crank angle: circle(B, coupler) ∩ circle(D, rocker). */
export const START_C: [number, number] = (() => {
  const midX = (CRANK + GROUND) / 2;
  const half = (GROUND - CRANK) / 2;
  return [midX, Math.sqrt(COUPLER * COUPLER - half * half)];
})();

/**
 * The rider starts on the coupler line at exactly `RIDER_LEVER` from its pivot,
 * because a slot must pass through the block and the lever must be its stated
 * length.
 *
 * The pivot and lever length are chosen so the lever's circle always reaches the
 * coupler line — the line's farthest approach to that pivot over a full
 * revolution is about 1.55, comfortably inside 2. A shorter lever loses the
 * intersection partway round and the mechanism reverses there.
 */
export const START_F: [number, number] = (() => {
  const dx = START_C[0] - CRANK;
  const dy = START_C[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const toPivot = [LEVER_PIVOT[0] - CRANK, LEVER_PIVOT[1]];
  const along = toPivot[0] * ux + toPivot[1] * uy;
  const across = toPivot[0] * -uy + toPivot[1] * ux;
  const half = Math.sqrt(RIDER_LEVER * RIDER_LEVER - across * across);
  return [CRANK + (along + half) * ux, (along + half) * uy];
})();

/** A four-bar whose coupler carries a slot, driving a grounded lever. */
export function slottedCouplerFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: CRANK, y: 0 },
      { id: 'C', x: START_C[0], y: START_C[1] },
      { id: 'D', x: GROUND, y: 0, ground: true },
      { id: 'E', x: LEVER_PIVOT[0], y: LEVER_PIVOT[1], ground: true },
      { id: 'F', x: START_F[0], y: START_F[1] },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }, { joints: 'EF' }],
    sliders: [{ at: 'F', prisId: 'P', on: { carrier: 'BC', a: 'B', b: 'C' } }],
    inputAngVel: INPUT_SPEED,
  };
}

// --- Mobility --------------------------------------------------------------

/**
 * Elliptical trammel: a bar whose two ends ride in perpendicular grounded
 * slides. Nothing is pinned to ground, so it is the case that proves a grounded
 * guide anchors the mechanism.
 *
 * No input joint: this exists to be counted, not solved. Two slots on one bar
 * is not a shape the position solver reduces.
 */
export function ellipticalTrammelFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 1, y: 0 },
      { id: 'B', x: 0, y: 1 },
    ],
    links: [{ joints: 'AB' }],
    sliders: [
      { at: 'A', prisId: 'C', angleRad: 0 },
      { at: 'B', prisId: 'D', angleRad: Math.PI / 2 },
    ],
    inputAngVel: INPUT_SPEED,
  };
}
