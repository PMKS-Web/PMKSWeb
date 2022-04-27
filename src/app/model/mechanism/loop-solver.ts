import {Joint, PrisJoint, RealJoint, RevJoint} from "../joint";
import {Link} from "../link";

export class LoopSolver {
  static determineLoops(joints: Joint[], links: Link[]): [string[], string[]] {
    let allLoops: string[] = [];
    let requiredLoops: string[] = [];
    const groundJoints: Joint[] = [];
    joints.forEach(j => {
      if (!(j instanceof RealJoint) || (!j.ground)) {return}
      if (j.input || j.connectedJoints.findIndex(jt => {
        if (!(jt instanceof RealJoint)) {return}
        jt.input}) !== -1) {
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
      if (!(desiredGround instanceof RealJoint)) {continue}
      desiredGround.connectedJoints.forEach(cj => {
        const [validLoops, requiredSubLoops] = this.findGround(cj, groundJoints, cj.id,
          desiredGround.id + cj.id, [], [], desiredGround.input);
        allLoops = allLoops.concat(validLoops);
        requiredLoops = requiredLoops.concat(requiredSubLoops);
      });
    }
    // See if all links are determined within requiredLoops
    const links_num = links.length;
    let links_known_count = 0;
    const links_determined_map = new Map<number, number>();
    const joints_to_link_determined = new Map<string, number>();
    const deleteLoop: string[] = [];
    requiredLoops.forEach(loop => {
      let prevLinkIndex: number;
      let currLinkIndex: number;
      for (let i = 0; i < loop.length - 2; i++) {
        if (!joints_to_link_determined.has(loop[i] + loop[i + 1])) {
          const link_index = links.findIndex(cur_link => cur_link.id.includes(loop[i]) && cur_link.id.includes(loop[i + 1]));
          joints_to_link_determined.set(loop[i] + loop[i + 1], link_index);
        }
        if (i === 0) {
          currLinkIndex = joints_to_link_determined.get(loop[i] + loop[i + 1])!;
          continue;
        } else {
          prevLinkIndex = currLinkIndex!;
          currLinkIndex = joints_to_link_determined.get(loop[i] + loop[i + 1])!;
        }
        if (prevLinkIndex === currLinkIndex) {
          deleteLoop.push(loop);
        }
        if (links_determined_map.has(currLinkIndex)) {
          continue;
        }
        links_determined_map.set(currLinkIndex, 1);
        links_known_count++;
      }
    });
    deleteLoop.forEach(loop => {
      requiredLoops = requiredLoops.filter(e => e !== loop);
    });
    if (links_known_count === links_num) {
      return [allLoops, requiredLoops];
    }
    // Add necessary loops from allLoops into requiredLoops
    // 1st: Use Loops where input joint is first
    const temp_all_loops: string[] = [];
    allLoops.forEach(loop => {
      if (loop[0] === requiredLoops[0][0]) {
        temp_all_loops.push(loop);
      }
    });
    // https://stackoverflow.com/questions/16096872/how-to-sort-2-dimensional-array-by-column-value
    // 2nd: Sort the list into sorted 2d_array
    const two_d_array: [string, number][] = [];
    for (let i = 0; i < temp_all_loops.length; i++) {
      two_d_array.push([temp_all_loops[i], temp_all_loops[i].length]);
    }
    two_d_array.sort(sortFunction);
    function sortFunction(a: [string, number], b: [string, number]) {
      if (a[1] === b[1]) {
        return 0;
      } else {
        return (a[1] < b[1]) ? -1 : 1;
      }
    }
    // 3rd: Go through sorted array and add new loops to requiredLoops
    for (let i = 0; i < two_d_array.length; i++) {
      const loop = two_d_array[i][0];
      let noFoundLink = true;
      for (let index = 0; index < loop[0].length - 2; index++) {
        if (joints_to_link_determined.has(loop[index] + loop[index + 1])) {
          continue;
        }
        const link_index = links.findIndex(cur_link => cur_link.id.includes(loop[index]) && cur_link.id.includes(loop[index + 1]));
        joints_to_link_determined.set(loop[index] + loop[index + 1], 1); // doesn't matter what the second number is
        if (links_determined_map.has(link_index)) {
          continue;
        }
        links_determined_map.set(link_index, 1); // doesn't matter what the second number is
        links_known_count++;
        noFoundLink = false;
      }
      if (!noFoundLink) {
        requiredLoops.push(loop);
      }
      if (links_known_count === links_num) {
        return [allLoops, requiredLoops];
      }
    }
    // should not be here... (if we expect the code to actually utilize this
    const error = 'ruh-roh, check this out...';
    return [allLoops, requiredLoops];
  }

// Searches through neighboring joints until ground joint is found
  private static findGround(joint: Joint, groundJoints: Joint[], linkPath: string, path: string, allFoundLoops: string[],
                            requiredLoops: string[], storeJointPath: boolean): [string[], string[]] {
    if (!(joint instanceof RealJoint)) {return [allFoundLoops, requiredLoops]}
    joint.connectedJoints.forEach(j => {
      if (!(j instanceof RealJoint)) {return}
      if (linkPath.includes(j.id)) {
        return;
      }
      if (j.ground) {
        if (groundJoints.indexOf(j) === -1) {
          return;
        }
        if (storeJointPath) {
          const currentPathLoop = requiredLoops.find(loop => loop[loop.length - 2] === j.id);
          if (currentPathLoop === undefined) {
            requiredLoops.push(path + j.id + path[0]);
          } else if (currentPathLoop.length > (path.length + 2)) {
            requiredLoops.splice(requiredLoops.indexOf(currentPathLoop), 1);
            requiredLoops.push(path + j.id + path[0]);
          }
        }
        allFoundLoops.push(path + j.id + path[0]);
      } else {
        [allFoundLoops, requiredLoops] = this.findGround(j, groundJoints, linkPath + j.id, path + j.id,
          allFoundLoops, requiredLoops, storeJointPath);
      }
    });
    return [allFoundLoops, requiredLoops];
  }
}
