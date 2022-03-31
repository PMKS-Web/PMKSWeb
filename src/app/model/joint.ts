import {AppConstants} from "./app-constants";
import {Link} from "./link";

export class Joint {
  private _id: string;
  private _x: number;
  private _y: number;
  private _r: number;
  private _input: boolean;
  private _ground: boolean;
  private _links: Link[];
  private _connectedJoints: Joint[];

  constructor(id: string, x: number, y: number, input: boolean = false, ground: boolean = false, links: Link[] = [],
              connectedJoints: Joint[] = []) {
    this._id = id;
    this._x = x;
    this._y = y;
    this._r = 5 * AppConstants.scaleFactor;
    this._input = input;
    this._ground = ground;
    this._links = links;
    this._connectedJoints = connectedJoints;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get x(): number {
    return this._x;
  }

  set x(value: number) {
    this._x = value;
  }

  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
  }

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

export class RevJoint extends Joint {
  constructor(id: string, x: number, y: number, input: boolean = false, ground: boolean = false, links: Link[] = [],
              connectedJoints: Joint[] = []) {
    super(id, x, y, input, ground, links, connectedJoints);
  }
}

export class PrisJoint extends Joint {
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

export class ImagJoint extends Joint {
  constructor(id: string, x: number, y: number, input: boolean = false, ground: boolean = false, links: Link[] = [],
              connectedJoints: Joint[] = []) {
    super(id, x, y, input, ground, links, connectedJoints);
  }
}
