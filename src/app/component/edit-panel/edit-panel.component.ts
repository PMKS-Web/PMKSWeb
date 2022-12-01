import { Component, OnInit} from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { FormBuilder, Validators, FormArray} from '@angular/forms';
import { GridComponent } from '../grid/grid.component';
import { Coord } from 'src/app/model/coord';


@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
})
export class EditPanelComponent implements OnInit{
  constructor(private activeObjService: ActiveObjService, private fb: FormBuilder) { }
  activeObj: RealJoint | RealLink | Force = new RealJoint("NA",0,0);
  activeJoint!: RealJoint;
  activeObjType: string = 'Nothing';

  profileForm = this.fb.group({
    firstName: ['',{ validators: [Validators.required], updateOn: "blur" }],
    lastName: [''],
  });

  numRegex = "^[0-9]+(.[0-9]{0,2})?$";

  jointForm = this.fb.group({
    xPos: ['', [Validators.required, Validators.pattern(this.numRegex)]],
    yPos: [''],
  }, {updateOn: "blur"});

  ngOnInit(): void {
    this.activeObjService.onActiveObjChange.subscribe((newObj: RealJoint | RealLink | Force) => {
      // console.log('LeftTabsComponent: ' + newPhrase);
      this.activeObj = newObj;
      // console.log(this.activeObj instanceof RealJoint);
      if (this.activeObj instanceof RealJoint) {
        this.activeObjType = 'Joint';
        this.activeJoint = this.activeObj;
      }else if (this.activeObj instanceof RealLink) {
        this.activeObjType = 'Link';
      }else if (this.activeObj instanceof Force) {
        this.activeObjType = 'Force';
      }else {
        this.activeObjType = 'Nothing';
      }
    })
    // console.log(this.profileForm);
    this.onChanges();
  }

  onChanges(): void {
    this.jointForm.controls['xPos'].valueChanges.subscribe(val => {
      console.log(val);
      if(this.jointForm.controls['xPos'].invalid){
        this.jointForm.patchValue({xPos: this.activeJoint.x.toString()});
      }
    });
  }

  onSubmit() {
    console.warn(this.jointForm.value);
  }

  onOne() {
    console.log("One");
    this.activeJoint.x += 1;
    GridComponent.dragJoint(this.activeJoint, new Coord(this.activeJoint.x,this.activeJoint.y));
  }

  onTwo() {
    console.log("Two")
  }

  onThree() {
    console.log("Three")
  }

}
