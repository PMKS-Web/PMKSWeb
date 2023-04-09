import { Link, RealLink } from './link';
import { Coord } from './coord';
import { AppConstants } from './app-constants';
import { SettingsService } from '../services/settings.service';

export class Force {
  private _id: string;
  private _link: RealLink;
  private _startCoord: Coord;
  private _endCoord: Coord;
  private _forceLine: string;
  private _forceArrow: string;
  private _arrowOutward: boolean;
  private _local: boolean;
  private _stroke: string = 'black';
  private _fill: string = 'black';
  private _mag: number;
  private _angleRad: number;
  public xComp: number = 0;
  public yComp: number = 0;

  private _showHighlight: boolean = false;
  isEndSelected: boolean = false;
  isStartSelected: boolean = false;

  constructor(
    id: string,
    link: RealLink,
    startCoord: Coord,
    endCoord: Coord,
    local: boolean = false,
    arrowOutward: boolean = true,
    mag: number = 1
  ) {
    // TODO: Have to have local argument since some forces can be created that are local or global
    this._id = id;
    this._link = link;
    this._startCoord = new Coord(startCoord.x, startCoord.y);
    this._endCoord = new Coord(endCoord.x, endCoord.y);
    this._forceLine = Force.createForceLine(startCoord, endCoord);
    this._forceArrow = Force.createForceArrow(startCoord, endCoord);
    this._local = local;
    this._arrowOutward = arrowOutward;
    this._mag = mag;
    this._angleRad = this.updateAngle(this.startCoord, this.endCoord);
    this.xComp = this.endCoord.x - this.startCoord.x;
    this.yComp = this.endCoord.y - this.startCoord.y;
  }

  updateAngle(startCoord: Coord, endCoord: Coord) {
    return Math.atan2(endCoord.y - startCoord.y, endCoord.x - startCoord.x);
  }

  updateInternalValues() {
    this.angleRad = this.updateAngle(this.startCoord, this.endCoord);
    this.xComp = this.endCoord.x - this.startCoord.x;
    this.yComp = this.endCoord.y - this.startCoord.y;
  }

  static createForceLine(startCoord: Coord, endCoord: Coord) {
    return (
      'M ' +
      startCoord.x.toString() +
      ' ' +
      startCoord.y.toString() +
      ' L ' +
      endCoord.x.toString() +
      ' ' +
      endCoord.y.toString()
    );
  }

  static createForceArrow(startCoord: Coord, endCoord: Coord) {
    const angle = Math.atan2(endCoord.y - startCoord.y, endCoord.x - startCoord.x);
    const a1 = angle - Math.PI / 6;
    const a2 = angle + Math.PI / 6;
    const triLen = 0.2 * SettingsService.objectScale.value;
    const dx1 = Math.cos(a1) * triLen;
    const dy1 = Math.sin(a1) * triLen;
    const dx2 = Math.cos(a2) * triLen;
    const dy2 = Math.sin(a2) * triLen;

    //Offset the tip of the triangle by 1/2 the length of the triangle
    const tipOfTriangle = endCoord.clone();
    tipOfTriangle.x += Math.cos(angle) * 0.05 * SettingsService.objectScale.value;
    tipOfTriangle.y += Math.sin(angle) * 0.05 * SettingsService.objectScale.value;
    // const triString = `M ${endX} ${endY} L ${endX - dx1} ${endY - dy1} L ${endX - dx2} ${endY - dy2} Z`;
    return (
      'M ' +
      tipOfTriangle.x.toString() +
      ' ' +
      tipOfTriangle.y.toString() +
      ' L ' +
      (endCoord.x - dx1).toString() +
      ' ' +
      (endCoord.y - dy1).toString() +
      ' L ' +
      (endCoord.x - dx2).toString() +
      ' ' +
      (endCoord.y - dy2).toString() +
      ' Z'
    );
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get link(): RealLink {
    return this._link;
  }

  set link(value: RealLink) {
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

  get arrowOutward(): boolean {
    return this._arrowOutward;
  }

  set arrowOutward(value: boolean) {
    this._arrowOutward = value;
  }

  get local(): boolean {
    return this._local;
  }

  set local(value: boolean) {
    this._local = value;
  }

  get stroke(): string {
    return this._stroke;
  }

  set stroke(value: string) {
    this._stroke = value;
  }

  get fill(): string {
    return this._fill;
  }

  set fill(value: string) {
    this._fill = value;
  }

  get mag(): number {
    return this._mag;
  }

  set mag(value: number) {
    this._mag = value;
  }

  get showHighlight(): boolean {
    return this._showHighlight;
  }

  set showHighlight(value: boolean) {
    this._showHighlight = value;
  }

  get angleRad(): number {
    return this._angleRad;
  }

  set angleRad(value: number) {
    this._angleRad = value;
  }
}
