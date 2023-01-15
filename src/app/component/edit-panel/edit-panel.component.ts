import { AfterContentInit, AfterViewInit, Component, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint, RevJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { FormBuilder, Validators, FormArray } from '@angular/forms';
import { GridComponent } from '../grid/grid.component';
import { Coord } from 'src/app/model/coord';
import { getNewOtherJointPos } from 'src/app/model/utils';
import { AnimationBarComponent } from '../animation-bar/animation-bar.component';

@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
})
export class EditPanelComponent implements OnInit, AfterContentInit {
  hideEditPanel() {
    return AnimationBarComponent.animate === true || GridComponent.mechanismTimeStep !== 0;
  }
  constructor(public activeSrv: ActiveObjService, private fb: FormBuilder) {}

  numRegex = '^-?[0-9]+(.[0-9]{0,10})?$';

  jointForm = this.fb.group(
    {
      xPos: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      yPos: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      ground: [false, { updateOn: 'change' }],
      input: [false, { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  linkForm = this.fb.group(
    {
      length: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      angle: ['', [Validators.required, Validators.pattern(this.numRegex)]],
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
      if (this.jointForm.controls['xPos'].invalid) {
        this.jointForm.patchValue({ xPos: this.activeSrv.Joint.x.toFixed(2).toString() });
      } else {
        this.activeSrv.Joint.x = parseFloat(val!);
        GridComponent.dragJoint(
          this.activeSrv.Joint,
          new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y)
        );
      }
    });

    this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) return;
      if (this.jointForm.controls['yPos'].invalid) {
        this.jointForm.patchValue({ yPos: this.activeSrv.Joint.y.toFixed(2).toString() });
      } else {
        this.activeSrv.Joint.y = parseFloat(val!);
        GridComponent.dragJoint(
          this.activeSrv.Joint,
          new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y)
        );
      }
    });

    this.jointForm.controls['ground'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.activeSrv.Joint.ground = val!;
      GridComponent.updateMechanism();
    });

    this.jointForm.controls['input'].valueChanges.subscribe((val) => {
      if (this.hideEditPanel()) {
        return;
      }
      this.activeSrv.Joint.input = val!;
      GridComponent.updateMechanism();
    });

    this.linkForm.controls['length'].valueChanges.subscribe((val) => {
      if (this.linkForm.controls['length'].invalid) {
        this.linkForm.patchValue({
          length: this.activeSrv.Link.length.toFixed(2).toString(),
        });
      } else {
        this.activeSrv.Link.length = parseFloat(val!);
        this.resolveNewLink();
      }
    });

    this.linkForm.controls['angle'].valueChanges.subscribe((val) => {
      if (this.linkForm.controls['angle'].invalid) {
        this.linkForm.patchValue({
          angle: this.activeSrv.Link.angleDeg.toFixed(2).toString(),
        });
      } else {
        this.activeSrv.Link.angleDeg = parseFloat(val!);
        this.resolveNewLink();
      }
    });

    this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
      if (newObjType == 'Joint') {
        this.jointForm.patchValue({
          xPos: this.activeSrv.Joint.x.toFixed(2).toString(),
          yPos: this.activeSrv.Joint.y.toFixed(2).toString(),
          ground: this.activeSrv.Joint.ground,
          input: this.activeSrv.Joint.input,
        });
      } else if (newObjType == 'Link') {
        this.linkForm.patchValue({
          length: this.activeSrv.Link.length.toFixed(2).toString(),
          angle: this.activeSrv.Link.angleDeg.toFixed(2).toString(),
        });
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
