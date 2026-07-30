import { RealLink } from './link';
import { Coord } from './coord';
import { SettingsService } from '../services/settings.service';
import { getAngle } from './utils';

export class Force {
  static readonly DEFAULT_VISUAL_WIDTH = 0.1;
  static readonly MIN_VISUAL_WIDTH = 0.075;
  static readonly MAX_VISUAL_WIDTH = 0.15;

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

  private _showHighlight: boolean = false;
  isEndSelected: boolean = false;
  isStartSelected: boolean = false;
  visualWidth: number = Force.DEFAULT_VISUAL_WIDTH;

  constructor(
    id: string,
    link: RealLink,
    startCoord: Coord,
    endCoord: Coord,
    local: boolean = false,
    arrowOutward: boolean = true,
    mag: number = 1
  ) {
    this._id = id;
    this._link = link;
    this._startCoord = new Coord(startCoord.x, startCoord.y);
    this._endCoord = new Coord(endCoord.x, endCoord.y);
    this._local = local;
    this._stroke = local ? 'blue' : 'black';
    this._fill = local ? 'blue' : 'black';
    this._arrowOutward = true;
    this._mag = this.sanitizeMagnitude(mag);

    // Older URLs could store the arrow at the application point. Normalize those forces so
    // startCoord is always the application point and endCoord always indicates physical direction.
    if (!arrowOutward) {
      this._endCoord = new Coord(
        this._startCoord.x - (this._endCoord.x - this._startCoord.x),
        this._startCoord.y - (this._endCoord.y - this._startCoord.y)
      );
    }
    this._angleRad = this.updateAngle(this.startCoord, this.endCoord);
    this._forceLine = '';
    this._forceArrow = '';
    this.refreshVisuals();
  }

  /** Move the application point without changing force magnitude or direction. */
  moveForceTo(x: number, y: number) {
    this.moveAnchor(new Coord(x, y));
  }

  moveAnchor(coord: Coord) {
    const dx = coord.x - this.startCoord.x;
    const dy = coord.y - this.startCoord.y;
    this.startCoord.x = coord.x;
    this.startCoord.y = coord.y;
    this.endCoord.x += dx;
    this.endCoord.y += dy;
    this.refreshVisuals();
  }

  /** Move the visual direction handle while preserving physical magnitude. */
  moveDirectionHandle(coord: Coord) {
    this.endCoord.x = coord.x;
    this.endCoord.y = coord.y;
    if (this.handleLength() > 0) {
      this._angleRad = this.updateAngle(this.startCoord, this.endCoord);
    }
    this.refreshVisuals();
  }

  setMagnitude(value: number) {
    this._mag = this.sanitizeMagnitude(value);
    this.refreshVisuals();
  }

  setDirectionRadians(value: number) {
    if (!Number.isFinite(value)) return;
    this._angleRad = this.normalizeAngle(value);
    this.alignHandleWithDirection();
    this.refreshVisuals();
  }

  setComponents(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this._mag = Math.hypot(x, y);
    if (this._mag > 0) {
      this._angleRad = Math.atan2(y, x);
      this.alignHandleWithDirection();
    }
    this.refreshVisuals();
  }

  reverseDirection() {
    this.setDirectionRadians(this._angleRad + Math.PI);
  }

  setLocal(value: boolean) {
    this._local = value;
    this._stroke = value ? 'blue' : 'black';
    this._fill = value ? 'blue' : 'black';
    this.refreshVisuals();
  }

  /**
   * Scale force arrows relative to the other forces currently on the mechanism.
   * A lone force keeps the familiar 1 N visual size regardless of its physical magnitude.
   * Multiple forces use a compressed fourth-root scale so their ordering is visible without
   * allowing one large load to make the other arrows disappear.
   */
  static normalizeVisualWidths(forces: Force[]): void {
    if (forces.length === 0) return;
    if (forces.length === 1) {
      forces[0].setVisualWidth(Force.DEFAULT_VISUAL_WIDTH);
      return;
    }

    const positiveMagnitudes = forces
      .map((force) => force.mag)
      .filter((magnitude) => Number.isFinite(magnitude) && magnitude > 0);
    if (positiveMagnitudes.length === 0) {
      forces.forEach((force) => force.setVisualWidth(Force.DEFAULT_VISUAL_WIDTH));
      return;
    }

    // The geometric mean supplies a stable middle size across wide magnitude ranges.
    const referenceMagnitude = Math.exp(
      positiveMagnitudes.reduce((sum, magnitude) => sum + Math.log(magnitude), 0) /
        positiveMagnitudes.length
    );
    forces.forEach((force) => {
      const width =
        force.mag === 0
          ? Force.MIN_VISUAL_WIDTH
          : Force.DEFAULT_VISUAL_WIDTH * Math.pow(force.mag / referenceMagnitude, 0.25);
      force.setVisualWidth(
        Math.min(Force.MAX_VISUAL_WIDTH, Math.max(Force.MIN_VISUAL_WIDTH, width))
      );
    });
  }

  updateAngle(startCoord: Coord, endCoord: Coord) {
    return Math.atan2(endCoord.y - startCoord.y, endCoord.x - startCoord.x);
  }

  updateInternalValues() {
    if (this.handleLength() > 0) {
      this._angleRad = this.updateAngle(this.startCoord, this.endCoord);
    }
    this.refreshVisuals();
  }

  private sanitizeMagnitude(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  private normalizeAngle(value: number): number {
    return Math.atan2(Math.sin(value), Math.cos(value));
  }

  private handleLength(): number {
    return Math.hypot(this.endCoord.x - this.startCoord.x, this.endCoord.y - this.startCoord.y);
  }

  private alignHandleWithDirection() {
    const length = this.handleLength() || 1;
    this.endCoord.x = this.startCoord.x + Math.cos(this._angleRad) * length;
    this.endCoord.y = this.startCoord.y + Math.sin(this._angleRad) * length;
  }

  private refreshVisuals() {
    this._forceLine = this.createForceLine(this.startCoord, this.endCoord);
    this._forceArrow = this.createForceArrow(this.startCoord, this.endCoord);
  }

  private setVisualWidth(width: number): void {
    this.visualWidth = width;
    this.refreshVisuals();
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
    if (startCoord.x === endCoord.x && startCoord.y === endCoord.y) return '';

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
    if (!value) this.reverseDirection();
    this._arrowOutward = true;
  }

  get local(): boolean {
    return this._local;
  }

  set local(value: boolean) {
    this.setLocal(value);
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
    this.setMagnitude(value);
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
    this.setDirectionRadians(value);
  }

  get xComp(): number {
    return this.mag * Math.cos(this.angleRad);
  }

  set xComp(value: number) {
    this.setComponents(value, this.yComp);
  }

  get yComp(): number {
    return this.mag * Math.sin(this.angleRad);
  }

  set yComp(value: number) {
    this.setComponents(this.xComp, value);
  }
}
