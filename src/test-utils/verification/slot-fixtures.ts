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

// --- Slide (Phase 3) -------------------------------------------------------

export const YOKE_CRANK = 1;
/** How far below the crank pivot the yoke's horizontal guide runs. */
export const GUIDE_DROP = 2;
/** How far above the crank pivot the yoke's slot reaches. */
export const SLOT_RISE = 1;

/**
 * Scotch yoke: crank AB drives a block riding in the yoke's vertical slot, and
 * the yoke itself is welded to a block on a horizontal grounded guide.
 *
 * The weld at C is the whole mechanism. Without it the yoke could turn about its
 * guide and the linkage is DOF 2; with it the yoke may only translate, its slot
 * stays vertical, and the crank pin sliding in that slot drives `x = r cos θ`
 * exactly — the closed form Gate 3 asserts.
 *
 * `swapSlotJoints` declares the slot as (D, C) instead of (C, D). Both describe
 * the same line, and a solver that answers differently is reading the pair as
 * ordered when it is not — the bug class review caught in Phase 2.
 */
export function scotchYokeFixture(swapSlotJoints: boolean = false): MechanismFixture {
  const slot = swapSlotJoints ? { a: 'D', b: 'C' } : { a: 'C', b: 'D' };
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      // C and D share the crank pin's x, so the slot passes through B at t = 0.
      { id: 'C', x: YOKE_CRANK, y: -GUIDE_DROP },
      { id: 'D', x: YOKE_CRANK, y: SLOT_RISE },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [
      { at: 'B', prisId: 'E', on: { carrier: 'CD', ...slot } },
      { at: 'C', prisId: 'F', angleRad: 0 },
    ],
    welds: ['C'],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * The same yoke with the guide moved to the far end of the slot, so the loop
 * reaches the welded rider along an ordinary **link** edge rather than across
 * the slot.
 *
 * Kinematically identical to the plain yoke — `x = r cos θ` either way — which
 * is exactly what makes it a control. The loop shape is what differs: the plain
 * yoke's walk steps from the slot straight onto the block, so the rider link
 * never appears as an edge at all, and a solver that hands rotating unknowns out
 * along link edges is never asked about it. Here it is.
 */
export function scotchYokeGuidedAtFarEndFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      // C anchors the slot at the free end; D carries the weld and the guide.
      { id: 'C', x: YOKE_CRANK, y: SLOT_RISE },
      { id: 'D', x: YOKE_CRANK, y: -GUIDE_DROP },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [
      { at: 'B', prisId: 'E', on: { carrier: 'CD', a: 'C', b: 'D' } },
      { at: 'D', prisId: 'G', angleRad: 0 },
    ],
    welds: ['D'],
    inputAngVel: INPUT_SPEED,
  };
}

/**
 * Swinging-block engine: a Slide whose guide is cut into a *moving* link.
 *
 * Crank AB drives a rod BR whose far end is welded to a block sliding in the
 * cylinder CD, and CD pivots on ground at C. DOF 1, and a perfectly ordinary
 * mechanism — but Phase 3 does not solve it, because the rider's angle tracks a
 * carrier that is itself unknown and the ordering deadlocks (spec §4). It
 * exists here to prove the refusal is reported rather than drawn: swung as an
 * ordinary Slot it would produce a plausible picture of the wrong linkage.
 */
export function swingingBlockFixture(): MechanismFixture {
  const pivot: [number, number] = [0, -3];
  const toPin = [YOKE_CRANK - pivot[0], -pivot[1]];
  const reach = Math.hypot(toPin[0], toPin[1]);
  const unit = [toPin[0] / reach, toPin[1] / reach];
  const along = (distance: number): [number, number] => [
    pivot[0] + unit[0] * distance,
    pivot[1] + unit[1] * distance,
  ];
  const [dx, dy] = along(2);
  const [rx, ry] = along(reach - 0.4);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      { id: 'C', x: pivot[0], y: pivot[1], ground: true },
      { id: 'D', x: dx, y: dy },
      { id: 'R', x: rx, y: ry },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'BR' }],
    sliders: [{ at: 'R', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } }],
    welds: ['R'],
    inputAngVel: INPUT_SPEED,
  };
}

/** How far off the slot line the tracer arm reaches. */
export const TRACER_OFFSET = 2;

/**
 * The same yoke carrying a tracer point G that is **not** on its slot, and is
 * declared before either slot joint.
 *
 * That combination is the whole point. Sliding the assembly means solving "the
 * block lies on the slot", and the slot line has to be measured from a joint
 * actually on it — from G it is a line parallel to the slot but two units to
 * the side, and solving to *that* puts the yoke somewhere plausible and wrong.
 * In the plain yoke the first movable member happens to be the slot's own
 * anchor, so nothing there can tell the two apart.
 */
export function scotchYokeWithTracerFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: YOKE_CRANK, y: 0 },
      { id: 'G', x: YOKE_CRANK + TRACER_OFFSET, y: SLOT_RISE },
      { id: 'C', x: YOKE_CRANK, y: -GUIDE_DROP },
      { id: 'D', x: YOKE_CRANK, y: SLOT_RISE },
    ],
    links: [{ joints: 'AB' }, { joints: 'CDG' }],
    sliders: [
      { at: 'B', prisId: 'E', on: { carrier: 'CDG', a: 'C', b: 'D' } },
      { at: 'C', prisId: 'F', angleRad: 0 },
    ],
    welds: ['C'],
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

/**
 * A hydraulic cylinder: a rod welded to a block that slides in a barrel, with
 * the barrel's far end and the rod's far end on opposite sides of the block and
 * everything on one line (§2.7).
 *
 * Drawn, not solved. A Slide on a *moving* carrier is out of Phase 3's scope --
 * the rider's angle tracks a carrier that is itself unknown -- so this mechanism
 * is deliberately invalid and exists to exercise the cylinder skin, which is a
 * rendering question rather than a kinematic one.
 */
export function cylinderSkinFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -4, y: 0, ground: true },
      { id: 'B', x: -1, y: 0 },
      { id: 'C', x: 0, y: 0 },
      { id: 'D', x: 4, y: 0 },
      { id: 'E', x: 4, y: 3, ground: true, input: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'DE' }],
    sliders: [{ at: 'C', prisId: 'P', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
    welds: ['C'],
    inputAngVel: INPUT_SPEED,
  };
}
