import { Joint } from './joint';
import { Coord } from './coord';

export class Line {
  id: string;
  startJoint: Joint;
  endJoint: Joint;
  startPosition: Coord;
  endPosition: Coord;

  constructor(
    id: string,
    startJoint: Joint,
    endJoint: Joint,
    startPosition: Coord,
    endPosition: Coord
  ) {
    this.id = id;
    this.startJoint = startJoint;
    this.endJoint = endJoint;
    this.startPosition = startPosition;
    this.endPosition = endPosition;
  }

}
