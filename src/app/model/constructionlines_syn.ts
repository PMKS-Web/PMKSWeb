// A class to represent Construction lines
//will contain x1,y1, x2,y2 of construction lines
import { Coord } from './coord';

export class ConstrucLines {
    
    private _coord1: Coord;
    private _coord2: Coord;

    constructor(coord1: Coord, coord2: Coord) {
       
        this._coord1 = coord1;
        this._coord2 = coord2;
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

}
