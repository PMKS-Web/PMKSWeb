import {Joint} from "./joint";
import {Coord} from "./coord";
import {AppConstants} from "./app-constants";
import {Force} from "./force";

export enum Shape {
  line = 'line',
  bar = 'bar',
  eTriangle = 'eTriangle',
  rTriangle = 'rTriangle',
  rectangle = 'rectangle',
  square = 'square',
  circle = 'circle',
  cShape = 'cShape',
  tShape = 'tShape',
  lShape = 'lShape',
  horizontalLine = 'horizontalLine',
  verticalLine = 'verticalLine',
  slantedLineForward = 'slantedLineForward',
  slantedLineBackward = 'slantedLineBackward',
  beanShape = 'beanShape',
  infinityShape = 'infinityShape',
  eightShape = 'eightShape',
  customShape = 'customShape'
}

export interface Bound {
  b1: Coord;
  b2: Coord;
  b3: Coord;
  b4: Coord;
  arrow: Coord;
}

export enum editorID {
  b1 = 'b1',
  b2 = 'b2',
  b3 = 'b3',
  b4 = 'b4',
  arrow = 'arrow'
}

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

export class RealLink extends Link {
  private _fill: string;
  private _shape: Shape;
  private _bound: Bound;
  private _d: string
  private _forces: Force[] = [];
  private _mass: number = 1;
  private _massMoI: number = 1;
  private _CoMX: number;
  private _CoMY: number;
  private _CoM_d1: string = '';
  private _CoM_d2: string = '';
  private _CoM_d3: string = '';
  private _CoM_d4: string = '';

  constructor(id: string, joints: Joint[]) {
    super(id, joints);
    this._shape = Shape.line;
    this._fill = '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6);
    this._bound = RealLink.getBounds(new Coord(joints[0].x, joints[0].y), new Coord(joints[1].x, joints[1].y), Shape.line);
    this._d = RealLink.getPointsFromBounds(this._bound, this._shape);
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this._CoMX = RealLink.determineCenterOfMass(joints, 'x');
    this._CoMY = RealLink.determineCenterOfMass(joints, 'y');
    this.updateCoMDs();
  }

  static getBounds(coord1: Coord, coord2: Coord, shape: Shape) {
    switch (shape) {
      case Shape.line: {
        const x1 = coord1.x;
        const y1 = coord1.y;
        const x2 = coord2.x;
        const y2 = coord2.y;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const rotation = Math.atan2(dy, dx);

        const dist = Math.sqrt(dx * dx + dy * dy);
        const xChange = Math.cos(rotation) * dist;

        return {
          b1: new Coord(x1 + xChange, y1),
          b2: new Coord(x1, y1),
          b3: new Coord(x2 - xChange, y2),
          b4: new Coord(x2, y2),
          arrow: new Coord(0, 0)
        };
      }
      default: {
        return {
          b1: new Coord(0, 0),
          b2: new Coord(0, 0),
          b3: new Coord(0, 0),
          b4: new Coord(0, 0),
          arrow: new Coord(0, 0)
        };
      }
    }
  }

  static getPointsFromBounds(bound: Bound, shape: Shape) {
    let points: Coord[];
    switch (shape) {
      case Shape.line: {
        const x1 = bound.b4.x;
        const y1 = bound.b4.y;
        const x2 = bound.b2.x;
        const y2 = bound.b2.y;
        // TODO: Change the 5 to be jointRadius for either link or grid
        const width = 5 * 2 * AppConstants.scaleFactor;
        // Find angle of rotation for link
        const dx = x2 - x1;
        const dy = y2 - y1;
        const rotation = Math.atan2(dy, dx);

        // Use angle of rotation to calculate endpoint locations
        const xChange = Math.sin(rotation) * width;
        const yChange = Math.cos(rotation) * width;

        // Create endpoints of SVG's
        const p1 = new Coord(x1 - xChange - yChange, y1 + yChange - xChange);
        const p2 = new Coord(x1 + xChange - yChange, y1 - yChange - xChange);
        const p3 = new Coord(x2 + xChange + yChange, y2 - yChange + xChange);
        const p4 = new Coord(x2 - xChange + yChange, y2 + yChange + xChange);
        points = [p1, p2, p3, p4];
        break;
        // return [p1, p2, p3, p4];
      }
      default: {
        return '';
      }
    }
    // TODO: Have logic for determining a lot of this stored somewhere to be used for determining mass and mass moment of inertia
    // TODO: Change the logic for r when you get to this point
    const r = 5 * 2 * AppConstants.scaleFactor;
    let pathString = '';

    // array of angles of next point relative to current point
    const rotationArray = [];
    // array of angles of current point in radians
    const angleArray = [];

    // pre-process, fill the arrays
    for (let i = 0; i < points.length; i++) {
      let npHolder: Coord, lpHolder: Coord;
      npHolder = (i + 1) < points.length ? points[i + 1] : points[0];
      lpHolder = (i - 1) >= 0 ? points[i - 1] : points[points.length - 1];
      // last point
      const lp = lpHolder;
      // current point
      const cp = points[i];
      // next point
      const np = npHolder;

      const lastDx = cp.x - lp.x;
      const lastDy = cp.y - lp.y;
      const lastRot = Math.atan2(lastDy, lastDx);

      const nextDx = np.x - cp.x;
      const nextDy = np.y - cp.y;
      const nextRot = Math.atan2(nextDy, nextDx);
      const angle = Math.PI - (lastRot - nextRot);
      angleArray.push(angle);
      rotationArray.push(nextRot);
    }

    for (let i = 0; i < points.length; i++) {
      // current point
      const cp = points[i];
      // current angle
      const ca = angleArray[i];
      // next rotation
      const nr = rotationArray[i];
      // last point, last angle, last rotation
      let lp: Coord, la: number, lr: number;
      if (i - 1 >= 0) {
        lp = points[i - 1];
        la = angleArray[i - 1];
        lr = rotationArray[i - 1];
      } else {
        lp = points[points.length - 1];
        la = angleArray[points.length - 1];
        lr = rotationArray[points.length - 1];
      }

      // path for each point should be like: start (last point curve end point) -> mid (current point curve start point) ->
      // curve -> end (current point curve end point)

      // this offset indicates the distance from last point where the line can begin
      // (can't begin at last point cuz we have rounded corner)
      // offset = right-angle distance to the center-line of last angle is r
      const lastOffset = Math.abs(r / Math.tan(la / 2));

      const lastXC = Math.cos(lr) * lastOffset;
      const lastYC = Math.sin(lr) * lastOffset;
      // apply the offset
      const startX = lp.x + lastXC;
      const startY = lp.y + lastYC;

      // same as above, except for current point
      // (must end before current point to draw rounded corner)
      const nextOffset = Math.abs(r / Math.tan(ca / 2));
      const midXC = Math.cos(lr) * nextOffset;
      const midYC = Math.sin(lr) * nextOffset;

      // mid is the point where the curve of the current point starts
      const midX = cp.x - midXC;
      const midY = cp.y - midYC;

      // construct the path from start to mid
      pathString += (i === 0) ? `M ${startX} ${startY} L ${midX} ${midY} ` : `L ${startX} ${startY} L ${midX} ${midY} `;
      // if (i === 0) {
      //   pathString += `M ${startX} ${startY} L ${midX} ${midY} `;
      // } else {
      //   pathString += `L ${startX} ${startY} L ${midX} ${midY} `;
      // }

      // the offset distance should be the same for the other half of the curve
      // just the rotation is now relative to the next point
      const nextXC = Math.cos(nr) * nextOffset;
      const nextYC = Math.sin(nr) * nextOffset;

      // end is the coord where the curve of the current point ends
      const endX = cp.x + nextXC;
      const endY = cp.y + nextYC;

      // construct the mid curve
      // the control points for bezier curves are simply pointed
      // towards the corner, but stops at 0.55x the distance
      // 0.55 is the percentage to create a perfect circle
      // TODO: 0.55 is only good for constructing circle with 4 points, not optimal for triangles, etc
      const cp1x1 = Math.cos(lr) * r;
      const cp1y1 = Math.sin(lr) * r;
      const cp1x2 = midXC * 0.551915;
      const cp1y2 = midYC * 0.551915;

      const cp2x1 = Math.cos(nr) * r;
      const cp2y1 = Math.sin(nr) * r;
      const cp2x2 = nextXC * 0.551915;
      const cp2y2 = nextYC * 0.551915;

      // find the shorter control line
      pathString += (Math.sqrt(cp1x1 * cp1x1 + cp1y1 * cp1y1) < Math.sqrt(cp1x2 * cp1x2 + cp1y2 * cp1y2)) ?
        pathString += `C ${cp.x - midXC + cp1x1} ${cp.y - midYC + cp1y1} ${cp.x + nextXC - cp2x1} ${cp.y + nextYC - cp2y1} ` :
        `C ${cp.x - midXC + cp1x2} ${cp.y - midYC + cp1y2} ${cp.x + nextXC - cp2x2} ${cp.y + nextYC - cp2y2} `;
      // if (Math.sqrt(cp1x1 * cp1x1 + cp1y1 * cp1y1) < Math.sqrt(cp1x2 * cp1x2 + cp1y2 * cp1y2)) {
      //   pathString += `C ${cp.x - midXC + cp1x1} ${cp.y - midYC + cp1y1} ${cp.x + nextXC - cp2x1} ${cp.y + nextYC - cp2y1} `;
      // } else {
      //   pathString += `C ${cp.x - midXC + cp1x2} ${cp.y - midYC + cp1y2} ${cp.x + nextXC - cp2x2} ${cp.y + nextYC - cp2y2} `;
      // }
      pathString += `${endX} ${endY} `;
    }

    pathString += `Z`;
    return pathString;
  }

  static determineCenterOfMass(joints: Joint[], xOrY: string) {
    let com = 0;
    joints.forEach(j => {
      if (xOrY === 'x') {
        com += j.x;
      } else {
        com += j.y;
      }
    });
    return com / joints.length;
  }

  get shape(): Shape {
    return this._shape;
  }

  set shape(value: Shape) {
    this._shape = value;
  }

  get bound(): Bound {
    return this._bound;
  }

  set bound(value: Bound) {
    this._bound = value;
  }

  get d(): string {
    return this._d;
  }

  set d(value: string) {
    this._d = value;
  }

  get fill(): string {
    return this._fill;
  }

  set fill(value: string) {
    this._fill = value;
  }

  get forces(): Force[] {
    return this._forces;
  }

  set forces(value: Force[]) {
    this._forces = value;
  }

  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    this._mass = value;
  }

  get massMoI(): number {
    return this._massMoI;
  }

  set massMoI(value: number) {
    this._massMoI = value;
  }

  get CoMX(): number {
    return this._CoMX;
  }

  set CoMX(value: number) {
    this._CoMX = value;
  }

  get CoMY(): number {
    return this._CoMY;
  }

  set CoMY(value: number) {
    this._CoMY = value;
  }

  get CoM_d1(): string {
    return this._CoM_d1;
  }

  set CoM_d1(value: string) {
    this._CoM_d1 = value;
  }

  get CoM_d2(): string {
    return this._CoM_d2;
  }

  set CoM_d2(value: string) {
    this._CoM_d2 = value;
  }

  get CoM_d3(): string {
    return this._CoM_d3;
  }

  set CoM_d3(value: string) {
    this._CoM_d3 = value;
  }

  get CoM_d4(): string {
    return this._CoM_d4;
  }

  set CoM_d4(value: string) {
    this._CoM_d4 = value;
  }

  updateCoMDs() {
    this._CoM_d1 = 'M' + this.CoMX + ' ' + this.CoMY + ' ' + (this.CoMX - 0.25) + ' ' + this.CoMY + ' ' +
      'A0.25 0.25 0 0 0 ' + this.CoMX + ' ' + (this.CoMY + 0.25);
    this._CoM_d2 = 'M' + this.CoMX + ' ' + this.CoMY + ' ' + this.CoMX + ' ' + (this.CoMY + 0.25) + ' ' +
      'A0.25 0.25 0 0 0 ' + (this.CoMX + 0.25) + ' ' +  this.CoMY;
    this._CoM_d3 = 'M' + this.CoMX + ' ' + this.CoMY + ' ' + (this.CoMX + 0.25)  + ' ' + this.CoMY + ' ' +
      'A0.25 0.25 0 0 0 ' + this.CoMX + ' ' + (this.CoMY - 0.25);
    this._CoM_d4 = 'M' + this.CoMX + ' ' + this.CoMY + ' ' + this.CoMX + ' ' + (this.CoMY - 0.25) + ' ' +
      'A0.25 0.25 0 0 0 ' + (this.CoMX - 0.25)  + ' ' +  this.CoMY;
  }

}

export class ImagLink extends Link {
  constructor(id: string, joints: Joint[]) {
    super(id, joints);
  }
}
