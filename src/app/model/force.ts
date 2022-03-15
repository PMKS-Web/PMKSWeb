import {Link} from "./link";

export class Force {
  private _id: string
  private _link: Link;

  constructor(id: string, link: Link) {
    this._id = id;
    this._link = link;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get link(): Link {
    return this._link;
  }

  set link(value: Link) {
    this._link = value;
  }
}
