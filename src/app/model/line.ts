import { Joint, RealJoint } from './joint';
import { Coord } from './coord';
import { arc_arc_intersect, line_arc_intersect, line_line_intersect } from './utils';
import { RealLink } from './link';
import { SettingsService } from '../services/settings.service';
import { center } from 'svg-pan-zoom';

export class Line {
  startPosition: Coord;
  endPosition: Coord;

  private _initialStartPos: Coord;
  private _initialEndPos: Coord;

  isArc: boolean = false;

  public static linkColorIndex: number = 0;
  //For debugging
  //Pick a random color from the list
  color: string = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'lightgrey'][
    Line.linkColorIndex++ % 8
  ];

  parentLink: RealLink | null = null;

  nextClockwiseLine: Line | Arc | null = null;

  constructor(startPosition: Coord, endPosition: Coord) {
    this.startPosition = startPosition;
    this.endPosition = endPosition;
    this._initialStartPos = startPosition;
    this._initialEndPos = endPosition;
  }

  get initialStartPos(): Coord {
    return this._initialStartPos;
  }

  get initialEndPos(): Coord {
    return this._initialEndPos;
  }

  set next(next: Line | Arc) {
    this.nextClockwiseLine = next;
  }

  get next(): Line | Arc {
    return this.nextClockwiseLine!;
  }

  get angle(): number {
    return Math.atan2(
      this.endPosition.y - this.startPosition.y,
      this.endPosition.x - this.startPosition.x
    );
  }

  get length(): number {
    return this.startPosition.getDistanceTo(this.endPosition);
  }

  get normalAngle(): number {
    return this.angle + Math.PI / 2;
  }

  intersectsWith(line: Line | Arc): Coord | undefined {
    if (line instanceof Arc) {
      //I'm a line and the other line is an arc
      let arc = line;
      return line_arc_intersect(
        this.startPosition,
        this.endPosition,
        arc.startPosition,
        arc.endPosition,
        arc.center,
        arc.startPosition.getDistanceTo(arc.center),
        this.startPosition
      );
    } else {
      //I'm a line and the other line is a line
      return line_line_intersect(
        line.startPosition,
        line.endPosition,
        this.startPosition,
        this.endPosition
      );
    }
  }

  toPathString() {
    return `L ${this.endPosition.x} ${this.endPosition.y} `;
  }

  resetInitialPosition() {
    this._initialStartPos = this.startPosition;
    this._initialEndPos = this.endPosition;
  }

  splitAt(coord: Coord): Line | undefined {
    if (this.startPosition.equals(coord) || this.endPosition.equals(coord)) {
      // console.log('Cannot split at start or end position', coord, this);
      return;
    } else {
      let newLine = new Line(coord, this.endPosition);
      newLine.next = this.next;
      newLine.parentLink = this.parentLink;
      newLine.color = this.color;

      this.endPosition = coord;
      this.next = newLine;

      return newLine;
    }
  }

  equals(line: Line): boolean {
    return (
      this.startPosition.equals(line.startPosition) &&
      this.endPosition.equals(line.endPosition) &&
      this.isArc == line.isArc
    );
  }

  clone() {
    let line = new Line(this.startPosition.clone(), this.endPosition.clone());
    line.next = this.next;
    line.parentLink = this.parentLink;
    line.color = this.color;
    return line;
  }

  reverse() {
    let temp = this.startPosition;
    this.startPosition = this.endPosition;
    this.endPosition = temp;
    return this;
  }

  shorten(shortenBy: number) {
    const shortenByVector = new Coord(Math.cos(this.angle), Math.sin(this.angle)).scale(
      shortenBy / 2
    );
    this.startPosition = this.startPosition.add(shortenByVector);
    this.endPosition = this.endPosition.subtract(shortenByVector);
    return this;
  }
}

export class Arc extends Line {
  //Given the start and end positions and the center and assuming the arc moves counter-clockwise from the start to the end
  center: Coord | Joint;

  constructor(startPosition: Coord, endPosition: Coord, center: Coord | Joint) {
    super(startPosition, endPosition);
    this.isArc = true;
    this.center = center;
  }

  override intersectsWith(line: Line | Arc): Coord | undefined {
    if (line instanceof Arc) {
      //I'm an arc and the other line is an arc
      let arc = line;
      return arc_arc_intersect(
        this.startPosition,
        this.endPosition,
        this.center,
        arc.startPosition,
        arc.endPosition,
        arc.center,
        arc.startPosition.getDistanceTo(arc.center)
      );
    } else {
      //I'm an arc and the other line is a line
      return line_arc_intersect(
        line.startPosition,
        line.endPosition,
        this.startPosition,
        this.endPosition,
        this.center,
        this.startPosition.getDistanceTo(this.center),
        this.startPosition
      );
    }
  }

  override clone() {
    let arc = new Arc(this.startPosition.clone(), this.endPosition.clone(), this.center.clone());
    arc.next = this.next;
    arc.parentLink = this.parentLink;
    arc.color = this.color;
    return arc;
  }

  override toPathString() {
    return `A ${this.startPosition.getDistanceTo(this.center)} ${this.startPosition.getDistanceTo(
      this.center
    )} 0 0 1 ${this.endPosition.x} ${this.endPosition.y} `;
  }

  override splitAt(coord: Coord): Line | undefined {
    if (this.startPosition.equals(coord) || this.endPosition.equals(coord)) {
      // console.log('Cannot split at start or end position', coord, this);
      return;
    } else {
      let newArc = new Arc(coord, this.endPosition, this.center);
      newArc.next = this.next;
      newArc.parentLink = this.parentLink;
      newArc.color = this.color;

      this.endPosition = coord;
      this.next = newArc;

      return newArc;
    }
  }

  override shorten(arcLength: number) {
    //Move the start position along the circle towards the end position to shorten the arc
    //Same for the end position
    //First find the radius of the circle
    let radius = this.startPosition.getDistanceTo(this.center);
    //Then find the angle we need to move along the circle
    let angleToShortenBy = arcLength / radius;
    angleToShortenBy /= 2;

    //Then find the angle of the start position
    let startAngle = this.startPosition.getAngleTo(this.center);
    let endAngle = this.endPosition.getAngleTo(this.center);

    startAngle += angleToShortenBy;
    endAngle -= angleToShortenBy;

    this.startPosition = this.center.add(
      new Coord(Math.cos(startAngle), Math.sin(startAngle)).scale(radius)
    );
    this.endPosition = this.center.add(
      new Coord(Math.cos(endAngle), Math.sin(endAngle)).scale(radius)
    );

    return this;
  }
}
