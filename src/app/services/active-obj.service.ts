import { Injectable, EventEmitter } from '@angular/core';
import { Force } from '../model/force';
import { RealJoint } from '../model/joint';
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

  updateSelectedObj(newActiveObj: any) {
    if (newActiveObj === undefined) {
      this.objType = 'Nothing';
    } else {
      switch (newActiveObj.constructor) {
        case RealJoint: {
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

    // if (newActiveObj instanceof RealJoint) {
    //   this.objType = 'Joint';
    //   this.Joint = newActiveObj;
    // } else if (newActiveObj instanceof RealLink) {
    //   this.objType = 'Link';
    //   this.Link = newActiveObj;
    // } else if (newActiveObj instanceof Force) {
    //   this.objType = 'Force';
    //   this.Force = newActiveObj;
    // } else {
    //   this.objType = 'Nothing';
    // }
    this.onActiveObjChange.emit(this.objType);
  }
}
