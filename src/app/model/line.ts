import { Joint, RealJoint } from './joint';
import { Coord } from './coord';
import {
  arc_arc_intersect,
  determineSlope,
  line_arc_intersect,
  line_line_intersect,
} from './utils';
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
  previousClockwiseLine: Line | Arc | null = null;

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

  set prev(previous: Line | Arc) {
    this.previousClockwiseLine = previous;
  }

  get prev(): Line | Arc {
    return this.previousClockwiseLine!;
  }

  get angle(): number {
    return Math.atan2(
      this.endPosition.y - this.startPosition.y,
      this.endPosition.x - this.startPosition.x
    );
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
}

export class Arc extends Line {
  //Given the start and end positions and the center and assuming the arc moves counter-clockwise from the start to the end
  center: Coord | Joint;
  static radius: number = SettingsService.objectScale.value / 4;

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

  override toPathString() {
    return `A ${this.startPosition.getDistanceTo(this.center)} ${this.startPosition.getDistanceTo(
      this.center
    )} 0 0 1 ${this.endPosition.x} ${this.endPosition.y} `;
  }
}
