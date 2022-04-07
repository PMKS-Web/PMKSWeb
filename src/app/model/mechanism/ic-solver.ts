import {Joint, PrisJoint, RealJoint} from "../joint";
import {Link} from "../link";
import {
  FixedInstantCenter, InstantCenter,
  PermanentInstantCenter,
  PrimaryInstantCenter,
  SecondaryInstantCenter
} from "../instant-center";
import {crossProduct} from "../utils";

export class ICSolver {
  private static usedJoints = Array<Boolean>();
  private static primary_ic_index_map = new Map<string, number>();
  private static link_index_map = new Map<string, number>();
  private static joint_loop_index_map = new Map<string, number>();
  private static link_index_to_primary_ic_index_map = new Map<number, Array<number>>();
  private static link_index_to_secondary_ic_index_map = new Map<number, Array<number>>();
  private static letter_map = new Map<string, string>();
  private static secondary_ic_index_map = new Map<number, Array<number>>();
  private static joint_ic_index_map = new Map<string, number>();
  private static ic_index_map = new Map<string, number>();

  static linksAngVelMap = new Map<string, number>();
  static jointVelMap = new Map<string, [number, number]>();
  private static determineKinSetup = false;

  // Utilized for determining Kinematics for ICs
  private static indexAndLoopToLinkIndexMap = new Map<string, number>();
  private static desiredJointIC = new Map<number, number>();
  private static prevLinkIndex = new Map<number, number>();
  private static desiredIC = new Map<number, number>();
  private static indexAndLoopToFirstICIndex = new Map<string, number>();
  private static IndexAndLoopToSecondICIndices = new Map<string, Array<Array<number>>>();
  private static prevJointIndex = new Map<number, number>();
  static instantCenterIndexMap = new Map<string, number>();

  static resetVariables() {
    this.usedJoints = Array<Boolean>();
    this.primary_ic_index_map = new Map<string, number>();
    this.link_index_map = new Map<string, number>();
    this.joint_loop_index_map = new Map<string, number>();
    this.link_index_to_primary_ic_index_map = new Map<number, Array<number>>();
    this.link_index_to_secondary_ic_index_map = new Map<number, Array<number>>();
    this.letter_map = new Map<string, string>();
    this.secondary_ic_index_map = new Map<number, Array<number>>();
    this.joint_ic_index_map = new Map<string, number>();
    this.ic_index_map = new Map<string, number>();
    this.determineKinSetup = false;
  }

  static createICs(simJoints: Joint[], simLinks: Link[], requiredLoops: string[]) {
    // First, find all primary instant centers
    const primaryICs: Array<PrimaryInstantCenter> = [];
    if (requiredLoops.length < 1) {
      return [];
    }
    requiredLoops.forEach(loop => {
      // store all joint indices within map
      for (let index = 0; index < loop.length; index++) {
        if (!this.joint_loop_index_map.has(loop[index - 1])) {
          this.setJointLoopIndexMap(loop, simJoints, index - 1);
        }
        if (!this.joint_loop_index_map.has(loop[index])) {
          this.setJointLoopIndexMap(loop, simJoints, index);
        }
        if (!this.joint_loop_index_map.has(loop[index + 1])) {
          this.setJointLoopIndexMap(loop, simJoints, index + 1);
        }
      }
      for (let index = 1; index < loop.length - 1; index++) {
        // joint from loop has already been accounted for within primary instant centers map
        if (this.primary_ic_index_map.has(loop[index])) {
          continue;
        }

        const joint1 = simJoints[this.joint_loop_index_map.get(loop[index - 1])!];
        const joint2 = simJoints[this.joint_loop_index_map.get(loop[index])!];
        const joint3 = simJoints[this.joint_loop_index_map.get(loop[index + 1])!];

        // store all link indices given by joint1 and joint2 id
        if (!this.link_index_map.has(joint1.id + joint2.id)) {
          this.setLinkIndexMap(joint1.id, joint2.id, simLinks);
        }
        if (!this.link_index_map.has(joint2.id + joint3.id)) {
          this.setLinkIndexMap(joint2.id, joint3.id, simLinks);
        }
        const firstLinkIndex = this.link_index_map.get(joint1.id + joint2.id)!;
        const secondLinkIndex = this.link_index_map.get(joint2.id + joint3.id)!;
        let curr_ic: PrimaryInstantCenter;
        if (!(joint2 instanceof RealJoint)) {return}
        // create a newly created instant center
        if (joint2.ground) { // FixedInstantCenter
          switch (joint2.constructor) {
            case RealJoint:
              curr_ic = new FixedInstantCenter(joint2.x, joint2.y, firstLinkIndex.toString() + ',' + secondLinkIndex.toString(),
                [], joint2.id);
              break;
            case PrisJoint:
              let desired_angle: number;
              if (joint1 instanceof PrisJoint) {
                desired_angle = joint1.angle;
              } else if (joint3 instanceof PrisJoint) {
                desired_angle = joint3.angle;
              } else {
                return
              }
              // TODO: should be infinity, infinity
              curr_ic = new FixedInstantCenter(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, firstLinkIndex.toString() + ',' + secondLinkIndex.toString(),
                [], joint2.id, desired_angle);
              break;
            default:
              return
          }
        } else { // PermanentInstantCenter
          curr_ic = new PermanentInstantCenter(joint2.x, joint2.y, firstLinkIndex.toString() + ',' + secondLinkIndex.toString(),
            [], joint2.id);
        }
        // if no IC has this link index, create an empty IC
        if (!this.link_index_to_primary_ic_index_map.has(firstLinkIndex)) {
          this.setLinkIndexToPrimaryICIndexMap(firstLinkIndex, []);
        }
        if (!this.link_index_to_primary_ic_index_map.has(secondLinkIndex)) {
          this.setLinkIndexToPrimaryICIndexMap(secondLinkIndex, []);
        }
        // call all instant centers that utilize the desired link index
        const all_i_primary_IC_indices = this.link_index_to_primary_ic_index_map.get(firstLinkIndex)!;
        const all_j_primary_IC_indices = this.link_index_to_primary_ic_index_map.get(secondLinkIndex)!;
        // set ics with common link ic as its neighbor
        this.connectAdjacentICs(all_i_primary_IC_indices, primaryICs, curr_ic);
        this.connectAdjacentICs(all_j_primary_IC_indices, primaryICs, curr_ic);
        // include this primary ICs index into stored primary ics containing desired link
        all_i_primary_IC_indices.push(primaryICs.length);
        all_j_primary_IC_indices.push(primaryICs.length);
        this.setLinkIndexToPrimaryICIndexMap(firstLinkIndex, all_i_primary_IC_indices);
        this.setLinkIndexToPrimaryICIndexMap(secondLinkIndex, all_j_primary_IC_indices);
        this.primary_ic_index_map.set(loop[index], primaryICs.length);
        primaryICs.push(curr_ic);
      }
    });

    // now determine all secondaryICs
    const unknownSecondaryICArray: Array<Array<number>> = [];
    for (let i = 1; i <= simLinks.length; i++) {
      for (let j = i + 1; j <= simLinks.length + 1; j++) {
        for (let k = 0; k < primaryICs.length; k++) {
          if (primaryICs[k].id.includes(i.toString()) && primaryICs[k].id.includes(j.toString())) {
            break;
          }
          if (k === primaryICs.length - 1) {
            unknownSecondaryICArray.push([i, j]);
            if (!this.link_index_to_secondary_ic_index_map.has(i)) {
              this.setLinkIndexToSecondaryICIndexMap(i, []);
            }
            if (!this.link_index_to_secondary_ic_index_map.has(j)) {
              this.setLinkIndexToSecondaryICIndexMap(j, []);
            }
          }
        }
      }
    }
    const unknownSecondaryIC_num = ((simLinks.length + 1) * (simLinks.length) / 2 ) - primaryICs.length;
    const secondaryICs: Array<InstantCenter> = [];
    let count = 0;
    let more_determinable_secondary_ICs = true;
    while (unknownSecondaryICArray.length !== 0 && more_determinable_secondary_ICs) {
      for (let unknownIndex = 0; unknownIndex < unknownSecondaryICArray.length; unknownIndex++) {
        // get unknown link indices
        const [first_link_index, second_link_index] = unknownSecondaryICArray[unknownIndex];
        const all_ics_common_link_1: Array<InstantCenter> = [];
        const all_ics_common_link_2: Array<InstantCenter> = [];
        // get all primary ICs that utilize common link and store their index within all_ics_common_link
        this.link_index_to_primary_ic_index_map.get(first_link_index)!.forEach(
          ic_index => all_ics_common_link_1.push(primaryICs[ic_index]));
        this.link_index_to_primary_ic_index_map.get(second_link_index)!.forEach(
          ic_index => all_ics_common_link_2.push(primaryICs[ic_index]));
        // get all secondary ICs that utilize common link and store their index within all_ics_common_link (if link index within secondary
        // ic exist)
        this.link_index_to_secondary_ic_index_map.get(first_link_index)!.forEach(
          ic_index => {
            const secICs = secondaryICs[ic_index];
            if (secICs === undefined) {return}
            all_ics_common_link_1.push(secondaryICs[ic_index])
          });
        this.link_index_to_secondary_ic_index_map.get(second_link_index)!.forEach(
          ic_index => all_ics_common_link_2.push(secondaryICs[ic_index]));

        let firstCommonPath = '';
        let secondCommonPath = '';
        for (let k = 0; k < all_ics_common_link_1.length; k++) {
          if (!this.letter_map.has(all_ics_common_link_1[k].id + ',' +  first_link_index.toString())) {
            let link_index = all_ics_common_link_1[k].id;
            link_index = link_index.replace(first_link_index.toString(), '');
            link_index = link_index.replace('\,', '');
            this.letter_map.set(all_ics_common_link_1[k].id +  ',' + first_link_index.toString(),  link_index);
          }
          const letter = this.letter_map.get(all_ics_common_link_1[k].id + ',' + first_link_index.toString())!;
          for (let l = 0; l < all_ics_common_link_2.length; l++) {
            if (!all_ics_common_link_2[l].id.includes(letter)) {
              continue;
            }
            if (firstCommonPath === '') {
              firstCommonPath += letter;
            } else {
              secondCommonPath += letter;
            }
            break;
          }
          if (secondCommonPath !== '') {
            break;
          }
        }
        if (secondCommonPath === '') {
          // check here to see if there are no more possible secondary instant centers that can be determined
          if (unknownIndex === unknownSecondaryICArray.length - 1) {
            more_determinable_secondary_ICs = false;
            break;
          }
          continue;
        }
        const ic1 = this.findIC(primaryICs, secondaryICs, firstCommonPath, first_link_index);
        const ic2 = this.findIC(primaryICs, secondaryICs, firstCommonPath, second_link_index);
        const ic3 = this.findIC(primaryICs, secondaryICs, secondCommonPath, first_link_index);
        const ic4 = this.findIC(primaryICs, secondaryICs, secondCommonPath, second_link_index);
        const [m1, b1] = this.determine_m_b(ic1, ic2);
        const [m2, b2] = this.determine_m_b(ic3, ic4);
        let x: number;
        let y: number;
        if (Math.abs(m1) > 9999999) {
          x = ic1.x !== null ? ic1.x : ic2.x;
          y = m2 * x + b2;
        } else if (Math.abs(m2) > 9999999) {
          x = ic3.x !== null ? ic3.x : ic4.x;
          y = m1 * x + b1;
        } else if (Math.abs(m1) < 0.001) {
          y = ic1.y !== null ? ic1.y : ic2.y;
          x = (y - b2) / m2;
        } else if (Math.abs(m2) < 0.001) {
          y = ic3.y !== null ? ic3.y : ic4.y;
          x = (y - b1) / m1;
        } else {
          x = (b2 - b1) / (m1 - m2);
          y = m1 * x + b1;
        }
        const newSecondaryIC = new SecondaryInstantCenter(x, y, first_link_index.toString() + ',' + second_link_index.toString(),
          [], [[ic1.id,  ic2.id], [ic3.id, ic4.id]]);
        const all_i: Array<InstantCenter> = [];
        const all_j: Array<InstantCenter> = [];
        // possible to include all this within certain hashmap ?
        all_ics_common_link_1.forEach(ic => {
          all_i.push(ic);
          ic.connectedICs.push(newSecondaryIC);
        });
        all_ics_common_link_2.forEach(ic => {
          all_j.push(ic);
          ic.connectedICs.push(newSecondaryIC);
        });
        //
        if (!this.secondary_ic_index_map.has(first_link_index)) {
          this.secondary_ic_index_map.set(first_link_index, []);
        }
        if (!this.secondary_ic_index_map.has(second_link_index)) {
          this.secondary_ic_index_map.set(second_link_index, []);
        }
        // TODO: Rethink and check to see if this is necessary
        // const all_i_secondary = this.secondary_ic_index_map.get(first_link_index)!;
        // const all_j_secondary = this.secondary_ic_index_map.get(second_link_index)!;
        // all_i_secondary.forEach(ic => all_i.push(ic));
        // all_j_secondary.forEach(ic => all_j.push(ic));
        all_i.forEach(ic => {
          newSecondaryIC.connectedICs.push(ic);
        });
        all_j.forEach(ic => {
          newSecondaryIC.connectedICs.push(ic);
        });
        const all_i_secondary_IC_indices = this.link_index_to_secondary_ic_index_map.get(first_link_index)!;
        const all_j_secondary_IC_indices = this.link_index_to_secondary_ic_index_map.get(second_link_index)!;
        all_i_secondary_IC_indices.forEach(ic_index => {
          newSecondaryIC.connectedICs.push(secondaryICs[ic_index]);
          secondaryICs[ic_index].connectedICs.push(newSecondaryIC);
        });
        all_j_secondary_IC_indices.forEach(ic_index => {
          newSecondaryIC.connectedICs.push(secondaryICs[ic_index]);
          secondaryICs[ic_index].connectedICs.push(newSecondaryIC);
        });
        let curr_ic_indices: Array<number>;
        curr_ic_indices = this.link_index_to_secondary_ic_index_map.get(first_link_index)!;
        curr_ic_indices.push(secondaryICs.length);
        this.setLinkIndexToSecondaryICIndexMap(first_link_index, curr_ic_indices);
        curr_ic_indices = this.link_index_to_secondary_ic_index_map.get(second_link_index)!;
        curr_ic_indices.push(secondaryICs.length);
        this.setLinkIndexToSecondaryICIndexMap(second_link_index, curr_ic_indices);

        const unk_sec_index = unknownSecondaryICArray.findIndex(ic => ic === unknownSecondaryICArray[unknownIndex]);
        secondaryICs.push(newSecondaryIC);
        unknownSecondaryICArray.splice(unk_sec_index, 1);
        count++;
        break;
      }
    }
    const ICs: Array<InstantCenter> = [];
    primaryICs.forEach(ic => {
      ICs.push(ic);
      this.instantCenterIndexMap.set(ic.id, ICs.length - 1);
    });
    secondaryICs.forEach(ic => {
      ICs.push(ic);
      this.instantCenterIndexMap.set(ic.id, ICs.length - 1);
    });
    return ICs;
  }

  private static determine_m_b(ic1: any, ic2: any) {
    const ninetyDegreesToRad = 90 * Math.PI / 180;
    let m: number;
    if (ic1.x === null) {
      m = Math.tan(ninetyDegreesToRad - ic1.angle);
    } else if (ic2.x === null) {
      m = Math.tan(ninetyDegreesToRad - ic2.angle);
    } else {
      m = (ic2.y - ic1.y) / (ic2.x - ic1.x);
    }
    const b = ic1.y - ic1.x * m;
    return [m, b];
  }

  private static findIC(primaryICs: any[], secondaryICs: any[], l1: any, l2: any) {
    const ic1 = primaryICs.find(ic => ic.id.includes(l1) && ic.id.includes(l2));
    if (ic1 !== undefined) {
      return ic1;
    }
    return secondaryICs.find(ic => ic.id.includes(l1) && ic.id.includes(l2));
  }

  static determineICPos(instantCenters: any[], simJoints: Joint[]) {
    const secondaryICs: Array<SecondaryInstantCenter> = [];
    instantCenters.forEach(ic => {
      // do not want to do this for FixedInstantCenter with an angle (slider)
      if (ic instanceof PermanentInstantCenter || (ic instanceof FixedInstantCenter && ic.x !== null)) {
        if (!this.joint_ic_index_map.has(ic.jointID)) {
          this.joint_ic_index_map.set(ic.jointID, simJoints.findIndex(j => j.id === ic.jointID));
        }
        const joint = simJoints[this.joint_ic_index_map.get(ic.jointID)!];
        ic.x = joint.x;
        ic.y = joint.y;
      } else if (ic instanceof SecondaryInstantCenter) { // instance of SecondaryInstantCenters
        if (!this.ic_index_map.has(ic.desired_ICs[0][0])) {
          this.ic_index_map.set(ic.desired_ICs[0][0], instantCenters.findIndex(curr_ic => curr_ic.id.includes(ic.desired_ICs[0][0])));
        }
        if (!this.ic_index_map.has(ic.desired_ICs[0][1])) {
          this.ic_index_map.set(ic.desired_ICs[0][1], instantCenters.findIndex(curr_ic => curr_ic.id.includes(ic.desired_ICs[0][1])));
        }
        if (!this.ic_index_map.has(ic.desired_ICs[1][0])) {
          this.ic_index_map.set(ic.desired_ICs[1][0], instantCenters.findIndex(curr_ic => curr_ic.id.includes(ic.desired_ICs[1][0])));
        }
        if (!this.ic_index_map.has(ic.desired_ICs[1][1])) {
          this.ic_index_map.set(ic.desired_ICs[1][1], instantCenters.findIndex(curr_ic => curr_ic.id.includes(ic.desired_ICs[1][1])));
        }
        const ic1 = instantCenters[this.ic_index_map.get(ic.desired_ICs[0][0])!];
        const ic2 = instantCenters[this.ic_index_map.get(ic.desired_ICs[0][1])!];
        const ic3 = instantCenters[this.ic_index_map.get(ic.desired_ICs[1][0])!];
        const ic4 = instantCenters[this.ic_index_map.get(ic.desired_ICs[1][1])!];
        const [m1, b1] = this.determine_m_b(ic1, ic2);
        const [m2, b2] = this.determine_m_b(ic3, ic4);
        const x = (b2 - b1) / (m1 - m2);
        const y = m1 * x + b1;
        ic.x = x;
        ic.y = y;
        secondaryICs.push(ic);
      }
    });
    return secondaryICs;
  }

  private static setJointLoopIndexMap(loop: string, simJoints: Joint[], number: number) {
    this.joint_loop_index_map.set(loop[number], simJoints.findIndex(j => j.id === loop[number]));
  }

  private static setLinkIndexToPrimaryICIndexMap(linkIndex: number, primaryICs: any[]) {
    this.link_index_to_primary_ic_index_map.set(linkIndex, primaryICs);
  }

  private static setLinkIndexToSecondaryICIndexMap(linkIndex: number, secondaryICs: any[]) {
    this.link_index_to_secondary_ic_index_map.set(linkIndex, secondaryICs);
  }

  private static setLinkIndexMap(joint1_id: string, joint2_id2: string, simLinks: Link[]) {
    this.link_index_map.set(joint1_id + joint2_id2, simLinks.findIndex(l => l.id.includes(joint1_id) && l.id.includes(joint2_id2)) + 2);
  }

  private static connectAdjacentICs(all_num_primary_IC_indices: Array<number>, primaryICs: any[], curr_ic: PrimaryInstantCenter) {
    all_num_primary_IC_indices.forEach(ic_index => {
      curr_ic.connectedICs.push(primaryICs[ic_index]);
      primaryICs[ic_index].connectedICs.push(curr_ic);
    });
    // is this needed??
    // return [curr_ic, primaryICs];
  }

  static determineKinDataICs(SimulationJoints: Joint[], SimulationLinks: Link[], SimulationInstantCenters: InstantCenter[],
                             requiredLoops: string[], inputAngularVelocity: number) {
    if (!this.determineKinSetup) {
      // const utilizedLinksIndexMap = new Map<string, number>();
      const simICNumToIcIndexMap = new Map<number, number>();
      for (let i = 2; i <= SimulationLinks.length + 1; i++) {
        const ic_index = SimulationInstantCenters.findIndex(ic => ic.id.includes('1') && ic.id.includes(i.toString()));
        simICNumToIcIndexMap.set(i, ic_index);
      }
      const twoJointIDsDeterminedMap = new Map<string, number>();
      const linkIDToLinkIndexMap = new Map<string, number>();
      // Determine linear velocity
      for (let i = 0; i < SimulationJoints.length; i++) {
        const joint = SimulationJoints[i];
        if (!(joint instanceof RealJoint)) {return}
        if (joint.ground) {
          this.jointVelMap.set(joint.id, [0, 0]);
        }
      }
      // 1. first set input link's angular velocity = inputVelocity
      requiredLoops.forEach(loop => {
        // let temp_counter = 1;
        for (let index = 1; index < loop.length - 1; index++) {
          const first_joint_id = loop[index - 1];
          const second_joint_id = loop[index];
          if (twoJointIDsDeterminedMap.has(first_joint_id + second_joint_id)) { // link has already been accounted for
            this.indexAndLoopToFirstICIndex.set(index + loop, -1);
            continue; // should have no need be done here
          }
          const link_index = SimulationLinks.findIndex(l => l.id.includes(first_joint_id) && l.id.includes(second_joint_id));
          twoJointIDsDeterminedMap.set(first_joint_id + second_joint_id, link_index);
          if (linkIDToLinkIndexMap.has(SimulationLinks[link_index].id)) { // link has already been accounted for
            this.indexAndLoopToFirstICIndex.set(index + loop, -1);
            continue; // should have no need be done here
          }
          linkIDToLinkIndexMap.set(SimulationLinks[link_index].id, link_index);
          this.indexAndLoopToLinkIndexMap.set(index + loop, link_index);
          // determine the first instant center
          let first_instant_center_index: number;
          if (index !== loop.length - 2) {
            first_instant_center_index = SimulationInstantCenters.findIndex(ic => {
              if (!(ic instanceof PrimaryInstantCenter)) {return}
              return ic.jointID === first_joint_id;
            });
          } else {
            first_instant_center_index = SimulationInstantCenters.findIndex(ic => {
              if (!(ic instanceof PrimaryInstantCenter)) {return}
              return ic.jointID === second_joint_id;
            });
          }
          this.indexAndLoopToFirstICIndex.set(index + loop, first_instant_center_index);

          // determine the second set of instant centers to utilize
          // const utilized_joint_indices = Array<Array<number>>();
          const utilized_instant_centers_indices = [];
          let second_initial_instant_center_index: number;
          switch (index) {
            case 1:
              second_initial_instant_center_index = SimulationInstantCenters.findIndex(ic => {
                if (!(ic instanceof PrimaryInstantCenter)) {return}
                return ic.jointID === second_joint_id;
              });
              utilized_instant_centers_indices.push([second_initial_instant_center_index]);
              // determine if there are any other joints to the input link (check if joint is connected to two links)
              SimulationLinks[link_index].joints.forEach(jt => {
                // if (jt.id !== first_joint_id && jt.id !== second_joint_id && jt.connectedLinks.length > 1) {
                if (jt.id !== first_joint_id && jt.id !== second_joint_id) {
                  const additional_instant_center_index = SimulationInstantCenters.findIndex(ic => {
                    if (!(ic instanceof PrimaryInstantCenter)) {return}
                    return ic.jointID === jt.id;
                  });
                  utilized_instant_centers_indices.push([additional_instant_center_index]);
                }
              });
              this.IndexAndLoopToSecondICIndices.set(index + loop, utilized_instant_centers_indices);
              break;
            case loop.length - 2: // last link
              second_initial_instant_center_index = SimulationInstantCenters.findIndex(ic => {
                if (!(ic instanceof PrimaryInstantCenter)) {return}
                return ic.jointID === first_joint_id;
              });
              utilized_instant_centers_indices.push([second_initial_instant_center_index]);
              // determine if there are any other joints to the link
              SimulationLinks[link_index].joints.forEach(jt => {
                // if (jt.id !== first_joint_id && jt.id !== second_joint_id && jt.connectedLinks.length > 1) {
                if (jt.id !== first_joint_id && jt.id !== second_joint_id) {
                  const additional_instant_center_index = SimulationInstantCenters.findIndex(ic => {
                    if (!(ic instanceof PrimaryInstantCenter)) {return} {
                      return ic.jointID === jt.id;
                    }
                  });
                  utilized_instant_centers_indices.push([additional_instant_center_index]);
                }
              });
              this.IndexAndLoopToSecondICIndices.set(index + loop, utilized_instant_centers_indices);
              break;
            default: {
              second_initial_instant_center_index = SimulationInstantCenters.findIndex(ic => {
                if (!(ic instanceof PrimaryInstantCenter)) {return}
                return ic.jointID === second_joint_id;
              });
              let similar_instant_center_index: number;
              let similar_ic_num: number;
              // get the instant center that the first two instant centers have in common
              if (SimulationInstantCenters[second_initial_instant_center_index].id.includes(
                SimulationInstantCenters[first_instant_center_index].id[0])) {
                similar_ic_num = Number(SimulationInstantCenters[first_instant_center_index].id[0]);
              } else {
                similar_ic_num = Number(SimulationInstantCenters[first_instant_center_index].id[2]);
              }
              similar_instant_center_index = simICNumToIcIndexMap.get(similar_ic_num)!;
              utilized_instant_centers_indices.push([second_initial_instant_center_index, similar_instant_center_index]);
              // determine if there are any other joints to the input link (check if joint is connected to two links)
              SimulationLinks[link_index].joints.forEach(jt => {
                // if (jt.id !== first_joint_id && jt.id !== second_joint_id && jt.connectedLinks.length > 1) {
                if (jt.id !== first_joint_id && jt.id !== second_joint_id) {
                  const additional_instant_center_index = SimulationInstantCenters.findIndex(ic => {
                    if (!(ic instanceof PrimaryInstantCenter)) {return} // this won't account for tracer joints!
                    return ic.jointID === jt.id;
                  });
                  // get the instant center that the first two instant centers have in common
                  //
                  if (SimulationInstantCenters[additional_instant_center_index].id[0] ===
                    SimulationInstantCenters[first_instant_center_index].id[0]) {
                    similar_ic_num = Number(SimulationInstantCenters[first_instant_center_index].id[0]);
                  } else {
                    similar_ic_num = Number(SimulationInstantCenters[first_instant_center_index].id[2]);
                  }
                  similar_instant_center_index = simICNumToIcIndexMap.get(similar_ic_num)!;
                  utilized_instant_centers_indices.push([additional_instant_center_index, similar_instant_center_index]);
                  // utilized_instant_centers_indices.push([additional_instant_center_index, 0]); // doesn't matter what 2nd argument is
                }
              });
              this.IndexAndLoopToSecondICIndices.set(index + loop, utilized_instant_centers_indices);
              break;
            }
          }
        }
      });
      this.determineKinSetup = true;
    }

    requiredLoops.forEach(loop => {
      for (let counter = 1; counter < loop.length - 1; counter++) {
        const first_ic_index = this.indexAndLoopToFirstICIndex.get(counter + loop)!;
        const first_ic = SimulationInstantCenters[first_ic_index];
        if (first_ic_index === -1) {
          continue;
        }
        const second_ics_indices = this.IndexAndLoopToSecondICIndices.get(counter + loop)!;
        const desired_link_index = this.indexAndLoopToLinkIndexMap.get(counter + loop)!;
        const desired_link = SimulationLinks[desired_link_index];
        switch (counter) {
          case 1:
            this.linksAngVelMap.set(desired_link.id, inputAngularVelocity);
            // utilize input angular velocity to determine velocity of the other links
            second_ics_indices.forEach(second_ic_index => {
              const vel = crossProduct([0, 0, inputAngularVelocity],
                [SimulationInstantCenters[second_ic_index[0]].x - first_ic.x,
                  SimulationInstantCenters[second_ic_index[0]].y - first_ic.y, 0]);
              const second_ic_loop = SimulationInstantCenters[second_ic_index[0]] as PrimaryInstantCenter;
              this.jointVelMap.set(second_ic_loop.jointID, [vel[0], vel[1]]);
              // this.jointVelMap.set(SimulationJoints[0].id, [vel[0], vel[1]]);
            });
            break;
          case loop.length - 2:
            // get the velocity of the first joint and utilize that to determine angular velocity of the link
            // const second_ic = SimulationInstantCenters[second_ics_indices[0][0]] as PrimaryInstantCenter;
            const second_ic = SimulationInstantCenters[second_ics_indices[0][0]] as PrimaryInstantCenter;
            const determined_vel = this.jointVelMap.get(second_ic.jointID)!;
            // This equation is gotten based from the cross product v = w X R
            const angular_vel = - determined_vel[0] / (second_ic.y - first_ic.y);
            this.linksAngVelMap.set(desired_link.id, angular_vel);
            // utilize the angular velocity determined to determine the velocity of the other joints attached to the link
            second_ics_indices.forEach(ic_index_array => {
              if (ic_index_array === second_ics_indices[0]) {
                return;
              }
              const connecting_ic = SimulationInstantCenters[ic_index_array[0]] as PrimaryInstantCenter;
              const vel = crossProduct([0, 0, inputAngularVelocity],
                [connecting_ic.x - first_ic.x, connecting_ic.y - first_ic.y, 0]);
              this.jointVelMap.set(connecting_ic.jointID, [vel[0], vel[1]]);
              // const joint_index = SimulationJoints.findIndex(jt => jt.id === connecting_ic.jointID);
              // this.jointVelMap.set(SimulationJoints[joint_index].id, [vel[0], vel[1]]);
            });
            break;
          default:
            // get the velocity of the first joint and utilize that to determine angular velocity of the link
            const second_ic_helpful_secondary_ic = SimulationInstantCenters[second_ics_indices[0][1]];
            if (!(first_ic instanceof PrimaryInstantCenter)) {return}
            const utilized_vel = this.jointVelMap.get(first_ic.jointID)!;
            // This equation is gotten based from the cross product v = w X R
            // first_ic is ground while second_useful one is a joint where we know the velocity
            const angular_vel_ = - utilized_vel[0] / (first_ic.y - second_ic_helpful_secondary_ic.y);
            this.linksAngVelMap.set(desired_link.id, angular_vel_);
            // utilize the angular velocity determined to determine the velocity of the other joints attached to the link
            // TODO: Account for tracer joints within all cases (probably copy and paste logic below)
            const determined_tracer_joints: Array<string> = [];
            second_ics_indices.forEach(ic_index_array => {
              // if (ic_index_array === second_ics_indices[0]) {
              //   return;
              // }
              if (ic_index_array[0] === -1) {
                // find the tracer joints and determine their velocities
                const undetermined_tracer_joint = desired_link.joints.find(jt => {
                  if (!(jt instanceof RealJoint)) {return}
                  // TODO: change the naming so it's obvious that j is a string and not a joint
                  return jt.links.length !== 2 && determined_tracer_joints.findIndex(j => {
                    return j === jt.id}) === -1});
                if (undetermined_tracer_joint === undefined) {return}
                determined_tracer_joints.push(undetermined_tracer_joint.id);
                const vel = crossProduct([0, 0, angular_vel_], [undetermined_tracer_joint.x - first_ic.x,
                  undetermined_tracer_joint.y - first_ic.y, 0]);
                // const joint_index = SimulationJoints.findIndex(jt => jt.id === undetermined_tracer_joint.id);
                this.jointVelMap.set(undetermined_tracer_joint.id, [vel[0], vel[1]]);
              } else {
                const second_ic_joint = SimulationInstantCenters[ic_index_array[0]] as PrimaryInstantCenter;
                const second_ic_common_ic = SimulationInstantCenters[ic_index_array[1]] as SecondaryInstantCenter;
                const vel = crossProduct([0, 0, angular_vel_],
                  [second_ic_joint.x - second_ic_common_ic.x, second_ic_joint.y - second_ic_common_ic.y, 0]);
                // const vel = cross([0, 0, angular_vel_], [second_ic_joint.x - first_ic.x, second_ic_joint.y - first_ic.y, 0]);
                this.jointVelMap.set(second_ic_joint.jointID, [vel[0], vel[1]]);
              }
              // else {
              //   const ic_sec = SimulationInstantCenters[ic_index_array[1]] as SecondaryInstantCenter;
              //   const ic_prim = SimulationInstantCenters[ic_index_array[0]] as PrimaryInstantCenter;
              //   const vel = cross([0, 0, angular_vel_], [first_ic.x - ic_sec.x, first_ic.y - ic_sec.y, 0]);
              //   const joint_index = SimulationJoints.findIndex(jt => jt.id === ic_prim.jointID);
              //   this.jointVelMap.set(SimulationJoints[joint_index].id, [vel[0], vel[1]]);
              // }
            });
            break;
        }
      }
      // determine angular velocity of link
      // set up angular velocity of link connected to angular velocity
      // first, determine link's angular velocity connected to input joint and determine connecting joint's velocities
      // const input_joint_id = loop[0];
      // const connected_joint_id = loop[1];
      // const input_joint = SimulationJoints.find(j => j.id.includes(input_joint_id));
      // const connected_joint = SimulationJoints.find(j => j.id.includes(connected_joint_id));
      // const connected_link_index = SimulationLinks.findIndex(l => l.id.includes(input_joint_id) && l.id.includes(connected_joint_id));
      // this.linksAngVelMap.set(SimulationLinks[connected_link_index].id, inputAngularVelocity);
      // const vel_input = cross([0, 0, inputAngularVelocity], [connected_joint.x - input_joint.x,
      //   connected_joint.y - input_joint.y, 0]);
      // this.jointVelMap.set(SimulationJoints[connected_link_index].id, [vel_input[0], vel_input[1]]);
      //
      // const num_unknowns = SimulationLinks.length - 1;
      // let counter = 1;
      // while (counter <= num_unknowns) {
      //   const indexAndLoopToLinkIndexMap = this.indexAndLoopToLinkIndexMap.get(counter);
      //   const prev_link_index = this.prevLinkIndex.get(counter);
      //   const desired_ic_index = this.desiredIC.get(counter);
      //   // const desired_ic_index = this.desiredJointIC.get(counter);
      //   const first_ic_index = this.indexAndLoopToFirstICIndex.get(counter);
      //   const second_ic_index = this.IndexAndLoopToSecondICIndices.get(counter);
      //
      //   const prev_link = SimulationLinks[prev_link_index];
      //   const desired_ic = SimulationInstantCenters[desired_ic_index];
      //   // const desired_joint = SimulationJoints.find(jt => jt.id === desired_ic.id);
      //
      //   // const desired_joint = SimulationJoints.find(jt => jt.id === desired_ic.jointID);
      //   const first_ic = SimulationInstantCenters[first_ic_index];
      //   // const known_joint = SimulationJoints.find(jt => jt.id === first_ic.id);
      //   // const known_joint = SimulationJoints.find(jt => jt.id === first_ic.jointID);
      //   const second_ic = SimulationInstantCenters[second_ic_index];
      //
      //   const prev_link_ang_vel = this.linksAngVelMap.get(prev_link.id);
      //   const ang_vel = this.determineAngVelIC(prev_link_ang_vel, desired_ic, first_ic, second_ic);
      //   this.linksAngVelMap.set(SimulationLinks[indexAndLoopToLinkIndexMap].id, ang_vel);
      //   const used_first_ic = first_ic as PrimaryInstantCenter;
      //   const known_joint = SimulationJoints.find(jt => jt.id === used_first_ic.jointID);
      //   const vel = cross([0, 0, ang_vel], [desired_ic.x - first_ic.x, desired_ic.y - first_ic.y, 0]);
      //   const known_joint_vel_x = this.jointVelMap.get(known_joint.id)[0];
      //   const known_joint_vel_y = this.jointVelMap.get(known_joint.id)[1];
      //   this.jointVelMap.set(SimulationJoints[0].id, [vel[0] + known_joint_vel_x, vel[1] + known_joint_vel_y]);
      //
      //   counter++;
      // }
    });
  }

  private static determineAngVelIC(w: number, IC1: InstantCenter, IC2: InstantCenter, IC3: InstantCenter) {
    // utilize cross product for w and IC2 - IC1
    const vel1 = crossProduct([0, 0, w], [IC2.x - IC1.x, IC2.y - IC1.y, 0]);
    // utilize cross product for w and IC3 - IC2
    const vel2 = crossProduct([0, 0, 1], [IC3.x - IC2.x, IC3.y - IC2.y, 0]);
    // eq = vel1(1) == vel2(1);
    // utilize math.js to determine unknown angular velocity
    return (-1 * vel1[0]) / vel2[0];
    // return lusolve(vel2[0], -1 * vel1[0]);
    // return value
  }
}

