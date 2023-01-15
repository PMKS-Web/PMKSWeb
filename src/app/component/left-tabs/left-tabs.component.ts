import { Component, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-left-tabs',
  templateUrl: './left-tabs.component.html',
  styleUrls: ['./left-tabs.component.scss'],
  animations: [
    trigger('openClose', [
      // ...
      state(
        'open',
        style({
          transform: 'translateX(0)',
          width: '300px',
        })
      ),
      state(
        'closed',
        style({
          transform: 'translateX(calc(-100% - 70px))',
        })
      ),
      state(
        'openWide',
        style({
          width: '400px', //Be careful, there are multiple places to change this value
        })
      ),

      transition('open => openWide', [animate('0.1s ease-in-out')]),
      transition('openWide => open', [animate('0.1s ease-in-out')]),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
  ],
})
export class LeftTabsComponent {
  openTab = 3; //Default open tab to "Edit" /
  isOpen = true; // Is the tab open?

  tabClicked(tabID: number) {
    if (!this.isOpen) {
      this.isOpen = true;
      this.openTab = tabID;
    } else {
      if (this.openTab === tabID) {
        this.isOpen = false;
      } else {
        this.openTab = tabID;
      }
    }
    // console.warn(this.openTab);
    // console.warn(this.isOpen);
  }
}
