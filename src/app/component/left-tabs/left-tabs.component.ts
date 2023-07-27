import { Component, inject, Inject, OnInit } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';

@Component({
  selector: 'app-left-tabs',
  templateUrl: './left-tabs.component.html',
  styleUrls: ['./left-tabs.component.scss'],
  animations: [
    trigger('activeTab', [
      state(
        '0',
        style({
          visibility: 'hidden',
        })
      ),
      state(
        '1',
        style({
          top: '0px',
        })
      ),
      state(
        '2',
        style({
          top: '53px', //Be careful, there are multiple places to change this value
        })
      ),
      state(
        '3',
        style({
          top: '106px', //Be careful, there are multiple places to change this value
        })
      ),

      transition('* => 0', [animate('0s')]),
      transition('0 => *', [animate('0s')]),
      transition('* => *', [animate('0.1s ease-in-out')]),
    ]),

    trigger('openClose', [
      // ...
      state(
        'open',
        style({
          transform: 'translateX(0)',
          width: '270px', //Be careful, there are multiple places to change this value
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
          width: '420px', //Be careful, there are multiple places to change this value
        })
      ),

      transition('open => openWide', [animate('0.1s ease-in-out')]),
      transition('openWide => open', [animate('0.1s ease-in-out')]),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
  ],
})
export class LeftTabsComponent {
  private analytics: Analytics = inject(Analytics);


  constructor(public tabs: SelectedTabService) {

  }

  public get TabID(): typeof TabID {
    return TabID;
  }

  getTabNum(): number {

    if (!this.tabs.isTabVisible()) return 0;

    switch (this.tabs.getCurrentTab()) {
      case TabID.SYNTHESIZE:
        return 1;
      case TabID.EDIT:
        return 2;
      case TabID.ANALYZE:
        return 3;
    }
  }


  tabClicked(tabID: TabID) {
    if (!this.tabs.isTabVisible()) {
      this.tabs.tabVisible.next(true);
      this.tabs.tabNum.next(tabID);
    } else {
      if (this.tabs.getCurrentTab() === tabID) {
        this.tabs.tabVisible.next(false);
        this.tabs.tabNum.next(0);
      } else {
        this.tabs.tabNum.next(tabID);
      }
    }

    if (this.tabs.isTabVisible()) {
      switch (this.tabs.getCurrentTab()) {
        case TabID.SYNTHESIZE:
          logEvent(this.analytics, 'open_synthesis_tab');
          break;
        case TabID.EDIT:
          logEvent(this.analytics, 'open_edit_tab');
          break;
        case TabID.ANALYZE:
          logEvent(this.analytics, 'open_analysis_tab');
          break;
      }
    }
    // console.warn(this.openTab);
    // console.warn(this.isOpen);
  }
}
