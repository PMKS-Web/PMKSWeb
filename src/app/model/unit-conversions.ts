import { AngularVelocityUnit, InertiaUnit, LengthUnit, MassUnit, TimeUnit } from './unit-enums';

/**
 * Single source of truth for physical unit conversions. Every field, solver,
 * and export scales through these constants so a joint's length, a link's
 * mass/inertia, and a force can never disagree about how a unit converts.
 *
 * The atomic values are exact decimal literals matching what was previously
 * inlined across the codebase, so results stay bit-identical.
 */

export const METERS_PER_INCH = 0.0254;
export const KG_PER_LBM = 0.45359237;
export const NEWTONS_PER_LBF = 4.4482216152605;

// Display conversions from the solver's SI results back to English readouts,
// derived from the atomic constants so they can't drift. (The codebase
// previously inlined 0.22480894387096 and 8.8507457913272, which were the exact
// reciprocals only to ~8 significant figures; deriving them removes that skew.)
export const LBF_PER_NEWTON = 1 / NEWTONS_PER_LBF;
export const LBF_IN_PER_NEWTON_METER = 1 / (NEWTONS_PER_LBF * METERS_PER_INCH);

export interface SiUnitFactors {
  /** Meters per one length unit. */
  distanceToM: number;
  /** Kilograms per one mass unit. */
  massToKg: number;
  /** kg*m^2 per one inertia unit. */
  inertiaToKgM2: number;
  /** Newtons per one force unit. */
  forceToN: number;
}

/** Conversion factors for the length system named by the solver's unit string. */
export function siUnitFactors(lengthUnit: string): SiUnitFactors {
  switch (lengthUnit) {
    case 'in':
      return {
        distanceToM: METERS_PER_INCH,
        massToKg: KG_PER_LBM,
        inertiaToKgM2: KG_PER_LBM * METERS_PER_INCH * METERS_PER_INCH,
        forceToN: NEWTONS_PER_LBF,
      };
    case 'm':
      return { distanceToM: 1, massToKg: 1, inertiaToKgM2: 1, forceToN: 1 };
    case 'cm':
    default:
      return { distanceToM: 0.01, massToKg: 0.001, inertiaToKgM2: 0.0001, forceToN: 1 };
  }
}

/** The same factors keyed by the LengthUnit enum used across the UI/services. */
export function siUnitFactorsForLength(unit: LengthUnit): SiUnitFactors {
  if (unit === LengthUnit.INCH) return siUnitFactors('in');
  if (unit === LengthUnit.METER) return siUnitFactors('m');
  return siUnitFactors('cm');
}

/** Kilograms per one of each mass unit. */
export const MASS_TO_KG: Record<number, number> = {
  [MassUnit.GRAM]: 0.001,
  [MassUnit.KG]: 1,
  [MassUnit.LBM]: KG_PER_LBM,
};

/** kg*m^2 per one of each inertia unit. */
export const INERTIA_TO_KG_M2: Record<number, number> = {
  [InertiaUnit.KG_CM2]: 0.0001,
  [InertiaUnit.KG_M2]: 1,
  [InertiaUnit.LBM_IN2]: KG_PER_LBM * METERS_PER_INCH * METERS_PER_INCH,
};

/** Seconds per one of each time unit. */
export const TIME_TO_SECONDS: Record<number, number> = {
  [TimeUnit.MILLISECOND]: 0.001,
  [TimeUnit.SECOND]: 1,
  [TimeUnit.MINUTE]: 60,
};

/** Radians per second per one of each angular velocity unit. */
export const ANGULAR_VELOCITY_TO_RAD_PER_SEC: Record<number, number> = {
  [AngularVelocityUnit.RPM]: Math.PI / 30,
  [AngularVelocityUnit.DEG_PER_SEC]: Math.PI / 180,
  [AngularVelocityUnit.RAD_PER_SEC]: 1,
};
