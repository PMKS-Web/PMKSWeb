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

  getDistanceTo(coord: Coord): number {
    return Math.sqrt(Math.pow(this.x - coord.x, 2) + Math.pow(this.y - coord.y, 2));
  }

  getAngleTo(arcStart: Coord) {
    return Math.atan2(this.y - arcStart.y, this.x - arcStart.x);
  }

  equals(coord: Coord) {
    return this.getDistanceTo(coord) < 0.0001;
  }

  looselyEquals(coord: Coord) {
    return this.getDistanceTo(coord) < 0.1;
  }

  add(vector: Coord) {
    //Add a vector to this coordinate
    return new Coord(this.x + vector.x, this.y + vector.y);
  }

  subtract(vector: Coord) {
    //Subtract a vector from this coordinate
    return new Coord(this.x - vector.x, this.y - vector.y);
  }

  clone() {
    return new Coord(this.x, this.y);
  }

  scale(shortenBy: number) {
    return new Coord(this.x * shortenBy, this.y * shortenBy);
  }
}
