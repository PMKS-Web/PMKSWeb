import { Injectable } from '@angular/core';
import {
  LengthUnit,
  AngleUnit,
  AngularVelocityUnit,
  ForceUnit,
  MassUnit,
  InertiaUnit,
  TimeUnit,
} from '../model/utils';
import {
  ANGULAR_VELOCITY_TO_RAD_PER_SEC,
  INERTIA_TO_KG_M2,
  MASS_TO_KG,
  TIME_TO_SECONDS,
} from '../model/unit-conversions';
import { MODEL_SCALE } from '../model/render-scale';

type AnyUnit =
  LengthUnit | AngleUnit | AngularVelocityUnit | ForceUnit | MassUnit | InertiaUnit | TimeUnit;

@Injectable({
  providedIn: 'root',
})
export class NumberUnitParserService {
  constructor() {}

  /** The suffix shown next to an input and appended by formatValueAndUnit. */
  public unitLabel(units: AnyUnit): string {
    switch (units) {
      case LengthUnit.CM:
        return 'cm';
      case LengthUnit.METER:
        return 'm';
      case LengthUnit.INCH:
        return 'in';
      case AngleUnit.DEGREE:
        return 'deg';
      case AngleUnit.RADIAN:
        return 'rad';
      case ForceUnit.LBF:
        return 'lbf';
      case ForceUnit.NEWTON:
        return 'N';
      case MassUnit.GRAM:
        return 'g';
      case MassUnit.KG:
        return 'kg';
      case MassUnit.LBM:
        return 'lbm';
      case InertiaUnit.KG_CM2:
        return 'kg·cm²';
      case InertiaUnit.KG_M2:
        return 'kg·m²';
      case InertiaUnit.LBM_IN2:
        return 'lbm·in²';
      case AngularVelocityUnit.RPM:
        return 'RPM';
      case AngularVelocityUnit.DEG_PER_SEC:
        return 'deg/s';
      case AngularVelocityUnit.RAD_PER_SEC:
        return 'rad/s';
      case TimeUnit.MILLISECOND:
        return 'ms';
      case TimeUnit.SECOND:
        return 's';
      case TimeUnit.MINUTE:
        return 'min';
    }
    return '';
  }

  public formatValueAndUnit(value: number, units: AnyUnit): string {
    const label = this.unitLabel(units);
    if (label === '') return 'Error in formatValueAndUnit()';
    const decimals = units === AngleUnit.DEGREE ? 0 : 2;
    return value.toFixed(decimals) + ' ' + label;
  }

  /**
   * Format a length held in internal model units (MODEL_SCALE times the user's
   * unit — see render-scale.ts) for display in the user's unit. The one
   * companion of parseModelLengthString: every panel that shows a model length
   * goes through this pair so the internal scale never reaches the screen.
   */
  public formatModelLength(modelValue: number, units: LengthUnit): string {
    return this.formatValueAndUnit(modelValue / MODEL_SCALE, units);
  }

  /** Parse user input in user units and return internal model units. */
  public parseModelLengthString(input: string, desiredUnits: LengthUnit): [boolean, number] {
    const [success, value] = this.parseLengthString(input, desiredUnits);
    return [success, value * MODEL_SCALE];
  }

  public preProcessInput(input: string): [number, string] {
    //Remove all spaces
    input = input.replace(/\s/g, '');
    //Find the first non-digit character
    let index = 0;
    while (
      index < input.length &&
      ((input[index] >= '0' && input[index] <= '9') || input[index] == '.' || input[index] == '-')
    ) {
      index++;
    }
    let value: number = parseFloat(input.slice(0, index));
    let unit: string = input.slice(index).trim();

    return [value, unit];
  }

  public parseAngleString(input: string, desiredUnits: AngleUnit): [boolean, number] {
    let [value, unit] = this.preProcessInput(input);

    if (isNaN(value)) return [false, 0]; //If the value is not a number, return fail
    if (unit.length == 0) return [true, value]; //No units means imply that we have the desired units

    let givenUnits: AngleUnit;

    switch (unit) {
      case '°':
      case 'deg':
      case 'degree':
      case 'degrees':
        givenUnits = AngleUnit.DEGREE;
        break;
      case 'rad':
      case 'radian':
      case 'radians':
        givenUnits = AngleUnit.RADIAN;
        break;
      default:
        return [false, value];
    }

    //If we have the desired units, return the value
    if (givenUnits == desiredUnits) return [true, value];
    value = this.convertAngle(value, givenUnits, desiredUnits);
    return [true, value];
  }

  public getAngleUnit(input: string): AngleUnit {
    switch (input) {
      case '°':
      case 'deg':
      case 'degree':
      case 'degrees':
        return AngleUnit.DEGREE;
      case 'rad':
      case 'radian':
      case 'radians':
        return AngleUnit.RADIAN;
      default:
        return AngleUnit.NULL;
    }
  }

  public getLengthUnit(input: string): LengthUnit {
    switch (input) {
      case 'cm':
      case 'centimeter':
      case 'centimeters':
        return LengthUnit.CM;
      case 'm':
      case 'meter':
      case 'meters':
        return LengthUnit.METER;
      case 'in':
      case 'inch':
      case 'inches':
        return LengthUnit.INCH;
      default:
        return LengthUnit.NULL;
    }
  }

  public parseLengthString(input: string, desiredUnits: LengthUnit): [boolean, number] {
    let [value, unit] = this.preProcessInput(input);

    if (isNaN(value)) return [false, 0]; //If the value is not a number, return fail
    if (unit.length == 0) return [true, value]; //No units means imply that we have the desired units

    let givenUnits: LengthUnit;

    switch (unit) {
      case 'cm':
      case 'centimeter':
      case 'centimeters':
        givenUnits = LengthUnit.CM;
        break;
      case 'm':
      case 'meter':
      case 'meters':
        givenUnits = LengthUnit.METER;
        break;
      case 'in':
      case 'inch':
      case 'inches':
        givenUnits = LengthUnit.INCH;
        break;
      default:
        return [false, value];
    }
    if (givenUnits == desiredUnits) return [true, value];
    value = this.convertLength(value, givenUnits, desiredUnits);
    return [true, value];
  }

  parseForceString(s: string, desiredUnits: ForceUnit): [boolean, number] {
    let [value, unit] = this.preProcessInput(s);

    if (isNaN(value)) return [false, 0]; //If the value is not a number, return fail
    if (unit.length == 0) return [true, value]; //No units means imply that we have the desired units

    let givenUnits: ForceUnit;

    switch (unit) {
      case 'N':
      case 'newton':
      case 'newtons':
        givenUnits = ForceUnit.NEWTON;
        break;
      case 'lb':
      case 'lbf':
      case 'pound':
      case 'pounds':
        givenUnits = ForceUnit.LBF;
        break;
      default:
        return [false, value];
    }
    if (givenUnits == desiredUnits) return [true, value];
    value = this.convertForce(value, givenUnits, desiredUnits);
    return [true, value];
  }

  /** Compound suffixes vary by keyboard: kg·cm², kg*cm^2 and kgcm2 all mean one thing. */
  private normalizeUnitToken(unit: string): string {
    return unit
      .toLowerCase()
      .replace(/²/g, '2')
      .replace(/[·*.^\-]/g, '');
  }

  public getMassUnit(input: string): MassUnit {
    switch (this.normalizeUnitToken(input)) {
      case 'g':
      case 'gram':
      case 'grams':
        return MassUnit.GRAM;
      case 'kg':
      case 'kilogram':
      case 'kilograms':
        return MassUnit.KG;
      case 'lb':
      case 'lbm':
      case 'pound':
      case 'pounds':
        return MassUnit.LBM;
      default:
        return MassUnit.NULL;
    }
  }

  public parseMassString(input: string, desiredUnits: MassUnit): [boolean, number] {
    const [value, unit] = this.preProcessInput(input);

    if (isNaN(value)) return [false, 0]; //If the value is not a number, return fail
    if (unit.length == 0) return [true, value]; //No units means imply that we have the desired units

    const givenUnits = this.getMassUnit(unit);
    if (givenUnits === MassUnit.NULL) return [false, value];
    return [true, this.convertMass(value, givenUnits, desiredUnits)];
  }

  public getInertiaUnit(input: string): InertiaUnit {
    switch (this.normalizeUnitToken(input)) {
      case 'kgcm2':
        return InertiaUnit.KG_CM2;
      case 'kgm2':
        return InertiaUnit.KG_M2;
      case 'lbmin2':
      case 'lbin2':
        return InertiaUnit.LBM_IN2;
      default:
        return InertiaUnit.NULL;
    }
  }

  public parseInertiaString(input: string, desiredUnits: InertiaUnit): [boolean, number] {
    const [value, unit] = this.preProcessInput(input);

    if (isNaN(value)) return [false, 0];
    if (unit.length == 0) return [true, value];

    const givenUnits = this.getInertiaUnit(unit);
    if (givenUnits === InertiaUnit.NULL) return [false, value];
    return [true, this.convertInertia(value, givenUnits, desiredUnits)];
  }

  public getTimeUnit(input: string): TimeUnit {
    switch (this.normalizeUnitToken(input)) {
      case 'ms':
      case 'millisecond':
      case 'milliseconds':
        return TimeUnit.MILLISECOND;
      case 's':
      case 'sec':
      case 'second':
      case 'seconds':
        return TimeUnit.SECOND;
      case 'min':
      case 'minute':
      case 'minutes':
        return TimeUnit.MINUTE;
      default:
        return TimeUnit.NULL;
    }
  }

  public parseTimeString(input: string, desiredUnits: TimeUnit): [boolean, number] {
    const [value, unit] = this.preProcessInput(input);

    if (isNaN(value)) return [false, 0];
    if (unit.length == 0) return [true, value];

    const givenUnits = this.getTimeUnit(unit);
    if (givenUnits === TimeUnit.NULL) return [false, value];
    return [true, this.convertTime(value, givenUnits, desiredUnits)];
  }

  public convertTime(value: number, givenUnits: TimeUnit, desiredUnits: TimeUnit): number {
    return this.convertViaBase(value, givenUnits, desiredUnits, TIME_TO_SECONDS, 'convertTime');
  }

  public getAngularVelocityUnit(input: string): AngularVelocityUnit {
    switch (this.normalizeUnitToken(input)) {
      case 'rpm':
      case 'rev/min':
      case 'revs/min':
        return AngularVelocityUnit.RPM;
      case 'deg/s':
      case 'deg/sec':
      case 'degrees/s':
      case '°/s':
        return AngularVelocityUnit.DEG_PER_SEC;
      case 'rad/s':
      case 'rad/sec':
      case 'radians/s':
        return AngularVelocityUnit.RAD_PER_SEC;
      default:
        return AngularVelocityUnit.NULL;
    }
  }

  public parseAngularVelocityString(
    input: string,
    desiredUnits: AngularVelocityUnit
  ): [boolean, number] {
    const [value, unit] = this.preProcessInput(input);

    if (isNaN(value)) return [false, 0];
    if (unit.length == 0) return [true, value];

    const givenUnits = this.getAngularVelocityUnit(unit);
    if (givenUnits === AngularVelocityUnit.NULL) return [false, value];
    return [true, this.convertAngularVelocity(value, givenUnits, desiredUnits)];
  }

  public convertAngularVelocity(
    value: number,
    givenUnits: AngularVelocityUnit,
    desiredUnits: AngularVelocityUnit
  ): number {
    return this.convertViaBase(
      value,
      givenUnits,
      desiredUnits,
      ANGULAR_VELOCITY_TO_RAD_PER_SEC,
      'convertAngularVelocity'
    );
  }

  public convertMass(value: number, givenUnits: MassUnit, desiredUnits: MassUnit): number {
    return this.convertViaBase(value, givenUnits, desiredUnits, MASS_TO_KG, 'convertMass');
  }

  public convertInertia(value: number, givenUnits: InertiaUnit, desiredUnits: InertiaUnit): number {
    return this.convertViaBase(value, givenUnits, desiredUnits, INERTIA_TO_KG_M2, 'convertInertia');
  }

  private convertViaBase(
    value: number,
    givenUnits: number,
    desiredUnits: number,
    toBase: Record<number, number>,
    caller: string
  ): number {
    if (givenUnits === desiredUnits) return value;
    const given = toBase[givenUnits];
    const desired = toBase[desiredUnits];
    if (given === undefined || desired === undefined) {
      console.error(
        `Error in NumberUnitParserService.${caller}(): No valid conversion found between ` +
          `${givenUnits} and ${desiredUnits}`
      );
      return value;
    }
    return (value * given) / desired;
  }

  public convertLength(value: number, givenUnits: LengthUnit, desiredUnits: LengthUnit): number {
    if (givenUnits == desiredUnits) return value;
    switch (givenUnits) {
      case LengthUnit.CM:
        switch (desiredUnits) {
          case LengthUnit.METER:
            return value / 100;
          case LengthUnit.INCH:
            return value / 2.54;
        }
        break;
      case LengthUnit.METER:
        switch (desiredUnits) {
          case LengthUnit.CM:
            return value * 100;
          case LengthUnit.INCH:
            return value / 0.0254;
        }
        break;
      case LengthUnit.INCH:
        switch (desiredUnits) {
          case LengthUnit.CM:
            return value * 2.54;
          case LengthUnit.METER:
            return value * 0.0254;
        }
        break;
    }
    console.error(
      'Error in NumberUnitParserService.convertLength(): No valid conversion found between ' +
        LengthUnit[givenUnits] +
        ' and ' +
        LengthUnit[desiredUnits]
    );
    return value;
  }

  public convertAngle(value: number, givenUnits: AngleUnit, desiredUnits: AngleUnit): number {
    if (givenUnits == desiredUnits) return value;
    switch (givenUnits) {
      case AngleUnit.DEGREE:
        switch (desiredUnits) {
          case AngleUnit.RADIAN:
            return (value * Math.PI) / 180.0;
        }
        break;
      case AngleUnit.RADIAN:
        switch (desiredUnits) {
          case AngleUnit.DEGREE:
            return (value * 180.0) / Math.PI;
        }
        break;
    }
    console.error(
      'Error in NumberUnitParserService.convertAngle(): No valid conversion found between ' +
        AngleUnit[givenUnits] +
        ' and ' +
        AngleUnit[desiredUnits]
    );
    return value;
  }

  private convertForce(value: number, givenUnits: ForceUnit, desiredUnits: ForceUnit): number {
    if (givenUnits == desiredUnits) return value;
    switch (givenUnits) {
      case ForceUnit.NEWTON:
        switch (desiredUnits) {
          case ForceUnit.LBF:
            return value * 0.224809;
        }
        break;
      case ForceUnit.LBF:
        switch (desiredUnits) {
          case ForceUnit.NEWTON:
            return value / 0.224809;
        }
        break;
    }
    console.error(
      'Error in NumberUnitParserService.convertForce(): No valid conversion found between ' +
        ForceUnit[givenUnits] +
        ' and ' +
        ForceUnit[desiredUnits]
    );
    return value;
  }
}
