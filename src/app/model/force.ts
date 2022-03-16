import {Link} from "./link";
import {Coord} from "../component/grid/coord/coord";

export class Force {
  private _id: string
  private _link: Link;
  private _startCoord: Coord;
  private _endCoord: Coord;

  constructor(id: string, link: Link, startCoord: Coord, endCoord: Coord) {
    this._id = id;
    this._link = link;
    this._startCoord = startCoord;
    this._endCoord = endCoord;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get link(): Link {
    return this._link;
  }

  set link(value: Link) {
    this._link = value;
  }

  get startCoord(): Coord {
    return this._startCoord;
  }

  set startCoord(value: Coord) {
    this._startCoord = value;
  }

  get endCoord(): Coord {
    return this._endCoord;
  }

  set endCoord(value: Coord) {
    this._endCoord = value;
  }
}
