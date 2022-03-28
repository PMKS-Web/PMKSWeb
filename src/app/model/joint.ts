import {AppConstants} from "./app-constants";
import {Link} from "./link";

export class Joint {
  private _id: string;
  private _x: number;
  private _y: number;
  private _r: number;
  private _type: string = 'R';
  private _ground: boolean = false;
  private _links: Link[] = [];
  private _connectedJoints: Joint[] = [];
  private _angle: number = 0;
  // TODO: Similar to Instant centers, have Joint, then Revolute Joints and Prismatic Joint class rather than having
  // TODO: type since rev should not have angle property

  constructor(id: string, x: number, y: number) {
    this._id = id;
    this._x = x;
    this._y = y;
    this._r = 5 * AppConstants.scaleFactor;
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

  get type(): string {
    return this._type;
  }

  set type(value: string) {
    this._type = value;
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

  get angle(): number {
    return this._angle;
  }

  set angle(value: number) {
    this._angle = value;
  }
}
