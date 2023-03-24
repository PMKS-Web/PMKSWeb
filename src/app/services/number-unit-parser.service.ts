import { Injectable } from '@angular/core';
import { LengthUnit, AngleUnit, ForceUnit } from '../model/utils';

@Injectable({
  providedIn: 'root',
})
export class NumberUnitParserService {
  constructor() {}

  public formatValueAndUnit(value: number, units: LengthUnit | AngleUnit | ForceUnit): string {
    switch (units) {
      case LengthUnit.CM:
        return value.toFixed(2) + ' cm';
      case LengthUnit.METER:
        return value.toFixed(2) + ' m';
      case LengthUnit.INCH:
        return value.toFixed(2) + ' in';
      case AngleUnit.DEGREE:
        return value.toFixed(2) + ' deg';
      case AngleUnit.RADIAN:
        return value.toFixed(2) + ' rad';
      case ForceUnit.LBF:
        return value.toFixed(2) + ' lbf';
      case ForceUnit.NEWTON:
        return value.toFixed(2) + ' N';
    }
    return 'Error in formatValueAndUnit()';
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
            return value * 39.3701;
        }
        break;
      case LengthUnit.INCH:
        switch (desiredUnits) {
          case LengthUnit.CM:
            return value * 2.54;
          case LengthUnit.METER:
            return value / 39.3701;
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
            return (value * Math.PI) / 180;
        }
        break;
      case AngleUnit.RADIAN:
        switch (desiredUnits) {
          case AngleUnit.DEGREE:
            return (value * 180) / Math.PI;
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
