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
      ground: [false, [Validators.required]],
      input: [false, [Validators.required]],
    },
    { updateOn: 'blur' }
  );

  ngOnInit(): void {
    console.log(this.jointForm);
    // console.log(this.profileForm);
    this.onChanges();
  }

  onChanges(): void {
    this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
      if (this.jointForm.controls['xPos'].invalid) {
        this.jointForm.patchValue({ xPos: this.activeSrv.Joint.x.toString() });
      } else {
        this.activeSrv.Joint.x = parseFloat(val!);
        GridComponent.dragJoint(this.activeSrv.Joint, new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y));
      }
    });

    this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
      console.warn(val);
      if (this.jointForm.controls['yPos'].invalid) {
        this.jointForm.patchValue({ yPos: this.activeSrv.Joint.y.toString() });
      } else {
        this.activeSrv.Joint.y = parseFloat(val!);
        GridComponent.dragJoint(this.activeSrv.Joint, new Coord(this.activeSrv.Joint.x, this.activeSrv.Joint.y));
      }
    });

    this.jointForm.controls['ground'].valueChanges.subscribe((val) => {
      console.warn(val);
      this.activeSrv.Joint.ground = val!;
    });

    this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
      if (newObjType == 'Joint') {
        this.jointForm.patchValue({
          xPos: this.activeSrv.Joint.x.toString(),
          yPos: this.activeSrv.Joint.y.toString(),
          ground: this.activeSrv.Joint.ground,
          input: this.activeSrv.Joint.input,
        });
      }
    });
  }
}
