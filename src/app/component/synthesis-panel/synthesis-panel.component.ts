import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { CollapsibleSubsecitonComponent } from '../BLOCKS/collapsible-subseciton/collapsible-subseciton.component';
import { MechanismService } from '../../services/mechanism.service';
import { NotificationService } from '../../services/notification.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { SynthesisSolutionService } from 'src/app/services/synthesis/synthesis-solution.service';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from 'src/app/services/settings.service';
import { COR } from 'src/app/services/synthesis/synthesis-util';
import {
  FourBarCandidate,
  describeCouplerPins,
  solveFourBar,
} from 'src/app/services/synthesis/synthesis-candidates';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { SvgGridService } from '../../services/svg-grid.service';

/** One requirement row: what it costs, and what switching it off buys. */
interface Requirement {
  key: string;
  on: boolean;
  label: string;
  detail: string;
  toggle: () => void;
  hasRegion?: boolean;
}

/** What one candidate looks like on its card in the gallery. */
interface CandidateCard {
  key: string;
  name: string;
  kind: string;
  thumb: string;
  thumbCoupler: string;
  selected: boolean;
  reachText: string;
  defectFree: boolean;
  /** Whether it stalls at a dead point on the way between positions. */
  binds: boolean;
  metric: string;
}

/** The one message whose answers act on this panel after it has been raised. */
const REPLACE_WARNING = 'synthesis.replace-edited';

const HELP = {
  length:
    'The length of the end-effector link — the part whose three positions you are designing for. ' +
    "The four-bar's coupler is pinned to this link, but not necessarily at its ends.",
  ref:
    'Which point on the end-effector link the coordinates describe, and the point it turns about: ' +
    'its back end, its middle, or its front end.',
  duplicate:
    'Copy the last position and offset it slightly — a quick start for three similar positions.',
  branch:
    'A four-bar can be closed two ways through the same ground pins. Which way it is closed ' +
    'decides which of the three positions it can pass through without coming apart.',
  pin:
    'Which ground pin carries the input. A four-bar that will not turn from one ground pin often ' +
    'turns freely from the other.',
  driver:
    'Adds a crank and coupler sized so one full turn walks the linkage through all three ' +
    'positions, making it a six-bar a motor can run.',
  requirements:
    'What a solution has to satisfy to be listed. Every one you switch on narrows the search; ' +
    'switching one off widens it.',
};

@Component({
  selector: 'app-synthesis-panel',
  templateUrl: './synthesis-panel.component.html',
  styleUrls: ['./synthesis-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, ReactiveFormsModule, MatIcon, MatTooltip, CollapsibleSubsecitonComponent],
})
export class SynthesisPanelComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  mechanismSrv = inject(MechanismService);
  private notify = inject(NotificationService);
  design = inject(SynthesisBuilderService);
  solution = inject(SynthesisSolutionService);
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);
  svgGrid = inject(SvgGridService);

  readonly help = HELP;
  readonly rows = [1, 2, 3];

  /** The panel's scrolling half, so a finished search can be scrolled to. */
  private readonly workScroll = viewChild<ElementRef<HTMLElement>>('workScroll');

  private subs: Subscription[] = [];
  private syncing = false;
  /** Rows that had a position last time the panel read the design. */
  private hadPose = new Set<number>();
  private frame: number | undefined;

  poseForm = this.fb.group(
    {
      length: [''],
      p1x: [''],
      p1y: [''],
      p1theta: [''],
      p2x: [''],
      p2y: [''],
      p2theta: [''],
      p3x: [''],
      p3y: [''],
      p3theta: [''],
    },
    { updateOn: 'blur' }
  );

  regionForm = this.fb.group({ rx: [''], ry: [''], rw: [''], rh: [''] }, { updateOn: 'blur' });

  ngOnInit(): void {
    this.readFromModel();

    this.subs.push(
      this.design.valueChanges.subscribe(() => {
        this.readFromModel();
        this.claimWheel();
        // Deliberately not invalidating here. Moving a position changes the
        // answer, not the question, and the search keeps up with it on its own
        // -- being sent back to Generate for a one-millimetre nudge made the
        // button the thing the reader spent the session pressing. The sites
        // that really do change the question say so themselves.
        this.solution.changed.next();
      })
    );

    this.subs.push(
      this.poseForm.valueChanges.subscribe((value) => {
        if (this.syncing) return;
        this.syncing = true;
        const before = new Set(this.design.getAllPoses().map((pose) => pose.id));
        this.design.updatePosesFromForm({ ...value, cor: this.corIndex() });
        this.readFromModel();
        this.syncing = false;
        this.record();
        // A typed position can name any coordinate at all, and nobody pointed
        // at where it landed -- so the canvas goes to it if it is not already
        // there. Only for one that has just come into existence: editing a
        // number on a position already on screen leaves the view alone.
        const arrived = this.design.getAllPoses().find((pose) => !before.has(pose.id));
        // Out of this render. Framing can resize the drawn marks, which this
        // very render has already read, and a value that changes after it was
        // checked is an error Angular is right to raise.
        if (arrived) setTimeout(() => this.svgGrid.revealOnCanvas(arrived.position));
      })
    );

    this.subs.push(
      this.regionForm.valueChanges.subscribe(() => {
        if (this.syncing) return;
        this.readRegionFromForm();
      })
    );

    this.subs.push(
      SettingsService._objectScale.subscribe(() => {
        this.design.getAllPoses().forEach((pose) => pose.recompute());
      })
    );

    // A finished search puts its answer at the bottom of a panel the reader is
    // looking at the top of. Nothing about the design above it has changed, so
    // there is no cue that anything happened down there -- and the button that
    // was just pressed is in the foot, which does not move. So the panel goes
    // to meet it.
    this.subs.push(
      this.solution.changed.subscribe(() => {
        const searching = this.solution.generating;
        const finished = this.wasSearching && !searching && this.solution.generated;
        this.wasSearching = searching;
        if (finished) this.revealTheAnswer();
      })
    );
  }

  /** Whether the last thing this panel heard about was a search in progress. */
  private wasSearching = false;

  /**
   * Scroll the design out of the way and the solution into view.
   *
   * Deferred a frame: the results are rendered by the change detection this
   * notification is part of, so the box is still its old height until that has
   * run and there is nothing yet to scroll to.
   */
  private revealTheAnswer(): void {
    setTimeout(() => {
      const box = this.workScroll()?.nativeElement;
      if (!box) return;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.scrollTo({ top: box.scrollHeight, behavior: still ? 'auto' : 'smooth' });
    });
  }

  ngOnDestroy(): void {
    this.gone = true;
    // Take the replace warning with us: its buttons act on this panel, and left
    // on screen they were still clickable after it was gone.
    this.notify.live
      .filter((one) => one.id === REPLACE_WARNING)
      .forEach((one) => this.notify.dismiss(one.key));
    this.subs.forEach((s) => s.unsubscribe());
    if (this.frame) cancelAnimationFrame(this.frame);
    // Stop any wind-back, and stop what it was going to do afterwards: a commit
    // that lands after the panel is gone acts on a drawing nobody is looking at.
    this.windingBack = false;
    if (this.windBackFrame) cancelAnimationFrame(this.windBackFrame);
    // Leaving the tab hands the wheel back whatever state placing was left in.
    this.svgGrid.setWheelZoomEnabled(true);
  }

  /**
   * While a position is waiting to be dropped the wheel turns it, so the canvas
   * zoom has to stand down. Reconciled from one place -- every path that arms
   * or disarms placing reports through `valueChanges` -- rather than paired by
   * hand at each of them, because the failure of a missed pairing is a canvas
   * whose wheel is dead until the tab is left.
   */
  private claimWheel(): void {
    this.svgGrid.setWheelZoomEnabled(!this.design.armed);
  }

  // --- units ---------------------------------------------------------------

  private lengthText(model: number): string {
    return this.nup.formatModelLength(model, this.settings.lengthUnit.getValue());
  }

  private angleText(degrees: number): string {
    return this.nup.formatValueAndUnit(degrees, this.settings.angleUnit.getValue());
  }

  /** A model length in the reader's own unit, to two places, without a unit. */
  private plain(model: number): string {
    return (model / MODEL_SCALE).toFixed(2);
  }

  get lengthUnit(): string {
    return this.nup.unitLabel(this.settings.lengthUnit.getValue());
  }

  private corIndex(): string {
    return this.design.COR === COR.BACK ? '0' : this.design.COR === COR.CENTER ? '1' : '2';
  }

  // --- form <-> model ------------------------------------------------------

  private readFromModel(): void {
    this.syncing = true;
    const controls = this.poseForm.controls as unknown as Record<
      string,
      { setValue(value: string, options?: { emitEvent: boolean }): void }
    >;
    controls['length'].setValue(this.lengthText(this.design.length), { emitEvent: false });
    for (const i of this.rows) {
      const pose = this.design.isPoseDefined(i) ? this.design.getPose(i) : undefined;
      if (pose) {
        controls[`p${i}x`].setValue(this.lengthText(pose.position.x), { emitEvent: false });
        controls[`p${i}y`].setValue(this.lengthText(pose.position.y), { emitEvent: false });
        controls[`p${i}theta`].setValue(this.angleText(pose.thetaDegrees), { emitEvent: false });
        this.hadPose.add(i);
        continue;
      }
      // A row with no position behind it is either one nobody has started or
      // one somebody is halfway through typing, and the two look the same from
      // here -- so it is left exactly as it is. The exception is a row that had
      // a position a moment ago: something removed it, or an undo did, and the
      // numbers it left behind are about a position that is gone.
      if (this.hadPose.delete(i)) {
        [`p${i}x`, `p${i}y`, `p${i}theta`].forEach((name) =>
          controls[name].setValue('', { emitEvent: false })
        );
      }
    }
    const r = this.design.region;
    this.regionForm.setValue(
      {
        rx: this.plain(r.x),
        ry: this.plain(r.y),
        rw: this.plain(r.w),
        rh: this.plain(r.h),
      },
      { emitEvent: false }
    );
    this.syncing = false;
  }

  private readRegionFromForm(): void {
    const unit = this.settings.lengthUnit.getValue();
    // The four boxes hold bare numbers -- the unit is said once, on the row --
    // so a value is read as being in whatever unit the drawing is in. A reader
    // who types one anyway is still understood.
    const parsed = (['rx', 'ry', 'rw', 'rh'] as const).map((key) => {
      const typed = (this.regionForm.get(key)!.value ?? '').trim();
      return this.nup.parseModelLengthString(
        /[a-z]/i.test(typed) ? typed : `${typed} ${this.lengthUnit}`,
        unit
      );
    });
    if (parsed.some(([ok]) => !ok)) {
      this.readFromModel();
      return;
    }
    this.design.region = {
      x: parsed[0][1],
      y: parsed[1][1],
      w: Math.max(MODEL_SCALE, parsed[2][1]),
      h: Math.max(MODEL_SCALE, parsed[3][1]),
    };
    this.readFromModel();
    this.record();
  }

  /**
   * One entry in the history for one change to the design.
   *
   * The design rides in the same URL undo and redo are made of, so a step of it
   * has to be written the same way an edit to the drawing is -- once per
   * completed change, never per pointer-move. Dragging a position on the grid
   * records on release, for the same reason.
   */
  private record(): void {
    this.mechanismSrv.save();
  }

  // --- stage ---------------------------------------------------------------

  get isChooser(): boolean {
    return this.design.stage === 'chooser';
  }

  startMotionSynthesis(): void {
    this.design.stage = 'working';
    this.design.setArmed(false);
  }

  backToChooser(): void {
    this.design.stage = 'chooser';
    this.design.regionDraw = false;
    this.design.setArmed(false);
    this.solution.playing = false;
  }

  headerNote(): string {
    if (!this.design.isFullyDefined()) {
      return this.design.getAllPoses().length + ' of 3 positions placed';
    }
    if (!this.solution.generated) return '3 positions · no solutions yet';
    const count = this.solution.candidates().length;
    const kind = this.solution.dyad() ? 'six-bar' : 'four-bar';
    return `${kind} · ${count} ${count === 1 ? 'solution' : 'solutions'}`;
  }

  // --- the coupler ---------------------------------------------------------

  setReference(cor: COR): void {
    if (this.design.COR === cor) return;
    this.design.updatePosesFromForm({
      ...this.poseForm.value,
      cor: cor === COR.BACK ? '0' : cor === COR.CENTER ? '1' : '2',
    });
    this.design.valueChanges.next(true);
    this.record();
  }

  referenceOptions(): { label: string; value: COR; active: boolean }[] {
    return [
      { label: 'Back', value: COR.BACK, active: this.design.COR === COR.BACK },
      { label: 'Center', value: COR.CENTER, active: this.design.COR === COR.CENTER },
      { label: 'Front', value: COR.FRONT, active: this.design.COR === COR.FRONT },
    ];
  }

  // --- positions -----------------------------------------------------------

  get nextPositionNumber(): number {
    return this.design.getAllPoses().length + 1;
  }

  get showAddButton(): boolean {
    return !this.design.isFullyDefined();
  }

  get addLabel(): string {
    return this.design.armed ? 'Cancel' : 'Add position ' + this.nextPositionNumber;
  }

  /**
   * Arm or disarm placing, fitting the scale on the way in.
   *
   * Every route to arming comes through here. Object scale is what parts are
   * drawn at, and it was being fitted on the first click -- after the ghost had
   * already been drawn at the old one, so the click appeared to grow the
   * position. Fitting it here happens before the ghost first appears; putting
   * it in the button's own handler missed the other way in, which is clicking
   * an empty position row.
   *
   * Only on a drawing with nothing in it: the scale is global, and resizing
   * someone's work because a position is about to be placed is a change nobody
   * asked for.
   */
  private arm(armed: boolean): void {
    // Joints as well as links. A joint on its own belongs to no link, so a
    // drawing holding nothing but loose joints counted as empty -- and fitting
    // the scale to the zoom resized them under the reader, which is the one
    // thing this was supposed to avoid doing to existing work.
    const drawingIsEmpty =
      this.mechanismSrv.links.length === 0 && this.mechanismSrv.joints.length === 0;
    if (armed && drawingIsEmpty && !this.design.getAllPoses().length) {
      this.svgGrid.updateObjectScale();
    }
    this.design.setArmed(armed);
  }

  toggleArmed(): void {
    this.arm(!this.design.armed);
  }

  get canDuplicate(): boolean {
    const placed = this.design.getAllPoses().length;
    return placed > 0 && placed < 3;
  }

  isPlaced(i: number): boolean {
    return this.design.isPoseDefined(i);
  }

  isSelectedRow(i: number): boolean {
    return this.design.selectedPose === i;
  }

  /** Whether this row is the one the pointer is currently about to fill. */
  isPreviewingRow(i: number): boolean {
    return !this.isPlaced(i) && this.design.armed && this.nextPositionNumber === i;
  }

  selectRow(i: number): void {
    if (this.isPlaced(i)) {
      this.design.selectedPose = i;
      this.design.setArmed(false);
    } else {
      // An empty row is the one place a reader looks to fill it in -- so it is
      // a way of arming, and has to prepare the same way the button does.
      this.arm(true);
    }
  }

  removeRow(event: Event, i: number): void {
    event.stopPropagation();
    if (!this.isPlaced(i)) return;
    this.design.removePose(i);
    this.solution.invalidate();
    this.record();
  }

  duplicateLast(): void {
    this.design.duplicateLastPose();
    this.solution.invalidate();
    this.record();
  }

  /**
   * Typing in a row is a way of pointing at it.
   *
   * The nine boxes are live whether or not the position behind them exists yet,
   * so a design can be typed out as readily as dropped on the drawing -- and
   * the row somebody is filling in is the one the panel should be talking
   * about. Deliberately silent about arming: the two ways in are both live at
   * once, and choosing one is not turning the other off.
   */
  aimAtRow(i: number): void {
    this.design.selectedPose = i;
  }

  /**
   * Whether the chosen linkage reaches this position on the assembly it is
   * drawn in. Undefined when there is nothing to check it against.
   */
  reached(i: number): boolean | undefined {
    const cand = this.solution.chosen();
    if (!cand || !this.isPlaced(i)) return undefined;
    return cand.onBranch[i - 1];
  }

  rowStatusIcon(i: number): string {
    if (!this.isPlaced(i)) {
      return this.isPreviewingRow(i) ? 'ads_click' : 'radio_button_unchecked';
    }
    const ok = this.reached(i);
    if (ok === undefined) return 'help_outline';
    return ok ? 'check_circle' : 'link_off';
  }

  rowStatusTip(i: number): string {
    if (!this.isPlaced(i)) {
      return this.isPreviewingRow(i) ? 'Click the grid to drop this position' : 'Not placed yet';
    }
    const ok = this.reached(i);
    if (ok === undefined) {
      if (!this.design.isFullyDefined()) return 'Waiting for all three positions';
      return this.solution.generated
        ? 'No solution to check this position against yet'
        : 'Generate solutions to check this position';
    }
    return ok
      ? 'The chosen solution passes through this position on its own assembly'
      : 'The chosen solution reaches this position only on its other assembly — a branch defect';
  }

  // --- requirements --------------------------------------------------------

  requirements(): Requirement[] {
    const length = this.plain(this.design.length);
    return [
      {
        key: 'defect',
        on: !this.design.allowDefect,
        label: 'Reaches all 3 positions on one assembly',
        detail: this.design.allowDefect
          ? 'Solutions that have to be taken apart between positions are listed too'
          : 'The linkage never has to be taken apart',
        toggle: () => this.toggleRequirement('allowDefect'),
      },
      {
        // Named for where the coupler is pinned rather than for how long it
        // comes out, because the length is a consequence and the pinning is
        // the choice -- and because the panel already has a Length field, for
        // the end-effector link, which is a different bar.
        key: 'coupler',
        on: this.design.endsOnly,
        label: "Coupler pinned at the link's ends",
        detail: this.design.endsOnly
          ? `The coupler is the whole ${length} ${this.lengthUnit} of the end-effector link`
          : 'Pins are tried at a range of places along the link and past its ends',
        toggle: () => this.toggleRequirement('endsOnly'),
      },
      {
        key: 'region',
        on: this.design.constrain,
        label: 'Ground pins inside a region',
        detail: this.design.constrain
          ? 'Both ground pins must land in the box on the grid'
          : 'Ground pins may land anywhere',
        toggle: () => this.toggleRequirement('constrain'),
        hasRegion: this.design.constrain,
      },
    ];
  }

  private toggleRequirement(which: 'endsOnly' | 'allowDefect' | 'constrain'): void {
    if (which === 'endsOnly') this.design.endsOnly = !this.design.endsOnly;
    if (which === 'allowDefect') this.design.allowDefect = !this.design.allowDefect;
    if (which === 'constrain') {
      this.design.constrain = !this.design.constrain;
      this.design.regionDraw = false;
      this.design.setArmed(false);
      if (this.design.constrain) this.frameRegionOnCurrentAnswer();
    }
    // Only the defect filter leaves the enumeration standing: it hides members
    // of a list rather than changing which list it is.
    if (which === 'allowDefect') this.solution.changed.next();
    else this.solution.invalidate();
    this.record();
  }

  /** Open the region around what is already on screen, not around nothing. */
  private frameRegionOnCurrentAnswer(): void {
    const cand = this.solution.chosen();
    const points = cand ? [cand.A, cand.D] : this.design.getAllPoses().map((pose) => pose.position);
    if (!points.length) return;
    const pad = 3 * MODEL_SCALE;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    this.design.region = {
      x,
      y,
      w: Math.max(8 * MODEL_SCALE, Math.max(...xs) - x + pad),
      h: Math.max(8 * MODEL_SCALE, Math.max(...ys) - y + pad),
    };
    this.readFromModel();
  }

  /**
   * How strict the search currently is.
   *
   * It used to read "2 of 3 required", which names an obligation the reader
   * does not have: it looked like two of the three had to be switched on before
   * anything would happen. What the number reports is how much is being asked
   * of a solution, so it says that instead.
   */
  requirementCount(): string {
    const n =
      (this.design.endsOnly ? 1 : 0) +
      (this.design.allowDefect ? 0 : 1) +
      (this.design.constrain ? 1 : 0);
    return n === 0 ? 'nothing narrowing the search' : `${n} of 3 narrowing the search`;
  }

  regionSummary(): string {
    return 'Drag the box on the grid, or its corners.';
  }

  toggleRegionDraw(): void {
    this.design.regionDraw = !this.design.regionDraw;
    this.design.setArmed(false);
  }

  /** Named only when the requirements are what stands between reader and answer. */
  get requirementsBlocking(): boolean {
    return this.showResults && this.solution.candidates().length === 0;
  }

  requirementsBlockingNote(): string {
    // Every one of these ends by offering to move a position, because that is
    // the way out that does not cost a requirement -- and when nothing fits at
    // all, it is usually because the three are close to a straight line.
    const moveOne =
      'Moving the middle position further off the line between the other two also opens it up.';
    if (this.design.constrain) {
      return (
        'No solution keeps both ground pins inside the region. Widen it, move it, or switch it ' +
        `off. ${moveOne}`
      );
    }
    if (this.design.endsOnly && !this.design.allowDefect) {
      return (
        'No solution satisfies both. Unpinning the coupler from the ends of the link is the ' +
        'usual first one to give: the three positions stay exactly where they are, and only ' +
        `where the coupler is attached to the link changes. ${moveOne}`
      );
    }
    if (this.design.endsOnly) {
      return (
        "No four-bar whose coupler is pinned at the link's ends passes through these three " +
        `positions. Unpin it to let the coupler be any length. ${moveOne}`
      );
    }
    if (!this.design.allowDefect) {
      return (
        'Every four-bar through these three positions has to be taken apart between them. ' +
        `Accept a branch defect to see them. ${moveOne}`
      );
    }
    return (
      'Nothing was found even with every requirement relaxed. The three positions are too close ' +
      `to a straight line. ${moveOne}`
    );
  }

  // --- generating ----------------------------------------------------------

  get showGenerate(): boolean {
    return this.design.isFullyDefined() && !this.solution.generated;
  }

  generateNote(): string {
    const parts: string[] = [];
    if (!this.design.allowDefect) parts.push('all three positions on one assembly');
    if (this.design.endsOnly) parts.push("the coupler pinned at the link's ends");
    if (this.design.constrain) parts.push('both ground pins in the region');
    return parts.length
      ? 'Search for four-bars with ' + parts.join(', ') + '.'
      : 'Search for four-bars through these three positions.';
  }

  generate(): void {
    this.solution.generate();
  }

  /**
   * The one button at the foot of the panel.
   *
   * Generate and Insert are the same button at two moments: they are the step
   * the reader takes next, and only one of them is ever the step. Two buttons
   * in two places meant hunting for whichever one was live, and the one in the
   * scroll area could be scrolled off the screen at the moment it mattered.
   */
  get primaryIsGenerate(): boolean {
    // Named for the step that is coming even before it can be taken. With two
    // positions placed the button used to read "Replace on grid", greyed --
    // which is true and useless: what is actually next is the search, and the
    // reader is one position away from it.
    return !this.solution.generated;
  }

  get primaryLabel(): string {
    if (this.primaryIsGenerate) {
      return this.solution.generating ? 'Searching…' : 'Generate solutions';
    }
    return this.insertLabel;
  }

  get primaryIcon(): string {
    if (this.primaryIsGenerate) {
      return this.solution.generating ? 'hourglass_top' : 'auto_awesome';
    }
    return this.solutionIsOnGrid ? 'check' : 'add_circle_outline';
  }

  get primaryDisabled(): boolean {
    if (!this.primaryIsGenerate) return !this.canInsert;
    return this.solution.generating || !this.design.isFullyDefined();
  }

  primaryAction(): void {
    if (this.primaryIsGenerate) this.generate();
    else this.insert();
  }

  // --- results -------------------------------------------------------------

  get showResults(): boolean {
    return this.design.isFullyDefined() && this.solution.generated;
  }

  /**
   * Whether the gallery is worth drawing.
   *
   * With one candidate there is nothing to compare it against, and a row of
   * one card asks the reader to choose between a thing and nothing. The
   * solution below says everything the card would have.
   */
  get showGallery(): boolean {
    return this.solution.candidates().length > 1;
  }

  /**
   * What to call the solution being looked at.
   *
   * The letters exist to tell candidates apart in the gallery. With only one,
   * there is nothing to tell it apart from, and "Solution A" invites the reader
   * to go looking for B.
   */
  get solutionHeading(): string {
    return this.showGallery ? `Solution ${this.solutionName}` : 'Solution';
  }

  candidateHeading(): string {
    const list = this.solution.candidates();
    if (!list.length) return 'No solution meets the requirements';
    const strict = this.solution.strictCount;
    // Counted as what can be browsed, not as what was found. The gallery shows
    // the best few; a heading naming ten when eight is the most anybody can
    // open is a heading describing something else.
    const shown = list.length;
    const capped = strict > shown ? ` (best ${shown} shown)` : '';
    if (strict) {
      const label = strict === 1 ? 'solution reaches' : 'solutions reach';
      return `${strict} ${label} all 3 positions${capped}`;
    }
    return `${shown} solution${shown === 1 ? '' : 's'}, all with a branch defect`;
  }

  /**
   * The geometric explanation, for when no requirement is standing in the way.
   * With one switched on, the Requirements note is the better answer.
   */
  get showNoCandidateReason(): boolean {
    return (
      this.showResults &&
      this.solution.candidates().length === 0 &&
      !this.design.endsOnly &&
      this.design.allowDefect &&
      !this.design.constrain
    );
  }

  noCandidateReason(): string {
    const why = this.solution.rejections();
    if (why.degenerate && !why.tooBig) {
      return (
        'The three positions lie on one line, so no circle passes through the three positions of ' +
        'a coupler point. Turn the middle position, or move it off the line between the other two.'
      );
    }
    if (why.tooBig) {
      return (
        `${why.tooBig} of ${why.tried} constructions put a ground pivot further from the ` +
        'positions than the machine could sensibly reach — the three positions are close to a ' +
        'straight line. Turn the middle position further, or move it off the line between the ' +
        'other two.'
      );
    }
    return 'No four-bar of a buildable size passes through these three positions.';
  }

  visibleCandidates(): CandidateCard[] {
    const list = this.solution.candidates();
    const shown = this.solution.showAll ? list : list.slice(0, 3);
    const picked = this.solution.chosen();
    return shown.map((c) => this.toCard(c, picked));
  }

  private toCard(c: FourBarCandidate, picked: FourBarCandidate | null): CandidateCard {
    const pts = [c.A, c.B, c.C, c.D];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const k = Math.min(102 / Math.max(1e-6, maxX - minX), 32 / Math.max(1e-6, maxY - minY));
    const tx = (p: { x: number }) => (9 + (p.x - minX) * k).toFixed(1);
    const ty = (p: { y: number }) => (40 - (p.y - minY) * k).toFixed(1);
    return {
      key: c.key,
      name: c.name,
      kind: c.kind + ' · ' + c.branch.toLowerCase(),
      thumb:
        `M ${tx(c.A)} ${ty(c.A)} L ${tx(c.B)} ${ty(c.B)} ` +
        `M ${tx(c.C)} ${ty(c.C)} L ${tx(c.D)} ${ty(c.D)}`,
      thumbCoupler: `M ${tx(c.B)} ${ty(c.B)} L ${tx(c.C)} ${ty(c.C)}`,
      // The same construction, whichever way it is closed: a card is the
      // solution, and the assembly is a switch inside it.
      selected: !!picked && picked.pair === c.pair,
      defectFree: c.defectFree,
      binds: c.binds,
      reachText: c.defectFree
        ? 'all 3, one assembly'
        : c.binds && c.onBranchCount === 3
          ? 'all 3, but stalls between them'
          : `branch defect · ${c.onBranchCount} of 3`,
      metric:
        (c.binds ? `stalls at ${c.minTransmission}° · ` : `min angle ${c.minTransmission}° · `) +
        (c.range.full ? 'full turn' : `${Math.round(c.range.to - c.range.from)}° swing`),
    };
  }

  get hasMoreCandidates(): boolean {
    return this.solution.candidates().length > 3;
  }

  moreLabel(): string {
    return this.solution.showAll ? 'Show fewer' : 'Show all ' + this.solution.candidates().length;
  }

  toggleAllCandidates(): void {
    this.solution.showAll = !this.solution.showAll;
  }

  pickCandidate(key: string): void {
    this.solution.pick(key);
  }

  hoverCandidate(key: string | null): void {
    this.solution.setHover(key);
  }

  // --- the chosen solution -------------------------------------------------

  get hasSolution(): boolean {
    return this.showResults && this.solution.chosen() !== null;
  }

  get solutionName(): string {
    return this.solution.chosen()?.name ?? '—';
  }

  branchOptions(): { label: string; active: boolean; available: boolean; key: string }[] {
    const cand = this.solution.chosen();
    const list = this.solution.allAssemblies();
    return (['Open', 'Crossed'] as const).map((label) => {
      const sibling = cand
        ? list.find((c) => c.pair === cand.pair && c.branch === label)
        : undefined;
      return {
        label,
        active: !!cand && cand.branch === label,
        available: !!sibling,
        key: sibling?.key ?? '',
      };
    });
  }

  pickBranch(key: string): void {
    if (key) this.solution.pick(key);
  }

  pinOptions(): { label: string; far: boolean; active: boolean }[] {
    // Named by the letters those two pins are drawn under. `chosen()` rather
    // than `driven()`: this asks which end to read the linkage from, so it has
    // to name the ends of the unswapped one, and the far pin is the one that
    // is called D whichever end is currently driving.
    const e = this.solution.previewLetters(this.solution.chosen());
    return [
      { label: `Pin ${e.A}`, far: false, active: !this.solution.driveOnFarPin },
      { label: `Pin ${e.D}`, far: true, active: this.solution.driveOnFarPin },
    ];
  }

  setPin(far: boolean): void {
    this.solution.setDriveOnFarPin(far);
  }

  /**
   * Why a driver cannot be fitted to this solution, if it cannot.
   *
   * Asked whether or not one is wanted, so the switch can be turned off before
   * it is pressed rather than after. A refusal used to arrive as a paragraph
   * under a switch that had just been flipped -- a large piece of text
   * explaining that the thing the reader had asked for had not happened.
   */
  get driverRefusal(): string | undefined {
    return this.solution.driverAvailability();
  }

  /** Whether the driver is both wanted and possible. */
  get driverOn(): boolean {
    return this.solution.driverWanted && !this.driverRefusal;
  }

  toggleDriver(): void {
    if (this.driverRefusal) return;
    this.solution.toggleDriver();
  }

  toggleDimensions(): void {
    this.solution.dimensionsOpen = !this.solution.dimensionsOpen;
  }

  dimensionsSummary(): string {
    const c = this.solution.driven();
    if (!c) return '';
    return [c.r1, c.d, c.r2, c.g].map((v) => this.plain(v)).join(' · ') + ' ' + this.lengthUnit;
  }

  dimensionRows(): { label: string; value: string }[] {
    const c = this.solution.driven();
    if (!c) return [];
    // Every bar named by the pins at its ends, and every one of those letters
    // drawn on the linkage beside it. Two of these named their pins and two
    // did not, so half the list pointed at something on the grid and half
    // asked the reader to work out which bar was meant.
    // Named by the letters actually drawn beside those pins. Driving from the
    // far pin reads the same linkage from the other end, and naming the bars
    // after the fields rather than the pins renamed all four of them.
    const e = this.solution.previewLetters(c);
    const rows = [
      { label: `Crank ${e.A}–${e.B}`, value: this.lengthText(c.r1) },
      { label: `Coupler ${e.B}–${e.C}`, value: this.lengthText(c.d) },
      { label: `Rocker ${e.C}–${e.D}`, value: this.lengthText(c.r2) },
      { label: `Ground ${e.A}–${e.D}`, value: this.lengthText(c.g) },
      {
        label: 'Coupler pinned',
        value: describeCouplerPins(c, this.design.length, this.lengthUnit),
      },
    ];
    const dyad = this.solution.dyad();
    if (dyad) {
      rows.push({ label: `Driver crank ${e.E}–${e.F}`, value: this.lengthText(dyad.crankLength) });
      rows.push({
        label: `Driver coupler ${e.F}–${e.B}`,
        value: this.lengthText(dyad.couplerLength),
      });
    }
    return rows;
  }

  // --- previewing the motion -----------------------------------------------

  private direction = 1;

  togglePlay(): void {
    this.solution.playing = !this.solution.playing;
    if (this.solution.playing) this.step();
  }

  flipDirection(): void {
    this.solution.clockwise = !this.solution.clockwise;
  }

  /**
   * Walk the preview forward one frame.
   *
   * A linkage that turns fully wraps around; one that rocks reverses at the
   * ends of its travel, which is what the machine itself would do.
   */
  private step = (): void => {
    this.frame = undefined;
    if (!this.solution.playing) return;
    const cand = this.solution.driven();
    if (!cand) return;
    const range = this.solution.drivenRange();
    const stride = 1.4 * (this.solution.clockwise ? 1 : -1);
    let phase = this.solution.currentPhase() + this.direction * stride;
    if (range.full) {
      if (phase > range.to) phase -= 360;
      if (phase < range.from) phase += 360;
    } else if (phase > range.to || phase < range.from) {
      this.direction = -this.direction;
      phase = Math.max(range.from, Math.min(range.to, phase));
    }
    this.solution.phase = phase;
    this.solution.changed.next();
    this.frame = requestAnimationFrame(this.step);
  };

  scrubMin(): number {
    return Math.round(this.solution.drivenRange().from);
  }

  scrubMax(): number {
    return Math.round(this.solution.drivenRange().to);
  }

  scrubValue(): number {
    return Math.round(this.solution.currentPhase());
  }

  setScrub(event: Event): void {
    this.solution.setPhase(Number((event.target as HTMLInputElement).value));
  }

  alongPercent(): string {
    const cand = this.solution.driven();
    if (!cand) return '0%';
    const range = this.solution.drivenRange();
    const span = Math.max(1e-6, range.to - range.from);
    return (((this.solution.currentPhase() - range.from) / span) * 100).toFixed(1) + '%';
  }

  /** Where each position falls along the crank's travel, for the track marks. */
  poseTicks(): { percent: string; reached: boolean }[] {
    const cand = this.solution.driven();
    if (!cand) return [];
    const range = this.solution.drivenRange();
    const span = Math.max(1e-6, range.to - range.from);
    // Along whatever is being turned: with a driver fitted the track is the
    // driver crank's own revolution, so the marks have to be where the
    // positions fall on *that*, not on the four-bar's angle.
    return this.solution.positionPhases().map((phase, i) => {
      let a = phase ?? range.from;
      while (a < range.from) a += 360;
      while (a > range.to) a -= 360;
      const percent = Math.max(0, Math.min(100, ((a - range.from) / span) * 100));
      return { percent: percent.toFixed(1), reached: cand.onBranch[i] };
    });
  }

  angleLabel(): string {
    const phase = this.solution.currentPhase();
    return Math.round(((phase % 360) + 360) % 360) + '°';
  }

  previewNote(): string {
    const cand = this.solution.driven();
    if (!cand) return '';
    const range = this.solution.drivenRange();
    // Which crank is turning, because with a driver fitted it is not the
    // four-bar's: naming it "crank rotation" beside a six-bar left the reader
    // to guess which of the two the transport was scrubbing.
    const crank = this.solution.dyad() ? 'driver crank' : 'crank';
    return range.full
      ? `full ${crank} rotation`
      : `${crank} rocks through ${Math.round(range.to - range.from)}°`;
  }

  // --- committing ----------------------------------------------------------

  /**
   * Insert is offered whenever there is a solution to insert.
   *
   * It used to switch off once something had been inserted, which made the
   * mode a one-shot: the whole point of comparing seven linkages is to try one,
   * look at it, and try the next. Inserting again revises the machine this
   * design already put on the grid rather than adding another.
   */
  get canInsert(): boolean {
    return this.hasSolution;
  }

  get insertLabel(): string {
    if (!this.solution.inserted) return 'Insert into grid';
    return this.solutionIsOnGrid ? 'Inserted into grid' : 'Replace on grid';
  }

  /** Whether what is on the grid is the solution now being looked at. */
  get solutionIsOnGrid(): boolean {
    return this.solution.inserted && !this.solution.needsReinsert();
  }

  /**
   * Wind the preview back to where the linkage starts, then do something.
   *
   * The preview can be parked anywhere in its cycle, and what gets built is
   * always the start pose -- so committing from halfway round replaced the
   * linkage on screen with a differently-posed one between two frames, which
   * reads as a jump rather than as the thing being put down. It goes home
   * first, at the same 220ms the app eases everything else home at.
   */
  private windBackThen(then: () => void): void {
    const cand = this.solution.driven();
    const home = this.solution.startPhase();
    if (!cand || this.solution.phase === null || Math.abs(this.solution.phase - home) < 0.5) {
      this.solution.phase = null;
      then();
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.solution.phase = null;
      then();
      return;
    }
    this.solution.playing = false;
    const from = this.solution.phase;
    /*
      The short way round.

      On a crank that turns fully, home can be a degree ahead and three hundred
      and fifty-nine behind, and interpolating the raw numbers took the long
      way: pressing Insert near the end of the cycle spun the linkage almost a
      whole revolution backwards to get somewhere it was nearly at. The app's
      own easeToStart picks the shorter direction for the same reason.
    */
    let delta = home - from;
    if (this.solution.drivenRange().full) {
      // Into (-180, 180]: at exactly half a turn both ways are the same length,
      // and forwards is the one that matches which way the crank was going.
      while (delta > 180) delta -= 360;
      while (delta <= -180) delta += 360;
    }
    const started = performance.now();
    const DURATION = 220;
    const step = () => {
      // The panel can be left while this is running -- and was: a press, a
      // switch to Edit, and the commit landed afterwards, onto a drawing the
      // reader had moved on from.
      if (!this.windingBack) return;
      const t = Math.min(1, (performance.now() - started) / DURATION);
      // Ease out, so it settles rather than stopping dead.
      const eased = 1 - (1 - t) * (1 - t);
      this.solution.phase = from + delta * eased;
      this.solution.changed.next();
      if (t < 1) {
        this.windBackFrame = requestAnimationFrame(step);
        return;
      }
      this.windingBack = false;
      this.windBackFrame = undefined;
      this.solution.phase = null;
      then();
    };
    this.windingBack = true;
    this.windBackFrame = requestAnimationFrame(step);
  }

  /** Whether this panel has been left, so nothing deferred acts on it. */
  private gone = false;

  /** Whether a wind-back is running, so a second press cannot start another. */
  private windingBack = false;
  private windBackFrame: number | undefined;

  /**
   * What is about to be built, as one string.
   *
   * Insert defers by 220ms to wind the preview home, and used to work out what
   * to build only once it got there -- so choosing a different card during
   * those 220ms built that one instead, from a press that was aimed at the one
   * before it. Nothing else on the panel takes that long to act, so there is
   * no reason for the reader to expect the press to still be in flight.
   */
  private commitKey(): string {
    return [
      this.solution.chosen()?.key ?? '',
      this.solution.driveOnFarPin,
      !!this.solution.dyad(),
      this.design.searchKey(),
    ].join('|');
  }

  insert(force = false): void {
    // One commit per press. Each press used to start its own wind-back, so a
    // double-press committed twice -- rebuilding the linkage, and writing two
    // entries into the history for one intention.
    if (this.windingBack) return;
    // Only the first press winds back; the retries from the warning below are
    // already home.
    if (!force && this.solution.phase !== null) {
      const pressedOn = this.commitKey();
      this.windBackThen(() => {
        // Changing the choice mid-flight cancels the press rather than
        // redirecting it: the reader has just said they want to look at
        // something else, and building either one from here would be building
        // something they did not ask for.
        if (this.commitKey() !== pressedOn) return;
        this.insert(force);
      });
      return;
    }
    const outcome = this.solution.insert(force);
    if (outcome === 'edited') {
      // Not a refusal and not a silent overwrite. The reader moved those joints
      // by hand, and only they know whether that work still matters -- so the
      // two things they could mean are on the message.
      this.notify.warning(
        REPLACE_WARNING,
        `${this.solutionName} would replace the linkage on the grid, and it has been moved by ` +
          `hand since Synthesis put it there. Those changes would be lost.`,
        {
          // Guarded as well as dismissed on the way out. The message outlives
          // the press that raised it by design -- it waits to be answered --
          // but its answers act on this panel, and a panel that has been left
          // is not one to act on.
          actions: [
            { label: 'Replace it', run: () => !this.gone && this.insert(true) },
            {
              label: 'Keep it, insert a new one',
              run: () => {
                if (this.gone) return;
                this.solution.releaseOwnership();
                this.insert();
              },
            },
          ],
        }
      );
      return;
    }
    // No `record()` here. Inserting rebuilds the mechanism through
    // `updateMechanism(true)`, and the `true` is a save -- so recording again
    // wrote two entries for one press, and one Undo left the linkage on the
    // grid because it only stepped back over the second of them.
  }

  undoInsert(): void {
    this.solution.undoInsert();
  }

  insertedNote(): string {
    const kind = this.solution.dyad() ? 'six-bar' : 'four-bar';
    return `Left on the grid as a ${kind}. Change a position and insert again to revise it.`;
  }

  deleteAll(): void {
    this.design.deleteAllPoses();
    this.design.regionDraw = false;
    this.design.setArmed(false);
    this.solution.reset();
    this.record();
  }

  /** Whether the preview would show anything, for the grid to ask as well. */
  hasPreview(): boolean {
    const cand = this.solution.driven();
    return !!cand && solveFourBar(cand, this.solution.currentPhase(), cand.sign) !== null;
  }
}
