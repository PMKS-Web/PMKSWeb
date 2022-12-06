import { Component, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { FormBuilder, Validators, FormArray } from '@angular/forms';
import { GridComponent } from '../grid/grid.component';
import { Coord } from 'src/app/model/coord';

@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
})
export class EditPanelComponent implements OnInit {
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

  ngOnInit(): void {
    console.log(this.jointForm);
    console.log(this.activeSrv);
    // console.log(this.profileForm);
    this.onChanges();
  }

  onChanges(): void {
    this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
      console.log(this.activeSrv);
      if (this.jointForm.controls['xPos'].invalid) {
        this.jointForm.patchValue({ xPos: this.activeSrv.Joint.x.toString() });
      } else {
        this.activeSrv.Joint.x = parseFloat(val!);
        GridComponent.dragJoint(
          this.activeSrv.Joint,
          new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y)
        );
      }
    });

    this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
      if (this.jointForm.controls['yPos'].invalid) {
        this.jointForm.patchValue({ yPos: this.activeSrv.Joint.y.toString() });
      } else {
        this.activeSrv.Joint.y = parseFloat(val!);
        GridComponent.dragJoint(
          this.activeSrv.Joint,
          new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y)
        );
      }
    });

    this.jointForm.controls['ground'].valueChanges.subscribe((val) => {
      this.activeSrv.Joint.ground = val!;
    });

    this.jointForm.controls['input'].valueChanges.subscribe((val) => {
      this.activeSrv.Joint.input = val!;
    });

    this.linkForm.controls['length'].valueChanges.subscribe((val) => {
      if (this.linkForm.controls['length'].invalid) {
        this.linkForm.patchValue({
          length: this.activeSrv.Link.length.toFixed(2).toString(),
        });
      } else {
        this.activeSrv.Link.length = parseFloat(val!);
      }
    });

    this.linkForm.controls['angle'].valueChanges.subscribe((val) => {
      if (this.linkForm.controls['angle'].invalid) {
        this.linkForm.patchValue({
          angle: this.activeSrv.Link.angleDeg.toFixed(2).toString(),
        });
      } else {
        this.activeSrv.Link.angleDeg = parseFloat(val!);
      }
    });

    this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
      if (newObjType == 'Joint') {
        this.jointForm.patchValue({
          xPos: this.activeSrv.Joint.x.toString(),
          yPos: this.activeSrv.Joint.y.toString(),
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
    temp.deleteLink();
  }
}
