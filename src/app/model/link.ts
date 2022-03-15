import {Joint} from "./joint";

export class Link {
  private _id: string;
  private _joints: Joint[];

  constructor(id: string, joints: Joint[]) {
    this._id = id;
    this._joints = joints;
  }
  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get joints(): Joint[] {
    return this._joints;
  }

  set joints(value: Joint[]) {
    this._joints = value;
  }
}
