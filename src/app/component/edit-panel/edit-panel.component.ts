import {
  AfterContentInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { PrisJoint, RealJoint, RevJoint } from 'src/app/model/joint';
import { FormArray, FormBuilder } from '@angular/forms';
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
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { RealLink } from '../../model/link';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { Cylinder } from '../../model/cylinder';

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
  standalone: false,
})
export class EditPanelComponent implements OnInit, AfterContentInit, OnDestroy {
  listOfOtherJoints: RealJoint[] = [];
  private currentlyOpenJointID: string = '';

  //A dictionary for whether each collapsible section is expanded or not
  sectionExpanded: { [key: string]: boolean } = {
    JBasic: true, //This is the default (starting) state
    JInput: true, //Expanded on arrival, so a new input's settings are visible
    JVisual: false,
    JDistToJ: true,
    LBasic: true,
    LVisual: false,
    LMass: true,
    LCompound: true,
    FBasic: true,
    FVisual: false,
  };

  hideEditPanel() {
    return AnimationBarComponent.animate || this.mechanismService.mechanismTimeStep !== 0;
  }

  /** Unit choices for the Input Speed field's inline picker. */
  readonly speedUnitOptions = INPUT_SPEED_UNITS.map((option, index) => ({
    value: index.toString(),
    label: option.label,
  }));

  /** One button for both directions: flip rather than pick. */
  flipInputDirection(): void {
    this.settingsService.isInputCW.next(!this.settingsService.isInputCW.value);
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
    const shown = this.isSliderInput
      ? this.settingsService.linearInputSpeed.value
      : this.nup.convertAngularVelocity(
          this.settingsService.inputSpeed.value,
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

  constructor(
    public activeSrv: ActiveObjService,
    protected settingsService: SettingsService,
    private fb: FormBuilder,
    private nup: NumberUnitParserService,
    private cd: ChangeDetectorRef,
    public mechanismService: MechanismService,
    public gridUtils: GridUtilsService
  ) {
    //Set the instance to this
    EditPanelComponent.instance = this;
  }

  //Instance of this
  static instance: EditPanelComponent;

  //maintain a list of subcriptions to unsubscribe later
  onDestroySubscriptions: any[] = [];
  //dynamic form array subscriptions
  otherJoitnsSubscriptions: any[] = [];
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
  // The cylinder body edits like a binary link: length is mount-to-mount,
  // angle runs barrel mount → rod mount. Writes re-pose the part by dragging
  // the rod mount through the parametric pipeline, so collinearity holds.
  cylinderForm = this.fb.group(
    {
      length: [''],
      angle: [''],
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

  disableDelete(): void {
    // this.mechanismService.canDelete = false;
  }

  ngOnInit(): void {
    // console.log(this.jointForm);
    // console.log(this.activeSrv);
    // console.log(this.profileForm);
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

  /** Mount-to-mount length, in the user's length unit (cm at the edge). */
  cylinderLengthLabel(sealed: Cylinder): string {
    return this.nup.formatModelLength(
      getDistance(sealed.barrelFar, sealed.rodFar),
      this.settingsService.lengthUnit.getValue()
    );
  }

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
    this.mechanismService.onMechUpdateState.next(2);
    this.patchCylinderForm();
  }

  /** Refresh the cylinder form's fields from the part, without re-firing them. */
  patchCylinderForm(): void {
    const sealed = this.selectedCylinder;
    if (!sealed) return;
    this.cylinderForm.patchValue(
      {
        length: this.cylinderLengthLabel(sealed),
        angle: this.cylinderAngleLabel(sealed),
      },
      { emitEvent: false }
    );
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

  /** A slot cut into a moving link names the link and the pair that defines it. */
  get slotOnLabel(): string | undefined {
    const slider = this.selectedSlider;
    if (!slider?.isFloating || !slider.isSlotWellFormed) return undefined;
    return `${slider.carrier!.id} (joints ${slider.slotJointA!.id}\u2013${slider.slotJointB!.id})`;
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
      this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
        if (this.hideEditPanel()) return;
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success) {
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
          // The field carries magnitude; a minus sign reads as "the other way",
          // so -20 becomes 20 with the direction flipped.
          if (typed < 0) {
            this.settingsService.isInputCW.next(!this.settingsService.isInputCW.value);
          }
          if (this.isSliderInput) {
            this.settingsService.linearInputSpeed.next(Math.abs(typed));
          } else {
            this.settingsService.inputSpeed.next(
              this.nup.convertAngularVelocity(
                Math.abs(typed),
                this.settingsService.inputSpeedUnit.value,
                AngularVelocityUnit.RPM
              )
            );
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
      this.cylinderForm.controls['length'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success || !(value > 0)) this.patchCylinderForm();
        else this.reposeCylinder(value, undefined);
      })
    );

    this.onDestroySubscriptions.push(
      this.cylinderForm.controls['angle'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        if (!success) this.patchCylinderForm();
        else
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
          this.linkForm.patchValue(
            { mass: this.nup.formatValueAndUnit(this.activeSrv.selectedLink.mass, units) },
            { emitEvent: false }
          );
          return;
        }
        this.activeSrv.selectedLink.mass = value;
        this.mechanismService.updateMechanism(true);
        this.mechanismService.onMechUpdateState.next(2);
        this.linkForm.patchValue(
          { mass: this.nup.formatValueAndUnit(value, units) },
          { emitEvent: false }
        );
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['massMoI'].valueChanges.subscribe((val) => {
        const units = this.momentOfInertiaUnit();
        const [success, value] = this.nup.parseInertiaString(val ?? '', units);
        if (!success || value < 0) {
          this.linkForm.patchValue(
            { massMoI: this.nup.formatValueAndUnit(this.activeSrv.selectedLink.massMoI, units) },
            { emitEvent: false }
          );
          return;
        }
        this.activeSrv.selectedLink.massMoI = value;
        this.mechanismService.updateMechanism(true);
        this.mechanismService.onMechUpdateState.next(2);
        this.linkForm.patchValue(
          { massMoI: this.nup.formatValueAndUnit(value, units) },
          { emitEvent: false }
        );
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
        // this.activeSrv.selectedForce.local = val == '0' ? true : false;
        this.mechanismService.changeForceLocal();
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
            // console.log('set form dist and angle');
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
              massMoI: this.nup.formatValueAndUnit(
                this.activeSrv.selectedLink.massMoI,
                this.momentOfInertiaUnit()
              ),
              comX: this.nup.formatModelLength(
                this.activeSrv.selectedLink.CoM.x,
                this.settingsService.lengthUnit.getValue()
              ),
              comY: this.nup.formatModelLength(
                this.activeSrv.selectedLink.CoM.y,
                this.settingsService.lengthUnit.getValue()
              ),
            },
            { emitEvent: false }
          );
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
        } else {
          this.currentlyOpenJointID = '';
        }
      })
    );
  }

  private updateLinkCenterOfMass(axis: 'x' | 'y', rawValue: string | null): void {
    const [success, value] = this.nup.parseModelLengthString(
      rawValue ?? '',
      this.settingsService.lengthUnit.getValue()
    );
    const link = this.activeSrv.selectedLink;
    if (!success) {
      this.linkForm.patchValue(
        {
          [axis === 'x' ? 'comX' : 'comY']: this.nup.formatModelLength(
            link.CoM[axis],
            this.settingsService.lengthUnit.getValue()
          ),
        },
        { emitEvent: false }
      );
      return;
    }

    link.CoM[axis] = value;
    link.updateCoMDs();
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
  }

  momentOfInertiaUnit(): InertiaUnit {
    switch (this.settingsService.lengthUnit.value) {
      case LengthUnit.INCH:
        return InertiaUnit.LBM_IN2;
      case LengthUnit.METER:
        return InertiaUnit.KG_M2;
      default:
        return InertiaUnit.KG_CM2;
    }
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

      this.gridUtils.dragForce(this.activeSrv.selectedForce, endCoordLocation, false);
    }
  }

  resolveNewForceMagnitude() {
    if (!this.hideEditPanel()) {
      const endX = this.activeSrv.selectedForce.startCoord.x + this.activeSrv.selectedForce.xComp;
      const endY = this.activeSrv.selectedForce.startCoord.y + this.activeSrv.selectedForce.yComp;

      this.gridUtils.dragForce(this.activeSrv.selectedForce, new Coord(endX, endY), false);
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

  setShowLinkLengthOverlay($event: number) {
    NewGridComponent.instance.showLinkLengthOverlay = $event;
  }

  setShowLinkAngleOverlay($event: number) {
    NewGridComponent.instance.showLinkAngleOverlay = $event;
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
    // console.log('killed all subscriptions to other joints');
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
            this.otherJoints.controls[i * 2].patchValue(
              this.nup.formatModelLength(
                this.getDistanceBetweenJoints(this.activeSrv.selectedJoint, joint),
                this.settingsService.lengthUnit.getValue()
              )
            );
          } else {
            // this.activeSrv.selectedLink.length = value;
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
    // console.log('setFormDistAndAngle', otherJointID);
    // console.log(this.otherJoints);
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
}
