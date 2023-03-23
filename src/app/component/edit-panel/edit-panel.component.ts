import { AfterContentInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { PrisJoint, RevJoint } from 'src/app/model/joint';
import { FormBuilder } from '@angular/forms';
import { Coord } from 'src/app/model/coord';
import { AngleUnit, getNewOtherJointPos, LengthUnit, TorqueUnit } from 'src/app/model/utils';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { GridUtilsService } from '../../services/grid-utils.service';

@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
})
export class EditPanelComponent implements OnInit, AfterContentInit {
  hideEditPanel() {
    return AnimationBarComponent.animate === true || this.mechanismService.mechanismTimeStep !== 0;
  }

  constructor(
    public activeSrv: ActiveObjService,
    protected settingsService: SettingsService,
    private fb: FormBuilder,
    private nup: NumberUnitParserService,
    private cd: ChangeDetectorRef,
    public mechanismService: MechanismService,
    public gridUtils: GridUtilsService
  ) {}

  lengthUnit: LengthUnit = this.settingsService.length.value;
  angleUnit: AngleUnit = this.settingsService.angle.value;
  torqueUnit: TorqueUnit = this.settingsService.inputTorque.value;
  jointForm = this.fb.group(
    {
      xPos: [''],
      yPos: [''],
      angle: [''],
      ground: [false, { updateOn: 'change' }],
      input: [false, { updateOn: 'change' }],
      slider: [false, { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  linkForm = this.fb.group(
    {
      length: [''],
      angle: [''],
    },
    { updateOn: 'blur' }
  );

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
  }

  ngAfterContentInit() {
    this.activeSrv.fakeUpdateSelectedObj();
  }

  mouseDown(): void {
    console.log('test');
  }

  onChanges(): void {
    this.settingsService.length.subscribe((val) => {
      switch (
        val
        //when length unit changes, rescale grid?
      ) {
      }
      var unit = this.settingsService.length.value;
      if (unit !== this.lengthUnit) {
        this.mechanismService.joints.forEach((joint) => {
          this.activeSrv.updateSelectedObj(joint);
          this.gridUtils.dragJoint(
            this.activeSrv.selectedJoint,
            new Coord(
              this.nup.convertLength(joint.x, this.lengthUnit, unit),
              this.nup.convertLength(joint.y, this.lengthUnit, unit)
            )
          );
        });
        this.lengthUnit = this.settingsService.length.value;
        this.activeSrv.fakeUpdateSelectedObj();
      }
    });

    this.settingsService.angle.subscribe((val) => {
      this.activeSrv.fakeUpdateSelectedObj();
    });

    this.settingsService.inputTorque.subscribe((val) => {
      var unit = this.settingsService.inputTorque.value;
      if (unit !== this.torqueUnit) {
      }
      this.torqueUnit = this.settingsService.inputTorque.value;
      this.activeSrv.fakeUpdateSelectedObj();
    });

    this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseLengthString(
        val!,
        this.settingsService.length.getValue()
      );
      if (!success) {
        this.jointForm.patchValue({ xPos: this.activeSrv.selectedJoint.x.toFixed(2).toString() });
      } else {
        this.activeSrv.selectedJoint.x = value;
        this.gridUtils.dragJoint(
          this.activeSrv.selectedJoint,
          new Coord(this.activeSrv.selectedJoint.x, this.activeSrv.selectedJoint.y)
        );
        this.jointForm.patchValue(
          { xPos: this.nup.formatValueAndUnit(value, this.settingsService.length.getValue()) },
          { emitEvent: false }
        );
        this.mechanismService.onMechUpdateState.next(2);
      }
    });

    this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseLengthString(
        val!,
        this.settingsService.length.getValue()
      );
      if (!success) {
        this.jointForm.patchValue({ yPos: this.activeSrv.selectedJoint.y.toFixed(2).toString() });
      } else {
        this.activeSrv.selectedJoint.y = value;
        this.gridUtils.dragJoint(
          this.activeSrv.selectedJoint,
          new Coord(this.activeSrv.selectedJoint.x, this.activeSrv.selectedJoint.y)
        );
        this.jointForm.patchValue(
          { yPos: this.nup.formatValueAndUnit(value, this.settingsService.length.getValue()) },
          { emitEvent: false }
        );
        this.mechanismService.onMechUpdateState.next(2);
      }
    });

    this.jointForm.controls['angle'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseAngleString(
        val!,
        this.settingsService.angle.getValue()
      );
      if (!success) {
        this.jointForm.patchValue({
          angle: (this.activeSrv.selectedJoint as PrisJoint).angle.toFixed(2).toString(),
        });
      } else {
        (this.gridUtils.getSliderJoint(this.activeSrv.selectedJoint) as PrisJoint).angle =
          this.nup.convertAngle(value, this.settingsService.angle.getValue(), AngleUnit.RADIAN);
        this.jointForm.patchValue(
          { angle: this.nup.formatValueAndUnit(value, this.settingsService.angle.getValue()) },
          { emitEvent: false }
        );
        this.mechanismService.onMechUpdateState.next(2);
      }
    });

    this.jointForm.controls['ground'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.activeSrv.selectedJoint.ground = val!;
      this.mechanismService.updateMechanism();
      this.mechanismService.onMechUpdateState.next(2);
    });

    this.jointForm.controls['input'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.activeSrv.selectedJoint.input = val!;
      this.mechanismService.updateMechanism();
      this.mechanismService.onMechUpdateState.next(2);
    });

    this.jointForm.controls['slider'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.mechanismService.toggleSlider();
      this.mechanismService.updateMechanism();
      this.mechanismService.onMechUpdateState.next(2);
    });

    this.linkForm.controls['length'].valueChanges.subscribe((val) => {
      const [success, value] = this.nup.parseLengthString(
        val!,
        this.settingsService.length.getValue()
      );
      if (!success) {
        this.linkForm.patchValue({
          length: this.activeSrv.selectedLink.length.toFixed(2).toString(),
        });
      } else {
        this.activeSrv.selectedLink.length = value;
        this.resolveNewLink();
        this.mechanismService.onMechUpdateState.next(2);
        this.linkForm.patchValue(
          { length: this.nup.formatValueAndUnit(value, this.settingsService.length.getValue()) },
          { emitEvent: false }
        );
      }
    });

    this.linkForm.controls['angle'].valueChanges.subscribe((val) => {
      const [success, value] = this.nup.parseAngleString(
        val!,
        this.settingsService.angle.getValue()
      );
      if (!success) {
        this.linkForm.patchValue({
          angle: this.activeSrv.selectedLink.angleDeg.toFixed(2).toString(),
        });
      } else {
        const [num, unit] = this.nup.preProcessInput(val!);
        var correctAngle = 0;
        if (this.nup.getAngleUnit(unit) !== this.settingsService.angle.getValue()) {
          correctAngle = this.nup.convertAngle(
            num,
            this.nup.getAngleUnit(unit),
            this.settingsService.angle.getValue()
          );
          console.log(correctAngle);
        } else {
          correctAngle = num;
        }
        this.activeSrv.selectedLink.angleDeg =
          this.nup.getAngleUnit(unit) == AngleUnit.DEGREE
            ? parseFloat(val!)
            : this.nup.convertAngle(parseFloat(val!), AngleUnit.RADIAN, AngleUnit.DEGREE);
        this.activeSrv.selectedLink.angleRad =
          this.nup.getAngleUnit(unit) == AngleUnit.RADIAN
            ? parseFloat(val!)
            : this.nup.convertAngle(parseFloat(val!), AngleUnit.DEGREE, AngleUnit.RADIAN);
        this.resolveNewLink();
        this.mechanismService.onMechUpdateState.next(2);
        this.linkForm.patchValue(
          { angle: this.nup.formatValueAndUnit(correctAngle, this.nup.getAngleUnit(unit)) },
          { emitEvent: false }
        );
      }
      this.activeSrv.fakeUpdateSelectedObj();
    });

    this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
      if (newObjType == 'Joint') {
        const angleTemp = this.gridUtils.isAttachedToSlider(this.activeSrv.selectedJoint)
          ? (this.gridUtils.getSliderJoint(this.activeSrv.selectedJoint) as PrisJoint).angle
          : -999;
        this.jointForm.patchValue(
          {
            xPos: this.nup.formatValueAndUnit(
              this.activeSrv.selectedJoint.x,
              this.settingsService.length.getValue()
            ),
            yPos: this.nup.formatValueAndUnit(
              this.activeSrv.selectedJoint.y,
              this.settingsService.length.getValue()
            ),
            angle: this.nup.formatValueAndUnit(angleTemp, this.settingsService.angle.getValue()),
            ground: this.activeSrv.selectedJoint.ground,
            input: this.activeSrv.selectedJoint.input,
            slider: this.gridUtils.isAttachedToSlider(this.activeSrv.selectedJoint),
          },
          { emitEvent: false }
        );
      } else if (newObjType == 'Link') {
        this.linkForm.patchValue(
          {
            length: this.nup.formatValueAndUnit(
              this.activeSrv.selectedLink.length,
              this.settingsService.length.getValue()
            ),
            angle: this.nup.formatValueAndUnit(
              this.settingsService.angle.getValue() == AngleUnit.DEGREE
                ? this.activeSrv.selectedLink.angleDeg
                : this.activeSrv.selectedLink.angleRad,
              this.settingsService.angle.getValue()
            ),
          },
          { emitEvent: false }
        );
      }
    });
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
        let newJ2 = getNewOtherJointPos(
          this.activeSrv.selectedLink.joints[0],
          this.activeSrv.selectedLink.angleRad,
          this.activeSrv.selectedLink.length
        );
        this.gridUtils.dragJoint(this.activeSrv.selectedLink.joints[1] as RevJoint, newJ2);
      }
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
}
