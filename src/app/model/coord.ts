// A class to represent an X and Y coordinate

import { RealLink } from './link';

export class Coord {
  private _x: number;
  private _y: number;

  constructor(x: number, y: number) {
    this._x = x;
    this._y = y;
  }

  get x(): number {
    return this._x;
  }

  set x(value: number) {
    this._x = value;
  }

  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
  }

  applyMatrix(inverseCTM: DOMMatrix) {
    const x = this.x * inverseCTM.a + this.y * inverseCTM.c + inverseCTM.e;
    const y = this.x * inverseCTM.b + this.y * inverseCTM.d + inverseCTM.f;
    return new Coord(x, y);
  }
}
