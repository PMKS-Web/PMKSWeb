import { Injectable } from '@angular/core';
import { stringToBoolean, stringToFloat, stringToShape } from '../model/utils';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Bound, Link, Piston, RealLink } from '../model/link';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { MechanismService } from './mechanism.service';

@Injectable({
  providedIn: 'root',
})
export class UrlProcessorService {
  constructor(mechanismSrv: MechanismService) {
    const jointPropsString: string = this.splitURLInfo('j=');
    const linkPropsString: string = this.splitURLInfo('&l=');
    const forcePropsString: string = this.splitURLInfo('&f=');
    if (jointPropsString.length === 0 || linkPropsString.length === 0) {
      return;
    }
    const jointStringArray = jointPropsString.split('\n');
    const jointArray = [] as Joint[];
    jointStringArray.forEach((jointString) => {
      if (jointString.length === 0) {
        return;
      }
      const propsArray = jointString.split(',');
      // todo: needs input error checking
      const id = propsArray[0];
      const x = stringToFloat(propsArray[1]);
      const y = stringToFloat(propsArray[2]);
      // const linkIDArray = propsArray[3].split('|');
      // const links = this.getLinksByIds(linkIDArray, linkArray);
      // const links = propsArray[3];
      const type = propsArray[4];
      const ground = stringToBoolean(propsArray[5]);
      // const coefficient_of_friction = propsArray[7];
      const input = stringToBoolean(propsArray[7]);
      let joint: Joint;
      switch (type) {
        case 'R':
          joint = new RevJoint(id, x, y, input, ground);
          break;
        case 'P':
          joint = new PrisJoint(id, x, y, input, ground);
          if (!(joint instanceof PrisJoint)) {
            return;
          }
          const angle = stringToFloat(propsArray[6]);
          joint.angle = angle;
          break;
        default:
          return;
      }
      jointArray.push(joint);
    });
    const linkStringArray = linkPropsString.split('\n');
    const linkArray = [] as Link[];
    linkStringArray.forEach((linkString) => {
      if (linkString.length === 0) {
        return;
      }
      const propsArray = linkString.split(',');
      // todo: needs input error checking
      const id = propsArray[0];
      const typeOfLink = propsArray[1];
      const jointIDArray = propsArray[6].split('|');
      // const forceIDArray = propsArray[7].split('|');
      let joints: RealJoint[] = [];
      jointIDArray.forEach((jointID) => {
        const joint = jointArray.find((jt) => jt.id === jointID)!;
        if (!(joint instanceof RealJoint)) {
          return;
        }
        // TODO: Maybe put check here to see if they got a joint
        joints.push(joint);
      });
      let newLink: Link;
      switch (typeOfLink) {
        case 'R':
          const mass = stringToFloat(propsArray[2]);
          const mass_moi = stringToFloat(propsArray[3]);
          const CoM_X = stringToFloat(propsArray[4]);
          const CoM_Y = stringToFloat(propsArray[5]);
          const CoM = new Coord(CoM_X, CoM_Y);
          const shape = stringToShape(propsArray[8]);
          // const shapeFullname = this.shapeNicknameToFullname(propsArray[7]);
          // const shape = this.stringToShape(shapeFullname);

          const b1 = new Coord(stringToFloat(propsArray[9]), stringToFloat(propsArray[10]));
          const b2 = new Coord(stringToFloat(propsArray[11]), stringToFloat(propsArray[12]));
          const b3 = new Coord(stringToFloat(propsArray[13]), stringToFloat(propsArray[14]));
          const b4 = new Coord(stringToFloat(propsArray[15]), stringToFloat(propsArray[16]));
          const arrow_x = (b1.x + b2.x + b3.x + b4.x) / 4;
          const arrow_y = (b1.x + b2.x + b3.x + b4.x) / 4;
          const arrow = new Coord(arrow_x, arrow_y);

          const bound: Bound = new (class implements Bound {
            arrow: Coord = arrow;
            b1: Coord = b1;
            b2: Coord = b2;
            b3: Coord = b3;
            b4: Coord = b4;
          })();
          newLink = new RealLink(id, joints, mass, mass_moi, shape, bound, CoM);
          break;
        case 'P':
          newLink = new Piston(id, joints);
          break;
        default:
          return;
      }

      // const newLink = new RealLink(id, joints, shape, { b1: b1, b2: b2, b3: b3, b4: b4, arrow: arrow });
      // TODO: Set the code as below and also include mass, massMoI, and CoM. This important for links with other link shapes
      // const newLinks = new RealLink(id, joints, shape, bound);
      // newLink.mass = mass;
      // newLink.massMoI = mass_moi;
      // newLink.CoM.x = CoM_X;
      // newLink.CoM.y = CoM_Y;
      for (let j_index = 0; j_index < joints.length - 1; j_index++) {
        for (let next_j_index = j_index + 1; next_j_index < joints.length; next_j_index++) {
          joints[j_index].connectedJoints.push(joints[next_j_index]);
          joints[next_j_index].connectedJoints.push(joints[j_index]);
        }
      }
      joints.forEach((j) => {
        j.links.push(newLink);
      });
      linkArray.push(newLink);
    });
    const forceStringArray = forcePropsString.split('\n');
    const forceArray = [] as Force[];
    forceStringArray.forEach((forceString) => {
      if (forceString.length === 0) {
        return;
      }
      const propsArray = forceString.split(',');

      const id = propsArray[0];
      const linkId = propsArray[1];
      const link = linkArray.find((l) => {
        return l.id === linkId;
      });
      // if (!link) { throw new Error('link referenced in force does not exist'); }
      if (!(link instanceof RealLink)) {
        return;
      }
      const start = new Coord(stringToFloat(propsArray[2]), stringToFloat(propsArray[3]));
      const end = new Coord(stringToFloat(propsArray[4]), stringToFloat(propsArray[5]));
      const global = stringToBoolean(propsArray[6]);
      const direction = stringToBoolean(propsArray[7]);
      const mag = stringToFloat(propsArray[8]);
      const newForce = new Force(id, link, start, end, global);
      newForce.arrowOutward = direction;
      newForce.mag = mag;
      link.forces.push(newForce);
      forceArray.push(newForce);
    });
    mechanismSrv.joints = jointArray;
    mechanismSrv.links = linkArray;
    mechanismSrv.forces = forceArray;

    console.log('mechanismSrv.joints', mechanismSrv.joints);
    console.log('mechanismSrv.links', mechanismSrv.links);
    mechanismSrv.updateMechanism();
  }

  splitURLInfo(str: string): string {
    const decodedURL = decodeURI(window.location.href);
    let indexVal = decodedURL.indexOf(str);
    if (indexVal === -1) {
      return '';
    } else if (str === 'j=') {
      indexVal += 2;
    } else {
      indexVal += 3;
    }
    let nextIndexVal: number;
    switch (str) {
      case 'j=':
        nextIndexVal = decodedURL.indexOf('&l=');
        break;
      case '&l=':
        nextIndexVal = decodedURL.indexOf('&f=');
        break;
      case '&f=':
        nextIndexVal = decodedURL.indexOf('&s=');
        break;
      case '&s=':
        nextIndexVal = decodedURL.length;
        break;
      default:
        throw new Error('ummm??');
    }
    return decodedURL.substring(indexVal, nextIndexVal);
    // return settingArrayString.split(',');
  }
}
