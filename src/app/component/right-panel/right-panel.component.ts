import { Component } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-right-panel',
  templateUrl: './right-panel.component.html',
  styleUrls: ['./right-panel.component.scss'],
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
          transform: 'translateX(calc(100% + 10px))',
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
export class RightPanelComponent {
  static openTab = 0; //Default open tab to "Edit" /
  static isOpen = false; // Is the tab open?

  static tabClicked(tabID: number) {
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

  getOpenTab() {
    return RightPanelComponent.openTab;
  }

  getIsOpen() {
    return RightPanelComponent.isOpen;
  }
}