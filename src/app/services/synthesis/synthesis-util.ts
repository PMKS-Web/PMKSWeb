import { Coord } from "src/app/model/coord"

// storing state for a pose
export class SynthesisPose {

    // cached values for graphical display
    private _posA: Coord;
    private _posB: Coord;


    constructor(
        public id: number,
        private _position: Coord,
        private _thetaRadians: number,
        private getLength: () => number
    ) {
        // dummy values to be overwritten by recompute
        this._posA = new Coord(0, 0);
        this._posB = new Coord(0, 0);

        this.recompute();
    }

    get position(): Coord {
        return this._position;
    }

    get thetaDegrees(): number {
        return this._thetaRadians * 180 / Math.PI;
    }

    get thetaRadians(): number {
        return this._thetaRadians;
    }

    get posA(): Coord {
        return this._posA;
    }

    get posB(): Coord {
        return this._posB;
    }

    set position(position: Coord) {
        this._position = position;
        this.recompute();
    }

    set thetaDegrees(thetaDegrees: number) {
        this._thetaRadians = thetaDegrees * Math.PI / 180;
        this.recompute();
    }

    // recompute cached data like endpoint positions
    recompute() {

        let halfLength = this.getLength() / 2;

        let dx = Math.cos(this.thetaRadians) * halfLength;
        let dy = Math.sin(this.thetaRadians) * halfLength;

        this._posA = new Coord(this.position.x - dx, this.position.y - dy);
        this._posB = new Coord(this.position.x + dx, this.position.y + dy);

    }

}

// cached graphics data for a pose to be displayed as an SVG
export class PoseGraphicsData {
    
        constructor(
            public pose: SynthesisPose,
            public pointA: Coord,
            public pointB: Coord) {
        }
}