import { Injectable, EventEmitter } from '@angular/core';
import { GridComponent } from '../component/grid/grid.component';
import { Force } from '../model/force';
import { RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';

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

  constructor() {}

  onActiveObjChange = new EventEmitter<string>();

  fakeUpdateSelectedObj() {
    this.onActiveObjChange.emit(this.objType);
  }

  updateSelectedObj(newActiveObj: any) {
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
          this.objType = 'Force';
          this.selectedForce = newActiveObj;
          break;
        }
      }
    }
    this.onActiveObjChange.emit(this.objType);
  }
}
