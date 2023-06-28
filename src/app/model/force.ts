import { Link, RealLink } from './link';
import { Coord } from './coord';
import { AppConstants } from './app-constants';
import { SettingsService } from '../services/settings.service';
import { getAngle } from './utils';

export class Force {
  private _id: string;
  private _name: string = '';
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
  visualWidth: number = 0.1;

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
    this._forceLine = this.createForceLine(startCoord, endCoord);
    this._forceArrow = this.createForceArrow(startCoord, endCoord);
    this._local = local;
    this._arrowOutward = arrowOutward;
    this._mag = mag;
    this._angleRad = this.updateAngle(this.startCoord, this.endCoord);
    this.xComp = this.endCoord.x - this.startCoord.x;
    this.yComp = this.endCoord.y - this.startCoord.y;
    this.visualWidth = Math.min(this.mag * 0.1, 0.5);
  }

  updateAngle(startCoord: Coord, endCoord: Coord) {
    return Math.atan2(endCoord.y - startCoord.y, endCoord.x - startCoord.x);
  }

  updateInternalValues() {
    this.angleRad = this.updateAngle(this.startCoord, this.endCoord);
    this.xComp = this.endCoord.x - this.startCoord.x;
    this.yComp = this.endCoord.y - this.startCoord.y;
    this.visualWidth = Math.min(this.mag * 0.1, 0.5);
    this._forceLine = this.createForceLine(this.startCoord, this.endCoord);
    this._forceArrow = this.createForceArrow(this.startCoord, this.endCoord);
  }

  createForceLine(startCoord: Coord, endCoord: Coord) {
    //Shorten the end of the line the height of the arrow
    const angle = Math.atan2(endCoord.y - startCoord.y, endCoord.x - startCoord.x);
    const dx = Math.cos(angle) * this.visualWidth * SettingsService.objectScale;
    const dy = Math.sin(angle) * this.visualWidth * SettingsService.objectScale;
    let startX = startCoord.x + dx;
    let startY = startCoord.y + dy;
    let endX = endCoord.x - dx;
    let endY = endCoord.y - dy;

    if (this._arrowOutward) {
      startX = startCoord.x;
      startY = startCoord.y;
    } else {
      endX = endCoord.x;
      endY = endCoord.y;
    }

    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  createForceArrow(startCoord: Coord, endCoord: Coord) {
    //Get the tip of the triangle
    const arrowVector = endCoord
      .clone()
      .subtract(startCoord)
      .normalize()
      .scale(0.06 * SettingsService.objectScale);
    let tipOfTriangle = endCoord.clone().add(arrowVector);

    const length = this.visualWidth * 2 * SettingsService.objectScale;
    const width = this.visualWidth * 2 * SettingsService.objectScale;
    const angle = getAngle(startCoord, endCoord);

    const point1 = tipOfTriangle
      .clone()
      .add(
        new Coord(
          -length * Math.cos(angle) - width * Math.sin(angle),
          -length * Math.sin(angle) + width * Math.cos(angle)
        )
      );
    const point2 = tipOfTriangle
      .clone()
      .add(
        new Coord(
          -length * Math.cos(angle) + width * Math.sin(angle),
          -length * Math.sin(angle) - width * Math.cos(angle)
        )
      );

    return (
      'M ' +
      tipOfTriangle.x.toString() +
      ' ' +
      tipOfTriangle.y.toString() +
      ' L ' +
      point1.x.toString() +
      ' ' +
      point1.y.toString() +
      ' L ' +
      point2.x.toString() +
      ' ' +
      point2.y.toString() +
      ' Z'
    );
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get name(): string {
    if (this._name === '') {
      return this.id;
    }
    return this._name;
  }

  set name(value: string) {
    this._name = value;
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

  get forceLineLong(): string {
    //Extend the line on both ends by the visual width
    const angle = Math.atan2(
      this.endCoord.y - this.startCoord.y,
      this.endCoord.x - this.startCoord.x
    );
    const dx = Math.cos(angle) * this.visualWidth * SettingsService.objectScale;
    const dy = Math.sin(angle) * this.visualWidth * SettingsService.objectScale;
    let startX = this.startCoord.x - dx;
    let startY = this.startCoord.y - dy;
    let endX = this.endCoord.x + dx;
    let endY = this.endCoord.y + dy;

    return `M ${startX} ${startY} L ${endX} ${endY}`;
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
