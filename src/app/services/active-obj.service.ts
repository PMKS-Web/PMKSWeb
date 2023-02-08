import { Injectable, EventEmitter } from '@angular/core';
import { Force } from '../model/force';
import { RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';

@Injectable({
  providedIn: 'root',
})
export class ActiveObjService {
  objType: string = 'Nothing';
  Joint!: RealJoint;
  Force!: Force;
  Link!: RealLink;

  constructor() {}

  onActiveObjChange = new EventEmitter<string>();

  fakeUpdateSelectedObj() {
    this.onActiveObjChange.emit(this.objType);
  }

  updateSelectedObj(newActiveObj: any) {
    if (newActiveObj === undefined || newActiveObj === null) {
      this.objType = 'Nothing';
    } else {
      switch (newActiveObj.constructor) {
        case RevJoint: {
          this.objType = 'Joint';
          this.Joint = newActiveObj;
          break;
        }
        case RealLink: {
          this.objType = 'Link';
          this.Link = newActiveObj;
          break;
        }
        case Force: {
          this.objType = 'Force';
          this.Force = newActiveObj;
          break;
        }
      }
    }
    this.onActiveObjChange.emit(this.objType);
  }
}
