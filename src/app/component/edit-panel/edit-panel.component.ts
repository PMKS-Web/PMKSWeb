import { AfterContentInit, AfterViewInit, Component, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint, RevJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { FormBuilder, Validators, FormArray } from '@angular/forms';
import { GridComponent } from '../grid/grid.component';
import { Coord } from 'src/app/model/coord';
import { AngleUnit, getNewOtherJointPos, LengthUnit } from 'src/app/model/utils';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';

@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
})
export class EditPanelComponent implements OnInit, AfterContentInit {
  hideEditPanel() {
    return AnimationBarComponent.animate === true || GridComponent.mechanismTimeStep !== 0;
  }
  constructor(
    public activeSrv: ActiveObjService,
    private fb: FormBuilder,
    private nup: NumberUnitParserService
  ) {}

  jointForm = this.fb.group(
    {
      xPos: [''],
      yPos: [''],
      ground: [false, { updateOn: 'change' }],
      input: [false, { updateOn: 'change' }],
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
    GridComponent.animate(5, false);
    GridComponent.mechanismTimeStep = 0;
    GridComponent.updateMechanism();
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

  onChanges(): void {
    this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseLengthString(val!, LengthUnit.CM);
      if (!success) {
        this.jointForm.patchValue({ xPos: this.activeSrv.Joint.x.toFixed(2).toString() });
      } else {
        this.activeSrv.Joint.x = value;
        GridComponent.dragJoint(
          this.activeSrv.Joint,
          new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y)
        );
        this.jointForm.patchValue({ xPos: this.nup.formatValueAndUnit(value, LengthUnit.CM) });
        GridComponent.onMechUpdateState.next(2);
      }
    });

    this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      const [success, value] = this.nup.parseLengthString(val!, LengthUnit.CM);
      if (!success) {
        this.jointForm.patchValue({ yPos: this.activeSrv.Joint.y.toFixed(2).toString() });
      } else {
        this.activeSrv.Joint.y = value;
        GridComponent.dragJoint(
          this.activeSrv.Joint,
          new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y)
        );
        this.jointForm.patchValue({ yPos: this.nup.formatValueAndUnit(value, LengthUnit.CM) });
        GridComponent.onMechUpdateState.next(2);
      }
    });

    this.jointForm.controls['ground'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.activeSrv.Joint.ground = val!;
      GridComponent.updateMechanism();
      GridComponent.onMechUpdateState.next(2);
    });

    this.jointForm.controls['input'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.activeSrv.Joint.input = val!;
      GridComponent.updateMechanism();
      GridComponent.onMechUpdateState.next(2);
    });

    this.linkForm.controls['length'].valueChanges.subscribe((val) => {
      const [success, value] = this.nup.parseLengthString(val!, LengthUnit.CM);
      if (!success) {
        this.linkForm.patchValue({
          length: this.activeSrv.Link.length.toFixed(2).toString(),
        });
      } else {
        this.activeSrv.Link.length = value;
        this.resolveNewLink();
        GridComponent.onMechUpdateState.next(2);
        this.linkForm.patchValue({ length: this.nup.formatValueAndUnit(value, LengthUnit.CM) });
      }
    });

    this.linkForm.controls['angle'].valueChanges.subscribe((val) => {
      const [success, value] = this.nup.parseAngleString(val!, AngleUnit.DEGREE);
      if (!success) {
        this.linkForm.patchValue({
          angle: this.activeSrv.Link.angleDeg.toFixed(2).toString(),
        });
      } else {
        this.activeSrv.Link.angleDeg = parseFloat(val!);
        this.resolveNewLink();
        GridComponent.onMechUpdateState.next(2);
        this.linkForm.patchValue({ angle: this.nup.formatValueAndUnit(value, AngleUnit.DEGREE) });
      }
    });

    this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
      if (newObjType == 'Joint') {
        this.jointForm.patchValue(
          {
            xPos: this.nup.formatValueAndUnit(this.activeSrv.Joint.x, LengthUnit.CM),
            yPos: this.nup.formatValueAndUnit(this.activeSrv.Joint.y, LengthUnit.CM),
            ground: this.activeSrv.Joint.ground,
            input: this.activeSrv.Joint.input,
          },
          { emitEvent: false }
        );
      } else if (newObjType == 'Link') {
        this.linkForm.patchValue(
          {
            length: this.nup.formatValueAndUnit(this.activeSrv.Link.length, LengthUnit.CM),
            angle: this.nup.formatValueAndUnit(this.activeSrv.Link.angleDeg, AngleUnit.DEGREE),
          },
          { emitEvent: false }
        );
      }
    });
  }

  resolveNewLink() {
    if (!this.hideEditPanel()) {
      //If the first joint is ground, then the second joint is dragged
      if ((this.activeSrv.Link.joints[1] as RevJoint).ground) {
        let newJ1 = getNewOtherJointPos(
          this.activeSrv.Link.joints[1],
          this.activeSrv.Link.angleRad + Math.PI,
          this.activeSrv.Link.length
        );
        GridComponent.dragJoint(this.activeSrv.Link.joints[0] as RevJoint, newJ1);
      } else {
        let newJ2 = getNewOtherJointPos(
          this.activeSrv.Link.joints[0],
          this.activeSrv.Link.angleRad,
          this.activeSrv.Link.length
        );
        GridComponent.dragJoint(this.activeSrv.Link.joints[1] as RevJoint, newJ2);
      }
    }
  }

  deleteJoint() {
    // console.log('delete Joint');
    // console.log(this.activeSrv);
    // tempActiveService.updateSelectedObj(undefined);
    //Note: this funciton runs in the buttonBlock to 'this' refer to that, not the edit panel
    //Therefore you need to have a activeSrv in button Block.ts
    this.activeSrv.updateSelectedObj(undefined);
    var temp = new GridComponent(this.activeSrv);
    temp.deleteJoint();
  }

  deleteLink() {
    //Note: this funciton runs in the buttonBlock to 'this' refer to that, not the edit panel
    //Therefore you need to have a activeSrv in button Block.ts
    this.activeSrv.updateSelectedObj(undefined);
    var temp = new GridComponent(this.activeSrv);
    console.log(this.activeSrv.Link.id);
    temp.deleteSelectedLink();
  }
}
