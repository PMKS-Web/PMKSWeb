import { MechanismFixture } from './fixture';
import { INPUT_SPEED } from './slot-fixtures';

// Fixtures mirror the MATLAB mechanism definitions in
// PMKS-Web/PMKS_Verification (Initializer.m / main.m of each mechanism, with
// initial link CoMs cross-checked against row 0 of the exported CSVs).
//
// reference-data/v1 intentionally rebaselines every speed from the declared
// RPM instead of retaining older rounded rad/s constants.
const rpmToRadPerSec = (rpm: number) => (rpm * Math.PI) / 30;

/** Four-bar with tracer points on every link and CAD-measured mass properties. */
export function teachingLabFourBarFixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1.52, y: 0 },
      { id: 'C', x: 4.23, y: 3.029 },
      { id: 'D', x: 4.572, y: 0, ground: true },
      { id: 'E', x: 4.79, y: 1.632 },
      { id: 'F', x: 2.548, y: 1.958 },
      { id: 'G', x: 2.053, y: 3.543 },
      { id: 'H', x: 0.7598, y: 1.0278 },
      { id: 'I', x: 4.1798, y: 1.952 },
    ],
    links: [
      { joints: 'ABH', mass: 10.458382, moi: 52777966.276354, com: [-6.38, 2.39] },
      { joints: 'BCFG', mass: 0.626202, moi: 10871793.503827, com: [185.73, 209.1] },
      { joints: 'CDEI', mass: 4.901229, moi: 63343618.03601, com: [472.56, -20.8] },
    ],
    inputAngVel: rpmToRadPerSec(10.31),
    gravity,
  };
}

/**
 * Crank-slider. The MATLAB link is named BCE, where E is a sensor mounted
 * exactly at joint B, so the PMKS+ link is just BC; the prismatic joint takes
 * the next free letter D.
 */
export function teachingLabSliderCrankFixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 13.79, y: 10.01, ground: true, input: true },
      { id: 'B', x: 13.79, y: 13.82 },
      { id: 'C', x: -0.97, y: 10.01 },
    ],
    links: [
      { joints: 'AB', mass: 1.08532, moi: 0.0004647594, com: [0, 0.1] },
      { joints: 'BC', mass: 0.50144, moi: 0.0030344427, com: [0.5, 0.7] },
    ],
    slider: { at: 'C', prisId: 'D', angleRad: 0, pistonMass: 1.31788 },
    inputAngVel: rpmToRadPerSec(15.1),
    gravity,
  };
}

/** Crank-slider with a tracer point D on the coupler. Prismatic joint is E. */
export function sliderCrankTracerFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 4, y: 2 },
      { id: 'C', x: 12, y: 0 },
      { id: 'D', x: 20, y: 2 },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 0.1 },
      { joints: 'BCD', mass: 10, moi: 0.2 },
    ],
    slider: { at: 'C', prisId: 'E', angleRad: 0 },
    inputAngVel: rpmToRadPerSec(10),
  };
}

/** Stephenson III six-bar with a 50 N x-load at the midpoint of output link FG. */
export function stephensonIiiEx2Fixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 7, y: 4, ground: true, input: true },
      { id: 'B', x: 5, y: 16 },
      { id: 'C', x: 25, y: 25 },
      { id: 'D', x: 23, y: 10, ground: true },
      { id: 'E', x: 18, y: 35 },
      { id: 'F', x: 43, y: 32 },
      { id: 'G', x: 45, y: 17, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 0.1 },
      { joints: 'BCE', mass: 10, moi: 0.2 },
      { joints: 'CD', mass: 5, moi: 0.1 },
      { joints: 'EF', mass: 10, moi: 0.2 },
      { joints: 'FG', mass: 5, moi: 0.1 },
    ],
    load: { onLink: 'FG', at: [(43 + 45) / 2, (32 + 17) / 2], vector: [50, 0] },
    inputAngVel: rpmToRadPerSec(10),
    gravity,
  };
}

/** Watt I six-bar (rocking input) with a [50, 25] N load at output link CFG's center. */
export function wattIFixture(gravity = false): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -3.74, y: -2.41, ground: true, input: true },
      { id: 'B', x: -2.72, y: 0.91 },
      { id: 'C', x: 1.58, y: 0.43 },
      { id: 'D', x: -0.24, y: 4.01 },
      { id: 'E', x: 5.08, y: 5.31 },
      { id: 'F', x: 8.14, y: 3.35 },
      { id: 'G', x: 7.32, y: -3.51, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 0.1 },
      { joints: 'BCD', mass: 10, moi: 0.2 },
      { joints: 'DE', mass: 5, moi: 0.1 },
      { joints: 'EF', mass: 10, moi: 0.2 },
      { joints: 'CFG', mass: 5, moi: 0.1 },
    ],
    load: {
      onLink: 'CFG',
      at: [(1.58 + 8.14 + 7.32) / 3, (0.43 + 3.35 - 3.51) / 3],
      vector: [50, 25],
    },
    inputAngVel: rpmToRadPerSec(10),
    gravity,
  };
}

/**
 * Gate 6: one four-bar, drivable from either of two joints.
 *
 * `drivenAt: 'A'` is the ordinary machine — a grounded crank, solved by the
 * walk. `drivenAt: 'C'` drives the *coupler–rocker pin*, which is a floating
 * joint: nothing about its position is known when the walk starts, so it
 * reaches the constraint set instead (§2.9, Phase 6).
 *
 * The point of having both is that they are the same mechanism. Whatever the
 * coupler traces one way it must trace the other, which makes the reference
 * exact and leaves no data to drift.
 *
 * Grashof proportions, so the crank turns fully: ground 4, crank 1.5,
 * coupler 3.5, rocker 3. T is a tracer on the coupler, off its line, so the
 * curve it draws is a real coupler curve rather than a circle.
 */
export function fourBarDrivenAtFixture(
  drivenAt: 'A' | 'C',
  /**
   * Hang a second chain off the driven pin, so three bodies meet there. An
   * input then names no particular pair of them (§2.9), and the mechanism has
   * to say so rather than drive one of them and hope.
   */
  extraChainAtC: boolean = false
): MechanismFixture {
  return {
    joints: [
      { id: 'O', x: 0, y: 0, ground: true, input: drivenAt === 'A' },
      { id: 'A', x: 0.45, y: 1.43 },
      { id: 'C', x: 3.3, y: 2.4, input: drivenAt === 'C' },
      { id: 'D', x: 4, y: 0, ground: true },
      { id: 'T', x: 2.1, y: 3.3 },
      ...(extraChainAtC
        ? [
            { id: 'U', x: 5.2, y: 2.9 },
            { id: 'V', x: 6.4, y: 1.4, ground: true },
          ]
        : []),
    ],
    links: [
      { joints: 'OA' },
      { joints: 'ACT' },
      { joints: 'CD' },
      ...(extraChainAtC ? [{ joints: 'CU' }, { joints: 'UV' }] : []),
    ],
    inputAngVel: INPUT_SPEED,
  };
}
