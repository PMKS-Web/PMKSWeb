import { Component, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';

@Component({
  selector: 'app-left-tabs',
  templateUrl: './left-tabs.component.html',
  styleUrls: ['./left-tabs.component.scss']
})
export class LeftTabsComponent implements OnInit {
  openTab = 1; //Default open tab
  constructor(private activeObjService: ActiveObjService) { }
  activeObj: RealJoint | RealLink | Force | undefined;

  ngOnInit(): void {
    this.activeObjService.onActiveObjChange.subscribe((newObj: RealJoint | RealLink | Force | undefined) => {
      // console.log('LeftTabsComponent: ' + newPhrase);
      this.activeObj = newObj;
    })
  }

  tabClicked(tabID: number) {
    if (this.openTab === tabID) {
      this.openTab = 0;
    }else{
      this.openTab = tabID;
    }
  }



}
