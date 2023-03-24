import { Component } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { NewGridComponent } from '../new-grid/new-grid.component';
import {
  gridStates,
  jointStates,
  linkStates,
  forceStates,
  shapeEditModes,
  createModes,
  moveModes,
  roundNumber,
  determineSlope,
  determineYIntersect,
  determineX,
  determineY,
} from '../../model/utils';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { Link, RealLink } from '../../model/link';

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
          width: '500px', //Be careful, there are multiple places to change this value
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

  constructor(
    public activeObjService: ActiveObjService,
    public mechanismService: MechanismService
  ) {}

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

  debugGetGridState() {
    return (
      NewGridComponent.debugGetGridState() +
      ' (' +
      gridStates[NewGridComponent.debugGetGridState()] +
      ')'
    );
  }

  debugGetJointState() {
    return (
      NewGridComponent.debugGetJointState() +
      ' (' +
      jointStates[NewGridComponent.debugGetJointState()] +
      ')'
    );
  }

  debugGetLinkState() {
    return (
      NewGridComponent.debugGetLinkState() +
      ' (' +
      linkStates[NewGridComponent.debugGetLinkState()] +
      ')'
    );
  }

  debugGetForceState() {
    return (
      NewGridComponent.debugGetForceState() +
      ' (' +
      forceStates[NewGridComponent.debugGetForceState()] +
      ')'
    );
  }

  getLinkDesiredOrder() {
    return RealLink.debugDesiredJointsIDs;
  }

  printMechanism() {
    console.log(this.mechanismService.mechanisms[0]);
  }

  printActiveObject() {
    switch (this.activeObjService.objType) {
      case 'Joint':
        console.log(this.activeObjService.selectedJoint);
        break;
      case 'Link':
        console.log(this.activeObjService.selectedLink);
        break;
      case 'Force':
        console.log(this.activeObjService.selectedForce);
        break;
      default:
        console.log('No active object');
    }
  }
}
