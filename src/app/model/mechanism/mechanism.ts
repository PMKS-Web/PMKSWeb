import {Joint} from "../joint";
import {Link} from "../link";
import {Force} from "../force";

export class Mechanism {
  constructor(joints: Joint[], links: Link[], forces: Force[], gravity: boolean, unit: string) {
    const dof = this.determineDegreesOfFreedom(joints, links);
    const inputJointIndex = joints.findIndex(j => j.input);
    if (dof === 1 && inputJointIndex !== -1) {
      this.findFullMovementPos(joints, links, forces, gravity, unit, 10);
    }
  }

  /**
   * steps to determine DOF (Gruebler's Criteron with Exceptions):
   1.determine number of links + ground
   1a. If mechanismn contains parallel linkage, remove from the number of links(N) and number of joints (J1)
   2.determine number of ground joints
   3.determine number of slider joints
   */
  determineDegreesOfFreedom(joints: Joint[], links: Link[]) {
    let N = 0; // start with 1 to account for ground link
    let J1 = 0;
    const J2 = 0;
    let groundNotFound = true;
    joints.forEach(l => {
      N++;
      // TODO: Account for this case later
      // if (this.determineParallelLinkage(l)) {
      //   N -= l.joints.length - 2;
      //   J1 -= (l.joints.length - 2) * 2;
      // }
    });

    joints.forEach(j => {
      // TODO: Account for this instance later
      // if (j instanceof ImagJoint) {
      //   return;
      // }
      switch (j.type) {
        case 'R':
          if (j.ground) {
            J1 += j.links.length;
            if (groundNotFound) {
              N++;
              groundNotFound = false;
            }
          } else {
            J1 += j.links.length - 1;
          }
          break;
        case 'P':
          // N++;
          J1 += j.links.length;
          // J2++;
          break;
      }
    });
    // TODO: Check later to see if this is needed...
    // this.realLinks = N;
    // this.realJoints = J1;
    if (groundNotFound) {
      return NaN;
    }
    return (3 * (N - 1)) - (2 * J1) - J2;
  }

  private findFullMovementPos(joints: Joint[], links: Link[], forces: Force[], gravity: boolean, unit: string, inputAngularVelocity: number) {
    // TODO: Add all this logic later once joints, links, and instant centers are accounted properly
  }
}
