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
  activeObj: RealJoint | RealLink | Force | undefined;

  ngOnInit(): void {
    this.activeObjService.onActiveObjChange.subscribe((newObj: RealJoint | RealLink | Force | undefined) => {
      // console.log('LeftTabsComponent: ' + newPhrase);
      this.activeObj = newObj;
    })
  }


}
