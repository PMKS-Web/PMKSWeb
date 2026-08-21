import { Injectable, Injector, inject } from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Link, SliderBlock, RealLink } from '../model/link';
import { isSlideCandidate, slideAssemblyAt } from '../model/slide-assembly';
import {
  Cylinder,
  cylinderCreationLayout,
  cylinderJoints,
  cylinderStrokeAlong,
  cylinderOfJointIn,
  cylinderOfLinkIn,
  isCylinderInterior,
  normalizedCylinderPose,
  sealedCylinderStructures,
  structuralCylinderAt,
} from '../model/cylinder';
import { Force } from '../model/force';
import {
  DriveProfile,
  driveProfileOf as buildDriveProfile,
  fractionalSampleAlong,
} from '../model/mechanism/drive-profile';
import { Mechanism } from '../model/mechanism/mechanism';
import {
  MechanismPartition,
  partitionMechanisms,
  UnassignedGeometry,
} from '../model/mechanism/mechanism-partition';
import {
  describeUnassigned,
  ForceRequirement,
  MechanismReadiness,
  readinessOf,
  UnassignedReport,
} from '../model/mechanism/readiness';
import { InstantCenter } from '../model/instant-center';
import {
  jointStates,
  roundNumber,
  LengthUnit,
  point_on_line_segment_closest_to_point,
  getDistance,
  distance_points,
} from '../model/utils';
import { BehaviorSubject, Subject } from 'rxjs';
import { GridUtilsService } from './grid-utils.service';
import { ActiveObjService } from './active-obj.service';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { describeActuator } from '../model/actuator';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { slotHalfLength } from '../model/joint-marks';
import { uniformBodyOf } from '../model/uniform-body';
import { siUnitFactors } from '../model/unit-conversions';
import { DragStateService } from './drag-state.service';
import { Coord } from '../model/coord';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { frozenJointIds } from '../model/lock-set';
import { SaveHistoryService } from './save-history.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { PositionSolver, SAMPLES_PER_STROKE } from '../model/mechanism/position-solver';
import { ColorService } from './color.service';
import { siUnitFactorsForLength } from '../model/unit-conversions';
import { transformRigidCoord, transformRigidPath } from '../model/compound-link-path';
import { MergeRefusal, refuseJointMerge } from '../model/drop-target';
import { redundantlyHeldJointSets } from '../model/rigid-bodies';
import { MODEL_SCALE } from '../model/render-scale';
import { labelForBody } from '../model/body-label';

/**
 * The names joints are given, in the order they are handed out.
 *
 * Letters only, and only ones that survive a round trip through the URL codec,
 * where a joint's name is a token in a comma- and period-delimited payload.
 */
const JOINT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

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
  gridUtils = inject(GridUtilsService);
  activeObjService = inject(ActiveObjService);
  private injector = inject(Injector);
  private settingsService = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private notify = inject(NotificationService);

  public mechanismTimeStep: number = 0;
  /**
   * Is the animation running?
   *
   * On the service that owns playback. It used to be a static on the animation
   * bar, which was a component: the flag outlived the bar's own rendering by a
   * whole redesign, and every part of the app that needed to know whether the
   * mechanism was moving had to import a piece of chrome to ask.
   */
  public isPlaying: boolean = false;
  /** Playback rate relative to real time. 1 means one simulated second per second. */
  public animationSpeedMultiplier: number = 1;
  public joints: Joint[] = [];
  public links: Link[] = [];
  public forces: Force[] = [];
  public ics: InstantCenter[] = [];
  public mechanisms: Mechanism[] = [];
  /**
   * Which part of the drawing each entry of `mechanisms` was built from, in the
   * same order. Kept beside the solved mechanisms rather than inside them
   * because these are the *editable* objects the grid draws and the panels
   * mutate; a Mechanism holds deep copies at every timestep.
   */
  public partitions: MechanismPartition[] = [];
  /** Geometry that is in no mechanism, and why. Reported, never solved. */
  public unassigned: UnassignedGeometry = { floatingChains: [], looseJoints: [], fixedLinks: [] };
  public showPathHolder: boolean = true;

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
  /**
   * Whether every machine runs on the one clock.
   *
   * Synced is the default and the useful case: two mechanisms on the same wall
   * clock can be compared, which is the whole reason for drawing them together.
   * Unsynced gives each its own time and its own play button, for reading one
   * machine's cycle without the others moving.
   */
  syncMechanisms = true;
  /**
   * Each machine's own place in its own cycle, in seconds from its start pose.
   *
   * Always -- not only while unsynced. The machines were sharing one clock and
   * one running flag, which is why pausing or scrubbing one of them moved the
   * others. `syncMechanisms` decides how many rows the transport offers, and
   * nothing else now.
   */
  private ownSeconds: number[] = [];
  /** Which machines are running. */
  private ownPlaying: boolean[] = [];
  /**
   * Which way each machine's playback runs, +1 or -1.
   *
   * Only ever -1 for a machine whose input reverses on its own. Turning a
   * continuous drive round is an edit -- the solved cycle itself is mirrored --
   * but a machine that already goes out and back has no other direction to be
   * driven in, so the only thing "reverse" can mean there is to play the cycle
   * backwards. That is a view of the same motion, not a different mechanism,
   * which is why it lives here and not in the URL.
   */
  private playbackDirection: number[] = [];
  private playbackFrameQueued = false;
  private advancingPlayback = false;
  /** Set while one row is being seeked, so the seek does not spread. */
  private seekingOneMechanism = false;

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
    this.solveRevision++;
    Force.normalizeVisualWidths(this.forces);
    // Changing the input speed re-samples the same geometry onto a different time
    // axis. Hold the simulation time rather than the sample index, so t and the pose
    // on screen stay consistent with each other across the rebuild. Read it before
    // rewinding, which is what the held time is measured against. The drawn time,
    // not the sample's: during playback it carries the sub-sample fraction.
    const heldTime = this.currentTimeSeconds();
    // Each machine's own place, not just the master's. Restoring only the
    // shared time put every machine back on the master's clock, so any edit --
    // a speed change, a reversal, a joint moved -- silently pulled them all
    // back into step with each other.
    const heldEach = this.partitions.map((partition, index) => ({
      id: partition.id,
      seconds: this.ownSeconds[index] ?? 0,
    }));
    // Which machines are only running backwards because their drive was turned
    // round without re-solving them.
    //
    // `reverseDrive` leaves the frames alone and walks them backwards instead,
    // which is what keeps a reader's place on the chart. The rebuild below
    // solves fresh frames *from the drive's new sign*, so they already run the
    // new way and that compensation becomes a second reversal: the machine
    // went back to turning the way it originally did while the stored speed
    // said the opposite.
    const heldCompensation = this.partitions.map((partition, index) => ({
      id: partition.id,
      compensating: this.mechanisms[index]?.framesRunBackwards === true,
    }));
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
    let unitStr = 'cm';
    switch (this.settingsService.lengthUnit.value) {
      case LengthUnit.INCH:
        unitStr = 'in';
        break;
      case LengthUnit.METER:
        unitStr = 'm';
        break;
    }

    this.applyUniformBodyProperties(unitStr);

    // One machine per grounded component of the drawing. Each is solved on its
    // own -- its own mobility, its own input, its own cycle -- so a half-built
    // chain in the corner no longer makes the finished linkage beside it
    // unsolvable.
    const partitioning = partitionMechanisms(this.joints, this.links, this.forces);
    this.partitions = partitioning.mechanisms;
    this.unassigned = partitioning.unassigned;
    this.rebuildOwnerIndex();
    this.mechanisms = this.partitions.map(
      //If the mechanism is simulatable, it will generate loops and all future time steps
      (partition) =>
        new Mechanism(
          partition.joints,
          partition.links,
          partition.forces,
          this.ics,
          this.settingsService.isGravity.value,
          unitStr,
          this.inputVelocityFor(partition)
        )
    );
    // The frames are new and run the drive's way, so anything that was walking
    // the old ones backwards to make up for a reversal stops. A machine whose
    // playback the reader turned round themselves -- a rocking one, which
    // reverses by playback alone -- was never compensating and is left as it is.
    this.partitions.forEach((partition, index) => {
      const was = heldCompensation.find((entry) => entry.id === partition.id);
      if (was?.compensating) {
        this.playbackDirection[index] = this.directionOf(index) < 0 ? 1 : -1;
      }
    });
    this.activeObjService.fakeUpdateSelectedObj();
    this.reseekToTime(heldTime);
    this.restoreOwnTimes(heldEach);

    if (save) {
      this.save();
    }
  }

  /**
   * How fast this mechanism's own input is driven, in the units its solver wants.
   *
   * Settings exposes RPM to users and persistence; solvers use rad/s. A
   * prismatic input is a different quantity, not another unit of the same one:
   * its speed is length per second, so it comes from its own setting and never
   * meets the pi/30 conversion -- which used to run on it anyway, leaving a
   * driven block travelling at a tenth of the speed the panel reported. What it
   * does need is the MODEL_SCALE the solvers measure length in; an angular
   * speed has no length in it to want one.
   *
   * Asked per mechanism rather than once for the drawing, because which of the
   * two quantities applies depends on what *this* machine is driven by: a
   * cylinder beside a crank must not be handed the crank's rpm.
   */
  private inputVelocityFor(partition: MechanismPartition): number {
    const driven = partition.joints.find((j) => j instanceof RealJoint && j.input) as
      RealJoint | undefined;
    const signed = this.driveSpeedOf(driven);
    // rpm for a pin, length per second for a slider -- two different
    // quantities, and only the second has a length in it wanting MODEL_SCALE.
    return driven instanceof PrisJoint ? signed * MODEL_SCALE : (signed * Math.PI) / 30;
  }

  /**
   * How fast a joint drives its mechanism, signed for direction, in the units
   * its kind of drive is measured in.
   *
   * One definition, read by the solver and shown by the panel. Zero on the
   * joint means "follow the document-wide default", which is what a URL written
   * before mechanisms could be driven separately says, and what a joint just
   * switched on says too.
   */
  driveSpeedOf(joint: RealJoint | undefined): number {
    if (joint && joint.driveSpeed !== 0) {
      return joint.driveSpeed;
    }
    const magnitude =
      joint instanceof PrisJoint
        ? this.settingsService.linearInputSpeed.value
        : this.settingsService.inputSpeed.value;
    return this.settingsService.isInputCW.value ? -magnitude : magnitude;
  }

  /**
   * Set the speed of one mechanism's drive.
   *
   * The document-wide default follows along, so the next joint switched on
   * starts where the reader last was rather than at whatever the app shipped
   * with -- and so a drawing holding one mechanism behaves exactly as it did
   * when the speed really was one number.
   */
  setDriveSpeed(joint: RealJoint, signed: number): void {
    if (!Number.isFinite(signed) || signed === 0) {
      return;
    }
    joint.driveSpeed = signed;
    const magnitude = Math.abs(signed);
    if (joint instanceof PrisJoint) {
      this.settingsService.linearInputSpeed.next(magnitude);
    } else {
      this.settingsService.inputSpeed.next(magnitude);
    }
    this.settingsService.isInputCW.next(signed < 0);
  }

  /**
   * Take the drive away from whatever currently has it in this joint's machine.
   *
   * One input per *mechanism*, not one per drawing. Clearing every input in the
   * document -- which is what this used to do -- meant that driving a second
   * linkage stopped the first, so two machines could never run at once however
   * well the solver handled them.
   */
  private clearInputsSharingMechanismWith(joint: RealJoint): void {
    const index = this.indexOfMechanismContaining(joint);
    const scope = index === -1 ? this.joints : this.partitions[index].ownJoints;
    scope.forEach((candidate) => {
      if (candidate instanceof RealJoint && candidate.input && candidate.id !== joint.id) {
        candidate.input = false;
      }
    });
  }

  /**
   * Which machine each part belongs to, worked out once per rebuild.
   *
   * This question is asked of every joint and every link on every change
   * detection pass -- the canvas asks it to decide each part's colour, the
   * panels ask it to decide whose clock they are reading -- and answering it by
   * searching the partitions is quadratic in the size of the drawing. On a
   * forty-five joint linkage that was tens of thousands of id comparisons per
   * frame, which is what made the stress test crawl and what made *anything*
   * that redraws, the settings drawer included, crawl along with it.
   */
  private ownerOfPart = new Map<Joint | Link | Force, number>();

  /** Every joint some link is made of, for the same reason. */
  private jointsOnALink = new Set<Joint>();

  private rebuildOwnerIndex(): void {
    const attached = new Set<Joint>();
    this.links.forEach((link) => link.joints.forEach((joint) => attached.add(joint)));
    this.jointsOnALink = attached;

    const owner = new Map<Joint | Link | Force, number>();
    // In partition order, first writer wins: a fixed bar between two frames
    // puts its far end in both, and `ownJoints` is what says whose it is.
    this.partitions.forEach((partition, index) => {
      const claim = (part: Joint | Link | Force) => {
        if (!owner.has(part)) owner.set(part, index);
      };
      partition.ownJoints.forEach(claim);
      partition.links.forEach(claim);
      partition.forces.forEach(claim);
    });
    this.ownerOfPart = owner;
  }

  /** Which mechanism holds this joint, link or force — none, if it is unassigned. */
  indexOfMechanismContaining(part: Joint | Link | Force): number {
    // Optional because this method is also borrowed onto a stub in the test
    // fixtures, which has partitions but never ran a rebuild.
    const known = this.ownerOfPart?.get(part);
    if (known !== undefined) return known;
    // A part the index has not seen -- one made since the last rebuild, or a
    // copy carrying the same id. Answer it the slow, always-correct way.
    const id = part.id;
    return this.partitions.findIndex(
      (partition) =>
        partition.ownJoints.some((joint) => joint.id === id) ||
        partition.links.some((link) => link.id === id) ||
        partition.forces.some((force) => force.id === id)
    );
  }

  /** The partition this part belongs to, if it belongs to one. */
  partitionContaining(part: Joint | Link | Force): MechanismPartition | undefined {
    const index = this.indexOfMechanismContaining(part);
    return index === -1 ? undefined : this.partitions[index];
  }

  /** The solved mechanism this part belongs to, if it belongs to one. */
  mechanismContaining(part: Joint | Link | Force): Mechanism | undefined {
    const index = this.indexOfMechanismContaining(part);
    return index === -1 ? undefined : this.mechanisms[index];
  }

  /** Can this part's own machine be simulated? Says nothing about the others. */
  isPartSimulatable(part: Joint | Link | Force): boolean {
    return this.mechanismContaining(part)?.isMechanismValid() ?? false;
  }

  /**
   * The mechanism whose cycle is longest, which is the one the shared clock is
   * measured against: run every machine on the same wall clock and the master
   * timeline has to be long enough to hold the slowest of them.
   */
  masterMechanismIndex(): number {
    let best = -1;
    let longest = -1;
    this.mechanisms.forEach((mechanism, index) => {
      if (!mechanism.isMechanismValid()) {
        return;
      }
      if (mechanism.cyclePeriod > longest) {
        longest = mechanism.cyclePeriod;
        best = index;
      }
    });
    // Nothing runs, so nothing is really the master. Naming the first anyway
    // keeps the timeline reporting the empty clock an unsolved mechanism has
    // always reported, instead of a missing one.
    return best === -1 && this.mechanisms.length > 0 ? 0 : best;
  }

  /** The mechanism the shared scrubber is measured against, if any can run. */
  masterMechanism(): Mechanism | undefined {
    const index = this.masterMechanismIndex();
    return index === -1 ? undefined : this.mechanisms[index];
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
        if (!link.comIsCustom) {
          link.CoM = RealLink.determineCenterOfMass(link.joints);
          link.updateCoMDs();
        }
        link.updateLengthAndAngle();
      }
    }
  }

  /**
   * Re-place the mechanism at a simulation time after a rebuild. Wrapping keeps a
   * time held from a slower cycle inside the new, shorter one.
   */
  private reseekToTime(seconds: number) {
    if (!this.oneValidMechanismExists()) {
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
    this.animate(this.stepAtTime(wrapped), this.isPlaying);
    // animate() treats any external call as a seek and snaps its clock to the
    // sample, so restore the sub-sample fraction afterwards — playback resumes
    // from exactly the held time, not the nearest sample.
    this.playbackTimeSeconds = wrapped;
  }

  /**
   * Put each machine back where it was after a rebuild.
   *
   * By partition id, not by index: a rebuild can add, remove or reorder
   * mechanisms, and pairing them positionally would hand one machine another's
   * place in its cycle.
   */
  private restoreOwnTimes(held: { id: string; seconds: number }[]): void {
    if (!this.oneValidMechanismExists()) return;
    this.partitions.forEach((partition, index) => {
      const was = held.find((entry) => entry.id === partition.id);
      const period = this.mechanisms[index]?.cyclePeriod ?? 0;
      if (!was || !(period > 0) || !(was.seconds > 0)) return;
      this.ownSeconds[index] = ((was.seconds % period) + period) % period;
    });
    this.applyPose();
  }

  /**
   * Run something with the drawing parked at its start pose, and put every
   * machine back afterwards.
   *
   * Encoding a URL is a round trip through t = 0, because that is the pose the
   * format stores. Getting there and back used to go through `animate`, which
   * treats an outside call as a seek of the whole drawing -- so saving, which
   * happens on every edit, quietly pulled every machine onto the master's
   * clock. That is most of what "the mechanisms are not independent" was.
   */
  encodeFromStartPose<T>(encode: (heldStep: number) => T): T {
    const held = this.ownSeconds.slice();
    const step = this.mechanismTimeStep;
    const playing = this.isPlaying;
    // Any machine away from its own start, not just the one the shared handle
    // reports. Unsynced, each keeps its own clock: with the master parked at
    // zero and another machine scrubbed a quarter of the way round, the rewind
    // was skipped and the encoder wrote down the pose that machine happened to
    // be *displaying* as the pose it starts in. The linkage the reader shared
    // arrived at the other end a different shape.
    if (step > 0 || held.some((seconds) => seconds > 0)) {
      this.animate(0, false);
    }
    try {
      return encode(step);
    } finally {
      this.ownSeconds = held;
      this.seekingOneMechanism = true;
      try {
        this.animate(step, playing);
      } finally {
        this.seekingOneMechanism = false;
      }
    }
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
        // The stored along/across offset is in model lengths too; re-read it
        // from the correctly scaled point, or the next rebuild would derive
        // the CoM from a stale offset and throw it lengthScale times as far.
        if (link.comIsCustom) link.captureComOffset();
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
    // Its own mechanism, found by id: a joint traces the cycle of the machine
    // it belongs to, and looking its position up by index into another
    // machine's frames would draw some other joint's path under it.
    const solved = this.mechanismContaining(joint);
    if (!solved || solved.joints.length === 0 || solved.joints[0].length === 0) {
      return '';
    }
    if (!solved.joints[0].some((candidate) => candidate.id === joint.id)) {
      return '';
    }
    const at = (step: number) => {
      const sample = solved.joints[step].find((candidate) => candidate.id === joint.id)!;
      return `${sample.x} , ${sample.y}`;
    };
    let string = 'M' + at(0);
    for (let j_index = 1; j_index < solved.joints.length; j_index++) {
      string += 'L' + at(j_index);
    }
    return string;
  }

  /**
   * Can anything in this drawing be simulated?
   *
   * "Any" rather than "all" on purpose: one half-built chain in the corner must
   * not lock a finished linkage out of analysis. Where the question is really
   * about a particular part, ask `isPartSimulatable` instead.
   */
  oneValidMechanismExists() {
    return this.mechanisms.some((mechanism) => mechanism?.isMechanismValid());
  }

  /** Every mechanism in the drawing is ready. The stricter question. */
  allMechanismsValid(): boolean {
    return this.mechanisms.length > 0 && this.mechanisms.every((m) => m.isMechanismValid());
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

  /**
   * A free-standing bar between two points — what `Add Link` on bare grid
   * commits when the drag is released.
   *
   * Here rather than in the canvas because it is a creation, and every other
   * one lives here; the canvas has the same recipe inline because it also has a
   * ghost to draw and a drag to end. Anything that wants a bar without a
   * gesture — the tutorial doing a step for the student — asks for one here.
   */
  addBar(from: Coord, to: Coord): RealLink {
    const first = this.createRevJoint(from.x.toString(), from.y.toString());
    const second = this.createRevJoint(to.x.toString(), to.y.toString(), first.id);
    return this.joinWithBar(first, second, [first, second]);
  }

  /**
   * A bar hung off a joint that is already there, as `Attach Link` makes.
   *
   * The anchor is not created and not re-merged: it is already in the drawing,
   * and pushing it a second time gives it two entries and one very confusing
   * delete.
   */
  addBarFrom(anchor: RealJoint, to: Coord): RealLink {
    const far = this.createRevJoint(to.x.toString(), to.y.toString());
    return this.joinWithBar(anchor, far, [far]);
  }

  /** The wiring both of the above share: connect, name, merge, re-solve. */
  private joinWithBar(first: RealJoint, second: RealJoint, fresh: Joint[]): RealLink {
    first.connectedJoints.push(second);
    second.connectedJoints.push(first);
    const link = this.gridUtils.createRealLink(first.id + second.id, [first, second]);
    first.links.push(link);
    second.links.push(link);
    this.mergeToJoints(fresh);
    this.mergeToLinks([link]);
    this.updateMechanism(true);
    return link;
  }

  /**
   * Everything on the grid, gone, as one undo entry.
   *
   * The joints go one at a time because deleting a joint is what takes its
   * links with it, but none of them saves — otherwise clearing a four-bar
   * would cost four presses of Undo to take back.
   */
  deleteAll(): void {
    if (this.joints.length === 0 && this.links.length === 0 && this.forces.length === 0) return;
    [...this.joints].forEach((joint) => {
      this.activeObjService.updateSelectedObj(joint);
      this.deleteJoint(false);
    });
    this.activeObjService.updateSelectedObj(null);
    this.finishStructuralEdit(true);
  }

  /**
   * The next name for a joint: A, B, C ... Z, then a, b, c ... z.
   *
   * It used to be the highest letter in use plus one in character codes, which
   * walks straight off the end of the alphabet: the joint after Z was called
   * "[", then "\", then "]" -- names that read as damage, and that the panels
   * then repeated back as "Edit Cylinder ]`". Past z the gaps left by deleted
   * joints are filled, and past those a two-letter name is used; a drawing with
   * fifty-three live joints has run out of single letters honestly.
   */
  determineNextLetter(additionalLetters?: string[]) {
    const taken = new Set<string>(this.joints.map((joint) => joint.id));
    additionalLetters?.forEach((letter) => taken.add(letter));

    let highest = -1;
    taken.forEach((id) => {
      const at = JOINT_ALPHABET.indexOf(id);
      if (at > highest) highest = at;
    });

    const next = JOINT_ALPHABET[highest + 1];
    if (next !== undefined && !taken.has(next)) return next;

    const free = [...JOINT_ALPHABET].find((letter) => !taken.has(letter));
    if (free !== undefined) return free;

    for (const first of JOINT_ALPHABET) {
      for (const second of JOINT_ALPHABET) {
        if (!taken.has(first + second)) return first + second;
      }
    }
    return 'A';
  }

  /**
   * Names for the joints inside a part, which nothing ever shows.
   *
   * Hung off the letter of the part's own mount and numbered -- A1, A2, A3 --
   * so they read as belonging to it, and so `determineNextLetter` walks past
   * them: it ranks ids by their place in the alphabet, and one of these has no
   * place in it, which is exactly the point. They still have to be unique,
   * because two rams can share a mount and would otherwise ask for the same
   * three names.
   */
  private determineInteriorNames(base: string, count: number): string[] {
    const taken = new Set(this.joints.map((joint) => joint.id));
    const names: string[] = [];
    for (let index = 1; names.length < count; index++) {
      const candidate = `${base}${index}`;
      if (taken.has(candidate)) continue;
      taken.add(candidate);
      names.push(candidate);
    }
    return names;
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

  /**
   * Toggle the Lock mark on a joint, link, or force.
   *
   * A lock is an edit: it enters the URL, so it survives undo and travels in a
   * shared link — an instructor can lock everything but the one joint a class
   * is meant to drag. Geometry is untouched, so the rebuild is cheap and the
   * undo entry is the mark itself.
   */
  toggleLock(target: RealJoint | Link | Force): void {
    const wasLocked = this.isLockedTarget(target);
    // One kind of lock: a mark on a joint (a force, having none, marks
    // itself). Locking a link is a shortcut that marks all of its joints, so
    // unlocking one of those joints afterwards frees exactly that joint —
    // there is no second, link-level ledger to keep in agreement.
    this.lockMarksOf(target).forEach((mark) => (mark.locked = !wasLocked));
    this.updateMechanism(true);
    // The panel's position fields grey out against the frozen set, and that
    // set just changed under the same selection — re-announce it so they ask.
    this.activeObjService.fakeUpdateSelectedObj();
  }

  /** The joint (or force) marks a Lock on this target sets and clears. */
  private lockMarksOf(target: RealJoint | Link | Force): (RealJoint | Force)[] {
    if (target instanceof Force) return [target];
    const sealed = this.sealedPartOf(target);
    if (sealed) {
      // One sealed part, one mark: the prismatic pin, where the assembly's
      // other permanent bit (isSealed) already lives, and whose hold the
      // closure spreads to all five joints.
      return [sealed.slider];
    }
    if (target instanceof RealJoint) return [target];
    return target.joints.filter((joint): joint is RealJoint => joint instanceof RealJoint);
  }

  /**
   * The sealed cylinder a Lock on this target should mark — its body or an
   * interior joint. A *mount* is deliberately not the part: locking a mount
   * pins that one point and leaves the ram free to re-pose and swing about
   * it, which is the useful thing a locked attachment point means.
   */
  private sealedPartOf(target: RealJoint | Link | Force): Cylinder | undefined {
    if (target instanceof Force) return undefined;
    const sealed = this.cylinderAt(target);
    if (!sealed) return undefined;
    const isMount =
      target instanceof RealJoint &&
      (target.id === sealed.barrelFar.id || target.id === sealed.rodFar.id);
    return isMount ? undefined : sealed;
  }

  /**
   * Clear a specific set of Lock marks — what the refusal's Unlock button
   * carries: exactly the marks that held the refused gesture, nothing else.
   */
  unlock(marks: (RealJoint | Force)[]): void {
    if (marks.length === 0) return;
    marks.forEach((mark) => (mark.locked = false));
    this.updateMechanism(true);
    this.activeObjService.fakeUpdateSelectedObj();
  }

  /** Whether the Lock item for this object should read as "on". */
  isLockedTarget(target: RealJoint | Link | Force): boolean {
    const marks = this.lockMarksOf(target);
    return marks.length > 0 && marks.every((mark) => mark.locked);
  }

  /**
   * Lock the whole drawing, or let all of it go.
   *
   * Marks land on every joint and every force — the same marks the per-object
   * controls set — so Unlock on any one object, or on any one joint, frees
   * exactly that much and no bookkeeping disagrees about the rest.
   */
  setAllLocks(locked: boolean): void {
    this.joints.forEach((joint) => {
      if (joint instanceof RealJoint) joint.locked = locked;
    });
    this.forces.forEach((force) => (force.locked = locked));
    this.updateMechanism(true);
    this.activeObjService.fakeUpdateSelectedObj();
  }

  /** Whether any Lock mark is set at all — what enables Unlock All. */
  anythingLocked(): boolean {
    return (
      this.joints.some((joint) => joint instanceof RealJoint && joint.locked) ||
      this.forces.some((force) => force.locked)
    );
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
    // The parallel-axis term measures distances in model coordinates, which
    // are MODEL_SCALE user units, and mass and inertia live in different
    // prefixes per unit system. Unconverted, welding two 1 g bars produced
    // tens of thousands of kg·cm² — off by MODEL_SCALE² times the unit ratio.
    const parallelAxis = this.storedMoiFactor(this.currentUnitStr());
    const massMoI = leaves.reduce(
      (sum, link) =>
        sum +
        link.massMoI +
        link.mass *
          (Math.pow(link.CoM.x - CoM.x, 2) + Math.pow(link.CoM.y - CoM.y, 2)) *
          parallelAxis,
      0
    );

    const newLink = new RealLink(id, newLinkJoints, totalMass, massMoI, CoM, leaves);
    // The parallel-axis sum above is worth keeping exactly when a part's
    // numbers were chosen by a person; parts that all followed their geometry
    // leave the compound following its geometry too.
    newLink.moiIsCustom = leaves.some((leaf) => leaf instanceof RealLink && leaf.moiIsCustom);
    newLink.comIsCustom = leaves.some((leaf) => leaf instanceof RealLink && leaf.comIsCustom);
    if (newLink.comIsCustom) newLink.captureComOffset();
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
  /**
   * The one door for writing a body's mass, wherever the field lives.
   *
   * A compound and its members must keep telling one story: edit a member and
   * the compound's aggregate moves by the same amount; edit the compound and
   * the members scale to match, so unwelding later restores what the sum
   * really was. Without this, the mass table and the cylinder fields were two
   * sources of truth that only agreed until the first unweld.
   */
  assignBodyMass(body: Link, value: number): void {
    if (!(value >= 0)) return;
    if (body instanceof RealLink && body.subset.length > 0) {
      const members = body.subset;
      const total = members.reduce((sum, member) => sum + member.mass, 0);
      for (const member of members) {
        member.mass = total > 0 ? (member.mass / total) * value : value / members.length;
      }
    } else {
      const root = this.rootLinkOwning(body);
      if (root && root !== body) {
        root.mass += value - body.mass;
      }
    }
    body.mass = value;
  }

  /** Public: the cylinder panel writes part masses and must keep a welded
   * compound's aggregate true. */
  rootLinkOwning(link: Link): Link | undefined {
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
      if (!link.comIsCustom) {
        link.CoM = RealLink.determineCenterOfMass(link.joints);
      }
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

  /**
   * @param save mints the undo entry. Only a caller that deletes several joints
   * as one gesture passes `false`, and it owes a `finishStructuralEdit(true)`
   * of its own once the last one is gone — see `deleteMechanism`.
   */
  deleteJoint(save: boolean = true) {
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
        this.finishStructuralEdit(save);
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
        // Captured as a const so the narrowing to RealLink survives into the
        // closures below.
        const subsets = l.subset;
        const subsetNum = subsets.length;
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
          // Whether this subset still shares a joint with another one, asked of
          // the joints rather than of the letters in their ids. A link id is
          // its joints' names run together, so comparing characters says AA1
          // and A2B share something because both contain an "A" -- and a
          // cylinder's interior joints, or any drawing past its fifty-second,
          // have ids longer than a character.
          const sharesAJoint = sub.joints.some((joint) =>
            subsets.some(
              (other) =>
                other !== sub && other.joints.some((candidate) => candidate.id === joint.id)
            )
          );
          if (!sharesAJoint) {
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
          } else if (sub.joints.length === 1) {
            // special case, can slice this subset: one joint left, counted
            // rather than read off the length of a name that may not be one
            // character per joint.
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
    // Through the shared path, so a slot whose defining joint was just deleted
    // gets reconciled. Deleting a joint by itself is the one way to strand a
    // slot that does not go through mergeJoints or deleteLink.
    //
    // Saving here is what makes the deletion undoable. This read `false` for as
    // long as the tail read `updateMechanism()`, whose save flag defaults off —
    // so a joint deleted on its own left no history at all, while the very same
    // deletion routed through the cylinder branch above did.
    this.finishStructuralEdit(save);
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
  /**
   * Bumped when the *solved cycle* changes, rather than the pose being drawn.
   *
   * `poseRevision` moves on every frame of playback, because the pose is what
   * playback changes. Anything cached against the numbers themselves — the
   * export's sampled tables, for one — has to key on this instead, or watching
   * a mechanism run rebuilds it sixty times a second.
   */
  solveRevision = 0;
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
  readinessOfEachMechanism(): MechanismReadiness[] {
    return this.partitions.map((partition, index) =>
      readinessOf(partition, this.mechanisms[index], {
        cylinderName: (sliderId) => {
          const found = this.sealedStructures().find((c) => c.slider.id === sliderId);
          return found ? this.cylinderName(found) : sliderId;
        },
        drivenRefusal: (part) => {
          const driven = part.ownJoints.find((joint) => joint instanceof RealJoint && joint.input);
          if (!driven) {
            return undefined;
          }
          const refusal = describeActuator(driven);
          return typeof refusal === 'string' ? refusal : undefined;
        },
        strokeWarning: (part) => this.strokeWarningFor(part),
        describeSpeed: (part) => {
          const driven = part.joints.find((joint) => joint instanceof RealJoint && joint.input) as
            RealJoint | undefined;
          if (!driven) {
            return 'Not set';
          }
          const signed = this.driveSpeedOf(driven);
          const magnitude = Math.abs(signed).toFixed(2);
          const way = signed < 0 ? 'CW' : 'CCW';
          return driven instanceof PrisJoint
            ? `${magnitude} ${this.nup.unitLabel(this.settingsService.lengthUnit.value)}/s`
            : `${magnitude} RPM ${way}`;
        },
      })
    );
  }

  /**
   * What force analysis still needs, asked of the force solver rather than
   * guessed at.
   *
   * The solver already refuses precisely and says why -- an unsupported
   * topology, mass properties that are not numbers, an equilibrium that is
   * singular. Restating those conditions here would be a second opinion free to
   * drift from the first, and the drift would show as a tab that says Ready
   * above a panel that says it cannot solve.
   */
  /**
   * Re-derive every auto link's mass properties from its own skeleton.
   *
   * Runs at the one funnel every mutation passes through, for the same reason
   * the cylinder invariant does: whatever moved a joint — a drag, a panel
   * field, an undo — an auto link's centroid and moment of inertia follow the
   * geometry, and a custom one holds whatever its author typed.
   *
   * MoI = mass × k², with k² from the skeleton in model units. The unit
   * factor converts (stored-mass × user-length²) into the stored inertia unit
   * exactly — derived from the same siUnitFactors the solver converts with,
   * so the identity survives every unit system rather than being tuned to one.
   */
  private applyUniformBodyProperties(unitStr: string): void {
    const factor = this.storedMoiFactor(unitStr);
    for (const link of this.links) {
      if (!(link instanceof RealLink)) continue;
      // A body with no mass has no moment of inertia, full stop: the solver
      // applies I·α regardless of mass, so a leftover typed inertia on a
      // weightless bar would quietly steer every dynamic answer. Zeroing the
      // mass zeroes the inertia and hands the field back to the shape, which
      // is also what the panel shows (the field disables and reads 0).
      if (!(link.mass > 0) && (link.massMoI !== 0 || link.moiIsCustom)) {
        link.massMoI = 0;
        link.moiIsCustom = false;
      }
      if (link.comIsCustom) {
        // A placed point rides the link: re-derived from its stored offset
        // against the centroid, so drags, turns and deformations carry it.
        const placed = link.customCoMFromOffset();
        if (placed) {
          link.CoM = placed;
          link.updateCoMDs();
        } else {
          // Decoded from a URL that only carries the world coordinate:
          // capture the offset once, against today's geometry.
          link.captureComOffset();
        }
      }
      if (link.moiIsCustom && link.comIsCustom) continue;
      const derived = this.uniformBodyFor(link, factor);
      if (!link.comIsCustom) {
        link.CoM = new Coord(derived.com.x, derived.com.y);
        link.updateCoMDs();
      }
      if (!link.moiIsCustom) {
        link.massMoI = derived.moi;
      }
    }
  }

  /**
   * Converts mass × (model length)² into the stored inertia unit, exactly:
   * derived from the same siUnitFactors the force solver converts with, so
   * MoI = m·k² survives every unit system instead of being tuned to one.
   */
  private storedMoiFactor(unitStr: string): number {
    const units = siUnitFactors(unitStr);
    return (units.massToKg * units.distanceToM ** 2) / units.inertiaToKgM2 / MODEL_SCALE ** 2;
  }

  private currentUnitStr(): string {
    switch (this.settingsService.lengthUnit.value) {
      case LengthUnit.INCH:
        return 'in';
      case LengthUnit.METER:
        return 'm';
      default:
        return 'cm';
    }
  }

  /**
   * The uniform body a link derives its auto properties from.
   *
   * A plain link is a rod or a hull plate over its own joints. A compound is
   * the *sum of its parts* — each member as its own body, combined by the
   * parallel-axis theorem — never a plate over the whole hull: a V-shaped
   * weld is two bars, and a plate spanning the crook would weigh material
   * that is not there. Members somebody typed at contribute the numbers they
   * were given.
   */
  private uniformBodyFor(link: RealLink, factor: number): { com: Coord; moi: number } {
    if (link.subset.length === 0) {
      const body = uniformBodyOf(link.joints);
      return {
        com: new Coord(body.centroid.x, body.centroid.y),
        moi: link.mass * body.gyrationSq * factor,
      };
    }
    const parts = link.subset
      .filter((member): member is RealLink => member instanceof RealLink)
      .map((member) => {
        const own = this.uniformBodyFor(member, factor);
        return {
          mass: member.mass,
          com: member.comIsCustom ? new Coord(member.CoM.x, member.CoM.y) : own.com,
          moi: member.moiIsCustom ? member.massMoI : own.moi,
        };
      });
    const totalMass = parts.reduce((sum, part) => sum + part.mass, 0);
    const com =
      totalMass > 0
        ? new Coord(
            parts.reduce((sum, part) => sum + part.mass * part.com.x, 0) / totalMass,
            parts.reduce((sum, part) => sum + part.mass * part.com.y, 0) / totalMass
          )
        : new Coord(
            parts.reduce((sum, part) => sum + part.com.x, 0) / Math.max(1, parts.length),
            parts.reduce((sum, part) => sum + part.com.y, 0) / Math.max(1, parts.length)
          );
    const moi = parts.reduce(
      (sum, part) =>
        sum +
        part.moi +
        part.mass * ((part.com.x - com.x) ** 2 + (part.com.y - com.y) ** 2) * factor,
      0
    );
    return { com, moi };
  }

  forceAnalysisRequirements(): ForceRequirement[] {
    const requirements: ForceRequirement[] = [];

    const runnable = this.mechanisms.filter((mechanism) => mechanism.isMechanismValid());
    requirements.push({
      met: runnable.length > 0,
      title: 'A mechanism that runs',
      body:
        runnable.length > 0
          ? 'Force analysis is solved over a solved cycle, and there is one.'
          : 'Forces are solved at each position of a cycle, so the kinematics have to work first. Analysis setup lists what is missing.',
    });
    if (runnable.length === 0) {
      return requirements;
    }

    // Ask for the analysis the panel would show. It is memoised per mechanism,
    // so this costs nothing after the first time.
    const refused = runnable
      .map((mechanism) => ({ mechanism, series: mechanism.getForceAnalysis('static') }))
      .filter(({ series }) => series.successfulFrames === 0);
    requirements.push({
      met: refused.length === 0,
      title: 'A topology the solver can balance',
      body:
        refused.length === 0
          ? 'Every body has an equilibrium the solver can write down.'
          : (refused[0].series.diagnostic ??
            'One of these mechanisms has no determinate force-equilibrium model.'),
    });

    // Only the links of machines that could actually be analysed. A massless
    // bar in some unrelated -- or unassigned -- corner of the drawing used to
    // block force analysis for a perfectly good mechanism.
    const analysable = new Set(
      this.partitions
        .filter((_, index) => this.mechanisms[index]?.isMechanismValid())
        .flatMap((partition) => partition.links.map((link) => link.id))
    );
    // Something has to load the linkage, but weight counts: with gravity on,
    // a link with mass hangs from it, and that is a complete static problem.
    // Demanding a drawn arrow on top of that refused analyses that meant
    // something.
    const loads = this.forces.filter((force) => analysable.has(force.link?.id));
    // Any body's mass, not only a RealLink's: the solver hangs a slider block's
    // weight from gravity too, so a drawing whose only massive body is a block
    // is genuinely loaded. (The massless *warning* below stays about links --
    // every block starts massless and naming them all would be noise.)
    const weighted = this.links.some(
      (link) =>
        (link instanceof RealLink || link instanceof SliderBlock) &&
        analysable.has(link.id) &&
        link.mass > 0
    );
    const gravityLoads = this.settingsService.isGravity.value && weighted;
    const loaded = loads.length > 0 || gravityLoads;

    // A massless link is a legitimate idealization -- the solver simply skips
    // its weight and inertia -- so this is a warning, not a gate. It is worth
    // one, because zero is the mass nobody chose: every link starts there.
    // Only once something loads the mechanism, though: the unloaded blocker
    // below already says every link is massless, and saying it twice made the
    // list read longer than the problem is.
    if (loaded) {
      const massless = this.links.filter(
        (link) => link instanceof RealLink && analysable.has(link.id) && !(link.mass > 0)
      ) as RealLink[];
      requirements.push({
        met: massless.length === 0,
        warning: true,
        title: 'Massless links',
        body:
          massless.length === 0
            ? 'Every link has a mass and a moment of inertia.'
            : `${massless
                .map((link) => this.bodyLabel(link))
                .join(
                  ', '
                )} ${massless.length === 1 ? 'weighs' : 'weigh'} nothing, so gravity and inertia pass ${massless.length === 1 ? 'it' : 'them'} by. Fine for an idealized bar — type a mass in the table below to include ${massless.length === 1 ? 'it' : 'them'}.`,
      });
    }

    // Gravity off over a drawing that does have mass is the one refusal here
    // with a one-click way out, so it gets a button as well as a sentence:
    // everything the analysis needs is already drawn, and the only thing
    // standing in the way is a switch in another panel.
    const gravityWouldLoad = !this.settingsService.isGravity.value && weighted;
    requirements.push({
      met: loads.length > 0 || gravityLoads,
      title: 'A load to react against',
      act: gravityWouldLoad ? 'gravity' : undefined,
      body:
        loads.length > 0
          ? `${loads.length} ${loads.length === 1 ? 'force is' : 'forces are'} applied.`
          : gravityLoads
            ? 'Gravity loads the links that have mass.'
            : gravityWouldLoad
              ? 'Nothing loads this mechanism: gravity is off, so the mass it has weighs nothing. Turn gravity on, or attach a force.'
              : this.settingsService.isGravity.value
                ? 'Nothing loads this mechanism yet: no force is applied and every link is massless. Attach a force or give a link mass.'
                : 'Nothing loads this mechanism: gravity is off and no force is applied. Attach a force, or turn gravity on in Settings and give a link mass.',
    });

    return requirements;
  }

  /** Can the Force tab show anything worth reading? */
  forceAnalysisReady(): boolean {
    return this.forceAnalysisRequirements().every(
      (requirement) => requirement.met || requirement.warning === true
    );
  }

  /** What to say about geometry that is in no mechanism. */
  unassignedReports(): UnassignedReport[] {
    return describeUnassigned(this.unassigned);
  }

  /** How many blockers stand between this drawing and a full set of animations. */
  /**
   * How many things stand between the drawing and being analysed.
   *
   * Geometry that is in no mechanism counts. Without it a drawing of two
   * joints and a bar -- which is in no mechanism, has no input and cannot be
   * analysed at all -- reported nothing to fix, because there was no mechanism
   * for anything to be wrong with, and the chip read "Ready".
   */
  blockerCount(): number {
    const inMechanisms = this.readinessOfEachMechanism().reduce(
      (total, readiness) =>
        total + readiness.checks.filter((check) => check.state === 'blocker').length,
      0
    );
    return inMechanisms + this.unassignedReports().length;
  }

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
    // Nothing in the drawing runs, so the mobility worth reporting is the first
    // one that is wrong -- not whichever mechanism happened to be built first.
    const dof = (this.mechanisms.find((m) => !m.isMechanismValid()) ?? this.mechanisms[0])?.dof;
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
    return this.strokeWarningFor();
  }

  /**
   * The first cylinder in `only` -- or in the whole drawing -- that the linkage
   * stops before the barrel does.
   */
  private strokeWarningFor(only?: MechanismPartition): string | undefined {
    for (const cylinder of this.sealedStructures()) {
      if (only && !only.joints.some((joint) => joint.id === cylinder.pin.id)) {
        continue;
      }
      // Each ram is measured against the frames of its own machine. Read from
      // another mechanism's cycle -- a different length, a different motion --
      // the travel below is a measurement of the wrong thing entirely.
      const solved = this.mechanismContaining(cylinder.pin);
      if (!solved?.isMechanismValid()) continue;
      const frames = solved.joints.length;
      if (frames < 2) continue;

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

  /**
   * The one reaction a slider's block has that its pin does not.
   *
   * A block is a zero-length link binding a pin to a slot. It meets the world
   * twice: at the pin, where the force is exactly the pin's own reaction
   * negated -- the same number already carried under the name of the bar it
   * holds -- and at the slot, where it presses on whatever the slot is cut
   * into. The second is the force that sizes a slide, and it is here or
   * nowhere: a slot has no marker, no hitbox and no panel.
   */
  slotReactionOf(pin: Joint | undefined): { slot: PrisJoint; block: Link; on: string } | undefined {
    const slot = this.sliderFor(pin);
    if (!slot) return undefined;
    const block = this.links.find(
      (link) => link instanceof SliderBlock && link.joints.some((joint) => joint.id === slot.id)
    );
    if (!block) return undefined;
    const carrier = slot.isFloating && slot.isSlotWellFormed ? slot.carrier : undefined;
    return { slot, block, on: carrier ? this.bodyLabel(carrier) : 'the ground' };
  }

  /**
   * What to call a reaction that acts at a slot.
   *
   * The slider it belongs to, because that is the pin a reader can point at: a
   * slot has no name anyone has ever been shown.
   */
  slotName(jointId: string): string | undefined {
    const slot = this.joints.find((joint) => joint.id === jointId);
    if (!(slot instanceof PrisJoint)) return undefined;
    const pin = slot.connectedJoints.find((joint) => !(joint instanceof PrisJoint)) as
      RealJoint | undefined;
    return pin ? `the slider at ${pin.name || pin.id}` : 'the slider';
  }

  /** The sealed cylinder a joint or link belongs to, if any. */
  cylinderAt(obj: Joint | Link | undefined): Cylinder | undefined {
    if (obj instanceof Joint) return cylinderOfJointIn(this.sealedStructures(), obj);
    if (obj instanceof Link) return cylinderOfLinkIn(this.sealedStructures(), obj);
    return undefined;
  }

  /**
   * What the panels call a body: a cylinder part by its role in the machine,
   * a block by the joint it rides on, an ordinary bar by its name — never the
   * internal concatenated id, which names joints a reader cannot even click.
   *
   * Always a complete noun phrase, so a caller can drop it into a sentence
   * without having to know which kind of body came back.
   */
  bodyLabel(body: Link): string {
    return labelForBody(body, this.cylinderAt(body));
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
      this.notify.refusal(
        'cylinder.welded-mount',
        'This joint is welded, so a cylinder mounted on it would be a third body inside one rigid one. Unweld it, or attach the cylinder to the link instead.'
      );
      return;
    }
    const creation = cylinderCreationLayout(start, end, this.settingsService.objectScale);

    // A ram is five joints and shows two of them. The mounts are what the
    // reader points at, names and reads back out of a panel, so they take
    // letters; the barrel's near end, the pin and the slider are inside the
    // part and are never drawn, labelled or listed. Spending a letter on each
    // of those ran a drawing through the alphabet three times faster than the
    // joints anyone could see, and it was the hidden ones that pushed the
    // visible ones into punctuation.
    const aId = mountAt ? mountAt.id : this.determineNextLetter();
    const dId = this.determineNextLetter([aId]);
    const insideNames = this.determineInteriorNames(aId, 3);
    const [bId, cId, pId] = insideNames;

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
      // One input per mechanism, same as adjustInput.
      this.clearInputsSharingMechanismWith(sealed.slider);
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
        // Silently: this is unreachable from either surface. Both the menu item
        // and the panel's button are disabled on `canToggleInput`, which is
        // `input || canDrive` -- and `canDrive` is exactly "describeActuator
        // did not refuse", asked of this same joint. Checked across all 25
        // templates: 147 presses of every enabled control, no refusal. Kept as
        // a guard so a third caller cannot drive what the model will not.
        return;
      }
      // One input per mechanism, so the joint taking the job displaces the old
      // one -- in its own machine only.
      this.clearInputsSharingMechanismWith(jointToToggleInput);
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
      this.notify.refusal(
        'cylinder.sealed-slider',
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
      const connectedJoints: Joint[] = [this.activeObjService.selectedJoint];
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

  /**
   * Sample times (seconds) of the mechanism the shared clock follows, empty
   * when nothing is solved.
   *
   * Every machine runs on the same wall clock, so the scrubber has to span the
   * longest cycle in the drawing; a shorter one wraps inside it. Measuring the
   * timeline against whichever mechanism happened to be built first would cut
   * playback off partway through the slowest one.
   */
  private sampleTimes(): number[] {
    return this.masterMechanism()?.timeNum ?? [];
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

  /** Seconds spanned by one full traversal of the longest motion in the drawing. */
  cyclePeriod(): number {
    return this.masterMechanism()?.cyclePeriod ?? 0;
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
    return this.isPlaying ? this.playbackTimeSeconds : this.timeAtStep(this.mechanismTimeStep);
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
    const sampleCount = this.masterMechanism()?.joints.length ?? 0;
    progress = Math.min(Math.max(progress, 0), Math.max(sampleCount - 1, 0));

    // Set the step *and the running flag* before announcing it: subscribers
    // read the drawn time back off the service, so both have to be current by
    // the time they are notified.
    //
    // The flag used to be applied twenty lines further down, which meant a
    // caller stopping playback -- leaving an analysis mode does exactly that,
    // with animate(0, false) -- notified its subscribers while the service
    // still believed it was playing. currentTimeSeconds() then answered with
    // the playback clock instead of the time of sample zero, and the readout
    // kept showing the time the mechanism had been left at while the mechanism
    // itself had rewound.
    this.mechanismTimeStep = progress;
    // The pose applier reads each machine's own clock now, so a seek has to put
    // those clocks where the caller asked. A seek through here means the whole
    // drawing -- a rewind, a URL restore, the shared scrubber -- so every
    // machine goes. The playback loop has already moved them and says so; so
    // does a row being scrubbed on its own.
    if (!this.advancingPlayback && !this.seekingOneMechanism) {
      this.seekAllTo(this.timeAtStep(progress));
    }
    if (animationState !== undefined) {
      this.isPlaying = animationState;
      if (!animationState) {
        this.playbackTimeSeconds = this.timeAtStep(progress);
      }
    }
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
    if (sampleCount === 0 || this.masterMechanism()!.joints[progress].length === 0) {
      this.playbackClockMs = null;
      return;
    }

    this.applyPose();

    if (!this.isPlaying) {
      this.playbackClockMs = null;
      return;
    }
    // Anything other than the playback loop itself (a scrubber, a URL restore)
    // is a seek of the whole drawing: re-anchor the clock to the sample the
    // caller asked for.
    //
    // Except a seek of one machine, which must leave the frame clock alone.
    // Clearing it says "the next frame has no previous frame to measure from",
    // so a drag -- which seeks sixty times a second -- measured zero elapsed
    // every frame and every other machine stood still for as long as the drag
    // lasted.
    if (!this.advancingPlayback && !this.seekingOneMechanism) {
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
  private applyPose() {
    // This is the one place a solved sample becomes the drawn pose, so it is
    // where anything cached against the pose has to be let go of.
    this.poseRevision++;

    // Each machine finds its own clock's time among its own samples, so a
    // mechanism with a shorter cycle wraps inside the master one rather than
    // running out (applyMechanismPose interpolates between samples by time).
    this.mechanisms.forEach((frames, index) => {
      this.applyMechanismPose(frames, this.partitions[index], this.ownSeconds[index] ?? 0);
    });
  }

  /**
   * Draw one machine's solved sample onto its own editable objects.
   *
   * Matched by id rather than by position. The editable arrays hold the whole
   * drawing while a Mechanism holds only its own component, so the two are no
   * longer the same list in the same order -- and pairing them positionally
   * would quietly move one mechanism's joint to another's coordinates.
   */
  /**
   * The sample one machine is showing right now, in its own sample array.
   *
   * Not `mechanismTimeStep`: that indexes the shared clock's cycle, and while
   * the machines are unsynced each of them is somewhere else. Anything asking
   * "what does this quantity read at the pose on screen" has to ask the
   * machine that quantity belongs to.
   */
  currentSampleOf(index: number): number {
    const frames = this.mechanisms[index];
    const times = frames?.timeNum ?? [];
    if (!frames || times.length === 0) return 0;
    const period = frames.cyclePeriod;
    let local = this.secondsOf(index);
    if (period > 0 && Number.isFinite(local) && local !== period) {
      // Exactly the period is the last sample, not a wrap back to the first.
      local = ((local % period) + period) % period;
    }
    let step = 0;
    while (step + 1 < times.length && times[step + 1] <= local) step++;
    return step;
  }

  private applyMechanismPose(frames: Mechanism, partition: MechanismPartition, seconds: number) {
    const times = frames.timeNum ?? [];
    if (!frames.isMechanismValid() || times.length === 0) {
      return;
    }
    const period = frames.cyclePeriod;
    let local = seconds;
    if (period > 0 && Number.isFinite(seconds)) {
      local = seconds % period;
      if (local < 0) local += period;
    }
    let step = 0;
    while (step + 1 < times.length && times[step + 1] <= local) step++;
    const nextStep = Math.min(step + 1, times.length - 1);
    const span = times[nextStep] - times[step];
    const blend = span > 0 ? Math.min(Math.max((local - times[step]) / span, 0), 1) : 0;

    const jointFrom = frames.joints[step];
    const jointTo = frames.joints[nextStep];
    partition.joints.forEach((j) => {
      const from = jointFrom.find((candidate) => candidate.id === j.id);
      const to = jointTo.find((candidate) => candidate.id === j.id);
      if (!from || !to) {
        return;
      }
      j.x = from.x + (to.x - from.x) * blend;
      j.y = from.y + (to.y - from.y) * blend;
    });
    partition.links.forEach((l) => {
      if (!(l instanceof RealLink)) {
        return;
      }
      const link = frames.links[step].find((candidate) => candidate.id === l.id);
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
    partition.forces.forEach((f) => {
      const from = frames.forces[step].find((candidate) => candidate.id === f.id);
      const to = frames.forces[nextStep].find((candidate) => candidate.id === f.id);
      if (!from || !to) {
        return;
      }
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
    if (this.atStartPose() || !this.masterMechanism()?.joints[0]?.length) {
      return;
    }
    // Every machine at *its own* time zero, bypassing the clocks entirely.
    // Going through applyPose would have honoured the private clocks while
    // unsynced and left each mechanism wherever its own scrubber was -- and
    // since this runs immediately before a rebuild deep-copies the editable
    // joints as t = 0, that silently redefines the start pose as wherever
    // playback happened to be. The pose then ratchets forward on every edit.
    this.poseRevision++;
    this.mechanisms.forEach((frames, index) => {
      this.applyMechanismPose(frames, this.partitions[index], 0);
    });
  }

  /**
   * Are the editable objects holding the pose a rebuild may treat as t = 0?
   *
   * Every clock has to be at zero, not just the shared one: while unsynced a
   * row can be scrubbed away from the start with the shared step still reading
   * zero, and that combination used to answer yes.
   */
  private atStartPose(): boolean {
    if (this.isPlaying) {
      return false;
    }
    if (!this.syncMechanisms && this.ownSeconds.some((seconds) => seconds !== 0)) {
      return false;
    }
    return this.mechanismTimeStep === 0;
  }

  /** The same question, for a control that has to say when it would do nothing. */
  isAtStartPose(): boolean {
    return this.atStartPose();
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
   * Draw the way back to the start of the cycle rather than cutting to it.
   *
   * Leaving an analysis mode rewinds the mechanism, and doing that in one frame
   * teleports a linkage the user was just watching move -- the pose they had
   * paused on is replaced by a different one with nothing in between, which
   * reads as the drawing breaking rather than as playback ending.
   *
   * This is a seek per frame, not playback: it never runs the solver and it
   * lands on exactly the same pose the cut landed on. If anything else moves
   * the mechanism while it is running -- another seek, a rebuild, playback
   * starting again -- it stops where it is and leaves that caller alone.
   */
  easeToStart(durationMs = 220): void {
    if (this.atStartPose()) return;
    // Each machine goes back to its own start, on its own clock, by whichever
    // way round is shorter for it. Driving this off the shared sample index
    // pulled every machine onto the master's time on the first frame -- so
    // three machines at three different places in their cycles all jumped to
    // one place and then eased down together, which is the bounce.
    const from = this.mechanisms.map((_, index) => this.secondsOf(index));
    const periods = this.mechanisms.map((mechanism) => mechanism.cyclePeriod);
    const deltas = from.map((seconds, index) => {
      const period = periods[index];
      if (!(period > 0) || !(seconds > 0)) return 0;
      return seconds > period / 2 ? period - seconds : -seconds;
    });
    if (deltas.every((delta) => delta === 0)) {
      this.rewindToStart();
      return;
    }

    this.isPlaying = false;
    this.ownPlaying = this.ownPlaying.map(() => false);
    let startedAt: number | null = null;
    let lastDrawn = from.slice();

    const frame = (now: number) => {
      // Someone else has taken a machine somewhere since the last frame.
      // Whatever they wanted, it is newer than this.
      if (this.mechanisms.some((_, index) => this.secondsOf(index) !== lastDrawn[index])) {
        return;
      }
      startedAt ??= now;
      const t = Math.min(1, (now - startedAt) / durationMs);
      // Ease out: quick off the pose being left, gentle into the start.
      const eased = 1 - (1 - t) ** 3;
      const next = from.map((seconds, index) => {
        const period = periods[index];
        const ahead = seconds + eased * deltas[index];
        return period > 0 ? ((ahead % period) + period) % period : ahead;
      });
      // The first frame is the pose already on screen; drawing it again is a
      // frame's worth of nothing. A microsecond, not exact equality: wrapping
      // into the period puts float noise on a value that has not moved.
      if (next.some((seconds, index) => Math.abs(seconds - lastDrawn[index]) > 1e-6)) {
        lastDrawn = next;
        lastDrawn.forEach((seconds, index) => (this.ownSeconds[index] = seconds));
        this.drawOwnClocks();
      }
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * Draw every machine where its own clock says, without moving any of them.
   *
   * `animate` treats an outside call as a seek of the whole drawing, which is
   * right for a scrubber and wrong for anything that has already decided where
   * each machine goes.
   */
  private drawOwnClocks(playing = false): void {
    const master = this.masterMechanismIndex();
    const step =
      master === -1 ? this.mechanismTimeStep : this.stepAtTime(this.ownSeconds[master] ?? 0);
    this.seekingOneMechanism = true;
    try {
      this.animate(step, playing);
    } finally {
      this.seekingOneMechanism = false;
    }
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
    if (!this.isPlaying) {
      this.playbackClockMs = null;
      return;
    }
    const now = performance.now();
    // The first frame after a seek or a resume has no previous frame to measure from.
    const elapsedSeconds = this.playbackClockMs === null ? 0 : (now - this.playbackClockMs) / 1000;
    this.playbackClockMs = now;
    this.playbackTimeSeconds = this.wrapTime(
      this.playbackTimeSeconds +
        elapsedSeconds * this.animationSpeedMultiplier * this.directionOf(0)
    );

    // Every running machine carries its own time forward, off the same wall
    // clock. Synced means they are started and stopped together, not that they
    // share a variable -- two machines at different speeds have no shared
    // position to share.
    this.mechanisms.forEach((mechanism, index) => {
      if (!this.isMechanismPlaying(index) || !mechanism.isMechanismValid()) {
        return;
      }
      const period = mechanism.cyclePeriod;
      const next =
        (this.ownSeconds[index] ?? 0) +
        elapsedSeconds * this.animationSpeedMultiplier * this.directionOf(index);
      this.ownSeconds[index] = period > 0 ? ((next % period) + period) % period : next;
    });

    // The shared readout follows the master machine, which is the one the
    // sample index and the graphs have always meant.
    const master = this.masterMechanismIndex();
    if (master !== -1) {
      this.playbackTimeSeconds = this.ownSeconds[master] ?? this.playbackTimeSeconds;
    }

    this.advancingPlayback = true;
    try {
      // Blend forward from the sample at or before now, not the nearest one.
      this.animate(this.stepAtOrBeforeTime(this.playbackTimeSeconds));
    } finally {
      this.advancingPlayback = false;
    }
  }

  /**
   * Turn one machine's drive round without moving it, and without moving the
   * cycle under the reader.
   *
   * Nothing about the loop of poses changes: the machine walks the same loop
   * the other way. So the frames stay exactly where they are, the pose on
   * screen stays exactly where it is, the clock is not touched -- and the only
   * things that change are the sign of the drive, the way the playhead
   * travels, and the sign of every rate derived from it.
   *
   * That is the whole reason this does not re-solve or mirror. Either of those
   * puts every pose at a different time, so the curve a reader was following
   * slides end for end and the peak they were reading jumps across the chart,
   * for a machine that has not moved at all.
   */
  reverseDrive(index: number): boolean {
    const driven = this.partitions[index]?.joints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
    if (!driven) return false;

    // Write every machine's current speed onto its own drive first. Setting one
    // machine's speed also moves the document-wide default, and a machine that
    // has never been given a speed of its own reads that default -- so
    // reversing one machine turned round every machine that had not been
    // turned round before.
    this.pinDriveSpeeds();
    this.setDriveSpeed(driven, -this.driveSpeedOf(driven));

    // Not saved. Reversing is done from the transport, which is a way of
    // watching the drawing rather than of changing it, and nothing else a
    // reader does in an analysis mode lands in the undo history. The drive
    // still carries its new sign, so the next real edit writes it out.
    const reversed = this.mechanisms[index]?.withReversedDrive();
    if (reversed) {
      this.mechanisms[index] = reversed;
      // A solved cycle has been replaced without going through
      // `updateMechanism`, so say so. The graphs notice by object identity,
      // but the export's sampled tables are cached against this counter --
      // without the bump an export taken after reversing served the rates it
      // had sampled before, every angular velocity still carrying the sign it
      // had turned round from.
      this.solveRevision++;
      // Through the cycle the other way, from where it stands.
      this.playbackDirection[index] = this.directionOf(index) < 0 ? 1 : -1;
    } else {
      this.updateMechanism(false);
    }

    // Every rate on screen has just turned round, and a graph only redraws when
    // it is told. Geometry is locked in the analysis modes, so this is the one
    // thing a reader can do there that changes what the graphs say.
    this.onMechUpdateState.next(2);
    return true;
  }

  /**
   * Where one machine's input sits, out of everything it can do, 0..1.
   *
   * The transport's own coordinate. Cached against the solved Mechanism, so it
   * is rebuilt exactly when the cycle is.
   */
  travelOf(index: number): number | undefined {
    const mechanism = this.mechanisms[index];
    const profile = this.driveProfileOf(index);
    if (!mechanism || !profile) return undefined;
    const period = mechanism.cyclePeriod;
    const last = profile.along.length - 1;
    if (!(period > 0) || last <= 0) return profile.along[0] ?? 0;
    const fraction = Math.min(Math.max(this.secondsOf(index) / period, 0), 1);
    return profile.along[Math.min(Math.round(fraction * last), last)];
  }

  /**
   * Put every machine at one moment of the longest cycle in the drawing.
   *
   * The combined handle measures *time*, where a single machine's own handle
   * measures how far along its input has come. That is the right thing for one
   * machine -- degrees of crank, centimetres of ram -- but there is no such
   * thing as the input position of three machines at once, and the leader's own
   * is worse than useless when the leader rocks: a rocking input passes through
   * the same position twice per cycle, so "where the handle is" answered with
   * two different times and a drag across it ran the whole drawing backwards.
   * Dragged from end to end it jumped back thirty times in two hundred steps.
   *
   * Time has one answer everywhere, always increases with the handle, and is
   * what the machines are actually sharing while they are synced.
   */
  seekAllAlong(leader: number, along: number): void {
    const period = this.mechanisms[leader]?.cyclePeriod;
    if (!(period > 0)) return;
    this.seekAllTo(Math.min(Math.max(along, 0), 1) * period);
    this.drawOwnClocks(this.isPlaying);
  }

  /**
   * Is this machine's input going the way its drive speed says, right now?
   *
   * Read off the profile's own slope rather than off the half-way point of the
   * cycle: a ram does not turn around half way through its period, it turns
   * around when it reaches the end of its stroke, and those are not the same
   * moment. Playback running backwards flips the answer again.
   */
  travellingForward(index: number): boolean {
    const profile = this.driveProfileOf(index);
    const mechanism = this.mechanisms[index];
    const forwardDrive = (mechanism?.inputAngularVelocities[0] ?? 0) < 0;
    // Which way playback runs *through the frames*, which is not the same as
    // which way it runs through the cycle once the drive has been turned round:
    // reversing walks the frames backwards precisely so the machine goes
    // forwards along its new direction, and counting both flips cancelled them.
    const rewinding = this.directionOf(index) < 0 !== (mechanism?.framesRunBackwards ?? false);
    if (!profile || !mechanism || profile.continuous) {
      return forwardDrive !== rewinding;
    }
    const period = mechanism.cyclePeriod;
    const last = profile.along.length - 1;
    if (!(period > 0) || last <= 0) return forwardDrive !== rewinding;
    const sample = Math.min(
      Math.round(Math.min(Math.max(this.secondsOf(index) / period, 0), 1) * last),
      last
    );
    const before = profile.along[Math.max(sample - 1, 0)];
    const after = profile.along[Math.min(sample + 1, last)];
    const rising = after >= before;
    return rising !== rewinding;
  }

  /**
   * Give every machine a drive speed of its own.
   *
   * Until one is set, a driven joint reads the document-wide default, which
   * means two machines share a number and neither of them knows it.
   */
  private pinDriveSpeeds(): void {
    this.partitions.forEach((partition) => {
      const driven = partition.ownJoints.find(
        (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
      );
      if (driven && driven.driveSpeed === 0) {
        driven.driveSpeed = this.driveSpeedOf(driven);
      }
    });
  }

  /**
   * Which way the input crank is pointing, in degrees from the positive x axis.
   *
   * An absolute bearing, not a count of how far round it has come: a reader
   * comparing the drawing with the readout is looking at where the crank is
   * pointing, and "0" meaning "wherever it was drawn" is a different question
   * they did not ask.
   *
   * Except on a cycle of several turns — a branch-swapping slide closes after
   * two — where the bearing repeats every turn and cannot say which one the
   * machine is on. There the readout is progress round the whole cycle,
   * 0 to 720.
   */
  inputAngleDegrees(index: number): number | undefined {
    const partition = this.partitions[index];
    const driven = partition?.ownJoints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
    if (!driven) return undefined;
    // The end of the crank, which is what points somewhere -- the input joint
    // itself is usually pinned to the frame and points nowhere.
    const end = driven.connectedJoints.find((joint) => !(joint as RealJoint).ground);
    if (!end) return undefined;
    const samples = this.mechanisms[index]?.joints.length ?? 0;
    const turns = samples > 1 ? Math.round((samples - 1) / 360) : 1;
    const profile = this.driveProfileOf(index);
    if (turns > 1 && profile?.continuous && !profile.linear) {
      return (this.currentSampleOf(index) * (turns * 360)) / (samples - 1);
    }
    const degrees = (Math.atan2(end.y - driven.y, end.x - driven.x) * 180) / Math.PI;
    return (degrees + 360) % 360;
  }

  /** Put one machine at a place along its input's travel. */
  seekMechanismTo(index: number, along: number): void {
    const mechanism = this.mechanisms[index];
    const profile = this.driveProfileOf(index);
    if (!mechanism || !profile) return;
    const period = mechanism.cyclePeriod;
    const last = profile.along.length - 1;
    if (!(period > 0) || last <= 0) return;
    const nearSample = Math.round(Math.min(Math.max(this.secondsOf(index) / period, 0), 1) * last);
    const sample = fractionalSampleAlong(profile, Math.min(Math.max(along, 0), 1), nearSample);
    this.seekMechanism(index, (sample / last) * period);
  }

  driveProfileOf(index: number): DriveProfile | undefined {
    const mechanism = this.mechanisms[index];
    if (!mechanism) return undefined;
    if (!this.profiles.has(mechanism)) {
      // A ram is measured by its own extension, so the profile is told which
      // two joints that is between.
      const driven = mechanism.joints[0]?.find((joint) => (joint as RealJoint).input);
      const sealed = driven && this.cylinderAt(this.joints.find((j) => j.id === driven.id));
      const ram = sealed ? { from: sealed.barrelFar.id, to: sealed.rodFar.id } : undefined;
      this.profiles.set(mechanism, buildDriveProfile(mechanism, ram) ?? null);
    }
    return this.profiles.get(mechanism) ?? undefined;
  }

  private profiles = new WeakMap<Mechanism, DriveProfile | null>();

  /** Which way this machine's playback is running: +1 forward, -1 backward. */
  directionOf(index: number): number {
    return this.playbackDirection[index] === -1 ? -1 : 1;
  }

  /**
   * Turn a reversing machine's playback round without moving it.
   *
   * It keeps its place in the cycle and keeps running; only the way it is
   * headed changes.
   */
  setPlaybackDirection(index: number, direction: number): void {
    this.playbackDirection[index] = direction < 0 ? -1 : 1;
    // The clock measures from the last frame, and this frame is not late.
    this.playbackClockMs = null;
  }

  /** Where one machine is in its own cycle. */
  secondsOf(index: number): number {
    return this.ownSeconds[index] ?? 0;
  }

  /** Put one machine at a place in its own cycle, and leave the others alone. */
  seekMechanism(index: number, seconds: number): void {
    const period = this.mechanisms[index]?.cyclePeriod ?? 0;
    // Exactly the period is the end of the cycle, not the start: dragging the
    // handle to the track's right edge should read 24.00 s, not 0.00 s.
    const local =
      period > 0 ? (seconds === period ? period : ((seconds % period) + period) % period) : seconds;
    this.ownSeconds[index] = local;
    // The sample index is the master machine's, and half the app reads it --
    // the graphs, the URL, and the rule that says the editor is only open at
    // the start pose. Moving the master without it left the drawing mid-cycle
    // while everything else believed it was parked.
    const step =
      index === this.masterMechanismIndex() ? this.stepAtTime(local) : this.mechanismTimeStep;
    this.seekingOneMechanism = true;
    try {
      this.animate(step, this.isPlaying);
    } finally {
      this.seekingOneMechanism = false;
    }
  }

  /**
   * Put every machine at the same moment of the shared clock.
   *
   * Each in its own cycle: a machine whose cycle is shorter than the one the
   * sample index is measured in wraps inside it rather than running out.
   */
  private seekAllTo(seconds: number): void {
    this.mechanisms.forEach((mechanism, index) => {
      if (!mechanism.isMechanismValid()) return;
      const period = mechanism.cyclePeriod;
      this.ownSeconds[index] = period > 0 ? ((seconds % period) + period) % period : seconds;
    });
  }

  /**
   * Is this machine running?
   *
   * Synced, one flag answers for all of them -- that is what synced means. Set
   * them apart and each row answers for itself, and stopping one of them says
   * nothing about the rest.
   */
  isMechanismPlaying(index: number): boolean {
    if (this.syncMechanisms) {
      return this.isPlaying && (this.mechanisms[index]?.isMechanismValid() ?? false);
    }
    return !!this.ownPlaying[index];
  }

  toggleMechanismPlaying(index: number): void {
    this.ownPlaying[index] = !this.isMechanismPlaying(index);
    // The frame loop is shared, so it has to be running for any machine to move
    // -- and there is no reason for it to be running when none of them are. The
    // transport's own button reads this flag, so leaving it set with every row
    // stopped showed a pause button over a drawing that was not moving.
    this.isPlaying = this.ownPlaying.some(Boolean);
    this.drawOwnClocks(this.isPlaying);
  }

  /**
   * Start or stop everything at once, from the transport's own button.
   *
   * Unsynced, the rows are what actually run, so the master has to move them
   * rather than a flag they do not read.
   */
  setAllPlaying(playing: boolean): void {
    this.isPlaying = playing;
    this.ownPlaying = this.mechanisms.map((mechanism) => playing && mechanism.isMechanismValid());
    this.drawOwnClocks(playing);
  }

  /**
   * Switch between one clock and several.
   *
   * Leaving sync hands every machine the time it is showing right now, so
   * nothing jumps at the moment the toggle is pressed; returning to sync puts
   * them all back on the shared clock, which is where they visibly converge.
   */
  setSyncMechanisms(sync: boolean): void {
    if (sync === this.syncMechanisms) {
      return;
    }
    this.syncMechanisms = sync;
    // Coming back to one row means one answer about what is running, so the
    // machines are put back in step with each other -- not with a shared
    // variable, which no longer exists, but with each other's play state.
    if (sync) {
      this.ownPlaying = this.mechanisms.map(
        (mechanism) => this.isPlaying && mechanism.isMechanismValid()
      );
      // And back onto one clock. Synced means one row and one handle, and a
      // handle standing for machines that are at four different times can only
      // lie about three of them -- which is what made it jump when dragged
      // after a spell apart.
      this.seekAllTo(this.ownSeconds[this.masterMechanismIndex()] ?? 0);
    }
    this.drawOwnClocks(this.isPlaying);
  }

  /**
   * Whether lock styling paints right now. A lock is an editing affordance,
   * so the mark shows only where it means something: the Edit tab, standing
   * still. Analysis reads clean, and a locked coupler mid-animation does not
   * look pinned while visibly moving.
   */
  lockVisualsOn(): boolean {
    return this.tabs.getCurrentTab() === TabID.EDIT && !this.isPlaying;
  }

  /** Painted as held: the joint itself, wherever its stillness comes from. */
  isJointLockedVisual(joint: Joint): boolean {
    return this.lockVisualsOn() && frozenJointIds(this.joints, this.links).has(joint.id);
  }

  /** Painted as held: a body whose whole pose is frozen, not one merely touched. */
  isLinkLockedVisual(link: Link): boolean {
    if (!this.lockVisualsOn()) return false;
    const frozen = frozenJointIds(this.joints, this.links);
    return link.joints.length > 0 && link.joints.every((joint) => frozen.has(joint.id));
  }

  getJointCSSClass(joint: Joint) {
    const lockSuffix = this.isJointLockedVisual(joint) ? ' joint-locked' : '';
    return this.jointStateClass(joint) + lockSuffix;
  }

  private jointStateClass(joint: Joint) {
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
    // Selecting a whole machine selects everything in it, so every one of its
    // joints reads as selected rather than the reader having to infer the
    // extent of the thing they just picked.
    if (this.isPartInert(joint)) {
      return 'joint-inert';
    }
    if (this.isInSelectedMechanism(joint)) {
      return 'joint-selected';
    }
    if (this.isHoveredPart(joint)) {
      return 'joint-pointed';
    }
    if (this.isInHoveredMechanism(joint)) {
      return 'joint-highlight';
    }
    if (joint.showHighlight) {
      return 'joint-highlight';
    } else {
      return 'joint-default';
    }
  }

  /**
   * Geometry the analysis modes have nothing to say about.
   *
   * A machine that cannot be simulated has no cycle, no graphs and no row in
   * the transport, so in an analysis mode it is scenery: drawn so the reader
   * can see it is still there, greyed so they can see it is not part of the
   * question, and not selectable, because every panel behind a selection is
   * about a machine that runs.
   */
  isPartInert(part: Joint | Link): boolean {
    return this.tabs.isAnalysisMode() && !this.isPartSimulatable(part);
  }

  /**
   * The tab service, held after the first ask.
   *
   * It is fetched through the injector to break a cycle, and `isPartInert` runs
   * once per joint and once per link on every change detection pass -- so the
   * lookup itself was on the redraw path.
   */
  private tabsService?: SelectedTabService;
  private get tabs(): SelectedTabService {
    return (this.tabsService ??= this.injector.get(SelectedTabService));
  }

  /** Is this part of the machine the reader has selected as a whole? */
  isPartInSelectedMechanism(part: Joint | Link): boolean {
    return this.isInSelectedMechanism(part);
  }

  /** Is this part of the machine the reader is pointing at? */
  isPartInHoveredMechanism(part: Joint | Link): boolean {
    return this.isInHoveredMechanism(part);
  }

  /** Is this part of the machine the reader has selected as a whole? */
  private isInSelectedMechanism(part: Joint | Link): boolean {
    if (this.activeObjService.objType !== 'Mechanism') {
      return false;
    }
    return this.isInPartition(part, this.activeObjService.selectedMechanismIndex);
  }

  /**
   * Which machine the reader is pointing at without having picked it yet.
   *
   * The transport names machines M1, M2, M3 and there is nothing in those
   * names to say which is which. Pointing at one lights it up on the canvas,
   * so the answer is available before committing to a selection.
   */
  hoveredMechanismIndex = -1;

  /**
   * The one part a list elsewhere is pointing at.
   *
   * The export drawer lists every joint and link by name, and a name is not a
   * place: a reader ticking `Joint F` on a Jansen leg has no idea which of
   * eleven pins that is. Pointing at the row lights it on the canvas.
   *
   * Deferred to whatever is selected: a selection is the stronger statement,
   * and a hover that repainted over it would take the reader's own mark away
   * while they were reading the list beside it.
   */
  hoveredPart: Joint | Link | undefined;

  private isHoveredPart(part: Joint | Link): boolean {
    return !!this.hoveredPart && this.hoveredPart.id === part.id && this.nothingIsChosen();
  }

  /**
   * Whether the canvas is free to answer a pointed-at row.
   *
   * The canvas carries one mark because it holds one selection, and a hover
   * that added a second while a joint, a link, a force or a whole machine was
   * already chosen made the drawing say two things at once.
   */
  private nothingIsChosen(): boolean {
    const chosen = this.activeObjService.objType;
    return chosen !== 'Joint' && chosen !== 'Link' && chosen !== 'Force' && chosen !== 'Mechanism';
  }

  /**
   * Whether the canvas's current selection is this joint.
   *
   * The selection *type* decides, not the remembered object: clicking the grid
   * sets the type to `Grid` and leaves `selectedJoint` holding whatever was
   * chosen before, so a list reading that field alone went on marking a row
   * after the reader had let go of the thing it names.
   */
  isSelectedJoint(joint: Joint | undefined): boolean {
    return (
      !!joint &&
      this.activeObjService.objType === 'Joint' &&
      this.activeObjService.selectedJoint?.id === joint.id
    );
  }

  /**
   * Whether the canvas's current selection is this body.
   *
   * A sealed cylinder answers for all of its pieces, as it does everywhere
   * else: the list offers the ram as one part, and clicking it on the canvas
   * lands on whichever of the barrel, the block or the rod the pointer was
   * over.
   */
  isSelectedBody(body: Link | undefined): boolean {
    if (!body || this.activeObjService.objType !== 'Link') return false;
    const chosen = this.activeObjService.selectedLink;
    if (!chosen) return false;
    if (chosen.id === body.id) return true;
    const cylinder = this.cylinderAt(chosen);
    return !!cylinder && cylinder === this.cylinderAt(body);
  }

  /**
   * Whether this body is the one a list is pointing at.
   *
   * A sealed cylinder answers for all of its pieces: the list offers the ram
   * as one part, and the canvas draws it as a barrel, a block and a rod under
   * one silhouette — so pointing at the row has to light that silhouette
   * whichever piece the mark happens to be built around.
   */
  isPointedAtBody(body: Link | undefined): boolean {
    const pointed = this.hoveredPart;
    if (!body || !pointed || pointed instanceof Joint || !this.nothingIsChosen()) return false;
    if (pointed.id === body.id) return true;
    const cylinder = this.cylinderAt(pointed);
    return !!cylinder && cylinder === this.cylinderAt(body);
  }

  private isInHoveredMechanism(part: Joint | Link): boolean {
    return this.hoveredMechanismIndex >= 0
      ? this.isInPartition(part, this.hoveredMechanismIndex)
      : false;
  }

  private isInPartition(part: Joint | Link, index: number): boolean {
    const partition = this.partitions[index];
    if (!partition) {
      return false;
    }
    return (
      partition.ownJoints.some((joint) => joint.id === part.id) ||
      partition.links.some((link) => link.id === part.id)
    );
  }

  getLinkCSSClass(link: Link) {
    const lockSuffix = this.isLinkLockedVisual(link) ? ' link-locked' : '';
    return this.linkStateClass(link) + lockSuffix;
  }

  private linkStateClass(link: Link) {
    if (this.isPartInert(link)) {
      return 'link-inert';
    }
    if (
      this.activeObjService.objType == 'Link' &&
      link.id === this.activeObjService.selectedLink.id
    ) {
      return 'link-selected';
    }
    if (this.isInSelectedMechanism(link)) {
      return 'link-selected';
    }
    if (this.isHoveredPart(link)) {
      return 'link-pointed';
    }
    if (this.isInHoveredMechanism(link)) {
      return 'link-hovered';
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
    if (this.jointsOnALink) return !this.jointsOnALink.has(joint);
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
      this.notify.warning(
        'weld.pinned-twice',
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
