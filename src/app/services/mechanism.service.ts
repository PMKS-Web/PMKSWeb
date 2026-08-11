import { Injectable, Injector } from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Link, SliderBlock, RealLink } from '../model/link';
import { isSlideCandidate, slideAssemblyAt } from '../model/slide-assembly';
import {
  Cylinder,
  cylinderCreationLayout,
  cylinderJoints,
  cylinderStrokeAlong,
  cylinderOfJoint,
  cylinderOfJointIn,
  cylinderOfLink,
  cylinderOfLinkIn,
  isCylinderInterior,
  normalizedCylinderPose,
  sealedCylinderStructures,
  structuralCylinderAt,
} from '../model/cylinder';
import { Force } from '../model/force';
import { Mechanism } from '../model/mechanism/mechanism';
import { ToolbarComponent } from '../component/toolbar/toolbar.component';
import { InstantCenter } from '../model/instant-center';
import {
  gridStates,
  jointStates,
  linkStates,
  forceStates,
  shapeEditModes,
  createModes,
  moveModes,
  roundNumber,
  LengthUnit,
  point_on_line_segment_closest_to_point,
  getDistance,
  distance_points,
} from '../model/utils';
import { BehaviorSubject, connect, Subject } from 'rxjs';
import { GridUtilsService } from './grid-utils.service';
import { ActiveObjService } from './active-obj.service';
import { AnimationBarComponent } from '../component/animation-bar/animation-bar.component';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { canDrive, describeActuator } from '../model/actuator';
import { SettingsService } from './settings.service';
import { slotHalfLength } from '../model/joint-marks';
import { DragStateService } from './drag-state.service';
import { Coord } from '../model/coord';
import { Line } from '../model/line';
import { SaveHistoryService } from './save-history.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { PositionSolver, SAMPLES_PER_STROKE } from '../model/mechanism/position-solver';
import { ColorService } from './color.service';
import { siUnitFactorsForLength } from '../model/unit-conversions';
import { transformRigidCoord, transformRigidPath } from '../model/compound-link-path';
import { MergeRefusal, refuseJointMerge } from '../model/drop-target';
import { redundantlyHeldJointSets } from '../model/rigid-bodies';
import { MODEL_SCALE } from '../model/render-scale';

/** Blend two angles along the shorter arc, so a wrap past pi does not spin. */
function blendAngle(from: number, to: number, blend: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return from + delta * blend;
}

@Injectable({
  providedIn: 'root',
})
export class MechanismService {
  public mechanismTimeStep: number = 0;
  /** Playback rate relative to real time. 1 means one simulated second per second. */
  public animationSpeedMultiplier: number = 1;
  public joints: Joint[] = [];
  public links: Link[] = [];
  public forces: Force[] = [];
  public ics: InstantCenter[] = [];
  public mechanisms: Mechanism[] = [];
  public showPathHolder: boolean = true;

  // private moveModes: moveModes = moveModes;
  // private selectedJoint!: RealJoint;

  // This is the state of the mechanism
  // 0 is normal, no changes, no pending analysis
  // 1 is actively being dragged, no pending analysis, disable graphs
  // 2 is pending graph draws
  // 3 is pending analysis due to add or remove
  onMechUpdateState = new BehaviorSubject<number>(3);

  //The which timestep the mechanims is in
  onMechPositionChange = new Subject<number>();

  // Playback is driven by the wall clock, not by a fixed number of samples per
  // frame: the samples are spaced 1 degree of crank rotation apart, so how much
  // simulated time one sample covers depends on the input speed. Advancing by
  // elapsed real time is what makes a faster input speed animate faster.
  private static readonly FRAME_INTERVAL_MS = 16;
  private playbackClockMs: number | null = null;
  private playbackTimeSeconds = 0;
  private playbackFrameQueued = false;
  private advancingPlayback = false;

  constructor(
    public gridUtils: GridUtilsService,
    public activeObjService: ActiveObjService,
    private injector: Injector,
    private settingsService: SettingsService,
    private nup: NumberUnitParserService
  ) {}

  /**
   * Recompute every link outline after the object scale changed.
   *
   * A link's `d` is computed once and cached, but its width is objectScale / 4 --
   * so changing the scale left every bar at its old size while joints, ground
   * marks and the whole mark system grew around it. Worst on a slotted link,
   * where the R-relative channel kept scaling and outgrew the bar it is meant to
   * be a hole in.
   *
   * A method rather than a subscription to `_objectScale`. That subject is
   * static and replays its current value, so subscribing in the constructor
   * rebuilt every link the moment a service was built and left one live
   * subscriber per instance ever created -- which under a test run meant one
   * recompute per accumulated service, and a spec asserting the contour is
   * built once saw fifteen. Every other route that changes the scale rebuilds
   * the links from scratch anyway; the settings panel is the one that does not.
   */
  applyObjectScaleChange(): void {
    this.links.forEach((link) => {
      if (link instanceof RealLink) link.reComputeDPath();
    });
    this.updateMechanism();
  }

  // delete mechanism and reset
  resetMechanism() {
    this.joints = [];
    this.links = [];
    this.forces = [];
    this.mechanismTimeStep = 0;
    this.updateMechanism();
    this.onMechPositionChange.next(3);
  }

  // whether there is a valid mechanism
  exists(): boolean {
    return this.joints.length > 0;
  }

  getJoints() {
    return this.joints;
  }

  getLinks() {
    return this.links as RealLink[];
  }

  getForces() {
    return this.forces;
  }

  isAnimating(): boolean {
    return this.mechanismTimeStep > 0 || this.settingsService.animating.getValue();
  }

  updateMechanism(save: boolean = false) {
    // Everything derived from cylinder STRUCTURE (not pose) caches against
    // this: the structures themselves, the drawn marks, the guards. Bumped
    // here because this is the one funnel every mutation passes through, so
    // within a revision the topology cannot have changed.
    this.cylinderRevision++;
    this.poseRevision++;
    Force.normalizeVisualWidths(this.forces);
    // Changing the input speed re-samples the same geometry onto a different time
    // axis. Hold the simulation time rather than the sample index, so t and the pose
    // on screen stay consistent with each other across the rebuild. Read it before
    // rewinding, which is what the held time is measured against. The drawn time,
    // not the sample's: during playback it carries the sub-sample fraction.
    const heldTime = this.currentTimeSeconds();
    this.restoreStartPose();

    // The sealed-cylinder invariant is enforced HERE, at the one funnel every
    // mutation passes through, not at the gestures: whatever wrote a member
    // joint — a drag path, a panel or table field, a merge, an undo edge, or
    // a code path nobody found — the assembly is re-derived from its two
    // mounts before the solver, the codec or the canvas can read a bent one.
    this.normalizeSealedCylinders();

    // A compound Boolean union is pose-independent. Build it once for the
    // editable pose, then let Mechanism rigidly transform it for solved frames.
    this.links.forEach((link) => {
      if (link instanceof RealLink) link.reComputeDPath();
    });
    // console.log(this.mechanisms[0]);
    //There are multiple mechanisms since there was a plan to support multiple mechanisms
    //You can treat this as a single mechanism for now at index 0

    this.mechanisms = [];
    // TODO: Determine logic later once everything else is determined
    // Settings exposes RPM to users and persistence; solvers use rad/s.
    //
    // A prismatic input is a different quantity, not another unit of the same
    // one: its speed is length per second, so it comes from its own setting and
    // never meets the pi/30 conversion -- which used to run on it anyway,
    // leaving a driven block travelling at a tenth of the speed the panel
    // reported. What it does need is the MODEL_SCALE the solvers measure length
    // in; an angular speed has no length in it to want one.
    const drivenJoint = this.joints.find((j) => j instanceof RealJoint && j.input);
    let inputAngularVelocity =
      drivenJoint instanceof PrisJoint
        ? this.settingsService.linearInputSpeed.value * MODEL_SCALE
        : (this.settingsService.inputSpeed.value * Math.PI) / 30;
    if (this.settingsService.isInputCW.value) {
      inputAngularVelocity = inputAngularVelocity * -1;
    }
    let unitStr = 'cm';
    switch (this.settingsService.lengthUnit.value) {
      case LengthUnit.INCH:
        unitStr = 'in';
        break;
      case LengthUnit.METER:
        unitStr = 'm';
        break;
    }
    this.mechanisms.push(
      //This creates a new mechanism with the current state of the joints, links, forces, and ics
      //If the mechnaism is simulatable, it will generate loops and all future time steps
      new Mechanism(
        this.joints,
        this.links,
        this.forces,
        this.ics,
        true,
        unitStr,
        inputAngularVelocity
      )
    );
    this.activeObjService.fakeUpdateSelectedObj();
    this.reseekToTime(heldTime);

    if (save) {
      this.save();
    }
  }

  /**
   * Make every sealed cylinder collinear again, whatever wrote its joints.
   *
   * Structural resolution on purpose — a bent assembly is exactly the state
   * this exists to repair, so it cannot be found through the geometric test
   * it currently fails. The mounts are the user's handles and stay put; the
   * members are re-derived on the mount axis, the pin clamped into the slot.
   * For a valid assembly the pose is the identity at the same 6-decimal
   * rounding every drag applies, so the common case writes nothing.
   */
  private normalizeSealedCylinders(): void {
    for (const sealed of this.sealedStructures()) {
      const barrelLength = getDistance(
        new Coord(sealed.barrelFar.x, sealed.barrelFar.y),
        new Coord(sealed.barrelNear.x, sealed.barrelNear.y)
      );
      const pose = normalizedCylinderPose(
        sealed.barrelFar,
        sealed.rodFar,
        barrelLength,
        0.15 * this.settingsService.objectScale
      );
      if (!pose) continue;

      const placements: [Joint, { x: number; y: number }][] = [
        [sealed.barrelNear, pose.barrelNear],
        [sealed.pin, pose.pin],
        [sealed.slider, pose.pin],
      ];
      let moved = false;
      for (const [joint, at] of placements) {
        const x = roundNumber(at.x, 6);
        const y = roundNumber(at.y, 6);
        if (joint.x !== x || joint.y !== y) {
          joint.x = x;
          joint.y = y;
          moved = true;
        }
      }
      if (!moved) continue;

      // Only the repair path pays for this: the member links' derived state
      // follows the joints that just straightened.
      const movedIds = new Set(placements.map(([joint]) => joint.id));
      for (const link of this.links) {
        if (!(link instanceof RealLink)) continue;
        if (!link.joints.some((joint) => movedIds.has(joint.id))) continue;
        link.CoM = RealLink.determineCenterOfMass(link.joints);
        link.updateCoMDs();
        link.updateLengthAndAngle();
      }
    }
  }

  /**
   * Re-place the mechanism at a simulation time after a rebuild. Wrapping keeps a
   * time held from a slower cycle inside the new, shorter one.
   */
  private reseekToTime(seconds: number) {
    if (!this.mechanisms[0]?.isMechanismValid()) {
      // The rebuild can invalidate the mechanism; a step left pointing into the
      // old cycle would keep the editor gated on a time that no longer exists.
      this.mechanismTimeStep = 0;
      this.playbackTimeSeconds = 0;
      return;
    }
    if (!(seconds > 0)) {
      return;
    }
    const wrapped = this.wrapTime(seconds);
    this.animate(this.stepAtTime(wrapped), AnimationBarComponent.animate);
    // animate() treats any external call as a seek and snaps its clock to the
    // sample, so restore the sub-sample fraction afterwards — playback resumes
    // from exactly the held time, not the nearest sample.
    this.playbackTimeSeconds = wrapped;
  }

  save() {
    const saveHistoryService = this.injector.get(SaveHistoryService);
    saveHistoryService.save();
  }

  updateLinkageUnits(fromUnits: LengthUnit, toUnits: LengthUnit) {
    if (fromUnits === toUnits) return;

    const from = siUnitFactorsForLength(fromUnits);
    const to = siUnitFactorsForLength(toUnits);
    const lengthScale = this.nup.convertLength(1, fromUnits, toUnits);
    const massScale = from.massToKg / to.massToKg;
    const inertiaScale = from.inertiaToKgM2 / to.inertiaToKgM2;
    // Force converts through newtons: (N per fromUnit) / (N per toUnit).
    const forceScale = from.forceToN / to.forceToN;

    this.joints.forEach((joint) => {
      joint.x *= lengthScale;
      joint.y *= lengthScale;
    });

    const updateLink = (link: Link): void => {
      link.mass *= massScale;
      if (link instanceof RealLink) {
        link.massMoI *= inertiaScale;
        link.CoM.x *= lengthScale;
        link.CoM.y *= lengthScale;
        link.subset.forEach(updateLink);
        link.updateLengthAndAngle();
        link.updateCoMDs();
        link.reComputeDPath();
      }
    };
    this.links.forEach(updateLink);

    this.forces.forEach((force) => {
      force.startCoord.x *= lengthScale;
      force.startCoord.y *= lengthScale;
      force.endCoord.x *= lengthScale;
      force.endCoord.y *= lengthScale;
      force.setMagnitude(force.mag * forceScale);
      force.updateInternalValues();
    });

    this.updateMechanism(true);
    // this.settingsService.lengthUnit.subscribe((val) => {
    //For each jo
    // let unit = this.settingsService.lengthUnit.value;
    // if (unit !== this.lengthUnit) {
    //   this.mechanismService.joints.forEach((joint) => {
    //     this.activeSrv.updateSelectedObj(joint);
    //     this.activeSrv.fakeUpdateSelectedObj();
    //     this.gridUtils.dragJoint(
    //       this.activeSrv.selectedJoint,
    //       new Coord(
    //         this.nup.convertLength(joint.x, this.lengthUnit, unit),
    //         this.nup.convertLength(joint.y, this.lengthUnit, unit)
    //       )
    //     );
    //     this.jointForm.controls['input'].patchValue(wasInput);
    //   });
    //   this.lengthUnit = this.settingsService.lengthUnit.value;
    //   this.activeSrv.fakeUpdateSelectedObj();
    // }
    // });
  }

  getLinkProp(l: Link, propType: string) {
    if (l instanceof SliderBlock) {
      return;
    }
    const link = l as RealLink;
    switch (propType) {
      case 'mass':
        return link.mass;
      case 'massMoI':
        return link.massMoI;
      case 'CoMX':
        return link.CoM.x;
      case 'CoMY':
        // TODO: Implement logic to not have -1?
        return link.CoM.y * -1;
      case 'd':
        return link.d;
      case 'fill':
        return link.fill;
      case 'CoM_d1':
        return link.CoM_d1;
      case 'CoM_d2':
        return link.CoM_d2;
      case 'CoM_d3':
        return link.CoM_d3;
      case 'CoM_d4':
        return link.CoM_d4;
      default:
        return '?';
    }
  }

  /**
   * The traced path of one joint across every solved sample.
   *
   * Every lookup here is guarded, and none of the guards is theoretical. This
   * runs from a template binding, so a throw does not fail one path — it aborts
   * the whole change-detection pass, and the frame that would have drawn the
   * rest of the mechanism never renders. Asked for a joint that has just been
   * added, or during the window where a structural edit has emptied the solved
   * frames, it dereferenced `undefined` and took the canvas down with it.
   * Nothing to draw yet is an ordinary state; the honest answer is no path.
   */
  getJointPath(joint: Joint) {
    const solved = this.mechanisms[0];
    if (!solved || solved.joints.length === 0 || solved.joints[0].length === 0) {
      return '';
    }
    const jointIndex = this.joints.findIndex((j) => j.id === joint.id);
    if (jointIndex < 0 || !solved.joints[0][jointIndex]) {
      return '';
    }
    const at = (step: number) => {
      const sample = solved.joints[step][jointIndex];
      return `${sample.x} , ${sample.y}`;
    };
    let string = 'M' + at(0);
    for (let j_index = 1; j_index < solved.joints.length; j_index++) {
      string += 'L' + at(j_index);
    }
    return string;
  }

  oneValidMechanismExists() {
    if (this.mechanisms.length == 0 || this.mechanisms[0] === undefined) {
      return false;
    }
    return this.mechanisms[0].isMechanismValid();
  }

  mergeToJoints(joints: Joint[]) {
    joints.forEach((j) => {
      this.joints.push(j);
    });
  }

  mergeToLinks(links: Link[]) {
    links.forEach((l) => {
      this.links.push(l);
    });
  }

  determineNextLetter(additionalLetters?: string[]) {
    let lastLetter = '';
    if (this.joints.length === 0 && additionalLetters === undefined) {
      return 'A';
    }
    this.joints.forEach((j) => {
      if (j.id > lastLetter) {
        lastLetter = j.id;
      }
    });
    additionalLetters?.forEach((l) => {
      if (l > lastLetter) {
        lastLetter = l;
      }
    });
    return String.fromCharCode(lastLetter.charCodeAt(0) + 1);
  }

  createRevJoint(x: string, y: string, prevID?: string) {
    const x_num = roundNumber(Number(x), 3);
    const y_num = roundNumber(Number(y), 3);
    let id: string;
    if (prevID === undefined) {
      id = this.determineNextLetter();
    } else {
      id = this.determineNextLetter([prevID]);
    }
    return new RevJoint(id, x_num, y_num);
  }

  toggleWeldedJoint() {
    const joint = this.joints.find((j) => j.id === this.activeObjService.selectedJoint?.id) as
      RealJoint | undefined;
    if (!joint) return;

    if (!joint.isWelded) {
      this.weldJoint();
    } else if (joint.isWelded) {
      this.unweldSelectedJoint();
    }
  }

  private createNewCompoundLink(linksToWeld: RealLink[]): RealLink {
    const leaves = linksToWeld.flatMap((link) =>
      link.subset.length > 0
        ? (link.subset.filter((item) => item instanceof RealLink) as RealLink[])
        : [link]
    );
    return this.createNewCompoundLinkFromSubset(leaves);
  }

  private createNewCompoundLinkFromSubset(subset: RealLink[]): RealLink {
    const leaves = subset.filter(
      (link, index) => subset.findIndex((candidate) => candidate.id === link.id) === index
    );
    const newLinkJoints = leaves
      .flatMap((link) => link.joints)
      .filter(
        (joint, index, joints) =>
          joints.findIndex((candidate) => candidate.id === joint.id) === index
      );
    const id = newLinkJoints
      .map((joint) => joint.id)
      .sort()
      .join('');

    const totalMass = leaves.reduce((sum, link) => sum + link.mass, 0);
    const CoM =
      totalMass > 0
        ? new Coord(
            leaves.reduce((sum, link) => sum + link.mass * link.CoM.x, 0) / totalMass,
            leaves.reduce((sum, link) => sum + link.mass * link.CoM.y, 0) / totalMass
          )
        : new Coord(
            leaves.reduce((sum, link) => sum + link.CoM.x, 0) / Math.max(1, leaves.length),
            leaves.reduce((sum, link) => sum + link.CoM.y, 0) / Math.max(1, leaves.length)
          );
    const massMoI = leaves.reduce(
      (sum, link) =>
        sum +
        link.massMoI +
        link.mass * (Math.pow(link.CoM.x - CoM.x, 2) + Math.pow(link.CoM.y - CoM.y, 2)),
      0
    );

    const newLink = new RealLink(id, newLinkJoints, totalMass, massMoI, CoM, leaves);
    newLink.fill = leaves[0]?.fill ?? ColorService.instance?.getNextLinkColor() ?? '#555555';
    return newLink;
  }

  private rebuildJointGraph(): void {
    const realJoints = this.joints.filter((joint) => joint instanceof RealJoint) as RealJoint[];
    realJoints.forEach((joint) => {
      joint.links = [];
      joint.connectedJoints = [];
    });

    this.links.forEach((link) => {
      const jointsOnLink = link.joints.filter((joint) => joint instanceof RealJoint) as RealJoint[];
      jointsOnLink.forEach((joint) => {
        if (!joint.links.includes(link)) joint.links.push(link);
        jointsOnLink.forEach((otherJoint) => {
          if (
            otherJoint !== joint &&
            !joint.connectedJoints.some((candidate) => candidate.id === otherJoint.id)
          ) {
            joint.connectedJoints.push(otherJoint);
          }
        });
      });
    });
  }

  private attachForceToLink(force: Force, link: RealLink): void {
    this.links.forEach((candidate) => {
      candidate.forces = candidate.forces.filter((item) => item !== force && item.id !== force.id);
      if (candidate instanceof RealLink) {
        candidate.subset.forEach((subset) => {
          subset.forces = subset.forces.filter((item) => item !== force && item.id !== force.id);
        });
      }
    });
    force.link = link;
    if (!link.forces.some((candidate) => candidate.id === force.id)) link.forces.push(force);
  }

  private detachForce(force: Force): void {
    this.links.forEach((link) => {
      link.forces = link.forces.filter(
        (candidate) => candidate !== force && candidate.id !== force.id
      );
      if (link instanceof RealLink) {
        link.subset.forEach((subset) => {
          subset.forces = subset.forces.filter(
            (candidate) => candidate !== force && candidate.id !== force.id
          );
        });
      }
    });
    this.forces = this.forces.filter(
      (candidate) => candidate !== force && candidate.id !== force.id
    );
  }

  /**
   * The single point every structural edit passes through: re-derive the joint
   * graph, then repair or retire anything the edit invalidated.
   *
   * Public because it is the seam, not an implementation detail — a caller that
   * changes topology and does not come through here leaves the slot and weld
   * reconcilers unrun, which is exactly how `toggleSlider` came to leave a
   * Slide's RevJoint flagged with nothing behind it.
   */
  public finishStructuralEdit(save: boolean = true): void {
    this.rebuildJointGraph();
    this.reconcileSlots();
    this.reconcileAssemblyWelds();
    PositionSolver.setUpSolvingForces(this.forces);
    this.updateMechanism(save);
    this.onMechUpdateState.next(3);
  }

  /**
   * The root link that owns `link`, following welds. A carrier absorbed into a
   * compound keeps existing as a member of that compound's subset, so the
   * pointer stays valid while no longer naming a body any solver iterates.
   */
  private rootLinkOwning(link: Link): Link | undefined {
    const contains = (candidate: Link): boolean =>
      candidate.id === link.id ||
      (candidate instanceof RealLink && candidate.subset.some(contains));
    return this.links.find(contains);
  }

  /**
   * Make sure no slot has outlived what defines it (§2.8a).
   *
   * A carrier can be deleted, welded into a compound, or lose one of the two
   * joints that cut the slot -- to a deletion, or to a Phase 1.2 snap that
   * merges it away. Option A stores all three outside `links` and
   * `connectedJoints`, so nothing that rebuilds those structures notices. Left
   * alone the slider keeps a pointer to a link that is no longer a body, and
   * the next solve reads geometry from an object nothing else updates.
   *
   * A weld is recoverable: remap to the compound that swallowed the carrier.
   * Anything else is not, so the slider keeps its block and loses its
   * direction — it dangles, and the canvas draws it red until a carrier arrives
   * or the user grounds it.
   *
   * Phase 2 re-grounded it at its last angle instead, to keep the slider the
   * user drew. That kept the object and quietly invented the one thing about it
   * nobody had chosen: where it points. A slot's direction is geometry, and the
   * honest answer to losing it is to say so rather than to pick one.
   */
  private reconcileSlots(): void {
    this.joints.forEach((joint) => {
      if (!(joint instanceof PrisJoint) || !joint.isFloating) return;
      const carrier = joint.carrier!;
      const slotJointA = joint.slotJointA!;
      const slotJointB = joint.slotJointB!;
      const root = this.rootLinkOwning(carrier);
      if (root && root.id !== carrier.id) {
        joint.slideOn(root, slotJointA, slotJointB);
      }
      if (!root || !joint.isSlotWellFormed) {
        joint.detach();
      }
    });
  }

  /**
   * Make sure no weld is left describing something that is not there.
   *
   * Repair before you strip, in that order, which is the rule `reconcileSlots`
   * already set for slots. A weld says "everything here is rigid"; the compound
   * link is only how that is normally *represented*, so a flag that has outrun
   * its compound should be given one rather than thrown away. `mergeJoints`
   * takes a weld apart and rebuilds it, and a deletion that collapses a
   * compound leaves the flag behind, so both states are reachable from ordinary
   * edits.
   *
   * Stripping is for what cannot be repaired: a joint flagged welded that has
   * neither a slide assembly nor a compound has nothing left to be rigid about.
   * Turning the Slider toggle off at a Slide is how that arises.
   */
  private reconcileAssemblyWelds(): void {
    this.joints.forEach((joint) => {
      if (!(joint instanceof RealJoint) || !joint.isWelded) return;
      const assembly = slideAssemblyAt(joint);
      if (assembly) {
        // Several riders means the compound has not been built yet. Build it,
        // rather than leaving the mechanism in a state every consumer of the
        // resolver would have to tolerate.
        //
        // The flag comes off first because both guards on the weld path refuse
        // an already-welded joint — they are there to stop a second weld, and
        // this is the first one finishing rather than a second one starting.
        if (assembly.riders.length > 1) {
          joint.isWelded = false;
          if (this.weldJointTopology(joint)) {
            this.rebuildJointGraph();
          } else {
            joint.isWelded = true;
          }
        }
        return;
      }
      if (!this.compoundAt(joint)) {
        joint.isWelded = false;
        return;
      }

      // A weld that only got half way. A welded joint is rigid, so every body
      // meeting it belongs to one compound; here it is in two, or in one with a
      // loose bar beside it. The joint then draws its weld marker while one of
      // the links through it is still free to turn — welded and pinned at the
      // same time, which is not a state the model has an answer for and not one
      // a user can see the shape of.
      //
      // Repaired the same way the branch above repairs a Slide: take the flag
      // off (both weld guards refuse an already-welded joint, since they exist
      // to stop a *second* weld) and let the ordinary weld run, which fuses
      // everything at the joint into one body. Restore the flag if it will not.
      //
      // Nothing in the app builds this any more — welding a joint already in a
      // compound absorbs that compound — but a URL can carry it in, and a URL
      // is a compatibility surface: mechanisms saved by earlier versions have
      // to keep opening, and they have to open as something coherent.
      const bodiesAtJoint = this.links.filter(
        (link): link is RealLink => link instanceof RealLink && link.joints.includes(joint)
      );
      if (bodiesAtJoint.length > 1) {
        joint.isWelded = false;
        if (this.weldJointTopology(joint)) {
          this.rebuildJointGraph();
        } else {
          joint.isWelded = true;
        }
      }
    });
  }

  /**
   * Fold `source` into `target`: every link that used `source` now uses
   * `target`, and `source` stops existing. This is the release half of a
   * joint-onto-joint drag.
   *
   * Returns the refusal reason when the merge is illegal, so the caller can say
   * which rule it hit — a joint that silently declines to merge reads as a
   * broken drag rather than as a rule.
   */
  mergeJoints(source: RealJoint, target: RealJoint): MergeRefusal | undefined {
    // A sealed cylinder's interior joints are not attachment points: a merge
    // into the pin would hang a third joint on the rod (or a second link on
    // the block) and break the part. The two mounts remain legal targets —
    // they are exactly where a cylinder attaches to the rest of the linkage.
    const cylinders = this.sealedStructures();
    if (
      cylinders.some(
        (sealed) => isCylinderInterior(sealed, source) || isCylinderInterior(sealed, target)
      )
    ) {
      return 'sealed-cylinder';
    }
    const refusal = refuseJointMerge(source, target, this.joints);
    if (refusal) {
      return refusal;
    }

    // A weld is a joint flag plus a compound link built around it, so the two
    // have to be taken apart before the topology moves and rebuilt afterwards.
    // Going through the weld path rather than editing compounds by hand is what
    // makes the result a real compound instead of a joint merely flagged welded
    // with a stray link beside it.
    const shouldWeld = source.isWelded || target.isWelded;
    if (source.isWelded) this.unweldTopology(source);
    if (target.isWelded) this.unweldTopology(target);

    // Ground and input are things the user set deliberately. A merge that
    // dropped one would quietly change what the mechanism is, so the survivor
    // inherits both.
    target.ground = target.ground || source.ground;
    target.input = target.input || source.input;

    this.links.forEach((link) => this.replaceJointInLink(link, source, target));

    // A slot names two joints on its carrier, and those names are references
    // rather than lookups — so a slot whose endpoint was just merged away still
    // pointed at a joint that no longer exists in any link. `isSlotWellFormed`
    // then answered no, and everything downstream agreed: the slider stopped
    // being floating, its cylinder stopped resolving, and the skin disappeared
    // with nothing said. Attaching a ram to the rest of a linkage is exactly
    // what this gesture is for, so it was deleting the part in the one case it
    // most needed to survive.
    this.joints.forEach((joint) => {
      if (!(joint instanceof PrisJoint) || !joint.isFloating) return;
      const a = joint.slotJointA!;
      const b = joint.slotJointB!;
      if (a.id !== source.id && b.id !== source.id) return;
      joint.slideOn(
        joint.carrier!,
        a.id === source.id ? target : a,
        b.id === source.id ? target : b
      );
    });

    this.joints = this.joints.filter((joint) => joint.id !== source.id);

    // Only link membership has moved so far. Everything below reads joint.links
    // or joint.connectedJoints, so connectivity has to be re-derived first.
    this.rebuildJointGraph();

    // A slider carried across by the merge has to sit on its new pin: the
    // prismatic joint and the pin it rides are coincident by construction.
    this.joints.forEach((joint) => {
      if (!(joint instanceof PrisJoint)) return;
      if (!joint.connectedJoints.some((connected) => connected.id === target.id)) return;
      joint.x = target.x;
      joint.y = target.y;
    });

    if (this.activeObjService.selectedJoint?.id === source.id) {
      this.activeObjService.updateSelectedObj(target);
    }

    // A refusal here is not silent: canBeWelded declines a grounded, driven, or
    // slider-carrying joint, and the caller reports the survivor's actual weld
    // state rather than assuming the weld took.
    if (shouldWeld) this.weldTopology(target);

    // No save here: a merge is the tail of a drag gesture, and the gesture owns
    // the single undo entry it earns (see DragStateService.release).
    this.finishStructuralEdit(false);
    return undefined;
  }

  private replaceJointInLink(link: Link, source: RealJoint, target: RealJoint): void {
    if (link instanceof RealLink) {
      link.subset.forEach((sub) => this.replaceJointInLink(sub, source, target));
    }
    const index = link.joints.findIndex((joint) => joint.id === source.id);
    if (index === -1) {
      return;
    }

    link.joints[index] = target;
    // Link ids are the sorted concatenation of their joint letters, which is
    // what createNewCompoundLinkFromSubset builds and what the URL codec reads.
    link.id = link.joints
      .map((joint) => joint.id)
      .sort()
      .join('');
    link.fixedLocations = link.fixedLocations.map((location) =>
      location.id === source.id ? { id: target.id, label: target.id } : location
    );
    if (link.fixedLocation.fixedPoint === source.id) {
      link.fixedLocation.fixedPoint = target.id;
    }

    if (link instanceof RealLink) {
      link.CoM = RealLink.determineCenterOfMass(link.joints);
      link.reComputeDPath();
    }
  }

  /**
   * What each joint's slot was, by joint id, so Slider off and on again restores
   * it (§4.1).
   *
   * Keyed by id rather than held on the joint, because undo is a stack of URL
   * strings: every undo rebuilds the mechanism from scratch and the objects that
   * come back are new ones. A stash on the object would be destroyed by an undo
   * and a redo that visibly changed nothing, so toggling Slider on afterwards
   * would dangle instead of restoring what the panel promised to remember.
   *
   * Ids are reused after a deletion, so `deleteJoint` clears the entry -- a
   * stale stash inheriting a letter would hand a new joint someone else's slot.
   *
   * Deliberately not serialized: a convenience within one editing session, not
   * state a shared URL should carry.
   */
  private readonly slotStashes = new Map<
    string,
    {
      ground: boolean;
      angleRad: number;
      carrierId?: string;
      slotJointAId?: string;
      slotJointBId?: string;
    }
  >();

  /**
   * Drop everything remembered about the mechanism that is being replaced.
   *
   * The slot stashes are keyed by joint letter, which is unique within a
   * mechanism and says nothing across two of them. Loading a different project
   * in place would otherwise hand its joint B whatever the last project's
   * joint B happened to remember -- a grounded guide at 45 degrees appearing
   * on a joint that never had one.
   *
   * Undo does not call this: continuing one mechanism's history is exactly the
   * case these maps exist to survive.
   */
  forgetSessionPreferences(): void {
    this.slotStashes.clear();
  }

  deleteJoint() {
    // Deleting a mount (or, defensively, any member joint) of a sealed cylinder
    // takes the whole assembly with it (§ cylinder 5) — and then goes on to
    // delete the joint itself.
    //
    // It used to stop at the cylinder. A mount held by some other link survived
    // its own deletion, and so did that link: asked to delete joint K, the app
    // removed the ram and left K sitting on the bar it shared with M. "Delete
    // Cylinder" on the joint's own menu still means only the cylinder, and says
    // so; this is the generic Delete, which has one meaning everywhere else —
    // the joint goes, and so does any link that cannot stand without it.
    const sealed = this.cylinderAt(this.activeObjService.selectedJoint);
    if (sealed) {
      const doomed = this.activeObjService.selectedJoint;
      this.deleteCylinderTopology(sealed);
      // The cascade may already have taken it: a mount no other link holds is
      // removed as orphaned, and there is nothing left to delete.
      if (!this.joints.some((joint) => joint.id === doomed.id)) {
        this.activeObjService.updateSelectedObj(undefined);
        this.finishStructuralEdit(true);
        return;
      }
    }
    // Deleting a joint of a NEIGHBOUR welded to a mount must not take the
    // cylinder with it: dismantling the compound through the generic path
    // stripped the seal. Unweld the mount first, so the compound dissolves
    // back into the neighbour's own bar — which is what the deletion then
    // operates on — and the cylinder stands untouched.
    const doomed = this.activeObjService.selectedJoint;
    for (const cyl of this.sealedStructures()) {
      for (const mount of [cyl.barrelFar, cyl.rodFar]) {
        if (
          mount instanceof RealJoint &&
          mount.isWelded &&
          doomed.id !== mount.id &&
          doomed.links.some(
            (l) => l instanceof RealLink && l.subset.length > 0 && l.joints.includes(mount)
          )
        ) {
          this.unweldTopology(mount);
        }
      }
    }
    // A gesture in flight targets a joint that is about to stop existing. The
    // pointer keeps sending moves after the delete -- from the keyboard, or a
    // second pointer -- and the drag then writes through a SliderBlock whose
    // joint list no longer holds what it is looking for.
    this.injector.get(DragStateService).cancel();
    this.slotStashes.delete(this.activeObjService.selectedJoint.id);
    const jointIndex = this.gridUtils.findJointIDIndex(
      this.activeObjService.selectedJoint.id,
      this.joints
    );
    //if the joint that is meant to be deleted is the one selected in activeObjectSrv, set the activeObjectSrv to undefined
    if (
      this.activeObjService.objType === 'Joint' &&
      this.activeObjService.selectedJoint.id === this.activeObjService.selectedJoint.id
    ) {
      this.activeObjService.updateSelectedObj(undefined);
    }

    this.activeObjService.selectedJoint.links.forEach((l) => {
      // TODO: May wanna check this to be sure...
      if (l.joints.length < 3) {
        // TODO: Utilize this same logic when you delete ImagJoint and ImagLink
        // TODO: this.deleteJointFromConnectedJoints(delJoint);
        // TODO: this.deleteLinkFromConnectedLinks(delLink);
        // delete forces on link
        if (l instanceof RealLink) {
          [...l.forces].forEach((force) => this.detachForce(force));
        }
        // go to other connected joint and remove this link from its connectedLinks and joint from connectedJoint
        // There may be an easier way to do this but this logic works :P
        const desiredJointID =
          l.joints[0].id === this.activeObjService.selectedJoint.id
            ? l.joints[1].id
            : l.joints[0].id;
        const desiredJointIndex = this.gridUtils.findJointIDIndex(desiredJointID, this.joints);
        const deleteJointIndex = this.gridUtils.findJointIDIndex(
          this.activeObjService.selectedJoint.id,
          (this.joints[desiredJointIndex] as RealJoint).connectedJoints
        );
        (this.joints[desiredJointIndex] as RealJoint).connectedJoints.splice(deleteJointIndex, 1);
        const deleteLinkIndex = (this.joints[desiredJointIndex] as RealJoint).links.findIndex(
          (lin) => {
            if (!(lin instanceof RealLink)) {
              return;
            }
            return lin.id === l.id;
          }
        );
        (this.joints[desiredJointIndex] as RealJoint).links.splice(deleteLinkIndex, 1);
        // remove link from links
        const deleteLinkIndex2 = this.links.findIndex((li) => li.id === l.id);
        this.links.splice(deleteLinkIndex2, 1);
      } else {
        l.joints.forEach((jt) => {
          if (!(jt instanceof RealJoint)) {
            return;
          }
          if (jt.id === this.activeObjService.selectedJoint.id) {
            return;
          }
          const deleteJointIndex = jt.connectedJoints.findIndex(
            (jjj) => jjj.id === this.activeObjService.selectedJoint.id
          );
          jt.connectedJoints.splice(deleteJointIndex, 1);
        });
        l.id = l.id.replace(this.activeObjService.selectedJoint.id, '');
        const delJointIndex = l.joints.findIndex(
          (jj) => jj.id === this.activeObjService.selectedJoint.id
        );
        l.joints.splice(delJointIndex, 1);
        // TODO: We should put this within a helper function since I feel that this function is called often in the code...
        if (!(l instanceof RealLink)) {
          return;
        }
        const subsetNum = l.subset.length;
        if (subsetNum === 0) {
          return;
        }
        let idSubs: string[] = [];
        l.subset.forEach((s) =>
          idSubs.push(s.id.replace(this.activeObjService.selectedJoint.id, ''))
        );

        function deleteJointFromLink(l: Link, j: Joint) {
          let delJointIndex = l.joints.findIndex((jt) => jt.id === j.id);
          if (delJointIndex === -1) {
            return;
          }
          l.joints.splice(delJointIndex, 1);
          l.id = l.id.replace(j.id, '');
          delJointIndex = l.fixedLocations.findIndex((fixed) => fixed.id === j.id);
          if (delJointIndex === -1) {
            return;
          }
          l.fixedLocations.splice(delJointIndex, 1);
          if (l.fixedLocation.fixedPoint === j.id) {
            l.fixedLocation.fixedPoint = 'com';
          }
        }

        for (
          let l_subset_index = 0;
          l_subset_index < l.subset.length;
          l_subset_index = l_subset_index + 1
        ) {
          const sub = l.subset[l_subset_index];
          const selectedJoint = this.activeObjService.selectedJoint;
          deleteJointFromLink(l, selectedJoint);
          deleteJointFromLink(sub, selectedJoint);
          const tempIdSubs = idSubs.filter((str) => str !== sub.id);
          // sub contains id that is not shared with any other subset
          if (!sub.id.split('').some((char) => tempIdSubs.some((str) => str.includes(char)))) {
            // This link will be pushed to this.links
            if (sub.joints.length > 1) {
              sub.joints.forEach((childJoint) => {
                if (!(childJoint instanceof RealJoint)) {
                  return;
                }
                let delLinkIndex = childJoint.links.findIndex((li) => li.id === l.id);
                childJoint.links.splice(delLinkIndex, 1);
                childJoint.links.push(sub);
                childJoint.connectedJoints = [];
                childJoint.links.forEach((li) => {
                  if (!(li instanceof RealLink)) {
                    return;
                  }
                  li.joints.forEach((jt) => {
                    // childJoint does not contain this joint and it is not replicate of itself
                    if (
                      childJoint.connectedJoints.findIndex((jt2) => jt2.id === jt.id) !== -1 ||
                      jt.id === childJoint.id
                    ) {
                      return;
                    }
                    childJoint.connectedJoints.push(jt);
                  });
                });
                // childSub.link.forEach(jt => childJoint.connectedJoints.push(jt));
              });
              this.links.push(sub);
              // This is an orphaned joint
            } else if (sub.joints.length === 1) {
              // Check for condition 1 (remove joint and continue from logic)
              const curSubIndex = l.subset.findIndex((su) => su.id === sub.id);
              let cond1 = false;
              l.subset.forEach((su, su_index) => {
                if (!(su instanceof RealLink) || su_index === curSubIndex) {
                  return;
                }
                if (su.joints.findIndex((jt) => jt.id === sub.joints[0].id) !== -1) {
                  cond1 = true;
                }
              });
              if (cond1) {
                // just splice the l_sub_index from l.subset
                l.subset.splice(l_subset_index, 1);
                l_subset_index = l_subset_index - 1;
                continue;
              }
              // regular orphaned joint
              const delLinkIndex = (sub.joints[0] as RealJoint).links.findIndex(
                (li) => li.id === l.id
              );
              (sub.joints[0] as RealJoint).links.splice(delLinkIndex, 1);
              (sub.joints[0] as RealJoint).connectedJoints = [];
              (sub.joints[0] as RealJoint).links.forEach((childLink) => {
                if (!(childLink instanceof RealLink)) {
                  return;
                }
                // Check to see if joint from link already within connectedJoints
                childLink.joints.forEach((jt) =>
                  (sub.joints[0] as RealJoint).connectedJoints.push(jt)
                );
              });
              const fixedLocationIndex = l.fixedLocations.findIndex(
                (fixedloc) => fixedloc.id === sub.joints[0].id
              );
              l.fixedLocations.splice(fixedLocationIndex, 1);
              if (l.fixedLocation.fixedPoint === sub.joints[0].id) {
                l.fixedLocation.fixedPoint = 'com';
              }
              if (cond1) {
                l.subset.splice(l_subset_index, 1);
                l_subset_index = l_subset_index - 1;
                continue;
              }
            }
            const sliceIndex = l.subset.findIndex((s) => s.id === sub.id);
            l.subset.splice(sliceIndex, 1);
            // go through the original link (l) and make sure
            // 1. the link does not contain any joints from sub
            // 2. l's joints' neighboring joint does not contain joints from sub
            sub.joints.forEach((jt) => {
              if (!(jt instanceof RealJoint)) {
                return;
              }
              const deleteJointIndex = l.joints.findIndex((jt2) => jt2.id === jt.id);
              if (deleteJointIndex === -1) {
                return;
              }
              l.joints.splice(deleteJointIndex, 1);
              l.id = l.id.replace(jt.id, '');
            });
            l.joints.forEach((jt) => {
              if (!(jt instanceof RealJoint)) {
                return;
              }
              for (
                let connectedJointIndex = 0;
                connectedJointIndex < jt.connectedJoints.length;
                connectedJointIndex++
              ) {
                const jt2 = jt.connectedJoints[connectedJointIndex] as RealJoint;
                // if jt2 within sub, splice jt2
                const delConnectedJoint = sub.joints.findIndex((jt3) => jt3.id === jt2.id) !== -1;
                if (delConnectedJoint) {
                  jt.connectedJoints.splice(connectedJointIndex, 1);
                  connectedJointIndex = connectedJointIndex - 1;
                }
                // make sure the deletedJoint is also not a connectedJoint
              }
            });
            l_subset_index = l_subset_index - 1;
          } else if (sub.id.length === 1) {
            // special case, can slice this subset
            l.subset.splice(l_subset_index, 1);
            l_subset_index = l_subset_index - 1;
          }
        }
        // Now that all subsets have been gone over, do the final check.
        //
        // A compound down to one leaf stops being a compound: the leaf takes
        // its place as an ordinary link.
        //
        // Both branches used to look the surviving link up *after* reassigning
        // `l` to the leaf, so they searched `links` for the leaf's id and got
        // -1 whenever the leaf was not already top-level — and `splice(-1, 1)`
        // does not do nothing. It removes the *last* link in the mechanism.
        // Deleting one joint quietly deleted an unrelated body somewhere else
        // on the grid, and left the emptied compound standing beside the leaf
        // it was supposed to become. It only ever went unnoticed because the
        // id rewriting above usually leaves the compound and its last leaf
        // sharing a name, and then the wrong lookup happens to find the right
        // link.
        const removeLink = (id: string) => {
          const at = this.links.findIndex((li) => li.id === id);
          if (at >= 0) this.links.splice(at, 1);
        };
        if (l.subset.length === 1) {
          const compoundId = l.id;
          const survivor = l.subset[0];
          removeLink(compoundId);
          removeLink(survivor.id);
          this.links.push(survivor);
          survivor.joints.forEach((jt) => {
            if (!(jt instanceof RealJoint)) {
              return;
            }
            jt.isWelded = false;
            jt.links = [];
            jt.links.push(survivor);
          });
          l = survivor;
        } else if (l.subset.length === 0) {
          removeLink(l.id);
        }
      }

      if (l instanceof SliderBlock) {
        //Special case, remove the other joint on a pistion
        l.joints.forEach((j) => {
          if (j.id !== this.activeObjService.selectedJoint.id) {
            this.joints.splice(this.gridUtils.findJointIDIndex(j.id, this.joints), 1);
          }
        });
      }

      // for any forces that are outside of the link, move them to the closest point on the hull
      if (l instanceof RealLink) {
        l.forces.forEach((f) => {
          if (!(l instanceof RealLink)) {
            return;
          }
          let fx = f.startCoord.x;
          let fy = f.startCoord.y;

          // if force is already inside hull, do nothing
          if (l.isPointInsideHull(fx, fy)) {
            return;
          }

          // go through hull and find closest point
          let hull = l.getHullPoints();
          let closestDistance = -1;
          let cx, cy;
          for (let i = 0; i < hull.length - 1; i++) {
            let x1 = hull[i][0];
            let y1 = hull[i][1];
            let x2 = hull[i + 1][0];
            let y2 = hull[i + 1][1];

            [cx, cy] = point_on_line_segment_closest_to_point(fx, fy, x1, y1, x2, y2);
            let distance = distance_points(fx, fy, cx, cy);

            if (closestDistance === -1 || distance < closestDistance) {
              closestDistance = distance;
              fx = cx;
              fy = cy;
            }
          }

          // (fx, fy) is now the closest point on the hull to the force start position
          // move force there
          f.moveForceTo(fx, fy);
        });
      }
    });

    function deleteJointWithinLinkAndSubsets(link: RealLink, joint: Joint) {
      // Delete desired properties within link
      link.id = link.id.replace(joint.id, '');
      const fixedLocationIndex = link.fixedLocations.findIndex((fl) => fl.id === joint.id);
      if (fixedLocationIndex !== -1) {
        if (link.fixedLocation.fixedPoint === joint.id) {
          link.fixedLocation.fixedPoint = 'com';
        }
        link.fixedLocations.splice(fixedLocationIndex, 1);
      }
      const jointIndex = link.joints.findIndex((j) => j.id === joint.id);
      if (jointIndex !== -1) {
        link.joints.splice(jointIndex, 1);
      }
      // Check to see if link contains multiple subsets
      if (!link.isWelded) {
      } else {
        link.subset.forEach((li) => {
          if (!(li instanceof RealLink)) {
            return;
          }
          deleteJointWithinLinkAndSubsets(li, joint);
        });
      }
    }

    // Need to update the link's subset properties
    if (this.activeObjService.selectedJoint) {
      this.activeObjService.selectedJoint.links.forEach((l) => {
        if (!(l instanceof RealLink)) {
          return;
        }
        deleteJointWithinLinkAndSubsets(l, this.activeObjService.selectedJoint);
      });
    }
    this.joints.splice(jointIndex, 1);
    // if (this.activeObjService.selectedLink !== undefined) {
    //   this.activeObjService.selectedLink.d = this.activeObjService.selectedLink.getPathString();
    // }
    // Through the shared path, so a slot whose defining joint was just deleted
    // gets reconciled. Deleting a joint by itself is the one way to strand a
    // slot that does not go through mergeJoints or deleteLink.
    this.finishStructuralEdit(false);
    setTimeout(() => {
      this.onMechUpdateState.next(3);
    });
  }

  splitSubset(subset: Link[], joint: RealJoint): Link[][] {
    //We need to stop assuming there are two links connected to the joint, there could be more
    const linksConnectedToJoint = subset.filter((l) => l.joints.includes(joint));

    const subsets: Link[][] = [];
    linksConnectedToJoint.forEach((l) => {
      //Find the subset of links excluding the current link
      const avoidThese = linksConnectedToJoint.filter((ll) => ll.id !== l.id);
      subsets.push(this.findConnectedLinksReccusively(l, avoidThese, subset, []));
    });

    return subsets;
  }

  deleteForce(force: Force = this.activeObjService.selectedForce) {
    if (!force) return;
    this.detachForce(force);
    this.updateMechanism(true);
    this.onMechUpdateState.next(3);
  }

  changeForceDirection() {
    this.activeObjService.selectedForce.reverseDirection();
    this.updateMechanism(true);
    this.onMechUpdateState.next(2);
  }

  changeForceLocal() {
    this.activeObjService.selectedForce.setLocal(!this.activeObjService.selectedForce.local);
    this.updateMechanism(true);
    this.onMechUpdateState.next(2);
  }

  addJointAtCOM() {
    let link = this.activeObjService.selectedLink;
    let com = link.CoM;
    //To avoid visually breaking the link by having it perfectly line up
    //Find the first two joints of the link and move the com perpendicular to the line
    let joint1 = link.joints[0];
    let joint2 = link.joints[1];

    //Get the angle of the line between the two joints
    let angle = Math.atan2(joint2.y - joint1.y, joint2.x - joint1.x);
    //Get the perpendicular angle
    let perpAngle = angle + Math.PI / 2;
    //Get the perpendicular vector
    let perpVector = new Coord(Math.cos(perpAngle), Math.sin(perpAngle));
    //Scale this vector to be 0.01 of a user unit (in model units)
    perpVector = perpVector.normalize().scale(0.01 * MODEL_SCALE);
    //Add this vector to the com
    com = com.add(perpVector);

    this.addJointAt(com);
  }

  addJointAt(coord: Coord) {
    const newId = this.determineNextLetter();
    const newJoint = new RevJoint(newId, coord.x, coord.y);
    this.graftJointOnto(newJoint, this.activeObjService.selectedLink);
    this.joints.push(newJoint);
    this.onMechUpdateState.next(3);
    this.updateMechanism(true);
  }

  /**
   * Make an existing joint a member of `link`: the body grows to include it and
   * turns as one rigid piece from then on.
   *
   * Lifted out of `addJointAt` so a cylinder's mount can arrive the same way a
   * tracer point does. Neither pushes the joint onto `this.joints` or saves —
   * a mount is created as part of a larger assembly that has its own single
   * undo entry, and grafting is one step of building it rather than an edit of
   * its own.
   */
  private graftJointOnto(joint: RealJoint, link: RealLink): void {
    link.joints.forEach((member) => {
      if (!(member instanceof RealJoint)) return;
      member.connectedJoints.push(joint);
      joint.connectedJoints.push(member);
    });
    // A welded compound is drawn from its leaves, so the leaf the user actually
    // clicked has to grow too or the new joint belongs to a body nothing draws.
    if (link.isWelded && link.lastSelectedSublink) {
      link.lastSelectedSublink.id = link.lastSelectedSublink.id.concat(joint.id);
      link.lastSelectedSublink.fixedLocations.push({ id: joint.id, label: joint.id });
      link.lastSelectedSublink.joints.push(joint);
    }
    joint.links.push(link);
    link.joints.push(joint);
    link.id += joint.id;
    link.d = link.getPathString();
  }

  deleteLink() {
    const link = this.activeObjService.selectedLink;
    // Deleting any member of a sealed cylinder — barrel, rod, block, or a
    // compound that swallowed one — deletes the whole assembly (§ cylinder 5).
    const sealed = this.cylinderAt(link);
    if (sealed) {
      this.deleteCylinder(sealed);
      return;
    }
    const linkIndex = this.links.findIndex((candidate) => candidate === link);
    if (linkIndex === -1) return;

    const ownedLinkIDs = new Set([
      link.id,
      ...(link instanceof RealLink ? link.subset.map((subset) => subset.id) : []),
    ]);
    this.forces
      .filter((force) => ownedLinkIDs.has(force.link.id))
      .forEach((force) => this.detachForce(force));
    this.links.splice(linkIndex, 1);
    this.joints = this.joints.filter(
      (joint) =>
        !(joint instanceof RealJoint) ||
        this.links.some((candidate) => candidate.joints.includes(joint))
    );
    this.activeObjService.updateSelectedObj(undefined);
    this.finishStructuralEdit(true);
  }

  /** Bumped by updateMechanism; consumers key caches on it. */
  cylinderRevision = 0;
  /**
   * Bumped whenever the drawn pose changes — by a rebuild, and by every
   * animation frame.
   *
   * Structure and pose need separate counters. A sealed cylinder's *drawing*
   * is a function of where its joints are, and keying it on the structure
   * revision alone left the skin painted at the pose the mechanism was built
   * in: correct until Phase 5 made a cylinder something that could be driven,
   * at which point the boom animated and the cylinder sat still on top of it.
   * Reusing the structure counter here instead would rebuild the assembly walk
   * on every frame to answer a question whose answer cannot have changed.
   */
  poseRevision = 0;
  private structuresCache?: { revision: number; list: Cylinder[] };

  /**
   * The sealed cylinders, by structure, cached per revision. The structural
   * walk is O(joints) with an assembly resolution per joint, and it was being
   * re-run by every guard, label, mark list and hover check on every change
   * detection pass — dozens of times per pointer move. One list per revision
   * is the same answer at none of the cost.
   */
  sealedStructures(): Cylinder[] {
    if (this.structuresCache?.revision !== this.cylinderRevision) {
      this.structuresCache = {
        revision: this.cylinderRevision,
        list: sealedCylinderStructures(this.joints),
      };
    }
    return this.structuresCache.list;
  }

  /**
   * Why this mechanism will not run, in its own terms (§6).
   *
   * "This linkage is not valid" is true of every failure and useful for none of
   * them. An excavator boom is three cylinders and therefore three degrees of
   * freedom, and the plan named that as the single most likely source of
   * disappointment once cylinders existed — so the number it actually has is
   * the thing to say, not a checklist to read against.
   *
   * Returns nothing when the mechanism is fine.
   */
  invalidReason(): string | undefined {
    if (this.oneValidMechanismExists()) {
      return undefined;
    }
    if (this.joints.length === 0) {
      return undefined;
    }
    const dangling = this.joints.filter((joint) => joint instanceof PrisJoint && joint.isDangling);
    if (dangling.length > 0) {
      const names = dangling.map((joint) => joint.name || joint.id).join(', ');
      return `Slider ${names} has nothing to slide along. Drag it onto a link to cut a slot, or ground it to fix its direction.`;
    }
    if (!this.joints.some((joint) => joint instanceof RealJoint && joint.input)) {
      return 'No joint is driven. Right-click a joint and choose Add Input to say what moves the mechanism.';
    }
    // A driven joint the actuator record cannot describe -- most often because
    // an edit added a third body to it long after Driven was switched on. The
    // toggle refuses this, but nothing stops a later edit walking around it.
    const driven = this.joints.find((joint) => joint instanceof RealJoint && joint.input);
    if (driven) {
      const refusal = describeActuator(driven);
      if (typeof refusal === 'string') {
        return refusal;
      }
    }
    const dof = this.mechanisms[0]?.dof;
    if (dof !== undefined && Number.isNaN(dof)) {
      return 'Nothing is holding this mechanism in place. Ground a joint, or ground a slider\u2019s guide.';
    }
    if (dof !== undefined && dof !== 1) {
      return dof > 1
        ? `This mechanism has ${dof} degrees of freedom, and one input can only drive one. Add a constraint, or remove a body.`
        : `This mechanism has ${dof} degrees of freedom \u2014 it is over-constrained and cannot move. Remove a constraint.`;
    }
    const noTravel = PositionSolver.unusableCylinderDrive;
    if (noTravel) {
      const cylinder = this.sealedStructures().find((found) => found.slider.id === noTravel);
      const name = cylinder ? this.cylinderName(cylinder) : noTravel;
      return `Cylinder ${name} has no travel: its barrel is too short to slide in at all. Lengthen the cylinder, or reduce Object Scale — a larger scale draws everything on the rod bigger without lengthening the barrel.`;
    }
    const stuck = PositionSolver.unsolvableJoints;
    if (stuck.length > 0) {
      return `These joints cannot be placed from the ones around them: ${stuck.join(', ')}. They may need another link, or a driven joint nearer to them.`;
    }
    return 'This mechanism reached a position it could not solve from the one before it \u2014 usually a toggle, where the linkage locks.';
  }

  /**
   * What a mechanism that *does* run still cannot do, in its own terms.
   *
   * Separate from `invalidReason` because the mechanism is not invalid: it
   * solves, it animates, and every number it reports is right. It simply cannot
   * use the whole of a cylinder it contains, because the linkage binds \u2014 or
   * reaches a toggle \u2014 before the ram runs out of barrel. The stroke is the
   * cylinder's own property and nothing constrains it to what the mechanism
   * around it can follow, so this can only be found by running the thing.
   *
   * Warned about rather than clamped, deliberately. Clamping would silently
   * resize a part the user sized, and the interesting information \u2014 *this ram
   * is bigger than this machine needs* \u2014 is exactly what clamping would hide.
   */
  cylinderReachWarning(): string | undefined {
    // A template getter, so this is asked on every change-detection pass while
    // the answer only changes when the mechanism is rebuilt. `cylinderRevision`
    // is bumped exactly once per rebuild and never by an animation frame, which
    // is the difference that matters: keyed on the pose instead, the sweep
    // below would run against all 360 samples on every frame of playback.
    if (this.reachWarningRevision === this.cylinderRevision) {
      return this.reachWarningCache;
    }
    this.reachWarningRevision = this.cylinderRevision;
    this.reachWarningCache = this.computeCylinderReachWarning();
    return this.reachWarningCache;
  }

  private reachWarningRevision = -1;
  private reachWarningCache: string | undefined;

  private computeCylinderReachWarning(): string | undefined {
    const solved = this.mechanisms[0];
    if (!solved || !this.oneValidMechanismExists()) return undefined;
    const frames = solved.joints.length;
    if (frames < 2) return undefined;

    for (const cylinder of this.sealedStructures()) {
      const r = 0.15 * SettingsService.objectScale;
      const barrelLength = getDistance(cylinder.barrelFar, cylinder.barrelNear);
      const travel = cylinderStrokeAlong(barrelLength, r);
      if (!travel.usable) continue;
      const stroke = travel.max - travel.min;

      const indexOf = (id: string) => solved.joints[0].findIndex((joint) => joint.id === id);
      const anchor = indexOf(cylinder.barrelFar.id);
      const pin = indexOf(cylinder.pin.id);
      if (anchor < 0 || pin < 0) continue;

      let low = Infinity;
      let high = -Infinity;
      for (let t = 0; t < frames; t++) {
        const along = getDistance(solved.joints[t][anchor], solved.joints[t][pin]);
        low = Math.min(low, along);
        high = Math.max(high, along);
      }
      const used = high - low;
      // A clean reversal touches both stops, so anything short of the whole
      // stroke by more than the solver's own tolerance is the linkage stopping
      // the ram rather than the ram stopping itself.
      // Three sample steps of slack, and the number comes from the sampling
      // rather than from taste. A reversing drive turns round at whichever
      // sample first fails, not at the limit itself, so even a ram the linkage
      // follows perfectly comes up about one step short at each end -- a fixed
      // tolerance in model units either cried wolf on every cylinder or went
      // deaf on small ones, because the shortfall scales with the stroke.
      if (used >= stroke - (3 * stroke) / SAMPLES_PER_STROKE) continue;
      const percent = Math.round((used / stroke) * 100);
      return `Cylinder ${this.cylinderName(cylinder)} can only use ${percent}% of its stroke \u2014 the linkage binds before the cylinder does. Shorten its travel, or give the mechanism more room.`;
    }
    return undefined;
  }

  /** What to call a cylinder in a message: its two mounts, as the panel titles it. */
  private cylinderName(cylinder: Cylinder): string {
    return (
      (cylinder.barrelFar.name || cylinder.barrelFar.id) +
      (cylinder.rodFar.name || cylinder.rodFar.id)
    );
  }

  /** The sealed cylinder a joint or link belongs to, if any. */
  cylinderAt(obj: Joint | Link | undefined): Cylinder | undefined {
    if (obj instanceof Joint) return cylinderOfJointIn(this.sealedStructures(), obj);
    if (obj instanceof Link) return cylinderOfLinkIn(this.sealedStructures(), obj);
    return undefined;
  }

  /**
   * Every sealed cylinder a joint belongs to, not just the first.
   *
   * Two rams can share a mount — an excavator's boom and stick meet that way,
   * and it is the natural thing to draw. `cylinderAt` answers with whichever
   * one happens to come first, which is right for "what am I looking at" and
   * wrong for "what has to move": dragging a shared mount re-posed one ram
   * parametrically and left the other to be straightened afterwards by the
   * normalizer, which holds the mounts and can only move the interior — so the
   * second ram silently changed size to absorb a drag meant for the first.
   */
  cylindersAt(joint: Joint | undefined): Cylinder[] {
    if (!joint) return [];
    return this.sealedStructures().filter((cylinder) =>
      cylinderJoints(cylinder).some((member) => member.id === joint.id)
    );
  }

  /**
   * Build a complete cylinder from the two points of the creation gesture
   * (§ cylinder 2): `start` is the barrel-side mount, `end` is where the rod
   * finishes. The drawn span sets the member lengths (fixture-gallery
   * proportions, minimum span clamped in `cylinderCreationLayout` so a
   * zero-length click cannot make a degenerate part); the assembly — barrel
   * with its slot, block and welded pin, sealed slider, rod — is exactly
   * collinear along the drawn axis by construction.
   *
   * `mountAt` is the joint version of `mountOn`: started from a joint's own
   * menu, the barrel's mount *is* that joint rather than a new one beside it,
   * so the ram hangs off everything already meeting there. A second joint at
   * the same point would look identical and behave like neither.
   *
   * One `finishStructuralEdit(true)` at the end makes creation one undo entry.
   */
  createCylinderFrom(start: Coord, end: Coord, mountOn?: RealLink, mountAt?: RealJoint): void {
    // A weld says everything meeting here is one rigid body. A ram's mount
    // arriving would be a third body inside that statement without being part
    // of it, and the reconcilers then disagree about what the compound is —
    // which is a broken mechanism rather than a refused edit. The menu greys
    // the item out; this is the same rule where the edit actually happens, so
    // no other caller can get round it.
    if (mountAt?.isWelded) {
      NewGridComponent.sendNotification(
        'This joint is welded, so a cylinder mounted on it would be a third body inside one rigid one. Unweld it, or attach the cylinder to the link instead.'
      );
      return;
    }
    const creation = cylinderCreationLayout(start, end, this.settingsService.objectScale);

    const taken = mountAt ? [mountAt.id] : [];
    const aId = mountAt ? mountAt.id : this.determineNextLetter();
    const bId = this.determineNextLetter(taken.concat(aId));
    const cId = this.determineNextLetter([bId]);
    const dId = this.determineNextLetter([cId]);
    const pId = this.determineNextLetter([dId]);

    const place = (at: { x: number; y: number }): [number, number] => [
      roundNumber(at.x, 3),
      roundNumber(at.y, 3),
    ];
    const barrelFar = mountAt ?? new RevJoint(aId, ...place(creation.barrelFar));
    const barrelNear = new RevJoint(bId, ...place(creation.barrelNear));
    const pin = new RevJoint(cId, ...place(creation.pin));
    const rodFar = new RevJoint(dId, ...place(creation.rodFar));
    const slider = new PrisJoint(pId, pin.x, pin.y);
    slider.isSealed = true;

    // Link ids are their joints' letters in order, and an existing mount's
    // letter is whatever it already was — not necessarily before the new one.
    const barrel = this.gridUtils.createRealLink([aId, bId].sort().join(''), [
      barrelFar,
      barrelNear,
    ]);
    const rod = this.gridUtils.createRealLink(cId + dId, [pin, rodFar]);
    const block = new SliderBlock(cId + pId, [pin, slider]);
    slider.slideOn(barrel, barrelFar, barrelNear);
    pin.isWelded = true;

    barrelFar.links.push(barrel);
    barrelNear.links.push(barrel);
    pin.links.push(rod, block);
    rodFar.links.push(rod);
    slider.links.push(block);

    // Anchored on a link, when the gesture started from one: the barrel's mount
    // joins that body and the ram swings with it, which is what a ram bolted to
    // a boom or a frame does. The rod's far end is left free for the user to
    // attach to whatever it drives — a ram fixed at both ends before it exists
    // would be a ram with nowhere to go.
    if (mountOn) this.graftJointOnto(barrelFar, mountOn);

    // Started from a joint, that joint is already in the mechanism and already
    // holds its own links; it has just gained one more.
    if (!mountAt) this.joints.push(barrelFar);
    this.joints.push(barrelNear, pin, rodFar, slider);
    this.links.push(barrel, rod, block);
    // The body is what a click on the skin selects; select it on creation so
    // the edit panel opens on the cylinder.
    this.activeObjService.updateSelectedObj(barrel);
    this.finishStructuralEdit(true);
  }

  /**
   * Delete a whole cylinder in one undoable step (§ cylinder 5): the three
   * member links and the three interior joints always go; a mount survives
   * only while some other link still holds it — the same rule deleteLink
   * applies to any orphaned joint.
   */
  deleteCylinder(target?: Cylinder): void {
    const sealed =
      target ??
      this.cylinderAt(this.activeObjService.selectedJoint) ??
      this.cylinderAt(this.activeObjService.selectedLink);
    if (!sealed) return;
    this.deleteCylinderTopology(sealed);
    this.activeObjService.updateSelectedObj(undefined);
    this.finishStructuralEdit(true);
  }

  /**
   * Take a cylinder out of the mechanism. Pure topology — no rebuild, no save,
   * and the selection is left alone.
   *
   * Split from `deleteCylinder` for the same reason `weldTopology` is split
   * from `weldJoint`: two callers want the same removal and different endings.
   * Deleting the *cylinder* ends here; deleting a *joint* that happens to be
   * one of its mounts carries on to remove the joint too, and wants one undo
   * entry covering both.
   */
  private deleteCylinderTopology(sealed: Cylinder): void {
    // A gesture in flight targets objects about to stop existing.
    this.injector.get(DragStateService).cancel();

    // A mount welded into a neighbouring compound has to come apart first, so
    // the member links are top-level again and can be removed cleanly. The
    // sealed pin's own weld is not a compound and needs no unweld.
    [sealed.barrelFar, sealed.rodFar].forEach((mount) => {
      if (mount instanceof RealJoint && mount.isWelded) this.unweldTopology(mount);
    });

    const memberLinkIds = new Set([sealed.barrel.id, sealed.rod.id, sealed.block.id]);
    this.forces
      .filter((force) => memberLinkIds.has(force.link.id))
      .forEach((force) => this.detachForce(force));
    this.links = this.links.filter((link) => !memberLinkIds.has(link.id));

    const interior = new Set([sealed.pin.id, sealed.slider.id, sealed.barrelNear.id]);
    [...interior, sealed.barrelFar.id, sealed.rodFar.id].forEach((id) =>
      this.slotStashes.delete(id)
    );
    this.joints = this.joints.filter((joint) => !interior.has(joint.id));
    this.joints = this.joints.filter(
      (joint) =>
        !(joint instanceof RealJoint) ||
        this.links.some((candidate) => candidate.joints.includes(joint))
    );

    // Scrub what survived of what did not.
    //
    // A surviving mount keeps its own `links` and `connectedJoints` arrays, and
    // they still name the ram's links and its interior joints. Nothing noticed
    // while this was the last step of a deletion — the rebuild reads the link
    // list, not the joint's copy of it — but any code that walks a joint's own
    // neighbours afterwards is walking to objects that no longer exist. The
    // generic joint deletion does exactly that, and looked up a joint that had
    // been removed a moment earlier.
    const liveLinks = new Set(this.links.map((link) => link.id));
    const liveJoints = new Set(this.joints.map((joint) => joint.id));
    this.joints.forEach((joint) => {
      if (!(joint instanceof RealJoint)) return;
      joint.links = joint.links.filter((link) => liveLinks.has(link.id));
      joint.connectedJoints = joint.connectedJoints.filter((other) => liveJoints.has(other.id));
    });
  }

  /**
   * Drive (or stop driving) a cylinder. The hidden prismatic pin is the
   * underlying input joint; the body's Make Input control lands here because
   * that pin is deliberately unselectable.
   */
  toggleCylinderInput(target?: Cylinder): void {
    const sealed = target ?? this.cylinderAt(this.activeObjService.selectedLink);
    if (!sealed) return;
    if (!sealed.slider.input) {
      // Only one input at a time, same as adjustInput.
      this.joints.forEach((joint) => {
        if (joint instanceof RealJoint && joint.input) joint.input = false;
      });
    }
    sealed.slider.input = !sealed.slider.input;
    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  /**
   * The PrisJoint of whichever slider `joint` belongs to, from either end.
   *
   * The panel only ever selects the pin, so anything that acts on "the slider"
   * has to make the hop; the two are coincident by construction, which is what
   * makes either end a valid handle on the same object.
   */
  sliderFor(joint: Joint | undefined): PrisJoint | undefined {
    return this.sliderOf(joint);
  }

  private sliderOf(joint: Joint | undefined): PrisJoint | undefined {
    if (joint instanceof PrisJoint) return joint;
    if (!(joint instanceof RealJoint)) return undefined;
    return joint.links
      .find((link): link is SliderBlock => link instanceof SliderBlock)
      ?.joints.find((member): member is PrisJoint => member instanceof PrisJoint);
  }

  toggleGround() {
    //Should be called toggleGround
    //
    // Resolved from the selection rather than tested against it: the panel
    // selects a slider by its pin, never by its PrisJoint, so an `instanceof`
    // on the selected joint alone sends every panel click down the plain-joint
    // branch and grounds the pin instead of the slot. `adjustInput` already
    // resolves the pair this way.
    const slider = this.sliderOf(this.activeObjService.selectedJoint);
    if (slider) {
      // Ground and Slider are independent controls (§4.1), so this only ever
      // moves the slot's direction between "fixed in the world" and "not yet
      // decided". It never adds or removes the slider itself.
      //
      // Grounding a floating slot pins the direction it is already pointing, so
      // the geometry does not move. Un-grounding cannot invent a carrier -- one
      // is geometry, not a boolean -- so the slot dangles, drawn red, until the
      // drop-on-link gesture gives it one. The last angle stays on the joint,
      // which is what lets grounding it again restore the guide it had rather
      // than silently rebuilding one at zero.
      if (slider.ground) slider.detach();
      else slider.groundAt(slider.slotAngle);
      this.finishStructuralEdit(true);
      return;
    }
    this.activeObjService.selectedJoint.ground = !this.activeObjService.selectedJoint.ground;
    this.activeObjService.selectedJoint.input = false;
    this.finishStructuralEdit(true);
  }

  adjustInput() {
    let jointToToggleInput: RealJoint;
    if (this.gridUtils.isAttachedToSlider(this.activeObjService.selectedJoint)) {
      //Find the prismatic joint and toggle ground
      jointToToggleInput = this.gridUtils.getSliderJoint(
        this.activeObjService.selectedJoint
      ) as RealJoint;
    } else {
      //Normal joint case
      jointToToggleInput = this.activeObjService.selectedJoint;
    }

    // Turning a joint *on* has to name the two bodies it drives between
    // (§2.9). Three bodies meet at some joints, and then "driven" says nothing
    // about which pair moves -- every answer the solvers could pick is a guess
    // the user never made. Refused here with the reason, rather than accepted
    // and guessed at downstream. Turning one off is always allowed.
    //
    // Asked *before* anything is changed. The old input used to be cleared
    // first and the refusal returned after, which left the mechanism with no
    // driven joint at all -- a click that was refused still took the input
    // away, and there was no undo entry to get it back.
    if (!jointToToggleInput.input) {
      const refusal = describeActuator(jointToToggleInput);
      if (typeof refusal === 'string') {
        NewGridComponent.sendNotification(refusal);
        return;
      }
      // One input at a time, so the joint taking the job displaces the old one.
      this.joints.forEach((j) => {
        if (j instanceof RealJoint && j.input) {
          j.input = false;
        }
      });
    }

    //Toggle the input joint
    jointToToggleInput.input = !jointToToggleInput.input;

    // Saved, like every other edit that changes what the mechanism is. Moving
    // the input from one joint to another is one of the larger things a user
    // can do to a mechanism, and it was the one edit undo could not reach.
    this.updateMechanism(true);
    this.onMechUpdateState.next(3);
  }

  /**
   * Put every floating block back on the slot it rides, after something moved
   * the slot out from under it.
   *
   * A floating slider is deliberately *not* a member of its carrier -- that is
   * what makes it a slot rather than a pin -- so nothing that drags the carrier,
   * or one of the two joints defining the slot, touches the block. It stayed
   * where it was while the channel rotated away from it, which reads as the
   * block having come loose.
   *
   * Its position along the slot is preserved, measured from the slot's midpoint,
   * so reseating does not also move s0: one drag still changes one quantity.
   */
  reseatFloatingSliders(): void {
    for (const slider of this.joints) {
      if (!(slider instanceof PrisJoint) || !slider.isFloating) continue;
      if (!slider.isSlotWellFormed) continue;
      const a = slider.slotJointA!;
      const b = slider.slotJointB!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;

      const ux = dx / length;
      const uy = dy / length;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const offset = (slider.x - midX) * ux + (slider.y - midY) * uy;
      const onLine = { x: midX + offset * ux, y: midY + offset * uy };
      // Below this, leave it exactly where it is. Joint coordinates come back
      // out of the URL at a fixed precision, so a slider is already a hair off
      // its own line the moment a mechanism loads -- and correcting that here
      // would mean dragging any joint anywhere silently moved every other
      // slider. The breakage this exists for measures 0.17 and 0.41.
      //
      // The clamp below is inside this guard for the same reason: a mechanism
      // can arrive with its block already outside the drawn channel, and
      // hauling it in because some unrelated joint moved would be editing a
      // slot nobody touched.
      if (Math.hypot(onLine.x - slider.x, onLine.y - slider.y) < 1e-4 * MODEL_SCALE) continue;

      // Clamped to the channel, not merely projected onto its line. A slot is a
      // hole of a definite length, and dragging the carrier -- or either joint
      // that defines it -- can carry that hole right off the block. Projection
      // alone put the block back on the line and left it out past the end of
      // the bar, which is a block riding on nothing.
      const half = slotHalfLength(0.15 * SettingsService.objectScale, length);
      const along = Math.max(-half, Math.min(half, offset));
      const x = midX + along * ux;
      const y = midY + along * uy;

      slider.x = x;
      slider.y = y;
      // The block is zero-length by construction, so its pin travels with it.
      const pin = slider.links
        .find((link): link is SliderBlock => link instanceof SliderBlock)
        ?.joints.find((joint) => joint.id !== slider.id);
      if (pin) {
        pin.x = x;
        pin.y = y;
      }
    }
  }

  /**
   * Cut a slot into a link, giving `pin` a block that rides it (§4.3).
   *
   * The release half of the drop-on-link gesture. A pin that already carries a
   * block keeps it and just gains a carrier — which is how a dangling slider is
   * repaired — and a plain pin grows one first, so the same drag reads the same
   * way whichever state the joint was in.
   *
   * Rebuilds but does not save, the same contract `mergeJoints` follows: the
   * release path saves exactly once for the whole gesture, so saving here too
   * costs the user two presses of undo to take back one drag.
   *
   * Returns false when the joint cannot take a slot at all, so the caller can
   * leave the drag looking refused rather than silently inert.
   */
  cutSlotOn(
    pin: RealJoint,
    slot: { carrier: Link; a: Joint; b: Joint; x: number; y: number }
  ): boolean {
    if (pin instanceof PrisJoint) return false;
    // Two blocks on one pin is a different joint type, not a second slot.
    const existing = pin.links.find((link): link is SliderBlock => link instanceof SliderBlock);
    const slider = existing?.joints.find((joint): joint is PrisJoint => joint instanceof PrisJoint);

    // The joint lands on the slot line, where the preview already put it.
    pin.x = slot.x;
    pin.y = slot.y;

    if (slider) {
      slider.x = slot.x;
      slider.y = slot.y;
      slider.slideOn(slot.carrier, slot.a, slot.b);
    } else {
      this.activeObjService.updateSelectedObj(pin);
      this.sliderTopology();
      const made = pin.links
        .find((link): link is SliderBlock => link instanceof SliderBlock)
        ?.joints.find((joint): joint is PrisJoint => joint instanceof PrisJoint);
      if (!made) return false;
      made.x = slot.x;
      made.y = slot.y;
      made.slideOn(slot.carrier, slot.a, slot.b);
    }
    this.finishStructuralEdit(false);
    return true;
  }

  /**
   * Take a block out of the channel it is riding in, mid-drag (§4.4).
   *
   * The inverse of `cutSlotOn`, and deliberately the same shape: it rebuilds
   * but does not save, because the release at the end of the drag is the one
   * thing that mints an undo entry. What is left is a dangling slider — a block
   * with nowhere to slide — which the canvas draws red until it is dropped onto
   * a link again.
   *
   * The slot is stashed on the way out, so putting the block back on the same
   * bar is a drop rather than a rebuild.
   */
  detachSlider(slider: PrisJoint): void {
    // A sealed cylinder's block never leaves its bore (§ cylinder 4). The
    // drag pipeline never offers the gesture — the pin has no hitbox — so
    // this is the defensive backstop, not the UI rule.
    if (slider.isSealed) return;
    if (!slider.isFloating) return;
    const block = slider.links.find((link): link is SliderBlock => link instanceof SliderBlock);
    const pin = block?.joints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && !(joint instanceof PrisJoint)
    );
    if (pin && block) this.stashSlot(pin, block);
    slider.detach();
    this.finishStructuralEdit(false);
  }

  /**
   * Remember a slot on its pin before the block goes away, so turning Slider
   * back on restores the guide the user had rather than building a new one.
   */
  private stashSlot(pin: RealJoint, block: Link): void {
    const slider = block.joints.find((joint) => joint instanceof PrisJoint) as
      PrisJoint | undefined;
    if (!slider) return;
    this.slotStashes.set(pin.id, {
      ground: slider.ground,
      angleRad: slider.slotAngle,
      carrierId: slider.carrier?.id,
      slotJointAId: slider.slotJointA?.id,
      slotJointBId: slider.slotJointB?.id,
    });
  }

  /**
   * Put a remembered slot back. A carrier that has been deleted or welded away
   * in the meantime simply does not resolve, and the slider is left dangling --
   * the same answer `reconcileSlots` gives, rather than a second policy.
   */
  private restoreStashedSlot(pin: RealJoint, slider: PrisJoint): void {
    const stash = this.slotStashes.get(pin.id);
    if (!stash) return;
    const carrier = stash.carrierId
      ? this.links.find((link) => link.id === stash.carrierId)
      : undefined;
    const a = this.joints.find((joint) => joint.id === stash.slotJointAId);
    const b = this.joints.find((joint) => joint.id === stash.slotJointBId);
    if (carrier && a && b) {
      slider.slideOn(carrier, a, b);
    } else if (stash.ground) {
      slider.groundAt(stash.angleRad);
    }
  }

  toggleSlider() {
    // No member of a sealed cylinder can gain or lose a block: the slider IS
    // the cylinder (§ cylinder 4). The panel and menu grey the control on the
    // mounts; this is the rule they are both fronting.
    if (this.cylinderAt(this.activeObjService.selectedJoint)) {
      NewGridComponent.sendNotification(
        'A cylinder is one sealed part — delete the cylinder instead of editing its slider.'
      );
      return;
    }
    this.sliderTopology();
    // Through finishStructuralEdit rather than straight to updateMechanism: it
    // is what runs reconcileAssemblyWelds, and removing a slider from a Slide
    // leaves the RevJoint behind still flagged welded. Phase 2 never hit this
    // because removing a slider takes its PrisJoint with it, and reconcileSlots
    // only walks the ones that survive.
    this.finishStructuralEdit(true);
  }

  /**
   * Add or remove the selected joint's block, without rebuilding or saving.
   *
   * Split out so the drop-on-link gesture can grow a slider and bind its slot
   * inside a single structural edit. Undo is a stack of URL strings and a drag
   * has to leave exactly one entry, so a gesture that called toggleSlider and
   * then finished again would cost the user two presses of undo to take back
   * one drag.
   */
  private sliderTopology(): void {
    if (!this.gridUtils.isAttachedToSlider(this.activeObjService.selectedJoint)) {
      // Create Prismatic Joint
      const selectedJointInput = this.activeObjService.selectedJoint.input;
      // Remembered before it is cleared: a pin cannot stay grounded once it
      // carries a block, but the grounded-ness the user set moves to the slider
      // below rather than evaporating.
      const selectedJointGrounded = this.activeObjService.selectedJoint.ground;
      this.activeObjService.selectedJoint.input = false;
      this.activeObjService.selectedJoint.ground = false;
      const prismaticJointId = this.determineNextLetter();
      const inputJointIndex = this.findInputJointIndex();
      const connectedJoints: Joint[] = [this.activeObjService.selectedJoint];
      // this.joints.forEach((j) => {
      //   if (!(j instanceof RealJoint)) {
      //     return;
      //   }
      //   if (j.ground) {
      //     connectedJoints.push(j);
      //   }
      // });
      // Born dangling on an ungrounded pin: a floating slot needs a carrier,
      // which is geometry the drop gesture supplies and no toggle can invent.
      // A slider with a stash gets its old slot back instead, which is what
      // makes Slider off/on a round trip — and a grounded pin hands its ground
      // to the slider below, so the same click always makes the same thing.
      const prisJoint = new PrisJoint(
        prismaticJointId,
        this.activeObjService.selectedJoint.x,
        this.activeObjService.selectedJoint.y,
        selectedJointInput,
        false,
        [],
        connectedJoints
      );
      this.restoreStashedSlot(this.activeObjService.selectedJoint, prisJoint);
      // Ground carried across from the pin, deterministically: toggling Slider
      // on a grounded joint always yields a grounded slider. Before this it
      // depended on history — a joint whose earlier slider had been grounded
      // came back grounded through the stash, while a freshly grounded joint
      // lost its ground and dangled — the same two clicks giving two different
      // mechanisms. The angle kept is whatever the slider already remembers
      // (the stash's, or zero on a first slider), the same angle grounding via
      // the Ground toggle would pin.
      if (selectedJointGrounded && !prisJoint.isFloating) {
        prisJoint.groundAt(prisJoint.slotAngle);
      }
      this.activeObjService.selectedJoint.connectedJoints.push(prisJoint);
      const piston = new SliderBlock(this.activeObjService.selectedJoint.id + prisJoint.id, [
        this.activeObjService.selectedJoint,
        prisJoint,
      ]);
      prisJoint.links.push(piston);
      this.activeObjService.selectedJoint.links.push(piston);
      this.joints.push(prisJoint);
      this.links.push(piston);
    } else {
      // delete Prismatic Joint
      const piston = this.activeObjService.selectedJoint.links.find(
        (l) => l instanceof SliderBlock
      )!;
      this.stashSlot(this.activeObjService.selectedJoint, piston);
      const pistonIndex = this.links.findIndex((l) => l.id === piston.id);
      const prismaticJointID = piston.joints.find((j) => j instanceof PrisJoint)!.id;
      this.activeObjService.selectedJoint.connectedJoints =
        this.activeObjService.selectedJoint.connectedJoints.filter(
          (j) => j.id !== prismaticJointID
        );

      this.activeObjService.selectedJoint.links = this.activeObjService.selectedJoint.links.filter(
        (l) => l.id !== piston.id
      );
      const prismaticJointIndex = this.joints.findIndex((j) => j.id === prismaticJointID);
      this.joints.splice(prismaticJointIndex, 1);
      this.links.splice(pistonIndex, 1);

      this.activeObjService.selectedJoint.ground = false;
    }
  }

  findInputJointIndex() {
    return this.joints.findIndex((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      return j.input;
    });
  }

  /** Sample times (seconds) of the solved mechanism, empty when nothing is solved. */
  private sampleTimes(): number[] {
    return this.mechanisms[0]?.timeNum ?? [];
  }

  /** Simulation time of a sample index. */
  timeAtStep(step: number): number {
    const times = this.sampleTimes();
    if (times.length === 0) {
      return 0;
    }
    const clamped = Math.min(Math.max(Math.round(step), 0), times.length - 1);
    return times[clamped];
  }

  /** Seconds spanned by one full traversal of the motion. */
  cyclePeriod(): number {
    return this.mechanisms[0]?.cyclePeriod ?? 0;
  }

  /** Nearest sample index to a simulation time. Sample times strictly increase. */
  stepAtTime(seconds: number): number {
    const times = this.sampleTimes();
    if (times.length === 0 || !Number.isFinite(seconds)) {
      return 0;
    }
    if (seconds <= times[0]) {
      return 0;
    }
    const last = times.length - 1;
    if (seconds >= times[last]) {
      return last;
    }
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (times[mid] <= seconds) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return seconds - times[low] <= times[high] - seconds ? low : high;
  }

  /** Last sample at or before a simulation time — the sample playback blends from. */
  private stepAtOrBeforeTime(seconds: number): number {
    const nearest = this.stepAtTime(seconds);
    const times = this.sampleTimes();
    return nearest > 0 && times[nearest] > seconds ? nearest - 1 : nearest;
  }

  /**
   * The time the mechanism is actually drawn at. While playing this sits between
   * samples, so the readout matches the interpolated pose rather than the sample
   * it was blended from.
   */
  currentTimeSeconds(): number {
    return AnimationBarComponent.animate
      ? this.playbackTimeSeconds
      : this.timeAtStep(this.mechanismTimeStep);
  }

  /** Fold a time back into [0, period) so playback and re-seeks loop cleanly. */
  wrapTime(seconds: number): number {
    const period = this.cyclePeriod();
    if (!(period > 0) || !Number.isFinite(seconds)) {
      return 0;
    }
    const wrapped = seconds % period;
    return wrapped < 0 ? wrapped + period : wrapped;
  }

  animate(progress: number, animationState?: boolean) {
    //Round progress to nearest integer
    progress = Math.round(progress);
    // Sample counts change whenever the mechanism is rebuilt at a new input speed;
    // never index past them.
    const sampleCount = this.mechanisms[0]?.joints.length ?? 0;
    progress = Math.min(Math.max(progress, 0), Math.max(sampleCount - 1, 0));

    // Set the step before announcing it: subscribers read the drawn time back off
    // the service, so it has to be current by the time they are notified.
    this.mechanismTimeStep = progress;
    this.onMechPositionChange.next(progress);
    // Paths are drawn whenever there is a solved cycle to draw them from,
    // including at rest.
    //
    // They used to be hidden while the mechanism was parked at its start pose,
    // on the grounds that nothing had been traced yet. That reasoning belonged
    // to a time when every joint traced by default: the path was a by-product,
    // so showing one before anything had moved was a claim about motion that
    // had not happened. A path is asked for a joint at a time now, and the
    // whole cycle is precomputed the moment the mechanism is valid — so the
    // answer to "show me where this joint goes" is available immediately, and
    // hiding it until the user presses play is hiding the thing they just
    // switched on.
    this.showPathHolder = this.oneValidMechanismExists();
    if (animationState !== undefined) {
      AnimationBarComponent.animate = animationState;
    }
    if (sampleCount === 0 || this.mechanisms[0].joints[progress].length === 0) {
      this.playbackClockMs = null;
      return;
    }

    // Samples are one degree of crank rotation apart, so at a low input speed a
    // sample can span a tenth of a second and stepping between them reads as
    // stutter. Blend toward the next sample by where playback actually sits
    // between the two.
    this.applyPose(progress, this.blendToNextSample(progress));

    if (!AnimationBarComponent.animate) {
      this.playbackClockMs = null;
      return;
    }
    // Anything other than the playback loop itself (slider, time field, URL restore)
    // is a seek: re-anchor the clock to the sample the caller asked for.
    if (!this.advancingPlayback) {
      this.playbackTimeSeconds = this.timeAtStep(this.mechanismTimeStep);
      this.playbackClockMs = null;
    }
    this.queuePlaybackFrame();
  }

  /**
   * Draw a solved sample onto the editable joints, links and forces, optionally
   * blended toward the next sample. These objects are what the grid renders — and
   * also what a rebuild treats as t = 0, so see restoreStartPose.
   */
  private applyPose(step: number, blend: number) {
    const nextStep = blend > 0 ? step + 1 : step;
    const frames = this.mechanisms[0];
    // This is the one place a solved sample becomes the drawn pose, so it is
    // where anything cached against the pose has to be let go of.
    this.poseRevision++;

    this.joints.forEach((j, j_index) => {
      const from = frames.joints[step][j_index];
      const to = frames.joints[nextStep][j_index];
      j.x = from.x + (to.x - from.x) * blend;
      j.y = from.y + (to.y - from.y) * blend;
    });
    this.links.forEach((l, l_index) => {
      if (!(l instanceof RealLink)) {
        return;
      }
      const link = frames.links[step][l_index];
      if (!(link instanceof RealLink)) {
        return;
      }
      if (l.subset.length > 0) {
        l.subset.forEach((subset) => {
          if (!(subset instanceof RealLink)) return;
          const simulatedSubset = link.subset.find(
            (candidate): candidate is RealLink =>
              candidate instanceof RealLink && candidate.id === subset.id
          );
          if (!simulatedSubset) return;
          this.placeLinkGeometry(subset, simulatedSubset, blend);
        });
      }
      this.placeLinkGeometry(l, link, blend);
    });
    this.forces.forEach((f, f_index) => {
      const from = frames.forces[step][f_index];
      const to = frames.forces[nextStep][f_index];
      f.startCoord.x = from.startCoord.x + (to.startCoord.x - from.startCoord.x) * blend;
      f.startCoord.y = from.startCoord.y + (to.startCoord.y - from.startCoord.y) * blend;
      f.endCoord.x = from.endCoord.x + (to.endCoord.x - from.endCoord.x) * blend;
      f.endCoord.y = from.endCoord.y + (to.endCoord.y - from.endCoord.y) * blend;
      f.local = from.local;
      f.mag = from.mag + (to.mag - from.mag) * blend;
      f.angleRad = blendAngle(from.angleRad, to.angleRad, blend);
      f.forceLine = f.createForceLine(f.startCoord, f.endCoord);
      f.forceArrow = f.createForceArrow(f.startCoord, f.endCoord);
    });
  }

  /**
   * Put the editable objects back on sample 0 before a rebuild.
   *
   * The editable joints are simultaneously what the grid draws and what a rebuild
   * deep-copies as t = 0, and animate() moves them in place. Without this, any
   * rebuild triggered while the mechanism sits at a non-zero time — merely opening
   * the Settings panel does one — would silently redefine time zero as wherever
   * playback happened to be, and the start pose would ratchet forward.
   */
  private restoreStartPose() {
    // While playing, the drawn pose is blended past its sample, so step 0 alone
    // does not mean the joints hold the start pose — only paused-at-0 does.
    if (this.atStartPose() || !this.mechanisms[0]?.joints[0]?.length) {
      return;
    }
    this.applyPose(0, 0);
  }

  private atStartPose(): boolean {
    return this.mechanismTimeStep === 0 && !AnimationBarComponent.animate;
  }

  /**
   * Stop playback and draw the start of the cycle.
   *
   * For callers about to replace the mechanism wholesale. `restoreStartPose`
   * does the same job as part of a rebuild, but a rebuild that swaps in a
   * different linkage is too late for it: the joints and the solved samples it
   * pairs off by index no longer describe the same mechanism by then. This runs
   * while they still do, and leaves that call nothing to undo.
   */
  rewindToStart(): void {
    if (this.atStartPose()) return;
    this.animate(0, false);
  }

  /**
   * How far playback sits past sample `step`, as a 0..1 fraction of the way to the
   * next one. Zero for any seek and at the last sample, where there is nothing to
   * blend toward.
   */
  private blendToNextSample(step: number): number {
    if (!this.advancingPlayback) {
      return 0;
    }
    const times = this.sampleTimes();
    if (step + 1 >= times.length) {
      return 0;
    }
    const span = times[step + 1] - times[step];
    if (!(span > 0)) {
      return 0;
    }
    const fraction = (this.playbackTimeSeconds - times[step]) / span;
    return Math.min(Math.max(fraction, 0), 1);
  }

  /**
   * Copy a solved link's outline onto the editable link. A path string cannot be
   * blended, so between samples the solved outline is rigidly re-placed onto the
   * already-blended joints instead — the link is rigid, so that is the same motion.
   */
  private placeLinkGeometry(target: RealLink, solved: RealLink, blend: number) {
    if (blend > 0 && solved.joints.length >= 2 && target.joints.length >= 2) {
      const [sourceStart, sourceEnd] = solved.joints;
      const [targetStart, targetEnd] = target.joints;
      target.d = transformRigidPath(solved.d, sourceStart, sourceEnd, targetStart, targetEnd);
      const [comX, comY] = transformRigidCoord(
        solved.CoM,
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd
      );
      target.CoM = new Coord(comX, comY);
    } else {
      target.d = solved.d;
      target.CoM = solved.CoM;
    }
    target.updateCoMDs();
    target.updateLengthAndAngle();
  }

  private queuePlaybackFrame() {
    if (this.playbackFrameQueued) {
      return;
    }
    this.playbackFrameQueued = true;
    setTimeout(() => {
      this.playbackFrameQueued = false;
      this.advancePlayback();
    }, MechanismService.FRAME_INTERVAL_MS);
  }

  /**
   * Advance simulation time by the real time that elapsed since the last frame, so
   * one revolution takes 60/RPM seconds on screen regardless of frame rate or of how
   * many samples the cycle was solved into.
   */
  private advancePlayback() {
    if (!AnimationBarComponent.animate) {
      this.playbackClockMs = null;
      return;
    }
    const now = performance.now();
    // The first frame after a seek or a resume has no previous frame to measure from.
    const elapsedSeconds = this.playbackClockMs === null ? 0 : (now - this.playbackClockMs) / 1000;
    this.playbackClockMs = now;
    this.playbackTimeSeconds = this.wrapTime(
      this.playbackTimeSeconds + elapsedSeconds * this.animationSpeedMultiplier
    );

    this.advancingPlayback = true;
    try {
      // Blend forward from the sample at or before now, not the nearest one.
      this.animate(this.stepAtOrBeforeTime(this.playbackTimeSeconds));
    } finally {
      this.advancingPlayback = false;
    }
  }

  getJointCSSClass(joint: Joint) {
    // const j = joint as RealJoint;
    if (
      NewGridComponent.debugGetJointState() == jointStates.dragging &&
      joint.id === this.activeObjService.selectedJoint.id
    ) {
      return 'joint-dragging';
    }
    if (
      NewGridComponent.debugGetJointState() !== jointStates.dragging &&
      this.activeObjService.objType == 'Joint' &&
      joint.id === this.activeObjService.selectedJoint.id
    ) {
      return 'joint-selected';
    }
    if (joint.showHighlight) {
      return 'joint-highlight';
    } else {
      return 'joint-default';
    }
  }

  getLinkCSSClass(link: Link) {
    if (
      this.activeObjService.objType == 'Link' &&
      link.id === this.activeObjService.selectedLink.id
    ) {
      return 'link-selected';
    }
    return 'link-default';
  }

  private findConnectedLinksReccusively(
    link: Link,
    avoid: Link[],
    subset: Link[],
    subsetBuilder: Link[]
  ): Link[] {
    //Recursively find all connected links to a given link, making sure not to include the block link
    (link.joints as RealJoint[]).forEach((joint) => {
      joint.links.forEach((l) => {
        if (
          l instanceof RealLink &&
          !avoid.includes(l) &&
          !subsetBuilder.includes(l) &&
          subset.includes(l)
        ) {
          subsetBuilder.push(l);
          this.findConnectedLinksReccusively(l, avoid, subset, subsetBuilder);
        }
      });
    });
    return subsetBuilder;
  }

  isJointOrphan(joint: Joint) {
    //Return true if the given joint is an orphan (not part of a link).
    return this.links.every((l) => !l.joints.includes(joint));
  }

  public weldJoint(joint: RealJoint = this.activeObjService.selectedJoint): void {
    if (!joint) return;

    // A weld fuses what meets at a joint, so a joint connecting fewer than two
    // links has nothing to fuse. `weldTopology` refuses this shape too (via
    // `canBeWelded`), but that refusal is one layer down and shared with other
    // rules; this guard is the mutation's own front door, so no caller — the
    // panel greys its toggle, but a stray programmatic call cannot be greyed —
    // can reach the restructure with a degenerate joint.
    if (!(joint instanceof RealJoint) || joint.links.length < 2) return;

    // Clicking Weld on a named joint is a deliberate act, so this warns rather
    // than refuses. The linkage still moves and still solves; only its forces
    // lose a unique solution, and the analysis panel says so in its own right.
    // A drag that lands on the same geometry is refused instead, because
    // dropping a joint somewhere is far more easily done by accident.
    const created = this.weldWouldPinTwice(joint);

    if (!this.weldTopology(joint)) return;
    if (created) {
      NewGridComponent.sendNotification(
        `${created[0]} and ${created[1]} are now pinned together twice. The linkage still ` +
          'moves, but its forces have no unique solution.'
      );
    }
    this.finishStructuralEdit(true);
  }

  /**
   * The joints a weld at this joint would newly leave held twice, if any.
   *
   * Compares the redundancies before the edit with the ones after it, rather
   * than asking whether anything is redundant afterwards. A mechanism may
   * legitimately already contain a redundant pin — this branch is what makes
   * those simulate — and reporting the total would blame every later weld for a
   * condition it did not cause, naming joints nowhere near the one clicked.
   *
   * Predicted rather than measured after the fact, because the compound has
   * absorbed forces and rewritten link ids by the time it exists. The
   * prediction needs only its joint set: the union of the links at that joint.
   */
  private weldWouldPinTwice(joint: RealJoint): [string, string] | undefined {
    const linksAtJoint = this.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.joints.includes(joint)
    );
    if (linksAtJoint.length < 2) return undefined;

    const compound = {
      id: 'compound',
      joints: linksAtJoint
        .flatMap((link) => link.joints)
        .filter((candidate, index, all) => all.findIndex((j) => j.id === candidate.id) === index),
    };
    const untouched = this.links.filter((link) => !linksAtJoint.includes(link as RealLink));

    const before = redundantlyHeldJointSets(this.links);
    const appeared = [...redundantlyHeldJointSets([compound, ...untouched])].find(
      (held) => !before.has(held)
    );
    if (!appeared) return undefined;
    const [first, second] = appeared.split('|');
    return [first, second];
  }

  /**
   * Make a weld at this joint, whatever kind of weld it is.
   *
   * Pure topology — no rebuild, no save. Four callers need this and they do not
   * all want the same wrapper: `weldJoint`, `unWeldJoint` and `unweldAll` earn
   * an undo entry, while `mergeJoints` is the tail of a drag and the gesture
   * owns the single entry it earns. Putting the choice inside the public
   * actions instead would leave `mergeJoints` on the compound-only path, where
   * whether a Slide survives a drag depends on what was dropped onto it.
   */
  private weldTopology(joint: RealJoint): boolean {
    if (!joint.canBeWelded()) return false;
    const realLinksAtJoint = this.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.joints.includes(joint)
    );
    // The same structural test the resolver applies, rather than "has a block".
    // A shape the resolver rejects -- two blocks on one pin, a block with a
    // stray third joint -- would otherwise take the assembly path and produce a
    // weld nothing downstream recognises, which the reconcile would then strip.
    if (!isSlideCandidate(joint)) {
      return this.weldJointTopology(joint);
    }

    // A Slide. Two or more RealLinks here fuse into a compound exactly as an
    // ordinary weld does — every body at the joint becomes rigid, which is what
    // the 2x2 means — and the block is bound by the flag either way, since it
    // is not a RealLink and cannot enter a compound at all.
    if (realLinksAtJoint.length >= 2) {
      this.weldJointTopology(joint);
    }
    joint.isWelded = true;
    return true;
  }

  /** Undo a weld at this joint, whatever kind of weld it is. Pure topology. */
  private unweldTopology(joint: RealJoint): boolean {
    if (!joint.isWelded) return false;
    // The sealed pin's weld is what makes a cylinder one part; it never comes
    // off (§ cylinder 4). Only the pin resolves here — a welded *mount* has no
    // block of its own, so unwelding a mount out of a neighbouring compound
    // stays legal.
    if (structuralCylinderAt(joint)) return false;
    const compound = this.compoundAt(joint);
    if (compound) {
      return this.unweldJointTopology(joint);
    }
    // A Slide holds no compound, so there is nothing to take apart and
    // unweldJointTopology would report failure after already clearing the flag
    // -- leaving the weld dropped with no rebuild and no undo entry.
    joint.isWelded = false;
    return true;
  }

  private compoundAt(joint: RealJoint): RealLink | undefined {
    return this.links.find(
      (link): link is RealLink =>
        link instanceof RealLink && link.subset.length > 0 && link.joints.includes(joint)
    );
  }

  private weldJointTopology(joint: RealJoint): boolean {
    const linksAtJoint = this.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.joints.includes(joint)
    );
    if (!joint.canBeWelded() || joint.isWelded || linksAtJoint.length < 2) return false;

    const affectedLinkIDs = new Set(
      linksAtJoint.flatMap((link) => [link.id, ...link.subset.map((subset) => subset.id)])
    );
    const affectedForces = this.forces.filter((force) => affectedLinkIDs.has(force.link.id));
    const compound = this.createNewCompoundLink(linksAtJoint);

    this.links = this.links.filter((link) => !linksAtJoint.includes(link as RealLink));
    this.links.push(compound);
    joint.isWelded = true;
    affectedForces.forEach((force) => this.attachForceToLink(force, compound));
    return true;
  }

  public unWeldJoint(joint: RealJoint): void {
    if (!this.unweldTopology(joint)) return;
    this.finishStructuralEdit(true);
  }

  public unweldSelectedJoint(): void {
    const joint = this.joints.find(
      (candidate) => candidate.id === this.activeObjService.selectedJoint.id
    );
    if (joint instanceof RealJoint) this.unWeldJoint(joint);
  }

  /**
   * Take one compound apart: every weld holding *this* body together, and no
   * others.
   *
   * The control that calls this lives inside a selected link's own Compound
   * Link Settings, so "all" has always meant "all of this one". It was reading
   * as "all in the mechanism": pressing it on a two-leaf compound dissolved
   * every other compound on the grid, which is a large, silent, and entirely
   * unrelated edit.
   *
   * With no link it still means the whole mechanism, because that is what a
   * caller with nothing selected can only mean.
   */
  public unweldAll(link: Link | undefined = this.activeObjService.selectedLink): void {
    const scope =
      link instanceof RealLink && link.subset.length > 0
        ? this.joints.filter(
            (joint): joint is RealJoint =>
              joint instanceof RealJoint && joint.isWelded && link.joints.includes(joint)
          )
        : this.joints.filter(
            (joint): joint is RealJoint => joint instanceof RealJoint && joint.isWelded
          );

    let changed = false;
    scope.forEach((joint) => {
      changed = this.unweldTopology(joint) || changed;
    });
    if (changed) this.finishStructuralEdit(true);
  }

  private unweldJointTopology(joint: RealJoint): boolean {
    if (!joint.isWelded) return false;
    const compound = this.links.find(
      (link): link is RealLink =>
        link instanceof RealLink && link.subset.length > 0 && link.joints.includes(joint)
    );
    if (!compound) {
      joint.isWelded = false;
      return false;
    }

    const leaves = compound.subset.filter((link) => link instanceof RealLink) as RealLink[];
    joint.isWelded = false;
    const remaining = [...leaves];
    const components: RealLink[][] = [];

    while (remaining.length > 0) {
      const component: RealLink[] = [];
      const queue = [remaining.shift()!];
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        for (let index = remaining.length - 1; index >= 0; index--) {
          const candidate = remaining[index];
          const sharesAnotherWeld = current.joints.some(
            (currentJoint) =>
              currentJoint instanceof RealJoint &&
              currentJoint !== joint &&
              currentJoint.isWelded &&
              candidate.joints.includes(currentJoint)
          );
          if (sharesAnotherWeld) queue.push(...remaining.splice(index, 1));
        }
      }
      components.push(component);
    }

    const replacementLinks = components.map((component) =>
      component.length === 1 ? component[0] : this.createNewCompoundLinkFromSubset(component)
    );
    const compoundIndex = this.links.indexOf(compound);
    this.links.splice(compoundIndex, 1, ...replacementLinks);

    const forcesToReassign = this.forces.filter(
      (force) => force.link === compound || force.link.id === compound.id
    );
    compound.forces = [];
    forcesToReassign.forEach((force) => {
      const owner = [...replacementLinks]
        .filter((link): link is RealLink => link instanceof RealLink)
        .sort((left, right) => {
          const distanceDifference =
            this.distanceFromForceToLink(force, left) - this.distanceFromForceToLink(force, right);
          return distanceDifference === 0 ? left.id.localeCompare(right.id) : distanceDifference;
        })[0];
      if (owner) this.attachForceToLink(force, owner);
    });
    return true;
  }

  private distanceFromForceToLink(force: Force, link: RealLink): number {
    const leaves = link.subset.length > 0 ? link.subset : [link];
    let closest = Number.POSITIVE_INFINITY;
    leaves.forEach((leaf) => {
      if (leaf.joints.length === 1) {
        closest = Math.min(closest, getDistance(force.startCoord, leaf.joints[0]));
        return;
      }
      for (let first = 0; first < leaf.joints.length - 1; first++) {
        for (let second = first + 1; second < leaf.joints.length; second++) {
          const [x, y] = point_on_line_segment_closest_to_point(
            force.startCoord.x,
            force.startCoord.y,
            leaf.joints[first].x,
            leaf.joints[first].y,
            leaf.joints[second].x,
            leaf.joints[second].y
          );
          closest = Math.min(
            closest,
            distance_points(force.startCoord.x, force.startCoord.y, x, y)
          );
        }
      }
    });
    return closest;
  }

  createForceAtCOM() {
    const com = this.activeObjService.selectedLink.CoM;
    // The default arrow is (1, 3) of the user's units long, in model units.
    this.createForce(
      new Coord(com.x, com.y),
      new Coord(com.x + 1 * MODEL_SCALE, com.y + 3 * MODEL_SCALE)
    );
  }

  createForce(startCoord: Coord, endCoord: Coord): Force | undefined {
    const selectedLink = this.activeObjService.selectedLink;
    if (!(selectedLink instanceof RealLink)) return undefined;
    startCoord = new Coord(startCoord.x, startCoord.y);
    endCoord = new Coord(endCoord.x, endCoord.y);
    // TODO: utilize dot product to find point that is closest to the line
    if (selectedLink.joints.length === 2) {
      const lineVector: Coord = new Coord(
        selectedLink.joints[0].x - selectedLink.joints[1].x,
        selectedLink.joints[0].y - selectedLink.joints[1].y
      );

      // Calculate the vector from the first point on the line to the given point
      const givenPointVector: Coord = new Coord(
        startCoord.x - selectedLink.joints[0].x,
        startCoord.y - selectedLink.joints[0].y
      );

      // Calculate the dot product of the line vector and the given point vector
      const dotProduct: number =
        givenPointVector.x * lineVector.x + givenPointVector.y * lineVector.y;

      // Calculate the length of the line vector squared
      const lineLengthSquared: number = lineVector.x * lineVector.x + lineVector.y * lineVector.y;

      if (lineLengthSquared > 0) {
        // Calculate the parameter t for the projection onto the line
        const t: number = dotProduct / lineLengthSquared;

        // Calculate the projected point on the line
        startCoord.x = selectedLink.joints[0].x + t * lineVector.x;
        startCoord.y = selectedLink.joints[0].y + t * lineVector.y;
      }
    }
    let maxNumber = 1;
    if (this.forces.length !== 0) {
      maxNumber = Math.max(...this.forces.map((f) => parseInt(f.id.replace(/\D/g, '')))) + 1;
    }
    const force = new Force('F' + maxNumber.toString(), selectedLink, startCoord, endCoord);
    this.forces.push(force);
    this.attachForceToLink(force, selectedLink);
    PositionSolver.setUpSolvingForces(this.forces);
    this.updateMechanism(true);
    this.onMechUpdateState.next(3);
    return force;
  }
}
