import { Injectable, EventEmitter } from '@angular/core';
import { GridComponent } from '../component/grid/grid.component';
import { Force } from '../model/force';
import { RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { Coord } from '../model/coord';

@Injectable({
  providedIn: 'root',
})
export class ActiveObjService {
  objType: string = 'Nothing';
  selectedJoint!: RealJoint;
  prevSelectedJoint!: RealJoint;
  selectedForce!: Force;
  selectedLink!: RealLink;
  selectedForceEndPoint: string = '';
  private skipThisSeleciton: boolean = false;

  constructor() {}

  onActiveObjChange = new EventEmitter<string>();

  fakeUpdateSelectedObj() {
    this.onActiveObjChange.emit(this.objType);
  }

  updateSelectedObj(newActiveObj: any, forceParent: Force | null = null) {
    this.prevSelectedJoint = this.selectedJoint;
    if (newActiveObj === undefined || newActiveObj === null) {
      this.objType = 'Grid';
    } else {
      switch (newActiveObj.constructor) {
        case RevJoint: {
          this.objType = 'Joint';
          this.selectedJoint = newActiveObj;
          break;
        }
        case RealLink: {
          this.objType = 'Link';
          this.selectedLink = newActiveObj;
          break;
        }
        case Force: {
          console.log('Force selected');
          this.objType = 'Force';
          this.selectedForce = newActiveObj;
          break;
        }
        case Coord: {
          console.log('Force endpoint selected');
          this.objType = 'Force';
          this.selectedForce = forceParent!;
          this.selectedForce.isStartSelected = false;
          this.selectedForce.isEndSelected = false;
          //This is only for when a force endpoint is slected
          if (this.selectedForce.startCoord === newActiveObj) {
            this.selectedForce.isStartSelected = true;
          } else if (this.selectedForce.endCoord === newActiveObj) {
            this.selectedForce.isEndSelected = true;
          }
          break;
        }
      }
    }
    this.onActiveObjChange.emit(this.objType);
  }
}
