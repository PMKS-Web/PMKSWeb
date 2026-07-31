import { Injectable, Injector } from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Link, SliderBlock, RealLink } from '../model/link';
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
import { SettingsService } from './settings.service';
import { Coord } from '../model/coord';
import { Line } from '../model/line';
import { SaveHistoryService } from './save-history.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { PositionSolver } from '../model/mechanism/position-solver';
import { ColorService } from './color.service';
import { siUnitFactorsForLength } from '../model/unit-conversions';
import { transformRigidCoord, transformRigidPath } from '../model/compound-link-path';
import { MergeRefusal, refuseJointMerge } from '../model/drop-target';
import { redundantlyHeldJointSets } from '../model/rigid-bodies';

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
    console.log('update mechanism', save);
    Force.normalizeVisualWidths(this.forces);
    // Changing the input speed re-samples the same geometry onto a different time
    // axis. Hold the simulation time rather than the sample index, so t and the pose
    // on screen stay consistent with each other across the rebuild. Read it before
    // rewinding, which is what the held time is measured against. The drawn time,
    // not the sample's: during playback it carries the sub-sample fraction.
    const heldTime = this.currentTimeSeconds();
    this.restoreStartPose();

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
    let inputAngularVelocity = (this.settingsService.inputSpeed.value * Math.PI) / 30;
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

  getJointPath(joint: Joint) {
    if (this.mechanisms[0].joints[0].length === 0) {
      return '';
    }
    let string = 'M';
    const jointIndex = this.joints.findIndex((j) => j.id === joint.id);
    string +=
      this.mechanisms[0].joints[0][jointIndex].x.toString() +
      ' , ' +
      this.mechanisms[0].joints[0][jointIndex].y.toString();
    for (let j_index = 1; j_index < this.mechanisms[0].joints.length; j_index++) {
      string +=
        'L' +
        this.mechanisms[0].joints[j_index][jointIndex].x.toString() +
        ' , ' +
        this.mechanisms[0].joints[j_index][jointIndex].y.toString();
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
    const joint = this.joints.find(
      (j) => j.id === this.activeObjService.selectedJoint.id
    ) as RealJoint;

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

  private finishStructuralEdit(save: boolean = true): void {
    this.rebuildJointGraph();
    this.reconcileSlots();
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
   * Anything else is not, so the slot returns to the direction it was last
   * pointing and becomes an ordinary grounded guide. That keeps the slider the
   * user drew, which removing it would not.
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
        joint.groundAt(joint.slotAngle);
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
    const refusal = refuseJointMerge(source, target);
    if (refusal) {
      return refusal;
    }

    // A weld is a joint flag plus a compound link built around it, so the two
    // have to be taken apart before the topology moves and rebuilt afterwards.
    // Going through the weld path rather than editing compounds by hand is what
    // makes the result a real compound instead of a joint merely flagged welded
    // with a stray link beside it.
    const shouldWeld = source.isWelded || target.isWelded;
    if (source.isWelded) this.unweldJointTopology(source);
    if (target.isWelded) this.unweldJointTopology(target);

    // Ground and input are things the user set deliberately. A merge that
    // dropped one would quietly change what the mechanism is, so the survivor
    // inherits both.
    target.ground = target.ground || source.ground;
    target.input = target.input || source.input;

    this.links.forEach((link) => this.replaceJointInLink(link, source, target));
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
    if (shouldWeld) this.weldJointTopology(target);

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

  deleteJoint() {
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
        // Now that all subsets have been gone over, do the final check
        if (l.subset.length === 1) {
          l = l.subset[0];
          const delLinkIndex = this.links.findIndex((li) => li.id === l.id);
          this.links.splice(delLinkIndex, 1);
          this.links.push(l);
          l.joints.forEach((jt) => {
            if (!(jt instanceof RealJoint)) {
              return;
            }
            jt.isWelded = false;
            jt.links = [];
            jt.links.push(l);
          });
        } else if (l.subset.length === 0) {
          const sliceIndex = this.links.findIndex((li) => li.id === l.id);
          this.links.splice(sliceIndex, 1);
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
    //Scale this vector to be 0.01
    perpVector = perpVector.normalize().scale(0.01);
    //Add this vector to the com
    com = com.add(perpVector);

    this.addJointAt(com);
  }

  addJointAt(coord: Coord) {
    const newId = this.determineNextLetter();
    const newJoint = new RevJoint(newId, coord.x, coord.y);
    this.activeObjService.selectedLink.joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      j.connectedJoints.push(newJoint);
      newJoint.connectedJoints.push(j);
    });
    if (
      this.activeObjService.selectedLink.isWelded &&
      this.activeObjService.selectedLink.lastSelectedSublink
    ) {
      this.activeObjService.selectedLink.lastSelectedSublink.id =
        this.activeObjService.selectedLink.lastSelectedSublink?.id.concat(newJoint.id);
      this.activeObjService.selectedLink.lastSelectedSublink.fixedLocations.push({
        id: newJoint.id,
        label: newJoint.id,
      });
      this.activeObjService.selectedLink.lastSelectedSublink.joints.push(newJoint);
    }
    newJoint.links.push(this.activeObjService.selectedLink);
    this.activeObjService.selectedLink.joints.push(newJoint);
    this.activeObjService.selectedLink.id += newJoint.id;
    this.activeObjService.selectedLink.d = this.activeObjService.selectedLink.getPathString();
    this.joints.push(newJoint);
    this.onMechUpdateState.next(3);
    this.updateMechanism(true);
  }

  deleteLink() {
    const link = this.activeObjService.selectedLink;
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

  toggleGround() {
    //Should be called toggleGround
    if (
      this.activeObjService.selectedJoint instanceof PrisJoint &&
      this.activeObjService.selectedJoint.isFloating
    ) {
      // A floating slot already has somewhere to go: pin its current direction
      // to the world and it becomes an ordinary guide, geometry unchanged. The
      // journey back needs a carrier and a joint pair, which only the drop-on-
      // link gesture supplies, so it waits for the UI phase.
      this.activeObjService.selectedJoint.groundAt(this.activeObjService.selectedJoint.slotAngle);
      this.finishStructuralEdit(true);
      return;
    }
    if (this.activeObjService.selectedJoint instanceof PrisJoint) {
      const revJoint = this.activeObjService.selectedJoint.connectedJoints.find(
        (j) => j instanceof RevJoint
      )!;
      if (!(revJoint instanceof RevJoint)) {
        return;
      }

      this.activeObjService.selectedJoint.connectedJoints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.connectedJoints.findIndex(
          (jt) => jt.id === this.activeObjService.selectedJoint.id
        );
        j.connectedJoints.splice(removeIndex, 1);
      });
      // The selected slider's own block, not simply the first one in the
      // mechanism: with two slots on the canvas, un-grounding the second used
      // to dismantle the first.
      const piston = this.activeObjService.selectedJoint.links.find(
        (l) => l instanceof SliderBlock
      );
      if (!piston) {
        return;
      }
      piston.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.links.findIndex((l) => l.id === piston.id);
        j.links.splice(removeIndex, 1);
      });
      const prismaticJointIndex = this.joints.findIndex(
        (j) => j.id == this.activeObjService.selectedJoint.id
      );
      const pistonIndex = this.links.findIndex((l) => l.id === piston.id);
      this.joints.splice(prismaticJointIndex, 1);
      this.links.splice(pistonIndex, 1);

      revJoint.ground = true;
      // let joint = this.activeObjService.selectedJoint as RevJoint;
      // // TODO: Be sure to remove connected joints and links that are ImagJoint and ImagLinks
      // joint = new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground, joint.links, joint.connectedJoints);
      // const selectedJointIndex = this.findJointIDIndex(this.activeObjService.selectedJoint.id, this.joints);
      // this.joints[selectedJointIndex] = joint;
    } else {
      this.activeObjService.selectedJoint.ground = !this.activeObjService.selectedJoint.ground;
      this.activeObjService.selectedJoint.input = false;
    }
    this.updateMechanism(true);
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

    //If we are about to enable input, we need to check to see if there is an existing input joint
    if (!jointToToggleInput.input) {
      //Go through all other joints and disable input
      this.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.input) {
          j.input = false;
        }
      });
    }

    //Toggle the input joint
    jointToToggleInput.input = !jointToToggleInput.input;

    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  toggleSlider() {
    if (!this.gridUtils.isAttachedToSlider(this.activeObjService.selectedJoint)) {
      // Create Prismatic Joint
      const selectedJointInput = this.activeObjService.selectedJoint.input;
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
      const prisJoint = new PrisJoint(
        prismaticJointId,
        this.activeObjService.selectedJoint.x,
        this.activeObjService.selectedJoint.y,
        selectedJointInput,
        true,
        [],
        connectedJoints
      );
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
    this.updateMechanism(true);
    console.log(this.joints);
    console.log(this.links);
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
    this.showPathHolder = !(this.mechanismTimeStep === 0 && !animationState);
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
    const atStartPose = this.mechanismTimeStep === 0 && !AnimationBarComponent.animate;
    if (atStartPose || !this.mechanisms[0]?.joints[0]?.length) {
      return;
    }
    this.applyPose(0, 0);
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

    // Clicking Weld on a named joint is a deliberate act, so this warns rather
    // than refuses. The linkage still moves and still solves; only its forces
    // lose a unique solution, and the analysis panel says so in its own right.
    // A drag that lands on the same geometry is refused instead, because
    // dropping a joint somewhere is far more easily done by accident.
    const created = this.weldWouldPinTwice(joint);

    if (!this.weldJointTopology(joint)) return;
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
    if (!this.unweldJointTopology(joint)) return;
    this.finishStructuralEdit(true);
  }

  public unweldSelectedJoint(): void {
    const joint = this.joints.find(
      (candidate) => candidate.id === this.activeObjService.selectedJoint.id
    );
    if (joint instanceof RealJoint) this.unWeldJoint(joint);
  }

  public unweldAll(): void {
    let changed = false;
    const weldedJoints = this.joints.filter(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.isWelded
    );
    weldedJoints.forEach((joint) => {
      changed = this.unweldJointTopology(joint) || changed;
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
    this.createForce(new Coord(com.x, com.y), new Coord(com.x + 1, com.y + 3));
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
