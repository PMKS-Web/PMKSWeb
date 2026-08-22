import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { COR, SynthesisPose } from './synthesis-util';
import { Coord } from 'src/app/model/coord';
import { NumberUnitParserService } from '../number-unit-parser.service';
import { SettingsService } from '../settings.service';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { CandidateSearch, PosePoint } from './synthesis-candidates';

/*
Service responsible for storing end effector poses to be synthesized
into fourbars. Relevant to the Synthesis tab of the app.
*/

@Injectable({
  providedIn: 'root',
})
export class SynthesisBuilderService {
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);

  public valueChanges: Subject<boolean>;

  // whether the mechanism has been modified since last synthesis
  // if so, when switching back to edit mode, save state

  /**
   * Which screen of Synthesis the reader is on.
   *
   * 'chooser' asks what kind of synthesis this is; 'working' is the one kind
   * that exists. It is a screen rather than a setting because the answer
   * decides what every control below it means, and because the second kind --
   * fitting a linkage to a path -- is coming and has to have somewhere to go.
   */
  public stage: 'chooser' | 'working' = 'chooser';

  /**
   * Whether the next click on the grid drops a position.
   *
   * Placing is opt-in. Synthesis shares the canvas with the drawing, and a
   * mode where every click makes something is a mode where every click a
   * reader meant as "look at this" makes something instead.
   */
  public armed = false;

  /** Which way the position about to be dropped is turned, in degrees. */
  public placeAngleDeg = 8;

  /** Whether the grid is waiting for the ground-pivot region to be drawn. */
  public regionDraw = false;

  // --- what a solution has to satisfy to be listed ------------------------

  /**
   * Whether the coupler must be pinned to the end-effector link's own ends.
   *
   * On, the coupler is exactly the length that was typed. Off, the pins may
   * slide along the link or past it, which moves both ground pivots and gives
   * genuinely different machines through the same three positions -- far more
   * of them, and often better ones.
   */
  public endsOnly = true;

  /** Whether linkages that need reassembling between positions are listed. */
  public allowDefect = false;

  /** Whether both ground pivots must land inside the region below. */
  public constrain = false;

  /** The region, in model units, as a box with its origin at bottom-left. */
  /**
   * Which joints on the grid this design put there.
   *
   * Synthesis keeps hold of what it inserted so that the loop the mode is for
   * -- tweak a position, search again, insert -- revises one machine rather
   * than leaving a trail of them. By id, so it can never reach anything else
   * in a drawing that holds several.
   *
   * It rides in the URL with the rest of the design, for two reasons. Undo
   * steps the drawing back past an insert, and ownership has to step back with
   * it or the panel claims a machine that is no longer there. And a reload has
   * to come back holding what it held, or the next Insert quietly makes a
   * duplicate of the linkage already on the grid.
   */
  public ownedJointIds: string[] = [];

  /**
   * Whether some of what this design put on the grid has since gone.
   *
   * A missing owned joint is what tells `ownership` the linkage has been cut
   * into, and the ids alone stop being able to say so the moment they are
   * written down: a reload drops the ids of joints that are not there, and a
   * shortened list is indistinguishable from a smaller linkage. Worse, keeping
   * the missing ids instead would claim whatever new joint next takes that
   * letter. So the fact is carried on its own, and rides in the URL with the
   * rest of the design.
   */
  public ownershipPartial = false;

  /**
   * Where each of those joints was put, in the order the ids are held.
   *
   * The baseline for "has this been moved by hand", and it has to be written
   * down for the same reason the ids are. Kept in memory only, it vanished on
   * reload and every owned linkage read as untouched -- so a joint the reader
   * had dragged somewhere was quietly dragged back by the next Replace, and
   * the warning that exists to stop exactly that never appeared.
   */
  public ownedAt: { x: number; y: number }[] = [];

  public region = {
    x: -6 * MODEL_SCALE,
    y: -14 * MODEL_SCALE,
    w: 26 * MODEL_SCALE,
    h: 12 * MODEL_SCALE,
  };

  _COR: COR;
  _length: number; // length of the end-effector link
  /**
   * Which position row is selected, or 0 for none.
   *
   * Starts at none. A row highlighted before anything has been placed reads as
   * "this is where your first position went", which is exactly what it is not:
   * the first position does not exist until Add position has armed the canvas
   * and a click has dropped it.
   */
  _selectedPose: number;

  poses: { [key: number]: SynthesisPose }; // a dictionary of poses, but including each pose is optional

  constructor() {
    this.valueChanges = new Subject<boolean>();

    // start with a length of 5 user units, held in model units
    this._COR = COR.CENTER;
    this._length = 5 * MODEL_SCALE;
    this._selectedPose = 0;

    // start with no defined poses
    this.poses = {};
  }

  get COR(): COR {
    return this._COR;
  }

  get length(): number {
    return this._length;
  }

  set length(length: number) {
    this._length = length;
    for (let pose of this.getAllPoses()) {
      pose.recompute();
    }
  }

  get selectedPose(): number {
    return this._selectedPose;
  }

  set selectedPose(selectedPose: number) {
    this._selectedPose = selectedPose;
  }

  isPoseDefined(id: number): boolean {
    return this.poses[id] !== undefined;
  }

  // create a new pose. put it in some preset default position
  createPose(id: number): void {
    let defaultPosition = new Coord(0, 0);
    let defaultThetaRadians = 0;

    // create pose with a callback to always get current length
    this.poses[id] = new SynthesisPose(
      id,
      defaultPosition,
      defaultThetaRadians,
      () => this.COR,
      () => this.length
    );
    this.valueChanges.next(true);
  }

  getPose(id: number): SynthesisPose {
    if (!this.isPoseDefined(id)) {
      throw new Error(`Pose ${id} is not defined`);
    }

    return this.poses[id]!;
  }

  // whether all poses are defined to be synthesized
  isFullyDefined(): boolean {
    return this.getAllPoses().length === 3;
  }

  // return all existing poses
  getAllPoses(): SynthesisPose[] {
    let poses: SynthesisPose[] = [];
    for (let i = 1; i <= 3; i++) {
      if (this.isPoseDefined(i)) {
        poses.push(this.getPose(i));
      }
    }
    return poses;
  }

  // get the first pose that needs to be created
  getFirstUndefinedPose(): number | undefined {
    for (let i = 1; i <= 3; i++) {
      if (!this.isPoseDefined(i)) {
        return i;
      }
    }
    return undefined;
  }

  deleteAllPoses(): void {
    this.poses = {};
    this.valueChanges.next(true);
  }

  // given form, update poses
  // if form is invalid, return false to revert form
  updatePosesFromForm(form: { [key: string]: string | null | undefined }): boolean {
    if (form['cor'] === '0') this._COR = COR.BACK;
    else if (form['cor'] === '1') this._COR = COR.CENTER;
    else this._COR = COR.FRONT;

    // if length is a number and positive, update length
    const [success, maybeLength] = this.nup.parseModelLengthString(
      form['length']!,
      this.settings.lengthUnit.getValue()
    );
    if (!success) {
      console.log('invalid length');
      return false;
    }
    this.length = maybeLength;

    for (let i = 1; i <= 3; i++) {
      const typed = (key: string) => (form[key] ?? '').toString().trim();
      const xText = typed(`p${i}x`);
      const yText = typed(`p${i}y`);
      const thetaText = typed(`p${i}theta`);
      const [successX, maybeX] = this.nup.parseModelLengthString(
        xText,
        this.settings.lengthUnit.getValue()
      );
      const [successY, maybeY] = this.nup.parseModelLengthString(
        yText,
        this.settings.lengthUnit.getValue()
      );
      const [successTheta, maybeTheta] = this.nup.parseAngleString(
        thetaText,
        this.settings.angleUnit.getValue()
      );
      // An empty box parses as zero, so emptiness is asked about separately:
      // three blanks are a row nobody has started, not a position at the origin.
      const complete = !!xText && !!yText && !!thetaText;
      const readable = successX && successY && successTheta;

      if (this.isPoseDefined(i)) {
        // An existing position is only ever edited. A box emptied or filled with
        // something unreadable is refused rather than applied, and the panel
        // writes the old value back.
        if (!complete || !readable) return false;
        this.poses[i].position = new Coord(maybeX, maybeY);
        this.poses[i].thetaDegrees = maybeTheta;
        continue;
      }

      // A row being typed into is not an error until it is finished. It becomes
      // a position on the drawing at the moment it says where and which way --
      // which is the same moment a dropped one does, reached by the other road.
      if (!complete || !readable) continue;
      this.poses[i] = new SynthesisPose(
        i,
        new Coord(maybeX, maybeY),
        (maybeTheta * Math.PI) / 180,
        () => this.COR,
        () => this.length
      );
      this.selectedPose = i;
      this.armed = false;
    }

    // if we get here, form is valid
    return true;
  }

  /** The three positions as pin-carrying bars, for the candidate search. */
  posePoints(): PosePoint[] {
    return this.getAllPoses().map((pose) => ({ back: pose.posBack, front: pose.posFront }));
  }

  /** Everything the enumeration needs, and nothing it does not. */
  search(): CandidateSearch {
    return {
      poses: this.posePoints(),
      length: this.length,
      endsOnly: this.endsOnly,
      region: this.constrain ? { ...this.region } : undefined,
    };
  }

  /**
   * What the candidate list was computed for.
   *
   * `allowDefect` is deliberately absent: it filters a list rather than
   * changing what is in it, so switching it does not have to pay for a
   * re-enumeration.
   */
  searchKey(): string {
    const poses = this.getAllPoses().map((p) => [
      Math.round(p.position.x),
      Math.round(p.position.y),
      Math.round(p.thetaDegrees * 100),
    ]);
    return JSON.stringify([
      poses,
      Math.round(this.length),
      this._COR,
      this.endsOnly,
      this.constrain ? this.region : null,
    ]);
  }

  /**
   * Drop a position where the reader clicked, turned the way the ghost was.
   *
   * Positions fill 1, 2, 3 in the order they are placed, and placing stays
   * armed until the third: three clicks is the whole gesture, and disarming
   * between them would put a button press between every one.
   */
  placePose(at: Coord): void {
    const next = this.getFirstUndefinedPose();
    if (next === undefined) return;
    this.poses[next] = new SynthesisPose(
      next,
      at,
      (this.placeAngleDeg * Math.PI) / 180,
      () => this.COR,
      () => this.length
    );
    const more = this.getFirstUndefinedPose() !== undefined;
    this.armed = more;
    this.selectedPose = more ? next + 1 : next;
    this.placeAngleDeg -= 22;
    this.valueChanges.next(true);
  }

  /** Arm or disarm placing, and select the row that is about to be filled. */
  setArmed(armed: boolean): void {
    const next = this.getFirstUndefinedPose();
    if (armed && next === undefined) return;
    this.armed = armed;
    // Only arming cancels a region being drawn: the two gestures both own the
    // canvas, so one has to give way -- but disarming is also how *starting* to
    // draw a region reports itself, and clearing it here unconditionally meant
    // the Redraw button switched the mode off in the same breath it asked for
    // it.
    if (armed) this.regionDraw = false;
    if (armed) {
      this.selectedPose = next!;
      const placed = this.getAllPoses();
      if (placed.length) this.placeAngleDeg = placed[placed.length - 1].thetaDegrees - 22;
    }
    this.valueChanges.next(false);
  }

  /**
   * Copy the last position and offset it slightly.
   *
   * A quick start for three similar positions, which is what most designs
   * actually are -- and it saves a reader from discovering that three
   * positions in a straight line have no solutions at all.
   */
  duplicateLastPose(): void {
    const placed = this.getAllPoses();
    const next = this.getFirstUndefinedPose();
    if (!placed.length || next === undefined) return;
    const last = placed[placed.length - 1];
    this.poses[next] = new SynthesisPose(
      next,
      new Coord(last.position.x + 6 * MODEL_SCALE, last.position.y + 5 * MODEL_SCALE),
      ((last.thetaDegrees - 22) * Math.PI) / 180,
      () => this.COR,
      () => this.length
    );
    this.armed = false;
    this.selectedPose = next;
    this.valueChanges.next(true);
  }

  /**
   * Remove one position, and close the gap it leaves.
   *
   * The panel shows three numbered rows and fills them in order, so a hole in
   * the middle would leave "Position 2" blank under a filled "Position 3" --
   * a state the placing gesture cannot produce and has no way to repair.
   */
  removePose(id: number): void {
    const kept = this.getAllPoses().filter((pose) => pose.id !== id);
    this.poses = {};
    kept.forEach((pose, index) => {
      this.poses[index + 1] = new SynthesisPose(
        index + 1,
        pose.position,
        pose.thetaRadians,
        () => this.COR,
        () => this.length
      );
    });
    this.armed = false;
    this.selectedPose = kept.length ? Math.min(this.selectedPose, kept.length) : 0;
    this.valueChanges.next(true);
  }

  /** Nothing designed, nothing asked for -- what a fresh visit looks like. */
  clearDesign(): void {
    this.poses = {};
    this._COR = COR.CENTER;
    this._length = 5 * MODEL_SCALE;
    this._selectedPose = 0;
    this.stage = 'chooser';
    this.armed = false;
    this.regionDraw = false;
    this.endsOnly = true;
    this.allowDefect = false;
    this.constrain = false;
    this.ownedJointIds = [];
    this.ownedAt = [];
    this.ownershipPartial = false;
    this.valueChanges.next(true);
  }

  /**
   * Replace the whole design with one that came out of a URL.
   *
   * One notification at the end rather than one per field: a decode is a
   * single event -- a link opened, or a step through history -- and reporting
   * it as eleven would have the panel re-read a half-applied design ten times.
   */
  applyDecoded(decoded: {
    length: number;
    reference: COR;
    endsOnly: boolean;
    allowDefect: boolean;
    constrain: boolean;
    stage: 'chooser' | 'working';
    poses: { at: Coord; thetaDegrees: number }[];
    region?: { x: number; y: number; w: number; h: number };
    ownedJointIds: string[];
    ownedAt?: { x: number; y: number }[];
    ownershipPartial?: boolean;
  }): void {
    this._COR = decoded.reference;
    this._length = decoded.length > 0 ? decoded.length : 5 * MODEL_SCALE;
    this.endsOnly = decoded.endsOnly;
    this.allowDefect = decoded.allowDefect;
    this.constrain = decoded.constrain;
    this.stage = decoded.stage;
    this.armed = false;
    this.regionDraw = false;
    this.ownedJointIds = decoded.ownedJointIds;
    this.ownedAt = decoded.ownedAt ?? [];
    this.ownershipPartial = !!decoded.ownershipPartial;
    if (decoded.region) this.region = decoded.region;

    this.poses = {};
    decoded.poses.slice(0, 3).forEach((pose, index) => {
      this.poses[index + 1] = new SynthesisPose(
        index + 1,
        pose.at,
        (pose.thetaDegrees * Math.PI) / 180,
        () => this.COR,
        () => this.length
      );
    });
    // A decode is not a click, so it selects nothing: the design comes back as
    // it was written, not as though a row had just been picked.
    this._selectedPose = 0;
    this.valueChanges.next(true);
  }
}
