import {AppConstants} from "../component/grid/app-constants/app-constants";
import {Link} from "./link";

export class Joint {
  private _id: string;
  private _x: number;
  private _y: number;
  private _r: number;
  private _type: string;
  private _ground: boolean;
  private _links: Link[];

  constructor(id: string, x: number, y: number) {
    this._id = id;
    this._x = x;
    this._y = y;
    this._r = 5 * AppConstants.scaleFactor;
    this._type = 'R';
    this._ground = false;
    this._links = [];
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
