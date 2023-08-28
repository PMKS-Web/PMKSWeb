// A class to represent Pose
//will contain x1,y1, x2,y2, angle and length
import { Coord } from './coord';

export class Pose{
  private _length: number;
    private _angle: number;
    private _coord1: Coord;
    private _coord2: Coord;
    private _midpoint: Coord;

  constructor(length: number, angle: number, coord1: Coord, coord2: Coord,midpoint: Coord) {
    this._length = length;
      this._angle = angle;
      this._coord1 = coord1;
      this._coord2 = coord2;
      this._midpoint = midpoint;
  }

  get length(): number {
    return this._length;
  }

  set length(value: number) {
    this._length = value;
  }

  get angle(): number {
    return this._angle;
  }

  set angle(value: number) {
    this._angle = value;
    }

    get coord1(): Coord {
        return this._coord1;
    }

    set coord1(value: Coord) {
        this._coord1 = value;
    }
    get coord2(): Coord {
        return this._coord2;
    }

    set coord2(value: Coord) {
        this._coord2 = value;
    }

    get midpoint(): Coord {
        return this._midpoint;
    }

    set midpoint(value: Coord) {
        this._midpoint = value;
    }

}
