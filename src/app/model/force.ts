import {Link} from "./link";
import {Coord} from "../component/grid/coord/coord";
import {AppConstants} from "../component/grid/app-constants/app-constants";

export class Force {
  private _id: string
  private _link: Link;
  private _startCoord: Coord;
  private _endCoord: Coord;
  private _forceLine: string;
  private _forceArrow: string;

  constructor(id: string, link: Link, startCoord: Coord, endCoord: Coord) {
    this._id = id;
    this._link = link;
    this._startCoord = startCoord;
    this._endCoord = endCoord;
    this._forceLine = Force.createForceLine(startCoord, endCoord);
    this._forceArrow = Force.createForceArrow(startCoord, endCoord);
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

  get forceLine(): string {
    return this._forceLine;
  }

  set forceLine(value: string) {
    this._forceLine = value;
  }

  get forceArrow(): string {
    return this._forceArrow;
  }

  set forceArrow(value: string) {
    this._forceArrow = value;
  }

  static createForceLine(startCoord: Coord, endCoord: Coord) {
    return 'M ' + startCoord.x.toString() + ' ' + startCoord.y.toString() + ' L '
    + endCoord.x.toString() + ' ' + endCoord.y.toString() + ' Z';
  }

  static createForceArrow(startCoord: Coord, endCoord: Coord) {
    const angle = Math.atan2(endCoord.y - startCoord.y, endCoord.x - startCoord.x);
    const a1 = angle - Math.PI / 6;
    const a2 = angle + Math.PI / 6;
    const triLen = 12 * AppConstants.scaleFactor;
    const dx1 = Math.cos(a1) * triLen;
    const dy1 = Math.sin(a1) * triLen;
    const dx2 = Math.cos(a2) * triLen;
    const dy2 = Math.sin(a2) * triLen;

    // const triString = `M ${endX} ${endY} L ${endX - dx1} ${endY - dy1} L ${endX - dx2} ${endY - dy2} Z`;
    return 'M ' + endCoord.x.toString() + ' ' + endCoord.y.toString() +
      ' L ' + (endCoord.x - dx1).toString() + ' ' + (endCoord.y - dy1).toString() +
      ' L ' + (endCoord.x - dx2).toString() + ' ' + (endCoord.y - dy2).toString() + ' Z';
  }
}
