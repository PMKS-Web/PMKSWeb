import {AppConstants} from "./app-constants";
import {Link} from "./link";
import {Coord} from "./coord";

export class Joint  extends Coord {
  private _id: string;
  private _showHighlight: boolean = false;

  constructor(id: string, x: number, y: number) {
    super(x, y);
    this._id = id;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get showHighlight(): boolean {
    return this._showHighlight;
  }

  set showHighlight(value: boolean) {
    this._showHighlight = value;
  }
}

export class RealJoint extends Joint {
  // TODO: Does the r only need to be on RevJoints?
  private _r: number = 5 * AppConstants.scaleFactor; //This seems like the SVG scale factor
  private _input: boolean;
  private _ground: boolean;
  private _links: Link[];
  private _connectedJoints: Joint[];
  constructor(id: string, x: number, y: number, input: boolean = false, ground: boolean = false, links: Link[] = [],
              connectedJoints: Joint[] = []) {
    super(id, x, y);
    this._input = input;
    this._ground = ground;
    this._links = links;
    this._connectedJoints = connectedJoints;
  }

  //R is radius of the joint
  get r(): number {
    return this._r;
  }

  set r(value: number) {
    this._r = value;
  }

  get ground(): boolean {
    return this._ground;
  }

  set ground(value: boolean) {
    this._ground = value;
  }

  get links(): Link[] {
    return this._links;
  }

  set links(value: Link[]) {
    this._links = value;
  }

  get connectedJoints(): Joint[] {
    return this._connectedJoints;
  }

  set connectedJoints(value: Joint[]) {
    this._connectedJoints = value;
  }

  get input(): boolean {
    return this._input;
  }

  set input(value: boolean) {
    this._input = value;
  }
}

// TODO: Verify this but I don't believe there is an ImagJoint...
// export class ImagJoint extends Joint {
//
//   constructor(id: string, x: number, y: number) {
//     super(id, x, y);
//   }
// }

export class RevJoint extends RealJoint {
  constructor(id: string, x: number, y: number, input: boolean = false, ground: boolean = false, links: Link[] = [],
              connectedJoints: Joint[] = []) {
    super(id, x, y, input, ground, links, connectedJoints);
  }
}

export class PrisJoint extends RealJoint {
  private _angle: number = 0;

  constructor(id: string, x: number, y: number, input: boolean = false, ground: boolean = false, links: Link[] = [],
              connectedJoints: Joint[] = []) {
    super(id, x, y, input, ground, links, connectedJoints);
  }

  get angle(): number {
    return this._angle;
  }

  set angle(value: number) {
    this._angle = value;
  }
}
