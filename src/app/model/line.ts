import { Joint, RealJoint } from './joint';
import { Coord } from './coord';
import { determineSlope } from './utils';
import { RealLink } from './link';

export class Line {
  id: string;
  // Note: startJoint and endJoint are not the same as startPosition and endPosition
  // startJoint and endJoint are the joints that the line is associated with
  // startPosition and endPosition are the coordinates of the line which is offset from the joints
  // there are two lines associated with each combination of joints
  startJoint: Joint;
  endJoint: Joint;
  startPosition: Coord;
  endPosition: Coord;

  constructor(id: string, startJoint: Joint, endJoint: Joint) {
    this.id = id;
    this.startJoint = startJoint;
    this.endJoint = endJoint;

    const normalAngle = this.findNormalAngle(startJoint, endJoint);

    this.startPosition = new Coord(
      2 * Math.cos(normalAngle) + this.startJoint.x,
      2 * Math.sin(normalAngle) + this.startJoint.y
    );
    this.endPosition = new Coord(
      2 * Math.cos(normalAngle) + this.endJoint.x,
      2 * Math.sin(normalAngle) + this.endJoint.y
    );
  }

  findNormalAngle(coord1: Joint, coord2: Joint): number {
    const m = determineSlope(coord1.x, coord1.y, coord2.x, coord2.y);
    // find normal slope of given slope
    let normal_m: number;
    if (m === 0) {
      normal_m = Infinity;
    } else {
      normal_m = -1 / m;
    }

    return Math.atan(normal_m); // in degrees?
  }
}
