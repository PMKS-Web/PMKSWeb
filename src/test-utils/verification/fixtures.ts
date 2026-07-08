import { MechanismFixture } from './fixture';

// Fixtures mirror the MATLAB mechanism definitions in
// PMKS-Web/PMKS_Verification (Initializer.m / main.m of each mechanism, with
// initial link CoMs cross-checked against row 0 of the exported CSVs).
//
// MATLAB hardcodes 1.0472 rad/s for "10 RPM", so the fixtures reproduce that
// exact value; the RPM-derived speeds use the same rpm*pi/30 conversion as
// MATLAB's GeneralUtils.rpmToRadPerSec.
const TEN_RPM_MATLAB = 1.0472;
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
    inputAngVel: TEN_RPM_MATLAB,
  };
}

/**
 * Stephenson III six-bar with tracer point H on the output link. The MATLAB
 * model centers link CDE's mass between D and E, and link FGH's between G
 * and H (its row 0 uses mid(F, H) instead — an inconsistency in the MATLAB
 * initializer, so the specs skip row 0 for that link's CoM series).
 */
export function stephensonIiiEx1Fixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 1.4, y: 0.485, ground: true, input: true },
      { id: 'B', x: 1.67, y: 0.99 },
      { id: 'C', x: 0.255, y: 1.035 },
      { id: 'D', x: 0.285, y: 0.055, ground: true },
      { id: 'E', x: 0.195, y: 2.54 },
      { id: 'F', x: -0.98, y: 2.57 },
      { id: 'G', x: 0.05, y: 0.2, ground: true },
      { id: 'H', x: -1.714, y: 4.26 },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 0.1 },
      { joints: 'BC', mass: 10, moi: 0.2 },
      { joints: 'CDE', mass: 5, moi: 0.1, com: [(0.285 + 0.195) / 2, (0.055 + 2.54) / 2] },
      { joints: 'EF', mass: 10, moi: 0.2 },
      { joints: 'FGH', mass: 5, moi: 0.1, com: [(0.05 - 1.714) / 2, (0.2 + 4.26) / 2] },
    ],
    // LoopSolver only finds the ABCDA loop for this topology, leaving links
    // EF/FGH without kinematics; the second loop is supplied explicitly.
    requiredLoopsOverride: ['ABCDA', 'ABCEFGA'],
    inputAngVel: TEN_RPM_MATLAB,
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
    inputAngVel: TEN_RPM_MATLAB,
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
    inputAngVel: TEN_RPM_MATLAB,
    gravity,
  };
}
