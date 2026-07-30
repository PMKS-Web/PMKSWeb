import { AppConstants } from './app-constants';
// Type-only: a runtime import here closes the joint -> link -> joint module
// cycle, which breaks class initialization when a test entry point loads the
// model modules in a different order than the app does.
import type { Link } from './link';
import { Coord } from './coord';
import { SettingsService } from '../services/settings.service';

export class Joint extends Coord {
  private _id: string;
  private _name: string = '';
  private _showHighlight: boolean = false; //?

  constructor(id: string, x: number, y: number) {
    super(x, y);
    this._id = id;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get name(): string {
    if (this._name === '') {
      return this.id;
    }
    return this._name;
  }

  set name(value: string) {
    this._name = value;
  }

  get showHighlight(): boolean {
    return this._showHighlight;
  }

  set showHighlight(value: boolean) {
    this._showHighlight = value;
  }
}

export class RealJoint extends Joint {
  // TODO: Does the r only need to be on RevJoints?
  private _r: number = 0.15; //This seems like the SVG scale factor
  private _input: boolean;
  private _ground: boolean;
  private _links: Link[];
  private _connectedJoints: Joint[];
  public showCurve: boolean;
  public isWelded: boolean = false;

  constructor(
    id: string,
    x: number,
    y: number,
    input: boolean = false,
    ground: boolean = false,
    links: Link[] = [],
    connectedJoints: Joint[] = []
  ) {
    super(id, x, y);
    this._input = input;
    this._ground = ground;
    this._links = links;
    this._connectedJoints = connectedJoints;
    this.showCurve = true;
  }

  //R is radius of the joint
  get r(): number {
    return this._r;
  }

  set r(value: number) {
    this._r = value;
  }

  get ground(): boolean {
    return this._ground;
  }

  set ground(value: boolean) {
    this._ground = value;
  }

  get links(): Link[] {
    return this._links;
  }

  set links(value: Link[]) {
    this._links = value;
  }

  get connectedJoints(): Joint[] {
    return this._connectedJoints;
  }

  set connectedJoints(value: Joint[]) {
    this._connectedJoints = value;
  }

  get input(): boolean {
    return this._input;
  }

  set input(value: boolean) {
    this._input = value;
  }

  canBeWelded(): boolean {
    //If the joint is an input or ground, it cannot be welded
    //It also cannot be welded unless there are two or more links connected to it
    //also if this.connectedJoints contains a pris joint, this cannot be welded
    if (
      this.input ||
      this.ground ||
      this.links.length < 2 ||
      this.connectedJoints.some((joint) => joint instanceof PrisJoint)
    ) {
      return false;
    } else {
      return true;
    }
  }

  canBeUnwelded(): boolean {
    //Is is already welded - it can always be unwelded
    return this.isWelded;
  }

  canBeWeldedOrUnwelded() {
    if (this.canBeWelded()) return true;
    return this.canBeUnwelded();
  }
}

// TODO: Verify this but I don't believe there is an ImagJoint...
// export class ImagJoint extends Joint {
//
//   constructor(id: string, x: number, y: number) {
//     super(id, x, y);
//   }
// }

export class RevJoint extends RealJoint {
  constructor(
    id: string,
    x: number,
    y: number,
    input: boolean = false,
    ground: boolean = false,
    links: Link[] = [],
    connectedJoints: Joint[] = []
  ) {
    super(id, x, y, input, ground, links, connectedJoints);
  }
}

export class PrisJoint extends RealJoint {
  private _angle_rad: number = 0;
  private _carrier?: Link;
  private _slotJointA?: Joint;
  private _slotJointB?: Joint;

  constructor(
    id: string,
    x: number,
    y: number,
    input: boolean = false,
    ground: boolean = false,
    links: Link[] = [],
    connectedJoints: Joint[] = []
  ) {
    super(id, x, y, input, ground, links, connectedJoints);
  }

  get angle_rad(): number {
    return this._angle_rad;
  }

  set angle_rad(value: number) {
    this._angle_rad = value;
  }

  get carrier(): Link | undefined {
    return this._carrier;
  }

  get slotJointA(): Joint | undefined {
    return this._slotJointA;
  }

  get slotJointB(): Joint | undefined {
    return this._slotJointB;
  }

  /**
   * A slot is either grounded or floating, never both and never neither
   * (§2.4a). The two setters below are the only way to move between those
   * states, so a half-built slot — a carrier with one joint, or a carrier that
   * still claims to be grounded — cannot be represented at all rather than
   * being represented and then validated against.
   */
  get isFloating(): boolean {
    return this._carrier !== undefined;
  }

  /** Bind the slot to a joint pair on a carrier link. */
  slideOn(carrier: Link, slotJointA: Joint, slotJointB: Joint): void {
    this._carrier = carrier;
    this._slotJointA = slotJointA;
    this._slotJointB = slotJointB;
    this.ground = false;
  }

  /** Return the slot to a world-fixed direction. */
  groundAt(angle_rad: number): void {
    this._carrier = undefined;
    this._slotJointA = undefined;
    this._slotJointB = undefined;
    this._angle_rad = angle_rad;
    this.ground = true;
  }

  /**
   * The slot's direction in world space, right now.
   *
   * This is the seam the solvers read through. A grounded slot answers with the
   * angle it was given; a floating one measures its own defining joints, so it
   * re-derives per timestep for free and no caller has to know which kind it is
   * holding.
   */
  get slotAngle(): number {
    if (!this._slotJointA || !this._slotJointB) {
      return this._angle_rad;
    }
    return Math.atan2(
      this._slotJointB.y - this._slotJointA.y,
      this._slotJointB.x - this._slotJointA.x
    );
  }

  /**
   * Whether a floating slot still has a defined direction (§2.10 items 4, 6).
   * Two coincident slot joints leave the line undefined — reachable by a
   * Phase 1.2 snap that stops just short of merging.
   */
  get isSlotWellFormed(): boolean {
    if (!this._carrier || !this._slotJointA || !this._slotJointB) {
      return false;
    }
    const members = this._carrier.joints;
    return (
      this._slotJointA.id !== this._slotJointB.id &&
      members.some((joint) => joint.id === this._slotJointA!.id) &&
      members.some((joint) => joint.id === this._slotJointB!.id) &&
      !members.some((joint) => joint.id === this.id) &&
      Math.hypot(this._slotJointB.x - this._slotJointA.x, this._slotJointB.y - this._slotJointA.y) >
        1e-9
    );
  }

  /** Rebind to equivalent objects from another copy of the mechanism (§2.8a). */
  rebindSlot(links: Link[], joints: Joint[]): void {
    if (!this._carrier || !this._slotJointA || !this._slotJointB) {
      return;
    }
    const carrier = links.find((link) => link.id === this._carrier!.id);
    const a = joints.find((joint) => joint.id === this._slotJointA!.id);
    const b = joints.find((joint) => joint.id === this._slotJointB!.id);
    if (carrier && a && b) {
      this.slideOn(carrier, a, b);
    }
  }
}
