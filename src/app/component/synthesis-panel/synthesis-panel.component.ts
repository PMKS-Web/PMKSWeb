import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { Pose } from '../../model/pose';
import { Coord } from '../../model/coord';
import { Joint, RealJoint, RevJoint } from '../../model/joint';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { Mechanism } from '../../model/mechanism/mechanism';
import { Link, RealLink } from '../../model/link';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from 'src/app/services/settings.service';
import { SynthesisStatus } from 'src/app/services/synthesis/synthesis-constants';
import { SvgGridService } from '../../services/svg-grid.service';
import { ColorService } from '../../services/color.service';

@Component({
  selector: 'app-synthesis-panel',
  templateUrl: './synthesis-panel.component.html',
  styleUrls: ['./synthesis-panel.component.scss'],
})
export class SynthesisPanelComponent implements OnInit {
  PoseID: any;

  private _alreadyHandlingPoseChange: boolean = false;

  constructor(
    private fb: FormBuilder,
    public mechanismSrv: MechanismService,
    public synthesisBuilder: SynthesisBuilderService,
    private nup: NumberUnitParserService,
    private settings: SettingsService,
    public svgGrid: SvgGridService,
    private colorService: ColorService
  ) {}

  ngOnInit() {
    //Set initial values
    //(The default values are based on the image Pradeep provided but they can be easily changed below)
    this.synthesisForm.setValue({
      //a0x: '6',
      //a0y: '0',
      //b0x: '8.1213',
      //b0y: '-2.1213',
      //a1x: '8',
      //a1y: '-4',
      //b1x: '8',
      //b1y: '-7',
      //a2x: '1',
      //a2y: '2',
      //b2x: '4',
      //b2y: '2',

      //a0x: '-7.96',
      //a0y: '-1.34',
      //b0x: '-4.42',
      //b0y: '2.2',
      //a1x: '-0.37',
      //a1y: '4.06',
      //b1x: '4.63',
      //b1y: '4.06',
      //a2x: '7.68',
      //a2y: '2.30',
      //b2x: '11.22',
      //b2y: '-1.23',

      a0x: '0',
      a0y: '0',
      b0x: '12.5',
      b0y: '0',
      a1x: '20',
      a1y: '10',
      b1x: '28.8388',
      b1y: '18.8388',
      a2x: '20',
      a2y: '30',
      b2x: '26.25',
      b2y: '40.8253',

      quality: '0.05',

      position1Match: ' ',
      position2Match: ' ',
      position3Match: ' ',
    });

    // initialize form values from model
    this.updateFormFromModel();

    // when model updates, update form values as well
    this.synthesisBuilder.valueChanges.subscribe((value) => {
      this.updateFormFromModel();
      if (this.synthesisBuilder.isFullyDefined()) {
        this.synthesisFunction();
      }
    });

    // set up subscriptions to synthesis form changes to update model
    this.synthesisPoseForm.valueChanges.subscribe((value) => {
      // prevent infinite loop
      if (this._alreadyHandlingPoseChange) return;

      this._alreadyHandlingPoseChange = true;

      let valid = this.synthesisBuilder.updatePosesFromForm(value);
      this.updateFormFromModel();

      if (this.synthesisBuilder.isFullyDefined()) {
        this.synthesisFunction();
      }

      this._alreadyHandlingPoseChange = false;
    });

    SettingsService._objectScale.subscribe((val) => {
      this.synthesisBuilder.getAllPoses().forEach((pose) => {
        pose.recompute();
      });
    });
  }

  private convertL(value: number): string {
    return this.nup.formatValueAndUnit(value, this.settings.lengthUnit.getValue());
  }

  private convertA(value: number): string {
    return this.nup.formatValueAndUnit(value, this.settings.angleUnit.getValue());
  }

  // given synthesis model, update form values to sync with model
  updateFormFromModel() {
    this._alreadyHandlingPoseChange = true;

    let poses = this.synthesisBuilder.poses;
    let controls = this.synthesisPoseForm.controls;

    controls.length.setValue(this.convertL(this.synthesisBuilder.length));

    if (this.synthesisBuilder.isPoseDefined(1)) {
      controls.p1x.setValue(this.convertL(poses[1].position.x));
      controls.p1y.setValue(this.convertL(poses[1].position.y));
      controls.p1theta.setValue(this.convertA(poses[1].thetaDegrees));
    }
    if (this.synthesisBuilder.isPoseDefined(2)) {
      controls.p2x.setValue(this.convertL(poses[2].position.x));
      controls.p2y.setValue(this.convertL(poses[2].position.y));
      controls.p2theta.setValue(this.convertA(poses[2].thetaDegrees));
    }
    if (this.synthesisBuilder.isPoseDefined(3)) {
      controls.p3x.setValue(this.convertL(poses[3].position.x));
      controls.p3y.setValue(this.convertL(poses[3].position.y));
      controls.p3theta.setValue(this.convertA(poses[3].thetaDegrees));
    }

    this._alreadyHandlingPoseChange = false;
  }

  synthesisPoseForm = this.fb.group(
    {
      cor: ['1'],
      length: [''],
      p1x: [''],
      p1y: [''],
      p1theta: [''],
      p2x: [''],
      p2y: [''],
      p2theta: [''],
      p3x: [''],
      p3y: [''],
      p3theta: [''],
    },
    {
      updateOn: 'blur',
    }
  );

  //Angular form stuff with 12 numbers, a0x, a0y, b0x, b0y, a1x, a1y, b1x, b1y, a2x, a2y, b2x, b2y
  synthesisForm = this.fb.group({
    a0x: [''],
    a0y: [''],
    b0x: [''],
    b0y: [''],
    a1x: [''],
    a1y: [''],
    b1x: [''],
    b1y: [''],
    a2x: [''],
    a2y: [''],
    b2x: [''],
    b2y: [''],
    quality: [''],
    position1Match: [''],
    position2Match: [''],
    position3Match: [''],
  });

  handleButton() {
    //Send notification to grid for now
    NewGridComponent.sendNotification(
      'Call your backend function with these values! A0: (' +
        this.synthesisForm.value.a0x! +
        ',' +
        this.synthesisForm.value.a0y! +
        ') B0: (' +
        this.synthesisForm.value.b0x! +
        ',' +
        this.synthesisForm.value.b0y! +
        ') A1: (' +
        this.synthesisForm.value.a1x! +
        ',' +
        this.synthesisForm.value.a1y! +
        ') B1: (' +
        this.synthesisForm.value.b1x! +
        ',' +
        this.synthesisForm.value.b1y! +
        ') A2: (' +
        this.synthesisForm.value.a2x! +
        ',' +
        this.synthesisForm.value.a2y! +
        ') B2: (' +
        this.synthesisForm.value.b2x! +
        ',' +
        this.synthesisForm.value.b2y! +
        ')'
    );
    //If you need the values as a number instead of a string, use this:
    console.log(Number(this.synthesisForm.value.a0x!));
  }

  // for html to get current pose as a number
  getCurrentPose(): number {
    return this.synthesisBuilder.selectedPose;
  }

  setCurrentPose(pose: number) {
    this.synthesisBuilder.selectedPose = pose;
  }

  getFormIDPoseX(pose: number): string {
    if (pose == 1) return 'p1x';
    else if (pose == 2) return 'p2x';
    else return 'p3x';
  }

  getFormIDPoseY(pose: number): string {
    if (pose == 1) return 'p1y';
    else if (pose == 2) return 'p2y';
    else return 'p3y';
  }

  getFormIDPoseTheta(pose: number): string {
    if (pose == 1) return 'p1theta';
    else if (pose == 2) return 'p2theta';
    else return 'p3theta';
  }

  synthesisFunction() {
    //call synthesis functions

    //populate pose information

    let pose1_coord1 = this.synthesisBuilder.poses[1].posBack;
    let pose1_coord2 = this.synthesisBuilder.poses[1].posFront;
    let pose2_coord1 = this.synthesisBuilder.poses[2].posBack;
    let pose2_coord2 = this.synthesisBuilder.poses[2].posFront;
    let pose3_coord1 = this.synthesisBuilder.poses[3].posBack;
    let pose3_coord2 = this.synthesisBuilder.poses[3].posFront;

    let qualityfromUser = Number(this.synthesisForm.value.quality);

    //   NewGridComponent.sendNotification(qualityfromUser + ';');

    //find first itnersection point

    let firstPoint = this.findIntersectionPoint(pose1_coord1, pose2_coord1, pose3_coord1);
    let secondPoint = pose1_coord1;
    let thirdPoint = pose1_coord2;
    let fourthPoint = this.findIntersectionPoint2(pose1_coord2, pose2_coord2, pose3_coord2);

    //now create joints, links, etc. from the above four coordinates

    let joint1 = new RevJoint('A', firstPoint.x, firstPoint.y, true, true);
    let joint2 = new RevJoint('B', secondPoint.x, secondPoint.y, false, false);
    let joint3 = new RevJoint('C', thirdPoint.x, thirdPoint.y, false, false);
    let joint4 = new RevJoint('D', fourthPoint.x, fourthPoint.y, false, true);

    joint1.connectedJoints.push(joint2);
    joint2.connectedJoints.push(joint1, joint3);
    joint3.connectedJoints.push(joint2, joint4);
    joint4.connectedJoints.push(joint3);

    let link1 = new RealLink('AB', [joint1, joint2]);
    link1.fill = this.colorService.getLinkColorFromIndex(0);
    let link2 = new RealLink('BC', [joint2, joint3]);
    link2.fill = this.colorService.getLinkColorFromIndex(1);
    let link3 = new RealLink('CD', [joint3, joint4]);
    link3.fill = this.colorService.getLinkColorFromIndex(0);

    joint1.links.push(link1);
    joint2.links.push(link1, link2);
    joint3.links.push(link2, link3);
    joint4.links.push(link3);

    this.mechanismSrv.joints.splice(0);
    this.mechanismSrv.links.splice(0);

    this.mechanismSrv.mergeToJoints([joint1, joint2, joint3, joint4]);
    this.mechanismSrv.mergeToLinks([link1, link2, link3]);

    this.mechanismSrv.mechanismTimeStep = 0;
    this.mechanismSrv.updateMechanism();

    let posCoords = [
      pose1_coord1,
      pose1_coord2,
      pose2_coord1,
      pose2_coord2,
      pose3_coord1,
      pose3_coord2,
    ];

    let quality = this.compareTheQualityofSynthesis(
      this.mechanismSrv.mechanisms[0].joints,
      posCoords,
      qualityfromUser
    );

    //  let trialCoord = new Coord(this.mechanismSrv.mechanisms[0].joints[0][0].x, this.mechanismSrv.mechanisms[0].joints[0][0].y);

    // NewGridComponent.sendNotification(firstPoint.x + ',' + firstPoint.y + ',' + fourthPoint.x + ',' + fourthPoint.y);

    //  NewGridComponent.sendNotification(trialCoord.x+','+trialCoord.y);

    //  NewGridComponent.sendNotification(quality[0]+';');

    //now check if there is 999 in the quality. Count 999 and say which position matches

    let whichPositionMatches = this.checkQuality(quality);

    // NewGridComponent.sendNotification(
    //   'Position Matches:' +
    //     whichPositionMatches[0] +
    //     ',' +
    //     whichPositionMatches[1] +
    //     ',' +
    //     whichPositionMatches[2]
    // );
  }

  checkQuality(quality: number[]) {
    let positionMatches: string[] = ['Position 1', 'Position 2', 'Position 3'];
    if (quality[0] >= 0.09 || quality[1] >= 0.09) {
      positionMatches[0] = 'No Match';
      this.synthesisBuilder.poses[1].status = SynthesisStatus.INVALID;
    } else {
      this.synthesisBuilder.poses[1].status = SynthesisStatus.VALID;
    }
    if (quality[3] >= 0.09 || quality[4] >= 0.09) {
      positionMatches[1] = 'No Match';
      this.synthesisBuilder.poses[2].status = SynthesisStatus.INVALID;
    } else {
      this.synthesisBuilder.poses[2].status = SynthesisStatus.VALID;
    }
    if (quality[6] >= 0.09 || quality[7] >= 0.09) {
      positionMatches[2] = 'No Match';
      this.synthesisBuilder.poses[3].status = SynthesisStatus.INVALID;
    } else {
      this.synthesisBuilder.poses[3].status = SynthesisStatus.VALID;
    }

    return positionMatches;
  }

  compareTheQualityofSynthesis(jointValues: Joint[][], posCoords: Coord[], qualityOfSyn: number) {
    //get position analysis data
    //joint B, Joint C,
    //compare that with poses

    let quality1_b: number = 999;
    let quality2_b: number = 999;
    let quality3_b: number = 999;

    let quality1_c: number = 999;
    let quality2_c: number = 999;
    let quality3_c: number = 999;

    let pos1TimeStep: number = 999;
    let pos2TimeStep: number = 999;
    let pos3TimeStep: number = 999;

    //compare Joint B with pose 1, pose2, and pose3;

    let index: number = 1;

    for (let val in jointValues) {
      let pos1Value_b = Math.sqrt(
        Math.pow(jointValues[val][1].x - posCoords[0].x, 2) +
          Math.pow(jointValues[val][1].y - posCoords[0].y, 2)
      );
      let pos2Value_b = Math.sqrt(
        Math.pow(jointValues[val][1].x - posCoords[2].x, 2) +
          Math.pow(jointValues[val][1].y - posCoords[2].y, 2)
      );
      let pos3Value_b = Math.sqrt(
        Math.pow(jointValues[val][1].x - posCoords[4].x, 2) +
          Math.pow(jointValues[val][1].y - posCoords[4].y, 2)
      );

      //  NewGridComponent.sendNotification('JointCoord;' + jointValues[val][1].x + ';');
      //  NewGridComponent.sendNotification('PosCoord;' + posCoords[0].x + ';');
      //   NewGridComponent.sendNotification('val:' + val);

      let pos1Value_c = Math.sqrt(
        Math.pow(jointValues[val][2].x - posCoords[1].x, 2) +
          Math.pow(jointValues[val][2].y - posCoords[1].y, 2)
      );
      let pos2Value_c = Math.sqrt(
        Math.pow(jointValues[val][2].x - posCoords[3].x, 2) +
          Math.pow(jointValues[val][2].y - posCoords[3].y, 2)
      );
      let pos3Value_c = Math.sqrt(
        Math.pow(jointValues[val][2].x - posCoords[5].x, 2) +
          Math.pow(jointValues[val][2].y - posCoords[5].y, 2)
      );

      //need to compare if less than 0.09
      //need to store in quality
      //need to check if exact match
      //need to extract time step.

      if (pos1Value_b < qualityOfSyn && pos1Value_c < qualityOfSyn && index == 1) {
        quality1_b = pos1Value_b;
        quality1_c = pos1Value_c;
        pos1TimeStep = index;
      } else if (pos1Value_b < qualityOfSyn && pos1Value_c < qualityOfSyn && index > 1) {
        quality1_b = pos1Value_b;
        quality1_c = pos1Value_c;
        pos1TimeStep = index;
      } else if (pos2Value_b < qualityOfSyn && pos2Value_c < qualityOfSyn && index == 1) {
        quality2_b = pos2Value_b;
        quality2_c = pos2Value_c;
        pos2TimeStep = index;
      } else if (pos2Value_b < qualityOfSyn && pos2Value_c < qualityOfSyn && index > 1) {
        quality2_b = pos2Value_b;
        quality2_c = pos2Value_c;
        pos2TimeStep = index;
      } else if (pos3Value_b < qualityOfSyn && pos3Value_c < qualityOfSyn && index == 1) {
        quality3_b = pos3Value_b;
        quality3_c = pos3Value_c;
        pos3TimeStep = index;
      } else if (pos3Value_b < qualityOfSyn && pos3Value_c < qualityOfSyn && index > 1) {
        quality3_b = pos3Value_b;
        quality3_c = pos3Value_c;
        pos3TimeStep = index;
      } else {
        //if there is no match, then use the prev index and then with the current and prev, find the midpoint and then evaluate the same

        if (index > 1) {
          let jointB_x = (jointValues[val][1].x + jointValues[index - 2][1].x) / 2;
          let jointB_y = (jointValues[val][1].y + jointValues[index - 2][1].y) / 2;
          let jointC_x = (jointValues[val][2].x + jointValues[index - 2][2].x) / 2;
          let jointC_y = (jointValues[val][2].y + jointValues[index - 2][2].y) / 2;

          //    NewGridComponent.sendNotification("Midpoint;" + val+';'+index);

          let pos1Value_b = Math.sqrt(
            Math.pow(jointB_x - posCoords[0].x, 2) + Math.pow(jointB_y - posCoords[0].y, 2)
          );
          let pos2Value_b = Math.sqrt(
            Math.pow(jointB_x - posCoords[2].x, 2) + Math.pow(jointB_y - posCoords[2].y, 2)
          );
          let pos3Value_b = Math.sqrt(
            Math.pow(jointB_x - posCoords[4].x, 2) + Math.pow(jointB_y - posCoords[4].y, 2)
          );

          //  NewGridComponent.sendNotification('JointCoord;' + jointValues[val][1].x + ';');
          //  NewGridComponent.sendNotification('PosCoord;' + posCoords[0].x + ';');
          //   NewGridComponent.sendNotification('val:' + val);

          let pos1Value_c = Math.sqrt(
            Math.pow(jointC_x - posCoords[1].x, 2) + Math.pow(jointC_y - posCoords[1].y, 2)
          );
          let pos2Value_c = Math.sqrt(
            Math.pow(jointC_x - posCoords[3].x, 2) + Math.pow(jointC_y - posCoords[3].y, 2)
          );
          let pos3Value_c = Math.sqrt(
            Math.pow(jointC_x - posCoords[5].x, 2) + Math.pow(jointC_y - posCoords[5].y, 2)
          );

          if (pos1Value_b < qualityOfSyn && pos1Value_c < qualityOfSyn) {
            quality1_b = pos1Value_b;
            quality1_c = pos1Value_c;
            pos1TimeStep = index - 0.5;
          } else if (pos2Value_b < qualityOfSyn && pos2Value_c < qualityOfSyn) {
            quality2_b = pos2Value_b;
            quality2_c = pos2Value_c;
            pos2TimeStep = index - 0.5;
          } else if (pos3Value_b < qualityOfSyn && pos3Value_c < qualityOfSyn) {
            quality3_b = pos3Value_b;
            quality3_c = pos3Value_c;
            pos3TimeStep = index - 0.5;
          }
        }
      }

      index = index + 1;

      //  NewGridComponent.sendNotification('index:' + index);
    }
    //    NewGridComponent.sendNotification('quality3c:' + quality3_c);

    //now compile quality array and then pass it back

    let qualityCompilation: number[];

    qualityCompilation = [
      quality1_b,
      quality1_c,
      pos1TimeStep,
      quality2_b,
      quality2_c,
      pos2TimeStep,
      quality3_b,
      quality3_c,
      pos3TimeStep,
    ];

    // NewGridComponent.sendNotification(";" + qualityCompilation);

    return qualityCompilation;
  }

  findIntersectionPoint(pose1_coord1: Coord, pose2_coord1: Coord, pose3_coord1: Coord) {
    //slope of Line 1
    let slope1 = 1 / ((pose2_coord1.y - pose1_coord1.y) / (pose2_coord1.x - pose1_coord1.x));
    //slope of line 2
    let slope2 = 1 / ((pose3_coord1.y - pose2_coord1.y) / (pose3_coord1.x - pose2_coord1.x));

    //midpoints of the above two lines
    let midpoint_line1 = new Coord(
      (pose1_coord1.x + pose2_coord1.x) / 2,
      (pose1_coord1.y + pose2_coord1.y) / 2
    );
    let midpoint_line2 = new Coord(
      (pose3_coord1.x + pose2_coord1.x) / 2,
      (pose3_coord1.y + pose2_coord1.y) / 2
    );

    //intercept
    let c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
    let c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

    //intersection point
    let x1 = (c1 - c2) / (-slope2 + slope1);
    let y1 = -slope1 * x1 + c1;

    return new Coord(x1, y1);
  }

  findIntersectionPoint2(pose1_coord2: Coord, pose2_coord2: Coord, pose3_coord2: Coord) {
    let slope1 = 1 / ((pose2_coord2.y - pose1_coord2.y) / (pose2_coord2.x - pose1_coord2.x));
    //slope of line 2
    let slope2 = 1 / ((pose3_coord2.y - pose2_coord2.y) / (pose3_coord2.x - pose2_coord2.x));

    //midpoints of the above two lines
    let midpoint_line1 = new Coord(
      (pose1_coord2.x + pose2_coord2.x) / 2,
      (pose1_coord2.y + pose2_coord2.y) / 2
    );
    let midpoint_line2 = new Coord(
      (pose3_coord2.x + pose2_coord2.x) / 2,
      (pose3_coord2.y + pose2_coord2.y) / 2
    );

    //intercept
    let c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
    let c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

    //intersection point
    let x1 = (c1 - c2) / (-slope2 + slope1);
    let y1 = -slope1 * x1 + c1;

    return new Coord(x1, y1);
  }
}
