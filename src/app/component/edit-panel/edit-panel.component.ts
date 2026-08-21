import { Subscription } from 'rxjs';
import {
  AfterContentInit,
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  effect,
  inject,
} from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { PrisJoint, RealJoint, RevJoint } from 'src/app/model/joint';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { Coord } from 'src/app/model/coord';
import {
  AngleUnit,
  AngularVelocityUnit,
  ForceUnit,
  getDistance,
  getNewOtherJointPos,
  InertiaUnit,
  LengthUnit,
  MassUnit,
} from 'src/app/model/utils';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { Link, RealLink } from '../../model/link';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { MODEL_SCALE } from '../../model/render-scale';
import { SubtitleComponent } from '../BLOCKS/subtitle/subtitle.component';
import { StateInputComponent } from '../BLOCKS/state-input/state-input.component';
import { uniformBodyOf } from '../../model/uniform-body';
import {
  cylinderSpanLayoutFrom,
  cylinderSpanRange,
  Cylinder,
  MIN_STROKE_R,
  cylinderMinimumSpan,
  cylinderSizeOf,
} from '../../model/cylinder';
import { NotificationService } from 'src/app/services/notification.service';
import { BackgroundImageService, MIN_WIDTH } from 'src/app/services/background-image.service';
import { NOT_A } from 'src/app/ui-text';
import { PanelSectionCollapsibleComponent } from '../BLOCKS/panel-section-collapsible/panel-section-collapsible.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { MatIcon } from '@angular/material/icon';
import { TutorialService } from '../../services/tutorial.service';
import { MechanismPanelComponent } from '../mechanism-panel/mechanism-panel.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { EditableTitleComponent } from '../BLOCKS/editable-title/editable-title.component';
import { CollapsibleSubsecitonComponent } from '../BLOCKS/collapsible-subseciton/collapsible-subseciton.component';
import { DualInputComponent } from '../BLOCKS/dual-input/dual-input.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ColorPickerComponent } from '../BLOCKS/color-picker/color-picker.component';
import { DualButtonComponent } from '../BLOCKS/dual-button/dual-button.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';

/**
 * Input Settings unit choices, in the order the picker shows them. The labels
 * match how the unit parser prints these units everywhere else in the app.
 */
const INPUT_SPEED_UNITS = [
  { unit: AngularVelocityUnit.RPM, label: 'RPM' },
  { unit: AngularVelocityUnit.DEG_PER_SEC, label: 'deg/s' },
  { unit: AngularVelocityUnit.RAD_PER_SEC, label: 'rad/s' },
];

@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    PanelSectionCollapsibleComponent,
    TitleBlock,
    MatIcon,
    SubtitleComponent,
    StateInputComponent,
    MechanismPanelComponent,
    PanelSectionComponent,
    EditableTitleComponent,
    CollapsibleSubsecitonComponent,
    DualInputComponent,
    FormsModule,
    ReactiveFormsModule,
    ToggleComponent,
    ButtonComponent,
    InputComponent,
    ColorPickerComponent,
    DualButtonComponent,
    RadioComponent,
  ],
})
export class EditPanelComponent implements OnInit, AfterContentInit, OnDestroy {
  activeSrv = inject(ActiveObjService);
  protected settingsService = inject(SettingsService);
  private fb = inject(FormBuilder);
  private nup = inject(NumberUnitParserService);
  mechanismService = inject(MechanismService);
  gridUtils = inject(GridUtilsService);
  bgImage = inject(BackgroundImageService);
  private notify = inject(NotificationService);
  tutorial = inject(TutorialService);

  listOfOtherJoints: RealJoint[] = [];
  private currentlyOpenJointID: string = '';

  //A dictionary for whether each collapsible section is expanded or not
  sectionExpanded: { [key: string]: boolean } = {
    JBasic: true, //This is the default (starting) state
    JInput: true, //Expanded on arrival, so a new input's settings are visible
    // Open on arrival, like the link's own mass section: it is only there at
    // all for a slider, so a reader who has one has come to a joint that
    // weighs something.
    JMass: true,
    JVisual: false,
    JDistToJ: true,
    LBasic: true,
    LVisual: false,
    LMass: true,
    LCompound: true,
    FBasic: true,
    FVisual: false,
    BGPlace: true,
  };

  /**
   * A massless link has no inertia and no centre of mass to speak of.
   *
   * Those three fields describe how a mass is distributed, so with no mass
   * they describe nothing -- and a force analysis run off numbers nobody chose
   * reports an answer that looks meant. Angular's own disable is what greys
   * them, so the value stays and comes back the moment a mass does.
   */
  private syncMassDependents(): void {
    const massless = !(this.activeSrv.selectedLink?.mass > 0);
    const dependents = [
      this.linkForm.controls.massMoI,
      this.linkForm.controls.comX,
      this.linkForm.controls.comY,
    ];
    for (const control of dependents) {
      if (!control) continue;
      if (massless && control.enabled) control.disable({ emitEvent: false });
      if (!massless && control.disabled) control.enable({ emitEvent: false });
    }
  }

  /** Nothing drawn yet, so nothing to select and nothing to drag. */
  gridIsEmpty(): boolean {
    return this.mechanismService.joints.length === 0 && this.mechanismService.links.length === 0;
  }

  hideEditPanel() {
    return this.mechanismService.isPlaying || this.mechanismService.mechanismTimeStep !== 0;
  }

  /** Unit choices for the Input Speed field's inline picker. */
  readonly speedUnitOptions = INPUT_SPEED_UNITS.map((option, index) => ({
    value: index.toString(),
    label: option.label,
  }));

  /** The joint whose drive this panel is editing, if it is editing one. */
  private get drivenJoint(): RealJoint | undefined {
    const joint = this.activeSrv.selectedJoint;
    return joint && joint.input ? joint : undefined;
  }

  /** One button for both directions: flip rather than pick. */
  flipInputDirection(): void {
    const joint = this.drivenJoint;
    if (joint) {
      // This mechanism's drive, not the document's. A drawing can hold several
      // and turning one round must leave the others turning as they were.
      this.mechanismService.setDriveSpeed(joint, -this.mechanismService.driveSpeedOf(joint));
    } else {
      this.settingsService.isInputCW.next(!this.settingsService.isInputCW.value);
    }
    this.mechanismService.updateMechanism(true);
  }

  /**
   * Show the stored speed in whichever unit the picker is set to.
   *
   * A slider input reads a different setting, not the same one in another unit:
   * `linearInputSpeed` is length per second and is shown exactly as stored,
   * where the rotational speed is kept in RPM and converted for display.
   */
  private patchInputSpeedField(): void {
    const own = Math.abs(this.mechanismService.driveSpeedOf(this.drivenJoint));
    const shown = this.isSliderInput
      ? own
      : this.nup.convertAngularVelocity(
          own,
          AngularVelocityUnit.RPM,
          this.settingsService.inputSpeedUnit.value
        );
    this.jointForm.patchValue(
      { inputSpeed: Number(shown.toFixed(2)).toString() },
      { emitEvent: false }
    );
  }

  /** Mirror the current input speed and unit into the Input Settings fields. */
  private syncInputSettingsFields(): void {
    const unitIndex = this.isSliderInput
      ? 0
      : INPUT_SPEED_UNITS.findIndex(
          (option) => option.unit === this.settingsService.inputSpeedUnit.value
        );
    this.jointForm.patchValue(
      { inputSpeedUnit: (unitIndex < 0 ? 0 : unitIndex).toString() },
      { emitEvent: false }
    );
    this.patchInputSpeedField();
  }

  constructor() {
    //Set the instance to this
    EditPanelComponent.instance = this;
    // The picture can now be moved and resized on the canvas as well as typed
    // at, so the fields follow it rather than only leading it. Patched without
    // emitting, so mirroring a drag cannot loop back into a commit.
    effect(() => {
      this.bgImage.image();
      this.patchBackgroundImageForm();
    });
  }

  //Instance of this
  static instance: EditPanelComponent;

  //maintain a list of subcriptions to unsubscribe later
  onDestroySubscriptions: Subscription[] = [];
  //dynamic form array subscriptions
  otherJoitnsSubscriptions: Subscription[] = [];
  /**
   * The pending re-enable pass scheduled by a selection change. It has to be
   * cancellable: the pass asks the mechanism what the joint may do, and a
   * timer that fires after the component is gone reaches an injector that no
   * longer exists.
   */
  private pendingFieldSync?: ReturnType<typeof setTimeout>;

  ngOnDestroy() {
    this.onDestroySubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.otherJoitnsSubscriptions.forEach((subscription) => subscription.unsubscribe());
    if (this.pendingFieldSync !== undefined) clearTimeout(this.pendingFieldSync);
  }

  lengthUnit: LengthUnit = this.settingsService.lengthUnit.value;
  angleUnit: AngleUnit = this.settingsService.angleUnit.value;
  forceUnit: ForceUnit = this.settingsService.forceUnit.value;
  // torqueUnit: TorqueUnit = this.settingsService.inputTorque.value;
  jointForm = this.fb.group(
    {
      xPos: [''],
      yPos: [''],
      prisAngle: [''],
      ground: [false, { updateOn: 'change' }],
      input: [false, { updateOn: 'change' }],
      slider: [false, { updateOn: 'change' }],
      // Weld is a toggle rather than the Weld/Unweld button pair it replaces:
      // it is one axis of the 2x2 (§2.1), and a pair of buttons cannot show
      // which side of that axis the joint is currently on.
      weld: [false, { updateOn: 'change' }],
      curve: [false, { updateOn: 'change' }],
      // Input Settings. The unit picker commits on change; the speed field commits
      // on blur like every other numeric field. Direction is a button, not a control.
      inputSpeed: [''],
      inputSpeedUnit: ['0', { updateOn: 'change' }],
      // The sliding body's own mass. It lives on the block, which is a link
      // nobody can select -- clicking one picks the pin it rides on -- so
      // without a field here the only way to it was the mass table in the
      // force-analysis drawer.
      sliderMass: [''],
      otherJoints: this.fb.array([]), //Dynamic form array
    },
    { updateOn: 'blur' }
  );

  linkForm = this.fb.group(
    {
      length: [''],
      angle: [''],
      mass: [''],
      massMoI: [''],
      comX: [''],
      comY: [''],
    },
    { updateOn: 'blur' }
  );
  /**
   * A cylinder is one size number and one position number, so the panel offers
   * exactly those two — plus the axis, which is where the part points rather
   * than anything about the ram.
   *
   * Both carry a unit picker instead of a second field, because stroke, closed
   * and open are three ways of saying one number and % and a length are two
   * ways of saying one position. Changing the picker re-expresses the value; it
   * never alters the part. That is the same contract the repo's Input Speed
   * field already has, which is why it is the same control.
   *
   * The pickers commit on change and the numbers on blur, as everywhere else.
   */
  cylinderForm = this.fb.group(
    {
      travel: [''],
      travelUnit: ['stroke', { updateOn: 'change' }],
      start: [''],
      startUnit: ['pct', { updateOn: 'change' }],
      angle: [''],
      barrelMass: [''],
      rodMass: [''],
      headMass: [''],
    },
    { updateOn: 'blur' }
  );

  /**
   * Stroke, closed and open: one ram said three ways.
   *
   * "closed" and "open" rather than "retracted" and "extended" because the
   * picker shares the field's fill with the number, and the longer words do not
   * fit beside one.
   */
  readonly travelUnitOptions = [
    { value: 'stroke', label: 'stroke' },
    { value: 'ret', label: 'closed' },
    { value: 'ext', label: 'open' },
  ];

  /** Where in its travel the ram starts: a share of the stroke, or a length. */
  get startUnitOptions() {
    return [
      { value: 'pct', label: '%' },
      { value: 'len', label: this.nup.unitLabel(this.settingsService.lengthUnit.getValue()) },
    ];
  }
  /**
   * Where the tracing underlay sits and how solid it is drawn.
   *
   * Position and width are lengths in the panel's own unit; opacity is a plain
   * percentage, because there is no unit for "how far you can see through it".
   */
  backgroundImageForm = this.fb.group(
    {
      centerX: [''],
      centerY: [''],
      width: [''],
      rotation: [''],
      opacity: [''],
    },
    { updateOn: 'blur' }
  );

  forceForm = this.fb.group(
    {
      magnitude: [''],
      angle: [''],
      xComp: [''],
      yComp: [''],
      isGlobal: ['0', { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  get otherJoints() {
    return this.jointForm.get('otherJoints') as FormArray;
  }

  debug() {
    this.mechanismService.animate(5, false);
    this.mechanismService.mechanismTimeStep = 0;
    this.mechanismService.updateMechanism();
  }

  ngOnInit(): void {
    this.onChanges();
    this.disableAndEnableJointFields();
  }

  ngAfterContentInit() {
    this.activeSrv.fakeUpdateSelectedObj();
  }

  mouseDown(): void {
    console.log('test');
  }

  /**
   * Ground is no longer disabled while Slider is on (§4.1).
   *
   * The two were coupled because toggleSlider only ever produced a grounded
   * slider and toggleGround dismantled one. They are independent axes now, so
   * coupling their controls would make a reachable cell of the 2x2 unreachable
   * -- which is the gate condition this phase has to meet.
   *
   * The angle field belongs to a grounded guide alone: a floating slot's
   * direction is the line through two of its carrier's joints, so there is no
   * number to type and no frame to type it in.
   */
  disableAndEnableJointFields(): void {
    const wantsAngle = this.isGroundedSlider;
    //This is such a werid bug, the only way to update the visual of the input to be enabled is to emit the event
    //But emitting the event causes the update to be called, which calls this function, which causes an infinite loop
    //So we have to only call the enable on change
    if (wantsAngle && this.jointForm.get('prisAngle')?.disabled) {
      this.jointForm.get('prisAngle')?.enable({ emitEvent: true });
    }
    if (!wantsAngle && this.jointForm.get('prisAngle')?.enabled) {
      this.jointForm.get('prisAngle')?.disable({ emitEvent: true });
    }
    if (this.jointForm.get('ground')?.disabled) {
      this.jointForm.get('ground')?.enable({ emitEvent: true });
    }

    // Weld is greyed when the joint connects fewer than two links — there is
    // nothing to fuse, so offering the switch only to refuse it reads as a
    // broken control. Silently (emitEvent: false), because the weld control's
    // valueChanges runs the weld itself and an enable/disable must never do
    // that. Same rule as the context menu, through the same predicate.
    const canWeld = this.gridUtils.canToggleWeld(this.activeSrv.selectedJoint);
    const weldControl = this.jointForm.get('weld');
    if (canWeld && weldControl?.disabled) weldControl.enable({ emitEvent: false });
    if (!canWeld && weldControl?.enabled) weldControl.disable({ emitEvent: false });

    // A cylinder's mount can never gain a block of its own: the slider is the
    // sealed part itself (§ cylinder 4). Same silent enable/disable rule as
    // Weld, and the same predicate the context menu greys its item with.
    const sealedMount = this.isCylinderMount;
    const sliderControl = this.jointForm.get('slider');
    if (!sealedMount && sliderControl?.disabled) sliderControl.enable({ emitEvent: false });
    if (sealedMount && sliderControl?.enabled) sliderControl.disable({ emitEvent: false });

    this.syncLockDisabledFields();
  }

  /**
   * The fields that move geometry go quiet while a Lock holds it — the same
   * statement the canvas makes by refusing the drag, made in the panel's own
   * language. Everything else (ground, weld, mass, colour, rename) stays
   * live: a lock pins position, it does not embalm the object.
   */
  private syncLockDisabledFields(): void {
    const setEnabled = (control: AbstractControl | null, on: boolean) => {
      if (!control) return;
      if (on && control.disabled) control.enable({ emitEvent: false });
      if (!on && control.enabled) control.disable({ emitEvent: false });
    };
    if (this.activeSrv.objType === 'Joint' && this.activeSrv.selectedJoint) {
      const frozenIds = this.gridUtils.frozenJointIds();
      const held = frozenIds.has(this.activeSrv.selectedJoint.id);
      setEnabled(this.jointForm.get('xPos'), !held);
      setEnabled(this.jointForm.get('yPos'), !held);
      // The guide's direction is part of what a lock on a slider holds; only
      // the held case is written, because the grounded-guide rule above owns
      // the enabled side.
      if (held) setEnabled(this.jointForm.get('prisAngle'), false);
      // Per row, by the joint the row would MOVE. A distance field
      // repositions the *other* joint, so a held selected joint may still
      // edit its distances — and a free selected joint must not be a back
      // door for moving a held neighbour.
      this.listOfOtherJoints.forEach((other, i) => {
        const otherHeld = frozenIds.has(other.id);
        setEnabled(this.otherJoints.controls[i * 2] ?? null, !otherHeld);
        setEnabled(this.otherJoints.controls[i * 2 + 1] ?? null, !otherHeld);
      });
    } else if (this.activeSrv.objType === 'Link' && this.activeSrv.selectedLink) {
      const frozenIds = this.gridUtils.frozenJointIds();
      const sealed = this.mechanismService.cylinderAt(this.activeSrv.selectedLink);
      if (sealed) {
        // Travel, Starts-at and Axis all hold the barrel mount and move the
        // rest of the part, so a held barrel mount alone leaves them live.
        const movable = [sealed.rodFar, sealed.pin, sealed.slider, sealed.barrelNear].every(
          (joint) => !frozenIds.has(joint.id)
        );
        setEnabled(this.cylinderForm.get('travel'), movable);
        setEnabled(this.cylinderForm.get('start'), movable);
        setEnabled(this.cylinderForm.get('angle'), movable);
      } else {
        // On top of the >2-joint rule disableAndEnableLinkFields applies: a
        // length or angle edit moves the link's joints about an anchor of its
        // own choosing, which no held joint can be trusted to survive.
        const anyHeld = this.activeSrv.selectedLink.joints.some((joint) => frozenIds.has(joint.id));
        if (anyHeld) {
          setEnabled(this.linkForm.get('length'), false);
          setEnabled(this.linkForm.get('angle'), false);
        }
      }
    } else if (this.activeSrv.objType === 'Force' && this.activeSrv.selectedForce) {
      // Direction is what the drag handles edit, so the lock covers it;
      // magnitude is not a position and stays live.
      const held = this.activeSrv.selectedForce.locked;
      setEnabled(this.forceForm.get('angle'), !held);
      setEnabled(this.forceForm.get('xComp'), !held);
      setEnabled(this.forceForm.get('yComp'), !held);
    }
  }

  /** Whether the selected joint is a mount of a sealed cylinder. */
  get isCylinderMount(): boolean {
    return (
      this.activeSrv.objType === 'Joint' &&
      !!this.mechanismService.cylinderAt(this.activeSrv.selectedJoint)
    );
  }

  /** The sealed cylinder whose body (a member link) is selected, if any. */
  get selectedCylinder(): Cylinder | undefined {
    if (this.activeSrv.objType !== 'Link') return undefined;
    return this.mechanismService.cylinderAt(this.activeSrv.selectedLink);
  }

  /** The ram's own size and position, read back off its joints. */
  private cylinderSize(sealed: Cylinder) {
    return cylinderSizeOf(sealed, 0.15 * this.settingsService.objectScale);
  }

  /** Mount-to-mount length at each end of a ram of this stroke. */
  private cylinderEnds(stroke: number): { retracted: number; extended: number } {
    return cylinderSpanRange(stroke, 0.15 * this.settingsService.objectScale);
  }

  /** The Travel field's value, in whichever of its three spellings is selected. */
  cylinderTravelLabel(sealed: Cylinder): string {
    const { stroke } = this.cylinderSize(sealed);
    const unit = this.cylinderForm.controls['travelUnit'].value;
    const ends = this.cylinderEnds(stroke);
    const shown = unit === 'ret' ? ends.retracted : unit === 'ext' ? ends.extended : stroke;
    return this.nup.formatModelLength(shown, this.settingsService.lengthUnit.getValue());
  }

  /** The Starts-at field's value: a percentage of the stroke, or the length it puts the ram at. */
  cylinderStartLabel(sealed: Cylinder): string {
    const { start, span } = this.cylinderSize(sealed);
    if (this.cylinderForm.controls['startUnit'].value === 'pct') {
      // One decimal, not a whole number. Rounded to an integer the field said
      // 34 for a ram positioned at 33.7%, and on a long ram that gap is a real
      // distance -- the panel would be quietly disagreeing with the drawing.
      return `${Math.round(start * 1000) / 10}`;
    }
    return this.nup.formatModelLength(span, this.settingsService.lengthUnit.getValue());
  }

  /**
   * A ram parked at one end of its travel: 0 fully closed, 1 fully open.
   *
   * The bound is the panel's own resolution — *Starts at* shows one decimal, so
   * anything that reads 0.0% or 100.0% counts as parked. A tighter test would
   * leave the field saying 100.0 beside a control still offering both
   * directions, which is the disagreement this exists to prevent.
   */
  private cylinderTravelEnd(sealed: Cylinder): 0 | 1 | undefined {
    const { start } = this.cylinderSize(sealed);
    if (start < 5e-4) return 0;
    if (start > 1 - 5e-4) return 1;
    return undefined;
  }

  /**
   * A ram at a stop has one way to go, so its direction stops being a choice.
   *
   * Not a refusal — the control is greyed rather than left to be pressed and
   * silently undone. The solver already reverses a drive commanded past a stop
   * on its first sample, so pressing it changed nothing about the animation
   * while the label, the arrows and the Analyze text all claimed otherwise.
   */
  get cylinderDirectionForced(): boolean {
    const sealed = this.selectedCylinder;
    return !!sealed && !!sealed.slider.input && this.cylinderTravelEnd(sealed) !== undefined;
  }

  /** Point a driven ram the only way it can go, when its start leaves only one. */
  private syncCylinderDirection(sealed: Cylinder): void {
    if (!sealed.slider.input) return;
    const end = this.cylinderTravelEnd(sealed);
    if (end === undefined) return;
    const wantsRetract = end === 1;
    if (this.settingsService.isInputCW.value === wantsRetract) return;
    this.settingsService.isInputCW.next(wantsRetract);
    this.mechanismService.updateMechanism(false);
  }

  /** Set when the last edit had to be held at the ram's minimum, so the panel can say so. */
  cylinderClamped = '';

  /** Mount-to-mount axis angle, in the user's angle unit. */
  cylinderAngleLabel(sealed: Cylinder): string {
    const raw = Math.atan2(
      sealed.rodFar.y - sealed.barrelFar.y,
      sealed.rodFar.x - sealed.barrelFar.x
    );
    return this.nup.formatValueAndUnit(
      this.nup.convertAngle(raw, AngleUnit.RADIAN, this.settingsService.angleUnit.getValue()),
      this.settingsService.angleUnit.getValue()
    );
  }

  /**
   * Re-pose the selected cylinder to the given mount-to-mount span and axis
   * angle, anchored on the barrel mount. Routed through the same drag pipeline
   * as a canvas gesture, so the parametric layout keeps it collinear and every
   * downstream update fires the same way.
   */
  private reposeCylinder(span?: number, angleRad?: number): void {
    const sealed = this.selectedCylinder;
    if (!sealed) return;
    const a = sealed.barrelFar;
    const c = sealed.rodFar;
    const current = Math.atan2(c.y - a.y, c.x - a.x);
    const s = span ?? getDistance(a, c);
    const ang = angleRad ?? current;
    this.gridUtils.dragJoint(
      c as RealJoint,
      new Coord(a.x + s * Math.cos(ang), a.y + s * Math.sin(ang))
    );
    this.syncCylinderDirection(sealed);
    this.mechanismService.onMechUpdateState.next(2);
    // One committed edit, one undo step. A canvas drag saves on release and a
    // panel edit did not, so typing a ram's size and then pressing Undo took
    // back whatever the *previous* gesture was -- on a freshly opened template,
    // the template itself.
    this.mechanismService.save();
    this.patchCylinderForm();
  }

  /**
   * Write a size and a position to the ram, saying so when the minimum bit.
   *
   * The floor is the one failure a cylinder has left: barrel and rod cannot
   * disagree with the stroke any more, so an impossible ram can no longer be
   * described and there is nothing else to refuse.
   */
  private resizeCylinderTo(sealed: Cylinder, stroke: number, start: number): void {
    const floor = MIN_STROKE_R * 0.15 * this.settingsService.objectScale;
    const held = Math.max(stroke, floor);
    this.cylinderClamped =
      held !== stroke
        ? `Held at the shortest cylinder there is: any less and the barrel has no room to slide in.`
        : '';
    this.gridUtils.resizeCylinder(sealed, held, start);
    this.syncCylinderDirection(sealed);
    this.mechanismService.onMechUpdateState.next(2);
    // One committed edit, one undo step. A canvas drag saves on release and a
    // panel edit did not, so typing a ram's size and then pressing Undo took
    // back whatever the *previous* gesture was -- on a freshly opened template,
    // the template itself.
    this.mechanismService.save();
    this.patchCylinderForm();
  }

  /** Refresh the cylinder form's fields from the part, without re-firing them. */
  patchCylinderForm(): void {
    const sealed = this.selectedCylinder;
    if (!sealed) return;
    const massUnits = this.massUnit();
    this.cylinderForm.patchValue(
      {
        travel: this.cylinderTravelLabel(sealed),
        start: this.cylinderStartLabel(sealed),
        angle: this.cylinderAngleLabel(sealed),
        barrelMass: this.nup.formatValueAndUnit(sealed.barrel.mass, massUnits),
        rodMass: this.nup.formatValueAndUnit(sealed.rod.mass, massUnits),
        headMass: this.nup.formatValueAndUnit(sealed.block.mass, massUnits),
      },
      { emitEvent: false }
    );
  }

  /**
   * One handler for the three bodies a sealed cylinder weighs in as.
   *
   * The rod and head are welded rigid, but rigidity says how they move, not
   * where their mass sits: the rod's is spread along its length, the head's
   * is concentrated at the pin — which is the number that matters in a
   * reciprocating machine. The solver already carries all three bodies, so
   * these fields are the first door to numbers that were always there.
   */
  private cylinderMassEdit(
    control: 'barrelMass' | 'rodMass' | 'headMass',
    part: (sealed: NonNullable<EditPanelComponent['selectedCylinder']>) => Link,
    raw: string | null
  ): void {
    const sealed = this.selectedCylinder;
    if (!sealed) return;
    const units = this.massUnit();
    const body = part(sealed);
    const [success, value] = this.nup.parseMassString(raw ?? '', units);
    if (!success || value < 0) {
      this.notify.refusal('value.mass', NOT_A.mass);
      this.cylinderForm.patchValue(
        { [control]: this.nup.formatValueAndUnit(body.mass, units) },
        { emitEvent: false }
      );
      return;
    }
    // Through the one door: a mount weld can fold the barrel or rod into a
    // compound, and the aggregate has to keep telling the same story.
    this.mechanismService.assignBodyMass(body, value);
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.cylinderForm.patchValue(
      { [control]: this.nup.formatValueAndUnit(value, units) },
      { emitEvent: false }
    );
  }

  /** Whether either visible cylinder body still carries typed inertia values. */
  cylinderHasCustomInertia(): boolean {
    const sealed = this.selectedCylinder;
    if (!sealed) return false;
    return [sealed.barrel, sealed.rod].some(
      (part) => part instanceof RealLink && (part.moiIsCustom || part.comIsCustom)
    );
  }

  /**
   * Hand every part of the cylinder back to the uniform body.
   *
   * Template cylinders arrive from legacy URLs with frozen custom values and
   * no other door to them: the cylinder panel replaces the link panel, so the
   * per-field Derive buttons are unreachable for these bodies.
   */
  deriveCylinderInertiaFromShape(): void {
    const sealed = this.selectedCylinder;
    if (!sealed) return;
    for (const part of [sealed.barrel, sealed.rod]) {
      if (part instanceof RealLink) {
        part.moiIsCustom = false;
        part.comIsCustom = false;
      }
    }
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.patchCylinderForm();
  }

  /** Drive (or stop driving) the selected cylinder's hidden prismatic pin. */
  toggleCylinderInput(): void {
    const sealed = this.selectedCylinder;
    if (!sealed) return;
    this.mechanismService.toggleCylinderInput(sealed);
    this.syncInputSettingsFields();
  }

  /** The selected joint's slider, whichever end of the pair is selected. */
  get selectedSlider(): PrisJoint | undefined {
    const joint = this.activeSrv.selectedJoint;
    if (joint instanceof PrisJoint) return joint;
    const slider = this.gridUtils.getSliderJoint(joint);
    return slider instanceof PrisJoint ? slider : undefined;
  }

  get isGroundedSlider(): boolean {
    return this.selectedSlider?.ground === true;
  }

  /**
   * The sliding body of the selected joint's slider, where it has one.
   *
   * Not a cylinder's: a ram's three bodies have their own fields further down
   * this panel, and its piston head is one of them.
   */
  get sliderBlock(): Link | undefined {
    if (this.selectedCylinder) return undefined;
    return this.mechanismService.slotReactionOf(this.activeSrv.selectedJoint)?.block;
  }

  /**
   * Write a mass to the sliding body.
   *
   * The same door every other mass goes through, so a slider's weight reaches
   * the solver the way a bar's does: it is what gravity pulls on and what the
   * guide has to take, and in an in-motion analysis it is the reciprocating
   * mass -- on a slider-crank it moves the input torque further than either
   * bar's does.
   */
  private commitSliderMass(raw: string | null): void {
    const block = this.sliderBlock;
    if (!block) return;
    const units = this.massUnit();
    const [success, value] = this.nup.parseMassString(raw ?? '', units);
    if (!success || value < 0) {
      this.notify.refusal('value.mass', NOT_A.mass);
      this.patchSliderMass();
      return;
    }
    this.mechanismService.assignBodyMass(block, value);
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.patchSliderMass();
  }

  /** Mirror the sliding body's mass into the field, without re-firing it. */
  patchSliderMass(): void {
    const block = this.sliderBlock;
    if (!block) return;
    this.jointForm.patchValue(
      { sliderMass: this.nup.formatValueAndUnit(block.mass, this.massUnit()) },
      { emitEvent: false }
    );
  }

  /**
   * Whether the drive on this joint is a translation rather than a rotation.
   *
   * Everything the Input Settings section says changes with the answer. A block
   * on a slot does not turn clockwise, and it does not have an RPM: the panel
   * was offering both, and the value in the box was not reaching the solver at
   * all, so a slider input always ran at one fixed speed however it was set.
   */
  get isSliderInput(): boolean {
    // A cylinder body's drive is the hidden prismatic pin, so its speed is a
    // translation too — same unit, same field, same machinery.
    if (this.selectedCylinder) return true;
    return this.activeSrv.objType === 'Joint' && this.selectedSlider !== undefined;
  }

  /** Length per second, in whatever length unit the mechanism is drawn in. */
  get linearSpeedUnitOptions(): { value: string; label: string }[] {
    return [{ value: '0', label: this.linearSpeedUnitLabel }];
  }

  /** Whichever force unit the mechanism is currently in — N or lbf, not both. */
  get forceUnitLabel(): string {
    return this.nup.unitLabel(this.settingsService.forceUnit.value);
  }

  /** A translation's speed has exactly one unit — shown as plain text, no picker. */
  get linearSpeedUnitLabel(): string {
    const unit = this.settingsService.lengthUnit.value;
    return unit === LengthUnit.INCH ? 'in/s' : unit === LengthUnit.METER ? 'm/s' : 'cm/s';
  }

  /** The barrel as the RealLink the colour picker paints; the rod follows it. */
  cylinderBodyLink(sealed: Cylinder): RealLink {
    return sealed.barrel as RealLink;
  }

  /**
   * Which way the drive sets off, said in the terms that drive has (§5.5).
   *
   * A cylinder extends or retracts — it is the one part whose two directions
   * have names an engineer already uses. A bare block on a slot has no such
   * pair, so it is named for the slot rather than for the screen: the slot's
   * own angle is shown right above this, and "forward" means along it whichever
   * way it happens to point.
   */
  get inputDirectionLabel(): string {
    if (this.selectedCylinder) {
      return this.settingsService.isInputCW.value ? 'Retracting' : 'Extending';
    }
    if (!this.isSliderInput) {
      return this.settingsService.isInputCW.value ? 'Clockwise' : 'Counter-Clockwise';
    }
    return this.settingsService.isInputCW.value ? 'Backward along slot' : 'Forward along slot';
  }

  get inputDirectionIcon(): string {
    if (!this.isSliderInput) {
      return this.settingsService.isInputCW.value ? 'rotate_right' : 'rotate_left';
    }
    return this.settingsService.isInputCW.value ? 'arrow_back' : 'arrow_forward';
  }

  /** A slider with a block and nowhere to slide: invalid until it gets a carrier. */
  get isDanglingSlider(): boolean {
    return this.selectedSlider?.isDangling === true;
  }

  disableAndEnableLinkFields(): void {
    if (this.activeSrv.selectedLink) {
      if (this.activeSrv.selectedLink.joints.length > 2) {
        this.linkForm.get('angle')?.disable({ emitEvent: false });
        this.linkForm.get('length')?.disable({ emitEvent: false });
      } else {
        this.linkForm.get('angle')?.enable({ emitEvent: false });
        this.linkForm.get('length')?.enable({ emitEvent: false });
      }
    }
  }

  onChanges(): void {
    this.onDestroySubscriptions.push(
      this.settingsService.angleUnit.subscribe((val) => {
        this.activeSrv.fakeUpdateSelectedObj();
      })
    );

    this.onDestroySubscriptions.push(
      this.activeSrv.onActiveObjChange.subscribe((val) => {
        this.disableAndEnableLinkFields();
        clearTimeout(this.pendingFieldSync);
        this.pendingFieldSync = setTimeout(() => {
          this.pendingFieldSync = undefined;
          this.disableAndEnableJointFields();
        });
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['sliderMass'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) return;
        this.commitSliderMass(val ?? '');
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) return;
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.length', NOT_A.length);
          this.jointForm.patchValue({
            xPos: this.nup.formatModelLength(
              this.activeSrv.selectedJoint.x,
              this.settingsService.lengthUnit.getValue()
            ),
          });
        } else {
          this.activeSrv.selectedJoint.x = value;
          this.gridUtils.dragJoint(
            this.activeSrv.selectedJoint,
            new Coord(this.activeSrv.selectedJoint.x, this.activeSrv.selectedJoint.y)
          );
          this.jointForm.patchValue(
            {
              xPos: this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
            },
            { emitEvent: false }
          );
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) return;
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.length', NOT_A.length);
          this.jointForm.patchValue({
            yPos: this.nup.formatModelLength(
              this.activeSrv.selectedJoint.y,
              this.settingsService.lengthUnit.getValue()
            ),
          });
        } else {
          this.activeSrv.selectedJoint.y = value;
          this.gridUtils.dragJoint(
            this.activeSrv.selectedJoint,
            new Coord(this.activeSrv.selectedJoint.x, this.activeSrv.selectedJoint.y)
          );
          this.jointForm.patchValue(
            {
              yPos: this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
            },
            { emitEvent: false }
          );
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['prisAngle'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) return;
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        if (!this.activeSrv.selectedJoint) return;
        if (!this.gridUtils.isAttachedToSlider(this.activeSrv.selectedJoint)) return;
        if (!success) {
          this.notify.refusal('value.angle', NOT_A.angle);
          // Two things had to be true for this to recurse until the stack ran
          // out, and both were: the angle was read off the *pin*, which has no
          // angle_rad, so the field was restored to the string "NaN"; and the
          // restore emitted, so the handler ran again on its own unparseable
          // output. Neither is new -- both predate this branch -- but the angle
          // field is a Phase 4 surface now, so they are fixed here.
          this.jointForm.patchValue(
            {
              prisAngle: this.nup
                .convertAngle(
                  this.selectedSlider?.angle_rad ?? 0,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                )
                .toFixed(0)
                .toString(),
            },
            { emitEvent: false }
          );
        } else {
          (this.gridUtils.getSliderJoint(this.activeSrv.selectedJoint) as PrisJoint).angle_rad =
            this.nup.convertAngle(
              value,
              this.settingsService.angleUnit.getValue(),
              AngleUnit.RADIAN
            );
          this.jointForm.patchValue(
            {
              prisAngle: this.nup.formatValueAndUnit(
                value,
                this.settingsService.angleUnit.getValue()
              ),
            },
            { emitEvent: false }
          );
          this.mechanismService.updateMechanism();
          this.mechanismService.onMechUpdateState.next(2);
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['ground'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) {
          return;
        }
        // Through the service rather than straight onto the joint. A slider is
        // selected by its pin, and the pin's own ground flag is not the slot's
        // -- writing it here grounded the pin and left the guide floating, with
        // no reconcile and no undo entry. toggleGround resolves the pair.
        this.mechanismService.toggleGround();
        this.mechanismService.onMechUpdateState.next(2);
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['input'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) {
          return;
        }
        //  grounded joint is revolute
        if (this.activeSrv.selectedJoint.ground) {
          this.activeSrv.selectedJoint.input = val!;
        } else {
          // grounded joint is prismatic
          this.activeSrv.selectedJoint.connectedJoints.forEach((j) => {
            if (j instanceof PrisJoint) {
              j.input = val!;
            }
          });
        }
        this.mechanismService.updateMechanism();
        this.mechanismService.onMechUpdateState.next(2);
      })
    );

    // URL restore and undo rewrite the speed behind the panel's back; mirror it
    // back into the field so an open Input Settings section stays truthful. The
    // direction button reads its state directly, so it needs no subscription.
    this.onDestroySubscriptions.push(
      this.settingsService.inputSpeed.subscribe(() => this.syncInputSettingsFields())
    );
    this.onDestroySubscriptions.push(
      this.settingsService.linearInputSpeed.subscribe(() => this.syncInputSettingsFields())
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['inputSpeed'].valueChanges.subscribe((val) => {
        // The unit comes from the picker beside the field, never from the text, so
        // this reads as a plain number rather than going through the unit parser.
        const typed = Number(String(val ?? '').trim());
        // A rejected value changes nothing, so it must not mint an undo entry.
        if (Number.isFinite(typed) && typed !== 0) {
          const joint = this.drivenJoint;
          const magnitude = this.isSliderInput
            ? Math.abs(typed)
            : this.nup.convertAngularVelocity(
                Math.abs(typed),
                this.settingsService.inputSpeedUnit.value,
                AngularVelocityUnit.RPM
              );
          // The field carries magnitude; a minus sign reads as "the other way",
          // so -20 becomes 20 with the direction flipped.
          const wasClockwise = this.mechanismService.driveSpeedOf(joint) < 0;
          const clockwise = typed < 0 ? !wasClockwise : wasClockwise;
          if (joint) {
            this.mechanismService.setDriveSpeed(joint, clockwise ? -magnitude : magnitude);
          } else if (this.isSliderInput) {
            this.settingsService.linearInputSpeed.next(magnitude);
            this.settingsService.isInputCW.next(clockwise);
          } else {
            this.settingsService.inputSpeed.next(magnitude);
            this.settingsService.isInputCW.next(clockwise);
          }
          this.mechanismService.updateMechanism(true);
        }
        this.patchInputSpeedField();
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['inputSpeedUnit'].valueChanges.subscribe((val) => {
        // Changing the unit re-expresses the same speed; it does not alter it.
        this.settingsService.inputSpeedUnit.next(INPUT_SPEED_UNITS[Number(val)].unit);
        this.patchInputSpeedField();
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['slider'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) {
          return;
        }
        this.mechanismService.toggleSlider();
        this.mechanismService.updateMechanism();
        this.mechanismService.onMechUpdateState.next(2);
        this.disableAndEnableJointFields();
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['weld'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) {
          return;
        }
        // One axis, one control. Unwelding a Slide gives a Slot rather than a
        // pin, because the block is the other axis and this toggle never
        // touches it (§2.1).
        if (val) this.mechanismService.weldJoint();
        else this.mechanismService.unweldSelectedJoint();

        // A weld the model refuses -- a grounded joint, a driven one, a joint
        // with nothing to fuse -- would otherwise leave the switch sitting on
        // while the joint is not welded, which is a control lying about state.
        const actual = this.activeSrv.selectedJoint?.isWelded ?? false;
        if (actual !== val) {
          this.jointForm.patchValue({ weld: actual }, { emitEvent: false });
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['curve'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) {
          return;
        }
        this.gridUtils.toggleCurve(this.activeSrv.selectedJoint);
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['length'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.length', NOT_A.length);
          this.linkForm.patchValue({
            length: this.nup.formatModelLength(
              this.activeSrv.selectedLink.length,
              this.settingsService.lengthUnit.getValue()
            ),
          });
        } else {
          this.activeSrv.selectedLink.length = value;
          this.resolveNewLink();
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
          this.linkForm.patchValue(
            {
              length: this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['travel'].valueChanges.subscribe((val) => {
        const sealed = this.selectedCylinder;
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!sealed || !success) return this.patchCylinderForm();
        // Three spellings, one number. Whichever is typed sets the stroke and
        // nothing negotiates -- which is the whole of what holding barrel and
        // rod equal bought, and why there is no resolution table here.
        // Closed and open are spans, so they are inverted through the same span
        // rule a mount drag uses rather than by subtracting a constant: the body
        // length a span carries depends on the stroke it is carrying.
        const unit = this.cylinderForm.controls['travelUnit'].value;
        const r = 0.15 * this.settingsService.objectScale;
        const asked =
          unit === 'ret'
            ? cylinderSpanLayoutFrom(value, 0, r).stroke
            : unit === 'ext'
              ? cylinderSpanLayoutFrom(value, 1, r).stroke
              : value;
        this.resizeCylinderTo(sealed, asked, this.cylinderSize(sealed).start);
      })
    );

    // Re-expressing the value, never altering the part: the number in the field
    // changes because the unit did, and the ram does not move.
    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['travelUnit'].valueChanges.subscribe(() =>
        this.patchCylinderForm()
      )
    );
    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['startUnit'].valueChanges.subscribe(() => this.patchCylinderForm())
    );
    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['barrelMass'].valueChanges.subscribe((val) =>
        this.cylinderMassEdit('barrelMass', (sealed) => sealed.barrel, val)
      )
    );
    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['rodMass'].valueChanges.subscribe((val) =>
        this.cylinderMassEdit('rodMass', (sealed) => sealed.rod, val)
      )
    );
    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['headMass'].valueChanges.subscribe((val) =>
        this.cylinderMassEdit('headMass', (sealed) => sealed.block, val)
      )
    );

    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['start'].valueChanges.subscribe((val) => {
        const sealed = this.selectedCylinder;
        if (!sealed) return this.patchCylinderForm();
        if (this.cylinderForm.controls['startUnit'].value === 'pct') {
          // A blank field is not 0%. `Number('')` is zero, and choosing a
          // different unit blurs and commits the text first -- so emptying the
          // field and then changing the picker retracted the ram to its stop,
          // which is the picker moving the part it promises never to move.
          const typed = String(val ?? '')
            .replace('%', '')
            .trim();
          const asked = Number(typed);
          if (typed === '' || !Number.isFinite(asked)) return this.patchCylinderForm();
          const held = Math.min(Math.max(asked / 100, 0), 1);
          this.cylinderClamped =
            held !== asked / 100 ? `Start held at ${Math.round(held * 100)}%.` : '';
          this.resizeCylinderTo(sealed, this.cylinderSize(sealed).stroke, held);
          return;
        }
        // A typed length is the mount-to-mount span, which is exactly what a
        // drag of that mount asks for -- so it takes the same road, and outside
        // the ram's own travel it resizes it in the same way.
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success || !(value > 0)) return this.patchCylinderForm();
        // A length the ram cannot reach shrinks it, exactly as dragging there
        // does -- and has to say so for the same reason the drag does.
        const floor = cylinderMinimumSpan(0.15 * this.settingsService.objectScale);
        this.cylinderClamped =
          value < floor
            ? 'Held at the shortest cylinder there is: any less and the barrel has no room to slide in.'
            : '';
        this.reposeCylinder(value, undefined);
      })
    );

    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['angle'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.angle', NOT_A.angle);
          this.patchCylinderForm();
        } else
          this.reposeCylinder(
            undefined,
            this.nup.convertAngle(
              value,
              this.settingsService.angleUnit.getValue(),
              AngleUnit.RADIAN
            )
          );
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['angle'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.angle', NOT_A.angle);
          this.linkForm.patchValue({
            angle: this.nup
              .convertAngle(
                this.activeSrv.selectedLink.angleRad,
                AngleUnit.RADIAN,
                this.settingsService.angleUnit.getValue()
              )
              .toFixed(0)
              .toString(),
          });
        } else {
          this.activeSrv.selectedLink.angleRad = this.nup.convertAngle(
            value,
            this.settingsService.angleUnit.getValue(),
            AngleUnit.RADIAN
          );
          this.resolveNewLink();
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
          this.linkForm.patchValue(
            {
              angle: this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
        this.activeSrv.fakeUpdateSelectedObj();
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['mass'].valueChanges.subscribe((val) => {
        const units = this.massUnit();
        const [success, value] = this.nup.parseMassString(val ?? '', units);
        if (!success || value < 0) {
          this.notify.refusal('value.mass', NOT_A.mass);
          this.linkForm.patchValue(
            { mass: this.nup.formatValueAndUnit(this.activeSrv.selectedLink.mass, units) },
            { emitEvent: false }
          );
          return;
        }
        this.mechanismService.assignBodyMass(this.activeSrv.selectedLink, value);
        this.syncMassDependents();
        this.mechanismService.updateMechanism(true);
        this.mechanismService.onMechUpdateState.next(2);
        this.linkForm.patchValue(
          { mass: this.nup.formatValueAndUnit(value, units) },
          { emitEvent: false }
        );
        // An auto moment of inertia follows the mass it belongs to; show what
        // the rebuild just derived rather than the number from before it.
        this.refreshDerivedMassFields();
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['massMoI'].valueChanges.subscribe((val) => {
        // Typed in the display unit (g·cm² for metric), stored in the unit the
        // solver and every URL are written against (kg·cm²).
        const length = this.settingsService.lengthUnit.getValue();
        const display = this.nup.displayInertiaUnit(length);
        const [success, value] = this.nup.parseInertiaString(val ?? '', display);
        if (!success || value < 0 || !(this.activeSrv.selectedLink.mass > 0)) {
          if (!success || value < 0) this.notify.refusal('value.inertia', NOT_A.momentOfInertia);
          this.refreshDerivedMassFields();
          return;
        }
        this.activeSrv.selectedLink.massMoI = this.nup.convertInertia(
          value,
          display,
          this.nup.storedInertiaUnit(length)
        );
        this.activeSrv.selectedLink.moiIsCustom = true;
        this.mechanismService.updateMechanism(true);
        this.mechanismService.onMechUpdateState.next(2);
        this.refreshDerivedMassFields();
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['comX'].valueChanges.subscribe((val) => {
        this.updateLinkCenterOfMass('x', val);
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['comY'].valueChanges.subscribe((val) => {
        this.updateLinkCenterOfMass('y', val);
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['magnitude'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseForceString(
          val!,
          this.settingsService.forceUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.force', NOT_A.force);
          this.forceForm.patchValue({
            magnitude: this.activeSrv.selectedForce.mag.toFixed(2).toString(),
          });
        } else {
          this.activeSrv.selectedForce.setMagnitude(value);
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              magnitude: this.nup.formatValueAndUnit(
                value,
                this.settingsService.forceUnit.getValue()
              ),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['angle'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.angle', NOT_A.angle);
          this.forceForm.patchValue({
            angle: this.activeSrv.selectedForce.angleRad.toFixed(2).toString(),
          });
        } else {
          //Always convert to Radian since Force.angle is in Radian
          this.activeSrv.selectedForce.setDirectionRadians(
            this.nup.convertAngle(
              value,
              this.settingsService.angleUnit.getValue(),
              AngleUnit.RADIAN
            )
          );
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              angle: this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
        this.activeSrv.fakeUpdateSelectedObj();
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['xComp'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseForceString(
          val!,
          this.settingsService.forceUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.force', NOT_A.force);
          this.forceForm.patchValue({
            xComp: this.activeSrv.selectedForce.xComp.toFixed(2).toString(),
          });
        } else {
          this.activeSrv.selectedForce.setComponents(value, this.activeSrv.selectedForce.yComp);
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              xComp: this.nup.formatValueAndUnit(value, this.settingsService.forceUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['yComp'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseForceString(
          val!,
          this.settingsService.forceUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.force', NOT_A.force);
          this.forceForm.patchValue({
            yComp: this.activeSrv.selectedForce.yComp.toFixed(2).toString(),
          });
        } else {
          this.activeSrv.selectedForce.setComponents(this.activeSrv.selectedForce.xComp, value);
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              yComp: this.nup.formatValueAndUnit(value, this.settingsService.forceUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['isGlobal'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) {
          return;
        }
        this.mechanismService.changeForceLocal();
      })
    );

    // The three lengths behave alike, so they are wired alike. Nothing here
    // calls updateMechanism or save: moving a picture is not an edit to the
    // linkage, and putting it in the undo history would mean Undo silently
    // re-posing the machine because the user nudged the underlay.
    (['centerX', 'centerY', 'width'] as const).forEach((field) => {
      this.onDestroySubscriptions.push(
        this.backgroundImageForm.controls[field].valueChanges.subscribe((val) => {
          this.commitBackgroundImageLength(field, val);
        })
      );
    });

    this.onDestroySubscriptions.push(
      this.backgroundImageForm.controls['rotation'].valueChanges.subscribe((val) => {
        if (!this.bgImage.image()) return;
        const [ok, value] = this.nup.parseAngleString(
          val ?? '',
          this.settingsService.angleUnit.getValue()
        );
        if (!ok) {
          this.notify.refusal('value.angle', NOT_A.angle);
        } else {
          this.bgImage.place({
            rotationRad: this.nup.convertAngle(
              value,
              this.settingsService.angleUnit.getValue(),
              AngleUnit.RADIAN
            ),
          });
        }
        this.patchBackgroundImageForm();
      })
    );

    this.onDestroySubscriptions.push(
      this.backgroundImageForm.controls['opacity'].valueChanges.subscribe((val) => {
        if (!this.bgImage.image()) return;
        const typed = (val ?? '').replace('%', '').trim();
        const percent = Number(typed);
        // Emptiness is not zero. Number('') is 0, so a blank field silently
        // turned the picture invisible -- and then the panel reported 0% as
        // though that had been asked for.
        if (typed === '' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
          this.notify.refusal('bgImage.opacity', 'Opacity has to be a number from 0 to 100.');
        } else {
          this.bgImage.place({ opacity: percent / 100 });
        }
        this.patchBackgroundImageForm();
      })
    );

    this.onDestroySubscriptions.push(
      this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
        if (newObjType == 'Joint') {
          //Is this a real change where the form needs to get updated?
          if (this.currentlyOpenJointID != this.activeSrv.selectedJoint.id) {
            this.listOfOtherJoints = [];
            setTimeout(() => {
              this.reloadOtherJointForm();
              this.listOfOtherJoints.forEach((joint, i) => {
                this.setFormDistAndAngle(this.activeSrv.selectedJoint, joint, i);
              });
            });
          }

          this.listOfOtherJoints.forEach((joint, i) => {
            this.setFormDistAndAngle(this.activeSrv.selectedJoint, joint, i);
          });
          this.currentlyOpenJointID = this.activeSrv.selectedJoint.id;

          const angleTemp_rad = this.gridUtils.isAttachedToSlider(this.activeSrv.selectedJoint)
            ? (this.gridUtils.getSliderJoint(this.activeSrv.selectedJoint) as PrisJoint).angle_rad
            : 0;
          this.jointForm.patchValue(
            {
              xPos: this.nup.formatModelLength(
                this.activeSrv.selectedJoint.x,
                this.settingsService.lengthUnit.getValue()
              ),
              yPos: this.nup.formatModelLength(
                this.activeSrv.selectedJoint.y,
                this.settingsService.lengthUnit.getValue()
              ),
              prisAngle: this.nup.formatValueAndUnit(
                this.nup.convertAngle(
                  angleTemp_rad,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                ),
                this.settingsService.angleUnit.getValue()
              ),
              // A slider's ground lives on its PrisJoint, not on the pin the
              // panel selected, so reading the pin shows every grounded guide
              // as ungrounded.
              ground: this.selectedSlider?.ground ?? this.activeSrv.selectedJoint.ground,
              input: this.activeSrv.selectedJoint.input,
              slider: this.gridUtils.isAttachedToSlider(this.activeSrv.selectedJoint),
              weld: this.activeSrv.selectedJoint.isWelded,
              curve: this.activeSrv.selectedJoint.showCurve,
              sliderMass: this.sliderBlock
                ? this.nup.formatValueAndUnit(this.sliderBlock.mass, this.massUnit())
                : '',
            },
            { emitEvent: false }
          );
          this.syncInputSettingsFields();

          this.disableAndEnableLinkFields();
          setTimeout(() => {
            this.disableAndEnableJointFields();
          });
        } else if (newObjType == 'Link') {
          this.currentlyOpenJointID = '';
          this.patchCylinderForm();
          this.linkForm.patchValue(
            {
              length: this.nup.formatModelLength(
                this.activeSrv.selectedLink.length,
                this.settingsService.lengthUnit.getValue()
              ),
              angle: this.nup.formatValueAndUnit(
                this.nup.convertAngle(
                  this.activeSrv.selectedLink.angleRad,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                ),
                this.settingsService.angleUnit.getValue()
              ),
              mass: this.nup.formatValueAndUnit(this.activeSrv.selectedLink.mass, this.massUnit()),
            },
            { emitEvent: false }
          );
          this.refreshDerivedMassFields();
          this.syncMassDependents();
          // A cylinder body reuses the joint form's Input Settings controls
          // (speed, unit), so they have to be truthful when the body opens.
          this.syncInputSettingsFields();
        } else if (newObjType == 'Force') {
          this.currentlyOpenJointID = '';
          this.forceForm.patchValue(
            {
              magnitude: this.nup.formatValueAndUnit(
                this.activeSrv.selectedForce.mag,
                this.settingsService.forceUnit.getValue()
              ),
              angle: this.nup.formatValueAndUnit(
                this.nup.convertAngle(
                  this.activeSrv.selectedForce.angleRad,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                ),
                this.settingsService.angleUnit.getValue()
              ),
              xComp: this.nup.formatValueAndUnit(
                this.activeSrv.selectedForce.xComp,
                this.settingsService.forceUnit.getValue()
              ),
              yComp: this.nup.formatValueAndUnit(
                this.activeSrv.selectedForce.yComp,
                this.settingsService.forceUnit.getValue()
              ),
              isGlobal: this.activeSrv.selectedForce.local ? '0' : '1',
            },
            { emitEvent: false }
          );
        } else if (newObjType == 'BackgroundImage') {
          this.currentlyOpenJointID = '';
          this.patchBackgroundImageForm();
        } else {
          this.currentlyOpenJointID = '';
        }
      })
    );
  }

  /**
   * The frame the Center of Mass fields are typed and read in. Display-side
   * only: whatever is chosen, the point is stored against the link itself
   * (see RealLink.placeCustomCoM), so the numbers here are a view of it.
   */
  comFrame: string = 'centroid';

  setComFrame(frame: string): void {
    this.comFrame = frame;
    this.refreshDerivedMassFields();
  }

  /** Where the chosen frame's zero sits, in model coordinates. */
  private comFrameOrigin(link: RealLink): { x: number; y: number } {
    if (this.comFrame === 'grid') return { x: 0, y: 0 };
    if (this.comFrame.startsWith('joint:')) {
      const id = this.comFrame.slice('joint:'.length);
      const joint = link.joints.find((candidate) => candidate.id === id);
      if (joint) return { x: joint.x, y: joint.y };
    }
    return uniformBodyOf(link.joints).centroid;
  }

  // ---------------------------------------------------------------------------
  // Background image
  //
  // The one thing this panel edits that is not part of the mechanism: it never
  // touches MechanismService, never enters the undo history, and never reaches
  // the URL codec. Its numbers are ordinary lengths, so they go through the same
  // parser and the same length unit as every other length here.
  // ---------------------------------------------------------------------------

  /** Show the placement as it actually is, in the user's own units. */
  private patchBackgroundImageForm(): void {
    const image = this.bgImage.image();
    if (!image) return;
    const unit = this.settingsService.lengthUnit.getValue();
    this.backgroundImageForm.patchValue(
      {
        centerX: this.nup.formatModelLength(image.centerX, unit),
        centerY: this.nup.formatModelLength(image.centerY, unit),
        width: this.nup.formatModelLength(image.width, unit),
        rotation: this.nup.formatValueAndUnit(
          this.nup.convertAngle(
            image.rotationRad,
            AngleUnit.RADIAN,
            this.settingsService.angleUnit.getValue()
          ),
          this.settingsService.angleUnit.getValue()
        ),
        opacity: Math.round(image.opacity * 100).toString(),
      },
      { emitEvent: false }
    );
  }

  /**
   * Commit one length field, or put back the value that is still true.
   *
   * A width the picture cannot have is refused rather than silently rounded up
   * to the minimum: the number left in the field has to be the number that took
   * effect, or the panel is lying about where the picture is.
   */
  private commitBackgroundImageLength(
    field: 'centerX' | 'centerY' | 'width',
    raw: string | null
  ): void {
    if (!this.bgImage.image()) return;
    const [ok, value] = this.nup.parseModelLengthString(
      raw ?? '',
      this.settingsService.lengthUnit.getValue()
    );
    if (!ok) {
      this.notify.refusal('value.length', NOT_A.length);
    } else if (field === 'width' && value < MIN_WIDTH) {
      this.notify.refusal(
        'bgImage.width',
        `A background image has to be at least ${this.nup.formatModelLength(
          MIN_WIDTH,
          this.settingsService.lengthUnit.getValue()
        )} wide.`
      );
    } else {
      this.bgImage.place({ [field]: value });
    }
    // Either way the field is rewritten from the picture: a rejected entry goes
    // back to the truth, and an accepted one is reformatted.
    this.patchBackgroundImageForm();
  }

  saveBackgroundImage(): void {
    // The placement is already live -- every field commits on blur -- so this
    // closes the editor rather than writing anything. Leaving the picture
    // selected would keep its outline on the canvas over finished work.
    this.activeSrv.updateSelectedObj(null);
    this.notify.success('bgImage.saved', 'Background image placed.');
  }

  deleteBackgroundImage(): void {
    this.bgImage.remove();
    this.activeSrv.updateSelectedObj(null);
    this.notify.success('bgImage.removed', 'Background image removed.');
  }

  private updateLinkCenterOfMass(axis: 'x' | 'y', rawValue: string | null): void {
    const [success, value] = this.nup.parseModelLengthString(
      rawValue ?? '',
      this.settingsService.lengthUnit.getValue()
    );
    const link = this.activeSrv.selectedLink;
    if (!success) {
      this.notify.refusal('value.length', NOT_A.length);
      this.refreshDerivedMassFields();
      return;
    }

    const origin = this.comFrameOrigin(link);
    const point = {
      x: axis === 'x' ? origin.x + value : link.CoM.x,
      y: axis === 'y' ? origin.y + value : link.CoM.y,
    };
    link.placeCustomCoM(point);
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  /** Hand both derived fields back to the shape at once. */
  useUniformBody(): void {
    this.activeSrv.selectedLink.moiIsCustom = false;
    this.activeSrv.selectedLink.comIsCustom = false;
    this.activeSrv.selectedLink.comOffset = undefined;
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  /** Hand a field back to the uniform body, and show what it derives. */
  useUniformBodyMoI(): void {
    this.activeSrv.selectedLink.moiIsCustom = false;
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  useUniformBodyCoM(): void {
    this.activeSrv.selectedLink.comIsCustom = false;
    this.activeSrv.selectedLink.comOffset = undefined;
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  /** Re-read MoI and CoM from the link after a rebuild may have re-derived them. */
  private refreshDerivedMassFields(): void {
    const link = this.activeSrv.selectedLink;
    if (!link) return;
    const length = this.settingsService.lengthUnit.getValue();
    const origin = this.comFrameOrigin(link);
    const display = this.nup.displayInertiaUnit(length);
    const inertia = this.nup.convertInertia(
      link.massMoI,
      this.nup.storedInertiaUnit(length),
      display
    );
    this.linkForm.patchValue(
      {
        // The unit is typed into the box, as every Basic Settings field does
        // it; the centre-of-mass pair stays bare — its unit is the frame's.
        massMoI: this.nup.formatValueAndUnit(inertia, display),
        comX: ((link.CoM.x - origin.x) / MODEL_SCALE).toFixed(2),
        comY: ((link.CoM.y - origin.y) / MODEL_SCALE).toFixed(2),
      },
      { emitEvent: false }
    );
  }

  momentOfInertiaUnit(): InertiaUnit {
    return this.nup.displayInertiaUnit(this.settingsService.lengthUnit.value);
  }

  massUnit(): MassUnit {
    switch (this.settingsService.lengthUnit.value) {
      case LengthUnit.INCH:
        return MassUnit.LBM;
      case LengthUnit.METER:
        return MassUnit.KG;
      default:
        return MassUnit.GRAM;
    }
  }

  getDistanceBetweenJoints(j1: RevJoint, j2: RevJoint): number {
    return Math.sqrt((j1.x - j2.x) ** 2 + (j1.y - j2.y) ** 2);
  }

  getAngleBetweenJoints(j1: RevJoint, j2: RevJoint): number {
    return Math.atan2(j2.y - j1.y, j2.x - j1.x);
  }

  updateDistanceBetweenJoints(j1: RevJoint, j2: RevJoint, newDist: number): void {
    //Use gridUtils to move the joint
    this.gridUtils.dragJoint(
      j2,
      getNewOtherJointPos(j1, this.getAngleBetweenJoints(j1, j2), newDist)
    );
  }

  updateAngleBetweenJoints(j1: RevJoint, j2: RevJoint, newAngle: number): void {
    //Use gridUtils to move the joint
    this.gridUtils.dragJoint(
      j2,
      getNewOtherJointPos(j1, newAngle, this.getDistanceBetweenJoints(j1, j2))
    );
  }

  resolveNewLink() {
    if (!this.hideEditPanel()) {
      //If the first joint is ground, then the second joint is dragged
      if ((this.activeSrv.selectedLink.joints[1] as RevJoint).ground) {
        let newJ1 = getNewOtherJointPos(
          this.activeSrv.selectedLink.joints[1],
          this.activeSrv.selectedLink.angleRad + Math.PI,
          this.activeSrv.selectedLink.length
        );
        this.gridUtils.dragJoint(this.activeSrv.selectedLink.joints[0] as RevJoint, newJ1);
      } else {
        //If the second joint is ground, then the first joint is dragged
        let newJ2 = getNewOtherJointPos(
          this.activeSrv.selectedLink.joints[0],
          this.activeSrv.selectedLink.angleRad,
          this.activeSrv.selectedLink.length
        );
        this.gridUtils.dragJoint(this.activeSrv.selectedLink.joints[1] as RevJoint, newJ2);
      }
    }
  }

  resolveNewForceAngle() {
    if (!this.hideEditPanel()) {
      //Whenever angle is changed, the end point of the force is changed
      const distanceBetweenPoints = getDistance(
        this.activeSrv.selectedForce.startCoord,
        this.activeSrv.selectedForce.endCoord
      );

      const endCoordLocation = getNewOtherJointPos(
        this.activeSrv.selectedForce.startCoord,
        this.activeSrv.selectedForce.angleRad,
        distanceBetweenPoints
      );

      this.gridUtils.dragForce(this.activeSrv.selectedForce, endCoordLocation, 'direction');
    }
  }

  resolveNewForceMagnitude() {
    if (!this.hideEditPanel()) {
      const endX = this.activeSrv.selectedForce.startCoord.x + this.activeSrv.selectedForce.xComp;
      const endY = this.activeSrv.selectedForce.startCoord.y + this.activeSrv.selectedForce.yComp;

      this.gridUtils.dragForce(this.activeSrv.selectedForce, new Coord(endX, endY), 'direction');
    }
  }

  deleteJoint() {
    this.activeSrv.updateSelectedObj(undefined);
    this.mechanismService.deleteJoint();
  }

  deleteLink() {
    this.activeSrv.updateSelectedObj(undefined);
    this.mechanismService.deleteLink();
  }

  deleteForce() {
    this.activeSrv.updateSelectedObj(undefined);
    this.mechanismService.deleteForce();
  }

  isWeldable(joint: RealJoint) {
    //If there are at least two links that share this joint, return true
    return joint.canBeWelded();
  }

  /** One rule, shared with the right-click menu so the two cannot disagree. */
  canToggleInput(selectedJoint: RealJoint) {
    return this.gridUtils.canToggleInput(selectedJoint);
  }

  /** Point at a CoM field, see what it states: the CoM mark, plus the
   *  distance drawn from the chosen frame's zero along that axis — the same
   *  show-me the length and angle fields give. */
  setComPreview(axis: 'x' | 'y', on: boolean) {
    const link = this.activeSrv.selectedLink;
    const showing = on && !!link;
    this.settingsService.previewCoMLinkId = showing ? link.id : null;
    NewGridComponent.instance.setComMeasureOverlay(
      showing
        ? {
            axis,
            origin: this.comFrameOrigin(link),
            com: { x: link.CoM.x, y: link.CoM.y },
            mode: this.comFrame === 'grid' ? 'axis' : 'origin',
          }
        : undefined
    );
  }

  /** Point at a part's mass field, see that part lit on the ram. */
  setCylinderPartPreview(part: 'barrel' | 'rod' | 'head' | undefined) {
    NewGridComponent.instance.setCylinderPartPreview(part);
  }

  setShowLinkLengthOverlay($event: number) {
    NewGridComponent.instance.showLinkLengthOverlay = $event;
  }

  setShowLinkAngleOverlay($event: number) {
    NewGridComponent.instance.showLinkAngleOverlay = $event;
  }

  /** Show what a grounded slot's angle is measured from, while it is pointed at. */
  setSlotAngleOverlay(showing: boolean) {
    NewGridComponent.instance.setSlotAngleOverlay(showing);
  }

  /** Show the ram's travel on the canvas while one of its size fields is pointed at. */
  setCylinderRangeOverlay(which: 'travel' | 'start' | undefined) {
    NewGridComponent.instance.setCylinderRangeOverlay(which);
  }

  getOtherJointsInLink(selectedJoint: RealJoint): RealJoint[] {
    //Get the other joint in the link, don't include the selected joint
    //First find all the links that contain this joint

    let links = this.mechanismService.links.filter((link) => {
      return link.joints.includes(selectedJoint);
    });
    //Make a list off all joints in these links that are not the selected joint
    let otherJoints = links
      .map((link) => {
        return (link.joints as RealJoint[]).filter((joint) => {
          return joint != selectedJoint;
        });
      })
      .flat();

    // Remove joints that are prismatic
    otherJoints = otherJoints.filter((joint) => {
      return !(joint instanceof PrisJoint);
    });

    // A sealed cylinder's interior joints are not editable from anywhere, so
    // a mount's Distance To Joints must not offer a field that would drag one.
    otherJoints = otherJoints.filter((joint) => {
      const sealed = this.mechanismService.cylinderAt(joint);
      return !sealed || joint.id === sealed.barrelFar.id || joint.id === sealed.rodFar.id;
    });

    // A mount reads like a binary link's endpoint: its far end is the OTHER
    // mount, which the interior filter above just removed along with the
    // joints between them. Editing that D drags the far mount, which re-poses
    // the whole part parametrically.
    const mountOf = this.mechanismService.cylinderAt(selectedJoint);
    if (
      mountOf &&
      (selectedJoint.id === mountOf.barrelFar.id || selectedJoint.id === mountOf.rodFar.id)
    ) {
      const far = selectedJoint.id === mountOf.barrelFar.id ? mountOf.rodFar : mountOf.barrelFar;
      if (far instanceof RealJoint && !otherJoints.some((joint) => joint.id === far.id)) {
        otherJoints.push(far);
      }
    }

    if (otherJoints == undefined) {
      return [];
    }

    return otherJoints as RealJoint[];
  }

  private reloadOtherJointForm() {
    this.listOfOtherJoints = this.getOtherJointsInLink(this.activeSrv.selectedJoint);
    this.jointForm.controls['otherJoints'] = this.fb.array([]);
    this.otherJoitnsSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.otherJoitnsSubscriptions = [];

    this.listOfOtherJoints.forEach((joint, i) => {
      this.otherJoints.push(this.fb.control('', { updateOn: 'blur' }));
      this.otherJoitnsSubscriptions.push(
        this.otherJoints.controls[i * 2].valueChanges.subscribe((val) => {
          const [success, value] = this.nup.parseModelLengthString(
            val!,
            this.settingsService.lengthUnit.getValue()
          );
          if (!success) {
            this.notify.refusal('value.length', NOT_A.length);
            this.otherJoints.controls[i * 2].patchValue(
              this.nup.formatModelLength(
                this.getDistanceBetweenJoints(this.activeSrv.selectedJoint, joint),
                this.settingsService.lengthUnit.getValue()
              )
            );
          } else {
            this.updateDistanceBetweenJoints(this.activeSrv.selectedJoint, joint, value);
            this.mechanismService.onMechUpdateState.next(2);
            this.otherJoints.controls[i * 2].patchValue(
              this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
              { emitEvent: false }
            );
          }
        })
      );
      this.otherJoints.push(this.fb.control('', { updateOn: 'blur' }));
      this.otherJoitnsSubscriptions.push(
        this.otherJoints.controls[i * 2 + 1].valueChanges.subscribe((val) => {
          const [success, value] = this.nup.parseAngleString(
            val!,
            this.settingsService.angleUnit.getValue()
          );
          if (!success) {
            this.notify.refusal('value.angle', NOT_A.angle);
            this.otherJoints.controls[i * 2 + 1].patchValue(
              this.nup
                .convertAngle(
                  this.activeSrv.selectedLink.angleRad,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                )
                .toFixed(0)
                .toString()
            );
          } else {
            this.updateAngleBetweenJoints(
              this.activeSrv.selectedJoint,
              joint,
              this.nup.convertAngle(
                value,
                this.settingsService.angleUnit.getValue(),
                AngleUnit.RADIAN
              )
            );
            this.mechanismService.onMechUpdateState.next(2);
            this.otherJoints.controls[i * 2 + 1].patchValue(
              this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()),
              { emitEvent: false }
            );
          }
        })
      );
    });
  }

  private setFormDistAndAngle(
    currentJoint: RealJoint,
    otherJoint: RealJoint,
    otherJointID: number
  ) {
    let distance = this.getDistanceBetweenJoints(currentJoint, otherJoint);
    let angle = this.getAngleBetweenJoints(currentJoint, otherJoint);

    angle = this.nup.convertAngle(
      angle,
      AngleUnit.RADIAN,
      this.settingsService.angleUnit.getValue()
    );

    this.otherJoints.controls[otherJointID * 2].setValue(
      this.nup.formatModelLength(distance, this.settingsService.lengthUnit.getValue()),
      { emitEvent: false }
    );

    this.otherJoints.controls[otherJointID * 2 + 1].setValue(
      this.nup.formatValueAndUnit(angle, this.settingsService.angleUnit.getValue()),
      { emitEvent: false }
    );
  }

  /** Open the tutorial where the drawing has got to, and show the drawer. */
  startTutorial(): void {
    this.tutorial.start();
  }
}
