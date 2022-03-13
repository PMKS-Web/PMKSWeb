import {AppConstants} from "../component/grid/app-constants/app-constants";

export class Joint {
  private _id: string;
  private _x: number;
  private _y: number;
  private _r: number;

  constructor(id: string, x: number, y: number) {
    this._id = id;
    this._x = x;
    this._y = y;
    this._r = 5 * AppConstants.scaleFactor;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
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

  get r(): number {
    return this._r;
  }

  set r(value: number) {
    this._r = value;
  }
}
