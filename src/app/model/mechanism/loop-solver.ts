import { Joint, PrisJoint, RealJoint, RevJoint } from '../joint';
import { Link } from '../link';

export class LoopSolver {
  static determineLoops(joints: Joint[], links: Link[]): [string[], string[]] {
    let allLoops: string[] = [];
    let requiredLoops: string[] = [];
    const groundJoints: Joint[] = [];
    joints.forEach((j) => {
      if (!(j instanceof RealJoint) || !j.ground) {
        return;
      }
      if (
        j.input ||
        j.connectedJoints.findIndex((jt) => {
          if (!(jt instanceof RealJoint)) {
            return;
          }
          jt.input;
        }) !== -1
      ) {
        groundJoints.unshift(j);
      } else {
        groundJoints.push(j);
      }
    });
    if (groundJoints.length <= 2) {
      // TODO: just have the binary link be the loop and return something
    }
    // find loops from one ground joint to another ground joint
    while (groundJoints.length >= 2) {
      const desiredGround = groundJoints.shift()!;
      if (!(desiredGround instanceof RealJoint)) {
        continue;
      }
      desiredGround.connectedJoints.forEach((cj) => {
        const [validLoops, requiredSubLoops] = this.findGround(cj, groundJoints, cj.id, desiredGround.id + cj.id, [], [], desiredGround.input, links);
        allLoops = allLoops.concat(validLoops);
        requiredLoops = requiredLoops.concat(requiredSubLoops);
      });
    }
    return [allLoops, requiredLoops];
  }

  // Searches through neighboring joints until ground joint is found
  private static findGround(
    joint: Joint,
    groundJoints: Joint[],
    linkPath: string,
    path: string,
    allFoundLoops: string[],
    requiredLoops: string[],
    storeJointPath: boolean,
    links: Link[]
  ): [string[], string[]] {
    if (!(joint instanceof RealJoint)) {
      return [allFoundLoops, requiredLoops];
    }
    joint.connectedJoints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      if (linkPath.includes(j.id)) {
        return;
      }
      if (j.ground) {
        if (groundJoints.indexOf(j) === -1) {
          return;
        }
        if (storeJointPath) {
          // const currentPathLoop = requiredLoops.find((loop) => loop[loop.length - 2] === j.id);
          path = path + j.id;
          let requiredLoop = true;
          const traveledLinks = [];
          for (let letterIndex = 1; letterIndex < path.length; letterIndex++)
          {
            if (!requiredLoop) {
              continue;
            }
            const curLink = links.find(l => l.joints.findIndex(j => j.id === path[letterIndex - 1]) !== -1 && l.joints.findIndex(j => j.id === path[letterIndex]) !== -1);
            if (curLink === undefined) {
              requiredLoop = false;
              continue
            }
            if (traveledLinks.findIndex(l_id => l_id === curLink.id) !== -1) {
              requiredLoop = false;
            } else {
              traveledLinks.push(curLink.id);
            }
          }
          if (requiredLoop) {
            requiredLoops.push(path + path[0]);
            // requiredLoops.push(path + j.id + path[0]);
          }
          // MAKE SURE THAT PATH HAS NOT TRAVELED TO THE SAME LINK
          // if (currentPathLoop === undefined) {
          //   requiredLoops.push(path + j.id + path[0]);
          // } else if (currentPathLoop.length > path.length + 2) {
          //   requiredLoops.splice(requiredLoops.indexOf(currentPathLoop), 1);
          //   requiredLoops.push(path + j.id + path[0]);
          // }
        }
        // allFoundLoops.push(path + j.id + path[0]);
        allFoundLoops.push(path + path[0]);
      } else {
        [allFoundLoops, requiredLoops] = this.findGround(j, groundJoints, linkPath + j.id, path + j.id, allFoundLoops, requiredLoops, storeJointPath, links);
      }
    });
    return [allFoundLoops, requiredLoops];
  }
}
