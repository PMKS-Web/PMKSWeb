import {Joint, RealJoint} from './joint';
import { Coord } from './coord';
import { AppConstants } from './app-constants';
import { Force } from './force';
import {
  degToRad, determineSlope, determineYIntersect, find_slope, find_y_intercept, findBiggestAngle,
  getAngle,
  getDistance, getPosition,
  getXDistance,
  getYDistance, insertStringWithinString, line_intersect, pullStringWithinString,
  radToDeg,
  roundNumber,
} from './utils';

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
  customShape = 'customShape',
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
  arrow = 'arrow',
}

export class Link {
  private _id: string;
  private _mass: number;
  private _joints: Joint[];
  private _forces: Force[] = [];
  fixedLocations = [{ id: 'com', label: 'com' }];
  fixedLocation = {
    fixedPoint: 'com',
  };

  constructor(id: string, joints: Joint[], mass?: number) {
    this._id = id;
    this._joints = joints;
    this._mass = mass !== undefined ? mass : 1;
    joints.forEach((j) => {
      this.fixedLocations.push({ id: j.id, label: j.id });
    });
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    this._mass = value;
  }

  get joints(): Joint[] {
    return this._joints;
  }

  set joints(value: Joint[]) {
    this._joints = value;
  }

  get forces(): Force[] {
    return this._forces;
  }

  set forces(value: Force[]) {
    this._forces = value;
  }
}

export class RealLink extends Link {
  private _fill: string; //The fill color
  // private _shape: Shape; //Shape is the shape of the link
  // private _bound: Bound; //The rectengualr area the link is encompassed by
  private _d: string; //SVG path
  // private _mass: number;
  private _massMoI: number; //The value passed in from the linakge table
  private _CoM: Coord; //Same passed in from the linkage table
  private _CoM_d1: string = ''; //
  private _CoM_d2: string = '';
  private _CoM_d3: string = '';
  private _CoM_d4: string = '';

  private _length: number = 0;
  private _angle: number = 0;

  // TODO: Have an optional argument of forces
  constructor(
    id: string,
    joints: Joint[],
    mass?: number,
    massMoI?: number,
    shape?: Shape,
    bound?: Bound,
    CoM?: Coord
  ) {
    super(id, joints, mass);
    // this._mass = mass !== undefined ? mass : 1;
    this._massMoI = massMoI !== undefined ? massMoI : 1;
    // this._shape = shape !== undefined ? shape : Shape.line;
    this._fill = '#' + (0x1000000 + Math.random() * 0xffffff).toString(16).substr(1, 6);
    // this._bound =
    //   bound !== undefined
    //     ? bound
    //     : RealLink.getBounds(
    //         new Coord(joints[0].x, joints[0].y),
    //         new Coord(joints[1].x, joints[1].y),
    //         Shape.line
    //       );
    // this._d = RealLink.getPointsFromBounds(this._bound, this._shape);
    this._d = RealLink.getD(this.joints);
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  updateLengthAndAngle() {
    this._length = getDistance(this.joints[0], this.joints[1]);
    this._angle = getAngle(this.joints[0], this.joints[1]);
    // console.warn(this._length, this._angle);
  }

  static getBounds(coord1: Coord, coord2: Coord, shape: Shape) {
    let bound: Bound = new (class implements Bound {
      arrow: Coord = new Coord(0, 0);
      b1: Coord = new Coord(coord1.x, coord1.y);
      b2: Coord = new Coord(coord2.x, coord2.y);
      b3: Coord = new Coord(coord2.x, coord2.y);
      b4: Coord = new Coord(coord1.x, coord1.y);
    })();

    const coordDist = getDistance(coord1, coord2);
    const coordAng = getAngle(coord1, coord2);

    if (shape === Shape.line) {
      const xChange = Math.cos(coordAng) * coordDist;
      bound.b1.x += xChange;
      bound.b3.x -= xChange;
      return bound;
    }

    // Adjust p3 and p4 for certain conditions
    function determineRectPoint(ratio: number, p3: Coord, p4: Coord): [p3: Coord, p4: Coord] {
      const distBound = ratio * coordDist; // Math.cos(Math.PI / 6) * dist;
      const xChangeBound = Math.sin(coordAng) * distBound;
      const yChangeBound = Math.cos(coordAng) * distBound;

      p3.x += xChangeBound;
      p3.y -= yChangeBound;
      p4.x += xChangeBound;
      p4.y -= yChangeBound;
      return [p3, p4];
    }
    switch (shape) {
      case Shape.eTriangle: {
        [bound.b3, bound.b4] = determineRectPoint(Math.cos(Math.PI / 6), bound.b3, bound.b4);
        break;
      }
      case Shape.rTriangle: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.rectangle: {
        [bound.b3, bound.b4] = determineRectPoint(1 / 2, bound.b3, bound.b4);
        break;
      }
      case Shape.square: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.circle: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.cShape: {
        [bound.b3, bound.b4] = determineRectPoint(2 / 3, bound.b3, bound.b4);
        break;
      }
      case Shape.tShape: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.lShape: {
        [bound.b3, bound.b4] = determineRectPoint(2 / 3, bound.b3, bound.b4);
        break;
      }
      // case Shape.horizontalLine: {
      //   this.getRectBoundsByRatio(coord1, coord2, 0);
      //   // bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.verticalLine: {
      //   return this.getRectBoundsByRatio(coord1, coord2, 0);
      //   // bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.slantedLineForward: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 0);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.slantedLineBackward: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 0);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.beanShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.eightShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.infinityShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.customShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
    }
    // Adjust points
    function firstAdjustment(c1: Coord, c2: Coord, angle: number) {
      const dist = getDistance(c1, c2);
      const ang1 = getAngle(c1, c2);
      const angDiff = ang1 - angle;
      return new Coord(Math.cos(angDiff) * dist, Math.sin(angDiff) * dist);
    }
    bound.b1 = firstAdjustment(coord1, bound.b1, coordAng);
    bound.b2 = firstAdjustment(coord1, bound.b2, coordAng);
    bound.b3 = firstAdjustment(coord1, bound.b3, coordAng);
    bound.b4 = firstAdjustment(coord1, bound.b4, coordAng);
    // apply offset
    let leftRightPad: number;
    let topBotPad: number;
    // TODO: Maybe put jointRadius within AppConstants? (Unless it has to be part of grid)
    const jointRadius = 5;
    function offset(offsetX: number, offsetY: number, coord: Coord) {
      coord = new Coord(coord.x + offsetX, coord.y + offsetY);
      return coord;
    }
    switch (shape) {
      case Shape.eTriangle:
        leftRightPad = (5 * 2) / Math.tan(Math.PI / 6);
        topBotPad = (leftRightPad / 2) * Math.sqrt(3);
        bound.b1 = offset(
          -leftRightPad * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b1
        );
        bound.b2 = offset(
          leftRightPad * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b2
        );
        bound.b3 = offset(
          leftRightPad * AppConstants.scaleFactor,
          (5 * 2 - topBotPad * 2) * AppConstants.scaleFactor,
          bound.b3
        );
        bound.b4 = offset(
          -leftRightPad * AppConstants.scaleFactor,
          (5 * 2 - topBotPad * 2) * AppConstants.scaleFactor,
          bound.b4
        );
        break;
      case Shape.rTriangle:
        leftRightPad = (5 * 2) / Math.tan(Math.PI / 8);
        bound.b1 = offset(
          -5 * 2 * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b1
        );
        bound.b2 = offset(
          leftRightPad * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b2
        );
        bound.b3 = offset(
          leftRightPad * AppConstants.scaleFactor,
          -leftRightPad * AppConstants.scaleFactor,
          bound.b3
        );
        bound.b4 = offset(
          -5 * 2 * AppConstants.scaleFactor,
          -leftRightPad * AppConstants.scaleFactor,
          bound.b4
        );
        break;
      case Shape.circle:
        const dx = bound.b2.x - bound.b1.x;
        const dy = bound.b2.y - bound.b1.y;
        const r = Math.sqrt(dx * dx + dy * dy) / AppConstants.scaleFactor;
        bound.b1 = offset(-r * AppConstants.scaleFactor, r * AppConstants.scaleFactor, bound.b1);
        bound.b2 = offset(0, r * AppConstants.scaleFactor, bound.b2);
        bound.b3 = offset(0, 0, bound.b3);
        bound.b4 = offset(-r * AppConstants.scaleFactor, 0, bound.b4);
        break;
    }
    // apply padding
    function padding(pad: number, bound: Bound) {
      bound.b1.x -= pad;
      bound.b1.y += pad;
      bound.b2.x += pad;
      bound.b2.y += pad;
      bound.b3.x += pad;
      bound.b3.y -= pad;
      bound.b4.x -= pad;
      bound.b4.y -= pad;
      return bound;
    }
    switch (shape) {
      case Shape.bar:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.rectangle:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.square:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.circle:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.cShape:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.tShape:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.lShape:
        bound = padding((2 * 5) / 50, bound);
        break;
    }
    // apply final adjustment
    function finalAdjustment(c1: Coord, c2: Coord, angle: number) {
      const d = Math.sqrt(Math.pow(c2.x, 2) + Math.pow(c2.y, 2));
      // const d = getDistance(c1, c2);
      const added_angle = angle + Math.atan2(c2.y, c2.x);
      const rx = d * Math.cos(added_angle);
      const ry = d * Math.sin(added_angle);
      return new Coord(c1.x + rx, c1.y + ry);
    }
    bound.b1 = finalAdjustment(coord1, bound.b1, coordAng);
    bound.b2 = finalAdjustment(coord1, bound.b2, coordAng);
    bound.b3 = finalAdjustment(coord1, bound.b3, coordAng);
    bound.b4 = finalAdjustment(coord1, bound.b4, coordAng);
    return bound;
  }

  static rotateBounds(
    oldJoint1: Coord,
    oldJoint2: Coord,
    newJoint1: Coord,
    newJoint2: Coord,
    oldBound: Bound
  ) {
    const theta =
      Math.atan2(newJoint2.y - newJoint1.y, newJoint2.x - newJoint1.x) -
      Math.atan2(oldJoint2.y - oldJoint1.y, oldJoint2.x - oldJoint1.x);
    const x_diff = newJoint1.x - (Math.cos(theta) * oldJoint1.x - Math.sin(theta) * oldJoint1.y);
    const y_diff = newJoint1.y - (Math.sin(theta) * oldJoint1.x + Math.cos(theta) * oldJoint1.y);

    function determineTransformation(
      oldBound: Coord,
      x_diff: number,
      y_diff: number,
      theta: number
    ) {
      let newCoord = new Coord(0, 0);
      newCoord.x = Math.cos(theta) * oldBound.x - Math.sin(theta) * oldBound.y + x_diff;
      newCoord.y = Math.sin(theta) * oldBound.x + Math.cos(theta) * oldBound.y + y_diff;
      return newCoord;
    }

    let bound: Bound = new (class implements Bound {
      arrow: Coord = new Coord(0, 0);
      b1: Coord = new Coord(0, 0);
      b2: Coord = new Coord(0, 0);
      b3: Coord = new Coord(0, 0);
      b4: Coord = new Coord(0, 0);
    })();

    bound.b1 = determineTransformation(oldBound.b1, x_diff, y_diff, theta);
    bound.b2 = determineTransformation(oldBound.b2, x_diff, y_diff, theta);
    bound.b3 = determineTransformation(oldBound.b3, x_diff, y_diff, theta);
    bound.b4 = determineTransformation(oldBound.b4, x_diff, y_diff, theta);
    return bound;
  }

  // static getPointsFromBounds(bound: Bound, shape: Shape, _width?: number) {
  // return '';
  // }
  // static getPointsFromBounds(bound: Bound, shape: Shape, _width?: number) {
  //   let points: Coord[];
  //   switch (shape) {
  //     // fall through switch
  //     case Shape.line: {
  //       const x1 = bound.b4.x;
  //       const y1 = bound.b4.y;
  //       const x2 = bound.b2.x;
  //       const y2 = bound.b2.y;
  //       //If the optional width paramter is not provided, use the default width
  //       if (!_width) {
  //         _width = 5 * 2 * AppConstants.scaleFactor;
  //       }
  //       const width = _width;
  //       // Find angle of rotation for link
  //       const dx = x2 - x1;
  //       const dy = y2 - y1;
  //       const rotation = Math.atan2(dy, dx);
  //
  //       // Use angle of rotation to calculate endpoint locations
  //       const xChange = Math.sin(rotation) * width;
  //       const yChange = Math.cos(rotation) * width;
  //
  //       // Create endpoints of SVG's
  //       const p1 = new Coord(x1 - xChange - yChange, y1 + yChange - xChange);
  //       const p2 = new Coord(x1 + xChange - yChange, y1 - yChange - xChange);
  //       const p3 = new Coord(x2 + xChange + yChange, y2 - yChange + xChange);
  //       const p4 = new Coord(x2 - xChange + yChange, y2 + yChange + xChange);
  //       points = [p1, p2, p3, p4];
  //       break;
  //     }
  //     case Shape.bar:
  //       points = [bound.b1, bound.b2, bound.b3, bound.b4];
  //       break;
  //     case Shape.eTriangle: {
  //       const b1 = bound.b1;
  //       const b2 = bound.b2;
  //       const b3 = bound.b3;
  //       const b4 = bound.b4;
  //       const p3 = new Coord((b3.x - b4.x) / 2 + b4.x, (b3.y - b4.y) / 2 + b4.y);
  //       points = [b1, b2, p3];
  //       break;
  //     }
  //     case Shape.rTriangle: {
  //       const b1 = bound.b1;
  //       const b2 = bound.b2;
  //       const b4 = bound.b4;
  //       points = [b1, b2, b4];
  //       break;
  //     }
  //     case Shape.rectangle: {
  //       points = [bound.b1, bound.b2, bound.b3, bound.b4];
  //       break;
  //     }
  //     case Shape.square: {
  //       points = [bound.b1, bound.b2, bound.b3, bound.b4];
  //       break;
  //     }
  //     case Shape.circle: {
  //       points = [bound.b1, bound.b2, bound.b3, bound.b4];
  //       break;
  //     }
  //     case Shape.cShape: {
  //       // const widthRatio = 1 / SVGSettings.widthRatio;
  //       // TODO: Check to see if this number can change
  //       const widthRatio = 5;
  //       const dx = bound.b2.x - bound.b1.x;
  //       const dy = bound.b2.y - bound.b1.y;
  //       const angle = Math.atan2(dy, dx);
  //       const width = Math.sqrt(dx * dx + dy * dy);
  //       const cx = (Math.cos(angle) * width) / widthRatio;
  //       const cy = (Math.sin(angle) * width) / widthRatio;
  //       const low2 = new Coord(bound.b3.x - cx, bound.b3.y - cy);
  //       const low1 = new Coord(bound.b4.x + cx, bound.b4.y + cy);
  //       const high2 = new Coord(bound.b2.x - cx + cy, bound.b2.y - cy - cx);
  //       const high1 = new Coord(bound.b1.x + cx + cy, bound.b1.y + cy - cx);
  //       points = [bound.b1, bound.b2, bound.b3, low2, high2, high1, low1, bound.b4];
  //       break;
  //     }
  //     case Shape.tShape: {
  //       const widthRatio = 5;
  //       const dx = bound.b2.x - bound.b1.x;
  //       const dy = bound.b2.y - bound.b1.y;
  //       const angle = Math.atan2(dy, dx);
  //       const width = Math.sqrt(dx * dx + dy * dy);
  //       const cx = (Math.cos(angle) * width) / widthRatio;
  //       const cy = (Math.sin(angle) * width) / widthRatio;
  //       const high4 = new Coord(bound.b2.x + cy, bound.b2.y - cx);
  //       const high3 = new Coord(
  //         high4.x - (cx * (widthRatio - 1)) / 2,
  //         high4.y - (cy * (widthRatio - 1)) / 2
  //       );
  //       const low2 = new Coord(
  //         bound.b3.x - (cx * (widthRatio - 1)) / 2,
  //         bound.b3.y - (cy * (widthRatio - 1)) / 2
  //       );
  //       const low1 = new Coord(
  //         bound.b4.x + (cx * (widthRatio - 1)) / 2,
  //         bound.b4.y + (cy * (widthRatio - 1)) / 2
  //       );
  //       const high1 = new Coord(bound.b1.x + cy, bound.b1.y - cx);
  //       const high2 = new Coord(
  //         high1.x + (cx * (widthRatio - 1)) / 2,
  //         high1.y + (cy * (widthRatio - 1)) / 2
  //       );
  //       points = [bound.b1, bound.b2, high4, high3, low2, low1, high2, high1];
  //       break;
  //     }
  //     case Shape.lShape: {
  //       const widthRatio = 5;
  //       const dx = bound.b2.x - bound.b1.x;
  //       const dy = bound.b2.y - bound.b1.y;
  //       const angle = Math.atan2(dy, dx);
  //       const width = Math.sqrt(dx * dx + dy * dy);
  //       const cx = (Math.cos(angle) * width) / widthRatio;
  //       const cy = (Math.sin(angle) * width) / widthRatio;
  //       const high2 = new Coord(bound.b2.x + cy, bound.b2.y - cx);
  //       const high1 = new Coord(high2.x - cx * (widthRatio - 1), high2.y - cy * (widthRatio - 1));
  //       const low1 = new Coord(bound.b4.x + cx, bound.b4.y + cy);
  //       points = [bound.b1, bound.b2, high2, high1, low1, bound.b4];
  //       break;
  //     }
  //     default: {
  //       return '';
  //     }
  //   }
  //   // TODO: Have logic for determining a lot of this stored somewhere to be used for determining mass and mass moment of inertia
  //   // TODO: Change the logic for r when you get to this point
  //   let r: number;
  //   if (shape === Shape.circle) {
  //     const xdiff = points[1].x - points[0].x;
  //     const ydiff = points[1].y - points[0].y;
  //     r = Math.sqrt(Math.pow(xdiff, 2) + Math.pow(ydiff, 2)) / 2;
  //   } else {
  //     r = 5 * 2 * AppConstants.scaleFactor;
  //   }
  //   let pathString = '';
  //
  //   // array of angles of next point relative to current point
  //   const rotationArray = [];
  //   // array of angles of current point in radians
  //   const angleArray = [];
  //
  //   // pre-process, fill the arrays
  //   for (let i = 0; i < points.length; i++) {
  //     let npHolder: Coord, lpHolder: Coord;
  //     npHolder = i + 1 < points.length ? points[i + 1] : points[0];
  //     lpHolder = i - 1 >= 0 ? points[i - 1] : points[points.length - 1];
  //     // last point
  //     const lp = lpHolder;
  //     // current point
  //     const cp = points[i];
  //     // next point
  //     const np = npHolder;
  //
  //     const lastDx = cp.x - lp.x;
  //     const lastDy = cp.y - lp.y;
  //     const lastRot = Math.atan2(lastDy, lastDx);
  //
  //     const nextDx = np.x - cp.x;
  //     const nextDy = np.y - cp.y;
  //     const nextRot = Math.atan2(nextDy, nextDx);
  //     const angle = Math.PI - (lastRot - nextRot);
  //     angleArray.push(angle);
  //     rotationArray.push(nextRot);
  //   }
  //
  //   for (let i = 0; i < points.length; i++) {
  //     // current point
  //     const cp = points[i];
  //     // current angle
  //     const ca = angleArray[i];
  //     // next rotation
  //     const nr = rotationArray[i];
  //     // last point, last angle, last rotation
  //     let lp: Coord, la: number, lr: number;
  //     if (i - 1 >= 0) {
  //       lp = points[i - 1];
  //       la = angleArray[i - 1];
  //       lr = rotationArray[i - 1];
  //     } else {
  //       lp = points[points.length - 1];
  //       la = angleArray[points.length - 1];
  //       lr = rotationArray[points.length - 1];
  //     }
  //
  //     // path for each point should be like: start (last point curve end point) -> mid (current point curve start point) ->
  //     // curve -> end (current point curve end point)
  //
  //     // this offset indicates the distance from last point where the line can begin
  //     // (can't begin at last point cuz we have rounded corner)
  //     // offset = right-angle distance to the center-line of last angle is r
  //     const lastOffset = Math.abs(r / Math.tan(la / 2));
  //
  //     const lastXC = Math.cos(lr) * lastOffset;
  //     const lastYC = Math.sin(lr) * lastOffset;
  //     // apply the offset
  //     const startX = lp.x + lastXC;
  //     const startY = lp.y + lastYC;
  //
  //     // same as above, except for current point
  //     // (must end before current point to draw rounded corner)
  //     const nextOffset = Math.abs(r / Math.tan(ca / 2));
  //     const midXC = Math.cos(lr) * nextOffset;
  //     const midYC = Math.sin(lr) * nextOffset;
  //
  //     // mid is the point where the curve of the current point starts
  //     const midX = cp.x - midXC;
  //     const midY = cp.y - midYC;
  //
  //     // construct the path from start to mid
  //     pathString +=
  //       i === 0
  //         ? `M ${startX} ${startY} L ${midX} ${midY} `
  //         : `L ${startX} ${startY} L ${midX} ${midY} `;
  //     // if (i === 0) {
  //     //   pathString += `M ${startX} ${startY} L ${midX} ${midY} `;
  //     // } else {
  //     //   pathString += `L ${startX} ${startY} L ${midX} ${midY} `;
  //     // }
  //
  //     // the offset distance should be the same for the other half of the curve
  //     // just the rotation is now relative to the next point
  //     const nextXC = Math.cos(nr) * nextOffset;
  //     const nextYC = Math.sin(nr) * nextOffset;
  //
  //     // end is the coord where the curve of the current point ends
  //     const endX = cp.x + nextXC;
  //     const endY = cp.y + nextYC;
  //
  //     // construct the mid curve
  //     // the control points for bezier curves are simply pointed
  //     // towards the corner, but stops at 0.55x the distance
  //     // 0.55 is the percentage to create a perfect circle
  //     // TODO: 0.55 is only good for constructing circle with 4 points, not optimal for triangles, etc
  //     const cp1x1 = Math.cos(lr) * r;
  //     const cp1y1 = Math.sin(lr) * r;
  //     const cp1x2 = midXC * 0.551915;
  //     const cp1y2 = midYC * 0.551915;
  //
  //     const cp2x1 = Math.cos(nr) * r;
  //     const cp2y1 = Math.sin(nr) * r;
  //     const cp2x2 = nextXC * 0.551915;
  //     const cp2y2 = nextYC * 0.551915;
  //
  //     // find the shorter control line
  //     pathString +=
  //       Math.sqrt(cp1x1 * cp1x1 + cp1y1 * cp1y1) < Math.sqrt(cp1x2 * cp1x2 + cp1y2 * cp1y2)
  //         ? (pathString += `C ${cp.x - midXC + cp1x1} ${cp.y - midYC + cp1y1} ${
  //             cp.x + nextXC - cp2x1
  //           } ${cp.y + nextYC - cp2y1} `)
  //         : `C ${cp.x - midXC + cp1x2} ${cp.y - midYC + cp1y2} ${cp.x + nextXC - cp2x2} ${
  //             cp.y + nextYC - cp2y2
  //           } `;
  //     // if (Math.sqrt(cp1x1 * cp1x1 + cp1y1 * cp1y1) < Math.sqrt(cp1x2 * cp1x2 + cp1y2 * cp1y2)) {
  //     //   pathString += `C ${cp.x - midXC + cp1x1} ${cp.y - midYC + cp1y1} ${cp.x + nextXC - cp2x1} ${cp.y + nextYC - cp2y1} `;
  //     // } else {
  //     //   pathString += `C ${cp.x - midXC + cp1x2} ${cp.y - midYC + cp1y2} ${cp.x + nextXC - cp2x2} ${cp.y + nextYC - cp2y2} `;
  //     // }
  //     pathString += `${endX} ${endY} `;
  //   }
  //
  //   pathString += `Z`;
  //   return pathString;
  // }

  static getD(allJoints: Joint[]) {
    const hi = 'hello :)';
    let d = '';
    // determine path of link (https://stackoverflow.com/questions/21778506/finding-largest-subset-of-points-forming-a-convex-polygon)
    // 1st option: have set axis and extract members from this axis
    // 2nd option: Create link with the biggest area
    function determineMatch(desiredJointID: string, row: Joint[]) {
      if (desiredJointID === row[0].id) {
        return row[0];
      } else if (desiredJointID === row[1].id) {
        return row[1];
      }
      else {
        return '';
      }
    }
    function findDesiredJointIDOrder(joint: Joint, allJoints: Joint[], firstRow: RealJoint[], desiredJointsIDs: string) {
      let secondRow: Joint[];
      if (desiredJointsIDs.indexOf(firstRow[0].id) === -1) {
        secondRow = findBiggestAngle(firstRow[0] as RealJoint, allJoints as RealJoint[]);
      } else {
        secondRow = findBiggestAngle(firstRow[1] as RealJoint, allJoints as RealJoint[]);
      }

      const desiredJoint = determineMatch(joint.id, secondRow);
      if (desiredJoint !== '') { // should this be desiredJoint or desiredJointIDs
        desiredJointsIDs += desiredJoint.id;
        // check to see if there is an id that has not been explored
        if (desiredJointsIDs.indexOf(firstRow[0].id) === -1) {
          desiredJointsIDs = findDesiredJointIDOrder(firstRow[0], allJoints, secondRow as RealJoint[], desiredJointsIDs);
        } else if (desiredJointsIDs.indexOf(firstRow[1].id) === -1) {
          desiredJointsIDs = findDesiredJointIDOrder(firstRow[1], allJoints, secondRow as RealJoint[], desiredJointsIDs);
        }
      } else { // TODO: Think about if this is necessary...
        desiredJointsIDs = findDesiredJointIDOrder(secondRow[0], allJoints, secondRow as RealJoint[], desiredJointsIDs)
      }
      return desiredJointsIDs;
    }
    const desiredJointsIDs = allJoints.length === 2 ? allJoints[0].id + allJoints[1].id :
        findDesiredJointIDOrder(allJoints[0] as RealJoint, allJoints as RealJoint[],
        findBiggestAngle(allJoints[0] as RealJoint, allJoints as RealJoint[]) as RealJoint[], '');
    // Draw link given the desiredJointIDs
    function determineL(d: string, coord1: Joint, coord2: Joint, coord3?: Joint) {
      // find slope between two points
      const m = determineSlope(coord1.x, coord1.y, coord2.x, coord2.y);
      // find normal slope of given slope
      let normal_m: number;
      if (m === 0) {
        normal_m = 99999;
      } else {
        normal_m = -1/m;
      }

      const normal_angle = Math.atan(normal_m); // in degrees
      // determine the point further away from third point
      let point1: Coord;
      let point2: Coord;
      // TODO: think of better way to create this more universally
      function determinePoint(angle: number, c1: Coord, c2: Coord, dir: string) {
        // Maybe it is atan2 that is desired...
        if (dir === 'neg') {
          // const b1 = c1.y - Math.tan(angle) * c1.x;
          // const b2 = c1.y - Math.tan(angle) * c1.x;
          return [new Coord(0.2 * Math.cos(angle + Math.PI) + c1.x,0.2 * Math.sin(angle + Math.PI) + c1.y),
                  new Coord(0.2 * Math.cos(angle + Math.PI) + c2.x, 0.2 * Math.sin(angle + Math.PI) + c2.y)];
        } else {
          return [new Coord(0.2 * Math.cos(angle) + c1.x,0.2 * Math.sin(angle) + c1.y),
            new Coord(0.2 * Math.cos(angle) + c2.x, 0.2 * Math.sin(angle) + c2.y)];
        }
        // const b1 = determineYIntersect(c1.x, c1.y, Math.atan(angle));
        // const b2 = determineYIntersect(c2.x, c2.y, Math.atan(angle));
        // return [new Coord(0.2 * Math.acos(angle) + c1,0.2 * Math.asin(angle) + b1),
        //         new Coord(0.2 * Math.acos(angle) + b2, 0.2 * Math.asin(angle) + b2)]
      }
      if (coord3 === undefined) {
        if (d === '') {
          [point1, point2] = determinePoint(normal_angle, coord1, coord2, 'neg');
        } else {
          [point1, point2] = determinePoint(normal_angle, coord1, coord2, 'pos');
        }
      } else {
        const [point1a, point1b] = determinePoint(normal_angle, coord1, coord2, 'pos');
        const point1c = new Coord((point1a.x + point1b.x) / 2, (point1a.y + point1b.y) / 2);
        const [point2a, point2b] = determinePoint(normal_angle, coord1, coord2, 'neg');
        const point2c = new Coord((point2a.x + point2b.x) / 2, (point2a.y + point2b.y) / 2);
        [point1, point2] = getDistance(coord3, point1c) > getDistance(coord3, point2c) ? [point1a, point1b] : [point2a, point2b];
        // if (getDistance(new Coord(coord3.y * 0.2 * Math.cos(normal_angle),coord3.y * 0.2 * Math.sin(normal_angle)),
        //         new Coord(coord1.x + coord2.x, coord1.y + coord2.y)) >
        //     getDistance(new Coord(coord3.y * 0.2 * Math.cos(normal_angle + (Math.PI / 2)),coord3.y * 0.2 * Math.sin(normal_angle + (Math.PI / 2))),
        //         new Coord(coord1.x + coord2.x, coord1.y + coord2.y)))
        // {
        //   [point1, point2] = determinePoint(normal_angle, coord1, coord2, 'pos');
        //   // TODO: Check this logic later...
        //   // point1 = new Coord(coord1.y * 0.2 * Math.cos(normal_angle),coord1.y * Math.sin(normal_angle));
        //   // point2 = new Coord(coord2.y * 0.2 * Math.cos(normal_angle),coord2.y * Math.sin(normal_angle));
        // } else {
        //   [point1, point2] = determinePoint(normal_angle + (Math.PI / 2), coord1, coord2, 'pos');
        //   // point1 = new Coord(coord1.y * 0.2 * Math.cos(normal_angle + (Math.PI / 2)),coord1.y * 0.2 * Math.sin(normal_angle + (Math.PI / 2)));
        //   // point2 = new Coord(coord2.y * 0.2 * Math.cos(normal_angle + (Math.PI / 2)),coord2.y * 0.2 * Math.sin(normal_angle + (Math.PI / 2)));
        // }
      }
      if (d === '') {
        d += 'M ' + point1.x.toString() + ' ' + point1.y.toString();
        d += ' L ' + point2.x.toString() + ' ' + point2.y.toString();
      } else {
        // The end position is being inserted here
        d += ' C ' + point1.x.toString() + ' ' + point1.y.toString();
        d += ' L ' + point2.x.toString() + ' ' + point2.y.toString();
      }
      return d;
    }
    function determineC(d: string, index: number, desiredJoint: Joint, point1?: Coord, point2?: Coord) : [string, Coord, Coord] {
      let point3: Coord;
      let point4: Coord;

      function getDesiredString(d: string, index: number, firstPoint: boolean) {
        let point1StartingIndex: number;
        let point1EndingIndex: number;
        let point1String: string[];
        let coord1: Coord;

        let point2StartingIndex: number;
        let point2EndingIndex: number;
        let point2String: string[];
        let coord2: Coord;

        if (index === 0 && firstPoint) {
          point1StartingIndex = getPosition(d, 'M', index + 1) + 2;
          point1EndingIndex = getPosition(d, 'L', index + 1);
          point2StartingIndex = getPosition(d, 'L', index + 1) + 2;
          point2EndingIndex = getPosition(d, 'C', index + 1);
        } else {
          point1StartingIndex = getPosition(d, 'C', index + 1) + 2;
          point1EndingIndex = getPosition(d, 'L', index + 2);
          if (point1EndingIndex < d.length) {
            point2StartingIndex = getPosition(d, 'L', index + 2) + 2;
            point2EndingIndex = getPosition(d, 'C', index + 2);
          } else { // need to get first L
            point2StartingIndex = getPosition(d, 'L', 1) + 2;
            point2EndingIndex = getPosition(d, 'C', 1);
          }
        }
        point1String = pullStringWithinString(d, point1StartingIndex, point1EndingIndex).split(' ', 2);
        point2String = pullStringWithinString(d, point2StartingIndex, point2EndingIndex).split(' ', 2);
        coord1 = new Coord(parseFloat(point1String[0]), parseFloat(point1String[1]));
        coord2 = new Coord(parseFloat(point2String[0]), parseFloat(point2String[1]));
        return [coord1, coord2];
      }

      if (point1 === undefined || point2 === undefined) {
        [point1, point2] = getDesiredString(d, index, true);
      }

      [point3, point4] = getDesiredString(d, index, false);

      const angle1 = Math.atan2(point2.y - point1.y, point2.x - point1.x);
      const angle2 = Math.atan2(point4.y - point3.y, point4.x - point3.x);

      const [x_intersect, y_intersect] = line_intersect(point1.x, point1.y, point2.x, point2.y, point3.x, point3.y, point4.x, point4.y);
      let fillet_radius: number;
        fillet_radius = getDistance(desiredJoint, new Coord(x_intersect, y_intersect)) / 3;
      if (fillet_radius > 0.3) {
          fillet_radius = 0.3;
        }

      const bez_point1 = new Coord(fillet_radius * Math.cos(angle1) + point2.x, fillet_radius * Math.sin(angle1) + point2.y);
      const bez_point2 = new Coord(fillet_radius * -Math.cos(angle2) + point3.x, fillet_radius * -Math.sin(angle2) + point3.y);
      // find point within d that contains the desired C and insert
      const desiredIndex = getPosition(d, 'C', index + 1) + 2;
      d = insertStringWithinString(d, desiredIndex, bez_point1.x.toString() + ' ' + bez_point1.y.toString() + ' ' +
          bez_point2.x.toString() + ' ' + bez_point2.y.toString() + ' ', );
      return [d, point3, point4];
    }
    const jointIDtoIndex = new Map<string, number>();
    allJoints.forEach((j, ind) => {
      jointIDtoIndex.set(j.id, ind);
    });
    for (let i = 0; i < desiredJointsIDs.length; i++) {
      const j = (i + 1) % desiredJointsIDs.length;
      if (desiredJointsIDs.length === 2) {
        d = determineL(d, allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
            allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!]);
      } else {
        const k = (i + 2) % desiredJointsIDs.length;
        d = determineL(d, allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
            allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!], allJoints[jointIDtoIndex.get(desiredJointsIDs[k])!]);
      }
    }
    // get point in M and insert as last C
    const firstPointIndex = 2;
    const lastPointIndex = getPosition(d, 'L', 1);
    d += ' C ' + d.slice(firstPointIndex, lastPointIndex);
    let point1: Coord;
    let point2: Coord;
    for (let i = 0;  i < desiredJointsIDs.length; i++) {
      const desiredJointID = desiredJointsIDs[(i + 1) % desiredJointsIDs.length];
      const desiredJoint = allJoints.find(j => j.id ===desiredJointID);
      if (i === 0) {
        [d, point1, point2] = determineC(d, i, desiredJoint!);
      } else {
        [d, point1, point2] = determineC(d, i, desiredJoint!, point1!, point2!);
      }
    }
    return d;
  }

  static determineCenterOfMass(joints: Joint[]) {
    let com_x = 0;
    let com_y = 0;
    // TODO: Logic isn't exactly right but can change this once other logic is fully finished
    joints.forEach((j) => {
      com_x += j.x;
      com_y += j.y;
    });
    return new Coord(com_x / joints.length, com_y / joints.length);
  }

  get d(): string {
    return this._d;
  }

  set d(value: string) {
    this._d = value;
  }

  get length(): number {
    return this._length;
  }

  set length(value: number) {
    this._length = value;
  }

  get angleRad(): number {
    return this._angle;
  }

  set angleRad(value: number) {
    this._angle = value;
  }

  get angleDeg(): number {
    return radToDeg(this._angle);
  }

  set angleDeg(value: number) {
    this._angle = degToRad(value);
  }

  get fill(): string {
    return this._fill;
  }

  set fill(value: string) {
    this._fill = value;
  }

  get massMoI(): number {
    return this._massMoI;
  }

  set massMoI(value: number) {
    this._massMoI = value;
  }

  get CoM(): Coord {
    return this._CoM;
  }

  set CoM(value: Coord) {
    this._CoM = value;
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
    this._CoM_d1 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x - 0.25) +
      ' ' +
      this.CoM.y +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y + 0.25);
    this._CoM_d2 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y + 0.25) +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      (this.CoM.x + 0.25) +
      ' ' +
      this.CoM.y;
    this._CoM_d3 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x + 0.25) +
      ' ' +
      this.CoM.y +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y - 0.25);
    this._CoM_d4 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y - 0.25) +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      (this.CoM.x - 0.25) +
      ' ' +
      this.CoM.y;
  }

  static getRectBoundsByRatio(refCoord1: Coord, refCoord2: Coord, ratio: number) {
    const x1 = refCoord1.x;
    const y1 = refCoord1.y;
    const x2 = refCoord2.x;
    const y2 = refCoord2.y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const rotation = Math.atan2(dy, dx);

    const dist = Math.sqrt(dx * dx + dy * dy);
    const distBound = ratio * dist; // Math.cos(Math.PI / 6) * dist;
    const xChangeBound = Math.sin(rotation) * distBound;
    const yChangeBound = Math.cos(rotation) * distBound;

    const xVal = (x1 + x2 + x1 + x2 + xChangeBound + xChangeBound) / 4;
    const yVal = (y1 + y2 + y2 - yChangeBound + y1 - yChangeBound) / 4;

    return {
      b1: new Coord(x1, y1),
      b2: new Coord(x2, y2),
      b3: new Coord(x2 + xChangeBound, y2 - yChangeBound),
      b4: new Coord(x1 + xChangeBound, y1 - yChangeBound),
      arrow: new Coord(xVal, yVal),
      // arrow: {x: 1, y: 1}
      // arrow: {x: 0, y: 0}
    };
  }

  // static applyPadding(refCoord1: Coord, refCoord2: Coord, bounds: Bound, paddingOptions: PaddingOptions): Bound {
  //   const originalRC = SVGFuncs.getBoundsRelativeCoords(refCoord1, refCoord2, bounds);
  //   if (paddingOptions.offset) {
  //     const keyArray = [editorID.b1, editorID.b2, editorID.b3, editorID.b4, editorID.arrow];
  //     keyArray.forEach(key => {
  //       const val = paddingOptions.offset[key];
  //       if (!val) { return; }
  //       originalRC[key].x += val.x * AppConstants.scaleFactor;
  //       originalRC[key].y += val.y * AppConstants.scaleFactor;
  //     });
  //   }
  //   if (paddingOptions.padding) {
  //     originalRC.b1.x -= paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b1.y += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b2.x += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b2.y += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b3.x += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b3.y -= paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b4.x -= paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b4.y -= paddingOptions.padding * AppConstants.scaleFactor;
  //     // do i have to put info about arrow as well??
  //   }
  //   return SVGFuncs.getBoundsByRelativeCoords(refCoord1, refCoord2, originalRC);
  // }
}

export class Piston extends Link {
  constructor(id: string, joints: Joint[], mass?: number) {
    super(id, joints, mass);
  }
}

// export class BinaryLink extends RealLink {}

// export class NonBinaryLink extends RealLink {}
