import { Component, OnInit} from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';


@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
})
export class EditPanelComponent implements OnInit{
  constructor(private activeObjService: ActiveObjService) { }
  activeObj: RealJoint | RealLink | Force = new RealJoint("NA",0,0);
  activeJoint: RealJoint | undefined;
  activeObjType: string = 'Nothing';

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
  }


}
