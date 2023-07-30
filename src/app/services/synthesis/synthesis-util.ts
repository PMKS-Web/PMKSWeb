import { Coord } from "src/app/model/coord"
import { SynthesisConstants } from "./synthesis-constants";

// storing state for a pose
export class SynthesisPose {

    // cached values for graphical display
    private _posA: Coord;
    private _posB: Coord;

    // string for SVG link
    private _pathString: string = "";

    public showHighlight: boolean = false;
    private sConstants = new SynthesisConstants();


    constructor(
        public id: number,
        private _position: Coord,
        private _thetaRadians: number,
        private getLength: () => number
    ) {
        // dummy values to be overwritten by recompute
        this._posA = new Coord(0, 0);
        this._posB = new Coord(0, 0);

        this._thetaRadians %= Math.PI * 2;

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

    get pathString(): string {
        return this._pathString;
    }

    set position(position: Coord) {
        console.log("setting position", position.x, position.y);
        this._position = position;
        this.recompute();
    }

    set thetaDegrees(thetaDegrees: number) {
        thetaDegrees %= 360;
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

        this._pathString = this._createPath(this.posA.x, this.posA.y, this.posB.x, this.posB.y, this.sConstants.LINK_CIRCLE_RADIUS);

    }

    // generate SVG path for a link given two points and a radius
    private _createPath(x1: number, y1: number, x2: number, y2: number, r: number): string {
        // The path will start at the top of the first circle
        let d = `M ${x1},${y1-r} `;
    
        // Draw arc (half of first circle)
        d += `A ${r},${r} 0 1,0 ${x1},${y1+r} `;
    
        // Draw line to second circle
        d += `L ${x2},${y2+r} `;
    
        // Draw arc (half of second circle)
        d += `A ${r},${r} 0 1,0 ${x2},${y2-r} `;
    
        // Draw line back to first circle
        d += `L ${x1},${y1-r} `;
    
        return d;
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