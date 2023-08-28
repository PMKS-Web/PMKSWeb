import { Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Link, Piston, RealLink } from '../model/link';
import { Force } from '../model/force';
import { Mechanism } from '../model/mechanism/mechanism';
import { ToolbarComponent } from '../component/toolbar/toolbar.component';
import { InstantCenter } from '../model/instant-center';
import {
  gridStates,
  jointStates,
  linkStates,
  forceStates,
  shapeEditModes,
  createModes,
  moveModes,
  roundNumber,
  LengthUnit,
  point_on_line_segment_closest_to_point,
  getDistance,
  distance_points,
  GlobalUnit,
} from '../model/utils';
import { BehaviorSubject, connect, Subject } from 'rxjs';
import { GridUtilsService } from './grid-utils.service';
import { ActiveObjService } from './active-obj.service';
import { AnimationBarComponent } from '../component/animation-bar/animation-bar.component';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { SettingsService } from './settings.service';
import { Coord } from '../model/coord';
import { Line } from '../model/line';
import { UrlProcessorService } from './url-processor.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { PositionSolver } from '../model/mechanism/position-solver';
import { ColorService } from './color.service';

@Injectable({
  providedIn: 'root',
})
export class MechanismService {
  public mechanismTimeStep: number = 0;
  public mechanismAnimationIncrement: number = 2;
  public joints: Joint[] = [];
  public links: Link[] = [];
  public forces: Force[] = [];
  public ics: InstantCenter[] = [];
  public mechanisms: Mechanism[] = [];
  public showPathHolder: boolean = true;

  // private moveModes: moveModes = moveModes;
  // private selectedJoint!: RealJoint;

  // This is the state of the mechanism
  // 0 is normal, no changes, no pending analysis
  // 1 is actively being dragged, no pending analysis, disable graphs
  // 2 is pending graph draws
  // 3 is pending analysis due to add or remove
  onMechUpdateState = new BehaviorSubject<number>(3);

  //The which timestep the mechanims is in
  onMechPositionChange = new Subject<number>();

  constructor(
    public gridUtils: GridUtilsService,
    public activeObjService: ActiveObjService,
    private settingsService: SettingsService,
    private nup: NumberUnitParserService
  ) {}

  // delete mechanism and reset
  resetMechanism() {
    this.joints = [];
    this.links = [];
    this.forces = [];
    this.mechanismTimeStep = 0;
    this.updateMechanism();
    this.onMechPositionChange.next(3);
  }

  // whether there is a valid mechanism
  exists(): boolean {
    return this.joints.length > 0;
  }

  getJoints() {
    return this.joints;
  }

  getLinks() {
    return this.links as RealLink[];
  }

  getForces() {
    return this.forces;
  }

  updateMechanism() {
    // console.log(this.mechanisms[0]);
    //There are multiple mechanisms since there was a plan to support multiple mechanisms
    //You can treat this as a single mechanism for now at index 0
    this.mechanisms = [];
    // TODO: Determine logic later once everything else is determined
    let inputAngularVelocity = this.settingsService.inputSpeed.value;
    if (this.settingsService.isInputCW.value) {
      inputAngularVelocity = inputAngularVelocity * -1;
    }
    let unitStr = 'cm';
    switch (this.settingsService.globalUnit.value) {
      case GlobalUnit.ENGLISH:
        unitStr = 'cm';
        break;
      case GlobalUnit.METRIC:
        unitStr = 'cm';
        break;
      case GlobalUnit.NULL:
        unitStr = 'cm';
        break;
      case GlobalUnit.SI:
        unitStr = 'cm';
        break;
      default:
        break;
    }
    this.mechanisms.push(
      //This creates a new mechanism with the current state of the joints, links, forces, and ics
      //If the mechnaism is simulatable, it will generate loops and all future time steps
      new Mechanism(
        this.joints,
        this.links,
        this.forces,
        this.ics,
        this.settingsService.isForces.value,
        unitStr,
        inputAngularVelocity
      )
    );
    this.links.forEach((l) => {
      if (l instanceof RealLink) {
        if (l.isWelded) {
          //Call reCompute on each link in the subset
          l.subset.forEach((subLink) => {
            (subLink as RealLink).reComputeDPath();
          });
        }
        (l as RealLink).reComputeDPath();
      }
    });
    this.activeObjService.fakeUpdateSelectedObj();
  }

  updateLinkageUnits(fromUnits: LengthUnit, toUnits: LengthUnit) {
    // For each joint, move the joint
    this.joints.forEach((joint) => {
      this.gridUtils.dragJoint(
        joint as RealJoint,
        new Coord(
          this.nup.convertLength(joint.x, fromUnits, toUnits),
          this.nup.convertLength(joint.y, fromUnits, toUnits)
        )
      );
    });
    // this.settingsService.lengthUnit.subscribe((val) => {
    //For each jo
    // let unit = this.settingsService.lengthUnit.value;
    // if (unit !== this.lengthUnit) {
    //   this.mechanismService.joints.forEach((joint) => {
    //     this.activeSrv.updateSelectedObj(joint);
    //     this.activeSrv.fakeUpdateSelectedObj();
    //     this.gridUtils.dragJoint(
    //       this.activeSrv.selectedJoint,
    //       new Coord(
    //         this.nup.convertLength(joint.x, this.lengthUnit, unit),
    //         this.nup.convertLength(joint.y, this.lengthUnit, unit)
    //       )
    //     );
    //     this.jointForm.controls['input'].patchValue(wasInput);
    //   });
    //   this.lengthUnit = this.settingsService.lengthUnit.value;
    //   this.activeSrv.fakeUpdateSelectedObj();
    // }
    // });
  }

  getLinkProp(l: Link, propType: string) {
    if (l instanceof Piston) {
      return;
    }
    const link = l as RealLink;
    switch (propType) {
      case 'mass':
        return link.mass;
      case 'massMoI':
        return link.massMoI;
      case 'CoMX':
        return link.CoM.x;
      case 'CoMY':
        // TODO: Implement logic to not have -1?
        return link.CoM.y * -1;
      case 'd':
        return link.d;
      case 'fill':
        return link.fill;
      case 'CoM_d1':
        return link.CoM_d1;
      case 'CoM_d2':
        return link.CoM_d2;
      case 'CoM_d3':
        return link.CoM_d3;
      case 'CoM_d4':
        return link.CoM_d4;
      default:
        return '?';
    }
  }

  getJointPath(joint: Joint) {
    if (this.mechanisms[0].joints[0].length === 0) {
      return '';
    }
    let string = 'M';
    const jointIndex = this.joints.findIndex((j) => j.id === joint.id);
    string +=
      this.mechanisms[0].joints[0][jointIndex].x.toString() +
      ' , ' +
      this.mechanisms[0].joints[0][jointIndex].y.toString();
    for (let j_index = 1; j_index < this.mechanisms[0].joints.length; j_index++) {
      string +=
        'L' +
        this.mechanisms[0].joints[j_index][jointIndex].x.toString() +
        ' , ' +
        this.mechanisms[0].joints[j_index][jointIndex].y.toString();
    }
    return string;
  }

  oneValidMechanismExists() {
    if (this.mechanisms.length == 0 || this.mechanisms[0] === undefined) {
      return false;
    }
    return this.mechanisms[0].isMechanismValid();
  }

  mergeToJoints(joints: Joint[]) {
    joints.forEach((j) => {
      this.joints.push(j);
    });
  }

  mergeToLinks(links: Link[]) {
    links.forEach((l) => {
      this.links.push(l);
    });
  }

  determineNextLetter(additionalLetters?: string[]) {
    let lastLetter = '';
    if (this.joints.length === 0 && additionalLetters === undefined) {
      return 'A';
    }
    this.joints.forEach((j) => {
      if (j.id > lastLetter) {
        lastLetter = j.id;
      }
    });
    additionalLetters?.forEach((l) => {
      if (l > lastLetter) {
        lastLetter = l;
      }
    });
    return String.fromCharCode(lastLetter.charCodeAt(0) + 1);
  }

  createRevJoint(x: string, y: string, prevID?: string) {
    const x_num = roundNumber(Number(x), 3);
    const y_num = roundNumber(Number(y), 3);
    let id: string;
    if (prevID === undefined) {
      id = this.determineNextLetter();
    } else {
      id = this.determineNextLetter([prevID]);
    }
    return new RevJoint(id, x_num, y_num);
  }

  toggleWeldedJoint() {
    const joint = this.joints.find(
      (j) => j.id === this.activeObjService.selectedJoint.id
    ) as RealJoint;

    if (!joint.isWelded) {
      this.weldJoint();
    } else if (joint.isWelded) {
      this.unweldSelectedJoint();
    }
    this.updateMechanism();
  }

  private createNewCompoundLink(linksToWeld: RealLink[]): RealLink {
    const newLinkJoints: Joint[] = [];

    //Copy all joints in all links to newLinkJoints
    linksToWeld.forEach((link) => {
      link.joints.forEach((j) => {
        if (newLinkJoints.findIndex((jo) => jo.id === j.id) === -1) {
          newLinkJoints.push(j);
        }
      });
    });

    //Make sure newLinkJoints only contains unique joints (not sure if this is needed...)
    newLinkJoints.filter((j, index) => {
      return newLinkJoints.indexOf(j) === index;
    });

    let subsetForNewLink: Link[] = [];

    //For each link in linksToWeld, if the link has a subset, add it to the newLink's subset, else add the link to the newLink's subset
    linksToWeld.forEach((link) => {
      link.subset.length > 0
        ? (subsetForNewLink = subsetForNewLink.concat(link.subset))
        : subsetForNewLink.push(link);
    });

    const newLink = new RealLink('', newLinkJoints, 0, 0, new Coord(0, 0), subsetForNewLink);

    //Now find the ID for the new link by concatenating all the joint ids, make sure to sort and remove duplicates
    const id = newLinkJoints
      .map((j) => j.id)
      .sort()
      .filter((v, i, a) => a.indexOf(v) === i)
      .reduce((a, b) => a + b, '');
    newLink.id = id;
    return newLink;
  }

  private createNewCompoundLinkFromSubset(subset: Link[]): RealLink {
    let newLinkJoints: Joint[] = [];
    subset.forEach((l) => {
      l.joints.forEach((j) => {
        newLinkJoints.push(j);
      });
    });
    //Filter out duplicate joints
    newLinkJoints = newLinkJoints.filter((v, i, a) => a.indexOf(v) === i);
    //Find the new id for the new link by concatenating all the joint ids
    let id = newLinkJoints.reduce((a, b) => a + b.id, '');
    const newLink = new RealLink(id, newLinkJoints, 0, 0, new Coord(0, 0), subset);
    return newLink;
  }

  deleteJoint() {
    const jointIndex = this.gridUtils.findJointIDIndex(
      this.activeObjService.selectedJoint.id,
      this.joints
    );
    //if the joint that is meant to be deleted is the one selected in activeObjectSrv, set the activeObjectSrv to undefined
    if (
      this.activeObjService.objType === 'Joint' &&
      this.activeObjService.selectedJoint.id === this.activeObjService.selectedJoint.id
    ) {
      this.activeObjService.updateSelectedObj(undefined);
    }

    this.activeObjService.selectedJoint.links.forEach((l) => {
      // TODO: May wanna check this to be sure...
      if (l.joints.length < 3) {
        // TODO: Utilize this same logic when you delete ImagJoint and ImagLink
        // TODO: this.deleteJointFromConnectedJoints(delJoint);
        // TODO: this.deleteLinkFromConnectedLinks(delLink);
        // delete forces on link
        if (l instanceof RealLink) {
          l.forces.forEach((f) => {
            const forceIndex = this.forces.findIndex((fo) => fo.id === f.id);
            this.forces.splice(forceIndex, 1);
          });
        }
        // go to other connected joint and remove this link from its connectedLinks and joint from connectedJoint
        // There may be an easier way to do this but this logic works :P
        const desiredJointID =
          l.joints[0].id === this.activeObjService.selectedJoint.id
            ? l.joints[1].id
            : l.joints[0].id;
        const desiredJointIndex = this.gridUtils.findJointIDIndex(desiredJointID, this.joints);
        const deleteJointIndex = this.gridUtils.findJointIDIndex(
          this.activeObjService.selectedJoint.id,
          (this.joints[desiredJointIndex] as RealJoint).connectedJoints
        );
        (this.joints[desiredJointIndex] as RealJoint).connectedJoints.splice(deleteJointIndex, 1);
        const deleteLinkIndex = (this.joints[desiredJointIndex] as RealJoint).links.findIndex(
          (lin) => {
            if (!(lin instanceof RealLink)) {
              return;
            }
            return lin.id === l.id;
          }
        );
        (this.joints[desiredJointIndex] as RealJoint).links.splice(deleteLinkIndex, 1);
        // remove link from links
        const deleteLinkIndex2 = this.links.findIndex((li) => li.id === l.id);
        this.links.splice(deleteLinkIndex2, 1);
      } else {
        l.joints.forEach((jt) => {
          if (!(jt instanceof RealJoint)) {
            return;
          }
          if (jt.id === this.activeObjService.selectedJoint.id) {
            return;
          }
          const deleteJointIndex = jt.connectedJoints.findIndex(
            (jjj) => jjj.id === this.activeObjService.selectedJoint.id
          );
          jt.connectedJoints.splice(deleteJointIndex, 1);
        });
        l.id = l.id.replace(this.activeObjService.selectedJoint.id, '');
        const delJointIndex = l.joints.findIndex(
          (jj) => jj.id === this.activeObjService.selectedJoint.id
        );
        l.joints.splice(delJointIndex, 1);
        // TODO: We should put this within a helper function since I feel that this function is called often in the code...
        if (!(l instanceof RealLink)) {
          return;
        }
        const subsetNum = l.subset.length;
        if (subsetNum === 0) {
          return;
        }
        let idSubs: string[] = [];
        l.subset.forEach((s) =>
          idSubs.push(s.id.replace(this.activeObjService.selectedJoint.id, ''))
        );

        function deleteJointFromLink(l: Link, j: Joint) {
          let delJointIndex = l.joints.findIndex((jt) => jt.id === j.id);
          if (delJointIndex === -1) {
            return;
          }
          l.joints.splice(delJointIndex, 1);
          l.id = l.id.replace(j.id, '');
          delJointIndex = l.fixedLocations.findIndex((fixed) => fixed.id === j.id);
          if (delJointIndex === -1) {
            return;
          }
          l.fixedLocations.splice(delJointIndex, 1);
          if (l.fixedLocation.fixedPoint === j.id) {
            l.fixedLocation.fixedPoint = 'com';
          }
        }

        for (
          let l_subset_index = 0;
          l_subset_index < l.subset.length;
          l_subset_index = l_subset_index + 1
        ) {
          const sub = l.subset[l_subset_index];
          const selectedJoint = this.activeObjService.selectedJoint;
          deleteJointFromLink(l, selectedJoint);
          deleteJointFromLink(sub, selectedJoint);
          const tempIdSubs = idSubs.filter((str) => str !== sub.id);
          // sub contains id that is not shared with any other subset
          if (!sub.id.split('').some((char) => tempIdSubs.some((str) => str.includes(char)))) {
            // This link will be pushed to this.links
            if (sub.joints.length > 1) {
              sub.joints.forEach((childJoint) => {
                if (!(childJoint instanceof RealJoint)) {
                  return;
                }
                let delLinkIndex = childJoint.links.findIndex((li) => li.id === l.id);
                childJoint.links.splice(delLinkIndex, 1);
                childJoint.links.push(sub);
                childJoint.connectedJoints = [];
                childJoint.links.forEach((li) => {
                  if (!(li instanceof RealLink)) {
                    return;
                  }
                  li.joints.forEach((jt) => {
                    // childJoint does not contain this joint and it is not replicate of itself
                    if (
                      childJoint.connectedJoints.findIndex((jt2) => jt2.id === jt.id) !== -1 ||
                      jt.id === childJoint.id
                    ) {
                      return;
                    }
                    childJoint.connectedJoints.push(jt);
                  });
                });
                // childSub.link.forEach(jt => childJoint.connectedJoints.push(jt));
              });
              this.links.push(sub);
              // This is an orphaned joint
            } else if (sub.joints.length === 1) {
              // Check for condition 1 (remove joint and continue from logic)
              const curSubIndex = l.subset.findIndex((su) => su.id === sub.id);
              let cond1 = false;
              l.subset.forEach((su, su_index) => {
                if (!(su instanceof RealLink) || su_index === curSubIndex) {
                  return;
                }
                if (su.joints.findIndex((jt) => jt.id === sub.joints[0].id) !== -1) {
                  cond1 = true;
                }
              });
              if (cond1) {
                // just splice the l_sub_index from l.subset
                l.subset.splice(l_subset_index, 1);
                l_subset_index = l_subset_index - 1;
                continue;
              }
              // regular orphaned joint
              const delLinkIndex = (sub.joints[0] as RealJoint).links.findIndex(
                (li) => li.id === l.id
              );
              (sub.joints[0] as RealJoint).links.splice(delLinkIndex, 1);
              (sub.joints[0] as RealJoint).connectedJoints = [];
              (sub.joints[0] as RealJoint).links.forEach((childLink) => {
                if (!(childLink instanceof RealLink)) {
                  return;
                }
                // Check to see if joint from link already within connectedJoints
                childLink.joints.forEach((jt) =>
                  (sub.joints[0] as RealJoint).connectedJoints.push(jt)
                );
              });
              const fixedLocationIndex = l.fixedLocations.findIndex(
                (fixedloc) => fixedloc.id === sub.joints[0].id
              );
              l.fixedLocations.splice(fixedLocationIndex, 1);
              if (l.fixedLocation.fixedPoint === sub.joints[0].id) {
                l.fixedLocation.fixedPoint = 'com';
              }
              if (cond1) {
                l.subset.splice(l_subset_index, 1);
                l_subset_index = l_subset_index - 1;
                continue;
              }
            }
            const sliceIndex = l.subset.findIndex((s) => s.id === sub.id);
            l.subset.splice(sliceIndex, 1);
            // go through the original link (l) and make sure
            // 1. the link does not contain any joints from sub
            // 2. l's joints' neighboring joint does not contain joints from sub
            sub.joints.forEach((jt) => {
              if (!(jt instanceof RealJoint)) {
                return;
              }
              const deleteJointIndex = l.joints.findIndex((jt2) => jt2.id === jt.id);
              if (deleteJointIndex === -1) {
                return;
              }
              l.joints.splice(deleteJointIndex, 1);
              l.id = l.id.replace(jt.id, '');
            });
            l.joints.forEach((jt) => {
              if (!(jt instanceof RealJoint)) {
                return;
              }
              for (
                let connectedJointIndex = 0;
                connectedJointIndex < jt.connectedJoints.length;
                connectedJointIndex++
              ) {
                const jt2 = jt.connectedJoints[connectedJointIndex] as RealJoint;
                // if jt2 within sub, splice jt2
                const delConnectedJoint = sub.joints.findIndex((jt3) => jt3.id === jt2.id) !== -1;
                if (delConnectedJoint) {
                  jt.connectedJoints.splice(connectedJointIndex, 1);
                  connectedJointIndex = connectedJointIndex - 1;
                }
                // make sure the deletedJoint is also not a connectedJoint
              }
            });
            l_subset_index = l_subset_index - 1;
          } else if (sub.id.length === 1) {
            // special case, can slice this subset
            l.subset.splice(l_subset_index, 1);
            l_subset_index = l_subset_index - 1;
          }
        }
        // Now that all subsets have been gone over, do the final check
        if (l.subset.length === 1) {
          l = l.subset[0];
          const delLinkIndex = this.links.findIndex((li) => li.id === l.id);
          this.links.splice(delLinkIndex, 1);
          this.links.push(l);
          l.joints.forEach((jt) => {
            if (!(jt instanceof RealJoint)) {
              return;
            }
            jt.isWelded = false;
            jt.links = [];
            jt.links.push(l);
          });
        } else if (l.subset.length === 0) {
          const sliceIndex = this.links.findIndex((li) => li.id === l.id);
          this.links.splice(sliceIndex, 1);
        }
      }

      if (l instanceof Piston) {
        //Special case, remove the other joint on a pistion
        l.joints.forEach((j) => {
          if (j.id !== this.activeObjService.selectedJoint.id) {
            this.joints.splice(this.gridUtils.findJointIDIndex(j.id, this.joints), 1);
          }
        });
      }

      // for any forces that are outside of the link, move them to the closest point on the hull
      if (l instanceof RealLink) {
        l.forces.forEach((f) => {
          if (!(l instanceof RealLink)) {
            return;
          }
          let fx = f.startCoord.x;
          let fy = f.startCoord.y;

          // if force is already inside hull, do nothing
          if (l.isPointInsideHull(fx, fy)) {
            return;
          }

          // go through hull and find closest point
          let hull = l.getHullPoints();
          let closestDistance = -1;
          let cx, cy;
          for (let i = 0; i < hull.length - 1; i++) {
            let x1 = hull[i][0];
            let y1 = hull[i][1];
            let x2 = hull[i + 1][0];
            let y2 = hull[i + 1][1];

            [cx, cy] = point_on_line_segment_closest_to_point(fx, fy, x1, y1, x2, y2);
            let distance = distance_points(fx, fy, cx, cy);

            if (closestDistance === -1 || distance < closestDistance) {
              closestDistance = distance;
              fx = cx;
              fy = cy;
            }
          }

          // (fx, fy) is now the closest point on the hull to the force start position
          // move force there
          f.moveForceTo(fx, fy);
        });
      }
    });

    function deleteJointWithinLinkAndSubsets(link: RealLink, joint: Joint) {
      // Delete desired properties within link
      link.id = link.id.replace(joint.id, '');
      const fixedLocationIndex = link.fixedLocations.findIndex((fl) => fl.id === joint.id);
      if (fixedLocationIndex !== -1) {
        if (link.fixedLocation.fixedPoint === joint.id) {
          link.fixedLocation.fixedPoint = 'com';
        }
        link.fixedLocations.splice(fixedLocationIndex, 1);
      }
      const jointIndex = link.joints.findIndex((j) => j.id === joint.id);
      if (jointIndex !== -1) {
        link.joints.splice(jointIndex, 1);
      }
      // Check to see if link contains multiple subsets
      if (!link.isWelded) {
      } else {
        link.subset.forEach((li) => {
          if (!(li instanceof RealLink)) {
            return;
          }
          deleteJointWithinLinkAndSubsets(li, joint);
        });
      }
    }

    // Need to update the link's subset properties
    if (this.activeObjService.selectedJoint) {
      this.activeObjService.selectedJoint.links.forEach((l) => {
        if (!(l instanceof RealLink)) {
          return;
        }
        deleteJointWithinLinkAndSubsets(l, this.activeObjService.selectedJoint);
      });
    }
    this.joints.splice(jointIndex, 1);
    // if (this.activeObjService.selectedLink !== undefined) {
    //   this.activeObjService.selectedLink.d = this.activeObjService.selectedLink.getPathString();
    // }
    this.updateMechanism();
    setTimeout(() => {
      this.onMechUpdateState.next(3);
    });
  }

  splitSubset(subset: Link[], joint: RealJoint): Link[][] {
    //We need to stop assuming there are two links connected to the joint, there could be more
    const linksConnectedToJoint = subset.filter((l) => l.joints.includes(joint));

    const subsets: Link[][] = [];
    linksConnectedToJoint.forEach((l) => {
      //Find the subset of links excluding the current link
      const avoidThese = linksConnectedToJoint.filter((ll) => ll.id !== l.id);
      subsets.push(this.findConnectedLinksReccusively(l, avoidThese, subset, []));
    });

    return subsets;
  }

  deleteForce() {
    const forceIndex = this.forces.findIndex(
      (f) => f.id === this.activeObjService.selectedForce.id
    );
    this.forces.splice(forceIndex, 1);
    this.updateMechanism();
  }

  changeForceDirection() {
    NewGridComponent.sendNotification('This feature is coming soon!');
    // this.activeObjService.selectedForce.arrowOutward =
    //   !this.activeObjService.selectedForce.arrowOutward;
    // if (this.activeObjService.selectedForce.arrowOutward) {
    //   this.activeObjService.selectedForce.forceArrow =
    //     this.activeObjService.selectedForce.createForceArrow(
    //       this.activeObjService.selectedForce.startCoord,
    //       this.activeObjService.selectedForce.endCoord
    //     );
    // } else {
    //   this.activeObjService.selectedForce.forceArrow =
    //     this.activeObjService.selectedForce.createForceArrow(
    //       this.activeObjService.selectedForce.endCoord,
    //       this.activeObjService.selectedForce.startCoord
    //     );
    // }
    // this.updateMechanism();
  }

  changeForceLocal() {
    this.activeObjService.selectedForce.local = !this.activeObjService.selectedForce.local;
    if (this.activeObjService.selectedForce.local) {
      this.activeObjService.selectedForce.stroke = 'blue';
      this.activeObjService.selectedForce.fill = 'blue';
    } else {
      this.activeObjService.selectedForce.stroke = 'black';
      this.activeObjService.selectedForce.fill = 'black';
    }
    this.updateMechanism();
  }

  addJointAtCOM() {
    let link = this.activeObjService.selectedLink;
    let com = link.CoM;
    //To avoid visually breaking the link by having it perfectly line up
    //Find the first two joints of the link and move the com perpendicular to the line
    let joint1 = link.joints[0];
    let joint2 = link.joints[1];

    //Get the angle of the line between the two joints
    let angle = Math.atan2(joint2.y - joint1.y, joint2.x - joint1.x);
    //Get the perpendicular angle
    let perpAngle = angle + Math.PI / 2;
    //Get the perpendicular vector
    let perpVector = new Coord(Math.cos(perpAngle), Math.sin(perpAngle));
    //Scale this vector to be 0.01
    perpVector = perpVector.normalize().scale(0.01);
    //Add this vector to the com
    com = com.add(perpVector);

    this.addJointAt(com);
  }

  addJointAt(coord: Coord) {
    const newId = this.determineNextLetter();
    const newJoint = new RevJoint(newId, coord.x, coord.y);
    this.activeObjService.selectedLink.joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      j.connectedJoints.push(newJoint);
      newJoint.connectedJoints.push(j);
    });
    if (
      this.activeObjService.selectedLink.isWelded &&
      this.activeObjService.selectedLink.lastSelectedSublink
    ) {
      this.activeObjService.selectedLink.lastSelectedSublink.id =
        this.activeObjService.selectedLink.lastSelectedSublink?.id.concat(newJoint.id);
      this.activeObjService.selectedLink.lastSelectedSublink.fixedLocations.push({
        id: newJoint.id,
        label: newJoint.id,
      });
      this.activeObjService.selectedLink.lastSelectedSublink.joints.push(newJoint);
    }
    newJoint.links.push(this.activeObjService.selectedLink);
    this.activeObjService.selectedLink.joints.push(newJoint);
    this.activeObjService.selectedLink.id += newJoint.id;
    this.activeObjService.selectedLink.d = this.activeObjService.selectedLink.getPathString();
    this.joints.push(newJoint);
    this.onMechUpdateState.next(3);
    this.updateMechanism();
  }

  deleteLink() {
    console.log(this.activeObjService);
    if (
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink.id === this.activeObjService.selectedLink.id
    ) {
      this.activeObjService.updateSelectedObj(undefined);
    }
    // console.warn(this.activeObjService.Link);
    const linkIndex = this.links.findIndex((l) => l.id === this.activeObjService.selectedLink.id);
    this.links[linkIndex].joints.forEach((j) => {
      //Remove the deleted link from the other joints of the delLink
      if (!(j instanceof RealJoint)) {
        return;
      }
      const delLinkIndex = j.links.findIndex((l) => l.id === this.activeObjService.selectedLink.id);
      j.links.splice(delLinkIndex, 1);
      if (j.links.length === 0) {
        this.joints.splice(this.gridUtils.findJointIDIndex(j.id, this.joints), 1);
      }
    });
    for (let j_i = 0; j_i < this.links[linkIndex].joints.length - 1; j_i++) {
      for (let next_j_i = j_i + 1; next_j_i < this.links[linkIndex].joints.length; next_j_i++) {
        // TODO: Should recreate a function for this... (kinda too lazy atm)
        const joint = this.links[linkIndex].joints[j_i];
        if (!(joint instanceof RealJoint)) {
          return;
        }
        const desiredJointIndex = joint.connectedJoints.findIndex(
          (jj) => jj.id === this.links[linkIndex].joints[next_j_i].id
        );
        joint.connectedJoints.splice(desiredJointIndex, 1);
        const otherJoint = this.links[linkIndex].joints[next_j_i];
        if (!(otherJoint instanceof RealJoint)) {
          return;
        }
        const otherDesiredJointIndex = otherJoint.connectedJoints.findIndex(
          (jj) => jj.id === this.links[linkIndex].joints[j_i].id
        );
        otherJoint.connectedJoints.splice(otherDesiredJointIndex, 1);
      }
    }
    this.activeObjService.selectedLink.forces.forEach(f => {
      const forceIndex = this.forces.findIndex(force => force.id === f.id);
      this.forces.splice(forceIndex, 1);
    });
    this.links.splice(linkIndex, 1);
    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  toggleGround() {
    //Should be called toggleGround
    if (this.activeObjService.selectedJoint instanceof PrisJoint) {
      const revJoint = this.activeObjService.selectedJoint.connectedJoints.find(
        (j) => j instanceof RevJoint
      )!;
      if (!(revJoint instanceof RevJoint)) {
        return;
      }

      this.activeObjService.selectedJoint.connectedJoints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.connectedJoints.findIndex(
          (jt) => jt.id === this.activeObjService.selectedJoint.id
        );
        j.connectedJoints.splice(removeIndex, 1);
      });
      const piston = this.links.find((l) => l instanceof Piston)!;
      piston.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        const removeIndex = j.links.findIndex((l) => l.id === piston.id);
        j.links.splice(removeIndex, 1);
      });
      const prismaticJointIndex = this.joints.findIndex(
        (j) => j.id == this.activeObjService.selectedJoint.id
      );
      const pistonIndex = this.links.findIndex((l) => l.id === piston.id);
      this.joints.splice(prismaticJointIndex, 1);
      this.links.splice(pistonIndex, 1);

      revJoint.ground = true;
      // let joint = this.activeObjService.selectedJoint as RevJoint;
      // // TODO: Be sure to remove connected joints and links that are ImagJoint and ImagLinks
      // joint = new RevJoint(joint.id, joint.x, joint.y, joint.input, joint.ground, joint.links, joint.connectedJoints);
      // const selectedJointIndex = this.findJointIDIndex(this.activeObjService.selectedJoint.id, this.joints);
      // this.joints[selectedJointIndex] = joint;
    } else {
      this.activeObjService.selectedJoint.ground = !this.activeObjService.selectedJoint.ground;
      this.activeObjService.selectedJoint.input = false;
    }
    this.updateMechanism();
  }

  adjustInput() {
    let jointToToggleInput: RealJoint;
    if (this.gridUtils.isAttachedToSlider(this.activeObjService.selectedJoint)) {
      //Find the prismatic joint and toggle ground
      jointToToggleInput = this.gridUtils.getSliderJoint(
        this.activeObjService.selectedJoint
      ) as RealJoint;
    } else {
      //Normal joint case
      jointToToggleInput = this.activeObjService.selectedJoint;
    }

    //If we are about to enable input, we need to check to see if there is an existing input joint
    if (!jointToToggleInput.input) {
      //Go through all other joints and disable input
      this.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.input) {
          j.input = false;
        }
      });
    }

    //Toggle the input joint
    jointToToggleInput.input = !jointToToggleInput.input;

    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  toggleSlider() {
    if (!this.gridUtils.isAttachedToSlider(this.activeObjService.selectedJoint)) {
      // Create Prismatic Joint
      const selectedJointInput = this.activeObjService.selectedJoint.input;
      this.activeObjService.selectedJoint.input = false;
      this.activeObjService.selectedJoint.ground = false;
      const prismaticJointId = this.determineNextLetter();
      const inputJointIndex = this.findInputJointIndex();
      const connectedJoints: Joint[] = [this.activeObjService.selectedJoint];
      // this.joints.forEach((j) => {
      //   if (!(j instanceof RealJoint)) {
      //     return;
      //   }
      //   if (j.ground) {
      //     connectedJoints.push(j);
      //   }
      // });
      const prisJoint = new PrisJoint(
        prismaticJointId,
        this.activeObjService.selectedJoint.x,
        this.activeObjService.selectedJoint.y,
        selectedJointInput,
        true,
        [],
        connectedJoints
      );
      this.activeObjService.selectedJoint.connectedJoints.push(prisJoint);
      const piston = new Piston(this.activeObjService.selectedJoint.id + prisJoint.id, [
        this.activeObjService.selectedJoint,
        prisJoint,
      ]);
      prisJoint.links.push(piston);
      this.activeObjService.selectedJoint.links.push(piston);
      this.joints.push(prisJoint);
      this.links.push(piston);
    } else {
      // delete Prismatic Joint
      const piston = this.activeObjService.selectedJoint.links.find((l) => l instanceof Piston)!;
      const pistonIndex = this.links.findIndex((l) => l.id === piston.id);
      const prismaticJointID = piston.joints.find((j) => j instanceof PrisJoint)!.id;
      this.activeObjService.selectedJoint.connectedJoints =
        this.activeObjService.selectedJoint.connectedJoints.filter(
          (j) => j.id !== prismaticJointID
        );

      this.activeObjService.selectedJoint.links = this.activeObjService.selectedJoint.links.filter(
        (l) => l.id !== piston.id
      );
      const prismaticJointIndex = this.joints.findIndex((j) => j.id === prismaticJointID);
      this.joints.splice(prismaticJointIndex, 1);
      this.links.splice(pistonIndex, 1);

      this.activeObjService.selectedJoint.ground = false;
    }
    this.updateMechanism();
    console.log(this.joints);
    console.log(this.links);
  }

  findInputJointIndex() {
    return this.joints.findIndex((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      return j.input;
    });
  }

  animate(progress: number, animationState?: boolean) {
    //Round progress to nearest integer
    progress = Math.round(progress);

    this.onMechPositionChange.next(progress);
    this.mechanismTimeStep = progress;
    this.showPathHolder = !(this.mechanismTimeStep === 0 && !animationState);
    if (animationState !== undefined) {
      AnimationBarComponent.animate = animationState;
    }

    this.joints.forEach((j, j_index) => {
      j.x = this.mechanisms[0].joints[this.mechanismTimeStep][j_index].x;
      j.y = this.mechanisms[0].joints[this.mechanismTimeStep][j_index].y;
    });
    this.links.forEach((l, l_index) => {
      if (!(l instanceof RealLink)) {
        return;
      }
      const link = this.mechanisms[0].links[this.mechanismTimeStep][l_index];
      if (!(link instanceof RealLink)) {
        return;
      }
      //If subsets exsist, recompute d for those first
      if (l.subset.length > 0) {
        l.subset.forEach((s) => {
          if (!(s instanceof RealLink)) return;
          s.reComputeDPath();
        });
      }
      // l.d = RealLink.getD(l.joints);
      l.d = link.d;
      l.CoM = link.CoM;
      l.updateCoMDs();
      l.reComputeDPath();
    });
    this.forces.forEach((f, f_index) => {
      f.startCoord.x = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].startCoord.x;
      f.startCoord.y = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].startCoord.y;
      f.endCoord.x = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].endCoord.x;
      f.endCoord.y = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].endCoord.y;
      f.local = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].local;
      f.mag = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].mag;
      f.angleRad = this.mechanisms[0].forces[this.mechanismTimeStep][f_index].angleRad;
      f.forceLine = f.createForceLine(f.startCoord, f.endCoord);
      f.forceArrow = f.createForceArrow(f.startCoord, f.endCoord);
    });
    if (!AnimationBarComponent.animate) {
      return;
    }
    this.mechanismTimeStep += this.mechanismAnimationIncrement;
    if (this.mechanismTimeStep >= this.mechanisms[0].joints.length) {
      this.mechanismTimeStep = 0;
    }
    setTimeout(() => {
      this.animate(this.mechanismTimeStep);
    }, 16);
  }

  getJointCSSClass(joint: Joint) {
    // const j = joint as RealJoint;
    if (
      NewGridComponent.debugGetJointState() == jointStates.dragging &&
      joint.id === this.activeObjService.selectedJoint.id
    ) {
      return 'joint-dragging';
    }
    if (
      NewGridComponent.debugGetJointState() !== jointStates.dragging &&
      this.activeObjService.objType == 'Joint' &&
      joint.id === this.activeObjService.selectedJoint.id
    ) {
      return 'joint-selected';
    }
    if (joint.showHighlight) {
      return 'joint-highlight';
    } else {
      return 'joint-default';
    }
  }

  getLinkCSSClass(link: Link) {
    if (
      this.activeObjService.objType == 'Link' &&
      link.id === this.activeObjService.selectedLink.id
    ) {
      return 'link-selected';
    }
    return 'link-default';
  }

  private findConnectedLinksReccusively(
    link: Link,
    avoid: Link[],
    subset: Link[],
    subsetBuilder: Link[]
  ): Link[] {
    //Recursively find all connected links to a given link, making sure not to include the block link
    (link.joints as RealJoint[]).forEach((joint) => {
      joint.links.forEach((l) => {
        if (
          l instanceof RealLink &&
          !avoid.includes(l) &&
          !subsetBuilder.includes(l) &&
          subset.includes(l)
        ) {
          subsetBuilder.push(l);
          this.findConnectedLinksReccusively(l, avoid, subset, subsetBuilder);
        }
      });
    });
    return subsetBuilder;
  }

  isJointOrphan(joint: Joint) {
    //Return true if the given joint is an orphan (not part of a link).
    return this.links.every((l) => !l.joints.includes(joint));
  }

  unweldAll() {
    this.joints.forEach((j) => {
      if ((j as RealJoint).isWelded) {
        this.unWeldJoint(j as RealJoint);
      }
    });
  }

  public weldJoint() {
    const joint = this.joints.find(
      (j) => j.id === this.activeObjService.selectedJoint.id
    ) as RealJoint;
    //       NewGridComponent.sendNotification(
    //         'Welded Joints currently do not work when animating or analyzing the mechanism. Please un-weld the joint.'
    //       );
    //WE NEED TO WELD THE JOINT
    const linksAtJoint = joint.links as RealLink[];

    const newLink = this.createNewCompoundLink(linksAtJoint);

    //Remove all the links that are being merged from this.links
    linksAtJoint.forEach((l1: Link) => {
      this.links.splice(
        this.links.findIndex((l2) => l2.id === l1.id),
        1
      );
    });
    // Make sure that the joints that are connected to the welded joints know that they are connected joints
    linksAtJoint.forEach((l1: Link, l1Index) => {
      if (l1Index === linksAtJoint.length - 1) {
        return;
      }
      for (let l2Index = l1Index + 1; l2Index < linksAtJoint.length; l2Index++) {
        l1.joints.forEach((j1: Joint) => {
          if (!(j1 instanceof RealJoint)) {
            return;
          }
          if (j1.id === joint.id) {
            return;
          }
          linksAtJoint[l2Index].joints.forEach((j2: Joint) => {
            if (!(j2 instanceof RealJoint)) {
              return;
            }
            if (j2.id === j1.id) {
              return;
            }
            if (j1.connectedJoints.findIndex((jt) => jt.id === j2.id) === -1) {
              j1.connectedJoints.push(j2);
            }
            if (j2.connectedJoints.findIndex((jt) => jt.id === j1.id) === -1) {
              j2.connectedJoints.push(j1);
            }
          });
        });
      }
    });
    newLink.fill = ColorService.instance.getNextLinkColor();
    this.links.push(newLink);

    //Update the joints of the new link with the right links
    newLink.joints.forEach((j: Joint | RealJoint) => {
      if (!(j instanceof RealJoint)) return;
      //Remove any links that are subsets of the new link
      j.links = j.links.filter((l: Link) => {
        return !linksAtJoint.some((l2) => l2.id === l.id);
      });
      //Add the new link to the joints
      j.links.push(newLink);
    });

    joint.isWelded = true;
  }

  unWeldJoint(jointToUnweld: RealJoint) {
    //WE ARE UNWELDING THE JOINT
    // TODO: INSERT AFTER HERE
    // Previous Logic
    // this.activeObjService.selectedJoint.isWelded = false;
    // joint.isWelded = false;
    jointToUnweld.links.forEach((l) => {
      if (!(l instanceof RealLink)) {
        return;
      }
      if (l.subset.length === 0) {
        return;
      }
      let idSubs: string[] = [];
      l.subset.forEach(
        (s) => idSubs.push(s.id)
        // idSubs.push(s.id.replace(this.activeObjService.selectedJoint.id, ''))
      );
      for (
        let l_subset_index = 0;
        l_subset_index < (l as RealLink).subset.length;
        l_subset_index = l_subset_index + 1
      ) {
        const sub = l.subset[l_subset_index];
        const selectedJoint = jointToUnweld;
        // sub contains id that is not shared with any other subset
        let noSharedJoint = true;
        const tempIdSubs = idSubs.filter((str) => str !== sub.id);
        for (let letterIndex = 0; letterIndex < sub.id.length; letterIndex = letterIndex + 1) {
          const letter = sub.id[letterIndex];
          if (letter === selectedJoint.id) {
            continue;
          }
          // if (tempIdSubs.includes(letter)) {
          if (tempIdSubs.some((str) => str.includes(letter))) {
            noSharedJoint = false;
          }
        }
        // determine whether subset contains any joints that other subsets rather besides the selected joint
        if (noSharedJoint && sub.id.includes(selectedJoint.id)) {
          // This link will be pushed to this.links
          if (sub.joints.length > 1) {
            sub.joints.forEach((childJoint) => {
              if (!(childJoint instanceof RealJoint)) {
                return;
              }
              childJoint.links.push(sub);
              if (childJoint.id === selectedJoint.id) {
                return;
              }
              // Go through sub joints and delete themselves from connectedJoints
              for (let jtIndex = 0; jtIndex < childJoint.connectedJoints.length; jtIndex++) {
                const jt = childJoint.connectedJoints[jtIndex] as RealJoint;
                if (jt.id === selectedJoint.id) {
                  continue;
                }
                const delJointIndex = jt.connectedJoints.findIndex(
                  (jt2) => jt2.id === childJoint.id
                );
                // check to be sure that this joint is not currently within the sub
                // if (sub.joints.findIndex(jt2 => jt2.id === jt.connectedJoints[delJointIndex].id) !== -1) {
                if (sub.joints.findIndex((jt2) => jt2.id === jt.id) !== -1) {
                  continue;
                }
                jt.connectedJoints.splice(delJointIndex, 1);
                childJoint.connectedJoints.splice(jtIndex, 1);
                jtIndex = jtIndex - 1;
              }
              let delLinkIndex = childJoint.links.findIndex((li) => li.id === l.id);
              if (delLinkIndex !== -1) {
                childJoint.links.splice(delLinkIndex, 1);
              }
            });
            this.links.push(sub);
            // This is an orphaned joint
          } else if (sub.joints.length === 1) {
            // regular orphaned joint
            const delLinkIndex = (sub.joints[0] as RealJoint).links.findIndex(
              (li) => li.id === l.id
            );
            (sub.joints[0] as RealJoint).links.splice(delLinkIndex, 1);
            (sub.joints[0] as RealJoint).connectedJoints = [];
            (sub.joints[0] as RealJoint).links.forEach((childLink) => {
              if (!(childLink instanceof RealLink)) {
                return;
              }
              // Check to see if joint from link already within connectedJoints
              childLink.joints.forEach((jt) =>
                (sub.joints[0] as RealJoint).connectedJoints.push(jt)
              );
            });
            const fixedLocationIndex = l.fixedLocations.findIndex(
              (fixedloc) => fixedloc.id === sub.joints[0].id
            );
            l.fixedLocations.splice(fixedLocationIndex, 1);
            if (l.fixedLocation.fixedPoint === sub.joints[0].id) {
              l.fixedLocation.fixedPoint = 'com';
            }
          }
          const sliceIndex = l.subset.findIndex((s) => s.id === sub.id);
          l.subset.splice(sliceIndex, 1);
          // go through the original link (l) and make sure
          // 1. the link does not contain any joints from sub
          // 2. l's joints' neighboring joint does not contain joints from sub
          sub.joints.forEach((jt) => {
            if (!(jt instanceof RealJoint) || jt.id === selectedJoint.id) {
              return;
            }
            const deleteJointIndex = l.joints.findIndex((jt2) => jt2.id === jt.id);
            if (deleteJointIndex === -1) {
              return;
            }
            l.joints.splice(deleteJointIndex, 1);
            l.id = l.id.replace(jt.id, '');
          });
          l_subset_index = l_subset_index - 1;
        }
        // else if (sub.id.length === 1) {
        //   // TODO: Verify this is still needed...
        //   // l.subset.splice(l_subset_index, 1);
        //   // l_subset_index = l_subset_index - 1;
        // }
      }
      // every joint that is
      // Now that all subsets have been gone over, do the final check
      if (l.subset.length === 1) {
        l = l.subset[0];
        const delLinkIndex = this.links.findIndex((li) => li.id === l.id);
        this.links.splice(delLinkIndex, 1);
        this.links.push(l);
        l.joints.forEach((jt) => {
          if (!(jt instanceof RealJoint)) {
            return;
          }
          const delLinkIndex = jt.links.findIndex((li) => li.id === l.id);
          jt.links.splice(delLinkIndex, 1);
          jt.links.push(l);
        });
      } else if (l.subset.length === 0) {
        const sliceIndex = this.links.findIndex((li) => li.id === l.id);
        const otherSliceIndex = jointToUnweld.links.findIndex((li) => li.id === l.id);
        this.links.splice(sliceIndex, 1);
        jointToUnweld.links.splice(otherSliceIndex, 1);
      }
    });
    jointToUnweld.isWelded = false;
  }

  public unweldSelectedJoint() {
    const joint = this.joints.find(
      (j) => j.id === this.activeObjService.selectedJoint.id
    ) as RealJoint;

    this.unWeldJoint(joint);
  }

  createForceAtCOM() {
    let link = this.activeObjService.selectedLink;
    let com = link.CoM;
    let endPoint = new Coord(com.x + 1, com.y + 3);
    this.createForce(com, endPoint);
  }

  createForce(startCoord: Coord, endCoord: Coord) {
    // TODO: utilize dot product to find point that is closest to the line
    if (this.activeObjService.selectedLink.joints.length === 2) {
      const lineVector: Coord = new Coord(
        this.activeObjService.selectedLink.joints[0].x -
          this.activeObjService.selectedLink.joints[1].x,
        this.activeObjService.selectedLink.joints[0].y -
          this.activeObjService.selectedLink.joints[1].y
      );

      // Calculate the vector from the first point on the line to the given point
      const givenPointVector: Coord = new Coord(
        startCoord.x - this.activeObjService.selectedLink.joints[0].x,
        startCoord.y - this.activeObjService.selectedLink.joints[0].y
      );

      // Calculate the dot product of the line vector and the given point vector
      const dotProduct: number =
        givenPointVector.x * lineVector.x + givenPointVector.y * lineVector.y;

      // Calculate the length of the line vector squared
      const lineLengthSquared: number = lineVector.x * lineVector.x + lineVector.y * lineVector.y;

      // Calculate the parameter t for the projection onto the line
      const t: number = dotProduct / lineLengthSquared;

      // Calculate the projected point on the line
      startCoord.x = this.activeObjService.selectedLink.joints[0].x + t * lineVector.x;
      startCoord.y = this.activeObjService.selectedLink.joints[0].y + t * lineVector.y;
    }
    let maxNumber = 1;
    if (this.forces.length !== 0) {
      maxNumber = Math.max(...this.forces.map(f => parseInt(f.id.replace(/\D/g, '')))) + 1;
    }
    const force = new Force(
      'F' + maxNumber.toString(),
      this.activeObjService.selectedLink,
      startCoord,
      endCoord
    );
    this.activeObjService.selectedLink.forces.push(force);
    this.forces.push(force);
    PositionSolver.setUpSolvingForces(this.activeObjService.selectedLink.forces); // needed to determine force position when dragging a joint
    // PositionSolver.setUpInitialJointLocations(this.selectedLink.joints);
  }
}
