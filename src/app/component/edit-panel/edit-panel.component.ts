import { AfterContentInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { PrisJoint, RevJoint } from 'src/app/model/joint';
import { FormBuilder } from '@angular/forms';
import { Coord } from 'src/app/model/coord';
import {
  AngleUnit,
  ForceUnit,
  getDistance,
  getNewOtherJointPos,
  LengthUnit,
} from 'src/app/model/utils';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { CustomIdService } from '../../services/custom-id.service';

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
    public gridUtils: GridUtilsService,
    public customIDService: CustomIdService
  ) {}

  lengthUnit: LengthUnit = this.settingsService.lengthUnit.value;
  angleUnit: AngleUnit = this.settingsService.angleUnit.value;
  forceUnit: ForceUnit = this.settingsService.forceUnit.value;
  // torqueUnit: TorqueUnit = this.settingsService.inputTorque.value;
  jointForm = this.fb.group(
    {
      xPos: [''],
      yPos: [''],
      angle: [''],
      ground: [false, { updateOn: 'change' }],
      input: [false, { updateOn: 'change' }],
      slider: [false, { updateOn: 'change' }],
      curve: [false, { updateOn: 'change' }],
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
    this.settingsService.lengthUnit.subscribe((val) => {
      switch (
        val
        //when length unit changes, rescale grid?
      ) {
      }
      var unit = this.settingsService.lengthUnit.value;
      if (unit !== this.lengthUnit) {
        this.mechanismService.joints.forEach((joint) => {
          this.activeSrv.updateSelectedObj(joint);
          var wasInput: boolean = this.jointForm.controls['input'].value!;
          this.jointForm.controls['input'].patchValue(false);
          this.activeSrv.selectedJoint.input = false;
          this.activeSrv.fakeUpdateSelectedObj();
          this.gridUtils.dragJoint(
            this.activeSrv.selectedJoint,
            new Coord(
              this.nup.convertLength(joint.x, this.lengthUnit, unit),
              this.nup.convertLength(joint.y, this.lengthUnit, unit)
            )
          );
          this.jointForm.controls['input'].patchValue(wasInput);
        });
        this.lengthUnit = this.settingsService.lengthUnit.value;
        this.activeSrv.fakeUpdateSelectedObj();
      }
    });

    this.settingsService.angleUnit.subscribe((val) => {
      this.activeSrv.fakeUpdateSelectedObj();
    });

    // this.settingsService.inputTorque.subscribe((val) => {
    //   var unit = this.settingsService.inputTorque.value;
    //   if (unit !== this.torqueUnit) {
    //   }
    //   this.torqueUnit = this.settingsService.inputTorque.value;
    //   this.activeSrv.fakeUpdateSelectedObj();
    // });

    this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseLengthString(
        val!,
        this.settingsService.lengthUnit.getValue()
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
          { xPos: this.nup.formatValueAndUnit(value, this.settingsService.lengthUnit.getValue()) },
          { emitEvent: false }
        );
        this.mechanismService.onMechUpdateState.next(2);
      }
    });

    this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseLengthString(
        val!,
        this.settingsService.lengthUnit.getValue()
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
          { yPos: this.nup.formatValueAndUnit(value, this.settingsService.lengthUnit.getValue()) },
          { emitEvent: false }
        );
        this.mechanismService.onMechUpdateState.next(2);
      }
    });

    this.jointForm.controls['angle'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseAngleString(
        val!,
        this.settingsService.angleUnit.getValue()
      );
      if (!success) {
        this.jointForm.patchValue({
          angle: this.nup
            .convertAngle(
              (this.activeSrv.selectedJoint as PrisJoint).angle_rad,
              AngleUnit.RADIAN,
              this.settingsService.angleUnit.getValue()
            )
            .toFixed(2)
            .toString(),
        });
      } else {
        (this.gridUtils.getSliderJoint(this.activeSrv.selectedJoint) as PrisJoint).angle_rad =
          this.nup.convertAngle(value, this.settingsService.angleUnit.getValue(), AngleUnit.RADIAN);
        this.jointForm.patchValue(
          { angle: this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()) },
          { emitEvent: false }
        );
        this.mechanismService.updateMechanism();
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

    this.jointForm.controls['curve'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.gridUtils.toggleCurve(this.activeSrv.selectedJoint);
    });

    this.linkForm.controls['length'].valueChanges.subscribe((val) => {
      const [success, value] = this.nup.parseLengthString(
        val!,
        this.settingsService.lengthUnit.getValue()
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
          {
            length: this.nup.formatValueAndUnit(value, this.settingsService.lengthUnit.getValue()),
          },
          { emitEvent: false }
        );
      }
    });

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
            .toFixed(2)
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
          { angle: this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()) },
          { emitEvent: false }
        );
      }
      this.activeSrv.fakeUpdateSelectedObj();
    });

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
        this.activeSrv.selectedForce.mag = value;
        this.resolveNewForceAngle();
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
    });

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
        this.activeSrv.selectedForce.angleRad = this.nup.convertAngle(
          value,
          this.settingsService.angleUnit.getValue(),
          AngleUnit.RADIAN
        );
        this.resolveNewForceAngle();
        this.mechanismService.onMechUpdateState.next(2);
        this.forceForm.patchValue(
          { angle: this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()) },
          { emitEvent: false }
        );
      }
      this.activeSrv.fakeUpdateSelectedObj();
    });

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
        this.activeSrv.selectedForce.xComp = value;
        this.resolveNewForceMagnitude();
        this.mechanismService.onMechUpdateState.next(2);
        this.forceForm.patchValue(
          {
            xComp: this.nup.formatValueAndUnit(value, this.settingsService.forceUnit.getValue()),
          },
          { emitEvent: false }
        );
      }
    });

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
        this.activeSrv.selectedForce.yComp = value;
        this.resolveNewForceMagnitude();
        this.mechanismService.onMechUpdateState.next(2);
        this.forceForm.patchValue(
          {
            yComp: this.nup.formatValueAndUnit(value, this.settingsService.forceUnit.getValue()),
          },
          { emitEvent: false }
        );
      }
    });

    this.forceForm.controls['isGlobal'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      // this.activeSrv.selectedForce.local = val == '0' ? true : false;
      this.mechanismService.changeForceLocal();
      this.mechanismService.updateMechanism();
      this.mechanismService.onMechUpdateState.next(2);
    });

    this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
      if (newObjType == 'Joint') {
        const angleTemp_rad = this.gridUtils.isAttachedToSlider(this.activeSrv.selectedJoint)
          ? (this.gridUtils.getSliderJoint(this.activeSrv.selectedJoint) as PrisJoint).angle_rad
          : 0;
        this.jointForm.patchValue(
          {
            xPos: this.nup.formatValueAndUnit(
              this.activeSrv.selectedJoint.x,
              this.settingsService.lengthUnit.getValue()
            ),
            yPos: this.nup.formatValueAndUnit(
              this.activeSrv.selectedJoint.y,
              this.settingsService.lengthUnit.getValue()
            ),
            angle: this.nup.formatValueAndUnit(
              this.nup.convertAngle(
                angleTemp_rad,
                AngleUnit.RADIAN,
                this.settingsService.angleUnit.getValue()
              ),
              this.settingsService.angleUnit.getValue()
            ),
            ground: this.activeSrv.selectedJoint.ground,
            input: this.activeSrv.selectedJoint.input,
            slider: this.gridUtils.isAttachedToSlider(this.activeSrv.selectedJoint),
            curve: this.activeSrv.selectedJoint.showCurve,
          },
          { emitEvent: false }
        );
        this.settingsService.globalUnit.next(this.lengthUnit + 30);
      } else if (newObjType == 'Link') {
        this.linkForm.patchValue(
          {
            length: this.nup.formatValueAndUnit(
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
          },
          { emitEvent: false }
        );
      } else if (newObjType == 'Force') {
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
}
