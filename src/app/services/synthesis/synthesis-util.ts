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
        const dx = x2 - x1;
        const dy = y2 - y1;
      
        // calculate angle between the two points
        const theta = Math.atan2(dy, dx);
      
        // calculate points for the rectangle
        const p1x = x1 - r * Math.sin(theta);
        const p1y = y1 + r * Math.cos(theta);
        const p2x = x2 - r * Math.sin(theta);
        const p2y = y2 + r * Math.cos(theta);
        const p3x = x2 + r * Math.sin(theta);
        const p3y = y2 - r * Math.cos(theta);
        const p4x = x1 + r * Math.sin(theta);
        const p4y = y1 - r * Math.cos(theta);
      
        // draw the path
        return `
          M ${p1x} ${p1y}
          A ${r} ${r} 0 1 1 ${p4x} ${p4y}
          L ${p3x} ${p3y}
          A ${r} ${r} 0 1 1 ${p2x} ${p2y}
          Z
        `;
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