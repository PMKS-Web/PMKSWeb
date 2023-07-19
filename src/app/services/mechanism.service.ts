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
} from '../model/utils';
import { BehaviorSubject, Subject } from 'rxjs';
import { GridUtilsService } from './grid-utils.service';
import { ActiveObjService } from './active-obj.service';
import { AnimationBarComponent } from '../component/animation-bar/animation-bar.component';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { SettingsService } from './settings.service';
import { Coord } from '../model/coord';
import { Line } from '../model/line';
import { UrlProcessorService } from './url-processor.service';

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
    private settingsService: SettingsService
  ) {}

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
    let inputAngularVelocity = ToolbarComponent.inputAngularVelocity;
    if (ToolbarComponent.clockwise) {
      inputAngularVelocity = ToolbarComponent.inputAngularVelocity * -1;
    }
    this.mechanisms.push(
      //This creates a new mechanism with the current state of the joints, links, forces, and ics
      //If the mechnaism is simulatable, it will generate loops and all future time steps
      new Mechanism(
        this.joints,
        this.links,
        this.forces,
        this.ics,
        ToolbarComponent.gravity,
        ToolbarComponent.unit,
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
      return 'a';
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
              if (j2.id === joint.id) {
                return;
              }
              j1.connectedJoints.push(j2);
              j2.connectedJoints.push(j1);
            });
          });
        }
      });
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

      //For every joint in the new link, add all other joints in the new link as connected joints
      // newLink.joints.forEach((j: Joint | RealJoint) => {
      //   if (!(j instanceof RealJoint)) return;
      //   newLink.joints.forEach((j2: Joint | RealJoint) => {
      //     if (!(j2 instanceof RealJoint)) return;
      //     if (j.id !== j2.id) {
      //       j.connectedJoints.push(j2);
      //     }
      //   });
      // });
      //
      // //Lastly remove duplicate connected joints
      // newLink.joints.forEach((j: Joint | RealJoint) => {
      //   if (!(j instanceof RealJoint)) return;
      //   j.connectedJoints = j.connectedJoints.filter((cj, index) => {
      //     return j.connectedJoints.findIndex((cj2) => cj2.id === cj.id) === index;
      //   });
      // });
    } else if (joint.isWelded) {
      //WE ARE UNWELDING THE JOINT
      let mainLink = joint.links[0] as RealLink;
      const subset = mainLink.subset;
      subset.forEach((l, l_index) => {
        if (!(l instanceof RealLink)) {
          return;
        }
        if (l.joints.findIndex((j) => j.id === joint.id) === -1) {
          return;
        }
        if (l_index === subset.length - 1) {
          return;
        }
        l.joints.forEach((j1, j_index) => {
          if (!(j1 instanceof RealJoint)) {
            return;
          }
          if (j1.id === joint.id) {
            return;
          }
          mainLink.joints.forEach((j) => {
            if (!(j instanceof RealJoint)) {
              return;
            }
            j.links.splice(
              j.links.findIndex((l2) => l2.id === mainLink.id),
              1
            );
          });
          j1.links.push(l);
          mainLink.joints.splice(
            mainLink.joints.findIndex((j3) => j3.id === j1.id),
            1
          );
          mainLink.id = mainLink.id.replace(j1.id, '');
          mainLink.fixedLocations.splice(
            mainLink.fixedLocations.findIndex((obj) => obj.id === j1.id),
            1
          );
          if (mainLink.fixedLocation.fixedPoint === j1.id) {
            mainLink.fixedLocation.fixedPoint = 'com';
          }
          mainLink.subset.splice(
            mainLink.subset.findIndex((l2) => l2.id === l.id),
            1
          );
          if (mainLink.subset.length === 1) {
            mainLink = mainLink.subset[0] as RealLink;
            this.links.splice(
              this.links.findIndex((l2) => l2.id === mainLink.id),
              1
            );
            this.links.push(mainLink);
          }
          mainLink.joints.forEach((j3) => {
            if (!(j3 instanceof RealJoint)) {
              return;
            }
            j3.links.push(mainLink);
          });
          for (
            let connectedLinkIndex = l_index + 1;
            connectedLinkIndex < subset.length;
            connectedLinkIndex++
          ) {
            subset[connectedLinkIndex].joints.forEach((j2) => {
              if (!(j2 instanceof RealJoint)) {
                return;
              }
              if (j2.id === j1.id) {
                return;
              }
              if (j2.id === joint.id) {
                return;
              }
              j1.connectedJoints.splice(
                j1.connectedJoints.findIndex((j3) => j3.id === j1.id),
                1
              );
              j2.connectedJoints.splice(
                j2.connectedJoints.findIndex((j3) => j3.id === j2.id),
                1
              );
              j2.links.push(mainLink);
            });
          }
          this.links.push(l);
          joint.links.push(l);
        });
        // subset.splice(l_index, 1);
      });
    }
    joint.isWelded = !joint.isWelded;
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

    //Make sure newLinkJoints only contains unique joints
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
        if (!(l instanceof RealLink)) {return}
        const subsetNum = l.subset.length;
        l.subset.forEach((sub, subIndex) => {
          const delJointIndex = sub.joints.findIndex(subj => subj.id === this.activeObjService.selectedJoint.id);
          if (delJointIndex === -1) {return}
          // need to delete joint, fixedPoint, and ID
          sub.joints.splice(delJointIndex, 1);
          const delFixedJointIndex = sub.fixedLocations.findIndex(sub_fixedJoint => sub_fixedJoint.id === this.activeObjService.selectedJoint.id);
          sub.fixedLocations.splice(delFixedJointIndex, 1);
          if (sub.fixedLocation.fixedPoint === this.activeObjService.selectedJoint.id) {
            sub.fixedLocation.fixedPoint = "com";
          }
          sub.id = sub.id.replace(this.activeObjService.selectedJoint.id, '');
          // If the subset only contains one joint, delete the subset.
        });
        // TODO: May wanna check this logic since we have foreach and we delete index within foreach loop...
        for (let subLinkIndex = 0; subLinkIndex < l.subset.length; subLinkIndex++) {
          if (l.subset[subLinkIndex].joints.length < 2) {
            l.subset.splice(subLinkIndex, 1);
            subLinkIndex = subLinkIndex - 1;
          }
          if (l.subset[subLinkIndex].joints.findIndex(jt => jt.id === this.activeObjService.selectedJoint.id) === -1) {
            this.links.push(l.subset[subLinkIndex]);
            l.subset.splice(subLinkIndex, 1);
            subLinkIndex = subLinkIndex - 1;
          }
        }
        // If there is only one subset for a link, then we do not need that subset
        if (l.subset.length === 1) {
          l.subset.splice(0, 1);
          l.joints.forEach(jt => {
            if (!(jt instanceof RealJoint)) {return}
            jt.isWelded = false;
          })
        }
        if (l.subset.length !== subsetNum) {
          if (l.subset.length < 2) {
            const lIndex = this.links.findIndex(li => li.id === l.id);
            this.links.splice(lIndex, 1);
          }
        }
        // if (l.subset === 0) {}
        // if (l.joints.length === 2) {
        //   if (!(l.joints[0] instanceof RealJoint) || !(l.joints[1] instanceof RealJoint)) {return}
        //   if (l.joints[0].isWelded) {
        //     l.joints[0].isWelded = false;
        //   }
        //   if (l.joints[1].isWelded) {
        //     l.joints[1].isWelded = false;
        //   }
        // }
      }

      if (l instanceof Piston) {
        //Special case, remove the other joint on a pistion
        l.joints.forEach((j) => {
          if (j.id !== this.activeObjService.selectedJoint.id) {
            this.joints.splice(this.gridUtils.findJointIDIndex(j.id, this.joints), 1);
          }
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
    if (this.activeObjService.selectedLink !== undefined) {
      this.activeObjService.selectedLink.d = this.activeObjService.selectedLink.getPathString();
    }
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
    }
    this.updateMechanism();
  }

  toggleInput($event: MouseEvent) {
    // TODO: Adjust this logic when there are multiple mechanisms created
    this.activeObjService.selectedJoint.input = !this.activeObjService.selectedJoint.input;
    let jointsTraveled = ''.concat(this.activeObjService.selectedJoint.id);
    this.activeObjService.selectedJoint.connectedJoints.forEach((j) => {
      jointsTraveled = checkConnectedJoints(j, jointsTraveled);
    });

    function checkConnectedJoints(j: Joint, jointsTraveled: string): string {
      if (!(j instanceof RealJoint) || jointsTraveled.includes(j.id)) {
        return jointsTraveled;
      }
      j.input = false;
      jointsTraveled = jointsTraveled.concat(j.id);
      j.connectedJoints.forEach((jt) => {
        jointsTraveled = checkConnectedJoints(jt, jointsTraveled);
      });
      return jointsTraveled;
    }

    this.updateMechanism();
    this.onMechUpdateState.next(3);
  }

  toggleSlider() {
    if (!this.gridUtils.isAttachedToSlider(this.activeObjService.selectedJoint)) {
      // Create Prismatic Joint
      this.activeObjService.selectedJoint.ground = false;
      const prismaticJointId = this.determineNextLetter();
      const inputJointIndex = this.findInputJointIndex();
      const connectedJoints: Joint[] = [this.activeObjService.selectedJoint];
      this.joints.forEach((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.ground) {
          connectedJoints.push(j);
        }
      });
      const prisJoint = new PrisJoint(
        prismaticJointId,
        this.activeObjService.selectedJoint.x,
        this.activeObjService.selectedJoint.y,
        this.activeObjService.selectedJoint.input,
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

      this.activeObjService.selectedJoint.ground = true;
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
}
