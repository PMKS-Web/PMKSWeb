export class InstantCenter {
  private _x: number;
  private _y: number;
  private _id: string;
  private _connectedICs: Array<InstantCenter> = new Array<InstantCenter>();
  constructor(x: number, y: number, id: string, connectedICS: Array<InstantCenter>) {
    this._x = x;
    this._y = y;
    this._id = id;
    this._connectedICs = connectedICS;
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

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get connectedICs(): Array<InstantCenter> {
    return this._connectedICs;
  }

  set connectedICs(value: Array<InstantCenter>) {
    this._connectedICs = value;
  }
}

export class PrimaryInstantCenter extends InstantCenter {
  private _jointID: string;
  constructor(x: number, y: number, id: string, connectedICS: Array<InstantCenter>, jointID: string) {
    super(x, y, id, connectedICS);
    this._jointID = jointID;
  }

  get jointID(): string {
    return this._jointID;
  }

  set jointID(value: string) {
    this._jointID = value;
  }
}

export class FixedInstantCenter extends PrimaryInstantCenter {
  private _angle: number;
  constructor(x: number, y: number, id: string, connectedICS: Array<InstantCenter>, jointID: string, angle: number = 0) {
    super(x, y, id, connectedICS, jointID);
    this._angle = angle;
  }

  get angle(): number {
    return this._angle;
  }

  set angle(value: number) {
    this._angle = value;
  }
}

export class PermanentInstantCenter extends PrimaryInstantCenter {
  constructor(x: number, y: number, id: string, connectedICS: Array<InstantCenter>, jointID: string) {
    super(x, y, id, connectedICS, jointID);
  }
}

// secondaryICs can only be neither fixed nor permanent instant centers
export class SecondaryInstantCenter extends InstantCenter {
  private _desired_ICs: string[][];
  constructor(x: number, y: number, id: string, connectedICS: Array<InstantCenter>, desiredICS: Array<Array<string>>) {
    super(x, y, id, connectedICS);
    this._desired_ICs = desiredICS;
  }

  get desired_ICs(): string[][] {
    return this._desired_ICs;
  }

  set desired_ICs(value: string[][]) {
    this._desired_ICs = value;
  }
}
